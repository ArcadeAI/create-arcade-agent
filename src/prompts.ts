import * as p from "@clack/prompts";
import { existsSync, readdirSync, readFileSync } from "fs";
import { resolve, join } from "path";
import { parseArgs } from "util";
import type { TemplateMeta } from "./types.js";

function parseCli(argv: string[]): { projectName?: string; template?: string } {
  const parsed = parseArgs({
    args: argv.slice(2),
    options: {
      template: { type: "string" },
    },
    allowPositionals: true,
    strict: false,
  });

  const projectName = parsed.positionals.find((arg) => !arg.startsWith("-"));
  const template = typeof parsed.values.template === "string" ? parsed.values.template : undefined;
  return { projectName, template };
}

export async function getProjectName(argv: string[]): Promise<string> {
  let projectName = parseCli(argv).projectName ?? "";
  if (!projectName) {
    const result = await p.text({
      message: "What is your project name?",
      placeholder: "my-arcade-agent",
      validate: (v) => {
        if (!v.trim()) return "Name is required";
        if (/[/\\]/.test(v.trim())) return "Project name cannot contain path separators";
        if (v.trim().startsWith(".")) return "Project name cannot start with a dot";
        return undefined;
      },
    });
    if (p.isCancel(result)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }
    projectName = result;
  }
  return projectName.trim();
}

function discoverTemplates(templatesDir: string): { meta: TemplateMeta; dir: string }[] {
  const entries = readdirSync(templatesDir, { withFileTypes: true });
  const templates: { meta: TemplateMeta; dir: string }[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
    const metaPath = join(templatesDir, entry.name, "template.json");
    if (!existsSync(metaPath)) continue;
    const meta: TemplateMeta = JSON.parse(readFileSync(metaPath, "utf-8"));
    templates.push({ meta, dir: resolve(templatesDir, entry.name) });
  }

  return templates;
}

export async function getTemplate(
  argv: string[],
  templatesDir: string
): Promise<{ meta: TemplateMeta; templateDir: string }> {
  const templates = discoverTemplates(templatesDir);

  if (templates.length === 0) {
    p.cancel("No templates found.");
    process.exit(1);
  }

  const cliTemplate = parseCli(argv).template;
  if (cliTemplate) {
    const val = cliTemplate;
    const match = templates.find((t) => t.meta.name === val);
    if (!match) {
      const names = templates.map((t) => `"${t.meta.name}"`).join(", ");
      p.cancel(`Unknown template "${val}". Available: ${names}`);
      process.exit(1);
    }
    return { meta: match.meta, templateDir: match.dir };
  }

  // Interactive select
  const result = await p.select({
    message: "Which framework?",
    options: templates.map((t) => ({
      value: t.meta.name,
      label: t.meta.displayName,
      hint: t.meta.hint,
    })),
  });

  if (p.isCancel(result)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const selected = templates.find((t) => t.meta.name === result)!;
  return { meta: selected.meta, templateDir: selected.dir };
}
