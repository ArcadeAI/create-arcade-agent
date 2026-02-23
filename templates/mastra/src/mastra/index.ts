import { Mastra } from "@mastra/core";
import { triageAgent } from "./agents";

// --- CUSTOMIZATION POINT ---
// Register additional agents here.
// Example: import { reviewAgent } from "./agents/review-agent";
// Then add it: agents: { "slack-triage": triageAgent, "pr-review": reviewAgent }
export const mastra = new Mastra({
  agents: { "slack-triage": triageAgent },
});
