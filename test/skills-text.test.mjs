import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8').replaceAll('\r\n', '\n');
const skill = name => read(`convoy/skills/${name}/SKILL.md`);
const flat = text => text.replace(/\s+/g, ' ');
const files = folder => !existsSync(folder) ? [] : readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
  if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'test') return [];
  const path = join(folder, entry.name);
  return entry.isDirectory() ? files(path) : [path];
});

// The one sentence every skill uses for how Grok receives and wakes.
const GROK_WAKE = 'During a turn, its inbox hook delivers the send at tool time. When it is idle, only a background waiter it armed before ending the turn wakes it (convoy-listen).';

test('no skill or doc offers a python -m convoy fallback: one script, convoy', () => {
  for (const path of files(root)) {
    if (!/\.(md|json|mjs)$/.test(path)) continue;
    const text = readFileSync(path, 'utf8');
    assert.equal(/python -m convoy(?![.\w])/.test(text), false, `python -m convoy fallback in ${path}`);
  }
});

test('the Grok wake sentence is the same in the dictionary, convoy-operate and convoy-send', () => {
  for (const name of ['convoy-dictionary', 'convoy-operate', 'convoy-send']) {
    assert.ok(flat(skill(name)).includes(GROK_WAKE), `${name} lacks the Grok wake sentence`);
  }
  assert.equal(/\| claude, grok \|/.test(skill('convoy-dictionary')), false, 'claude and grok still share one wake row');
  const row = skill('convoy-operate').split('\n').find(l => l.startsWith('| Grok |')) ?? '';
  assert.ok(row.includes(GROK_WAKE), row);
});

test('convoy-whoami lists every via value as corroboration and defines conflict as the cwd being in another thread', () => {
  const text = flat(skill('convoy-whoami'));
  for (const via of ['environment', 'token', 'pane-host', 'worktree', 'cwd', 'conflict']) assert.ok(text.includes(`\`${via}\``), via);
  assert.ok(text.includes('corroboration, not a ladder'));
  assert.ok(text.includes('`via: conflict`'));
  assert.ok(/`conflict`: true when your current folder belongs to another thread/.test(text));
  assert.equal(text.includes('two proofs disagree'), false);
});

test('convoy-whoami relaxes conflict only for environment or token proof, and allows via null', () => {
  const text = flat(skill('convoy-whoami'));
  assert.ok(text.includes('with an explicit `--root` and proof by `environment` or `token`, `whoami` reports `cwd_thread_differs` instead and `conflict` is false'));
  assert.equal(text.includes('with an explicit `--root` and a strong proof'), false);
  assert.ok(text.includes('`pane-host` is strong only for receipts'));
  assert.ok(text.includes('or null when no chair matches'));
});

test('the dictionary does not call pane-host a strong proof', () => {
  const text = flat(skill('convoy-dictionary'));
  assert.equal(text.includes('`environment`, `token` and `pane-host` are strong'), false);
  assert.ok(text.includes('`environment` and `token` are strong; `pane-host` is strong only for receipts; `cwd` alone is weak'));
});

test('convoy-operate describes identity proofs as corroboration, not a ladder', () => {
  const text = flat(skill('convoy-operate'));
  assert.equal(text.includes('before the resume id on your command line'), false);
  assert.ok(text.includes('corroboration, not a ladder'));
});

test('convoy-start says --create makes a private GitHub repository', () => {
  assert.ok(flat(skill('convoy-start')).includes('`--create` creates a private GitHub repository (`gh repo create <user>/<name> --private`)'));
});

test('the dictionary says end your task, never end your turn', () => {
  assert.equal(/end your turn/i.test(skill('convoy-dictionary')), false);
  assert.ok(skill('convoy-dictionary').includes('| end your task and hand off |'));
});

test('convoy-add names launch --seat as the only retry and drops the stale bring-up clause', () => {
  const text = flat(skill('convoy-add'));
  assert.equal(text.includes('bring-up --seat'), false);
  assert.ok(text.includes('`launch --seat <sessionId>`'));
});

test('convoy-listen matches the shipped hooks: Codex drains on PostToolUse, an attached session drains by hand', () => {
  const text = flat(skill('convoy-listen'));
  assert.equal(text.includes('Codex, cursor-agent, agy, hermes and pi have no draining hook'), false);
  assert.ok(text.includes('Codex drains it after each tool call through the plugin\'s PostToolUse hook'));
  assert.ok(text.includes('`convoy attach` installs no hooks'));
  assert.ok(text.includes('no wake route'));
});

test('convoy-send names the proofs a reply needs, attach only off the thread, and that wake-enabled roots hold wakes on Convoy up to 1.3.1', () => {
  const text = flat(skill('convoy-send'));
  assert.equal(text.includes('Attach to the thread before you send'), false);
  assert.ok(text.includes('Send from a session `whoami` proves on the thread by `environment`, `token`, `pane-host` or `worktree`.'));
  assert.ok(text.includes("A proof by `cwd` alone, or no chair at all, leaves the send with no sender, and the receiver's `convoy reply` refuses."));
  assert.ok(text.includes("A session that is not on the thread attaches first (`convoy-attach`); that needs your harness's own session id."));
  assert.ok(text.includes('An MCP send is signed by your conductor bearer.'));
  assert.ok(text.includes('no wake route'));
});

test('install guidance: marketplace for Claude Code, Codex and Cursor; install.mjs for Grok and agy', () => {
  const dictionary = flat(skill('convoy-dictionary'));
  assert.ok(dictionary.includes('`node install.mjs --apply` (Grok and agy)'));
  assert.equal(/install\.mjs --apply` \(Grok, Cursor/.test(dictionary), false);
  const readme = flat(read('README.md'));
  assert.ok(readme.includes('Convoy 1.0.8 and Worklanes 0.5.4'));
  for (const row of ['| Claude Code |', '| Codex |', '| Cursor |', '| Grok |', '| agy |']) assert.ok(readme.includes(row), row);
  const connect = read('worklanes/skills/worklanes-connect/SKILL.md');
  assert.ok(/^\| Cursor \|/m.test(connect));
  assert.ok(/^\| agy \|/m.test(connect));
});

// The first-run paragraph of the Convoy 1.3.1 README (Supported neurons), word for word.
const CONVOY_131_FIRST_RUN = `Where a first run writes: in a worktree Convoy minted (\`.convoy/minted.json\`,
written by \`crew\` / \`mint\` when they create it, naming that worktree and its
checkout) every file in the table goes in. Anywhere else, often your own repo, a
launch and \`skills\` write only the Convoy-named files git excludes
(\`.claude/settings.local.json\`, the \`convoy-root\` pointers,
\`.grok/hooks/convoy-inbox.json\`). \`AGENTS.md\` is written there
only after an opt-in: \`--write-repo-files\` on the CLI, \`write_repo_files: true\`
on MCP \`bring_up\` / \`open\` / \`launch\` / \`crew\` behind the write gate (never on a
dry run: a dry \`bring-up\` / \`open\` / \`relaunch\` on the CLI, or a dry MCP
\`bring_up\` / \`open\`, refuses it and writes nothing). The opt-in is kept, bound to that folder and kept out
of git, in \`.convoy/repo-files.json\`, so later launches there refresh them.
Withdraw it with \`convoy --root <root> skills --worktree <worktree>
--no-write-repo-files\`; the files already written stay, and are yours to keep or
delete. Until
then the card lists what is missing on disk as \`would_write\`, and a Codex seat
without Convoy's hook cannot receive; the note names the route that works where
it is read. A \`.claude/settings.local.json\` that git tracks is never written.
The card names each home trust store a launch wrote (\`trust_stores_written\`).
\`start\` and \`onboard\` write nothing outside \`.convoy/\` without the flag;
\`terminals\` writes nothing.`;

test('convoy-operate quotes the Convoy 1.3.1 first-run policy word for word', () => {
  const text = flat(skill('convoy-operate'));
  assert.ok(text.includes(flat(CONVOY_131_FIRST_RUN)), 'convoy-operate does not quote the Convoy 1.3.1 README first-run paragraph');
  for (const stale of ['convoy-end copies', 'the grok agent', '`AGENTS.md` and `.codex/hooks.json` are written']) {
    assert.equal(text.includes(stale), false, stale);
  }
  assert.ok(text.includes("No launch writes `.codex/hooks.json`: Codex runs Convoy's hooks from the convoy plugin (`convoy/codex-hooks.json`)."));
  assert.ok(text.includes('Convoy 1.3.1 writes no skill copies and deletes nothing, so copies an older Convoy left stay until the person removes them.'));
  assert.ok(text.includes('the hooks and pointers Convoy installs, any skill copies an older Convoy left, and the Convoy block in `AGENTS.md`'));
  assert.equal(text.includes('the skills and hooks under `.claude/`'), false);
});

test('the plugins are paired with the Convoy CLI 1.3.1: every install line and pairing names v1.3.1', () => {
  const stale = [/convoy@v1\.3\.0/, /CLI v?1\.3\.0/, /Convoy 1\.3\.0 registers no wake route/];
  for (const path of files(root)) {
    if (!/\.(md|json|mjs)$/.test(path) || path.endsWith('legacy-hashes.json')) continue;
    const text = readFileSync(path, 'utf8');
    for (const pattern of stale) assert.equal(pattern.test(text), false, `${pattern} in ${path}`);
  }
  const install = 'git+https://github.com/Deploy-Forward/convoy@v1.3.1';
  assert.ok(flat(read('README.md')).includes('Convoy 1.0.8 is written for the Convoy CLI v1.3.1.'));
  assert.ok(flat(read('README.md')).includes('the Convoy CLI v1.3.1, and its loopback MCP'));
  assert.ok(read('convoy/README.md').includes('(plugin 1.0.8, for the Convoy CLI 1.3.1)'));
  assert.ok(read('convoy/README.md').includes(`python -m pip install "${install}"`));
  assert.ok(skill('convoy-dictionary').includes(`python -m pip install "${install}"`));
  const codex = JSON.parse(read('convoy/.codex-plugin/plugin.json'));
  assert.ok(codex.interface.longDescription.includes(`pip install ${install}`));
  for (const name of ['convoy-listen', 'convoy-send']) assert.ok(flat(skill(name)).includes('Convoy up to 1.3.1 registers no wake route'), name);
});
