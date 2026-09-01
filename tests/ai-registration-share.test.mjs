import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const assistant = readFileSync(new URL('../src/pages/AIAssistant.tsx', import.meta.url), 'utf8');

test('hasil bagikan registrasi WO menyertakan alamat pelanggan', () => {
  assert.match(assistant, /customerAddress: customer\?\.address \|\| a\.address \|\| ''/);
  assert.match(assistant, /const addressForShare = String\(r\.customerAddress \|\| ''\)\.trim\(\)/);
  assert.match(assistant, /addressForShare \? `\\n📍 \$\{addressForShare\}` : ''/);
});
