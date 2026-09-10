import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const run=(row,current=8)=>{
  const result=spawnSync('php',[fileURLToPath(new URL('./fixtures/adjustment-values.php',import.meta.url)),JSON.stringify({row,current})],{encoding:'utf8'});
  assert.ifError(result.error);assert.equal(result.status,0,result.stderr);
  return JSON.parse(result.stdout);
};
test('Atur Stok derives a decrease to zero from locked stock, ignoring client delta',()=>{
  assert.deepEqual(run({targetQuantity:0,stockBefore:8,quantity:999,unitCost:'1200.125',lineNotes:'Hitung fisik'}),{success:true,values:[-8,'1200.125',0,8,'Hitung fisik']});
});
test('Atur Stok rejects a stale snapshot before any stock mutation',()=>{
  const result=run({targetQuantity:10,stockBefore:8},9);assert.equal(result.success,false);assert.equal(result.status,409);
});
test('Atur Stok supports increases and no-change targets',()=>{
  assert.equal(run({targetQuantity:12,stockBefore:8}).values[0],4);
  assert.equal(run({targetQuantity:8,stockBefore:8}).values[0],0);
});
test('signed adjustments preserve their delta and optional cost',()=>{
  assert.deepEqual(run({quantity:-2,unitCost:1500}).values,[-2,'1500',null,null,'']);
});
for(const [name,row] of Object.entries({negativeCost:{quantity:1,unitCost:-1},excessPrecision:{quantity:1,unitCost:'1.00001'},overflowCost:{quantity:1,unitCost:'1000000000000'},fractionalStock:{targetQuantity:1.5,stockBefore:8},negativeTarget:{targetQuantity:-1,stockBefore:8},overflowDelta:{targetQuantity:2147483647,stockBefore:-8}})){
  test(`adjustment rejects ${name}`,()=>assert.equal(run(row,name==='overflowDelta'?-8:8).success,false));
}
