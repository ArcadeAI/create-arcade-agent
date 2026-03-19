export default function Home() {
  return (
    <main style={{ maxWidth: 600, margin: "80px auto", fontFamily: "system-ui" }}>
      <h1>Arcade Chat Bot</h1>
      <p>
        This bot is running and listening for events from your chat platform.
      </p>
      <h2>Setup</h2>
      <ol>
        <li>
          Point your Slack Event Subscription URL to:{" "}
          <code>{process.env.APP_URL || "http://localhost:3000"}/api/chat-webhook</code>
        </li>
        <li>
          @mention the bot in any Slack channel to start a conversation.
        </li>
      </ol>
      <h2>Status</h2>
      <p>Webhook endpoint: <code>/api/chat-webhook</code> — Active</p>
    </main>
  );
}
