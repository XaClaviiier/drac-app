import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const assistant = readFileSync(new URL('../src/pages/AIAssistant.tsx', import.meta.url), 'utf8');

test('hasil bagikan registrasi WO menyertakan alamat pelanggan', () => {
  assert.match(assistant, /customerAddress: customer\?\.address \|\| a\.address \|\| ''/);
  assert.match(assistant, /const addressForShare = String\(r\.customerAddress \|\| ''\)\.trim\(\)/);
  assert.match(assistant, /addressForShare \? `\\n📍 \$\{addressForShare\}` : ''/);
});

test('share registrasi lama mengambil alamat terkini dari master pelanggan atau kendaraan', () => {
  assert.match(assistant, /const enrichLegacyRegisterShareAddress = \(text: string\) =>/);
  assert.match(assistant, /data\.workOrders\.find\(wo => wo\.woNumber === woNumber\)/);
  assert.match(assistant, /customer\?\.address \|\| vehicle\?\.address \|\| ''/);
  assert.match(assistant, /text\.replace\(\/\^👤\[\^\\n\]\*\$\/m, customerLine => `\$\{customerLine\}\\n📍 \$\{address\}`\)/);
  assert.match(assistant, /navigator\.share\(\{ title: 'Register Servis Baru', text: shareText \}\)/);
});
