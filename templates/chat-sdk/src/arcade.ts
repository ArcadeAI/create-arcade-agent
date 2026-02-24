import { createMCPClient } from "@ai-sdk/mcp";
import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientMetadata,
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "fs";
import { join } from "path";

// --- CUSTOMIZATION POINT ---
// The MCP Gateway URL determines which tools are available.
// Create/modify your gateway at https://app.arcade.dev/mcp-gateways
// to add tools like Gmail, GitHub, Google Calendar, etc.

const gatewayUrl =
  process.env.ARCADE_GATEWAY_URL || "https://mcp.arcade.dev/sse";

function ensureScheme(url: string): string {
  const trimmed = url.replace(/\/+$/, "");
  return /^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`;
}

function getCallbackUrl(): string {
  const base = ensureScheme(
    process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`
  );
  return base + "/api/auth/arcade/callback";
}

// --- File-based persistence (.arcade-auth/, gitignored) ---

const AUTH_DIR = join(process.cwd(), ".arcade-auth");
const CLIENT_FILE = join(AUTH_DIR, "client.json");
const TOKENS_FILE = join(AUTH_DIR, "tokens.json");
const VERIFIER_FILE = join(AUTH_DIR, "verifier.txt");

function ensureDir() {
  if (!existsSync(AUTH_DIR)) mkdirSync(AUTH_DIR, { recursive: true });
}

function readJson<T>(path: string): T | undefined {
  try {
    if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8"));
  } catch {}
  return undefined;
}

function writeJson(path: string, data: unknown) {
  ensureDir();
  writeFileSync(path, JSON.stringify(data, null, 2));
}

// --- Pending auth URL (captured during OAuth redirect) ---

let pendingAuthUrl: string | null = null;

export function getPendingAuthUrl(): string | null {
  return pendingAuthUrl;
}

export function clearPendingAuthUrl() {
  pendingAuthUrl = null;
}

// --- OAuth provider (implements OAuthClientProvider from MCP SDK) ---
// This bot authenticates as a single entity (not per-user).

class ArcadeOAuthProvider implements OAuthClientProvider {
  get redirectUrl() {
    return getCallbackUrl();
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [getCallbackUrl()],
      client_name: "Arcade Chat Bot",
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
    pendingAuthUrl = authorizationUrl.toString();
    console.log(
      `\n🔐 Arcade authorization required. Visit:\n${pendingAuthUrl}\n`
    );
  }

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
  return auth(oauthProvider, { serverUrl: gatewayUrl });
}

/**
 * Create an MCP client for Arcade Gateway using stored OAuth tokens.
 * Auto-detects transport: SSE for /sse URLs, Streamable HTTP otherwise.
 */
export async function getArcadeMCPClient() {
  const tokens = oauthProvider.tokens();
  const headers = tokens?.access_token
    ? { Authorization: `Bearer ${tokens.access_token}` }
    : undefined;
  const transportType = gatewayUrl.endsWith("/sse") ? "sse" : "http";
  return createMCPClient({
    transport: { type: transportType, url: gatewayUrl, headers },
  });
}
