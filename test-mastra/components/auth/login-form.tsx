"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import {
  Alert,
  AlertTitle,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Input,
  Label,
} from "@arcadeai/design-system";
import { Info } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const email = form.get("email") as string;
    const password = form.get("password") as string;

    if (!email || !password) {
      setError("Please fill in all fields.");
      setLoading(false);
      return;
    }

    try {
      if (isRegister) {
        const { error: err } = await authClient.signUp.email({ email, password, name: "" });
        if (err) {
          setError(err.message ?? "Something went wrong");
          return;
        }
      } else {
        const { error: err } = await authClient.signIn.email({ email, password });
        if (err) {
          setError(err.message ?? "Invalid credentials");
          return;
        }
      }
      router.push("/dashboard");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="mb-8 flex flex-col items-center gap-3">
        <svg width="40" height="41" viewBox="0 0 309 315" fill="currentColor" aria-hidden="true">
          <path d="M267.074 293.931L266.955 0L231.402 15.9321L45.0407 294.83L9.86791 299.653L0 314.989H98.1906L109.035 299.653L72.3429 293.963L109.535 234.191L171.521 206.478C177.611 203.757 184.212 202.348 190.877 202.348H221.339L221.306 212.98V213.024L221.089 293.974L191.843 298.266L180.705 315H296.993L308.25 298.212M171.293 187.977L125.145 209.176L221.86 60L221.881 86.3042L221.382 158.996L221.339 183.685L190.063 183.652C183.202 183.652 177.514 185.116 171.293 187.977Z" />
        </svg>
        <span className="text-xl font-semibold tracking-tight">Arcade Agent</span>
      </div>
      <Alert className="mb-4 w-full max-w-sm">
        <Info className="size-4" />
        <AlertTitle>Two separate sign-ins</AlertTitle>
        <AlertDescription>
          This creates a local account for your agent app — it&apos;s just for session management
          and stays in your own database. You&apos;ll connect your Arcade account on the next screen
          to give the agent access to your tools.
        </AlertDescription>
      </Alert>
      <Card className="w-full max-w-sm">
        <CardHeader className="pb-2">
          <div className="mb-3 flex rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => {
                setIsRegister(true);
                setError("");
                formRef.current?.reset();
              }}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                isRegister
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Create account
            </button>
            <button
              type="button"
              onClick={() => {
                setIsRegister(false);
                setError("");
                formRef.current?.reset();
              }}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                !isRegister
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign in
            </button>
          </div>
          <CardDescription>
            {isRegister ? "Get started with Arcade Agent" : "Welcome back to Arcade Agent"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form ref={formRef} onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="you@example.com" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" placeholder="Your password" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Loading..." : isRegister ? "Create account" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
