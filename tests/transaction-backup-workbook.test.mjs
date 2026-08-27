import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const settings = readFileSync(new URL('../src/pages/SettingsPage.tsx', import.meta.url), 'utf8');

test('restore workbook membaca nama sheet sebelum memproses isi file', () => {
  assert.match(settings, /readSheetNames/);
  assert.match(settings, /missingSheetNames/);
  assert.match(settings, /File ini bukan backup transaksi aplikasi/);
  assert.match(settings, /bukan file ekspor laporan Accurate/);
});

test('restore workbook memakai pembaca xlsx yang tahan terhadap workbook Accurate', () => {
  assert.match(settings, /default: readXlsxFile/);
  assert.match(settings, /readXlsxFile\(file, \{ sheet: name \}\)/);
  const restoreHandler = settings.slice(settings.indexOf('const selectRestoreFile'), settings.indexOf('const runRestore'));
  assert.doesNotMatch(restoreHandler, /workbook\.xlsx\.load/);
});
