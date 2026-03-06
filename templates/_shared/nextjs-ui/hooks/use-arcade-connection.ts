"use client";

import { useEffect, useRef, useState } from "react";
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

export function useArcadeConnection(router: ReturnType<typeof useRouter>): {
  arcadeStatus: ArcadeStatus;
  retryConnection: () => void;
} {
  const [arcadeStatus, setArcadeStatus] = useState<ArcadeStatus>({
    state: "checking",
  });
  const connectInFlight = useRef(false);
  const authInProgress = useRef(false);
  const lastCheckRef = useRef(0);

  useEffect(() => {
    const doConnect = async () => {
      if (connectInFlight.current || authInProgress.current) return;
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
    };

    doConnect();
    const onFocus = () => {
      if (Date.now() - lastCheckRef.current < 2000) return;
      authInProgress.current = false; // User returned from OAuth tab — re-check
      doConnect();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [router]);

  const retryConnection = () => {
    if (connectInFlight.current) return;
    authInProgress.current = false;
    setArcadeStatus({ state: "checking" });
    connectInFlight.current = true;
    fetch("/api/auth/arcade/connect", { method: "POST" })
      .then((r) => {
        if (r.status === 401) {
          router.push("/");
          return;
        }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        const status = parseArcadeResponse(data);
        authInProgress.current = status.state === "needs_auth";
        setArcadeStatus(status);
      })
      .catch(() =>
        setArcadeStatus({
          state: "error",
          message: "Failed to check Arcade connection.",
        })
      )
      .finally(() => {
        connectInFlight.current = false;
      });
  };

  return { arcadeStatus, retryConnection };
}
