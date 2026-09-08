import test from 'node:test';
for(const source of ['0','BR-1','00','0123','123'])for(const scenario of [
 {name:'POST received',method:'POST'},
 {name:'PUT apply'},
 {name:'PUT edit',oldStatus:'Diterima'},
 {name:'PUT cancel',oldStatus:'Diterima',body:()=>body(4,'Batal')},
 {name:'DELETE received',method:'DELETE',oldStatus:'Diterima'},
])test(`${scenario.name} preserves ${JSON.stringify(source)} stock/journal identity`,()=>{
 const {name,body:makeBody,...options}=scenario;
 const r=run({source,...options,...(makeBody?{body:makeBody()}: {})});
 assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.committed,true);parity(r,source);
});
for(const method of ['PUT','DELETE'])for(const source of ['0','00','0123'])test(`${method} rejects locked source revocation for ${source}`,()=>{
 const r=run({method,source,oldStatus:'Diterima',lockedMemberships:['DEST',source==='0'?'00':source==='00'?'0':'123']});
 assert.equal(r.status,403,JSON.stringify(r));assert.equal(r.rolledBack,true);assert.equal(r.committed,false);assert.deepEqual(r.state,r.initial);
});
for(const input of [
 {name:'apply source shortage',sourceStock:2},
 {name:'edit source shortage after undo',oldStatus:'Diterima',body:()=>body(21)},
 {name:'edit destination shortage',oldStatus:'Diterima',destinationStock:1},
 {name:'delete destination shortage',method:'DELETE',oldStatus:'Diterima',destinationStock:1},
 {name:'edit permission revoked',permissions:[],oldStatus:'Diterima'},
 {name:'delete permission revoked',method:'DELETE',permissions:[],oldStatus:'Diterima'},
 {name:'delete invoiced',method:'DELETE',oldStatus:'Diterima',linkedInvoices:1},
])test(`${input.name} rolls back all modeled business state`,()=>{
 const {name,body:makeBody,...options}=input;const r=run({...options,...(makeBody?{body:makeBody()}: {})});
 assert.equal(r.status,options.permissions?403:options.method==='DELETE'?409:422,JSON.stringify(r));assert.equal(r.rolledBack,true);assert.equal(r.committed,false);assert.deepEqual(r.state,r.initial);
});
test('notes-only received edit leaves balances, versions and journal unchanged',()=>{
 const r=run({oldStatus:'Diterima',body:{...body(4),notes:'Updated note'}});assert.equal(r.status,200,JSON.stringify(r));
 for(const key of ['warehouse','branch','itemStock','movements','versions'])assert.deepEqual(r.state[key],r.initial[key]);
 parity(r);
});
test('DELETE restores received zero source and voids journal',()=>{
 const r=run({method:'DELETE',oldStatus:'Diterima'});assert.equal(r.status,200,JSON.stringify(r));
 assert.deepEqual(r.state.warehouse,{src:20,dst:0});parity(r);assert.equal(r.state.receipt,null);
});
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const fixture=fileURLToPath(new URL('./fixtures/receipt-zero-source-stock-runtime.php',import.meta.url));
const php=process.env.PHP_BINARY||'php';
const probe=spawnSync(php,['-r','echo json_encode([extension_loaded("mbstring"),dirname(PHP_BINARY),PHP_OS_FAMILY]);'],{encoding:'utf8'});
assert.ifError(probe.error);assert.equal(probe.status,0,probe.stderr);
const [mb,dir,os]=JSON.parse(probe.stdout);
const args=!mb&&os==='Windows'?['-d',`extension_dir=${dir}/ext`,'-d','extension=mbstring']:[];
const body=(qty=6,status='Diterima')=>({receiptNumber:'GR-TEST',date:'2026-09-08',branchId:'DEST',warehouseId:'dst',sourceType:'Transfer Gudang',sourceWarehouseId:'src',receivedById:'receiver',status,items:[{itemId:'item',qty}]});
function run(input={}) {
 const p=spawnSync(php,[...args,fixture,JSON.stringify({body:body(),...input})],{encoding:'utf8'});
 assert.ifError(p.error);assert.equal(p.status,0,p.stderr||p.stdout);assert.equal(p.stderr,'');return JSON.parse(p.stdout);
}
function parity(r,source='0') {
 const delta={src:0,dst:0};
 for(const m of r.state.movements.filter(m=>!m.is_voided)) {delta[m.source_warehouse_id]-=m.quantity;delta[m.destination_warehouse_id]+=m.quantity;}
 assert.deepEqual(r.state.warehouse,{src:20+delta.src,dst:delta.dst},'physical balances must equal opening plus active journal');
 assert.deepEqual(r.state.branch,{['b:'+source]:[r.state.warehouse.src,r.state.warehouse.src],'b:DEST':[r.state.warehouse.dst,r.state.warehouse.dst]});
 assert.equal(r.state.itemStock,r.state.warehouse.src);
}
test('PUT Draft to received debits exact zero source and balances journal',()=>{
 const r=run();assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.committed,true);
 assert.deepEqual(r.state.warehouse,{src:14,dst:6});parity(r);
});
test('PUT received edit restores old zero-source quantity before applying replacement',()=>{
 const r=run({oldStatus:'Diterima'});assert.equal(r.status,200,JSON.stringify(r));
 assert.deepEqual(r.state.warehouse,{src:14,dst:6});parity(r);
 assert.equal(r.state.movements.filter(m=>m.is_voided).length,1);
 assert.equal(r.state.movements.filter(m=>!m.is_voided).length,1);
});
