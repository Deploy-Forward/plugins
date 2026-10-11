import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// worklanes/scripts/ask.py is tested offline by test/ask_test.py (a local stdlib HTTP stub); this runs it.
const interpreters = [['python3'], ['python'], ['py', '-3']];
const python = interpreters.find(([cmd, ...rest]) => {
  const probe = spawnSync(cmd, [...rest, '-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)'], { windowsHide: true });
  return probe.status === 0;
});

test('ask.py: offline tests against a local stub pass (Python 3.11+)', { timeout: 240000 }, () => {
  assert.ok(python, 'Python 3.11 or newer is required to test worklanes/scripts/ask.py');
  const [cmd, ...rest] = python;
  const result = spawnSync(cmd, [...rest, 'test/ask_test.py', '-v'], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 230000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /Ran 22 tests/);
});
