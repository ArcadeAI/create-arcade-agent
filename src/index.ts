#!/usr/bin/env node
import * as p from "@clack/prompts";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pc from "picocolors";

import { getProjectName, getTemplate } from "./prompts.js";
import { scaffoldTemplate } from "./scaffold.js";
import { installDeps, copyEnvIfMissing, runMigrations, printSuccess } from "./post-scaffold.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatesDir = resolve(__dirname, "../templates");
const sharedDir = resolve(templatesDir, "_shared");

async function main() {
  p.intro(pc.bold("create-arcade-agent"));

  const projectName = await getProjectName(process.argv);
  const { meta, templateDir } = await getTemplate(process.argv, templatesDir);

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

  await installDeps(targetDir, meta);
  copyEnvIfMissing(targetDir);
  await runMigrations(targetDir, meta);
  printSuccess(projectName, meta);

  p.outro(pc.green("Done! Happy building."));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
