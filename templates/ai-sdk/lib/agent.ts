import { readFileSync } from "fs";
import { join } from "path";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";

// --- CUSTOMIZATION POINT ---
// The model is selected based on which API key you set in .env.
// Set ANTHROPIC_API_KEY to use Claude, or OPENAI_API_KEY to use GPT.
// If both are set, Anthropic takes priority.
export function getModel() {
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropic("claude-sonnet-4-20250514");
  }
  return openai("gpt-4o");
}

// --- CUSTOMIZATION POINT ---
// Edit system-prompt.md (in this directory) to change the agent's purpose.
export const systemPrompt = readFileSync(
  join(process.cwd(), "lib/system-prompt.md"),
  "utf-8"
);
