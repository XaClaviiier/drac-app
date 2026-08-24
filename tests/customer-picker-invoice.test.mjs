import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('pencarian pelanggan baku mengikat kendaraan pada WO dan Faktur Penjualan', () => {
  const picker = source('src/components/CustomerPicker.tsx');
  const workOrders = source('src/pages/WorkOrders.tsx');
  const invoices = source('src/pages/SalesInvoice.tsx');

  assert.match(picker, /onVehicleSelect\?\.\(vehicle\.id\)/);
  assert.match(picker, /formatPlateNumber\(vehicle\.plateNumber\)/);
  assert.match(picker, /\[\{vehicleLabel\}\]/);
  assert.doesNotMatch(picker, /Belum ada kendaraan|NA#/);
  assert.match(workOrders, /<CustomerPicker[\s\S]*?onVehicleSelect=\{handleVehicleSelect\}/);
  assert.match(invoices, /<CustomerPicker[\s\S]*?onVehicleSelect=\{handleVehicleSelect\}/);
});

test('WO baru langsung aktif untuk penambahan layanan setelah register', () => {
  const context = source('src/context/AppContext.tsx');
  const workOrders = source('src/pages/WorkOrders.tsx');

  assert.match(context, /setData\(prev => \(\{[\s\S]*?workOrders: prev\.workOrders\.some/);
  assert.match(context, /void refreshData\(\);[\s\S]*?return savedWorkOrder/);
  assert.doesNotMatch(context, /await refreshData\(\);\s*return savedWorkOrder/);
  assert.match(workOrders, /setEditingWO\(created\);[\s\S]*?Tambahkan layanan lalu simpan/);
});
