import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';

const enabled = !!process.env.DRAC_USAGE_TEST_MYSQL_PORT;
const run = (name, fn) => test(name, { skip: enabled ? false : 'Set DRAC_USAGE_TEST_MYSQL_PORT to a disposable MySQL port' }, fn);
function fixture(t) {
  const db = `drac_usage_test_${process.pid}_${randomBytes(5).toString('hex')}`;
  const args = input => ['tests/fixtures/item-usage-mysql.php', db, JSON.stringify(input)];
  const call = input => JSON.parse(execFileSync('php', args(input), { encoding: 'utf8' }).replace(/^\uFEFF/, ''));
  const today = call({ op: 'init' }).data.today;
  t.after(() => call({ op: 'drop' }));
  const sql = (sql, params = []) => call({ op: 'sql', sql, params }).data;
  const payload = changes => ({ date: today, warehouseId: 'W1', purpose: 'Pemakaian operasional cabang', responsibleName: 'Petugas Cakalang', expenseAccountId: 'EXP', rows: [{ itemId: 'I1', quantity: 2, lineNotes: 'Bahan perawatan' }], requestKey: randomUUID(), ...changes });
  const create = (changes = {}, extra = {}) => call({ method: 'POST', payload: payload(changes), ...extra });
  const update = (id, action, changes = {}, extra = {}) => call({ method: 'PUT', id, payload: { action, revision: 0, ...changes }, ...extra });
  const detail = (id, extra = {}) => call({ id, ...extra });
  const stock = (warehouseId = 'W1', itemId = 'I1') => Number(sql('SELECT quantity FROM warehouse_stocks WHERE warehouse_id=? AND item_id=?', [warehouseId, itemId])[0].quantity);
  const parallel = input => new Promise((resolve, reject) => { const child = spawn('php', args(input)); let out = '', err = ''; child.stdout.on('data', data => out += data); child.stderr.on('data', data => err += data); child.on('error', reject); child.on('close', code => { if (code) reject(new Error(err)); else { try { resolve(JSON.parse(out)); } catch (error) { reject(error); } } }); });
  return { call, sql, today, payload, create, update, detail, stock, parallel };
}
const ok = result => { assert.equal(result.success, true, result.message); return result.data; };

run('draft, posting and cancellation keep stock, branch totals and journal balanced', t => {
  const f = fixture(t); const draft = ok(f.create());
  assert.equal(f.stock(), 13); assert.equal(f.sql('SELECT * FROM journal_entries').length, 0);
  assert.match(draft.usageNumber, /^PAK-\d{4}-\d{6}$/);
  assert.equal(ok(f.detail(draft.id)).rows[0].lineNotes, 'Bahan perawatan');
  const posted = ok(f.update(draft.id, 'post')); assert.equal(posted.status, 'Posted');
  assert.equal(Number(f.sql('SELECT total_value FROM item_usages WHERE id=?', [draft.id])[0].total_value), 300000);
  assert.equal(f.stock(), 11); assert.equal(f.stock('W2'), 9);
  assert.equal(Number(f.sql("SELECT stock FROM branch_item_stocks WHERE branch_id='B1' AND item_id='I1'")[0].stock), 11);
  assert.equal(Number(f.sql("SELECT stock FROM items WHERE id='I1'")[0].stock), 11);
  const movements = f.sql("SELECT * FROM stock_movements WHERE reference_type='item_usage'");
  assert.equal(movements.length, 1); assert.equal(movements[0].movement_type, 'usage');
  const journal = f.sql('SELECT * FROM journal_entries')[0]; assert.equal(journal.branch_id, 'B1');
  const lines = f.sql('SELECT account_id,debit,credit FROM journal_lines ORDER BY account_id');
  assert.deepEqual(lines.map(l => [l.account_id, Number(l.debit), Number(l.credit)]), [['EXP',300000,0],['INV',0,300000]]);
  ok(f.update(draft.id, 'post')); assert.equal(f.stock(), 11);
  f.sql("UPDATE items SET purchase_price=999999 WHERE id='I1'");
  f.sql("UPDATE app_settings SET settings_json=? WHERE id=1", [JSON.stringify({ defaultAccounts: { inventoryCoaId: 'CHILD' } })]);
  const cancelled = ok(f.update(draft.id, 'cancel', { revision: posted.revision, reason: 'Salah barang' }));
  assert.equal(cancelled.status, 'Cancelled'); assert.equal(f.stock(), 13);
  assert.equal(Number(f.sql('SELECT SUM(debit-credit) total FROM journal_lines')[0].total), 0);
  for (const row of f.sql('SELECT account_id,SUM(debit-credit) balance FROM journal_lines GROUP BY account_id')) assert.equal(Number(row.balance), 0);
  assert.equal(f.sql('SELECT * FROM journal_entries WHERE reversal_of_id IS NOT NULL').length, 1);
  ok(f.update(draft.id, 'cancel', { reason: 'Retry' })); assert.equal(f.stock(), 13);
  assert.equal(f.sql("SELECT * FROM stock_movements WHERE reference_type='item_usage'").length, 2);
});

run('atomic create-and-post retries do not consume stock or create documents twice', async t => {
  const f = fixture(t); const payload = f.payload({ action: 'post' });
  const results = await Promise.all([f.parallel({ method: 'POST', payload }), f.parallel({ method: 'POST', payload })]);
  const docs = results.map(ok); assert.equal(docs[0].id, docs[1].id); assert.equal(f.stock(), 11);
  assert.equal(f.sql('SELECT * FROM item_usages').length, 1); assert.equal(f.sql('SELECT * FROM journal_postings').length, 1);
  const conflict = f.call({ method: 'POST', payload: { ...payload, purpose: 'Berbeda' } });
  assert.equal(conflict.success, false); assert.equal(conflict.status, 409); assert.equal(f.stock(), 11);
});

run('competing postings cannot overspend inventory and roll back every line and journal', async t => {
  const f = fixture(t);
  const results = await Promise.all([1,2].map(() => f.parallel({ method: 'POST', payload: f.payload({ action: 'post', rows: [{ itemId: 'I1', quantity: 8 }] }) })));
  assert.equal(results.filter(r => r.success).length, 1); assert.equal(f.stock(), 5);
  assert.equal(f.sql('SELECT * FROM item_usages').length, 1); assert.equal(f.sql('SELECT * FROM journal_postings').length, 1);
  const failed = f.create({ action: 'post', rows: [{ itemId: 'I1', quantity: 1 }, { itemId: 'I2', quantity: 99 }] });
  assert.equal(failed.success, false); assert.equal(f.stock(), 5); assert.equal(f.stock('W1','I2'), 8);
  assert.equal(f.sql('SELECT * FROM item_usages').length, 1);
});

run('posting revalidates current stock and cost and keeps failed draft unchanged', t => {
  const f = fixture(t); const draft = ok(f.create({ rows: [{ itemId: 'I1', quantity: 12 }] }));
  f.sql("UPDATE warehouse_stocks SET quantity=3 WHERE warehouse_id='W1' AND item_id='I1'");
  assert.equal(f.update(draft.id, 'post').success, false); assert.equal(ok(f.detail(draft.id)).status, 'Draft');
  assert.equal(f.stock(), 3); assert.equal(f.sql('SELECT * FROM journal_entries').length, 0);
  f.sql("UPDATE warehouse_stocks SET quantity=13 WHERE warehouse_id='W1' AND item_id='I1'");
  f.sql("UPDATE stock_movements SET unit_cost=200000 WHERE item_id='I1' AND destination_warehouse_id='W1'");
  ok(f.update(draft.id, 'post'));
  assert.equal(Number(f.sql('SELECT total_value FROM item_usages WHERE id=?', [draft.id])[0].total_value), 2400000);
});

run('branch scope protects list, details, previews, mutation and branch identity zero', t => {
  const f = fixture(t); const other = ok(f.create({ warehouseId: 'W2' }));
  assert.equal(f.call({ user: 'staff' }).data.length, 0);
  for (const req of [{ id: other.id }, { query: { branchId: 'B2' } }, { query: { preview: '1', warehouseId: 'W2', itemId: 'I1', date: f.today } }]) assert.equal(f.call({ user: 'staff', ...req }).success, false);
  assert.equal(f.create({ warehouseId: 'W2' }, { user: 'staff' }).status, 403);
  assert.equal(f.update(other.id, 'post', {}, { user: 'staff' }).status, 403);
  assert.equal(f.call({ method: 'DELETE', id: other.id, user: 'staff', payload: { revision: 0 } }).status, 403);
  const zero = ok(f.create({ warehouseId: 'W0', action: 'post' }, { user: 'zero' }));
  assert.equal(zero.branchId, '0'); assert.equal(f.stock('W0'), 2);
  assert.equal(ok(f.call({ user: 'zero', query: { branchId: '0' } })).length, 1);
});

run('permissions for view, draft, posting, cancellation and deletion are independent', t => {
  const f = fixture(t); const draft = ok(f.create());
  f.sql("UPDATE roles SET permissions=? WHERE id='STAFF'", [JSON.stringify(['item_usage:view','item_usage:create'])]);
  ok(f.create({}, { user: 'staff' }));
  assert.equal(f.create({ action: 'post' }, { user: 'staff' }).status, 403);
  assert.equal(f.update(draft.id, 'post', {}, { user: 'staff' }).status, 403);
  assert.equal(f.call({ method: 'DELETE', id: draft.id, user: 'staff', payload: { revision: 0 } }).status, 403);
  const posted = ok(f.update(draft.id, 'post'));
  assert.equal(f.update(draft.id, 'cancel', { revision: posted.revision, reason: 'test' }, { user: 'staff' }).status, 403);
  f.sql("UPDATE roles SET permissions='[]' WHERE id='STAFF'");
  assert.equal(f.call({ user: 'staff' }).status, 403); assert.equal(f.call({ user: 'staff', query: { options: '1' } }).status, 403);
});

run('stale edits and deletion preserve the latest draft and audit history', t => {
  const f = fixture(t); const draft = ok(f.create());
  const changed = ok(f.update(draft.id,'save',f.payload({ rows: [{ itemId: 'I2', quantity: 3 }] })));
  assert.equal(changed.revision, 1);
  assert.equal(Number(f.sql('SELECT total_value FROM item_usages WHERE id=?', [draft.id])[0].total_value), 75000.38);
  assert.equal(f.update(draft.id,'save',f.payload({ purpose: 'stale' })).status,409);
  assert.equal(f.call({ method:'DELETE',id:draft.id,payload:{revision:0} }).status,409);
  assert.equal(ok(f.detail(draft.id)).rows[0].itemId,'I2');
  ok(f.call({ method:'DELETE',id:draft.id,payload:{revision:1} }));
  assert.equal(f.sql('SELECT * FROM item_usage_items').length,0); assert.equal(f.stock(),13);
  assert.equal(f.sql("SELECT * FROM transaction_activity_logs WHERE action_type='delete'").length,1);
});

run('rejects malformed quantities, dates, account types, duplicate rows and missing purpose', t => {
  const f = fixture(t);
  for (const quantity of [0,-1,1.5,'1e2','',null,2147483648]) assert.equal(f.create({ rows:[{itemId:'I1',quantity}] }).success,false,String(quantity));
  for (const changes of [{date:'2026-02-30'},{purpose:' '},{responsibleName:''},{expenseAccountId:'INV'},{expenseAccountId:'PARENT'},{rows:[{itemId:'I1',quantity:1},{itemId:'I1',quantity:2}]}]) assert.equal(f.create(changes).success,false,JSON.stringify(changes));
  assert.equal(f.sql('SELECT * FROM item_usages').length,0);
  const draft = ok(f.create({ expenseAccountId:'' })); assert.equal(f.update(draft.id,'post').success,false);
  assert.equal(f.create({action:'post',rows:[{itemId:'I3',quantity:1}]}).success,false);
  assert.equal(f.stock(),13); assert.equal(f.sql('SELECT * FROM journal_entries').length,0);
});

run('posted documents cannot be edited, deleted or cancelled without a reason', t => {
  const f = fixture(t); const doc = ok(f.create({action:'post'}));
  assert.equal(f.update(doc.id,'save',{...f.payload(),revision:doc.revision}).success,false);
  assert.equal(f.call({method:'DELETE',id:doc.id,payload:{revision:doc.revision}}).success,false);
  assert.equal(f.update(doc.id,'cancel',{revision:doc.revision,reason:''}).success,false);
  assert.equal(f.stock(),11); assert.equal(ok(f.detail(doc.id)).status,'Posted');
});

run('server ignores supplied cost and stock delta and pins valuation to the selected warehouse', t => {
  const f = fixture(t); const doc = ok(f.create({ action:'post',warehouseId:'W2',rows:[{itemId:'I1',quantity:2,unitCost:1,stockBefore:999,totalValue:2}] }));
  assert.equal(Number(f.sql('SELECT total_value FROM item_usages WHERE id=?', [doc.id])[0].total_value),340000);
  assert.equal(f.stock('W2'),7); assert.equal(f.stock(),13);
  assert.equal(Number(f.sql('SELECT unit_cost FROM item_usage_items WHERE usage_id=?', [doc.id])[0].unit_cost),170000);
  assert.equal(ok(f.detail(doc.id)).rows[0].stockBefore,9);
});

run('operational responses omit valuation for staff and administrators while accounting retains HPP', t => {
  const f = fixture(t);
  const operational = response => {
    const data = ok(response);
    const inspect = value => {
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        assert.ok(!['unitCost','totalValue','purchasePrice','unit_cost','total_value','purchase_price'].includes(key), `Operational response exposed ${key}`);
        inspect(child);
      }
    };
    inspect(data);
    return data;
  };
  for (const user of ['staff','owner']) {
    assert.deepEqual(operational(f.call({ user, query: { preview:'1', warehouseId:'W1', itemId:'I1', date:f.today } })), { stock:13 });
    const payload = f.payload();
    const request = { user, method:'POST', payload };
    const draft = operational(f.call(request));
    operational(f.call(request)); // Idempotent create response.
    operational(f.call({ user }));
    assert.equal(operational(f.detail(draft.id, { user })).rows[0].quantity, 2);
    const edited = operational(f.update(draft.id, 'save', f.payload({ rows:[{itemId:'I1',quantity:3}] }), { user }));
    const posted = operational(f.update(draft.id, 'post', { revision:edited.revision }, { user }));
    operational(f.update(draft.id, 'post', { revision:edited.revision }, { user }));
    operational(f.detail(draft.id, { user }));
    assert.equal(f.stock(),10);
    assert.equal(Number(f.sql('SELECT total_value FROM item_usages WHERE id=?', [draft.id])[0].total_value),450000);
    assert.equal(Number(f.sql('SELECT unit_cost FROM item_usage_items WHERE usage_id=?', [draft.id])[0].unit_cost),150000);
    assert.equal(Number(f.sql('SELECT SUM(l.debit) amount FROM journal_lines l JOIN journal_entries j ON j.id=l.journal_id WHERE j.source_id=?', [draft.id])[0].amount),450000);
    operational(f.update(draft.id, 'cancel', { revision:posted.revision, reason:'Koreksi uji akses' }, { user }));
    operational(f.update(draft.id, 'cancel', { revision:posted.revision, reason:'Koreksi uji akses' }, { user }));
    operational(f.detail(draft.id, { user }));
    assert.equal(f.stock(),13);
  }
});

run('long usage and cancellation notes survive the shared audit and journal limits', t => {
  const f=fixture(t); const purpose='Perawatan cabang. '.repeat(50); const reason='Koreksi pemakaian. '.repeat(50);
  const doc=ok(f.create({action:'post',purpose}));
  assert.equal(ok(f.detail(doc.id)).purpose,purpose.trim());
  ok(f.update(doc.id,'cancel',{revision:doc.revision,reason}));
  assert.equal(ok(f.detail(doc.id)).cancellationReason,reason.trim());
  const audit=f.sql("SELECT reason,snapshot_json FROM transaction_activity_logs WHERE action_type='cancel'")[0];
  assert.ok(audit.reason.length<=255); assert.equal(JSON.parse(audit.snapshot_json).reason,reason.trim());
});

run('stock card and journal list expose the usage document and its branch', t => {
  const f=fixture(t); const doc=ok(f.create({action:'post'}));
  const movements=ok(f.call({endpoint:'stock-movements',query:{itemId:'I1',warehouseId:'W1'}}));
  const movement=movements.find(row=>row.referenceType==='item_usage');
  assert.equal(movement.referenceId,doc.id); assert.equal(movement.referenceNumber,doc.usageNumber);
  assert.equal(movement.outgoing,2); assert.equal(movement.balance,11);
  const journals=ok(f.call({endpoint:'journal-entries',query:{from:f.today,to:f.today,sourceType:['item_usage']}}));
  assert.equal(journals[0].transactionNumber,doc.usageNumber); assert.equal(journals[0].branchId,'B1');
});

run('schema and initial permissions bootstrap is repeatable and respects later revocation', t => {
  const f=fixture(t); ok(f.call({op:'bootstrap'}));
  const permissions=JSON.parse(f.sql("SELECT permissions FROM roles WHERE id='ADMIN'")[0].permissions);
  assert.ok(permissions.includes('item_usage:post')); assert.ok(permissions.includes('item_usage:cancel'));
  f.sql("UPDATE roles SET permissions=? WHERE id='STAFF'", [JSON.stringify(['item:view','item:create'])]);
  ok(f.call({op:'permissions'}));
  const staffPermissions=JSON.parse(f.sql("SELECT permissions FROM roles WHERE id='STAFF'")[0].permissions);
  assert.ok(staffPermissions.includes('item_usage:view'));
  assert.ok(staffPermissions.includes('item_usage:create'));
  assert.ok(staffPermissions.includes('item_usage:edit'));
  assert.ok(staffPermissions.includes('item_usage:post'));
  assert.ok(!staffPermissions.includes('item_usage:cancel'));
  f.sql("UPDATE roles SET permissions='[]' WHERE id='ADMIN'");
  ok(f.call({op:'bootstrap'}));
  assert.deepEqual(JSON.parse(f.sql("SELECT permissions FROM roles WHERE id='ADMIN'")[0].permissions),[]);
});
