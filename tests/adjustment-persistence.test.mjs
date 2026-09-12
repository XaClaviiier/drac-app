import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const run=input=>{
 const result=spawnSync('php',[fileURLToPath(new URL('./fixtures/adjustment-persistence.php',import.meta.url)),JSON.stringify(input)],{encoding:'utf8'});
 assert.ifError(result.error);assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
};
const row={itemId:'I1',warehouseId:'W1',quantity:99,targetQuantity:0,stockBefore:8,unitCost:1200.25,lineNotes:'Hitung fisik'};
for(const method of ['POST','PUT'])test(`${method} persists target, derived delta, cost and notes in the real endpoint`,()=>{
 const result=run({method,...(method==='PUT'?{seed:{}}:{}),payload:{action:'save',date:'2026-09-10',rows:[row]}});
 assert.equal(result.success,true,result.message);assert.equal(result.stock,8);
 const line=result.lines[0];assert.equal(line.quantity,-8);assert.equal(line.target_quantity,0);assert.equal(line.stock_before,8);assert.equal(line.unit_cost,1200.25);assert.equal(line.line_notes,'Hitung fisik');
});
test('GET restores stored costs, target and notes',()=>{
 const result=run({method:'GET',seed:{}});assert.equal(result.success,true,result.message);
 assert.equal(result.data.rows[0].unitCost,1200.25);assert.equal(result.data.rows[0].targetQuantity,0);assert.equal(result.data.rows[0].lineNotes,'Hitung fisik');
});
test('posting target zero consumes the saved delta once',()=>{
 const result=run({method:'PUT',seed:{},payload:{action:'post'}});assert.equal(result.success,true,result.message);assert.equal(result.stock,0);assert.equal(result.documents[0].status,'Posted');
});
test('posting a stale target leaves stock and Draft intact',()=>{
 const result=run({method:'PUT',seed:{},current:9,payload:{action:'post'}});assert.equal(result.success,false);assert.equal(result.status,409);assert.equal(result.stock,9);assert.equal(result.documents[0].status,'Draft');
});
test('invalid draft edit rolls back deleted original lines',()=>{
 const result=run({method:'PUT',seed:{},payload:{action:'save',rows:[{...row,unitCost:-1}]}});assert.equal(result.success,false);assert.equal(result.lines.length,1);assert.equal(result.lines[0].unit_cost,1200.25);
});
