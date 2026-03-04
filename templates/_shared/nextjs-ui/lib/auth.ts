import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

export const auth = betterAuth({
  baseURL:
    process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${process.env.PORT ?? 8765}`,
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  trustedOrigins: [process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:8765"],
});

/**
 * Retrieve the current session user (server-side, reads from request cookies).
 *
 * Drop-in replacement for the previous bcrypt+session getSession() helper.
 * Returns the Better Auth user object, or null when not authenticated.
 */
export async function getSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}
