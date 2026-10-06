// Writes legacy-hashes.json: every skill or rule text this repository has shipped and since superseded, each with the
// commit and path it came from. install.mjs --check reads it to label an installed copy LEGACY. Run with --check to
// fail when the committed file is stale.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = resolve(root, 'legacy-hashes.json');
// Every folder a skill or rule text was ever shipped from.
const PATHS = ['convoy/skills', 'worklanes/skills', 'agents/skills', 'agy/plugins', 'cursor/rules', 'grok/rules', 'codex/AGENTS.md'];
const TEXT = /(\/SKILL\.md|\.mdc|\.md)$/;

export const lf12 = bytes => createHash('sha256').update(Buffer.from(bytes).toString('utf8').replaceAll('\r', '')).digest('hex').slice(0, 12);

function git(args, encoding = 'utf8') {
  const out = spawnSync('git', args, { cwd: root, encoding, windowsHide: true, timeout: 60000, maxBuffer: 1 << 28 });
  if (out.status !== 0) throw new Error(`Git history required: git ${args.join(' ')}: ${out.stderr}`);
  return out.stdout;
}

/** The LF hashes of the texts this checkout ships now. */
export function canonHashes(base = root) {
  const hashes = new Set();
  const walk = folder => existsSync(folder) ? readdirSync(folder, { withFileTypes: true }).forEach(entry => {
    const path = resolve(folder, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (TEXT.test(relative(base, path).replaceAll('\\', '/'))) hashes.add(lf12(readFileSync(path)));
  }) : undefined;
  for (const folder of ['convoy/skills', 'worklanes/skills', 'agents/skills', 'agy/plugins']) walk(resolve(base, folder));
  return hashes;
}

/** Oldest provenance first; a hash keeps the first commit and path that shipped it. */
export function generate() {
  const canon = canonHashes();
  const commits = git(['log', '--reverse', '--format=%H', 'HEAD', '--', ...PATHS]).split('\n').filter(Boolean);
  const seen = new Map();
  const blobs = new Map();
  for (const commit of commits) {
    for (const row of git(['ls-tree', '-r', '-z', commit, '--', ...PATHS]).split('\0').filter(Boolean)) {
      const match = /^\d+ blob ([0-9a-f]+)\t(.+)$/.exec(row);
      if (!match || !TEXT.test(match[2])) continue;
      const [, blob, path] = match;
      if (!blobs.has(blob)) blobs.set(blob, lf12(git(['cat-file', 'blob', blob], 'buffer')));
      const hash = blobs.get(blob);
      if (!canon.has(hash) && !seen.has(hash)) seen.set(hash, `${commit.slice(0, 12)}:${path}`);
    }
  }
  const entries = [...seen].map(([hash, provenance]) => ({ hash, provenance })).sort((a, b) => a.hash < b.hash ? -1 : 1);
  return { schema: 1, hash: 'sha256 of the text with every CR removed, first 12 hex digits', entries };
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  try {
    const expected = JSON.stringify(generate(), null, 2) + '\n';
    if (process.argv.includes('--check')) {
      const actual = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;
      if (actual !== expected) throw new Error('legacy-hashes.json is stale: run node scripts/legacy-hashes.mjs');
      console.log('legacy-hashes.json OK');
    } else {
      writeFileSync(OUT, expected);
      console.log(`legacy-hashes.json: ${JSON.parse(expected).entries.length} entries`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
