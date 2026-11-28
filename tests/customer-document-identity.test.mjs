import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const php = process.env.PHP_BINARY || 'php';
const available = spawnSync(php, ['-r', "exit(extension_loaded('pdo_sqlite') ? 0 : 1);"]).status === 0;

test('customer edits reach linked documents and preserve unresolved historical identities', { skip: !available }, () => {
  const result = spawnSync(php, ['tests/fixtures/customer-document-identity.php'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
