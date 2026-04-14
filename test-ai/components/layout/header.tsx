"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { LogOut, Moon, Sun } from "lucide-react";
import { Button } from "@arcadeai/design-system";

const emptySubscribe = () => () => {};

interface HeaderProps {
  onLogout?: () => void;
}

function ArcadeLogo() {
  return (
    <div className="flex items-center gap-2">
      <svg width="22" height="22" viewBox="0 0 309 315" fill="currentColor" aria-hidden="true">
        <path d="M267.074 293.931L266.955 0L231.402 15.9321L45.0407 294.83L9.86791 299.653L0 314.989H98.1906L109.035 299.653L72.3429 293.963L109.535 234.191L171.521 206.478C177.611 203.757 184.212 202.348 190.877 202.348H221.339L221.306 212.98V213.024L221.089 293.974L191.843 298.266L180.705 315H296.993L308.25 298.212M171.293 187.977L125.145 209.176L221.86 60L221.881 86.3042L221.382 158.996L221.339 183.685L190.063 183.652C183.202 183.652 177.514 185.116 171.293 187.977Z" />
      </svg>
      <span className="text-base font-semibold tracking-tight">Arcade Agent</span>
    </div>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-label="Toggle theme">
        <Sun className="size-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}

export function Header({ onLogout }: HeaderProps) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-6 py-3">
      <div className="flex items-center gap-4">
        <ArcadeLogo />
        <span className="hidden text-sm text-muted-foreground sm:block">{today}</span>
      </div>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        {onLogout && (
          <Button variant="ghost" size="icon" onClick={onLogout} aria-label="Logout">
            <LogOut />
          </Button>
        )}
      </div>
    </header>
  );
}
