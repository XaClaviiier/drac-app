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
