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
 *   3. Full guide: https://docs.arcade.dev/en/guides/user-facing-agents/secure-auth-production
 *
 * This endpoint is disabled by default. It returns 404 unless
 * ARCADE_CUSTOM_VERIFIER=true is set in your environment.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

const ARCADE_API_URL = "https://cloud.arcade.dev/api/v1/oauth/confirm_user";

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
    console.error(
      "ARCADE_CUSTOM_VERIFIER is enabled but ARCADE_API_KEY is not set."
    );
    return NextResponse.redirect(
      new URL("/dashboard?error=verify_misconfigured", req.url)
    );
  }

  const url = new URL(req.url);
  const flowId = url.searchParams.get("flow_id");

  if (!flowId) {
    return NextResponse.json(
      { error: "Missing flow_id parameter" },
      { status: 400 }
    );
  }

  // Verify the user is logged into this app
  const user = await getSession();
  if (!user) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  try {
    const response = await fetch(ARCADE_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        flow_id: flowId,
        user_id: user.email,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("Arcade confirm_user failed:", response.status, body);
      return NextResponse.redirect(
        new URL("/dashboard?error=verify_failed", req.url)
      );
    }

    const data = await response.json();

    // Redirect to Arcade's next_uri if provided, otherwise back to chat
    const redirectTo = data.next_uri || new URL("/dashboard", req.url).toString();
    return NextResponse.redirect(redirectTo);
  } catch (error) {
    console.error("Arcade verify error:", error);
    return NextResponse.redirect(
      new URL("/dashboard?error=verify_failed", req.url)
    );
  }
}
