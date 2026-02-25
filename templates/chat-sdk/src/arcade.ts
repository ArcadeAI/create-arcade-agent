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
import Redis from "ioredis";

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

// --- Redis client (used when REDIS_URL is set, e.g. on Vercel) ---

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  if (!process.env.REDIS_URL) return null;
  redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
  return redis;
}

// --- File-based persistence (local dev fallback) ---

const AUTH_DIR = join(process.cwd(), ".arcade-auth");
const CLIENT_FILE = join(AUTH_DIR, "client.json");
const TOKENS_FILE = join(AUTH_DIR, "tokens.json");
const VERIFIER_FILE = join(AUTH_DIR, "verifier.txt");

function ensureDir() {
  if (!existsSync(AUTH_DIR)) mkdirSync(AUTH_DIR, { recursive: true });
}

function readJsonFile<T>(path: string): T | undefined {
  try {
    if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8"));
  } catch {}
  return undefined;
}

function writeJsonFile(path: string, data: unknown) {
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

// --- OAuth provider ---
// Uses Redis when REDIS_URL is set (serverless), files otherwise (local dev).
// The MCP SDK's OAuthClientProvider interface is synchronous, so we use an
// in-memory cache that's hydrated from Redis before each auth attempt.

class ArcadeOAuthProvider implements OAuthClientProvider {
  private _clientInfo?: OAuthClientInformationFull;
  private _tokens?: OAuthTokens;
  private _verifier?: string;
  private _pendingWrites: Promise<unknown>[] = [];

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

  /** Pre-load cached values from Redis into memory (call before auth). */
  async hydrate(): Promise<void> {
    const r = getRedis();
    if (!r) return;
    const [clientStr, tokensStr, verifier] = await Promise.all([
      r.get("arcade:client"),
      r.get("arcade:tokens"),
      r.get("arcade:verifier"),
    ]);
    if (clientStr) this._clientInfo = JSON.parse(clientStr);
    if (tokensStr) this._tokens = JSON.parse(tokensStr);
    if (verifier) this._verifier = verifier;
  }

  /** Wait for all pending Redis writes to complete. */
  async flush(): Promise<void> {
    await Promise.all(this._pendingWrites);
    this._pendingWrites = [];
  }

  clientInformation(): OAuthClientInformationFull | undefined {
    if (this._clientInfo) return this._clientInfo;
    if (!getRedis()) return readJsonFile<OAuthClientInformationFull>(CLIENT_FILE);
    return undefined;
  }

  saveClientInformation(info: OAuthClientInformationFull): void {
    this._clientInfo = info;
    const r = getRedis();
    if (r) {
      this._pendingWrites.push(r.set("arcade:client", JSON.stringify(info)));
    } else {
      writeJsonFile(CLIENT_FILE, info);
    }
  }

  tokens(): OAuthTokens | undefined {
    if (this._tokens) return this._tokens;
    if (!getRedis()) return readJsonFile<OAuthTokens>(TOKENS_FILE);
    return undefined;
  }

  saveTokens(tokens: OAuthTokens): void {
    this._tokens = tokens;
    const r = getRedis();
    if (r) {
      this._pendingWrites.push(r.set("arcade:tokens", JSON.stringify(tokens)));
    } else {
      writeJsonFile(TOKENS_FILE, tokens);
    }
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    pendingAuthUrl = authorizationUrl.toString();
    console.log(
      `\n🔐 Arcade authorization required. Visit:\n${pendingAuthUrl}\n`
    );
  }

  saveCodeVerifier(verifier: string): void {
    this._verifier = verifier;
    const r = getRedis();
    if (r) {
      // 5 minute TTL — verifier is only needed until the callback arrives
      this._pendingWrites.push(r.set("arcade:verifier", verifier, "EX", 300));
    } else {
      ensureDir();
      writeFileSync(VERIFIER_FILE, verifier);
    }
  }

  codeVerifier(): string {
    if (this._verifier) return this._verifier;
    if (!getRedis()) return readFileSync(VERIFIER_FILE, "utf-8");
    return "";
  }
}

export const oauthProvider = new ArcadeOAuthProvider();
export { auth };

/**
 * Trigger the MCP OAuth flow (discovery, registration, PKCE).
 * Returns "REDIRECT" if the user needs to authorize, "AUTHORIZED" if tokens are already valid.
 */
export async function initiateOAuth(): Promise<"AUTHORIZED" | "REDIRECT"> {
  await oauthProvider.hydrate();
  const result = await auth(oauthProvider, { serverUrl: gatewayUrl });
  await oauthProvider.flush();
  return result;
}

/**
 * Create an MCP client for Arcade Gateway using stored OAuth tokens.
 * Auto-detects transport: SSE for /sse URLs, Streamable HTTP otherwise.
 */
export async function getArcadeMCPClient() {
  await oauthProvider.hydrate();
  const token = oauthProvider.tokens()?.access_token;
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const transportType = gatewayUrl.endsWith("/sse") ? "sse" : "http";
  return createMCPClient({
    transport: { type: transportType, url: gatewayUrl, headers },
  });
}
