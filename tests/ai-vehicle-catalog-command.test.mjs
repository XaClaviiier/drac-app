import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const assistant = readFileSync(new URL('../src/pages/AIAssistant.tsx', import.meta.url), 'utf8');
const declaration = (name) => assistant.split('\n').find((line) => line.includes(`const ${name} =`)) || '';
const commandPattern = (name) => {
  const literal = declaration(name).match(/content\.match\((\/.*\/i)\)/)?.[1];
  assert.ok(literal, `Pola ${name} tidak ditemukan`);
  return Function(`return ${literal}`)();
};

test('perintah tambah type diproses oleh master kendaraan lokal', () => {
  assert.match(declaration('isVehicleCatalogIntent'), /type/);
  const match = 'tambah type land cruiser untuk toyota'.match(commandPattern('addModel'));
  assert.deepEqual(match?.slice(1), ['land cruiser', 'toyota']);
});

test('alias type didukung secara konsisten pada konfirmasi dan pencarian tipe', () => {
  const confirmation = 'konfirmasi tambah type land cruiser untuk Toyota'.match(commandPattern('confirmModel'));
  assert.deepEqual(confirmation?.slice(1), ['land cruiser', 'Toyota']);
  assert.match(declaration('directCatalogQuery'), /type/);
  assert.match(declaration('checkModels'), /type/);
});
