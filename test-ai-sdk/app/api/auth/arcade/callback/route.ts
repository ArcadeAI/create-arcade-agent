import { NextResponse } from "next/server";
import { auth, oauthProvider } from "@/lib/arcade";

const gatewayUrl =
  process.env.ARCADE_GATEWAY_URL || "https://mcp.arcade.dev/sse";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.json(
      { error: "Missing authorization code" },
      { status: 400 }
    );
  }

  try {
    const result = await auth(oauthProvider, {
      serverUrl: gatewayUrl,
      authorizationCode: code,
    });

    if (result === "AUTHORIZED") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    return NextResponse.redirect(new URL("/dashboard?error=auth_incomplete", req.url));
  } catch (error) {
    console.error("Arcade OAuth callback error:", error);
    return NextResponse.redirect(new URL("/dashboard?error=auth_failed", req.url));
  }
}
