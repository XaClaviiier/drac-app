import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const fixture=fileURLToPath(new URL('./fixtures/warehouse-transfer-correction.php',import.meta.url));
const run=input=>{const r=spawnSync(process.env.PHP_BINARY||'php',[fixture,JSON.stringify(input)],{encoding:'utf8'});assert.equal(r.status,0,r.stderr||r.error?.message);return JSON.parse(r.stdout)};
const request=(items,revision=0)=>({revision,reason:'Koreksi salah input',items:items.map(([itemId,qty])=>({itemId,qty}))});
test('received correction updates only delta, both stocks, quantities and audit',()=>{
 const r=run({requests:[request([['A',7]])]});assert.equal(r.results[0].success,true,JSON.stringify(r.results));
 assert.equal(r.state.stock['S:A'],8);assert.equal(r.state.stock['D:A'],7);
 assert.equal(r.state.branch['BS:A'],8);assert.equal(r.state.branch['BD:A'],7);
 assert.equal(r.state.lines[0].qty_sent,7);assert.equal(r.state.lines[0].qty_received,7);
 assert.equal(r.state.header.status,'Diterima');assert.equal(r.state.header.transfer_number,'TRF-1');
 assert.equal(r.state.movements.length,1);assert.equal(r.state.movements[0][4],2);
 const audit=JSON.parse(r.state.logs[0][3]);assert.equal(audit.before[0].qty_sent,5);assert.equal(audit.after[0].qty_sent,7);
});
test('reduce received qty returns difference to origin',()=>{
 const r=run({requests:[request([['A',2]])]});assert.equal(r.results[0].success,true);
 assert.equal(r.state.stock['S:A'],13);assert.equal(r.state.stock['D:A'],2);
 assert.equal(r.state.movements[0][2],'D');assert.equal(r.state.movements[0][3],'S');
});
test('replace item reverses removed item and transfers new item',()=>{
 const r=run({requests:[request([['B',3]])]});assert.equal(r.results[0].success,true);
 assert.deepEqual(r.state.stock,{'S:A':15,'D:A':0,'S:B':7,'D:B':3});assert.equal(r.state.lines.length,1);assert.equal(r.state.lines[0].item_id,'B');
});
for(const [label,input] of [
 ['non-admin',{role:'STAFF'}],
 ['destination branch inaccessible',{branches:['BS']}],
 ['not fully received',{status:'Dalam Perjalanan'}],
 ['insufficient destination stock',{destinationStock:1,requests:[request([['A',2]])]}],
 ['insufficient origin stock',{requests:[request([['A',16]])]}],
 ['empty reason',{requests:[{...request([['A',7]]),reason:' '}]}],
 ['empty lines',{requests:[request([])]}],
 ['fractional quantity',{requests:[request([['A',2.5]])]}],
 ['duplicate item',{requests:[request([['A',2],['A',3]])]}],
 ['inactive added item',{inactive:['B'],requests:[request([['B',2]])]}],
 ['audit failure rolls back all writes',{failAudit:true}],
]){
 test(label+' leaves document and stock unchanged',()=>{const r=run(input);assert.equal(r.results[0].success,false);assert.deepEqual(r.state,r.initial)});
}
test('stale retry cannot apply the same correction twice',()=>{
 const r=run({requests:[request([['A',7]]),request([['A',7]])]});assert.equal(r.results[0].success,true);assert.equal(r.results[1].code,409);assert.equal(r.state.stock['D:A'],7);assert.equal(r.state.logs.length,1);
});
test('subsequent correction uses new revision and cumulative delta',()=>{
 const r=run({requests:[request([['A',7]]),request([['A',4]],1)]});assert.ok(r.results.every(x=>x.success));assert.equal(r.state.stock['D:A'],4);assert.equal(r.state.stock['S:A'],11);
});
test('inactive existing item can be reduced',()=>{
 const r=run({inactive:['A'],requests:[request([['A',2]])]});assert.equal(r.results[0].success,true);
});
