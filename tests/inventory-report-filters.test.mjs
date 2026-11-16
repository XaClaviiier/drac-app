import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { transformSync } from 'esbuild';
const code = transformSync(fs.readFileSync(new URL('../src/lib/inventoryReports.ts', import.meta.url), 'utf8'), { loader:'ts', format:'esm' }).code;
const { matchesStockAvailability, inventoryBalanceCsv } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const rows = [-2,5,0].map((quantity,index) => ({ itemId:'I1',code:'A',name:'Barang',warehouseId:`W${index}`,warehouseName:`Gudang ${index}`,branchName:'Cabang',quantity,unit:'PCS',averageCost:150000,inventoryValue:quantity*150000 }));
test('attention filter keeps the negative warehouse even when combined stock is positive', () => {
  assert.deepEqual(rows.filter(row=>matchesStockAvailability(row.quantity,'ATTENTION')).map(row=>row.quantity), [-2,0]);
  assert.deepEqual(rows.filter(row=>matchesStockAvailability(row.quantity,'NEGATIVE')).map(row=>row.quantity), [-2]);
});
test('employee CSV contains quantity and warehouse information with no costs', () => {
  const csv = inventoryBalanceCsv(rows, false);
  assert.equal(csv[0].length, 6); assert.equal(csv[1].length, 6);
  assert.doesNotMatch(JSON.stringify(csv), /HPP|Nilai|150000/);
  assert.equal(inventoryBalanceCsv(rows,true)[1][6],150000);
});
