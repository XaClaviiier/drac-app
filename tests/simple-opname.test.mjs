import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const fixture=fileURLToPath(new URL('./fixtures/simple-opname.php',import.meta.url));
const date=new Date().toISOString().slice(0,10);
const setup=t=>{const dir=mkdtempSync(join(tmpdir(),'simple-opname-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return input=>{
 const result=spawnSync('php',[fixture,join(dir,'db.sqlite'),JSON.stringify(input)],{encoding:'utf8'});assert.ifError(result.error);assert.equal(result.status,0,result.stderr);try{return JSON.parse(result.stdout);}catch{throw new Error(result.stdout+result.stderr);}
};};
const payload=(counts=[5,7,null])=>({action:'save-simple',date,warehouseId:'W1',notes:'Hitung fisik',requestKey:'abcdef123456abcdef123456',rows:counts.map((count,i)=>({itemId:`I${i+1}`,systemQuantity:[5,10,5][i],editVersion:'1',finalQuantity:count}))});
const edit=(doc,counts)=>({action:'save-simple',date,warehouseId:'W1',revision:doc.revision,notes:'Koreksi',rows:doc.rows.map((row,i)=>({...row,finalQuantity:counts[Number(row.itemId.slice(1))-1]}))});
const ok=r=>{assert.equal(r.success,true,r.message);return r;};
test('one save records matches and blanks, posts only the difference, and supports safe retry',t=>{
 const run=setup(t),p=payload(),first=ok(run({payload:p}));
 assert.deepEqual(first.tables.warehouse_stocks.map(x=>x.quantity),[5,7,5]);
 assert.equal(first.tables.stock_movements.length,1);assert.equal(first.tables.stock_adjustment_items.length,1);
 assert.deepEqual(first.tables.stock_count_result_items.map(x=>x.variance),[0,-3,null]);
 const retry=ok(run({payload:p}));assert.equal(retry.data.id,first.data.id);assert.equal(retry.tables.stock_count_orders.length,1);assert.equal(retry.tables.stock_movements.length,1);
});
test('editing retains adjustment number, applies only delta difference, and preserves later stock changes',t=>{
 const run=setup(t),first=ok(run({payload:payload()})),id=first.data.id;
 run({bump:{itemId:'I2',delta:4}});
 const doc=ok(run({method:'GET',id})).data;
 const updated=ok(run({method:'PUT',id,payload:edit(doc,[5,8,null])}));
 assert.equal(updated.data.adjustmentNumber,first.data.adjustmentNumber);
 assert.deepEqual(updated.tables.warehouse_stocks.map(x=>x.quantity),[5,12,5]);
 assert.equal(updated.tables.stock_movements.length,1);assert.equal(updated.tables.stock_movements[0].quantity,2);
 assert.equal(updated.tables.stock_opname_audit.length,2);
});
test('edit all matched removes linked adjustment, subsequent difference creates one, delete restores stock',t=>{
 const run=setup(t),first=ok(run({payload:payload()})),id=first.data.id;
 let doc=ok(run({method:'GET',id})).data;
 const matched=ok(run({method:'PUT',id,payload:edit(doc,[5,10,null])}));
 assert.equal(matched.tables.stock_adjustments.length,0);assert.equal(matched.tables.stock_movements.length,0);
 assert.deepEqual(matched.tables.warehouse_stocks.map(x=>x.quantity),[5,10,5]);
 doc=ok(run({method:'GET',id})).data;
 ok(run({method:'PUT',id,payload:edit(doc,[0,10,null])}));
 doc=ok(run({method:'GET',id})).data;
 const removed=ok(run({method:'DELETE',id,payload:{target:'simple',revision:doc.revision}}));
 assert.deepEqual(removed.tables.warehouse_stocks.map(x=>x.quantity),[5,10,5]);assert.equal(removed.tables.stock_adjustments.length,0);assert.equal(removed.tables.stock_count_orders.length,0);assert.equal(removed.tables.stock_opname_audit.length,4);
});
test('all matched counts save a record without mutation or stock-version bump',t=>{
 const run=setup(t),r=ok(run({payload:payload([5,10,5])}));assert.equal(r.data.adjustmentId,null);assert.equal(r.tables.stock_movements.length,0);assert.deepEqual(r.tables.warehouse_stocks.map(x=>x.stock_version),[1,1,1]);
});
test('stale stock, stale document and unauthorized warehouse reject atomically',t=>{
 const run=setup(t);run({bump:{itemId:'I1',delta:0}});
 let r=run({payload:payload()});assert.equal(r.status,409);assert.equal(r.tables.stock_count_orders.length,0);
 const p=payload();p.rows[0].editVersion='2';const first=ok(run({payload:p}));
 const doc=ok(run({method:'GET',id:first.data.id})).data;
 ok(run({method:'PUT',id:first.data.id,payload:edit(doc,[5,8,null])}));
 r=run({method:'PUT',id:first.data.id,payload:edit(doc,[5,9,null])});assert.equal(r.status,409);assert.equal(r.tables.warehouse_stocks[1].quantity,8);
 r=run({payload:{...payload(),requestKey:'111111111111111111111111',warehouseId:'W2'}});assert.equal(r.status,403);
});
test('failed movement rolls back documents, balances and audit together',t=>{
 const run=setup(t),r=run({payload:payload(),failMovement:true});assert.equal(r.success,false);assert.deepEqual(r.tables.warehouse_stocks.map(x=>x.quantity),[5,10,5]);assert.equal(r.tables.stock_count_orders.length,0);assert.equal(r.tables.stock_opname_audit.length,0);
});
test('failed correction restores the prior adjustment and stock, deletion requires permission',t=>{
 const run=setup(t),first=ok(run({payload:payload()})),id=first.data.id;
 const doc=ok(run({method:'GET',id})).data;
 const failed=run({method:'PUT',id,payload:edit(doc,[5,8,null]),failMovement:true});
 assert.equal(failed.success,false);assert.deepEqual(failed.tables.warehouse_stocks.map(x=>x.quantity),[5,7,5]);
 assert.equal(failed.tables.stock_adjustments[0].adjustment_number,first.data.adjustmentNumber);assert.equal(failed.tables.stock_movements[0].quantity,3);assert.equal(failed.tables.stock_opname_audit.length,1);
 const denied=run({method:'DELETE',id,payload:{target:'simple',revision:doc.revision},deny:['stock_opname:delete']});assert.equal(denied.status,403);assert.equal(denied.tables.stock_count_orders.length,1);
});
test('preview and save use a verified stock snapshot, including zero and blank distinction',t=>{
 const run=setup(t),preview=ok(run({method:'GET',query:{preview:'1',date,warehouseId:'W1'}}));
 assert.equal(preview.data.rows.length,3);assert.ok(preview.data.rows.every(row=>row.finalQuantity===null&&row.editVersion==='1'));
 const p=payload([0,null,5]),saved=ok(run({payload:p}));
 assert.deepEqual(saved.tables.warehouse_stocks.map(x=>x.quantity),[0,10,5]);assert.deepEqual(saved.tables.stock_count_result_items.map(x=>x.variance),[-5,null,0]);
});
test('an earlier count cannot change stock beneath a newer completed count',t=>{
 const run=setup(t),first=ok(run({payload:payload()}));
 const p=payload([5,8,null]);p.requestKey='999999999999999999999999';p.rows[1].editVersion='2';p.rows[1].systemQuantity=7;
 ok(run({payload:p}));const doc=ok(run({method:'GET',id:first.data.id})).data;
 const denied=run({method:'PUT',id:first.data.id,payload:edit(doc,[5,9,null])});
 assert.equal(denied.status,409);assert.match(denied.message,/opname lebih baru/);assert.equal(denied.tables.warehouse_stocks[1].quantity,8);
});
for(const mode of ['count','post','create'])test(`save requires ${mode} permission`,t=>{
 const run=setup(t),r=run({payload:payload(),deny:[`stock_opname:${mode}`]});assert.equal(r.status,403);assert.equal(r.tables.stock_count_orders.length,0);
});
test('manual selection saves only selected items and allows adding an item to the same adjustment',t=>{
 const run=setup(t),p=payload([4,7,null]);p.rows=p.rows.slice(0,1);
 const first=ok(run({payload:p})),doc=ok(run({method:'GET',id:first.data.id})).data;
 assert.equal(doc.rows.length,1);
 const update=edit(doc,[4,7,null]);update.rows.push(payload([4,7,null]).rows[1]);
 const saved=ok(run({method:'PUT',id:first.data.id,payload:update}));
 assert.equal(saved.data.adjustmentNumber,first.data.adjustmentNumber);assert.deepEqual(saved.tables.warehouse_stocks.map(x=>x.quantity),[4,7,5]);
 const fresh=ok(run({method:'GET',id:first.data.id})).data;const incomplete=edit(fresh,[4,7,null]);incomplete.rows=incomplete.rows.slice(0,1);
 const rejected=run({method:'PUT',id:first.data.id,payload:incomplete});assert.equal(rejected.success,false);assert.equal(rejected.tables.stock_count_result_items.length,2);
});
for(const [name,counts] of Object.entries({blank:[null,null,null],negative:[-1,7,null],fraction:[1.5,7,null],overflow:[2147483648,7,null]}))test(`invalid ${name} count is rejected without changes`,t=>{
 const run=setup(t),r=run({payload:payload(counts)});assert.equal(r.success,false);assert.equal(r.tables.stock_movements.length,0);assert.equal(r.tables.stock_count_orders.length,0);
});
test('draft can be saved incomplete, resumed and applied once without premature stock mutation',t=>{
 const run=setup(t),p={...payload([4,null,null]),mode:'draft'};
 const draft=ok(run({payload:p,deny:['stock_opname:post']})),id=draft.data.id;
 assert.deepEqual(draft.tables.warehouse_stocks.map(row=>row.quantity),[5,10,5]);assert.equal(draft.tables.stock_movements.length,0);assert.equal(draft.tables.stock_count_results[0].status,'Draft');
 let doc=ok(run({method:'GET',id})).data;assert.equal(doc.rows.find(row=>row.itemId==='I1').finalQuantity,4);
 ok(run({method:'PUT',id,payload:{...edit(doc,[4,7,null]),mode:'draft'}}));
 doc=ok(run({method:'GET',id})).data;const applied=ok(run({method:'PUT',id,payload:edit(doc,[4,7,null])}));
 assert.deepEqual(applied.tables.warehouse_stocks.map(row=>row.quantity),[4,7,5]);assert.equal(applied.tables.stock_count_results[0].status,'Posted');
 doc=ok(run({method:'GET',id})).data;const downgrade=run({method:'PUT',id,payload:{...edit(doc,[4,7,null]),mode:'draft'}});assert.equal(downgrade.success,false);
});
test('deleting a draft does not reverse unapplied variances; blank draft is allowed',t=>{
 const run=setup(t),saved=ok(run({payload:{...payload([0,null,null]),mode:'draft'}}));
 const doc=ok(run({method:'GET',id:saved.data.id})).data;
 const deleted=ok(run({method:'DELETE',id:doc.id,payload:{target:'simple',revision:doc.revision}}));assert.deepEqual(deleted.tables.warehouse_stocks.map(row=>row.quantity),[5,10,5]);
 ok(run({payload:{...payload([null,null,null]),mode:'draft',requestKey:'555555555555555555555555'}}));
});
test('draft retains its old snapshot and refuses apply until stale stock is reviewed',t=>{
 const run=setup(t),saved=ok(run({payload:{...payload(),mode:'draft'}})),id=saved.data.id;
 run({bump:{itemId:'I2',delta:1}});
 const doc=ok(run({method:'GET',id})).data;assert.equal(doc.rows.find(row=>row.itemId==='I2').editVersion,'1');
 const rejected=run({method:'PUT',id,payload:edit(doc,[5,7,null])});assert.equal(rejected.status,409);assert.equal(rejected.tables.stock_adjustments.length,0);
 const reviewed=edit(doc,[5,7,null]);const row=reviewed.rows.find(row=>row.itemId==='I2');row.editVersion='2';row.systemQuantity=11;
 const applied=ok(run({method:'PUT',id,payload:reviewed}));assert.equal(applied.tables.warehouse_stocks[1].quantity,7);
});
test('category preview includes month-to-date activity even when final stock is zero',t=>{
 const run=setup(t);run({seedActivity:[date.slice(0,7)+'-01 12:00:00','2020-01-01 12:00:00']});
 const result=ok(run({method:'GET',query:{preview:'1',warehouseId:'W1',date}}));
 const row=result.data.rows.find(row=>row.itemId==='I3');assert.equal(row.systemQuantity,0);assert.equal(row.movementIn,2);assert.equal(row.movementOut,2);
});
