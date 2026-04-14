export type ConfigWarning = {
  id: string;
  title: string;
  message: string;
  docsUrl: string;
};

export type ArcadeStatus =
  | { state: "checking" }
  | { state: "needs_auth"; authUrl: string }
  | { state: "connected" }
  | { state: "error"; message: string };

export type SourceCheckPhase = "idle" | "checking" | "done";
