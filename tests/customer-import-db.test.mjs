import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const enabled = Boolean(process.env.CUSTOMER_IMPORT_TEST_PORT);
const php=process.env.PHP_BINARY || 'php';
const fixture='tests/fixtures/customer-import-db.php';
function call(input) {
  const p=spawnSync(php,[fixture],{input:JSON.stringify(input),encoding:'utf8'}); assert.ifError(p.error); assert.equal(p.status,0,p.stderr); assert.equal(p.stderr,''); return JSON.parse(p.stdout);
}
function asyncCall(input) {
  return new Promise((resolve,reject)=>{const p=spawn(php,[fixture]);let out='',err='';p.stdout.on('data',v=>out+=v);p.stderr.on('data',v=>err+=v);p.on('error',reject);p.on('close',code=>code || err ? reject(new Error(err || String(code))):resolve(JSON.parse(out)));p.stdin.end(JSON.stringify(input));});
}
const row=(rowNumber,name,phone,category='Umum')=>({rowNumber,name,phone,category});
const payload=rows=>({rows,branchId:'BR-TEST',source:'synthetic.csv',runId:randomUUID()});
const prepare=rows=>{const p=payload(rows);return {...p,digest:call({...p,action:'preview'}).digest};};
test('MySQL atomic import, category read-back, audit, existing skip, retry, failure and concurrent replay', {skip:!enabled && 'Set CUSTOMER_IMPORT_TEST_PORT to a disposable loopback MySQL instance'},async()=>{
  assert.equal(call({action:'setup'}).ok,true);
  const p=prepare([row(2,'ALI','081234567890','Cakalang'),row(3,'Ali','+6281234567890','Hertasning'),row(4,'BUDI','0800000000')]);
  const empty=call({action:'snapshot'}); assert.equal(empty.customers.length,0); assert.equal(empty.customer_import_runs.length,0);
  const a=call({...p,action:'execute'}); assert.equal(a.verified,true);assert.equal(a.counts.created,1);assert.equal(a.counts.duplicate,1);assert.equal(a.counts.invalid,1);
  const snapshot=call({action:'snapshot'});assert.equal(snapshot.customers.length,1);assert.deepEqual(JSON.parse(snapshot.customers[0].categories),['Cakalang','Hertasning']); assert.equal(snapshot.customer_people.length,1);assert.equal(snapshot.customer_person_roles.length,3);
  assert.equal(JSON.parse(snapshot.customer_import_runs[0].result_json).length,3);
  assert.deepEqual(call({...p,action:'execute'}),a);assert.deepEqual(call({action:'snapshot'}),snapshot);
  assert.match(call({...p,rows:[row(2,'CHANGED','081234567890')],action:'execute'}).error,/payload/);
  const existing=prepare([row(2,'ALI','081234567890','Other')]);
  assert.equal(call({...existing,action:'execute'}).counts.existing,1);assert.deepEqual(call({action:'snapshot'}).customers,snapshot.customers);
  const failed=prepare([row(2,'GAGAL','081234567891')]); const before=call({action:'snapshot'});call({action:'failure'});
  assert.match(call({...failed,action:'execute'}).error,/Injected/); assert.deepEqual(call({action:'snapshot'}),before);call({action:'clear-failure'});
  assert.equal(call({...failed,action:'execute'}).counts.created,1);
  const race=prepare([row(2,'BERSAMA','081234567892')]);const results=await Promise.all([asyncCall({...race,action:'execute'}),asyncCall({...race,action:'execute'})]);assert.deepEqual(results[0],results[1]);assert.equal(call({action:'snapshot'}).customers.length,3);
  const stale=prepare([row(2,'BARU','081234567893')]);
  assert.equal(call({...stale,action:'execute'}).counts.created,1);
  assert.match(call({...stale,runId:randomUUID(),action:'execute'}).error,/preview/);assert.equal(call({action:'snapshot'}).customers.length,4);
  const separate=prepare([row(2,'RACE LAIN','081234567894')]);
  const separateResults=await Promise.all([asyncCall({...separate,action:'execute'}),asyncCall({...separate,runId:randomUUID(),action:'execute'})]);
  assert.equal(separateResults.filter(r=>r.verified).length,1);assert.equal(separateResults.filter(r=>r.error?.includes('preview')).length,1);assert.equal(call({action:'snapshot'}).customers.length,5);
  call({action:'corrupt'});assert.match(call({...p,action:'execute'}).error,/baca ulang/);
});
