import {
  oauthProvider,
  getArcadeMCPClient,
  getPendingAuthUrl,
  clearPendingAuthUrl,
  initiateOAuth,
} from "@/src/mastra/tools/arcade";
import { getSession } from "@/lib/auth";

// Serialize concurrent connect attempts to prevent PKCE verifier overwrites
let connectPromise: Promise<{
  data: Record<string, unknown>;
  status?: number;
}> | null = null;

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

  // Fast path: tokens already on disk.
  const existingTokens = oauthProvider.tokens();
  if (existingTokens?.access_token) {
    const connStatus = await verifyExistingConnection();
    if (connStatus === "ok") return Response.json({ connected: true });
    if (connStatus === "unreachable") {
      // Don't trigger a new OAuth redirect for transient connectivity failures —
      // that would force the user to re-authorize when the gateway is just briefly down.
      return Response.json(
        {
          connected: false,
          error: "Cannot reach Arcade Gateway. Check ARCADE_GATEWAY_URL and try again.",
        },
        { status: 502 }
      );
    }
    // "needs_reauth": tokens invalid/expired — fall through to OAuth
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
  let mcpClient: Awaited<ReturnType<typeof getArcadeMCPClient>> | null = null;
  try {
    // Trigger MCP OAuth flow (discovery, registration, PKCE)
    const result = await initiateOAuth();

    if (result === "REDIRECT") {
      const authUrl = getPendingAuthUrl();
      if (authUrl) {
        clearPendingAuthUrl();
        return { data: { connected: false, authUrl } };
      }
    }

    // AUTHORIZED — verify by listing tools
    mcpClient = await getArcadeMCPClient();
    const tools = await mcpClient.tools();
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
  } finally {
    if (mcpClient) {
      try {
        await mcpClient.close();
      } catch {
        // Ignore close errors from failed initialization attempts.
      }
    }
  }
}

async function verifyExistingConnection(): Promise<"ok" | "needs_reauth" | "unreachable"> {
  let mcpClient: Awaited<ReturnType<typeof getArcadeMCPClient>> | null = null;
  try {
    mcpClient = await getArcadeMCPClient();
    await mcpClient.tools();
    return "ok";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/401|403|unauthorized|forbidden/i.test(msg)) return "needs_reauth";
    return "unreachable";
  } finally {
    if (mcpClient) {
      try {
        await mcpClient.close();
      } catch {
        // Best effort cleanup.
      }
    }
  }
}
