import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const technicalFields = ['engineType', 'engineCode', 'variant', 'transmission', 'hvacType'];

test('profil kendaraan menyimpan atribut teknis untuk keputusan fitment', () => {
  const schema = source('database/dokterac_schema.sql');
  const endpoint = source('api/endpoints/vehicles.php');
  const types = source('src/types/index.ts');
  const page = source('src/pages/VehicleRegister.tsx');

  for (const column of ['engine_type', 'engine_code', 'variant', 'transmission', 'hvac_type']) {
    assert.match(schema, new RegExp(`vehicles[\\s\\S]*${column}`));
  }
  for (const field of technicalFields) {
    assert.match(endpoint, new RegExp(`\\['${field}'\\]`));
    assert.match(types, new RegExp(`${field}\\?`));
    assert.match(page, new RegExp(`${field}:`));
  }
  assert.match(endpoint, /INSERT INTO vehicles[^\n]*engine_type[^\n]*engine_code[^\n]*variant[^\n]*transmission[^\n]*hvac_type/);
  assert.match(page, /Jenis Mesin/);
  assert.match(page, /Kode Mesin/);
  assert.match(page, /Varian/);
  assert.match(page, /Transmisi/);
  assert.match(page, /Sistem AC/);
});

test('endpoint menolak nilai terstruktur pada seluruh atribut teknis sebagai validasi 422', () => {
  const endpoint = source('api/endpoints/vehicles.php');
  const resolver = endpoint.match(/\$resolveVehicleTechnicalProfile = static function\(array \$data\): array \{([\s\S]*?)\n\};/)?.[1] ?? '';
  const validationBlock = resolver.match(/foreach \(\[(.*?)\] as \$field\) \{([\s\S]*?)\n    \}/)?.[0] ?? '';

  for (const field of technicalFields) {
    assert.match(validationBlock, new RegExp(`'${field}'`));
  }
  assert.match(validationBlock, /\$value !== null && !is_string\(\$value\)/);
  assert.match(validationBlock, /throw new InvalidArgumentException\(/);
  assert.ok(
    resolver.indexOf('foreach ([') < resolver.indexOf("trim((string)($data['engineType']"),
    'validasi tipe harus dijalankan sebelum normalisasi string',
  );
  assert.match(endpoint, /catch \(InvalidArgumentException \$e\) \{ respondError\(\$e->getMessage\(\), 422\); \}/);
});

test('rekomendasi barang WO memakai seluruh profil teknis kendaraan', () => {
  const page = source('src/pages/WorkOrders.tsx');
  for (const field of technicalFields) {
    assert.match(page, new RegExp(`${field}: selectedWorkOrderVehicle\\.${field}`));
  }
});
