import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join, parse } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const json = path => JSON.parse(read(path));
const run = args => spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30000 });

test('marketplaces point to existing local plugins, omit version pins, use product identity', () => {
  const claude = json('.claude-plugin/marketplace.json');
  const agents = json('.agents/plugins/marketplace.json');
  assert.equal(claude.owner.name, 'Deploy Forward');
  assert.deepEqual(claude.plugins.map(p => p.name).sort(), ['convoy', 'worklanes']);
  assert.deepEqual(agents.plugins.map(p => p.name).sort(), ['convoy', 'worklanes']);
  for (const entry of claude.plugins) {
    assert.equal(entry.source, `./${entry.name}`);
    assert.equal(entry.version, undefined);
    assert.ok(existsSync(resolve(root, entry.source, '.claude-plugin/plugin.json')));
  }
  for (const entry of agents.plugins) {
    assert.deepEqual(entry.source, { source: 'local', path: `./${entry.name}` });
    assert.equal(entry.version, undefined);
    assert.ok(existsSync(resolve(root, entry.source.path, '.codex-plugin/plugin.json')));
  }
});

test('both harness manifests agree on release versions and product author', () => {
  assert.match(read('LICENSE'), /^MIT License\r?\n/);
  assert.match(read('LICENSE'), /Copyright \(c\) 2026 Deploy Forward/);
  for (const [plugin, version] of [['convoy', '1.0.8'], ['worklanes', '0.5.4']]) {
    for (const harness of ['claude', 'codex']) {
      const manifest = json(`${plugin}/.${harness}-plugin/plugin.json`);
      assert.equal(manifest.name, plugin);
      assert.equal(manifest.version, version);
      assert.equal(manifest.author.name, 'Deploy Forward');
      assert.equal(manifest.author.email, undefined);
      assert.equal(manifest.license, 'MIT');
      if (plugin === 'worklanes') assert.equal(manifest.repository, 'https://github.com/Deploy-Forward/plugins');
      if (harness === 'codex') {
        assert.equal(manifest.skills, './skills/');
        assert.equal(manifest.interface.developerName, 'Deploy Forward');
        if (plugin === 'convoy') assert.ok(manifest.interface.longDescription.includes('pip install git+https://github.com/Deploy-Forward/convoy@v1.3.1'));
      }
    }
  }
});

test('all harness renders exactly match their canonical sources', () => {
  const result = run(['scripts/render-skills.mjs', '--check']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /21 canonical skills; 46 rendered files; 0 failures/);
});

test('MCP sources retain loopback Convoy and hosted Worklanes boundaries', () => {
  const convoy = json('convoy/.mcp.json');
  const worklanes = json('worklanes/.mcp.json');
  assert.match(JSON.stringify(convoy), /http:\/\/127\.0\.0\.1:8788\/mcp/);
  assert.match(JSON.stringify(worklanes), /https:\/\/app\.deployforward\.dev\/api\/mcp/);
});

test('retired render targets are gone: no grok rules, cursor rules or codex index', () => {
  for (const folder of ['grok', 'cursor', 'codex']) assert.equal(existsSync(resolve(root, folder)), false, `${folder}/ still exists`);
});

test('agy plugins mirror each plugin: manifest fields, MCP servers by `url` only, skills byte-identical to the agents render', () => {
  for (const plugin of ['convoy', 'worklanes']) {
    const claude = json(`${plugin}/.claude-plugin/plugin.json`);
    assert.deepEqual(json(`agy/plugins/${plugin}/plugin.json`), {
      author: claude.author.name, description: claude.description, name: plugin, version: claude.version,
    });
    const servers = json(`${plugin}/.mcp.json`).mcpServers;
    const agy = json(`agy/plugins/${plugin}/mcp_config.json`).mcpServers;
    assert.deepEqual(Object.keys(agy).sort(), Object.keys(servers).sort());
    for (const [name, server] of Object.entries(servers)) assert.deepEqual(agy[name], { url: server.url });
    const names = readdirSync(resolve(root, plugin, 'skills')).sort();
    assert.deepEqual(readdirSync(resolve(root, 'agy/plugins', plugin, 'skills')).sort(), names);
    for (const name of names) assert.equal(read(`agy/plugins/${plugin}/skills/${name}/SKILL.md`), read(`agents/skills/${name}/SKILL.md`));
  }
});

const liveNeuron = /\bn(?!000000\b)[0-9a-f]{6}\b/i;
const liveThread = /\bcvy_[A-Za-z0-9_-]{16,}\b/;
test('identifier privacy patterns distinguish examples from native ids', () => {
  assert.equal(liveNeuron.test('n000000'), false);
  assert.equal(liveNeuron.test('n' + '123abc'), true);
  assert.equal(liveThread.test('cvy_'), false);
  assert.equal(liveThread.test('cvy_' + 'a'.repeat(22)), true);
});

test('distributed content has no personal paths, live identifiers or credential patterns', () => {
  const scan = folder => readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === '.git' || entry.name === 'node_modules') return [];
    const path = join(folder, entry.name);
    return entry.isDirectory() ? scan(path) : [path];
  });
  const forbidden = [
    liveNeuron,
    liveThread,
    /C:[/\\]Users[/\\][^\s<>]+/i,
    /[a-f0-9]{32}/i,
    /(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{16,}/,
    /sk-[A-Za-z0-9_-]{16,}/,
    /Bearer\s+[A-Za-z0-9_.-]{16,}/,
    /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,
  ];
  for (const path of scan(root)) {
    if (path.endsWith('.png') || path.endsWith('plugins.test.mjs')) continue;
    const contents = readFileSync(path, 'utf8');
    for (const pattern of forbidden) assert.equal(pattern.test(contents), false, `privacy pattern ${pattern} in ${path}`);
  }
});
