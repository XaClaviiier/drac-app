import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const layout = fs.readFileSync(new URL('../src/components/Layout.tsx', import.meta.url), 'utf8');

const sectionBetween = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `Bagian awal tidak ditemukan: ${start}`);
  assert.notEqual(to, -1, `Bagian akhir tidak ditemukan: ${end}`);
  return source.slice(from, to);
};

test('menu SERVIS ORDER memakai standar tile Accurate sebagai default', () => {
  assert.match(layout, /const isAccurateServiceMenu = group\.id === "sales"/);
  assert.match(layout, /const usesAccurateTileMenu = group\.id === "inventory" \|\| group\.id === "sales"/);
  assert.match(layout, /data-menu-model=\{usesAccurateTileMenu \? "accurate" : "standard"\}/);
  assert.match(layout, /isAccurateServiceMenu\s*\? "w-\[420px\]"/);
  assert.match(layout, /isAccurateServiceMenu\s*\? "grid-cols-\[repeat\(3,120px\)\] gap-2\.5"/);
  assert.match(layout, /usesAccurateTileMenu\s*\? "h-\[120px\] w-\[120px\] gap-1\.5 rounded-md px-2 py-2"/);
  assert.match(layout, /usesAccurateTileMenu \? "h-12 w-12 stroke-\[1\.7\]"/);
  assert.match(layout, /usesAccurateTileMenu\s*\? "text-sm font-normal leading-tight text-gray-700"/);
});

test('menu SERVIS ORDER mempertahankan route permission warna dan status tersedia', () => {
  const sales = sectionBetween(layout, 'id: "sales"', 'id: "purchase"');
  const expectedItems = [
    ['Daftar WO', '/workorders', 'wo:view', 'green'],
    ['WO Timeline', '/workorders/timeline', 'wo:view', 'blue'],
    ['Input Cepat Historis', '/historical-entry', 'invoice:create', 'orange'],
    ['Faktur Penjualan', '/invoices', 'invoice:view', 'green'],
    ['Pembayaran Pelanggan', '/customer-payments', 'payment:view', 'green'],
    ['Pelanggan', '/customers', 'customer:view', 'blue'],
    ['Kendaraan', '/vehicles', 'vehicle:view', 'blue'],
  ];
  for (const [label, path, permission, tone] of expectedItems) {
    const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(
      sales,
      new RegExp(`label: "${label}",[\\s\\S]*?path: "${escapedPath}",[\\s\\S]*?perm: "${permission}",[\\s\\S]*?tone: "${tone}"`),
      `${label} -> ${path} (${permission}, ${tone})`,
    );
  }
  assert.match(sales, /label: "Riwayat Pembayaran", icon: History, tone: "purple"/);
  assert.doesNotMatch(sales, /label: "Riwayat Pembayaran",\s*path:/);
  assert.match(layout, /const items = group\.items\.filter\(canAccessDesktopItem\)/);
  assert.match(layout, /disabled=\{!available\}/);
});
