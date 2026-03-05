#!/usr/bin/env node
import * as p from "@clack/prompts";
import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pc from "picocolors";

import { getProjectName, getTemplate, parseCli } from "./prompts.js";
import { scaffoldTemplate } from "./scaffold.js";
import { installDeps, copyEnvIfMissing, runMigrations, printSuccess } from "./post-scaffold.js";
import { detectPm } from "./utils.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatesDir = resolve(__dirname, "../templates");
const sharedDir = resolve(templatesDir, "_shared");

async function main() {
  const cliArgs = parseCli(process.argv);
  if (cliArgs.help) {
    console.log(`create-arcade-agent

Usage:
  create-arcade-agent [project-name] [options]

Options:
  --template <name>   Template to use (ai-sdk, mastra, langchain)
  --help              Show this help message
  --version           Show version number
`);
    process.exit(0);
  }
  if (cliArgs.version) {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf-8")) as {
      version: string;
    };
    console.log(pkg.version);
    process.exit(0);
  }

  p.intro(pc.bold("create-arcade-agent"));

  const projectName = await getProjectName(process.argv);
  const { meta, templateDir } = await getTemplate(process.argv, templatesDir);

  // Detect package manager: prefer bun if available, fall back to npm/npx
  const needsBun = meta.install
    .concat(meta.migrate)
    .some((s) => s.cmd === "bun" || s.cmd === "bunx");
  if (needsBun) {
    const pm = await detectPm(process.cwd());
    if (pm === "npm") {
      p.log.info("bun not found — using npm/npx instead");
      const remap = (cmd: string) => (cmd === "bun" ? "npm" : cmd === "bunx" ? "npx" : cmd);
      for (const step of meta.install) step.cmd = remap(step.cmd);
      for (const step of meta.migrate) step.cmd = remap(step.cmd);
      meta.devCommand = meta.devCommand.replace(/^bun /, "npm ");
    }
  }

  const targetDir = resolve(process.cwd(), projectName);
  // Ensure target is a direct child of cwd
  if (resolve(targetDir, "..") !== process.cwd()) {
    p.cancel("Project must be created in the current directory.");
    process.exit(1);
  }
  if (existsSync(targetDir)) {
    p.cancel(`Directory "${projectName}" already exists.`);
    process.exit(1);
  }

  const s = p.spinner();
  s.start("Copying template files...");
  scaffoldTemplate(templateDir, targetDir, meta, projectName, sharedDir);
  s.stop("Template copied");

  const installOk = await installDeps(targetDir, meta);
  copyEnvIfMissing(targetDir);
  if (installOk) await runMigrations(targetDir, meta);
  printSuccess(projectName, meta);

  p.outro("Done! Happy building.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
