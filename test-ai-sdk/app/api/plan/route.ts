/**
 * Plan API Route — Multi-Source Triage Agent
 *
 * POST /api/plan
 *
 * Triggers the triage agent to scan all connected sources (Slack, Calendar,
 * Linear, GitHub, Gmail, etc.), classify each item, and stream back
 * structured InboxItem data as NDJSON.
 */

import { streamText, stepCountIs } from "ai";
import { getSession } from "@/lib/auth";
import { getModel, systemPrompt } from "@/lib/agent";
import { getArcadeMCPClient } from "@/lib/arcade";
import type { InboxItem } from "@/types/inbox";

export const maxDuration = 60;

// --- Types ---

type PlanEvent =
  | { type: "status"; message: string }
  | { type: "task"; data: InboxItem }
  | { type: "summary"; data: { total: number; bySource: Record<string, number> } }
  | { type: "auth_required"; authUrl: string; toolName?: string }
  | { type: "error"; message: string }
  | { type: "done" };

function encodeEvent(event: PlanEvent): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(event) + "\n");
}

function mapToolToSource(toolName?: string): string {
  if (!toolName) return "other";
  if (/^Slack_/i.test(toolName)) return "slack";
  if (/^(Google|Calendar)/i.test(toolName)) return "google_calendar";
  if (/^Linear_/i.test(toolName)) return "linear";
  if (/^GitHub_/i.test(toolName)) return "github";
  if (/^Gmail_/i.test(toolName)) return "gmail";
  return "other";
}

function extractAuthUrlFromToolOutput(output: unknown): string | null {
  const looksLikeAuthUrl = (value: unknown): value is string =>
    typeof value === "string" &&
    /oauth|authorize/i.test(value);

  const fromRecord = (value: unknown): string | null => {
    if (!value || typeof value !== "object") return null;
    const obj = value as Record<string, unknown>;
    const direct =
      (typeof obj.authorization_url === "string" && obj.authorization_url) ||
      (looksLikeAuthUrl(obj.url) ? obj.url : null);
    if (direct) return direct;

    if (obj.structuredContent && typeof obj.structuredContent === "object") {
      const nested = obj.structuredContent as Record<string, unknown>;
      const nestedUrl =
        (typeof nested.authorization_url === "string" &&
          nested.authorization_url) ||
        (looksLikeAuthUrl(nested.url) ? nested.url : null);
      if (nestedUrl) return nestedUrl;
    }
    return null;
  };

  const fromObject = fromRecord(output);
  if (fromObject) return fromObject;

  const raw =
    typeof output === "string" ? output : JSON.stringify(output ?? "");
  const match = raw.match(
    /https:\/\/[^\s"'\]}>]+\/oauth\/[^\s"'\]}>]+|https:\/\/[^\s"'\]}>]+authorize[^\s"'\]}>]*/i
  );
  return match ? match[0] : null;
}

// --- System prompt for plan mode ---

const PLAN_SYSTEM_PROMPT = `You are a daily planning and triage agent. You have access to tools that connect to the user's services (e.g. Slack, Google Calendar, Linear, GitHub, Gmail). Your job is to scan all available sources, read recent items, and classify each one.

WORKFLOW:
1. First, explore what tools are available to you. Look for tools related to messaging, calendars, task trackers, email, and code repositories.
2. For each available service, use the appropriate tools to fetch recent items:
   - Slack: List conversations, then read recent messages from DMs and group DMs
   - Google Calendar: List upcoming events for today and tomorrow
   - Linear: List assigned issues and recent updates
   - GitHub: List notifications, assigned PRs, and review requests
   - Gmail: List recent unread emails
3. Classify each item and output a structured JSON block.
4. After processing all sources, output a summary.

CLASSIFICATION:
- category: NEEDS_REPLY | NEEDS_FEEDBACK | NEEDS_DECISION | NEEDS_REVIEW | ATTEND | FYI | IGNORE
- priority: P0 (urgent) | P1 (important) | P2 (can wait) | FYI
- effort: XS (<5min) | S (5-15min) | M (15-30min) | L (>30min)
- confidence: 0.0 to 1.0

SOURCE MAPPING:
- Tools starting with "Slack_" → source: "slack"
- Tools starting with "Google" or "Calendar" → source: "google_calendar"
- Tools starting with "Linear_" → source: "linear"
- Tools starting with "GitHub_" → source: "github"
- Tools starting with "Gmail_" → source: "gmail"
- Anything else → source: "other"

OUTPUT: For EACH item, output EXACTLY this on its own line:

\`\`\`json:task
{
  "id": "<unique-id>",
  "source": "slack",
  "sourceDetail": "DM with Alice",
  "summary": "<1-2 sentences>",
  "category": "NEEDS_REPLY",
  "priority": "P1",
  "effort": "S",
  "why": "<brief explanation>",
  "suggestedNextStep": "<what to do>",
  "confidence": 0.85,
  "participants": [{"id": "<uid>", "name": "<name>"}],
  "url": "<deep link to the item if available>",
  "scheduledTime": "<ISO time if this is a calendar event, otherwise omit>"
}
\`\`\`

After all items from all sources, output:
\`\`\`json:summary
{"total": <total items>, "bySource": {"slack": 5, "google_calendar": 3, "linear": 2}}
\`\`\`

Rules:
- One json:task block per item, even for IGNORE/FYI
- Brief status text between blocks is fine
- Process ALL available sources before the summary
- If a tool requires authorization, note it and move on to other sources
- If errors occur reading a source, skip it and note the error
- Use ATTEND category for calendar events you need to join
- Use NEEDS_REVIEW for code reviews (PRs, etc.)

${systemPrompt}`;

// --- Parse structured JSON blocks from streamed text ---

function extractJsonBlocks(text: string): {
  tasks: InboxItem[];
  summary: { total: number; bySource: Record<string, number> } | null;
  remaining: string;
} {
  const tasks: InboxItem[] = [];
  let summary: { total: number; bySource: Record<string, number> } | null = null;
  let lastConsumedIndex = 0;

  const taskPattern = /```json:task\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = taskPattern.exec(text)) !== null) {
    try {
      tasks.push(JSON.parse(match[1].trim()) as InboxItem);
      lastConsumedIndex = match.index + match[0].length;
    } catch {
      // Incomplete JSON
    }
  }

  const summaryPattern = /```json:summary\s*\n([\s\S]*?)```/g;
  while ((match = summaryPattern.exec(text)) !== null) {
    try {
      const raw = JSON.parse(match[1].trim());
      // Normalize: handle both old { tasks, conversations } and new { total, bySource } shapes
      if (raw.total !== undefined && raw.bySource !== undefined) {
        summary = raw;
      } else if (raw.tasks !== undefined) {
        summary = { total: raw.tasks, bySource: {} };
      } else {
        summary = { total: 0, bySource: {} };
      }
      const endIdx = match.index + match[0].length;
      if (endIdx > lastConsumedIndex) lastConsumedIndex = endIdx;
    } catch {
      // Incomplete JSON
    }
  }

  return {
    tasks,
    summary,
    remaining: lastConsumedIndex > 0 ? text.slice(lastConsumedIndex) : text,
  };
}

// --- Route handler ---

export async function POST() {
  const user = await getSession();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let mcpClient: Awaited<ReturnType<typeof getArcadeMCPClient>> | null = null;
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
    },
  });

  function emit(event: PlanEvent) {
    try {
      streamController?.enqueue(encodeEvent(event));
    } catch {
      // Stream closed by client
    }
  }

  // Process async — return stream immediately
  (async () => {
    try {
      emit({ type: "status", message: "Connecting to Arcade Gateway..." });

      mcpClient = await getArcadeMCPClient();
      const tools = await mcpClient.tools();
      const toolNames = Object.keys(tools);
      const sources = [...new Set(toolNames.map((n) => mapToolToSource(n)))];
      console.log(`[plan] ${toolNames.length} tools from sources: ${sources.join(", ")}`);

      emit({
        type: "status",
        message: `Found ${toolNames.length} tools across ${sources.length} sources. Starting triage...`,
      });

      let accumulatedText = "";
      let emittedTaskCount = 0;
      let emittedSummary = false;

      const result = streamText({
        model: getModel(),
        messages: [
          {
            role: "user",
            content:
              "Plan my day. Check all available sources — scan my messages, calendar, tasks, PRs, and email. Triage everything.",
          },
        ],
        tools,
        stopWhen: stepCountIs(20),
        system: PLAN_SYSTEM_PROMPT,
        onStepFinish: ({ toolCalls, toolResults }) => {
          console.log(
            `[plan] Step: ${toolCalls.length} calls, ${toolResults.length} results`
          );

          for (const call of toolCalls) {
            const source = mapToolToSource(call.toolName);
            emit({
              type: "status",
              message: `Calling ${source}: ${call.toolName}...`,
            });
          }

          const toolNameByCallId = new Map(
            toolCalls.map((call) => [call.toolCallId, call.toolName] as const)
          );

          for (let i = 0; i < toolResults.length; i++) {
            const result = toolResults[i];
            const authUrl = extractAuthUrlFromToolOutput(result.output);
            if (authUrl) {
              const resultCallId = (result as { toolCallId?: string }).toolCallId;
              const matchedToolName = resultCallId
                ? toolNameByCallId.get(resultCallId)
                : undefined;
              const fallbackToolName = i < toolCalls.length
                ? toolCalls[i].toolName
                : undefined;
              const toolName = mapToolToSource(matchedToolName ?? fallbackToolName);
              emit({ type: "auth_required", authUrl, toolName });
            }
          }
        },
      });

      const reader = result.textStream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (value) {
          accumulatedText += value;
          const { tasks, summary, remaining } =
            extractJsonBlocks(accumulatedText);
          accumulatedText = remaining;

          for (const task of tasks) {
            emittedTaskCount++;
            emit({ type: "task", data: task });
            emit({
              type: "status",
              message: `Classified ${emittedTaskCount} item${emittedTaskCount > 1 ? "s" : ""}...`,
            });
          }
          if (summary) {
            emit({ type: "summary", data: summary });
            emittedSummary = true;
          }
        }
      }

      // Final pass on remaining buffer
      if (accumulatedText.length > 0) {
        const { tasks, summary } = extractJsonBlocks(accumulatedText);
        for (const task of tasks) {
          emittedTaskCount++;
          emit({ type: "task", data: task });
        }
        if (summary) {
          emit({ type: "summary", data: summary });
          emittedSummary = true;
        }
      }

      if (!emittedSummary && emittedTaskCount > 0) {
        emit({
          type: "summary",
          data: { total: emittedTaskCount, bySource: {} },
        });
      }

      emit({ type: "done" });
    } catch (error) {
      console.error("[plan] Error:", error);
      emit({
        type: "error",
        message:
          error instanceof Error ? error.message : "Unknown error",
      });
      emit({ type: "done" });
    } finally {
      if (mcpClient) {
        try {
          await mcpClient.close();
        } catch {
          /* ignore */
        }
      }
      try {
        streamController?.close();
      } catch {
        /* ignore */
      }
    }
  })();

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
