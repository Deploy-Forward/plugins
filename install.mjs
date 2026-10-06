#!/usr/bin/env node
/** Installer for the harnesses that do not take the plugins from a marketplace: Grok (skill copies) and agy (its
 * plugin layout). Dry-run by default; keeps identical files and backs up replacements. --check --scan only reads.
 * Registering marketplaces and MCP connections stays a separate step the person runs. */
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep, parse } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url));
const CHECKOUT = PLUGIN_DIR;
const PLUGINS = ["convoy", "worklanes"];
const HARNESS_DIRS = [".claude", ".codex", ".agents", ".grok", ".cursor"];
const GROK_DIR = join(".convoy", "skills", "grok");
const AGY_DIR = join(".gemini", "config", "plugins");
const USAGE = [
  "usage: node install.mjs [--dry-run | --apply] [--root <dir>]",
  "       node install.mjs --check --scan <dir> [--scan <dir> ...] [--legacy <file.tsv>]",
].join("\n");

class UsageError extends Error {}
class InstallError extends Error {}

const lf = (text) => text.replace(/\r\n/g, "\n");
const posix = (path) => path.split(sep).join("/");
const lf12 = (bytes) => createHash("sha256").update(Buffer.from(bytes).toString("utf8").replaceAll("\r", "")).digest("hex").slice(0, 12);
const fold = (path) => (process.platform === "win32" ? path.toLowerCase() : path);
const inside = (path, folder) => {
  const rel = relative(fold(folder), fold(path));
  return rel === "" || (!rel.startsWith("..") && !parse(rel).root);
};

/** A blank explicit value is refused rather than interpreted as a default. */
function value(flag, raw) {
  if (raw === undefined || raw.trim() === "") {
    throw new UsageError(`${flag} needs a folder; an empty ${flag} is refused, never read as the default root`);
  }
  return raw;
}

function parseArgs(argv) {
  let mode = null;
  let root = null;
  const scans = [];
  const legacy = [];
  const setMode = (next) => {
    if (mode && mode !== next) throw new UsageError(`--${mode} and --${next} cannot be used together`);
    mode = next;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run" || arg === "--apply" || arg === "--check") setMode(arg.slice(2));
    else if (arg === "--root") root = value("--root", argv[++i]);
    else if (arg.startsWith("--root=")) root = value("--root", arg.slice("--root=".length));
    else if (arg === "--scan") scans.push(value("--scan", argv[++i]));
    else if (arg === "--legacy") legacy.push(value("--legacy", argv[++i]));
    else if (arg === "--help" || arg === "-h") return { help: true };
    else throw new UsageError(`unknown argument: ${arg}`);
  }
  if (mode === "check") {
    if (scans.length === 0) throw new UsageError("--check needs --scan <dir>; it has no default folder");
    if (root !== null) throw new UsageError("--check reads only the --scan folders; --root is not used");
    return { mode, scans: scans.map((s) => resolve(s)), legacy: legacy.map((l) => resolve(l)) };
  }
  if (scans.length || legacy.length) throw new UsageError("--scan and --legacy go with --check");
  const selectedRoot = resolve(root ?? homedir());
  if (selectedRoot === parse(selectedRoot).root) throw new UsageError("a filesystem root is refused; choose your home or a dedicated folder");
  return { mode: mode ?? "dry-run", root: selectedRoot };
}

function walk(abs) {
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true }).flatMap((d) => {
    const path = join(abs, d.name);
    return d.isDirectory() ? walk(path) : d.isFile() ? [path] : [];
  });
}

/** Every file the installer owns under the root, with the checkout file it comes from. Never <root>/.claude-plugin:
 * that marketplace file may be someone else's, and this installer does not create, read, modify or back it up. */
function targets(root) {
  const names = existsSync(join(PLUGIN_DIR, "agents", "skills")) ? readdirSync(join(PLUGIN_DIR, "agents", "skills")).sort() : [];
  const agy = walk(join(PLUGIN_DIR, "agy", "plugins")).map((p) => relative(join(PLUGIN_DIR, "agy", "plugins"), p)).sort();
  if (names.length === 0 || !PLUGINS.every((p) => agy.some((f) => f.startsWith(p + sep)))) {
    throw new InstallError(`no rendered copies under ${PLUGIN_DIR}; render them first: node scripts/render-skills.mjs`);
  }
  const copy = (from) => ({ from, content: lf(readFileSync(join(PLUGIN_DIR, from), "utf8")) });
  const list = [
    ...names.map((n) => ({ rel: join(GROK_DIR, n, "SKILL.md"), ...copy(`agents/skills/${n}/SKILL.md`) })),
    ...agy.map((f) => ({ rel: join(AGY_DIR, f), ...copy(`agy/plugins/${posix(f)}`) })),
  ];
  for (const t of list) guard(join(root, t.rel));
  return list;
}

/** The real path of a file that may not exist yet: the deepest existing ancestor through realpath (junctions and
 * symlinks resolved), then the missing tail appended as written. */
function real(abs) {
  const tail = [];
  let path = resolve(abs);
  for (;;) {
    try {
      return join(realpathSync.native(path), ...tail);
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
      const parent = dirname(path);
      if (parent === path) return resolve(abs);
      tail.unshift(basename(path));
      path = parent;
    }
  }
}

/** Harness folders of the home and of the filesystem root belong to their harness, never to this installer. Both
 * sides are compared as real paths, so a junction or symlink into a harness folder is refused too. */
function guard(abs) {
  const target = real(abs);
  for (const base of [homedir(), parse(abs).root, parse(target).root]) {
    for (const folder of HARNESS_DIRS) {
      const harness = join(base, folder);
      if (inside(abs, harness) || inside(target, real(harness))) {
        throw new InstallError(`${abs} is inside the harness folder ${harness}; this installer never writes there`);
      }
    }
  }
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

/** Printed, never run: the installer registers nothing itself. */
function registerCommands(root) {
  return [
    "Claude Code (and Cursor, which loads the Claude Code plugin):",
    "  claude plugin marketplace add Deploy-Forward/plugins",
    "  claude plugin install convoy@deploy-forward",
    "  claude plugin install worklanes@deploy-forward",
    "Codex:",
    "  codex plugin marketplace add https://github.com/Deploy-Forward/plugins.git",
    "  codex plugin add convoy@deploy-forward",
    "  codex plugin add worklanes@deploy-forward",
    "Grok: add the skills folder to ~/.grok/config.toml (merge into an existing [skills] table):",
    "  [skills]",
    `  paths = ["${posix(join(root, GROK_DIR))}"]`,
    "agy: enable both plugins, then restart agy:",
    "  agy plugin enable convoy",
    "  agy plugin enable worklanes",
  ];
}

function backupFolder(now) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const base = join(homedir(), ".skills-backup");
  let name = stamp;
  for (let n = 2; existsSync(join(base, name)); n++) name = `${stamp}-${n}`;
  return join(base, name);
}

/** Moves every file about to be replaced into <home>/.skills-backup/<ts>/obj/<n>. The manifest lists every move as
 * pending before the first rename and marks each done after it, so an interrupted run still names what moved. */
function backUp(replacing, root, now) {
  const backup = backupFolder(now);
  mkdirSync(join(backup, "obj"), { recursive: true });
  const manifestPath = join(backup, "manifest.json");
  const manifest = {
    createdAt: now.toISOString(), root, checkout: CHECKOUT,
    entries: replacing.map((p, i) => ({
      n: i + 1, state: "pending", path: p.abs, object: `obj/${i + 1}`, lfhash: lf12(readFileSync(p.abs)),
    })),
  };
  const save = () => writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  save();
  const failAfter = Number(process.env.DF_PLUGINS_INSTALL_FAIL_AFTER_RENAMES || 0); // test seam: simulate a crash
  try {
    for (const entry of manifest.entries) {
      renameSync(entry.path, join(backup, entry.object));
      entry.state = "done";
      save();
      if (failAfter && entry.n >= failAfter) throw new Error("injected failure after a rename");
    }
  } catch (e) {
    throw new InstallError(`${e.message}; the files moved so far are listed as done in ${manifestPath}`);
  }
  return backup;
}

function tracked(path) {
  const out = spawnSync("git", ["-C", dirname(path), "ls-files", "--error-unmatch", "--", parse(path).base], {
    encoding: "utf8", windowsHide: true, timeout: 30000,
  });
  return out.status === 0;
}

/** Convoy, Worklanes and neuron skill or rule files: <name>/SKILL.md or <name>.md / <name>.mdc. */
function discovered(folder) {
  const named = (n) => /^(convoy|worklanes|neuron)(-|$)/i.test(n);
  const files = [];
  const visit = (abs) => {
    for (const d of readdirSync(abs, { withFileTypes: true })) {
      const path = join(abs, d.name);
      if (d.isDirectory()) {
        if (d.name !== ".git" && d.name !== "node_modules") visit(path);
      } else if (d.isFile()) {
        if (d.name === "SKILL.md" ? named(parse(abs).base) : /\.mdc?$/i.test(d.name) && named(parse(d.name).name)) files.push(path);
      }
    }
  };
  if (!existsSync(folder) || !statSync(folder).isDirectory()) throw new InstallError(`--scan ${folder} is not a folder`);
  visit(folder);
  return files.sort();
}

function check({ scans, legacy }, log) {
  const canon = new Set();
  for (const folder of ["convoy/skills", "worklanes/skills", "agents/skills", "agy/plugins"]) {
    for (const p of walk(join(PLUGIN_DIR, folder))) if (/\.md$/.test(p)) canon.add(lf12(readFileSync(p)));
  }
  const known = new Map();
  for (const e of JSON.parse(readFileSync(join(PLUGIN_DIR, "legacy-hashes.json"), "utf8")).entries) known.set(e.hash, e.provenance);
  for (const file of legacy) {
    for (const row of lf(readFileSync(file, "utf8")).split("\n")) {
      const [hash, , provenance] = row.split("\t");
      if (/^[0-9a-f]{12}$/.test(hash ?? "") && provenance && !known.has(hash)) known.set(hash, provenance);
    }
  }
  const counts = { TRACKED: 0, CANON: 0, LEGACY: 0, UNKNOWN: 0 };
  log("Worklanes and Convoy skills: check (read-only; nothing is moved or written)");
  log(`checkout  ${CHECKOUT}`);
  log();
  for (const folder of scans) {
    for (const path of discovered(folder)) {
      const hash = lf12(readFileSync(path));
      const label = tracked(path) ? "TRACKED" : canon.has(hash) ? "CANON" : known.has(hash) ? "LEGACY" : "UNKNOWN";
      counts[label]++;
      log(`${label.padEnd(8)} ${hash}  ${path}${label === "LEGACY" ? `  ${known.get(hash)}` : ""}`);
    }
  }
  log();
  log(`Found: ${counts.TRACKED} tracked, ${counts.CANON} canonical, ${counts.LEGACY} legacy, ${counts.UNKNOWN} unknown.`);
  log("TRACKED files belong to their repository. UNKNOWN files match no release of this repository; leave them alone.");
  return 0;
}

function main(argv) {
  const args = parseArgs(argv);
  const log = (line = "") => process.stdout.write(`${line}\n`);
  if (args.help) {
    log(USAGE);
    return 0;
  }
  if (args.mode === "check") return check(args, log);
  const { mode, root } = args;
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new InstallError(`the root ${root} is not a folder`);
  const plan = targets(root).map((t) => ({ ...t, abs: join(root, t.rel), status: statusOf(root, t) }));
  const count = (status) => plan.filter((p) => p.status === status).length;
  const summary = `${count("create")} to create and ${count("replace")} to replace (each moved to the backup first), ${count("same")} already installed. Nothing is deleted.`;
  const footer = () => {
    log();
    log("This installer never touches <root>/.claude-plugin. It registers nothing; run these yourself:");
    for (const line of registerCommands(root)) log(`  ${line}`);
  };

  log(
    mode === "apply"
      ? "Worklanes and Convoy for Grok and agy: install"
      : "Worklanes and Convoy for Grok and agy: install plan (dry run: nothing is written; pass --apply to install)",
  );
  log(`checkout  ${CHECKOUT}`);
  log(`root      ${root}`);
  log();

  if (mode === "dry-run") {
    const backup = join(homedir(), ".skills-backup", "<UTC timestamp>");
    for (const p of plan) {
      if (p.status === "create") log(`create   ${p.abs}  from ${p.from}`);
      if (p.status === "replace") log(`replace  ${p.abs}  from ${p.from}; the file there now moves into ${backup}`);
      if (p.status === "same") log(`same     ${p.abs}  already holds ${p.from}`);
    }
    log();
    log(`Plan: ${summary}`);
    footer();
    return 0;
  }

  if (count("same") === plan.length) {
    for (const p of plan) log(`same     ${p.abs}`);
    log();
    log(`Plan: ${summary}`);
    log("Nothing to change.");
    footer();
    return 0;
  }

  const replacing = plan.filter((q) => q.status === "replace");
  const backup = replacing.length ? backUp(replacing, root, new Date()) : null;
  for (const p of plan.filter((q) => q.status !== "same")) {
    mkdirSync(dirname(p.abs), { recursive: true });
    writeFileSync(p.abs, p.content, "utf8");
  }
  for (const p of plan) {
    if (p.status === "create") log(`created  ${p.abs}  from ${p.from}`);
    if (p.status === "replace") log(`replaced ${p.abs}  from ${p.from}`);
    if (p.status === "same") log(`same     ${p.abs}`);
  }
  log();
  log(`Plan: ${summary}`);
  log(backup ? `Done. The old copy of each file replaced is in ${backup}, listed in its manifest.json.` : "Done. Nothing was replaced.");
  footer();
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  if (e instanceof UsageError) {
    process.stderr.write(`${e.message}\n${USAGE}\n`);
    process.exitCode = 2;
  } else if (e instanceof InstallError) {
    process.stderr.write(`refused: ${e.message}\n`);
    process.exitCode = 1;
  } else {
    process.stderr.write(`${e && e.stack ? e.stack : e}\n`);
    process.exitCode = 1;
  }
}
