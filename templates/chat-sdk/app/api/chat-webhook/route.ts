import { after } from "next/server";
import { bot } from "@/src/bot";

// Chat SDK webhook handler — all platform events are routed through here.
// Point your Slack Event Subscription URL to: https://<your-domain>/api/chat-webhook
export async function POST(request: Request) {
  return bot.webhooks.slack(request, {
    waitUntil: (p) => after(() => p),
  });
}
