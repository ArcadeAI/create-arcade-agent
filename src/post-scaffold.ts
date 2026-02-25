import * as p from "@clack/prompts";
import pc from "picocolors";
import { runAsync } from "./utils.js";
import type { TemplateMeta } from "./types.js";

export async function installDeps(targetDir: string, meta: TemplateMeta) {
  const s = p.spinner();

  for (const step of meta.install) {
    s.start(`${step.label}...`);
    const cmd = process.platform === "win32" && step.winCmd ? step.winCmd : step.cmd;
    const result = await runAsync(cmd, step.args, targetDir);
    if (result.status !== 0) {
      s.stop(`${step.label} failed`);
      p.log.error(result.stderr || `${cmd} ${step.args.join(" ")} failed`);
      process.exit(1);
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
  const copyCmd = isWin ? "copy .env.example .env" : "cp .env.example .env";
  const activateCmd = isWin ? ".venv\\Scripts\\activate" : "source .venv/bin/activate";

  const lines = [`cd ${projectName}`];

  if (meta.language === "python") {
    lines.push(
      `${copyCmd}  ${pc.dim("# then fill in your env vars")}`,
      activateCmd,
      meta.devCommand
    );
  } else {
    lines.push(`${copyCmd}  ${pc.dim("# then fill in your env vars")}`, meta.devCommand);
  }

  lines.push(
    "",
    pc.dim("Your .env needs:"),
    pc.dim(`  ARCADE_GATEWAY_URL  — from ${pc.cyan("https://app.arcade.dev/mcp-gateways")}`),
    pc.dim(`  OPENAI_API_KEY or ANTHROPIC_API_KEY`),
    "",
    pc.dim("Add these toolkits to your Arcade Gateway:"),
    pc.dim("  Slack, Google Calendar, Linear, GitHub, Gmail"),
    pc.dim(`Configure at: ${pc.cyan("https://app.arcade.dev/mcp-gateways")}`)
  );

  p.note(lines.join("\n"), "Next steps");
}
