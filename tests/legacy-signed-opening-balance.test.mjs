import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Requires PHP 8+ with pdo_sqlite. Missing PHP is a failure, not a silent skip.
// Set PHP_BINARY to an absolute executable path when PHP is not on PATH.
const fixture = fileURLToPath(new URL('./fixtures/legacy-signed-opening-balance.php', import.meta.url));
const run = (...args) => spawnSync(process.env.PHP_BINARY || 'php', [fixture, ...args], { encoding: 'utf8' });

for (const [name, quantity, mode, balance] of [
  ['legacy negative destination-only opening', '-7', 'legacy', -7],
  ['legacy signed INT minimum', '-2147483648', 'legacy', -2147483648],
  ['positive INT maximum', '2147483647', 'legacy', 2147483647],
  ['zero historical row', '0', 'legacy', 0],
  ['canonical positive source-only negative opening', '7', 'canonical', -7],
  ['occurred_at overrides recorded date, including end-of-day boundary', '-7', 'effective', -7],
]) {
  test(`${name}: reconstructs before/on/after effective date, ignoring voided/unrelated rows`, () => {
    const result = run(quantity, mode);
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), {
      '2026-08-09': { LEGACY: 0 },
      '2026-08-10': { LEGACY: balance },
      '2026-08-11': { LEGACY: balance },
    });
  });
}

for (const quantity of ['-2147483649', '2147483648', 'not-an-integer']) {
  test(`historical reader still rejects invalid stored quantity ${quantity}`, () => {
    const result = run(quantity);
    assert.ifError(result.error);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /InvalidArgumentException: Kuantitas jurnal stok/);
  });
}
