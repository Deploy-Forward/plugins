import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, statSync, symlinkSync } from 'node:fs';
import { resolve, dirname, join, parse, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const lf12 = text => createHash('sha256').update(text.replaceAll('\r', '')).digest('hex').slice(0, 12);
const sandbox = prefix => mkdtempSync(join(tmpdir(), prefix));
const install = (args, home, extraEnv = {}) => spawnSync(process.execPath, ['install.mjs', ...args], {
  cwd: root, encoding: 'utf8', windowsHide: true, timeout: 60000,
  env: { ...process.env, HOME: home, USERPROFILE: home, ...extraEnv },
});
const tree = folder => existsSync(folder) ? readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
  const path = join(folder, entry.name);
  return entry.isDirectory() ? tree(path) : [relative(folder, path).replaceAll('\\', '/')];
}) : [];
const snapshot = folder => tree(folder).map(p => `${p} ${statSync(join(folder, p)).mtimeMs} ${readFileSync(join(folder, p)).length}`).sort();
const skillNames = () => readdirSync(resolve(root, 'agents', 'skills')).sort();
const agyFiles = () => tree(resolve(root, 'agy', 'plugins'));
const git = (cwd, ...args) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, GIT_AUTHOR_NAME: 'Example', GIT_COMMITTER_NAME: 'Example',
      GIT_AUTHOR_EMAIL: 'example@example.invalid', GIT_COMMITTER_EMAIL: 'example@example.invalid' } });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};

test('dry run writes nothing and prints every registration step', () => {
  const home = sandbox('df-install-dry-');
  const marketplace = join(home, '.claude-plugin', 'marketplace.json');
  mkdirSync(dirname(marketplace), { recursive: true });
  writeFileSync(marketplace, 'sentinel\n');
  const result = install(['--dry-run'], home);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(tree(home), ['.claude-plugin/marketplace.json']);
  for (const line of [
    'claude plugin marketplace add Deploy-Forward/plugins',
    'codex plugin marketplace add https://github.com/Deploy-Forward/plugins.git',
    '[skills]',
    `paths = ["${home.replaceAll('\\', '/')}/.convoy/skills/grok"]`,
    'agy plugin enable convoy',
    'agy plugin enable worklanes',
  ]) assert.ok(result.stdout.includes(line), `missing: ${line}\n${result.stdout}`);
});

test('apply writes the Grok copies and the agy plugins only, and a second apply changes nothing', () => {
  const home = sandbox('df-install-apply-');
  let result = install(['--apply'], home);
  assert.equal(result.status, 0, result.stderr);
  for (const name of skillNames()) {
    assert.equal(readFileSync(join(home, '.convoy/skills/grok', name, 'SKILL.md'), 'utf8'), read(`agents/skills/${name}/SKILL.md`));
  }
  for (const file of agyFiles()) {
    assert.equal(readFileSync(join(home, '.gemini/config/plugins', file), 'utf8'), read(`agy/plugins/${file}`));
  }
  assert.deepEqual(readdirSync(home).sort(), ['.convoy', '.gemini']);
  result = install(['--apply'], home);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Nothing to change/);
  assert.equal(existsSync(join(home, '.skills-backup')), false);
});

test('a replaced file moves to a flat object under the home backup folder, recorded in its manifest', () => {
  const home = sandbox('df-install-replace-');
  const target = join(home, '.convoy/skills/grok/convoy-attach/SKILL.md');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, 'original text\n');
  const result = install(['--apply'], home);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(target, 'utf8'), read('agents/skills/convoy-attach/SKILL.md'));
  const runs = readdirSync(join(home, '.skills-backup'));
  assert.equal(runs.length, 1);
  const run = join(home, '.skills-backup', runs[0]);
  assert.deepEqual(tree(run).sort(), ['manifest.json', 'obj/1']);
  assert.equal(readFileSync(join(run, 'obj/1'), 'utf8'), 'original text\n');
  const manifest = JSON.parse(readFileSync(join(run, 'manifest.json'), 'utf8'));
  assert.equal(manifest.entries.length, 1);
  assert.equal(manifest.entries[0].state, 'done');
  assert.equal(manifest.entries[0].object, 'obj/1');
  assert.equal(resolve(manifest.entries[0].path), resolve(target));
  assert.equal(manifest.entries[0].lfhash, lf12('original text\n'));
});

test('the manifest is written before the first rename: a failure after it still lists the moved file', () => {
  const home = sandbox('df-install-fail-');
  const first = join(home, '.convoy/skills/grok/convoy-add/SKILL.md');
  const second = join(home, '.convoy/skills/grok/convoy-attach/SKILL.md');
  for (const [path, text] of [[first, 'first\n'], [second, 'second\n']]) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }
  const result = install(['--apply'], home, { DF_PLUGINS_INSTALL_FAIL_AFTER_RENAMES: '1' });
  assert.equal(result.status, 1);
  const runs = readdirSync(join(home, '.skills-backup'));
  assert.equal(runs.length, 1);
  const run = join(home, '.skills-backup', runs[0]);
  const manifest = JSON.parse(readFileSync(join(run, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.entries.map(e => [resolve(e.path), e.state]), [[resolve(first), 'done'], [resolve(second), 'pending']]);
  assert.equal(readFileSync(join(run, 'obj/1'), 'utf8'), 'first\n');
  assert.equal(readFileSync(second, 'utf8'), 'second\n');
  assert.ok(result.stderr.includes('manifest.json'), result.stderr);
});

test('installer refuses to write into a harness folder of the home or of the filesystem root', () => {
  const home = sandbox('df-install-guard-');
  for (const folder of ['.claude', '.codex', '.agents', '.grok', '.cursor']) {
    mkdirSync(join(home, folder));
    const result = install(['--apply', '--root', join(home, folder)], home);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /refused: .*harness folder/);
    assert.deepEqual(tree(join(home, folder)), []);
  }
  assert.equal(existsSync(join(home, '.skills-backup')), false);
});

test('installer refuses a root that reaches a harness folder through a junction or symlink', () => {
  const home = sandbox('df-install-link-');
  const elsewhere = sandbox('df-install-link-root-');
  for (const folder of ['.claude', '.codex', '.agents', '.grok', '.cursor']) {
    mkdirSync(join(home, folder));
    const link = join(elsewhere, `to${folder}`);
    symlinkSync(join(home, folder), link, 'junction');
    const result = install(['--apply', '--root', link], home);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /refused: .*harness folder/);
    assert.deepEqual(tree(join(home, folder)), []);
  }
  assert.equal(existsSync(join(home, '.skills-backup')), false);
});

test('blank install root refuses without selecting the system root', () => {
  const result = install(['--apply', '--root='], sandbox('df-install-blank-'));
  assert.equal(result.status, 2);
  assert.match(result.stderr, /empty --root is refused/);
});

test('installer defaults to the user home, dry-run only', () => {
  const home = sandbox('df-install-home-');
  const result = install([], home);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(`root      ${home}`));
  assert.deepEqual(readdirSync(home), []);
});

test('installer refuses a filesystem root before any write', () => {
  const result = install(['--dry-run', '--root', parse(root).root], sandbox('df-install-fsroot-'));
  assert.equal(result.status, 2);
  assert.match(result.stderr, /filesystem root is refused/);
});

test('--check needs --scan and has no default folder', () => {
  const home = sandbox('df-install-check-');
  let result = install(['--check'], home);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--scan/);
  result = install(['--scan', home], home);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--check/);
});

test('--check --scan labels tracked, canonical, legacy and unknown files and writes nothing', () => {
  const home = sandbox('df-install-scan-');
  const repo = join(home, 'repo');
  mkdirSync(repo);
  git(repo, 'init', '-q');
  const put = (rel, text) => { const p = join(repo, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); return p; };
  const legacy = JSON.parse(read('legacy-hashes.json')).entries[0];
  const [commit, ...pathParts] = legacy.provenance.split(':');
  const legacyText = git(root, 'show', `${commit}:${pathParts.join(':')}`);
  put('.claude/skills/convoy-list/SKILL.md', 'committed text\n');
  git(repo, 'add', '.claude/skills/convoy-list/SKILL.md');
  git(repo, '-c', 'core.hooksPath=', 'commit', '-q', '-m', 'fixture');
  const canon = put('.grok/skills/convoy-add/SKILL.md', read('agents/skills/convoy-add/SKILL.md'));
  const old = put('.agents/skills/convoy-send/SKILL.md', legacyText);
  const unknown = put('.cursor/rules/convoy-made-up.mdc', 'not from any release\n');
  const extra = put('.codex/skills/neuron-extra/SKILL.md', 'listed by a local legacy file\n');
  const tsv = join(home, 'extra-legacy.tsv');
  writeFileSync(tsv, `${lf12('listed by a local legacy file\n')}\tlocal\texample:path\n`);
  const before = snapshot(home);
  const result = install(['--check', '--scan', repo, '--legacy', tsv], home);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(snapshot(home), before);
  const line = path => result.stdout.split('\n').find(l => l.includes(path)) ?? '';
  assert.match(line(join(repo, '.claude/skills/convoy-list/SKILL.md')), /^TRACKED /);
  assert.match(line(canon), /^CANON /);
  assert.match(line(old), /^LEGACY /);
  assert.ok(line(old).includes(legacy.provenance));
  assert.match(line(unknown), /^UNKNOWN /);
  assert.match(line(extra), /^LEGACY .*example:path/);
});

test('legacy-hashes.json matches the history of this repository, with provenance on every entry', () => {
  const result = spawnSync(process.execPath, ['scripts/legacy-hashes.mjs', '--check'], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const data = JSON.parse(read('legacy-hashes.json'));
  assert.ok(data.entries.length > 0);
  const canon = new Set(skillNames().map(n => lf12(read(`agents/skills/${n}/SKILL.md`))));
  for (const plugin of ['convoy', 'worklanes']) for (const n of readdirSync(resolve(root, plugin, 'skills'))) canon.add(lf12(read(`${plugin}/skills/${n}/SKILL.md`)));
  for (const entry of data.entries) {
    assert.match(entry.hash, /^[0-9a-f]{12}$/);
    assert.match(entry.provenance, /^[0-9a-f]{12}:.+/);
    assert.equal(canon.has(entry.hash), false, `canonical hash listed as legacy: ${entry.hash}`);
  }
});
