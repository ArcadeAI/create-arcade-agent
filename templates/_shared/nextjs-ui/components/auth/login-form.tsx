"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@arcadeai/design-system";

export function LoginForm() {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);
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
      const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
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
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{isRegister ? "Create account" : "Sign in"}</CardTitle>
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
          <div className="mt-4 text-center text-sm text-muted-foreground">
            {isRegister ? "Already have an account?" : "No account yet?"}{" "}
            <button
              type="button"
              onClick={() => {
                setIsRegister(!isRegister);
                setError("");
                formRef.current?.reset();
              }}
              className="text-primary underline-offset-4 hover:underline"
            >
              {isRegister ? "Sign in" : "Create account"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
