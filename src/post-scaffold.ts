import * as p from "@clack/prompts";
import pc from "picocolors";
import { stripVTControlCharacters } from "node:util";
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { randomBytes } from "crypto";
import { runAsync } from "./utils.js";
import type { TemplateMeta } from "./types.js";

const GATEWAY_SETUP_URL =
  "https://app.arcade.dev/mcp-gateways?create=true&tools=" +
  encodeURIComponent(
    JSON.stringify([
      "Slack.ListConversations",
      "Slack.GetMessages",
      "Slack.GetConversationMetadata",
      "Slack.WhoAmI",
      "GoogleCalendar.ListEvents",
      "GoogleCalendar.ListCalendars",
      "GoogleCalendar.WhoAmI",
      "Linear.GetNotifications",
      "Linear.GetRecentActivity",
      "Linear.ListIssues",
      "Linear.GetIssue",
      "Linear.ListProjects",
      "Linear.GetProject",
      "Linear.WhoAmI",
      "Github.ListNotifications",
      "Github.GetNotificationSummary",
      "Github.ListPullRequests",
      "Github.GetPullRequest",
      "Github.GetUserOpenItems",
      "Github.GetUserRecentActivity",
      "Github.GetReviewWorkload",
      "Github.GetIssue",
      "Github.WhoAmI",
      "Gmail.ListEmails",
      "Gmail.ListThreads",
      "Gmail.GetThread",
      "Gmail.SearchThreads",
      "Gmail.WhoAmI",
    ])
  );

// Arcade brand red — closest ANSI approximation of oklch(63.1% .255 22.8)
const ARCADE_RED = "\x1b[91m";
const RESET = "\x1b[0m";

function arcadeRed(s: string): string {
  return `${ARCADE_RED}${s}${RESET}`;
}

function hyperlink(url: string, text: string): string {
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}

function printNote(content: string, title: string) {
  const lines = `\n${content}\n`.split("\n");
  const titleLen = stripVTControlCharacters(title).length;
  const maxLen =
    Math.max(
      lines.reduce((max, line) => {
        const len = stripVTControlCharacters(line).length;
        return len > max ? len : max;
      }, 0),
      titleLen
    ) + 2;
  const bar = pc.gray("│");
  const blankLine = `${bar}  ${" ".repeat(maxLen)}${pc.gray("│")}`;
  const topLine = `${"◇"}  ${title} ${pc.gray("─".repeat(maxLen - titleLen - 1) + "╮")}`;
  const contentLines = lines.map(
    (line) =>
      `${bar}  ${line}${" ".repeat(maxLen - stripVTControlCharacters(line).length)}${pc.gray("│")}`
  );
  const bottomLine = pc.gray(`├${"─".repeat(maxLen + 2)}╯`);
  process.stdout.write(
    [pc.gray("│"), topLine, blankLine, ...contentLines, blankLine, bottomLine, ""].join("\n") + "\n"
  );
}

export function copyEnvIfMissing(targetDir: string) {
  const example = resolve(targetDir, ".env.example");
  const env = resolve(targetDir, ".env");
  if (existsSync(example) && !existsSync(env)) {
    copyFileSync(example, env);
    // Generate random secrets for auth
    let content = readFileSync(env, "utf-8");
    const secret = randomBytes(32).toString("hex");
    content = content.replace(/^BETTER_AUTH_SECRET=\s*$/m, `BETTER_AUTH_SECRET=${secret}`);
    content = content.replace(
      /^APP_SECRET_KEY=change-me-to-a-random-string\s*$/m,
      `APP_SECRET_KEY=${randomBytes(32).toString("hex")}`
    );
    writeFileSync(env, content);
  }
}

export async function installDeps(targetDir: string, meta: TemplateMeta): Promise<boolean> {
  const s = p.spinner();

  for (const step of meta.install) {
    s.start(`${step.label}...`);
    const cmd = process.platform === "win32" && step.winCmd ? step.winCmd : step.cmd;
    const result = await runAsync(cmd, step.args, targetDir);
    if (result.status !== 0) {
      s.error(`${step.label} failed`);
      p.log.warn(
        `${result.stderr || `${cmd} ${step.args.join(" ")} failed`}\n\nRun manually: ${cmd} ${step.args.join(" ")}`
      );
      return false;
    }
    s.stop(step.label.replace(/\.\.\.$/, "") + " done");
  }
  return true;
}

export async function runMigrations(targetDir: string, meta: TemplateMeta) {
  if (meta.migrate.length === 0) return;

  const s = p.spinner();
  s.start("Setting up database...");

  for (const step of meta.migrate) {
    const cmd = process.platform === "win32" && step.winCmd ? step.winCmd : step.cmd;
    const result = await runAsync(cmd, step.args, targetDir);
    if (result.status !== 0) {
      s.error("Database setup failed");
      p.log.warn(
        `${result.stderr || `${cmd} ${step.args.join(" ")} failed`}\n\nRun manually: bun run db:setup`
      );
      return;
    }
    // After generate, verify that migration files were actually created
    if (step.args.includes("generate")) {
      const migrationsDir = resolve(targetDir, "drizzle/migrations");
      const isEmpty =
        !existsSync(migrationsDir) ||
        readdirSync(migrationsDir).filter((f: string) => f.endsWith(".sql")).length === 0;
      if (isEmpty) {
        s.error("Migration generation produced no SQL files — check your schema");
        p.log.warn("Run manually: bun run db:setup");
        return;
      }
    }
  }

  s.stop("Database ready");
}

export function printSuccess(projectName: string, meta: TemplateMeta) {
  const isWin = process.platform === "win32";
  const activateCmd = isWin ? ".venv\\Scripts\\activate" : "source .venv/bin/activate";

  const lines: string[] = [];

  lines.push(
    `1. ${hyperlink(GATEWAY_SETUP_URL, arcadeRed(pc.underline("Click here to create your MCP gateway")))}`,
    "",
    `2. cd ${projectName}`,
    "",
    `3. fill in .env with your API keys`,
    pc.dim(
      `     ARCADE_GATEWAY_URL  — from ${arcadeRed(pc.underline("https://app.arcade.dev/mcp-gateways"))}`
    ),
    pc.dim(`     OPENAI_API_KEY or ANTHROPIC_API_KEY`),
    ""
  );

  if (meta.language === "python") {
    lines.push(`4. ${activateCmd}`, `5. ${meta.devCommand}`);
  } else {
    lines.push(`4. ${meta.devCommand}`);
  }

  printNote(lines.join("\n"), "Next steps");
}
