"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ArcadeStatus } from "@/types/dashboard";

function parseArcadeResponse(data: {
  connected?: boolean;
  authUrl?: string;
  error?: string;
}): ArcadeStatus {
  if (data.connected) return { state: "connected" };
  if (data.authUrl) return { state: "needs_auth", authUrl: data.authUrl };
  return {
    state: "error",
    message: data.error || "Could not connect to Arcade Gateway.",
  };
}

export function useArcadeConnection(): {
  arcadeStatus: ArcadeStatus;
  retryConnection: () => void;
} {
  const router = useRouter();
  const [arcadeStatus, setArcadeStatus] = useState<ArcadeStatus>({
    state: "checking",
  });
  const connectInFlight = useRef(false);
  const authInProgress = useRef(false);
  const lastCheckRef = useRef(0);

  const checkConnection = useCallback(
    async (opts?: { isRetry?: boolean }) => {
      if (connectInFlight.current) return;
      if (opts?.isRetry) {
        authInProgress.current = false;
        setArcadeStatus({ state: "checking" });
      } else if (authInProgress.current) {
        return;
      }
      lastCheckRef.current = Date.now();
      connectInFlight.current = true;
      try {
        const r = await fetch("/api/auth/arcade/connect", { method: "POST" });
        if (r.status === 401) {
          router.push("/");
          return;
        }
        const data = await r.json();
        const status = parseArcadeResponse(data);
        authInProgress.current = status.state === "needs_auth";
        setArcadeStatus(status);
      } catch {
        setArcadeStatus({
          state: "error",
          message: "Failed to check Arcade connection.",
        });
      } finally {
        connectInFlight.current = false;
      }
    },
    [router]
  );

  useEffect(() => {
    checkConnection();
    const onFocus = () => {
      if (Date.now() - lastCheckRef.current < 2000) return;
      authInProgress.current = false; // User returned from OAuth tab — re-check
      checkConnection();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [checkConnection]);

  const retryConnection = useCallback(() => checkConnection({ isRetry: true }), [checkConnection]);

  return { arcadeStatus, retryConnection };
}
