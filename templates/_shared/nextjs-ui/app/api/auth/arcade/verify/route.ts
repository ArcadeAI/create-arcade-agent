/**
 * Custom User Verifier — COAT Attack Protection
 *
 * WHAT: This endpoint confirms that the person completing an Arcade tool
 * authorization (e.g. granting Slack access) is the same user who initiated it
 * from your app.
 *
 * WHY: Without this, the OAuth authorization link is a bearer token — anyone
 * who has it can complete the flow. An attacker could start a tool auth,
 * send the link to a victim, and if the victim clicks it, the attacker gains
 * access to the victim's account. This is called a COAT attack (Cross-app
 * OAuth Account Takeover). See: https://www.arcade.dev/blog/arcade-proactively-addressed-coat-vulnerability-in-agentic-ai
 *
 * HOW IT WORKS:
 *   1. User triggers a tool that needs authorization (e.g. Slack)
 *   2. Arcade redirects the user's browser here with a `flow_id` query param
 *   3. This endpoint checks the user's app session (they must be logged in)
 *   4. Calls Arcade's confirm_user API with the flow_id + the user's identity
 *   5. Arcade verifies the match and redirects the user back
 *
 * SETUP:
 *   1. Set ARCADE_CUSTOM_VERIFIER=true and ARCADE_API_KEY in your .env
 *   2. In the Arcade dashboard (app.arcade.dev/mcp-gateways), under
 *      Auth > Settings, set the custom verifier URL to:
 *        {your-app-url}/api/auth/arcade/verify
 *   3. Register custom OAuth apps for each auth provider (Slack, GitHub, etc.)
 *      in the Arcade dashboard. Arcade's default shared OAuth apps cannot be
 *      used when a custom verifier is enabled.
 *   4. For local dev, use ngrok to expose your server (`ngrok http 8765`) and
 *      set the ngrok URL as the verifier URL in the Arcade dashboard.
 *      IMPORTANT: You must also access your app via the ngrok URL (not localhost).
 *      Session cookies are scoped to the host that set them — if you log in through
 *      localhost, the ngrok-fronted verify request won't carry the cookie, causing
 *      a silent redirect loop. Login at https://<your-ngrok>.ngrok-free.app instead.
 *   5. Full guide: https://docs.arcade.dev/en/guides/user-facing-agents/secure-auth-production
 *
 * This endpoint is disabled by default. It returns 404 unless
 * ARCADE_CUSTOM_VERIFIER=true is set in your environment.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

const ARCADE_API_URL = "https://cloud.arcade.dev/api/v1/oauth/confirm_user";

/** Redirect using NEXT_PUBLIC_APP_URL when set (for ngrok/proxies), otherwise req.url. */
function appRedirect(reqUrl: string, path: string): NextResponse {
  const base = process.env.NEXT_PUBLIC_APP_URL
    ? process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")
    : new URL(reqUrl).origin;
  return NextResponse.redirect(`${base}${path}`);
}

export async function GET(req: Request) {
  // Feature gate: only active when explicitly enabled
  if (process.env.ARCADE_CUSTOM_VERIFIER !== "true") {
    return NextResponse.json(
      {
        error:
          "Custom user verification is not enabled. Set ARCADE_CUSTOM_VERIFIER=true in your .env to activate it.",
      },
      { status: 404 }
    );
  }

  const apiKey = process.env.ARCADE_API_KEY;
  if (!apiKey) {
    console.error("ARCADE_CUSTOM_VERIFIER is enabled but ARCADE_API_KEY is not set.");
    return appRedirect(req.url, "/dashboard?error=verify_misconfigured");
  }

  const url = new URL(req.url);
  const flowId = url.searchParams.get("flow_id");

  if (!flowId) {
    return NextResponse.json({ error: "Missing flow_id parameter" }, { status: 400 });
  }

  // Verify the user is logged into this app.
  // NOTE: In local dev, you must access the app via NEXT_PUBLIC_APP_URL (the ngrok URL),
  // NOT localhost. The session cookie is scoped to the host that set it — if you log in
  // through localhost, your ngrok-proxied verify request won't carry the cookie.
  const user = await getSession();
  if (!user) {
    console.warn(
      "[verify] No session found. If you're using ngrok, make sure you logged in through " +
        "the ngrok URL (not localhost) so the session cookie is scoped to the same host."
    );
    return appRedirect(req.url, "/dashboard?error=verify_session_required");
  }

  const requestBody = { flow_id: flowId, user_id: user.email };

  try {
    const response = await fetch(ARCADE_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(
        "Arcade confirm_user failed:",
        response.status,
        body,
        "\n  flow_id:",
        flowId,
        "\n  user_id:",
        user.email,
        "\n  endpoint:",
        ARCADE_API_URL
      );
      return appRedirect(req.url, "/dashboard?error=verify_failed");
    }

    const data = await response.json();

    // Redirect to Arcade's next_uri if provided and same-origin, otherwise dashboard
    const base = process.env.NEXT_PUBLIC_APP_URL
      ? process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")
      : new URL(req.url).origin;
    let redirectTo = `${base}/dashboard`;
    if (data.next_uri) {
      try {
        const nextUrl = new URL(data.next_uri, base);
        if (nextUrl.origin === new URL(base).origin) {
          redirectTo = nextUrl.toString();
        }
      } catch {
        // Invalid URL — fall through to dashboard
      }
    }
    return NextResponse.redirect(redirectTo);
  } catch (error) {
    console.error("Arcade verify error:", error);
    return appRedirect(req.url, "/dashboard?error=verify_failed");
  }
}
