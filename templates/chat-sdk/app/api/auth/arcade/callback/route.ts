import { NextResponse } from "next/server";
import { auth, oauthProvider } from "@/src/arcade";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const authorizationCode = url.searchParams.get("code");

  if (!authorizationCode) {
    return NextResponse.json(
      { error: "Missing authorization code" },
      { status: 400 }
    );
  }

  try {
    const result = await auth(oauthProvider, {
      serverUrl: process.env.ARCADE_GATEWAY_URL || "https://mcp.arcade.dev/sse",
      authorizationCode,
    });

    if (result !== "AUTHORIZED") {
      return NextResponse.json(
        { error: "Authorization incomplete", result },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, message: "Arcade connected!" });
  } catch (error) {
    console.error("Arcade OAuth callback error:", error);
    return NextResponse.json(
      { error: "Authorization failed" },
      { status: 500 }
    );
  }
}
