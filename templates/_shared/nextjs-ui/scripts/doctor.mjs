import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_PATH = resolve(process.cwd(), ".env");
const REQUIRED_TOOLKITS = ["Slack", "Google Calendar", "Linear", "GitHub", "Gmail"];

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    out[key] = value;
  }
  return out;
}

async function checkGatewayReachability(url) {
  try {
    const res = await fetch(url, { method: "GET" });
    // 200/401/403 all indicate the endpoint is reachable.
    return [200, 401, 403].includes(res.status);
  } catch {
    return false;
  }
}

async function main() {
  const env = parseEnvFile(ENV_PATH);
  const gatewayUrl = env.ARCADE_GATEWAY_URL || process.env.ARCADE_GATEWAY_URL || "";
  const openAi = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY || "";
  const anthropic = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";

  const errors = [];

  if (!existsSync(ENV_PATH)) {
    errors.push("Missing .env file. Run: cp .env.example .env");
  }

  if (!gatewayUrl) {
    errors.push(
      "Missing ARCADE_GATEWAY_URL. Create a gateway at https://app.arcade.dev/mcp-gateways and set it in .env"
    );
  }

  if (!openAi && !anthropic) {
    errors.push("Missing LLM key. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in .env");
  }

  if (errors.length === 0 && gatewayUrl) {
    const reachable = await checkGatewayReachability(gatewayUrl);
    if (!reachable) {
      errors.push(`Gateway not reachable at ${gatewayUrl}`);
    }
  }

  if (errors.length > 0) {
    console.error("\nDoctor found setup issues:\n");
    for (const err of errors) console.error(`- ${err}`);
    console.error("\nRecommended toolkits in your Arcade gateway:");
    for (const toolkit of REQUIRED_TOOLKITS) console.error(`- ${toolkit}`);
    process.exit(1);
  }

  console.log("Doctor check passed.");
  console.log("Recommended toolkits in your Arcade gateway:");
  for (const toolkit of REQUIRED_TOOLKITS) console.log(`- ${toolkit}`);
}

main().catch((err) => {
  console.error("Doctor failed:", err);
  process.exit(1);
});
