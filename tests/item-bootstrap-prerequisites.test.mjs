import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Source contract only. The real MySQL 5.7 HTTP positive controls and
// branch-revocation race in item-create-branch-revocation.php are the runtime gate.
const schema = readFileSync(new URL('../database/dokterac_schema.sql', import.meta.url), 'utf8');
const endpoint = readFileSync(new URL('../api/endpoints/items.php', import.meta.url), 'utf8');

test('fresh item creation has every catalog prerequisite without visiting another endpoint', () => {
  for (const table of ['vehicle_brands', 'vehicle_models', 'vehicle_generations', 'vehicle_generation_engines']) {
    assert.match(schema, new RegExp('CREATE TABLE IF NOT EXISTS `?' + table + '`?\\s*\\('), `${table} must exist before item fitment queries are prepared`);
  }
});

test('item schema additions use MySQL 5.7 conditional columns and fail closed', () => {
  const prologue = endpoint.slice(0, endpoint.indexOf('function itemCodeSegment'));
  assert.doesNotMatch(prologue, /ADD COLUMN IF NOT EXISTS/i);
  assert.match(prologue, /ensureTableColumn\(\$pdo/);
  assert.doesNotMatch(prologue, /catch\s*\(Throwable\s*\$e\)\s*\{[^}]*error_log[^}]*\}(?!\s*throw)/,
    'required DDL and seeds must not silently fail before successful business writes');
});