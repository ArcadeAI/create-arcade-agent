import {
  oauthProvider,
  mcpClient,
  getPendingAuthUrl,
  clearPendingAuthUrl,
} from "@/src/mastra/tools/arcade";
import { getSession } from "@/lib/auth";

// Serialize concurrent connect attempts to prevent PKCE verifier overwrites
let connectPromise: Promise<{ data: Record<string, unknown>; status?: number }> | null = null;

export async function POST() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ARCADE_GATEWAY_URL?.trim()) {
    return Response.json(
      {
        connected: false,
        error:
          "ARCADE_GATEWAY_URL is missing. Create one at https://app.arcade.dev/mcp-gateways, add only the minimum required tools from Slack, Google Calendar, Linear, GitHub, and Gmail, then set ARCADE_GATEWAY_URL in .env.",
      },
      { status: 400 }
    );
  }

  // Fast path: if tokens exist and still work, we're connected.
  const existingTokens = oauthProvider.tokens();
  if (existingTokens?.access_token && (await verifyExistingConnection())) {
    return Response.json({ connected: true });
  }

  if (!connectPromise) {
    connectPromise = doConnect().finally(() => {
      connectPromise = null;
    });
  }

  const result = await connectPromise;
  return Response.json(result.data, result.status ? { status: result.status } : undefined);
}

async function doConnect(): Promise<{
  data: Record<string, unknown>;
  status?: number;
}> {
  try {
    const tools = await mcpClient.listTools();
    return {
      data: { connected: true, toolCount: Object.keys(tools).length },
    };
  } catch {
    const authUrl = getPendingAuthUrl();
    if (authUrl) {
      clearPendingAuthUrl();
      return { data: { connected: false, authUrl } };
    }

    return {
      data: {
        connected: false,
        error:
          "Could not connect to Arcade Gateway. Check that ARCADE_GATEWAY_URL is set correctly in your .env file.",
      },
      status: 502,
    };
  }
}

async function verifyExistingConnection(): Promise<boolean> {
  try {
    await mcpClient.listTools();
    return true;
  } catch {
    return false;
  }
}
