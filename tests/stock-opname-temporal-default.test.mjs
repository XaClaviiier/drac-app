import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const fixture=fileURLToPath(new URL('./fixtures/stock-opname-temporal-default.php',import.meta.url));
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function serialize(metadata) {
  const result=spawnSync(process.env.PHP_BINARY || 'php',[fixture,JSON.stringify(metadata)],{encoding:'utf8'});
  assert.ifError(result.error);
  assert.equal(result.status,0,result.stderr || result.stdout);
  assert.equal(result.stderr,'');
  return JSON.parse(result.stdout);
}
for(const type of ['datetime','timestamp','datetime(3)','timestamp(6)']) {
  for(const value of ['CURRENT_TIMESTAMP','current_timestamp()','CURRENT_TIMESTAMP(0)','CURRENT_TIMESTAMP(3)','CURRENT_TIMESTAMP(6)']) {
    test(`${type} keeps ${value} executable and preserves ON UPDATE`,()=>{
      assert.equal(serialize({COLUMN_TYPE:type,COLUMN_DEFAULT:value,EXTRA:'on update CURRENT_TIMESTAMP'}),`${type} NOT NULL DEFAULT ${value} on update CURRENT_TIMESTAMP`);
    });
  }
}
for(const [type,value] of [
  ['varchar(30)','CURRENT_TIMESTAMP'],['varchar(30)','CURRENT_TIMESTAMP(6)'],['date','CURRENT_TIMESTAMP'],
  ['datetime','2026-08-10 12:34:56'],['datetime','CURRENT_TIMESTAMP(7)'],['datetime','CURRENT_TIMESTAMP(10)'],
  ['datetime','CURRENT_TIMESTAMP(03)'],['datetime','CURRENT_TIMESTAMP; DROP TABLE x'],
  ['datetime','CURRENT_TIMESTAMP\n'],['datetime',"CURRENT_TIMESTAMP'"],['datetime','NOW()'],
]) {
  test(`${type} quotes literal or unrecognized default ${JSON.stringify(value)}`,()=>{
    const quoted="'"+value.replaceAll('\\','\\\\').replaceAll("'","\\'")+"'";
    assert.equal(serialize({COLUMN_TYPE:type,COLUMN_DEFAULT:value}),`${type} NOT NULL DEFAULT ${quoted}`);
  });
}
test('NULL and literal charset/comment metadata remain unchanged',()=>{
  assert.equal(serialize({COLUMN_DEFAULT:null,IS_NULLABLE:'YES'}),'datetime NULL DEFAULT NULL');
  assert.equal(serialize({COLUMN_DEFAULT:null}),'datetime NOT NULL');
  assert.equal(serialize({COLUMN_TYPE:'varchar(30)',COLUMN_DEFAULT:'CURRENT_TIMESTAMP',CHARACTER_SET_NAME:'utf8mb4',COLLATION_NAME:'utf8mb4_unicode_ci',COLUMN_COMMENT:"owner's timestamp"}),"varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'CURRENT_TIMESTAMP' COMMENT 'owner\\'s timestamp'");
});
test('real MySQL 5.7 CI gate covers both ownership paths and exact SHOW CREATE roundtrip',()=>{
  const workflow=read('.github/workflows/verify-work-order-estimate.yml');
  const fixture=read('tests/fixtures/stock-opname-temporal-default-mysql.php');
  assert.match(workflow,/image: mysql:5\.7/);
  assert.match(workflow,/php tests\/fixtures\/stock-opname-temporal-default-mysql\.php/);
  assert.ok(fixture.includes("foreach (['standalone','runtime'] as $path)"));
  assert.match(fixture,/ensureOwnedStockOpnameColumn\(\$pdo/);
  assert.match(fixture,/runTemporalSqlFile\('migrate_stock_opname_history\.sql'\)/);
  assert.match(fixture,/runTemporalSqlFile\('rollback_stock_opname_history\.sql'\)/);
  assert.match(fixture,/SHOW CREATE TABLE stock_count_result_items/);
  assert.ok(fixture.includes('temporalDefinitions($pdo)===$before'));
  assert.match(fixture,/ON UPDATE CURRENT_TIMESTAMP/);
});
test('standalone serializer restricts expressions to temporal types and bounded precision, keeping QUOTE fallback and EXTRA',()=>{
  const sql=read('database/migrate_stock_opname_history.sql');
  const serializer=sql.slice(sql.indexOf('CREATE PROCEDURE `record_stock_opname_column_ownership`'),sql.indexOf('CREATE TABLE IF NOT EXISTS `inventory_import_batches`'));
  assert.match(serializer,/c\.DATA_TYPE IN \('datetime','timestamp'\)/);
  assert.ok(serializer.includes("UPPER(c.COLUMN_DEFAULT) REGEXP '^CURRENT_TIMESTAMP([(][0-6]?[)])?$'"));
  assert.match(serializer,/THEN CONCAT\(' DEFAULT ',c\.COLUMN_DEFAULT\)/);
  assert.match(serializer,/ELSE CONCAT\(' DEFAULT ',QUOTE\(c\.COLUMN_DEFAULT\)\)/);
  assert.match(serializer,/IF\(c\.EXTRA='','',CONCAT\(' ',c\.EXTRA\)\)/);
});
