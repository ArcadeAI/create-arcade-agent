import Handlebars from "handlebars";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "fs";
import { resolve, join, relative, dirname, extname, basename } from "path";
import type { TemplateMeta } from "./types.js";

function registerHelpers() {
  Handlebars.registerHelper("eq", (a, b) => a === b);
  Handlebars.registerHelper("ne", (a, b) => a !== b);
  Handlebars.registerHelper(
    "and",
    (...args) => args.slice(0, -1).every(Boolean)
  );
  Handlebars.registerHelper(
    "or",
    (...args) => args.slice(0, -1).some(Boolean)
  );
  Handlebars.registerHelper("includes", (arr: unknown[], val: unknown) =>
    Array.isArray(arr) ? arr.includes(val) : false
  );
}

function registerPartials(sharedDir: string) {
  const partialsDir = join(sharedDir, "partials");
  if (!existsSync(partialsDir)) return;

  for (const file of readdirSync(partialsDir)) {
    if (!file.endsWith(".hbs")) continue;
    const partialName = file.replace(/\.hbs$/, "");
    const content = readFileSync(join(partialsDir, file), "utf-8");
    Handlebars.registerPartial(partialName, content);
  }
}

function walkDir(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

export function scaffoldTemplate(
  templateDir: string,
  targetDir: string,
  meta: TemplateMeta,
  projectName: string,
  sharedDir: string
) {
  registerHelpers();
  registerPartials(sharedDir);

  const context = { ...meta, projectName };

  // Walk template directory and process files
  const files = walkDir(templateDir);
  for (const srcPath of files) {
    const relPath = relative(templateDir, srcPath);

    // Skip template.json itself
    if (relPath === "template.json") continue;

    let destRelPath = relPath;
    const isHbs = srcPath.endsWith(".hbs");

    if (isHbs) {
      // Strip .hbs extension: README.md.hbs → README.md
      destRelPath = relPath.slice(0, -4);
    }

    const destPath = resolve(targetDir, destRelPath);
    mkdirSync(dirname(destPath), { recursive: true });

    if (isHbs) {
      const template = readFileSync(srcPath, "utf-8");
      const compiled = Handlebars.compile(template, { noEscape: true });
      writeFileSync(destPath, compiled(context));
    } else {
      cpSync(srcPath, destPath);
    }
  }

  // Copy shared files per meta.sharedFiles mapping
  for (const [sharedFile, destRelPath] of Object.entries(meta.sharedFiles)) {
    const srcPath = join(sharedDir, sharedFile);
    if (!existsSync(srcPath)) continue;

    if (statSync(srcPath).isDirectory()) {
      // Directory entry: walk all files and copy/process each one
      for (const filePath of walkDir(srcPath)) {
        const relPath = relative(srcPath, filePath);
        const dest = destRelPath === "" ? relPath : join(destRelPath, relPath);
        let destPath = resolve(targetDir, dest);
        mkdirSync(dirname(destPath), { recursive: true });

        if (filePath.endsWith(".hbs")) {
          destPath = destPath.replace(/\.hbs$/, "");
          const content = readFileSync(filePath, "utf-8");
          const compiled = Handlebars.compile(content, { noEscape: true });
          writeFileSync(destPath, compiled(context));
        } else {
          cpSync(filePath, destPath);
        }
      }
    } else {
      // Single-file entry
      if (srcPath.endsWith(".hbs")) {
        const content = readFileSync(srcPath, "utf-8");
        const compiled = Handlebars.compile(content, { noEscape: true });
        const destPath = resolve(targetDir, destRelPath.replace(/\.hbs$/, ""));
        mkdirSync(dirname(destPath), { recursive: true });
        writeFileSync(destPath, compiled(context));
      } else {
        const destPath = resolve(targetDir, destRelPath);
        mkdirSync(dirname(destPath), { recursive: true });
        cpSync(srcPath, destPath);
      }
    }
  }

  // Rename dotfiles per meta.dotfileRenames
  for (const [from, to] of Object.entries(meta.dotfileRenames)) {
    const fromPath = resolve(targetDir, from);
    if (existsSync(fromPath)) {
      renameSync(fromPath, resolve(targetDir, to));
    }
  }

  // Replace project name in manifest files
  for (const [file, config] of Object.entries(meta.placeholders)) {
    const filePath = resolve(targetDir, file);
    if (!existsSync(filePath)) continue;

    if (config.format === "json") {
      const pkg = JSON.parse(readFileSync(filePath, "utf-8"));
      pkg[config.field] = projectName;
      writeFileSync(filePath, JSON.stringify(pkg, null, 2) + "\n");
    } else if (config.format === "toml") {
      let content = readFileSync(filePath, "utf-8");
      const pattern = new RegExp(`^${config.field}\\s*=\\s*".*"`, "m");
      content = content.replace(pattern, `${config.field} = "${projectName}"`);
      writeFileSync(filePath, content);
    }
  }
}
