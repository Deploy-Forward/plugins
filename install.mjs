#!/usr/bin/env node
/** Skill-only installer: dry-run by default; preserves identical files and backs up replacements. Registering marketplaces and MCP connections is a separate person-authorized action. */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep, parse } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url));
const CHECKOUT = PLUGIN_DIR;
const USAGE = "usage: node install.mjs [--dry-run | --apply] [--root <dir>]";

class UsageError extends Error {}
class InstallError extends Error {}

const lf = (text) => text.replace(/\r\n/g, "\n");
const posix = (path) => path.split(sep).join("/");

/** A blank explicit root is refused rather than interpreted as the default home. */
function rootValue(value) {
  if (value === undefined || value.trim() === "") {
    throw new UsageError("--root needs a folder; an empty --root is refused, never read as the default root");
  }
  return value;
}

function parseArgs(argv) {
  let mode = null;
  let root = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run" || arg === "--apply") {
      const next = arg.slice(2);
      if (mode && mode !== next) throw new UsageError("--dry-run and --apply cannot be used together");
      mode = next;
    } else if (arg === "--root") {
      root = rootValue(argv[++i]);
    } else if (arg.startsWith("--root=")) {
      root = rootValue(arg.slice("--root=".length));
    } else if (arg === "--help" || arg === "-h") {
      return { help: true };
    } else {
      throw new UsageError(`unknown argument: ${arg}`);
    }
  }
  const selectedRoot = resolve(root ?? homedir());
  if (selectedRoot === parse(selectedRoot).root) throw new UsageError("a filesystem root is refused; choose your home or a dedicated folder");
  return { mode: mode ?? "dry-run", root: selectedRoot };
}

function subfolders(abs) {
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function filesEndingIn(abs, ext) {
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(ext))
    .map((d) => d.name)
    .sort();
}

/** Every file the installer owns under the root, in harness order, with the checkout file it comes from. Never
 * <root>/.claude-plugin: that marketplace file may be someone else's (a machine-level marketplace of the person's
 * own, not this checkout's, for example at <root>/.claude-plugin/marketplace.json) and this installer does not create,
 * read, modify or back it up. */
function targets(root) {
  const names = subfolders(join(PLUGIN_DIR, "agents", "skills"));
  const rules = filesEndingIn(join(PLUGIN_DIR, "cursor", "rules"), ".mdc");
  if (names.length === 0 || rules.length === 0 || !existsSync(join(PLUGIN_DIR, "codex", "AGENTS.md"))) {
    throw new InstallError(`no rendered copies under ${PLUGIN_DIR}; render them first: node scripts/render-skills.mjs`);
  }
  const copy = (from) => ({ from, content: lf(readFileSync(join(PLUGIN_DIR, from), "utf8")) });
  const skills = (home) => names.map((n) => ({ rel: join(home, "skills", n, "SKILL.md"), ...copy(`agents/skills/${n}/SKILL.md`) }));
  return [
    ...skills(".claude"),
    { rel: join(".codex", "AGENTS.md"), ...copy("codex/AGENTS.md") },
    ...skills(".codex"),
    ...rules.map((f) => ({ rel: join(".cursor", "rules", f), ...copy(`cursor/rules/${f}`) })),
    ...skills(".agents"),
    ...skills(".grok"),
  ];
}

/** create, replace or same; refuses where a folder stands in the way of a file. */
function statusOf(root, target) {
  const parts = target.rel.split(sep);
  for (let i = 1; i < parts.length; i++) {
    const folder = join(root, ...parts.slice(0, i));
    if (existsSync(folder) && !statSync(folder).isDirectory()) {
      throw new InstallError(`${folder} is a file where ${join(root, target.rel)} needs a folder`);
    }
  }
  const abs = join(root, target.rel);
  if (!existsSync(abs)) return "create";
  if (statSync(abs).isDirectory()) throw new InstallError(`${abs} is a folder; the installer writes a file there`);
  if (readFileSync(abs).equals(Buffer.from(target.content, "utf8"))) return "same";
  return "replace";
}

/** The commands that register this checkout's marketplace and install its two plugins. Printed, never run: the
 * installer registers nothing itself. */
function registerCommands() {
  return [
    `claude plugin marketplace add "${posix(PLUGIN_DIR)}"`,
    "claude plugin install worklanes@deploy-forward",
    "claude plugin install convoy@deploy-forward",
  ];
}

function backupFolder(root, now) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  let name = `.skills-backup-${stamp}`;
  for (let n = 2; existsSync(join(root, name)); n++) name = `.skills-backup-${stamp}-${n}`;
  return join(root, name);
}

function main(argv) {
  const args = parseArgs(argv);
  const log = (line = "") => process.stdout.write(`${line}\n`);
  if (args.help) {
    log(USAGE);
    return 0;
  }
  const { mode, root } = args;
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new InstallError(`the root ${root} is not a folder`);
  const plan = targets(root).map((t) => ({ ...t, abs: join(root, t.rel), status: statusOf(root, t) }));
  const count = (status) => plan.filter((p) => p.status === status).length;
  const summary = `${count("create")} to create and ${count("replace")} to replace (each moved to the backup first), ${count("same")} already installed. Nothing is deleted.`;

  log(
    mode === "apply"
      ? "Worklanes and Convoy skills: install"
      : "Worklanes and Convoy skills: install plan (dry run: nothing is written; pass --apply to install)",
  );
  log(`checkout  ${CHECKOUT}`);
  log(`root      ${root}`);
  log();

  if (mode === "dry-run") {
    const backup = join(root, ".skills-backup-<UTC timestamp>");
    for (const p of plan) {
      if (p.status === "create") log(`create   ${p.abs}  from ${p.from}`);
      if (p.status === "replace") log(`replace  ${p.abs}  from ${p.from}; the file there now moves to ${join(backup, p.rel)}`);
      if (p.status === "same") log(`same     ${p.abs}  already holds ${p.from}`);
    }
    log();
    log(`Plan: ${summary}`);
    log();
    log("This installer never touches <root>/.claude-plugin. It registers nothing; run these yourself:");
    for (const cmd of registerCommands()) log(`  ${cmd}`);
    return 0;
  }

  if (count("same") === plan.length) {
    for (const p of plan) log(`same     ${p.abs}`);
    log();
    log(`Plan: ${summary}`);
    log("Nothing to change.");
    log();
    log("This installer never touches <root>/.claude-plugin. It registers nothing; run these yourself:");
    for (const cmd of registerCommands()) log(`  ${cmd}`);
    return 0;
  }

  const now = new Date();
  const backup = count("replace") > 0 ? backupFolder(root, now) : null;
  const moved = [];
  if (backup) {
    mkdirSync(backup);
    try {
      for (const p of plan.filter((q) => q.status === "replace")) {
        const to = join(backup, p.rel);
        mkdirSync(dirname(to), { recursive: true });
        renameSync(p.abs, to);
        moved.push({ path: posix(p.rel), from: p.abs, to });
      }
    } finally {
      const manifest = { movedAt: now.toISOString(), root, checkout: CHECKOUT, moved };
      writeFileSync(join(backup, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    }
  }
  for (const p of plan.filter((q) => q.status !== "same")) {
    mkdirSync(dirname(p.abs), { recursive: true });
    writeFileSync(p.abs, p.content, "utf8");
  }
  for (const p of plan) {
    if (p.status === "create") log(`created  ${p.abs}  from ${p.from}`);
    if (p.status === "replace") log(`replaced ${p.abs}  from ${p.from}; the old file is ${join(backup, p.rel)}`);
    if (p.status === "same") log(`same     ${p.abs}`);
  }
  log();
  log(`Plan: ${summary}`);
  log(backup ? `Done. The old copy of each file replaced is in ${backup}, listed in its manifest.json.` : "Done. Nothing was replaced.");
  log();
  log("This installer never touched <root>/.claude-plugin. It registers nothing; run these yourself:");
  for (const cmd of registerCommands()) log(`  ${cmd}`);
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  if (e instanceof UsageError) {
    process.stderr.write(`${e.message}\n${USAGE}\n`);
    process.exitCode = 2;
  } else if (e instanceof InstallError) {
    process.stderr.write(`refused: ${e.message}\nNothing was written.\n`);
    process.exitCode = 1;
  } else {
    process.stderr.write(`${e && e.stack ? e.stack : e}\n`);
    process.exitCode = 1;
  }
}
