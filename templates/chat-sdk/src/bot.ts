import { Chat } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createMemoryState } from "@chat-adapter/state-memory";
import { createRedisState } from "@chat-adapter/state-redis";
import { streamText, generateText, stepCountIs } from "ai";
import { getModel, systemPrompt } from "./agent";
import { getArcadeMCPClient, initiateOAuth, getPendingAuthUrl, clearPendingAuthUrl } from "./arcade";

// Ensure Arcade OAuth is completed before handling messages.
// Returns the auth URL if authorization is needed so we can post it in chat.
async function ensureArcadeAuth(): Promise<string | null> {
  const result = await initiateOAuth();
  if (result === "REDIRECT") {
    const url = getPendingAuthUrl();
    clearPendingAuthUrl();
    return url;
  }
  return null;
}

// --- CUSTOMIZATION POINT ---
// Add more adapters here to deploy to additional platforms.
// See https://chat-sdk.dev/docs for Discord, Teams, Google Chat, GitHub, Linear.
//
// Example — add Discord:
//   import { createDiscordAdapter } from "@chat-adapter/discord";
//   adapters: {
//     slack: createSlackAdapter({ ... }),
//     discord: createDiscordAdapter({ publicKey: process.env.DISCORD_PUBLIC_KEY! }),
//   }

const adapters = {
  slack: createSlackAdapter({
    botToken: process.env.SLACK_BOT_TOKEN!,
    signingSecret: process.env.SLACK_SIGNING_SECRET!,
  }),
};

export const bot = new Chat({
  userName: "arcade-bot",
  adapters,
  // Redis for production/serverless; in-memory for local dev
  state: process.env.REDIS_URL
    ? createRedisState({ url: process.env.REDIS_URL })
    : createMemoryState(),
});

// --- Event Handlers ---

// When someone @mentions the bot, start an AI conversation with Arcade tools.
bot.onNewMention(async (thread, message) => {
  await thread.subscribe();

  let mcpClient: Awaited<ReturnType<typeof getArcadeMCPClient>> | undefined;
  try {
    const authUrl = await ensureArcadeAuth();
    if (authUrl) {
      await thread.post(
        `I need to connect to Arcade first. Please authorize here:\n${authUrl}\n\nThen @mention me again.`
      );
      return;
    }

    mcpClient = await getArcadeMCPClient();
    const tools = await mcpClient.tools();

    const result = streamText({
      model: getModel(),
      system: systemPrompt,
      messages: [{ role: "user", content: message.text }],
      tools,
      stopWhen: stepCountIs(5),
    });

    // Chat SDK's thread.post() accepts AsyncIterable<string> for streaming
    await thread.post(result.textStream);
  } catch (error) {
    console.error("Bot mention error:", error);
    await thread.post(
      "Sorry, I ran into an error processing your request. Check the server logs for details."
    );
  } finally {
    await mcpClient?.close();
  }
});

// Handle follow-up messages in threads the bot is subscribed to.
bot.onSubscribedMessage(async (thread, message) => {
  let mcpClient: Awaited<ReturnType<typeof getArcadeMCPClient>> | undefined;
  try {
    const authUrl = await ensureArcadeAuth();
    if (authUrl) {
      await thread.post(
        `I need to reconnect to Arcade. Please authorize here:\n${authUrl}`
      );
      return;
    }

    mcpClient = await getArcadeMCPClient();
    const tools = await mcpClient.tools();

    const result = await generateText({
      model: getModel(),
      system: systemPrompt,
      messages: [{ role: "user", content: message.text }],
      tools,
      stopWhen: stepCountIs(5),
    });

    await thread.post(result.text);
  } catch (error) {
    console.error("Bot thread error:", error);
    await thread.post("Sorry, something went wrong.");
  } finally {
    await mcpClient?.close();
  }
});
