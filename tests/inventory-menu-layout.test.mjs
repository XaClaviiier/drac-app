import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const layout = fs.readFileSync(new URL('../src/components/Layout.tsx', import.meta.url), 'utf8');
const itemsPage = fs.readFileSync(new URL('../src/pages/ItemsAndServices.tsx', import.meta.url), 'utf8');
const inventoryReport = fs.readFileSync(new URL('../src/pages/InventoryReport.tsx', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../src/pages/Dashboard.tsx', import.meta.url), 'utf8');

const sectionBetween = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `Bagian awal tidak ditemukan: ${start}`);
  assert.notEqual(to, -1, `Bagian akhir tidak ditemukan: ${end}`);
  return source.slice(from, to);
};

test('menu Persediaan memakai grid kotak enam kolom model Accurate', () => {
  assert.match(layout, /const isAccurateInventoryMenu = group\.id === "inventory"/);
  assert.match(layout, /const usesAccurateTileMenu = group\.id === "inventory" \|\| group\.id === "sales"/);
  assert.match(layout, /data-menu-model=\{usesAccurateTileMenu \? "accurate" : "standard"\}/);
  assert.match(layout, /isAccurateInventoryMenu\s*\? "w-\[min\(828px,calc\(100vw-18rem\)\)\]"/);
  assert.match(layout, /isAccurateInventoryMenu\s*\? "grid-cols-\[repeat\(auto-fit,120px\)\] gap-2\.5"/);
  assert.match(layout, /usesAccurateTileMenu\s*\? "h-\[120px\] w-\[120px\] gap-1\.5 rounded-md px-2 py-2"/);
  assert.match(layout, /usesAccurateTileMenu \? "h-12 w-12 stroke-\[1\.7\]"/);
  assert.match(layout, /usesAccurateTileMenu\s*\? "text-sm font-normal leading-tight text-gray-700"/);
});

test('warna menu Persediaan membedakan transaksi master dan laporan seperti Accurate', () => {
  const inventory = sectionBetween(layout, 'id: "inventory"', 'id: "reports"');
  for (const label of ['Penerimaan Barang', 'Transfer Gudang', 'Penyesuaian Stok', 'Stok Opname', 'Permintaan Barang']) {
    assert.match(inventory, new RegExp(`label: "${label}"[\\s\\S]*?tone: "green"`), label);
  }
  for (const label of ['Barang & Jasa', 'Gudang', 'Kategori Barang', 'Merek Barang']) {
    assert.match(inventory, new RegExp(`label: "${label}"[\\s\\S]*?tone: "blue"`), label);
  }
  for (const label of ['Stok per Gudang', 'Kartu Stok', 'Stok Kosong / Minus']) {
    assert.match(inventory, new RegExp(`label: "${label}"[\\s\\S]*?tone: "purple"`), label);
  }
  assert.match(layout, /const accurateInventoryTones:[\s\S]*?green:[\s\S]*?border-\[#58cd42\] bg-\[#e1fadd\][\s\S]*?blue:[\s\S]*?border-\[#43a3ea\] bg-\[#dceeff\][\s\S]*?purple:[\s\S]*?border-\[#b557ed\] bg-\[#f4e6ff\]/);
});

test('ikon Persediaan profesional tetap mengikuti route dan permission yang ada', () => {
  const inventory = sectionBetween(layout, 'id: "inventory"', 'id: "reports"');
  for (const icon of ['PackageOpen', 'ArrowLeftRight', 'PackageMinus', 'ClipboardCheck', 'FilePlus2', 'PackageSearch', 'Tags']) {
    assert.match(layout, new RegExp(`\\b${icon}\\b`), icon);
  }
  const routesAndPermissions = [
    ['Penerimaan Barang', '/receipts', 'receipt:view'],
    ['Transfer Gudang', '/warehouse-transfers', 'item:view'],
    ['Penyesuaian Stok', '/warehouses', 'item:edit'],
    ['Penyesuaian Stok', '/opening-stock', 'item:edit'],
    ['Stok Opname', '/reports/stock-count-sheet', 'item:view'],
    ['Barang & Jasa', '/items', 'item:view'],
    ['Gudang', '/warehouses', 'item:view'],
    ['Stok per Gudang', '/warehouses', 'item:view'],
    ['Kartu Stok', '/items?mode=stock-card', 'item:view'],
    ['Stok Kosong / Minus', '/reports/inventory?availability=ATTENTION', 'report:view'],
    ['Kategori Barang', '/categories', 'item:view'],
    ['Merek Barang', '/items?master=item-brands', 'item:view'],
  ];
  for (const [label, path, permission] of routesAndPermissions) {
    const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(
      inventory,
      new RegExp(`label: "${label}",\\s*path: "${escapedPath}",[\\s\\S]*?perm: "${permission}"`),
      `${label} -> ${path} (${permission})`,
    );
  }
  assert.match(inventory, /label: "Permintaan Barang", icon: FilePlus2, tone: "green"/);
  assert.match(layout, /const items = group\.items\.filter\(canAccessDesktopItem\)/);
  assert.match(layout, /disabled=\{!available\}/);
});

test('deep-link laporan stok membuka mode operasional yang nyata dan tidak mengklaim HPP historis', () => {
  assert.match(itemsPage, /searchParams\.get\('mode'\) === 'stock-card'/);
  assert.match(itemsPage, /setItemFormTab\(item && stockCardMode \? 'movement' : 'general'\)/);
  assert.match(inventoryReport, /useSearchParams\(\)/);
  assert.match(inventoryReport, /availabilityParam === 'ATTENTION'/);
  assert.match(inventoryReport, /availability==='ATTENTION'\?item\.quantity<=0/);
  assert.match(inventoryReport, /Estimasi Nilai Stok/);
  assert.match(inventoryReport, /bukan HPP historis/);
  assert.doesNotMatch(inventoryReport, /label="Nilai Persediaan"/);
  assert.match(dashboard, /to="\/reports\/inventory\?availability=ATTENTION"/);
  assert.doesNotMatch(dashboard, /to="\/inventory-report"/);
});
