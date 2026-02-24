import { Agent } from "@mastra/core/agent";
import { readFileSync } from "fs";
import { join } from "path";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { mcpClient } from "../tools/arcade";

// --- CUSTOMIZATION POINT ---
// The model is selected based on which API key you set in .env.
// Set ANTHROPIC_API_KEY to use Claude, or OPENAI_API_KEY to use GPT.
// If both are set, Anthropic takes priority.
export function getModel() {
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropic("claude-sonnet-4-20250514");
  }
  return openai("gpt-4.1");
}

// --- CUSTOMIZATION POINT ---
// Edit system-prompt.md (in this directory) to change the agent's purpose.
// For example, you could make a GitHub PR review agent, a calendar
// scheduling assistant, or a Gmail drafting bot — just update the
// system prompt and configure matching tools in your Arcade Gateway.
const instructions = readFileSync(
  join(process.cwd(), "src/mastra/agents/system-prompt.md"),
  "utf-8"
);

export const systemPrompt = instructions;

export const triageAgent = new Agent({
  id: "slack-triage",
  name: "Slack Triage Agent",
  instructions,
  model: getModel(),
  tools: async () => mcpClient.listTools(),
});
