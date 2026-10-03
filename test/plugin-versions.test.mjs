import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { check, snapshot, snapshotAt, requireBump } from '../scripts/plugin-versions.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));

test('released plugin content and versions match the lock and Git baseline', () => {
  check(root, JSON.parse(readFileSync(resolve(root, 'versions.lock'), 'utf8')));
});

test('changed content at an unchanged version fails even with a regenerated lock', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'plugin-version-test-'));
  cpSync(resolve(root, 'convoy'), resolve(sandbox, 'convoy'), { recursive: true });
  const baseline = snapshot(sandbox, 'convoy');
  const path = resolve(sandbox, 'convoy/README.md');
  writeFileSync(path, readFileSync(path, 'utf8') + '\nChanged example.\n');
  const regenerated = snapshot(sandbox, 'convoy');
  assert.notEqual(regenerated.hash, baseline.hash);
  assert.throws(() => requireBump('convoy', regenerated, baseline), /without a version bump/);
  assert.doesNotThrow(() => requireBump('convoy', { ...regenerated, version: '2.0.0' }, baseline));
});

test('Git history rejects committed lock refreshes without a bump and accepts bumped content', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'plugin-version-history-'));
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: sandbox, encoding: 'utf8', windowsHide: true,
      env: { ...process.env, GIT_AUTHOR_NAME: 'Example', GIT_COMMITTER_NAME: 'Example',
        GIT_AUTHOR_EMAIL: 'example@example.invalid', GIT_COMMITTER_EMAIL: 'example@example.invalid' } });
    assert.equal(result.status, 0, result.stderr);
  };
  const lock = () => ({ schema: 1, algorithm: 'sha256-git-blobs-base64url',
    plugins: Object.fromEntries(['convoy', 'worklanes'].map(p => [p, snapshot(sandbox, p)])) });
  const manifests = version => {
    for (const plugin of ['convoy', 'worklanes']) for (const rail of ['claude', 'codex']) {
      const folder = resolve(sandbox, plugin, `.${rail}-plugin`);
      mkdirSync(folder, { recursive: true });
      writeFileSync(resolve(folder, 'plugin.json'), JSON.stringify({ version }) + '\n');
    }
  };
  const commit = () => { git('add', '.'); git('-c', 'core.hooksPath=', 'commit', '-m', 'Synthetic fixture'); };
  git('init');
  manifests('1.0.0');
  commit();
  check(sandbox, lock());
  assert.deepEqual(snapshot(sandbox, 'convoy'), snapshotAt(sandbox, 'HEAD', 'convoy'));
  writeFileSync(resolve(sandbox, 'convoy/README.md'), 'Changed content.\n');
  assert.throws(() => check(sandbox, lock()), /without a version bump/);
  writeFileSync(resolve(sandbox, 'versions.lock'), JSON.stringify(lock()));
  commit();
  assert.throws(() => check(sandbox, lock()), /without a version bump/);
  manifests('1.0.1');
  check(sandbox, lock());
  commit();
  check(sandbox, lock());
});
