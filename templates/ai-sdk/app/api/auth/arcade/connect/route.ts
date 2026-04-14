import {
  oauthProvider,
  getPendingAuthUrl,
  clearPendingAuthUrl,
  initiateOAuth,
} from "@/lib/arcade";
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

  // Fast path: tokens already on disk — trust them without a live verification
  // request. Making a live request here caused a race condition where freshly-
  // exchanged tokens could get a transient 401 from the gateway before it fully
  // processed them, forcing an unnecessary second sign-in. If a stored token is
  // actually expired the plan route surfaces an auth error and the user can
  // reconnect from the error state on the dashboard.
  const existingTokens = oauthProvider.tokens();
  if (existingTokens?.access_token) {
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
    // Trigger MCP OAuth flow (discovery, registration, PKCE)
    const result = await initiateOAuth();

    if (result === "REDIRECT") {
      const authUrl = getPendingAuthUrl();
      if (authUrl) {
        clearPendingAuthUrl();
        return { data: { connected: false, authUrl } };
      }
    }

    // AUTHORIZED
    return { data: { connected: true } };
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
