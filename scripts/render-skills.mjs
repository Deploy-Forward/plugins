import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const plugins = ['worklanes', 'convoy'];
const rendered = new Map();
const index = ['# Worklanes and Convoy skills', '', 'Read the whole named skill before acting. Canonical sources live in each plugin’s skills folder.', ''];
let count = 0;
for (const plugin of plugins) {
  index.push(`# ${plugin === 'convoy' ? 'Convoy' : 'Worklanes'}`, '');
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
    rendered.set(`agents/skills/${name}/SKILL.md`, `---\nname: ${name}\ndescription: ${description}\n---\n${marker}\n\n${body}`);
    rendered.set(`grok/rules/${name}.md`, `---\ndescription: ${description}\n---\n${marker}\n\n${body}`);
    rendered.set(`cursor/rules/${name}.mdc`, `---\ndescription: ${description}\nalwaysApply: false\n---\n${marker}\n\n${body}`);
    index.push(`## ${name}`, '', description, '');
    count++;
  }
}
rendered.set('codex/AGENTS.md', index.join('\n'));
function files(folder) {
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
for (const folder of ['agents', 'cursor', 'grok', 'codex']) {
  for (const path of files(resolve(root, folder))) {
    if (!rendered.has(path)) { console.error(`unexpected render: ${path}`); failures++; }
  }
}
console.log(`${count} canonical skills; ${rendered.size} rendered files; ${failures} failures`);
process.exitCode = failures ? 1 : 0;
