import { handleChatStream } from "@mastra/ai-sdk";
import { createUIMessageStreamResponse } from "ai";
import { mastra } from "@/src/mastra";
import { getSession } from "@/lib/auth";
import { getPendingAuthUrl } from "@/src/mastra/tools/arcade";

export async function POST(req: Request) {
  const user = await getSession();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = await req.json();

  try {
    const stream = await handleChatStream({
      mastra,
      agentId: "slack-triage",
      params,
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error: unknown) {
    const isMcpConnectionError =
      error instanceof Error &&
      (error.message.includes("MCP") || error.message.includes("connect"));

    // Check if this was an Arcade auth issue
    const authUrl = getPendingAuthUrl();
    if (authUrl) {
      return Response.json({ error: "arcade_auth_required", authUrl }, { status: 401 });
    }

    // MCP connection errors
    if (isMcpConnectionError) {
      return Response.json(
        {
          error:
            "Could not connect to Arcade Gateway. Make sure ARCADE_GATEWAY_URL is set and you've authenticated with Arcade.",
        },
        { status: 502 }
      );
    }

    return Response.json(
      { error: "Failed to process chat request. Please try again." },
      { status: 500 }
    );
  }
}
