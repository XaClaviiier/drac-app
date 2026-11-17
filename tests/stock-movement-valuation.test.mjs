import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const run=(rows,options={})=>{
  const result=spawnSync(process.env.PHP_BINARY||'php',['tests/fixtures/stock-movement-view.php',JSON.stringify({rows,query:{itemId:'I1',dateFrom:'2026-11-16'},...options})],{encoding:'utf8'});
  assert.ifError(result.error);assert.equal(result.status,0,result.stderr);assert.equal(result.stderr,'');
  return JSON.parse(result.stdout);
};
const move=(id,sequence,source,destination,quantity,type='receipt',extra={})=>({id,movement_sequence:sequence,item_id:'I1',source_warehouse_id:source,destination_warehouse_id:destination,quantity,movement_type:type,reference_type:'goods_receipt',reference_id:'GR',reference_number:'GR-C-2026-0033',unit_cost:100,notes:'Penerimaan barang',created_at:'2026-11-16 10:00:00',occurred_at:'2026-11-16 10:00:00',...extra});
const receipt=move('RECEIPT',3,null,'W1',10);
const pair=(line='L1',sequence=4,warehouse='W1',before=100,after=200,cancel=false)=>{
  const type=cancel?'cost_adjustment_reversal':'cost_adjustment';
  const common={reference_type:'stock_adjustment',reference_id:'ADJ1',reference_number:'ADJ-2611-0001',correction_group_id:'ADJ1',occurred_at:cancel?'2026-11-17 12:00:00':'2026-11-16 12:00:00'};
  return [move(`${line}-OUT-${sequence}`,sequence,warehouse,null,13,type,{...common,unit_cost:before,notes:cancel?'Pembatalan penyesuaian HPP':'Penyesuaian HPP: nilai lama',idempotency_key:`HPP:${line}:${cancel?'CANCEL_':''}OUT`}),
    move(`${line}-IN-${sequence}`,sequence+1,null,warehouse,13,type,{...common,unit_cost:after,notes:cancel?'Pemulihan HPP sebelumnya':'Penyesuaian HPP: nilai baru',idempotency_key:`HPP:${line}:${cancel?'CANCEL_':''}IN`})];
};
test('image example: one HPP row, zero physical movement, unchanged 15-unit balance and 5-unit opening',()=>{
  const result=run([receipt,...pair()]);assert.equal(result.status,200);
  assert.equal(result.data.length,2);
  const [hpp,gr]=result.data;
  assert.deepEqual(hpp.valuation,{quantity:13,unitCostBefore:100,unitCostAfter:200,complete:true});
  assert.deepEqual([hpp.incoming,hpp.outgoing,hpp.balance],[0,0,15]);
  assert.deepEqual([gr.incoming,gr.outgoing,gr.balance],[10,0,15]);
  assert.equal(gr.balance-gr.incoming+gr.outgoing,5);
  assert.equal(hpp.sourceWarehouseId,null);assert.equal(hpp.destinationWarehouseId,'W1');
  assert.equal(hpp.referenceId,'ADJ1');assert.equal(hpp.referenceNumber,'ADJ-2611-0001');
  assert.ok(result.queries.every(query=>query.startsWith('SELECT ')));
});
test('warehouse filter retains zero-quantity HPP row without including another warehouse',()=>{
  const result=run([receipt,...pair()],{query:{itemId:'I1',warehouseId:'W1'}});
  assert.deepEqual(result.data.map(row=>row.balance),[13,13]);
  assert.equal(result.data[0].valuation.complete,true);
  assert.deepEqual(run([receipt,...pair()],{query:{itemId:'I1',warehouseId:'W2'}}).data,[]);
});
for(const search of ['nilai lama','nilai baru','ADJ-2611-0001','Penyesuaian HPP'])test(`search ${search} retains the complete valuation pair`,()=>{
  const {data}=run([receipt,...pair()],{query:{itemId:'I1',search}});
  assert.equal(data.length,1);assert.equal(data[0].balance,15);assert.equal(data[0].valuation.complete,true);
  assert.deepEqual([data[0].valuation.unitCostBefore,data[0].valuation.unitCostAfter],[100,200]);
});
test('historical date filtering reconstructs balances from physical movements only',()=>{
  const opening=move('OPEN',1,null,'W1',5,'receipt',{occurred_at:'2026-11-15 10:00:00'});
  const {data}=run([opening,receipt,...pair()],{query:{itemId:'I1',dateTo:'2026-11-15'}});
  assert.equal(data.length,1);assert.equal(data[0].balance,5);
});
test('cancellation is its own zero-quantity row and reverses the displayed HPP direction',()=>{
  const {data}=run([receipt,...pair(),...pair('L1',6,'W1',200,100,true)]);
  assert.equal(data.length,3);
  assert.equal(data[0].movementType,'cost_adjustment_reversal');
  assert.deepEqual(data[0].valuation,{quantity:13,unitCostBefore:200,unitCostAfter:100,complete:true});
  assert.deepEqual(data.map(row=>row.balance),[15,15,15]);
  assert.equal(data.reduce((sum,row)=>sum+row.incoming,0),10);
  assert.equal(data.reduce((sum,row)=>sum+row.outgoing,0),0);
});
test('a cancellation pair that crosses midnight stays together under a date filter',()=>{
  const cancel=pair('L1',6,'W1',200,100,true);cancel[0].occurred_at='2026-11-16 23:59:59';cancel[1].occurred_at='2026-11-17 00:00:00';
  const {data}=run([...pair(),...cancel],{query:{itemId:'I1',dateFrom:'2026-11-17'}});
  assert.equal(data.length,1);assert.equal(data[0].valuation.complete,true);
});
test('separate valuation lines and warehouses are never merged',()=>{
  const {data}=run([...pair('L1'),...pair('L2',6,'W1',200,300),...pair('L3',8,'W2',100,150)]);
  assert.equal(data.length,3);assert.deepEqual(data.map(row=>row.valuation.unitCostAfter),[150,300,200]);
  assert.deepEqual(data.map(row=>row.balance),[15,15,15]);
});
test('pair matching does not depend on IN/OUT sequence order',()=>{
  const rows=pair();rows[0].movement_sequence=10;
  const {data}=run(rows);assert.equal(data.length,1);
  assert.deepEqual([data[0].valuation.unitCostBefore,data[0].valuation.unitCostAfter],[100,200]);
});
test('legacy pair without idempotency keys is grouped only when unambiguous',()=>{
  const rows=pair().map(({idempotency_key,...row})=>row);
  assert.equal(run(rows).data.length,1);
  const duplicate=pair('L2',8).map(({idempotency_key,...row})=>row);
  const ambiguous=run([...rows,...duplicate]).data;
  assert.equal(ambiguous.length,4);assert.ok(ambiguous.every(row=>!row.valuation.complete&&row.incoming===0&&row.outgoing===0));
});
test('incomplete or unequal pairs do not invent costs or change physical balances',()=>{
  const rows=pair();rows[1].quantity=12;
  const {data}=run(rows);assert.equal(data.length,2);assert.ok(data.every(row=>!row.valuation.complete&&row.balance===15));
  const single=run([rows[1]]).data[0];assert.equal(single.valuation.unitCostBefore,null);assert.equal(single.valuation.unitCostAfter,200);
});
test('unknown costs stay unknown and fractional HPP precision is preserved',()=>{
  const {data}=run(pair('L1',4,'W1',null,123.4567));
  assert.equal(data[0].valuation.unitCostBefore,null);assert.equal(data[0].valuation.unitCostAfter,123.4567);
});
test('branch access excludes restricted movements and balances before grouping',()=>{
  const rows=[...pair(),...pair('L3',8,'W3',999,888)];
  const {data}=run(rows,{stocks:{W1:13,W2:2,W3:7}});
  assert.equal(data.length,1);assert.equal(data[0].balance,15);
  assert.equal(run(rows,{query:{itemId:'I1',warehouseId:'W3'}}).status,403);
});
test('ordinary stock viewers see the single HPP row without privileged cost values',()=>{
  const row=run(pair(),{admin:false}).data[0];
  assert.deepEqual(row.valuation,{quantity:13,complete:true});
  assert.equal(row.unitCost,null);assert.equal(row.unit_cost,null);assert.equal(row.balance,15);
  const authorized=run(pair(),{admin:false,permissions:['stock_adjustment:hpp']}).data[0];
  assert.equal(authorized.valuation.unitCostBefore,100);assert.equal(authorized.valuation.unitCostAfter,200);
});
test('legacy negative receipt reversal still counts as a physical outgoing movement',()=>{
  const reversal=move('REV',4,null,'W1',-5,'reversal');
  const {data}=run([receipt,reversal],{stocks:{W1:5,W2:0}});
  assert.deepEqual(data.map(row=>[row.incoming,row.outgoing,row.balance]),[[0,5,5],[10,0,10]]);
});
test('warehouse transfer directions remain unchanged and only the matching leg is shown',()=>{
  const rows=[move('SEND',1,'W1','W2',5,'transfer_send'),move('RECEIVE',2,'W1','W2',5,'transfer_receive')];
  const {data}=run(rows,{query:{itemId:'I1',warehouseId:'W1'},stocks:{W1:8,W2:7}});
  assert.equal(data.length,1);assert.deepEqual([data[0].incoming,data[0].outgoing,data[0].balance],[0,5,8]);
});
