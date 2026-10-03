import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const plugins = ['convoy', 'worklanes'];
const digest = entries => createHash('sha256').update(JSON.stringify(entries.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))).digest('base64url');
const blobId = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
function git(root, args) {
  const out = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  if (out.status !== 0) throw new Error(`Git history required: ${out.stderr || out.error || args.join(' ')}`);
  return out.stdout;
}

export function snapshot(root, plugin) {
  const entries = [];
  function walk(folder) {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = resolve(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else {
        if (!entry.isFile()) throw new Error(`unsupported plugin entry: ${path}`);
        const name = relative(resolve(root, plugin), path).replaceAll('\\', '/');
        const raw = readFileSync(path);
        const bytes = name.endsWith('.png') ? raw : Buffer.from(raw.toString('utf8').replaceAll('\r\n', '\n'));
        entries.push([name, blobId(bytes)]);
      }
    }
  }
  walk(resolve(root, plugin));
  const claude = JSON.parse(readFileSync(resolve(root, plugin, '.claude-plugin/plugin.json'), 'utf8')).version;
  const codex = JSON.parse(readFileSync(resolve(root, plugin, '.codex-plugin/plugin.json'), 'utf8')).version;
  if (claude !== codex) throw new Error(`${plugin}: manifest versions disagree`);
  return { version: claude, hash: digest(entries) };
}

export function snapshotAt(root, ref, plugin) {
  const entries = git(root, ['ls-tree', '-rz', ref, '--', plugin]).split('\0').filter(Boolean).map(row => {
    const match = /^\d+ blob ([0-9a-f]+)\t(.+)$/.exec(row);
    if (!match) throw new Error(`unsupported Git plugin entry: ${row}`);
    return [match[2].slice(plugin.length + 1), match[1]];
  });
  const manifest = JSON.parse(git(root, ['show', `${ref}:${plugin}/.claude-plugin/plugin.json`]));
  return { version: manifest.version, hash: digest(entries) };
}

export function requireBump(plugin, current, baseline) {
  if (current.hash !== baseline.hash && current.version === baseline.version) {
    throw new Error(`${plugin}: content changed without a version bump (${current.version})`);
  }
}

export function check(root, lock) {
  if (lock.schema !== 1 || lock.algorithm !== 'sha256-git-blobs-base64url') throw new Error('unsupported versions.lock');
  const refs = ['HEAD'];
  const parents = git(root, ['rev-list', '--parents', '-n', '1', 'HEAD']).trim().split(/\s+/).slice(1);
  refs.push(...parents); // Includes each parent of a merge; cannot hide an unchanged version by refreshing the lock.
  for (const plugin of plugins) {
    const current = snapshot(root, plugin);
    const recorded = lock.plugins[plugin];
    if (!recorded || current.version !== recorded.version || current.hash !== recorded.hash) {
      throw new Error(`${plugin}: versions.lock is stale; bump the version before regenerating it`);
    }
    for (const ref of refs) requireBump(plugin, current, snapshotAt(root, ref, plugin));
  }
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  try {
    if (process.argv[2] === '--write') {
      const lock = { schema: 1, algorithm: 'sha256-git-blobs-base64url', plugins: Object.fromEntries(plugins.map(plugin => [plugin, snapshot(root, plugin)])) };
      check(root, lock);
      writeFileSync(resolve(root, 'versions.lock'), JSON.stringify(lock, null, 2) + '\n');
    } else {
      check(root, JSON.parse(readFileSync(resolve(root, 'versions.lock'), 'utf8')));
    }
    console.log('plugin content/version lock OK');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
