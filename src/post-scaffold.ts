import * as p from "@clack/prompts";
import pc from "picocolors";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { randomBytes } from "crypto";
import { runAsync } from "./utils.js";
import type { TemplateMeta } from "./types.js";

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

export async function installDeps(targetDir: string, meta: TemplateMeta) {
  const s = p.spinner();

  for (const step of meta.install) {
    s.start(`${step.label}...`);
    const cmd = process.platform === "win32" && step.winCmd ? step.winCmd : step.cmd;
    const result = await runAsync(cmd, step.args, targetDir);
    if (result.status !== 0) {
      s.stop(`${step.label} failed`);
      p.log.warn(
        `${result.stderr || `${cmd} ${step.args.join(" ")} failed`}\n\nRun manually: ${cmd} ${step.args.join(" ")}`
      );
      return;
    }
    s.stop(step.label.replace(/\.\.\.$/, "") + " done");
  }
}

export async function runMigrations(targetDir: string, meta: TemplateMeta) {
  if (meta.migrate.length === 0) return;

  const s = p.spinner();
  s.start("Setting up database...");

  for (const step of meta.migrate) {
    const cmd = process.platform === "win32" && step.winCmd ? step.winCmd : step.cmd;
    const result = await runAsync(cmd, step.args, targetDir);
    if (result.status !== 0) {
      s.stop("Database setup failed (you can run migrations manually)");
      p.log.warn(result.stderr || `${cmd} ${step.args.join(" ")} failed`);
      return;
    }
  }

  s.stop("Database ready");
}

export function printSuccess(projectName: string, meta: TemplateMeta) {
  const isWin = process.platform === "win32";
  const activateCmd = isWin ? ".venv\\Scripts\\activate" : "source .venv/bin/activate";

  const lines = [`cd ${projectName}`];

  if (meta.language === "python") {
    lines.push(`${pc.dim("# fill in .env with your API keys")}`, activateCmd);
    lines.push(meta.devCommand);
  } else {
    lines.push(`${pc.dim("# fill in .env with your API keys")}`, meta.devCommand);
  }

  lines.push(
    "",
    pc.dim("Your .env needs:"),
    pc.dim(`  ARCADE_GATEWAY_URL  — from ${pc.cyan("https://app.arcade.dev/mcp-gateways")}`),
    pc.dim(`  OPENAI_API_KEY or ANTHROPIC_API_KEY`),
    "",
    pc.dim("Add only these minimum tools to your Arcade Gateway:"),
    pc.dim("  Slack: Slack_ListConversations, Slack_GetMessages,"),
    pc.dim("    Slack_GetConversationMetadata, Slack_WhoAmI"),
    pc.dim("  Google Calendar: GoogleCalendar_ListEvents,"),
    pc.dim("    GoogleCalendar_ListCalendars, GoogleCalendar_WhoAmI"),
    pc.dim("  Linear: Linear_GetNotifications, Linear_GetRecentActivity,"),
    pc.dim("    Linear_ListIssues, Linear_GetIssue, Linear_ListProjects,"),
    pc.dim("    Linear_GetProject, Linear_WhoAmI"),
    pc.dim("  GitHub: Github_ListNotifications, Github_GetNotificationSummary,"),
    pc.dim("    Github_ListPullRequests, Github_GetPullRequest,"),
    pc.dim("    Github_GetUserOpenItems, Github_GetUserRecentActivity,"),
    pc.dim("    Github_GetReviewWorkload, Github_GetIssue, Github_WhoAmI"),
    pc.dim("  Gmail: Gmail_ListEmails, Gmail_ListThreads, Gmail_GetThread,"),
    pc.dim("    Gmail_SearchThreads, Gmail_WhoAmI"),
    pc.dim(`Configure at: ${pc.cyan("https://app.arcade.dev/mcp-gateways")}`)
  );

  p.note(lines.join("\n"), "Next steps");
}
