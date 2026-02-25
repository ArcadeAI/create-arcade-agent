import { createMCPClient } from "@ai-sdk/mcp";
import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientMetadata,
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "fs";
import { join } from "path";

// PRODUCTION NOTE: This template uses app-level token storage (single
// .arcade-auth/ directory shared by all users). For multi-user production
// deployments, store tokens per-user in the database. See README for details.

// --- CUSTOMIZATION POINT ---
// The MCP Gateway URL determines which tools are available.
// Create/modify your gateway at https://app.arcade.dev/mcp-gateways
// to add tools like Gmail, GitHub, Google Calendar, etc.

function getGatewayUrl(): string {
  const value = process.env.ARCADE_GATEWAY_URL?.trim();
  if (!value) {
    throw new Error(
      "ARCADE_GATEWAY_URL is missing. Create one at https://app.arcade.dev/mcp-gateways, add Slack, Google Calendar, Linear, GitHub, and Gmail, then set ARCADE_GATEWAY_URL in .env."
    );
  }
  return value;
}
function ensureScheme(url: string): string {
  const trimmed = url.replace(/\/+$/, "");
  return /^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`;
}
function getCallbackUrl(): string {
  const base = ensureScheme(
    process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 8765}`
  );
  return base + "/api/auth/arcade/callback";
}

// --- File-based persistence (.arcade-auth/, gitignored) ---

const AUTH_DIR = join(process.cwd(), ".arcade-auth");
const CLIENT_FILE = join(AUTH_DIR, "client.json");
const TOKENS_FILE = join(AUTH_DIR, "tokens.json");
const VERIFIER_FILE = join(AUTH_DIR, "verifier.txt");
const PENDING_AUTH_URL_FILE = join(AUTH_DIR, "pending-auth-url.txt");

function ensureDir() {
  if (!existsSync(AUTH_DIR)) mkdirSync(AUTH_DIR, { recursive: true });
}

function readJson<T>(path: string): T | undefined {
  try {
    if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    // ignore JSON parse errors
  }
  return undefined;
}

function writeJson(path: string, data: unknown) {
  ensureDir();
  writeFileSync(path, JSON.stringify(data, null, 2));
}

// --- Pending auth URL (consumed by the connect endpoint) ---

const PENDING_AUTH_TTL_MS = 5 * 60 * 1000; // 5 minutes

function setPendingAuthUrl(url: string) {
  ensureDir();
  writeFileSync(PENDING_AUTH_URL_FILE, JSON.stringify({ url, createdAt: Date.now() }), "utf-8");
}

export function getPendingAuthUrl(): string | null {
  if (!existsSync(PENDING_AUTH_URL_FILE)) return null;

  try {
    const raw = readFileSync(PENDING_AUTH_URL_FILE, "utf-8").trim();
    const data = JSON.parse(raw) as { url: string; createdAt: number };
    if (Date.now() - data.createdAt > PENDING_AUTH_TTL_MS) {
      clearPendingAuthUrl();
      return null;
    }
    return data.url;
  } catch {
    return null;
  }
}

export function clearPendingAuthUrl() {
  try {
    unlinkSync(PENDING_AUTH_URL_FILE);
  } catch {
    // Ignore cleanup errors; pending URL is best-effort state.
  }
}

// --- OAuth provider (implements OAuthClientProvider from MCP SDK) ---

class ArcadeOAuthProvider implements OAuthClientProvider {
  get redirectUrl() {
    return getCallbackUrl();
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [getCallbackUrl()],
      client_name: "Arcade Agent",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  clientInformation(): OAuthClientInformationFull | undefined {
    return readJson<OAuthClientInformationFull>(CLIENT_FILE);
  }

  saveClientInformation(info: OAuthClientInformationFull): void {
    writeJson(CLIENT_FILE, info);
  }

  tokens(): OAuthTokens | undefined {
    return readJson<OAuthTokens>(TOKENS_FILE);
  }

  saveTokens(tokens: OAuthTokens): void {
    writeJson(TOKENS_FILE, tokens);
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    setPendingAuthUrl(authorizationUrl.toString());
    console.log(`\n🔐 Arcade authorization required. Visit:\n${authorizationUrl.toString()}\n`);
  }

  // NOTE: PKCE verifier is stored in a single file (.arcade-auth/verifier.txt),
  // suitable for single-tenant use. In a multi-user deployment, associate
  // verifiers with user sessions. The connectPromise serialization in the
  // connect route prevents race conditions within a single process.
  saveCodeVerifier(verifier: string): void {
    ensureDir();
    writeFileSync(VERIFIER_FILE, verifier);
  }

  codeVerifier(): string {
    return readFileSync(VERIFIER_FILE, "utf-8");
  }
}

export const oauthProvider = new ArcadeOAuthProvider();

export { auth };

/**
 * Trigger the MCP OAuth flow (discovery, registration, PKCE).
 * Returns "REDIRECT" if the user needs to authorize, "AUTHORIZED" if tokens are already valid.
 */
export async function initiateOAuth(): Promise<"AUTHORIZED" | "REDIRECT"> {
  return auth(oauthProvider, { serverUrl: getGatewayUrl() });
}

/**
 * Create an MCP client for Arcade Gateway using stored OAuth tokens.
 * Auto-detects transport: SSE for /sse URLs, Streamable HTTP otherwise.
 */
export async function getArcadeMCPClient() {
  const gatewayUrl = getGatewayUrl();
  const tokens = oauthProvider.tokens();
  const headers = tokens?.access_token
    ? { Authorization: `Bearer ${tokens.access_token}` }
    : undefined;
  const transportType = gatewayUrl.endsWith("/sse") ? "sse" : "http";
  return createMCPClient({
    transport: { type: transportType, url: gatewayUrl, headers },
  });
}
