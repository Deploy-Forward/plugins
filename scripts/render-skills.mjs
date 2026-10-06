import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Renders every canonical skill twice:
//   agents/skills/<name>/SKILL.md                 the byte source for the Grok copies install.mjs writes
//   agy/plugins/<plugin>/skills/<name>/SKILL.md   the same bytes, inside the plugin layout agy's own import produces,
//                                                 beside its plugin.json and mcp_config.json
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const plugins = ['worklanes', 'convoy'];
const retired = ['grok', 'cursor', 'codex'];
const rendered = new Map();
const json = value => JSON.stringify(value, null, 2) + '\n';
let count = 0;
for (const plugin of plugins) {
  const manifest = JSON.parse(readFileSync(resolve(root, plugin, '.claude-plugin/plugin.json'), 'utf8'));
  rendered.set(`agy/plugins/${plugin}/plugin.json`, json({
    author: manifest.author.name, description: manifest.description, name: manifest.name, version: manifest.version,
  }));
  // agy documents `url` for a remote server and accepts `serverUrl` as the legacy key, but agy 1.3.0's
  // `agy plugin validate` requires `serverUrl` (or `command`): write both, with the same value.
  const servers = JSON.parse(readFileSync(resolve(root, plugin, '.mcp.json'), 'utf8')).mcpServers;
  const agyServers = {};
  for (const [name, server] of Object.entries(servers)) {
    if (!server.url) throw new Error(`${plugin}/.mcp.json: ${name} has no url; only remote servers are rendered for agy`);
    agyServers[name] = { url: server.url, serverUrl: server.url };
  }
  rendered.set(`agy/plugins/${plugin}/mcp_config.json`, json({ mcpServers: agyServers }));
  const names = readdirSync(resolve(root, plugin, 'skills')).sort();
  for (const name of names) {
    const source = `${plugin}/skills/${name}/SKILL.md`;
    const raw = readFileSync(resolve(root, source), 'utf8').replace(/\r\n/g, '\n');
    const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
    if (!match) throw new Error(`${source}: missing frontmatter`);
    const actual = /^name: (.+)$/m.exec(match[1])?.[1];
    const description = /^description: (.+)$/m.exec(match[1])?.[1];
    if (actual !== name || !description) throw new Error(`${source}: invalid name/description`);
    const body = match[2].trim() + '\n';
    const marker = `<!-- Rendered by scripts/render-skills.mjs from ${source}. Do not edit this copy. -->`;
    const text = `---\nname: ${name}\ndescription: ${description}\n---\n${marker}\n\n${body}`;
    rendered.set(`agents/skills/${name}/SKILL.md`, text);
    rendered.set(`agy/plugins/${plugin}/skills/${name}/SKILL.md`, text);
    count++;
  }
}
function files(folder) {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(folder, entry.name);
    return entry.isDirectory() ? files(path) : [relative(root, path).replaceAll('\\', '/')];
  });
}
const check = process.argv.includes('--check');
let failures = 0;
for (const [path, expected] of rendered) {
  if (check) {
    let actual;
    try { actual = readFileSync(resolve(root, path), 'utf8'); } catch { actual = null; }
    if (actual !== expected) { console.error(`drift: ${path}`); failures++; }
  } else {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    writeFileSync(resolve(root, path), expected);
  }
}
for (const folder of ['agents', 'agy']) {
  for (const path of files(resolve(root, folder))) {
    if (!rendered.has(path)) { console.error(`unexpected render: ${path}`); failures++; }
  }
}
for (const folder of retired) {
  if (existsSync(resolve(root, folder))) { console.error(`retired render target present: ${folder}/`); failures++; }
}
console.log(`${count} canonical skills; ${rendered.size} rendered files; ${failures} failures`);
process.exitCode = failures ? 1 : 0;
