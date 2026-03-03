type ConfigWarning = {
  id: string;
  title: string;
  message: string;
  docsUrl: string;
};

export async function GET() {
  const warnings: ConfigWarning[] = [];

  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    warnings.push({
      id: "llm_key",
      title: "No LLM API key configured",
      message:
        "Set ANTHROPIC_API_KEY in .env to use Claude (get one at console.anthropic.com), " +
        "or set OPENAI_API_KEY to use GPT-4 (platform.openai.com). " +
        "The agent will fail when you try to run a plan.",
      docsUrl: "https://console.anthropic.com",
    });
  }

  if (!process.env.ARCADE_GATEWAY_URL?.trim()) {
    warnings.push({
      id: "gateway_url",
      title: "ARCADE_GATEWAY_URL is not set",
      message:
        "Create an MCP Gateway at app.arcade.dev/mcp-gateways — add tools for Slack, " +
        "Google Calendar, Linear, GitHub, and Gmail — then add ARCADE_GATEWAY_URL=<your-url> to .env.",
      docsUrl: "https://app.arcade.dev/mcp-gateways",
    });
  }

  return Response.json({ warnings });
}
