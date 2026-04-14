import { createAuthClient } from "better-auth/react";

/**
 * Better Auth client — use in React client components for sign-in, sign-up,
 * sign-out, and session state.
 *
 * Usage:
 *   import { authClient } from "@/lib/auth-client";
 *   const { data: session } = authClient.useSession();
 *   await authClient.signIn.email({ email, password });
 *   await authClient.signUp.email({ email, password, name: "" });
 *   await authClient.signOut();
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:8765",
});
