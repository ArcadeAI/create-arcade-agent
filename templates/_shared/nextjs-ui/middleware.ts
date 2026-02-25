import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function getExpectedHost(): string | null {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!appUrl) return null;

  try {
    const parsed = new URL(appUrl);
    return parsed.host;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const expectedHost = getExpectedHost();
  if (!expectedHost) return NextResponse.next();

  const requestHost = request.headers.get("host");
  if (!requestHost || requestHost === expectedHost) {
    return NextResponse.next();
  }

  const target = new URL(request.url);
  target.host = expectedHost;
  target.protocol = expectedHost.startsWith("localhost:") ? "http:" : target.protocol;
  return NextResponse.redirect(target);
}

export const config = {
  // Skip static and API routes where host canonicalization isn't needed.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
