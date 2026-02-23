import { convertToModelMessages, streamText, stepCountIs, UIMessage } from "ai";
import { getSession } from "@/lib/auth";
import { getModel, systemPrompt } from "@/lib/agent";
import { getArcadeMCPClient, getPendingAuthUrl } from "@/lib/arcade";

export const maxDuration = 60;

export async function POST(req: Request) {
  const user = await getSession();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { messages }: { messages: UIMessage[] } = await req.json();

  let mcpClient: Awaited<ReturnType<typeof getArcadeMCPClient>> | undefined;
  try {
    mcpClient = await getArcadeMCPClient();
    const tools = await mcpClient.tools();

    const result = streamText({
      model: getModel(),
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(5),
      onFinish: async () => {
        await mcpClient?.close();
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error: unknown) {
    await mcpClient?.close();

    console.error("Chat route error:", error);

    // Check if this was an Arcade auth issue
    const authUrl = getPendingAuthUrl();
    if (authUrl) {
      return Response.json(
        { error: "arcade_auth_required", authUrl },
        { status: 401 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Something went wrong";
    return Response.json({ error: message }, { status: 500 });
  }
}
