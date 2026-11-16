import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';

const run=(name,fn)=>test(name,{skip:process.env.DRAC_USAGE_TEST_MYSQL_PORT?false:'Requires disposable DRAC_USAGE_TEST_MYSQL_PORT'},fn);
const ok=result=>{assert.equal(result.success,true,result.message);return result.data;};
function fixture(t){
  const db=`drac_usage_test_hpp_${process.pid}_${randomBytes(4).toString('hex')}`;
  const args=input=>['tests/fixtures/item-usage-mysql.php',db,JSON.stringify(input)];
  const raw=input=>JSON.parse(execFileSync('php',args(input),{encoding:'utf8'}));
  const today=ok(raw({op:'init'})).today;t.after(()=>raw({op:'drop'}));
  const call=input=>raw({endpoint:'stock-adjustments',...input});
  const sql=(sql,params=[])=>ok(raw({op:'sql',sql,params}));
  const payload=changes=>({adjustmentType:'cost_adjustment',date:today,notes:'Koreksi HPP administrator',valuationAccountId:'EXP',requestKey:randomUUID(),rows:[{itemId:'I1',warehouseId:'W1',stockBefore:13,unitCostBefore:150000,unitCost:160000}],...changes});
  const create=(changes={},extra={})=>call({method:'POST',payload:payload(changes),...extra});
  const action=(id,action,changes={},extra={})=>call({id,method:'PUT',payload:{action,valuationRevision:0,...changes},...extra});
  const cost=(warehouseId='W1',itemId='I1')=>ok(raw({op:'hpp-cost',warehouseId,itemId}));
  const stock=()=>sql('SELECT * FROM warehouse_stocks ORDER BY warehouse_id,item_id');
  const branches=()=>sql('SELECT * FROM branch_item_stocks ORDER BY branch_id,item_id');
  const parallel=input=>new Promise((resolve,reject)=>{const p=spawn('php',args({endpoint:'stock-adjustments',...input}));let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',reject);p.on('close',code=>{if(code)return reject(Error(err));try{resolve(JSON.parse(out));}catch(e){reject(e);}});});
  return {raw,call,sql,today,payload,create,action,cost,stock,branches,parallel};
}

run('HPP adjustment keeps every stock balance unchanged and journals only the valuation difference',t=>{
  const f=fixture(t),before=f.stock(),branches=f.branches(),items=f.sql('SELECT id,stock,sellable_stock,purchase_price FROM items ORDER BY id');
  const draft=ok(f.create());assert.equal(f.cost(),150000);assert.equal(f.sql('SELECT * FROM journal_entries').length,0);
  const detail=ok(f.call({id:draft.id}));assert.equal(detail.adjustmentType,'cost_adjustment');assert.equal(detail.rows[0].quantity,0);assert.equal(detail.rows[0].stockBefore,13);assert.equal(detail.rows[0].valueChange,130000);
  const posted=ok(f.action(draft.id,'post'));assert.equal(posted.status,'Posted');assert.equal(posted.valuationRevision,1);
  assert.deepEqual(f.stock(),before);assert.deepEqual(f.branches(),branches);assert.deepEqual(f.sql('SELECT id,stock,sellable_stock,purchase_price FROM items ORDER BY id'),items);
  assert.equal(f.cost(),160000);assert.equal(f.cost('W2'),170000);
  const moves=f.sql("SELECT source_warehouse_id,destination_warehouse_id,quantity,unit_cost FROM stock_movements WHERE reference_id=? ORDER BY movement_sequence",[draft.id]);
  assert.deepEqual(moves.map(m=>[m.source_warehouse_id,m.destination_warehouse_id,Number(m.quantity),Number(m.unit_cost)]),[['W1',null,13,150000],[null,'W1',13,160000]]);
  const journal=f.sql('SELECT account_id,debit,credit FROM journal_lines ORDER BY account_id');
  assert.deepEqual(journal.map(l=>[l.account_id,Number(l.debit),Number(l.credit)]),[['EXP',0,130000],['INV',130000,0]]);
  ok(f.action(draft.id,'post'));assert.equal(f.sql('SELECT * FROM journal_entries').length,1);assert.equal(f.sql('SELECT * FROM stock_movements WHERE reference_id=?',[draft.id]).length,2);
  const reconciled=ok(f.raw({endpoint:'stock-movements',query:{reconcile:'1'}}));assert.equal(reconciled.isBalanced,true);
});

run('lower HPP and cancellation reverse exact frozen amounts and accounts without touching quantities',t=>{
  const f=fixture(t),before=f.stock();const draft=ok(f.create({rows:[{itemId:'I1',warehouseId:'W1',stockBefore:13,unitCostBefore:150000,unitCost:140000}]}));
  const posted=ok(f.action(draft.id,'post'));assert.equal(f.cost(),140000);
  assert.deepEqual(f.sql('SELECT account_id,debit,credit FROM journal_lines ORDER BY account_id').map(l=>[l.account_id,Number(l.debit),Number(l.credit)]),[['EXP',130000,0],['INV',0,130000]]);
  f.sql('UPDATE app_settings SET settings_json=? WHERE id=1',[JSON.stringify({defaultAccounts:{inventoryCoaId:'EXP2',inventoryAdjustmentCoaId:'EXP2'}})]);
  ok(f.action(draft.id,'cancel',{valuationRevision:posted.valuationRevision,reason:'Koreksi dibatalkan'}));
  assert.deepEqual(f.stock(),before);assert.equal(f.cost(),150000);
  for(const line of f.sql('SELECT account_id,SUM(debit-credit) balance FROM journal_lines GROUP BY account_id'))assert.equal(Number(line.balance),0);
  assert.equal(f.sql('SELECT * FROM journal_entries WHERE reversal_of_id IS NOT NULL').length,1);
  ok(f.action(draft.id,'cancel',{reason:'retry'}));assert.equal(f.sql('SELECT * FROM journal_entries').length,2);
  assert.equal(ok(f.raw({endpoint:'stock-movements',query:{reconcile:'1'}})).isBalanced,true);
});

run('administrator authority and branch scope are enforced for every HPP operation',t=>{
  const f=fixture(t),draft=ok(f.create());
  f.sql("UPDATE roles SET permissions=? WHERE id='STAFF'",[JSON.stringify(['item:view','item:create','item:edit','item:delete'])]);
  for(const req of [{},{id:draft.id},{query:{valuationOptions:'1'}},{query:{valuationPreview:'1',itemId:'I1',warehouseId:'W1',date:f.today}},{method:'POST',payload:f.payload({isOwner:true})},{id:draft.id,method:'PUT',payload:{action:'post'}},{id:draft.id,method:'DELETE',payload:{valuationRevision:0}}]) assert.equal(f.call({user:'staff',...req}).status,403);
  f.sql("INSERT INTO users(id,username,name,role_id,branch_id) VALUES('admin','admin','Admin Cabang','ADMIN','B1')");
  f.sql("INSERT INTO api_sessions(token_hash,user_id,expires_at,last_activity) VALUES(SHA2('usage-test-admin',256),'admin',DATE_ADD(NOW(),INTERVAL 1 DAY),NOW())");
  f.sql("INSERT INTO user_branch_access VALUES('admin','B1')");
  const adminDraft=ok(f.create({}, {user:'admin'}));ok(f.action(adminDraft.id,'post',{}, {user:'admin'}));
  assert.equal(f.create({rows:[{itemId:'I1',warehouseId:'W2',stockBefore:9,unitCostBefore:170000,unitCost:180000}]},{user:'admin'}).status,403);
  assert.equal(f.call({user:'admin',query:{valuationPreview:'1',itemId:'I1',warehouseId:'W2',date:f.today}}).status,403);
  const other=ok(f.create({rows:[{itemId:'I1',warehouseId:'W2',stockBefore:9,unitCostBefore:170000,unitCost:180000}]}));
  assert.equal(f.call({user:'admin',id:other.id}).status,404);assert.equal(f.action(other.id,'post',{}, {user:'admin'}).status,404);
});

run('client quantity and valuation tampering cannot change stock or the server-computed difference',t=>{
  const f=fixture(t),before=f.stock();
  const draft=ok(f.create({rows:[{itemId:'I1',warehouseId:'W1',stockBefore:13,unitCostBefore:150000,unitCost:160000,quantity:999,targetQuantity:999,valueChange:1}]}));
  ok(f.action(draft.id,'post'));assert.deepEqual(f.stock(),before);assert.equal(ok(f.call({id:draft.id})).rows[0].valueChange,130000);
  assert.equal(f.create({rows:[{itemId:'I1',warehouseId:'W1',stockBefore:13,unitCostBefore:1,unitCost:170000}]}).status,409);
});

run('stale stock, HPP and document revisions preserve drafts with no partial ledger or journal',t=>{
  const f=fixture(t),draft=ok(f.create());
  f.sql("UPDATE warehouse_stocks SET quantity=12 WHERE warehouse_id='W1' AND item_id='I1'");
  assert.equal(f.action(draft.id,'post').status,409);assert.equal(ok(f.call({id:draft.id})).status,'Draft');
  f.sql("UPDATE warehouse_stocks SET quantity=13 WHERE warehouse_id='W1' AND item_id='I1'");
  f.sql("UPDATE stock_movements SET unit_cost=155000 WHERE destination_warehouse_id='W1' AND item_id='I1'");
  assert.equal(f.action(draft.id,'post').status,409);assert.equal(f.sql('SELECT * FROM journal_entries').length,0);
  const saved=ok(f.action(draft.id,'save',f.payload({rows:[{itemId:'I1',warehouseId:'W1',stockBefore:13,unitCostBefore:155000,unitCost:160000}]})));
  assert.equal(saved.valuationRevision,1);assert.equal(f.action(draft.id,'post').status,409);
  ok(f.action(draft.id,'post',{valuationRevision:1}));assert.equal(f.cost(),160000);
});

run('concurrent requests cannot create duplicate documents or post competing HPP snapshots',async t=>{
  const f=fixture(t),payload=f.payload(),before=f.stock();
  const created=(await Promise.all([f.parallel({method:'POST',payload}),f.parallel({method:'POST',payload})])).map(ok);
  assert.equal(created[0].id,created[1].id);assert.equal(f.sql('SELECT * FROM stock_adjustments').length,1);
  const other=ok(f.create({rows:[{itemId:'I1',warehouseId:'W1',stockBefore:13,unitCostBefore:150000,unitCost:170000}]}));
  const result=await Promise.all([created[0].id,other.id].map(id=>f.parallel({id,method:'PUT',payload:{action:'post',valuationRevision:0}})));
  assert.equal(result.filter(r=>r.success).length,1);assert.equal(result.filter(r=>r.status===409).length,1);
  assert.deepEqual(f.stock(),before);assert.equal(f.sql('SELECT * FROM journal_entries').length,1);
});

run('subsequent usage consumes the corrected HPP and blocks destructive cancellation or deletion',t=>{
  const f=fixture(t),draft=ok(f.create());ok(f.action(draft.id,'post'));
  const usage=ok(f.raw({method:'POST',payload:{date:f.today,warehouseId:'W1',purpose:'Pemakaian setelah koreksi HPP',responsibleName:'Petugas',expenseAccountId:'EXP',action:'post',requestKey:randomUUID(),rows:[{itemId:'I1',quantity:1}]}}));
  assert.equal(Number(f.sql('SELECT unit_cost FROM item_usage_items WHERE usage_id=?',[usage.id])[0].unit_cost),160000);
  const before=f.stock();assert.equal(f.action(draft.id,'cancel',{valuationRevision:1,reason:'Sudah dipakai'}).status,409);
  assert.equal(f.call({id:draft.id,method:'DELETE',payload:{valuationRevision:1}}).status,409);
  assert.deepEqual(f.stock(),before);assert.equal(f.cost(),160000);assert.equal(ok(f.call({id:draft.id})).status,'Posted');
});

run('invalid dates, zero stock, prices, duplicate lines and offset accounts cannot create HPP documents',t=>{
  const f=fixture(t),row=f.payload().rows[0],before=f.stock();
  for(const input of [{date:'2026-02-30'},{date:'9999-12-31'},{notes:''},{valuationAccountId:'INV'},{valuationAccountId:'PARENT'},{rows:[row,row]},...[-1,0,'1e4','1.12345',null,150000].map(unitCost=>({rows:[{...row,unitCost}]}))]) assert.equal(f.create(input).success,false,JSON.stringify(input));
  f.sql("UPDATE warehouse_stocks SET quantity=0 WHERE warehouse_id='W1' AND item_id='I1'");
  assert.equal(f.call({query:{valuationPreview:'1',itemId:'I1',warehouseId:'W1',date:f.today}}).success,false);
  f.sql("UPDATE warehouse_stocks SET quantity=13 WHERE warehouse_id='W1' AND item_id='I1'");
  const yesterday=f.sql('SELECT DATE_SUB(CURDATE(),INTERVAL 1 DAY) day')[0].day;
  assert.equal(f.create({date:yesterday}).status,409);assert.deepEqual(f.stock(),before);assert.equal(f.sql('SELECT * FROM stock_adjustments').length,0);
});

run('posting a multi-warehouse document validates all rows before writing and journals each branch separately',t=>{
  const f=fixture(t),before=f.stock();
  const draft=ok(f.create({rows:[...f.payload().rows,{itemId:'I1',warehouseId:'W2',stockBefore:9,unitCostBefore:170000,unitCost:180000},{itemId:'I1',warehouseId:'W0',stockBefore:4,unitCostBefore:160000,unitCost:165000}]}));
  f.sql("UPDATE warehouse_stocks SET quantity=8 WHERE warehouse_id='W2' AND item_id='I1'");assert.equal(f.action(draft.id,'post').status,409);assert.equal(f.sql('SELECT * FROM stock_movements WHERE reference_id=?',[draft.id]).length,0);
  f.sql("UPDATE warehouse_stocks SET quantity=9 WHERE warehouse_id='W2' AND item_id='I1'");ok(f.action(draft.id,'post'));
  assert.deepEqual(f.stock(),before);assert.deepEqual(f.sql('SELECT branch_id FROM journal_entries ORDER BY branch_id').map(r=>r.branch_id),['0','B1','B2']);
  assert.equal(f.cost('W0'),165000);assert.equal(f.cost('W2'),180000);
});

run('four-decimal HPP survives ledger persistence and schema bootstrap is repeatable',t=>{
  const f=fixture(t);f.sql('ALTER TABLE stock_movements MODIFY unit_cost DECIMAL(15,2)');
  ok(f.raw({op:'hpp-bootstrap'}));ok(f.raw({op:'hpp-bootstrap'}));
  const draft=ok(f.create({rows:[{...f.payload().rows[0],unitCost:150000.1234}]}));ok(f.action(draft.id,'post'));
  assert.equal(f.cost(),150000.1234);assert.equal(ok(f.call({id:draft.id})).rows[0].valueChange,1.6);
});

run('zero old HPP can be corrected and exactly restored on cancellation',t=>{
  const f=fixture(t),row={itemId:'I3',warehouseId:'W1',stockBefore:5,unitCostBefore:0,unitCost:10000};
  const draft=ok(f.create({rows:[row]}));ok(f.action(draft.id,'post'));assert.equal(f.cost('W1','I3'),10000);
  ok(f.action(draft.id,'cancel',{valuationRevision:1,reason:'Batalkan koreksi'}));assert.equal(f.cost('W1','I3'),0);
});
