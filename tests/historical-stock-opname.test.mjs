import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const endpoint = read('api/endpoints/stock-opnames.php');
const helpers = read('api/helpers.php');
const page = read('src/pages/StockCountSheetReport.tsx');
const migration = read('database/migrate_stock_opname_history.sql');
const migrationWorkflow = read('.github/workflows/verify-work-order-estimate.yml');
const salesInvoices = read('api/endpoints/sales-invoices.php');
const allData = read('api/endpoints/all-data.php');
const goodsReceipts = read('api/endpoints/goods-receipts.php');
const itemsEndpoint = read('api/endpoints/items.php');
const stockAdjustments = read('api/endpoints/stock-adjustments.php');
const stockMovements = read('api/endpoints/stock-movements.php');
const warehouseTransfers = read('api/endpoints/warehouse-transfers.php');
const dataMaintenance = read('api/endpoints/data-maintenance.php');
const warehousesEndpoint = read('api/endpoints/warehouses.php');
const branchesEndpoint = read('api/endpoints/branches.php');
const rollback = read('database/rollback_stock_opname_history.sql');
const apiIndex = read('api/index.php');
const openingStockImport = read('src/pages/OpeningStockImport.tsx');

test('Perintah Stok Opname menerima periode historis yang berakhir paling lambat hari ini', () => {
  assert.match(helpers, /stock_count_orders[\s\S]*?end_date DATE/);
  assert.match(endpoint, /\$endDate=trim\(\(string\)\(\$d\['endDate'\]/);
  assert.match(endpoint, /\$startDate>\$endDate/);
  assert.match(endpoint, /\$endDate>date\('Y-m-d'\)/);
  assert.match(endpoint, /DateTimeImmutable::createFromFormat\('!Y-m-d'/);
  assert.doesNotMatch(endpoint, /\$startDate<date\('Y-m-d'\)/);
  assert.match(endpoint, /'endDate'=>\(string\)\$row\['end_date'\]/);
  assert.match(page, /endDate:(?:localDateKey\(\)|today)/);
  assert.match(page, /Tanggal Akhir \/ Tanggal Opname/);
  assert.match(page, /max=\{localDateKey\(\)\}/);
  assert.doesNotMatch(page, /min=\{localDateKey\(\)\}/);
});

test('snapshot opname menyimpan In Out dan stok historis dari jurnal aktif', () => {
  assert.doesNotMatch(helpers, /ALTER TABLE stock_count_result_items ADD COLUMN IF NOT EXISTS/);
  assert.match(helpers, /stock_count_result_items[\s\S]*?system_version BIGINT UNSIGNED NOT NULL DEFAULT 0/);
  assert.match(helpers, /stock_count_result_items[\s\S]*?movement_in BIGINT UNSIGNED NOT NULL DEFAULT 0/);
  assert.match(helpers, /stock_count_result_items[\s\S]*?movement_out BIGINT UNSIGNED NOT NULL DEFAULT 0/);
  assert.match(endpoint, /JOIN stock_movements m[\s\S]*?m\.is_voided=0/);
  assert.match(endpoint, /COALESCE\(m\.occurred_at,m\.created_at\)/);
  assert.match(endpoint, /movement_type<>'transfer_send'/);
  assert.match(endpoint, /movement_type<>'transfer_receive'/);
  assert.match(endpoint, /'movementIn'=>\(int\)\$row\['movement_in'\]/);
  assert.match(endpoint, /'movementOut'=>\(int\)\$row\['movement_out'\]/);
  assert.match(page, />In<\/th>/);
  assert.match(page, />Out<\/th>/);
  assert.match(page, />Stok<\/th>/);
  assert.match(page, />Opname<\/th>/);
  assert.match(page, />Selisih<\/th>/);
});

test('rekonstruksi stok historis menghitung pasangan kirim dan terima tepat satu kali per gudang', () => {
  const snapshot = endpoint.slice(endpoint.indexOf('$loadItemSnapshots='), endpoint.indexOf('$mapOrder='));
  const systemQuantity = snapshot.slice(snapshot.indexOf('(COALESCE(ws.quantity,0)'), snapshot.indexOf('AS system_qty'));
  assert.match(systemQuantity, /m\.destination_warehouse_id=\? AND m\.movement_type<>'transfer_send'/);
  assert.match(systemQuantity, /m\.source_warehouse_id=\? AND m\.movement_type<>'transfer_receive'/);

  const movements = [
    { type: 'transfer_send', source: 'SOURCE', destination: 'DESTINATION', quantity: 5 },
    { type: 'transfer_receive', source: 'SOURCE', destination: 'DESTINATION', quantity: 5 },
  ];
  const historicalFromCurrent = (current, warehouse) => movements.reduce((stock, movement) => {
    const laterIn = movement.destination === warehouse && movement.type !== 'transfer_send' ? movement.quantity : 0;
    const laterOut = movement.source === warehouse && movement.type !== 'transfer_receive' ? movement.quantity : 0;
    return stock - laterIn + laterOut;
  }, current);

  assert.equal(historicalFromCurrent(10, 'DESTINATION'), 5);
  assert.equal(historicalFromCurrent(5, 'SOURCE'), 10);
});

test('snapshot historis mengklasifikasikan mutasi saldo awal legacy negatif sesuai arah nyata', () => {
  const snapshot = endpoint.slice(endpoint.indexOf('$loadItemSnapshots='), endpoint.indexOf('$mapOrder='));
  assert.match(snapshot, /destination_warehouse_id=\?[\s\S]*?m\.quantity>=0[\s\S]*?source_warehouse_id=\?[\s\S]*?m\.quantity<0 THEN -m\.quantity/);
  assert.match(snapshot, /source_warehouse_id=\?[\s\S]*?m\.quantity>=0[\s\S]*?destination_warehouse_id=\?[\s\S]*?m\.quantity<0 THEN -m\.quantity/);
});

test('migration standalone menambah atau memperbaiki system_version snapshot', () => {
  assert.match(migration, /ADD COLUMN `system_version` BIGINT UNSIGNED NOT NULL DEFAULT 0/);
  assert.match(migration, /MODIFY `system_version` BIGINT UNSIGNED NOT NULL DEFAULT 0/);
  const fixture = migrationWorkflow.slice(migrationWorkflow.indexOf('CREATE TABLE stock_count_result_items'), migrationWorkflow.indexOf('CREATE TABLE stock_count_results'));
  assert.match(fixture, /system_version INT NULL DEFAULT NULL/);
  assert.match(migrationWorkflow, /SYSTEM_VERSION_COUNT[\s\S]*?COLUMN_NAME='system_version'[\s\S]*?test "\$SYSTEM_VERSION_COUNT" = "1"/);
});

test('migration menolak index bernama sama yang ownership-nya tidak diketahui', () => {
  assert.match(helpers, /Non_unique[\s\S]*?Seq_in_index[\s\S]*?Column_name[\s\S]*?Sub_part/);
  assert.doesNotMatch(helpers, /DROP INDEX uq_stock_count_result_item/);
  assert.match(helpers, /Index uq_stock_count_result_item memiliki definisi yang tidak kompatibel/);
  const runtimeBootstrap = helpers.slice(helpers.indexOf('function ensureApiSupportTables(PDO $pdo): void'), helpers.indexOf('function grantInitialStockOpnamePermissions'));
  const runtimeIndexPreflight = runtimeBootstrap.indexOf('assertCompatibleStockCountResultItemIndex($pdo);');
  assert.ok(runtimeIndexPreflight >= 0 && runtimeIndexPreflight < runtimeBootstrap.indexOf("ensureOwnedStockOpnameColumn($pdo,'stock_count_orders','end_date'"));
  assert.match(migration, /GROUP_CONCAT\(COLUMN_NAME ORDER BY SEQ_IN_INDEX\)/);
  assert.doesNotMatch(migration, /DROP INDEX `uq_stock_count_result_item`/);
  assert.match(migration, /uq_stock_count_result_item has an incompatible definition/);
  assert.ok(migration.indexOf('uq_stock_count_result_item has an incompatible definition') < migration.indexOf('ALTER TABLE `stock_count_orders` ADD COLUMN'));
  const fixture = migrationWorkflow.slice(migrationWorkflow.indexOf('CREATE TABLE stock_count_result_items'), migrationWorkflow.indexOf('CREATE TABLE stock_count_results'));
  assert.doesNotMatch(fixture, /KEY uq_stock_count_result_item \(item_id\)/);
  assert.match(migrationWorkflow, /drac_bad_index[\s\S]*?KEY uq_stock_count_result_item \(item_id\)[\s\S]*?BAD_INDEX_DEF[\s\S]*?1:item_id:0/);
});

test('migration menolak item snapshot duplikat sebelum feature DDL', () => {
  const duplicateSignal = migration.indexOf('Duplicate stock_count_result_items prevent canonical unique index');
  const firstFeatureDdl = migration.indexOf('ALTER TABLE `stock_count_orders` ADD COLUMN');
  assert.ok(duplicateSignal >= 0 && duplicateSignal < firstFeatureDdl);
  const duplicateStep = migrationWorkflow.slice(
    migrationWorkflow.indexOf('name: Reject duplicate legacy stock opname items'),
    migrationWorkflow.indexOf('name: Verify occurred_at edit bumps stock version'),
  );
  assert.match(duplicateStep, /DUPLICATE_END_DATE_COUNT/);
  assert.match(duplicateStep, /test "\$DUPLICATE_END_DATE_COUNT" = "0"/);
  const runtimeBootstrap = helpers.slice(helpers.indexOf('function ensureApiSupportTables(PDO $pdo): void'), helpers.indexOf('function grantInitialStockOpnamePermissions'));
  const runtimeDuplicatePreflight = runtimeBootstrap.indexOf('assertNoDuplicateStockCountResultItems($pdo);');
  assert.ok(runtimeDuplicatePreflight >= 0 && runtimeDuplicatePreflight < runtimeBootstrap.indexOf('CREATE TABLE IF NOT EXISTS stock_count_orders'));
});

test('dokumen lama memakai tanggal snapshot hasil sebagai Tanggal Akhir', () => {
  assert.match(helpers, /COALESCE\(r\.result_date,o\.start_date\)/);
  assert.match(migration, /COALESCE\(r\.result_date,o\.start_date\)/);
});

test('edit tanggal transaksi membatalkan snapshot melalui stock_version', () => {
  assert.match(helpers, /function bumpStockVersionsForMovementReference\(/);
  assert.match(helpers, /UPDATE warehouse_stocks ws[\s\S]*?stock_version=ws\.stock_version\+1/);
  assert.match(salesInvoices, /\$movementDateChanged[\s\S]*?bumpStockVersionsForMovementReference\(\$pdo,'sales_invoice'/);
  assert.match(goodsReceipts, /\$movementDateChanged[\s\S]*?bumpStockVersionsForMovementReference\(\$pdo,'goods_receipt'/);
});

test('edit tanggal transaksi hanya menaikkan versi pasangan mutasi aktif', () => {
  const bumpHelper = helpers.slice(
    helpers.indexOf('function bumpStockVersionsForMovementReference'),
    helpers.indexOf('function adjustWarehouseStockAllowNegative'),
  );
  assert.equal((bumpHelper.match(/is_voided=0/g) || []).length, 2);
  assert.match(migrationWorkflow, /is_voided TINYINT\(1\) NOT NULL DEFAULT 0/);
  assert.match(migrationWorkflow, /is_voided[\s\S]*?MOV-VOID[\s\S]*?8,4,11/);
});

test('bootstrap runtime memperbaiki end_date nullable walaupun kolom sudah ada', () => {
  assert.match(helpers, /SHOW COLUMNS FROM stock_count_orders LIKE 'end_date'/);
  assert.match(helpers, /UPDATE stock_count_orders o LEFT JOIN stock_count_results r ON r\.order_id=o\.id SET o\.end_date=COALESCE\(r\.result_date,o\.start_date\) WHERE o\.end_date IS NULL/);
  assert.match(helpers, /\['Null'\]\s*===\s*'YES'[\s\S]*?ALTER TABLE stock_count_orders MODIFY end_date DATE NOT NULL/);
  assert.match(migrationWorkflow, /end_date DATE NULL[\s\S]*?SC-PARTIAL[\s\S]*?END_DATE_NULLABLE[\s\S]*?test "\$END_DATE_NULLABLE" = "NO"/);
});

test('schema snapshot historis memperbaiki kolom parsial ke postcondition canonical', () => {
  for (const column of ['movement_in', 'movement_out']) {
    assert.match(helpers, new RegExp(`${column} BIGINT UNSIGNED NOT NULL DEFAULT 0`));
    assert.match(migration, new RegExp('MODIFY [`]?' + column + '[`]? BIGINT UNSIGNED NOT NULL DEFAULT 0'));
  }
  assert.match(helpers, /UPDATE stock_count_orders SET include_zero_unused=1 WHERE include_zero_unused IS NULL/);
  assert.match(helpers, /ALTER TABLE stock_count_orders MODIFY include_zero_unused TINYINT\(1\) NOT NULL DEFAULT 1/);
  assert.match(helpers, /UPDATE stock_count_result_items SET system_version=0 WHERE system_version IS NULL/);
  assert.match(helpers, /ALTER TABLE stock_count_result_items MODIFY system_version BIGINT UNSIGNED NOT NULL DEFAULT 0/);
  assert.match(helpers, /ALTER TABLE stock_count_result_items MODIFY movement_in BIGINT UNSIGNED NOT NULL DEFAULT 0/);
  assert.match(helpers, /ALTER TABLE stock_count_result_items MODIFY movement_out BIGINT UNSIGNED NOT NULL DEFAULT 0/);
  assert.match(helpers, /ALTER TABLE stock_count_result_items MODIFY is_manual TINYINT\(1\) NOT NULL DEFAULT 0/);
  assert.match(migrationWorkflow, /include_zero_unused TINYINT\(1\) NULL DEFAULT NULL/);
  assert.match(migrationWorkflow, /system_version INT NULL DEFAULT NULL/);
  assert.match(migrationWorkflow, /movement_in INT NULL DEFAULT NULL/);
  assert.match(migrationWorkflow, /is_manual INT NULL DEFAULT NULL/);
  assert.match(migrationWorkflow, /STOCK_OPNAME_COLUMN_DEF[\s\S]*?bigint\(20\) unsigned[\s\S]*?test "\$PARTIAL_NULL_COUNT" = "0"/);
});

test('rollback memulihkan NULL adopted yang dinormalisasi migration', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS `stock_opname_schema_value_backups`/);
  for (const [table, column] of [
    ['stock_count_orders','end_date'],
    ['stock_count_orders','include_zero_unused'],
    ['stock_count_result_items','system_version'],
    ['stock_count_result_items','movement_in'],
    ['stock_count_result_items','movement_out'],
    ['stock_count_result_items','is_manual'],
  ]) {
    assert.match(migration, new RegExp("SELECT '"+table+"','"+column+"',CAST\\(id AS CHAR\\) FROM `"+table+"` WHERE `"+column+"` IS NULL"));
  }
  const rollbackProcedure = rollback.slice(rollback.indexOf('CREATE PROCEDURE `drop_owned_stock_opname_column`'), rollback.indexOf('DROP PROCEDURE `drop_owned_stock_opname_column`'));
  assert.match(rollbackProcedure, /stock_opname_schema_value_backups/);
  assert.match(rollbackProcedure, /SET `[^`]+`=NULL/);
  assert.match(migrationWorkflow, /ADOPTED_VALUES_BEFORE/);
  assert.match(migrationWorkflow, /ADOPTED_VALUES_AFTER/);
  assert.match(migrationWorkflow, /test "\$ADOPTED_VALUES_AFTER" = "\$ADOPTED_VALUES_BEFORE"/);
});

test('repair schema gagal tertutup untuk nilai negatif atau boolean di luar domain', () => {
  assert.match(helpers,/SELECT COUNT\(\*\) FROM stock_count_result_items WHERE system_version<0 OR movement_in<0 OR movement_out<0 OR is_manual NOT IN \(0,1\)/);
  assert.match(helpers,/throw new RuntimeException\('Schema Stok Opname memiliki nilai snapshot di luar domain'/);
  const runtimeBootstrap = helpers.slice(helpers.indexOf('function ensureApiSupportTables(PDO $pdo): void'), helpers.indexOf('function grantInitialStockOpnamePermissions'));
  const runtimeValuePreflight = runtimeBootstrap.indexOf('assertValidExistingStockOpnameSnapshotValues($pdo);');
  assert.ok(runtimeValuePreflight >= 0 && runtimeValuePreflight < runtimeBootstrap.indexOf('CREATE TABLE IF NOT EXISTS stock_count_orders'));
  assert.match(migration,/SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Schema Stok Opname memiliki nilai di luar domain'/);
  assert.ok(migration.indexOf("SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Schema Stok Opname memiliki nilai di luar domain'") < migration.indexOf('ALTER TABLE `stock_count_orders` ADD COLUMN'));
  assert.match(migrationWorkflow,/NEGATIVE_ADDED_AT_COUNT/);
  assert.match(migrationWorkflow,/test "\$NEGATIVE_ADDED_AT_COUNT" = "0"/);
  assert.doesNotMatch(helpers,/SET system_version=0 WHERE system_version IS NULL OR system_version<0/);
  assert.doesNotMatch(migration,/SET movement_in=0 WHERE movement_in IS NULL OR movement_in<0/);
  assert.doesNotMatch(migration,/include_zero_unused` IS NULL OR `include_zero_unused` NOT IN \(0,1\)/);
  assert.match(migration,/SET `include_zero_unused`=1\s*WHERE `include_zero_unused` IS NULL/);
});

test('rollback Stok Opname tidak menghapus infrastruktur Persediaan bersama dan simetris pada kolom snapshot', () => {
  assert.doesNotMatch(rollback,/DROP TABLE IF EXISTS `?inventory_operation_locks`?/);
  assert.doesNotMatch(rollback,/DROP TABLE IF EXISTS `?inventory_import_batches`?/);
  assert.match(rollback,/@prior_index_definition IS NULL[\s\S]*?DROP INDEX `uq_stock_count_result_item`/);
  assert.doesNotMatch(rollback,/SET @column_name = 'system_version'/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS `stock_opname_schema_ownership`/);
  const ownershipTable = migration.indexOf('CREATE TABLE IF NOT EXISTS `stock_opname_schema_ownership`');
  assert.ok(ownershipTable > migration.indexOf("Schema Stok Opname memiliki nilai di luar domain") && ownershipTable < migration.indexOf('ALTER TABLE `stock_count_orders` ADD COLUMN'));
  for(const column of ['end_date','include_zero_unused','movement_in','movement_out','is_manual','added_by','added_at']) {
    const table = ['end_date','include_zero_unused'].includes(column) ? 'stock_count_orders' : 'stock_count_result_items';
    const intent = migration.indexOf("'column','"+table+"','"+column+"'");
    const alter = migration.indexOf('ADD COLUMN `'+column+'`');
    assert.ok(intent >= 0 && alter > intent, `ownership intent ${column} wajib tercatat sebelum DDL`);
    assert.match(rollback,new RegExp("CALL `drop_owned_stock_opname_column`\\('[^']+','"+column+"'\\)"));
  }
  assert.match(helpers,/function ensureOwnedStockOpnameColumn\(PDO \$pdo, string \$table, string \$column, string \$definition\): void/);
  for(const column of ['end_date','include_zero_unused','movement_in','movement_out','is_manual','added_by','added_at']) {
    assert.match(helpers,new RegExp("ensureOwnedStockOpnameColumn\\(\\$pdo,'[^']+','"+column+"'"));
  }
  assert.match(migrationWorkflow, /test "\$ROLLED_BACK" = "5"/);
  assert.match(migrationWorkflow, /test "\$ADOPTED_INDEX_DEF" = "0:result_id,item_id:0"/);
  assert.match(migrationWorkflow, /test "\$FRESH_INDEX_COUNT" = "0"/);
});

test('migration dan rollback mengisolasi DDL dari mutation serta menolak index asing sebelum DDL', () => {
  const mutexHelper = helpers.slice(helpers.indexOf('function lockInventoryMutation'), helpers.indexOf('function permissionsFromRoleRecord'));
  const rowLock = mutexHelper.indexOf("inventory_operation_locks WHERE lock_key='global' FOR UPDATE");
  const maintenanceCheck = mutexHelper.indexOf("IS_USED_LOCK('drac_inventory_schema_migration')");
  assert.ok(rowLock >= 0 && maintenanceCheck > rowLock);
  for (const [label, sql] of [['migration', migration], ['rollback', rollback]]) {
    const staleLockCleanup = sql.indexOf("IS_USED_LOCK('drac_inventory_schema_migration')=CONNECTION_ID()");
    const acquireLock = sql.indexOf("GET_LOCK('drac_inventory_schema_migration',60)");
    assert.ok(staleLockCleanup >= 0 && acquireLock > staleLockCleanup, `${label} tidak membersihkan stale lock koneksi sendiri sebelum acquire`);
    assert.match(sql, /START TRANSACTION;[\s\S]*?inventory_operation_locks` WHERE `lock_key`='global' FOR UPDATE;[\s\S]*?COMMIT;/, `${label} tidak menguras mutation aktif`);
    assert.match(sql, /RELEASE_LOCK\('drac_inventory_schema_migration'\)/, `${label} tidak melepas maintenance lock`);
  }
  const preflight = migration.indexOf('uq_stock_count_result_item has an incompatible definition');
  const addCanonical = migration.indexOf('ADD UNIQUE KEY `uq_stock_count_result_item`');
  assert.ok(preflight >= 0 && addCanonical > preflight);
  assert.doesNotMatch(migration, /DROP INDEX `uq_stock_count_result_item`|RENAME INDEX/);
});

test('CI MySQL 5.7 menjalankan bootstrap runtime fail-closed recovery dan aggregate di atas INT', () => {
  assert.match(migrationWorkflow,/actions\/setup-node@v4/);
  assert.match(migrationWorkflow,/npm ci/);
  assert.match(migrationWorkflow,/npm run check/);
  assert.match(migrationWorkflow,/name: Verify runtime API bootstrap on MySQL 5\.7/);
  assert.match(migrationWorkflow,/ensureApiSupportTables\(\$pdo\);ensureApiSupportTables\(\$pdo\);/);
  assert.match(migrationWorkflow,/name: Reject negative partial stock opname schema and recover/);
  assert.match(migrationWorkflow,/Migration harus gagal ketika snapshot berisi nilai negatif/);
  assert.match(migrationWorkflow,/UPDATE stock_count_result_items SET system_version=0,movement_in=0,movement_out=0,is_manual=0/);
  assert.match(migrationWorkflow,/name: Verify historical movement aggregate above signed INT/);
  assert.match(migrationWorkflow,/test "\$HISTORICAL_SUM" = "3000000000"/);
  assert.match(migrationWorkflow,/parseBoundedDecimalInteger\("3000000000","0","9007199254740991"/);
});

test('endpoint startup dan transaksi stok tidak memakai ADD COLUMN IF NOT EXISTS di MySQL 5.7', () => {
  for(const [label,source] of [['all data',allData],['goods receipts',goodsReceipts],['warehouse transfers',warehouseTransfers],['sales invoices',salesInvoices]]) {
    assert.doesNotMatch(source,/ALTER TABLE [^\n]+ ADD COLUMN IF NOT EXISTS/,label);
    assert.match(source,/ensureTableColumn\(\$pdo,/);
  }
  assert.match(migrationWorkflow,/name: Execute inventory endpoint schema prologues on MySQL 5\.7/);
  assert.match(migrationWorkflow,/api\/endpoints\/goods-receipts\.php/);
  assert.match(migrationWorkflow,/api\/endpoints\/warehouse-transfers\.php/);
  assert.match(migrationWorkflow,/api\/endpoints\/sales-invoices\.php/);
  assert.match(migrationWorkflow,/api\/endpoints\/all-data\.php/);
  assert.match(migrationWorkflow,/DRAC_DB_HOST: 127\.0\.0\.1/);
  assert.match(migrationWorkflow,/require .*api\/config\.php.*require .*api\/helpers\.php/);
});

test('schema dasar memakai collation UTF8MB4 yang konsisten untuk foreign key MySQL 5.7', () => {
  const schema = read('database/dokterac_schema.sql');
  assert.doesNotMatch(schema,/DEFAULT CHARSET=utf8mb4;/);
  assert.match(schema,/DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;/);
});

test('runtime bootstrap membuat kolom lost-sales sebelum migration lama menggunakannya', () => {
  const column = helpers.indexOf("ensureTableColumn($pdo,'work_orders','cancel_reason'");
  const migration = helpers.indexOf("$lostSalesMigrationKey = 'legacy_floating_work_orders_to_lost_sales_20260810_v1'");
  assert.ok(column >= 0 && migration > column);
});

test('runtime bootstrap membuat flag owner sebelum backfill akses cabang menggunakannya', () => {
  const column = helpers.indexOf("ensureTableColumn($pdo,'users','is_owner'");
  const backfill = helpers.indexOf('WHERE u.is_owner = 1');
  assert.ok(column >= 0 && backfill > column);
});

test('helper kolom memakai information_schema yang dapat diprepare di MySQL 5.7', () => {
  const start = helpers.indexOf('function ensureTableColumn');
  const end = helpers.indexOf('function ensureOwnedStockOpnameColumn', start);
  const source = helpers.slice(start, end);
  assert.doesNotMatch(source,/SHOW COLUMNS[\s\S]*LIKE \?/);
  assert.match(source,/information_schema\.COLUMNS WHERE TABLE_SCHEMA=DATABASE\(\) AND TABLE_NAME=\? AND COLUMN_NAME=\?/);
});

test('aggregate snapshot divalidasi sebagai decimal sebelum cast PHP dan JSON', () => {
  assert.match(helpers,/function parseBoundedDecimalInteger\(mixed \$value, string \$minimum, string \$maximum, string \$label\): int/);
  const snapshotBlock=endpoint.slice(endpoint.indexOf('$loadItemSnapshots='),endpoint.indexOf('$loadOrder ='));
  assert.match(snapshotBlock,/AS system_qty/);
  assert.match(snapshotBlock,/parseBoundedDecimalInteger\(\$item\['movement_in'\],\s*'0',\s*'9007199254740991'/);
  assert.match(snapshotBlock,/parseBoundedDecimalInteger\(\$item\['movement_out'\],\s*'0',\s*'9007199254740991'/);
  assert.match(snapshotBlock,/parseBoundedDecimalInteger\(\$item\['system_qty'\],\s*'-2147483648',\s*'2147483647'/);
  assert.doesNotMatch(snapshotBlock,/\(int\)\$item\['movement_(?:in|out)'\]/);
});

test('rollout Stok Opname memiliki bootstrap schema version baru', () => {
  assert.match(apiIndex, /ensureApiSupportTablesVersioned\(\$pdo, 'api_support_20260903_historical_stock_opname_v1'\)/);
  assert.doesNotMatch(migration,/VALUES \('api_support_20260903_historical_stock_opname_v1'\)/);
  const marker = migration.search(/INSERT IGNORE INTO `app_schema_migrations` \(`migration_key`\)\s+VALUES \('schema_20260904_historical_stock_opname_v2'\)/);
  assert.ok(marker > migration.indexOf('ADD UNIQUE KEY `uq_stock_count_result_item`'), 'marker standalone wajib ditulis paling akhir');
  assert.match(rollback,/migration_key IN \('schema_20260904_historical_stock_opname_v2','api_support_20260903_historical_stock_opname_v1'\)/);
  assert.match(migrationWorkflow,/name: Verify standalone migration then API ledger bootstrap/);
  assert.match(migrationWorkflow,/ensureApiSupportTablesVersioned\(\$pdo,"api_support_20260903_historical_stock_opname_v1"\)/);
});

test('izin khusus Stok Opname dapat dicabut tanpa fallback item', () => {
  const permissionHelper = endpoint.match(/\$hasOpnamePermission=static function[\s\S]*?\n\};/)?.[0] ?? '';
  assert.match(permissionHelper, /authenticatedUserHasPermission\(\$pdo,\$actor,\$permission\)/);
  assert.doesNotMatch(permissionHelper, /\$fallback|authenticatedUserHasPermission\(\$pdo,\$actor,\$fallback\)/);
  assert.doesNotMatch(endpoint, /\$hasOpnamePermission\([^\n]*'item:(?:view|create|edit|delete)'/);
  for (const permission of ['view', 'create', 'count', 'post', 'delete']) {
    assert.match(endpoint, new RegExp(`stock_opname:${permission}`));
  }
  const recurringBootstrap = helpers.slice(
    helpers.indexOf('function ensureApiSupportTables(PDO $pdo)'),
    helpers.indexOf('function grantInitialStockOpnamePermissions(PDO $pdo'),
  );
  assert.doesNotMatch(recurringBootstrap, /\$next\[\]\s*=\s*'stock_opname:/);
  const initialGrant = helpers.slice(
    helpers.indexOf('function grantInitialStockOpnamePermissions(PDO $pdo'),
    helpers.indexOf('function ensureApiSupportTablesVersioned(PDO $pdo'),
  );
  const begin = initialGrant.indexOf('$pdo->beginTransaction()');
  const markerLock = initialGrant.indexOf('SELECT migration_key FROM app_schema_migrations WHERE migration_key=? FOR UPDATE');
  const roleLock = initialGrant.indexOf('SELECT id,code,name,permissions FROM roles ORDER BY id FOR UPDATE');
  const markerInsert = initialGrant.indexOf('INSERT INTO app_schema_migrations (migration_key) VALUES (?)');
  const commit = initialGrant.lastIndexOf('$pdo->commit()');
  assert.match(initialGrant, /api_support_20260903_historical_stock_opname_permissions_v1/);
  assert.ok(begin >= 0 && markerLock > begin && roleLock > markerLock && markerInsert > roleLock && commit > markerInsert);
  assert.match(helpers, /\$version === 'api_support_20260903_historical_stock_opname_v1'[\s\S]*?grantInitialStockOpnamePermissions\(\$pdo\)[\s\S]*?runVersionedApiBootstrap/);
  assert.match(endpoint, /lockInventoryMutationAuthorization\(\$pdo,\$actor,'stock_opname:create',\[\$assignedId\]\)/);
});

test('fixture PHP dapat mencapai service MySQL 5.7 dari runner', () => {
  assert.match(migrationWorkflow, /services:[\s\S]*?mysql:[\s\S]*?ports:\s*\n\s*- 3306:3306/);
  assert.match(migrationWorkflow, /new PDO\("mysql:host=127\.0\.0\.1;dbname=drac_verify"/);
});

test('barang aktif stok nol dan tanpa mutasi tetap masuk sesuai filter kategori', () => {
  assert.match(endpoint, /WHERE i\.type='Persediaan' AND i\.is_active=1/);
  assert.match(endpoint, /\$categoryId[^\n]*i\.category_id=\?/);
  assert.match(endpoint, /FROM item_categories WHERE id=\? FOR UPDATE/);
  assert.match(endpoint, /\$category\['is_active'\]/);
  assert.match(endpoint, /includeZeroUnused/);
  assert.match(page, /includeZeroUnused:true/);
  assert.match(page, /Tampilkan barang stok 0 dan tanpa mutasi/);
  assert.match(page, /Semua Kategori/);
});

test('barang dapat dicari dan ditambah manual hanya pada hasil Draft tanpa duplikat', () => {
  assert.match(helpers, /is_manual TINYINT\(1\) NOT NULL DEFAULT 0/);
  assert.match(helpers, /added_by VARCHAR\(20\) NULL/);
  assert.match(endpoint, /\['start','save-result','post-result','add-item','remove-item'\]/);
  assert.match(endpoint, /\$action==='add-item'/);
  assert.match(endpoint, /Barang sudah ada dalam Hasil Stok Opname/);
  assert.match(endpoint, /catch\(PDOException \$e\)[\s\S]*?\(string\)\$e->getCode\(\)==='23000'[\s\S]*?Barang sudah ada dalam Hasil Stok Opname/);
  assert.match(endpoint, /\$action==='remove-item'/);
  assert.match(endpoint, /is_manual/);
  assert.match(page, /Cari kode atau nama barang/);
  assert.match(page, /Tambah Barang/);
  assert.match(page, /action:'add-item'/);
  assert.match(page, /action:'remove-item'/);
  assert.match(page, /row\.isManual/);
});

test('tambah atau hapus barang manual mempertahankan Opname yang belum disimpan', () => {
  const addBlock = page.slice(page.indexOf('const addManualItem'), page.indexOf('const removeManualItem'));
  const removeBlock = page.slice(page.indexOf('const removeManualItem'), page.indexOf('const grouped'));
  assert.match(addBlock, /const added=r\.data as CountRow\|undefined/);
  assert.match(addBlock, /rows:\[\.\.\.\(current\.rows\|\|\[\]\),added\]/);
  assert.doesNotMatch(addBlock, /openDetail/);
  assert.match(removeBlock, /rows:\(current\.rows\|\|\[\]\)\.filter\(row=>row\.id!==resultItemId\)/);
  assert.doesNotMatch(removeBlock, /openDetail/);
});

test('otorisasi cabang diselesaikan sebelum transaksi mutasi dan aggregate dikunci', () => {
  const putStart = endpoint.indexOf("if($method==='PUT'&&$id)");
  const deleteStart = endpoint.indexOf("if($method==='DELETE'&&$id)");
  const putBlock = endpoint.slice(putStart, deleteStart);
  const deleteBlock = endpoint.slice(deleteStart);
  assert.match(putBlock, /getAccessibleBranchIds[\s\S]*?\$loadOrder\(\$pdo,\$id,\$accessibleBranchIds\)[\s\S]*?beginTransaction[\s\S]*?lockInventoryMutation[\s\S]*?\$lockOrderRoot[\s\S]*?\$lockOrderResult[\s\S]*?\$loadOrder\(\$pdo,\$id,\$accessibleBranchIds\)/);
  assert.match(deleteBlock, /getAccessibleBranchIds[\s\S]*?\$loadOrder\(\$pdo,\$id,\$accessibleBranchIds\)[\s\S]*?beginTransaction[\s\S]*?lockInventoryMutation[\s\S]*?\$lockOrderRoot[\s\S]*?\$lockOrderResult[\s\S]*?\$loadOrder\(\$pdo,\$id,\$accessibleBranchIds\)/);
  const putLockedScope = putBlock.slice(putBlock.indexOf('$lockOrderRoot($pdo,$id,$accessibleBranchIds)'), putBlock.indexOf("if($action==='start')"));
  const deleteLockedScope = deleteBlock.slice(deleteBlock.indexOf('$lockOrderRoot($pdo,$id,$accessibleBranchIds)'), deleteBlock.indexOf("if($target==='result')"));
  assert.match(putLockedScope, /getAccessibleBranchIds\(\$pdo,\$actor\)/);
  assert.doesNotMatch(putLockedScope, /authenticatedUserHasPermission|\$hasOpnamePermission/);
  assert.match(deleteLockedScope, /getAccessibleBranchIds\(\$pdo,\$actor\)/);
  assert.match(endpoint, /\$e->getCode\(\)===403\?403:422/);
});

test('mutasi mengunci ulang actor, role, dan akses cabang di dalam transaksi', () => {
  assert.match(helpers, /function lockInventoryMutationAuthorization\(PDO \$pdo, array \$requestActor/);
  assert.match(helpers, /FROM users WHERE id=\? FOR UPDATE/);
  assert.match(helpers, /FROM roles WHERE id=\? FOR UPDATE/);
  assert.match(helpers, /FROM user_branch_access WHERE user_id=\? ORDER BY branch_id FOR UPDATE/);
  for (const marker of ["if($method==='POST')", "if($method==='PUT'&&$id)", "if($method==='DELETE'&&$id)"]) {
    const block = endpoint.slice(endpoint.indexOf(marker), marker.includes('POST') ? endpoint.indexOf("if($method==='PUT'&&$id)") : marker.includes('PUT') ? endpoint.indexOf("if($method==='DELETE'&&$id)") : endpoint.length);
    assert.match(block, /beginTransaction[\s\S]*?lockInventoryMutationAuthorization\(\$pdo,\$actor/);
  }
});

test('PUT dan DELETE mengunci actor sebelum aggregate order', () => {
  for (const [start, end] of [
    ["if($method==='PUT'&&$id)", "if($method==='DELETE'&&$id)"],
    ["if($method==='DELETE'&&$id)", 'respondError(\'Method not allowed\''],
  ]) {
    const block = endpoint.slice(endpoint.indexOf(start), endpoint.indexOf(end));
    const transaction = block.indexOf('$pdo->beginTransaction()');
    const actorLock = block.indexOf('lockInventoryMutationAuthorization($pdo,$actor');
    const orderLock = block.indexOf('$lockOrderRoot($pdo,$id,$accessibleBranchIds)');
    assert.ok(transaction >= 0 && actorLock > transaction && orderLock > actorLock);
  }
});

test('semua mutasi memakai mutex lalu user deterministik sebelum lock aggregate single-table', () => {
  assert.match(helpers, /CREATE TABLE IF NOT EXISTS inventory_operation_locks/);
  assert.match(helpers, /function lockInventoryMutation\(PDO \$pdo\): void/);
  assert.match(helpers, /SELECT lock_key FROM inventory_operation_locks WHERE lock_key='global' FOR UPDATE/);
  assert.match(endpoint, /SELECT id FROM stock_count_orders WHERE id=\?[\s\S]*?FOR UPDATE/);
  assert.match(endpoint, /SELECT id FROM stock_count_results WHERE order_id=\? FOR UPDATE/);
  assert.doesNotMatch(endpoint, /\$loadOrder\(\$pdo,\$id,true/);
  assert.doesNotMatch(endpoint, /lockStockOpnameUsers\(/);
  for (const marker of ["if($method==='POST')", "if($method==='PUT'&&$id)", "if($method==='DELETE'&&$id)"]) {
    const block = endpoint.slice(endpoint.indexOf(marker), marker.includes('POST') ? endpoint.indexOf("if($method==='PUT'&&$id)") : marker.includes('PUT') ? endpoint.indexOf("if($method==='DELETE'&&$id)") : endpoint.length);
    const transaction = block.indexOf('$pdo->beginTransaction()');
    const mutex = block.indexOf('lockInventoryMutation($pdo)');
    const authorization = block.indexOf('lockInventoryMutationAuthorization($pdo,$actor');
    assert.ok(transaction >= 0 && mutex > transaction && authorization > mutex);
  }
  assert.match(endpoint, /lockInventoryMutationAuthorization\(\$pdo,\$actor,'stock_opname:create',\[\$assignedId\]\)/);
  assert.match(endpoint, /lockInventoryMutationAuthorization\(\$pdo,\$actor,\$requiredPermission,\[\(string\)\(\$preflight\['assigned_user_id'\]/);
  assert.match(endpoint, /lockInventoryMutationAuthorization\(\$pdo,\$actor,'stock_opname:delete',\[\(string\)\(\$preflight\['assigned_user_id'\]/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS `inventory_operation_locks`/);
});

test('seluruh jalur perubahan saldo memakai mutex persediaan sebagai lock pertama', () => {
  const assertMutexImmediatelyAfterBegin = (source, label, expectedMinimum) => {
    const matches = source.match(/\$pdo->beginTransaction\(\);\s*try\s*\{\s*lockInventoryMutation\(\$pdo\);/g) || [];
    assert.ok(matches.length >= expectedMinimum, `${label}: hanya ${matches.length} transaction memakai mutex, minimal ${expectedMinimum}`);
  };

  assertMutexImmediatelyAfterBegin(endpoint, 'stock-opnames', 3);
  assertMutexImmediatelyAfterBegin(stockAdjustments, 'stock-adjustments', 3);
  assertMutexImmediatelyAfterBegin(salesInvoices, 'sales-invoices', 3);
  assertMutexImmediatelyAfterBegin(goodsReceipts, 'goods-receipts', 3);
  assertMutexImmediatelyAfterBegin(stockMovements, 'stock-movements', 2);
  assertMutexImmediatelyAfterBegin(warehouseTransfers, 'warehouse-transfers', 4);
  assert.match(itemsEndpoint.slice(itemsEndpoint.indexOf("$targetId=(string)($d['targetItemId']")), /beginTransaction\(\);\s*try\s*\{\s*lockInventoryMutation\(\$pdo\);/);
  assertMutexImmediatelyAfterBegin(dataMaintenance, 'data-maintenance', 1);
  assert.match(helpers.slice(helpers.indexOf('function runProductionIntegrityRepair20260808')), /beginTransaction\(\);\s*lockInventoryMutation\(\$pdo\);/);
});

test('import saldo awal mengklaim batch unik setelah mutex sebelum mengubah stok', () => {
  assert.match(helpers, /CREATE TABLE IF NOT EXISTS inventory_import_batches[\s\S]*?batch_key VARCHAR\(100\) NOT NULL PRIMARY KEY[\s\S]*?payload_sha256 CHAR\(64\) NOT NULL[\s\S]*?status VARCHAR\(20\) NOT NULL/);
  const importBlock = stockMovements.slice(stockMovements.indexOf("if(($d['action']??'')==='opening_balance_import')"), stockMovements.indexOf("$qty=(int)($d['quantity']"));
  const transaction = importBlock.slice(importBlock.indexOf('beginTransaction'));
  const mutex = transaction.indexOf('lockInventoryMutation($pdo)');
  const authorization = transaction.indexOf("lockInventoryMutationAuthorization($pdo,$actor,'item:create')");
  const privileged = transaction.indexOf('assertLockedInventoryOwnerOrAdministrator($authorization)');
  const legacyCheck = transaction.indexOf('SELECT COUNT(*) FROM stock_movements WHERE LEFT(notes,CHAR_LENGTH(?))=?');
  const batchClaim = transaction.indexOf('INSERT INTO inventory_import_batches');
  const stockWrite = transaction.indexOf('adjustWarehouseStockAllowNegative');
  assert.ok(mutex >= 0 && authorization > mutex && privileged > authorization && legacyCheck > privileged && batchClaim > legacyCheck && stockWrite > batchClaim);
  assert.doesNotMatch(importBlock, /WHERE notes LIKE \?/);
  assert.match(importBlock, /File\/batch saldo awal ini sudah pernah diimport/);
  assert.match(helpers, /in_array\(\$error->getCode\(\),\s*\[403,404,409\],\s*true\)/);
  assert.match(importBlock, /payloadHash=hash\('sha256',/);
  assert.match(importBlock, /filter_var\(\$quantityRaw,FILTER_VALIDATE_INT,\['options'=>\['min_range'=>-2147483647,'max_range'=>2147483647\]\]\)/);
  assert.match(importBlock, /SELECT payload_sha256,status,row_count,detail_json FROM inventory_import_batches WHERE batch_key=\? FOR UPDATE/);
  assert.match(importBlock, /hash_equals\(\(string\)\$existingBatch\['payload_sha256'\],\$payloadHash\)/);
  assert.match(importBlock, /recordStockMovement\([\s\S]*?abs\(\$quantity\)[\s\S]*?'opening_balance_import'[\s\S]*?'opening_balance:'\.\$batchKey/);
  assert.match(importBlock, /UPDATE inventory_import_batches SET status='completed',row_count=\?,detail_json=\?,completed_at=NOW\(\) WHERE batch_key=\?/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS `inventory_import_batches`[\s\S]*?`payload_sha256` CHAR\(64\) NOT NULL/);
});

test('seluruh transaction boundary Persediaan menangkap Throwable agar selalu rollback', () => {
  for (const [source, label] of [
    [stockAdjustments, 'stock-adjustments'],
    [salesInvoices, 'sales-invoices'],
    [goodsReceipts, 'goods-receipts'],
    [stockMovements, 'stock-movements'],
    [warehouseTransfers, 'warehouse-transfers'],
    [itemsEndpoint, 'items'],
  ]) {
    assert.doesNotMatch(source, /catch\s*\(\s*Exception\s*\$e\s*\)/, `${label} masih memiliki catch Exception`);
  }
});

test('Faktur Penjualan mengunci ulang actor role akses dan permission di dalam mutex', () => {
  assert.match(helpers, /function permissionsFromRoleRecord\(array \$role\): array/);
  assert.match(helpers, /function lockInventoryMutationAuthorization\(PDO \$pdo, array \$requestActor, string \$requiredPermission, array \$delegatedUserIds = \[\]\): array/);
  assert.match(helpers, /SELECT \* FROM users WHERE id IN \(\$placeholders\) ORDER BY id FOR UPDATE/);
  assert.match(helpers, /SELECT id,code,name,permissions,is_active FROM roles WHERE id=\? FOR UPDATE/);
  assert.match(helpers, /SELECT user_id,branch_id FROM user_branch_access WHERE user_id IN \(\$placeholders\) ORDER BY user_id,branch_id FOR UPDATE/);
  assert.match(helpers, /function assertLockedInventoryPermission\(array \$authorization, string \$permission\): void/);
  for (const permission of ['create','edit','delete']) {
    assert.match(salesInvoices, new RegExp(`lockInventoryMutation\\(\\$pdo\\);\\s*\\$authorization=lockInventoryMutationAuthorization\\(\\$pdo,\\$actor,'invoice:${permission}'\\);\\s*\\$actor=\\$authorization\\['actor'\\]`));
  }
  const identityBlock = salesInvoices.slice(salesInvoices.indexOf("if ($action === 'identity')"), salesInvoices.indexOf('$reason =', salesInvoices.indexOf("if ($action === 'identity')")));
  assert.match(identityBlock, /assertLockedInventoryPermission\(\$authorization,'wo:edit'\)/);
  assert.doesNotMatch(identityBlock, /requireUserPermission|respondError/);
});

test('helper authorization mengunci actor role akses lalu delegasi dalam urutan deterministik', () => {
  const block = helpers.slice(
    helpers.indexOf('function lockInventoryMutationAuthorization'),
    helpers.indexOf('function lockStockOpnameResultForAdjustment'),
  );
  const actor = block.indexOf('SELECT * FROM users WHERE id=? FOR UPDATE');
  const role = block.indexOf('SELECT id,code,name,permissions,is_active FROM roles WHERE id=? FOR UPDATE');
  const actorAccess = block.indexOf('SELECT user_id,branch_id FROM user_branch_access WHERE user_id=? ORDER BY branch_id FOR UPDATE');
  const delegates = block.indexOf('SELECT * FROM users WHERE id IN ($placeholders) ORDER BY id FOR UPDATE');
  const delegateRoles = block.indexOf('SELECT id,code,name,permissions,is_active FROM roles WHERE id IN ($rolePlaceholders) ORDER BY id FOR UPDATE');
  const delegateAccess = block.indexOf('SELECT user_id,branch_id FROM user_branch_access WHERE user_id IN ($placeholders) ORDER BY user_id,branch_id FOR UPDATE');
  assert.ok(actor >= 0 && role > actor && actorAccess > role && delegates > actorAccess && delegateRoles > delegates && delegateAccess > delegateRoles);
  assert.match(block, /'permissionsByUser' => \$permissionsByUser/);
  assert.match(helpers, /lockedInventoryDelegatedUserForBranch[\s\S]*?permissionsByUser[\s\S]*?all_branches/);
  assert.match(migrationWorkflow, /CREATE TABLE roles\([^\n]*is_active TINYINT\(1\) NOT NULL/);
  assert.match(migrationWorkflow, /INSERT INTO roles\(id,code,name,permissions,is_active\)/);
});

test('Faktur Penjualan tidak mengganti actor terkunci dengan cache request', () => {
  assert.match(helpers, /function assertLockedInventoryBranchAccess\(array \$authorization, string \$branchId\): void/);
  const post = salesInvoices.slice(salesInvoices.indexOf("case 'POST':"), salesInvoices.indexOf("case 'PUT':"));
  const put = salesInvoices.slice(salesInvoices.indexOf("case 'PUT':"), salesInvoices.indexOf("case 'DELETE':"));
  const remove = salesInvoices.slice(salesInvoices.indexOf("case 'DELETE':"));
  for (const [label, block] of [['POST', post], ['PUT', put], ['DELETE', remove]]) {
    const locked = block.indexOf('lockInventoryMutationAuthorization');
    assert.ok(locked >= 0, `${label} tidak mengunci authorization`);
    assert.doesNotMatch(block.slice(locked), /\$requestUser/, `${label} kembali memakai actor cache setelah lock`);
    assert.match(block.slice(locked), /assertLockedInventoryBranchAccess\(\$authorization,/);
  }
});

test('Penerimaan Barang mengunci ulang actor dan semua user delegasi sebelum root dokumen', () => {
  for (const permission of ['create','edit']) {
    assert.match(goodsReceipts, new RegExp(`lockInventoryMutation\\(\\$pdo\\);\\s*\\$delegatedUserIds=.*?lockInventoryMutationAuthorization\\(\\$pdo,\\$actor,'receipt:${permission}',\\$delegatedUserIds\\);\\s*\\$actor=\\$authorization\\['actor'\\]`, 's'));
  }
  assert.match(goodsReceipts, /lockInventoryMutation\(\$pdo\);\s*\$authorization=lockInventoryMutationAuthorization\(\$pdo,\$actor,'receipt:delete'\);\s*\$actor=\$authorization\['actor'\]/);
  assert.match(goodsReceipts, /array_column\(\$d\['items'\],'technicianId'\)/);
});

test('create inventory memvalidasi ulang scope delegasi gudang dan barang setelah authorization lock', () => {
  assert.match(helpers, /function lockedInventoryDelegatedUserForBranch\(array \$authorization, string \$userId, string \$branchId, string \$label\): array/);
  assert.match(helpers, /function lockActiveInventoryWarehouses\(PDO \$pdo, array \$warehouseIds\): array/);
  assert.match(helpers, /function lockActiveInventoryItems\(PDO \$pdo, array \$itemIds\): array/);

  const receiptPost = goodsReceipts.slice(goodsReceipts.indexOf("case 'POST':"), goodsReceipts.indexOf("case 'PUT':"));
  const transferPost = warehouseTransfers.slice(warehouseTransfers.indexOf("if($method==='POST')"), warehouseTransfers.indexOf("if($method==='PUT'"));
  const movementPost = stockMovements.slice(stockMovements.indexOf("$qty=(int)parseBoundedDecimalInteger($d['quantity']"));
  for (const [label, block] of [['receipt', receiptPost], ['warehouse transfer', transferPost], ['manual transfer', movementPost]]) {
    const authorization = block.indexOf('lockInventoryMutationAuthorization');
    assert.ok(authorization >= 0, `${label} tidak mengunci authorization`);
    const locked = block.slice(authorization);
    assert.match(locked, /assertLockedInventoryBranchAccess\(\$authorization,/);
    assert.match(locked, /lockActiveInventoryWarehouses\(\$pdo,/);
    assert.match(locked, /lockActiveInventoryItems\(\$pdo,/);
  }
  assert.match(receiptPost.slice(receiptPost.indexOf('lockInventoryMutationAuthorization')), /lockedInventoryDelegatedUserForBranch\(\$authorization,\$receiverId,\$branchId,/);
  assert.match(transferPost.slice(transferPost.indexOf('lockInventoryMutationAuthorization')), /lockedInventoryDelegatedUserForBranch\(\$authorization,\$senderId,/);
});

test('Penerimaan PUT mengetahui receiver fallback sebelum lock aggregate', () => {
  const put = goodsReceipts.slice(goodsReceipts.indexOf("case 'PUT':"), goodsReceipts.indexOf("case 'DELETE':"));
  const preflight = put.indexOf('SELECT received_by_id FROM goods_receipts WHERE id=? AND branch_id IN (');
  const begin = put.indexOf('$pdo->beginTransaction()');
  const authorization = put.indexOf('lockInventoryMutationAuthorization');
  const root = put.indexOf('SELECT * FROM goods_receipts WHERE id=? FOR UPDATE');
  assert.ok(preflight >= 0 && begin > preflight && authorization > begin && root > authorization);
  assert.match(put.slice(root), /Petugas penerima berubah, silakan ulangi/);
  assert.match(put.slice(root), /assertLockedInventoryBranchAccess\(\$authorization,\(string\)\$oldBranchId\)/);
  assert.doesNotMatch(put.slice(root), /lockInventoryMutationAuthorization/);
});

test('Penyesuaian Stok mengunci ulang permission dan status Owner Administrator pada semua mutation', () => {
  assert.match(helpers, /function assertLockedInventoryOwnerOrAdministrator\(array \$authorization\): void/);
  for (const permission of ['create','edit','delete']) {
    assert.match(stockAdjustments, new RegExp(`lockInventoryMutation\\(\\$pdo\\);\\s*\\$authorization=lockInventoryMutationAuthorization\\(\\$pdo,\\$actor,'item:${permission}'\\);\\s*assertLockedInventoryOwnerOrAdministrator\\(\\$authorization\\);\\s*\\$actor=\\$authorization\\['actor'\\]`));
  }
});

test('GET Penyesuaian Stok tidak membocorkan dokumen atau rincian lintas cabang', () => {
  const get = stockAdjustments.slice(stockAdjustments.indexOf("if ($method === 'GET')"),stockAdjustments.indexOf('$d = getInput()'));
  assert.match(get,/getAccessibleBranchIds\(\$pdo,\$actor\)/);
  assert.match(get,/EXISTS\(SELECT 1 FROM stock_adjustment_items scope_i JOIN warehouses scope_w[\s\S]*?scope_w\.branch_id IN \(\$branchMarks\)\)/);
  assert.match(get,/NOT EXISTS\(SELECT 1 FROM stock_adjustment_items denied_i JOIN warehouses denied_w[\s\S]*?denied_w\.branch_id NOT IN \(\$branchMarks\)\)/);
  assert.doesNotMatch(get,/\$pdo->query\("SELECT sa\.\*/);
});

test('kedua mutation Mutasi Stok mengunci ulang actor dan item:create setelah mutex', () => {
  const matches = stockMovements.match(/lockInventoryMutation\(\$pdo\);\s*\$authorization=lockInventoryMutationAuthorization\(\$pdo,\$actor,'item:create'\);\s*\$actor=\$authorization\['actor'\]/g) ?? [];
  assert.equal(matches.length, 2);
});

test('seluruh mutation Transfer Gudang mengunci ulang actor permission dan delegated users', () => {
  const createMatches = warehouseTransfers.match(/lockInventoryMutationAuthorization\(\$pdo,\$actor,'item:create',\$delegatedUserIds\)/g) ?? [];
  const delegatedEditMatches = warehouseTransfers.match(/lockInventoryMutationAuthorization\(\$pdo,\$actor,'item:edit',\$delegatedUserIds\)/g) ?? [];
  const actorOnlyEditMatches = warehouseTransfers.match(/lockInventoryMutationAuthorization\(\$pdo,\$actor,'item:edit'\)/g) ?? [];
  const deleteMatches = warehouseTransfers.match(/lockInventoryMutationAuthorization\(\$pdo,\$actor,'item:delete'\)/g) ?? [];
  assert.equal(createMatches.length, 1);
  assert.equal(delegatedEditMatches.length, 2);
  assert.equal(actorOnlyEditMatches.length, 1);
  assert.equal(deleteMatches.length, 1);
  const put = warehouseTransfers.slice(warehouseTransfers.indexOf("if($method==='PUT'&&$id)"),warehouseTransfers.indexOf("if($method==='DELETE'&&$id)"));
  assert.doesNotMatch(put.slice(put.indexOf('lockInventoryMutationAuthorization')),/getUserBranchIds\(/);
  assert.equal((put.match(/lockedInventoryDelegatedUserForBranch\(\$authorization,/g)??[]).length,2);
});

test('create merge update dan delete Barang berada dalam mutex dengan otorisasi transaksional', () => {
  assert.match(itemsEndpoint, /case 'POST':[\s\S]*?beginTransaction\(\);\s*try \{\s*lockInventoryMutation\(\$pdo\);\s*\$authorization=lockInventoryMutationAuthorization\(\$pdo,\$actor,\$createPermission\);\s*\$actor=\$authorization\['actor'\]/);
  assert.match(itemsEndpoint, /\$targetId=\(string\)\(\$d\['targetItemId'\][\s\S]*?beginTransaction\(\);\s*try\{\s*lockInventoryMutation\(\$pdo\);\s*\$authorization=lockInventoryMutationAuthorization\(\$pdo,\$actor,'item:edit'\);\s*assertLockedInventoryOwnerOrAdministrator\(\$authorization\);\s*\$actor=\$authorization\['actor'\]/);
  const generalUpdate = itemsEndpoint.slice(itemsEndpoint.indexOf("$type = (string)($d['type'] ?? '');"));
  assert.match(generalUpdate, /beginTransaction\(\);\s*try \{\s*lockInventoryMutation\(\$pdo\);\s*\$authorization=lockInventoryMutationAuthorization\(\$pdo,\$actor,'item:edit'\);\s*\$actor=\$authorization\['actor'\]/);
  assert.match(itemsEndpoint, /case 'DELETE':[\s\S]*?beginTransaction\(\);\s*try \{\s*lockInventoryMutation\(\$pdo\);\s*\$authorization=lockInventoryMutationAuthorization\(\$pdo,\$actor,'item:delete'\);\s*\$actor=\$authorization\['actor'\]/);
  assert.ok((itemsEndpoint.match(/transactionExceptionStatus\(\$e,422\)/g) ?? []).length >= 4);
});

test('Data Maintenance mengunci ulang Owner di dalam mutex sebelum purge', () => {
  assert.match(helpers, /function assertLockedInventoryOwner\(array \$authorization\): void/);
  assert.match(dataMaintenance, /beginTransaction\(\);\s*try \{\s*lockInventoryMutation\(\$pdo\);\s*\$authorization=lockInventoryMutationAuthorization\(\$pdo,\$owner,'data:maintenance'\);\s*assertLockedInventoryOwner\(\$authorization\);\s*\$owner=\$authorization\['actor'\]/);
  assert.match(dataMaintenance, /transactionExceptionStatus\(\$error,500\)/);
});

test('maintenance mem-bump versi semua movement faktur aktif sebelum void', () => {
  const bump = dataMaintenance.indexOf("bumpStockVersionsForMovementReference($pdo,'sales_invoice',$invoiceId)");
  const voidMovement = dataMaintenance.indexOf('UPDATE stock_movements SET is_voided=1');
  assert.ok(bump >= 0 && bump < voidMovement);
  assert.match(dataMaintenance.slice(Math.max(0,bump-80),voidMovement), /foreach\(\$invoiceIds as \$invoiceId\)/);
});

test('merge Barang hanya menggabungkan source belum terpakai dan tidak menulis ulang histori', () => {
  const mergeStart = itemsEndpoint.indexOf("$targetId=(string)($d['targetItemId']??'');");
  const mergeBlock = itemsEndpoint.slice(mergeStart, itemsEndpoint.indexOf("$type = (string)($d['type'] ?? '');", mergeStart));
  for (const table of ['stock_movements','stock_adjustment_items','stock_count_result_items','goods_receipt_items','purchase_invoice_items','work_order_services','sales_invoice_items']) {
    assert.match(mergeBlock, new RegExp(`FROM ${table} WHERE item_id=\\?[^;]*FOR UPDATE`));
  }
  assert.match(mergeBlock, /quantity<>0 OR reserved_quantity<>0/);
  assert.match(mergeBlock, /stock<>0 OR sellable_stock<>0/);
  assert.match(mergeBlock, /Barang asal sudah pernah digunakan dan tidak dapat digabungkan/);
  assert.doesNotMatch(mergeBlock, /UPDATE \{\$table\} SET item_id=\?/);
  assert.doesNotMatch(mergeBlock, /try\{\$pdo->prepare\("INSERT INTO item_verification_audit/);
  assert.match(mergeBlock, /\$pdo->prepare\("INSERT INTO item_verification_audit[\s\S]*?->execute/);
});

test('legacy inventory ledger siap secara terpusat sebelum endpoint menghitung snapshot', () => {
  assert.match(helpers, /function runInventoryLedgerBackfill\(PDO \$pdo, string \$migrationKey, callable \$backfill\): void[\s\S]*?beginTransaction\(\)[\s\S]*?lockInventoryMutation\(\$pdo\)[\s\S]*?\$backfill\(\$pdo\)[\s\S]*?app_schema_migrations[\s\S]*?commit\(\)/);
  assert.match(helpers, /function ensureInventoryLedgerReady\(PDO \$pdo\): void/);
  assert.match(helpers, /if\(!in_array\('warehouse_id',\$salesItemColumns,true\)\)\$pdo->exec\('ALTER TABLE sales_invoice_items ADD warehouse_id/);
  for (const column of ['warehouse_id','source_type','source_warehouse_id']) {
    assert.match(helpers, new RegExp(`if\\(!in_array\\('${column}',\\$receiptColumns,true\\)\\)\\$pdo->exec\\([\\'\"]ALTER TABLE goods_receipts ADD ${column}`));
  }
  assert.match(helpers, /runInventoryLedgerBackfill\(\$pdo,'backfill_sales_stock_journal_20260820_v1'[\s\S]*?INSERT IGNORE INTO stock_movements[\s\S]*?stock_version=stock_version\+1/);
  assert.match(helpers, /runInventoryLedgerBackfill\(\$pdo,'backfill_receipt_stock_journal_20260820_v1'[\s\S]*?INSERT IGNORE INTO stock_movements[\s\S]*?stock_version=stock_version\+1/);
  assert.match(helpers, /SHOW TABLES LIKE 'warehouse_transfers'[\s\S]*?runInventoryLedgerBackfill\(\$pdo,'repair_transfer_stock_journal_20260820_v1'[\s\S]*?movement_type='transfer_send'[\s\S]*?movement_type='transfer_receive'/);
  assert.match(helpers, /INSERT INTO warehouse_stocks \(warehouse_id,item_id,quantity,reserved_quantity,stock_version\)[\s\S]*?ON DUPLICATE KEY UPDATE stock_version=stock_version\+1/);
  assert.match(helpers, /occurred_at[\s\S]*?idempotency_key/);
  assert.match(helpers, /ensureApiSupportTables[\s\S]*?ensureInventoryLedgerReady\(\$pdo\)/);
  assert.doesNotMatch(salesInvoices, /backfill_sales_stock_journal_20260820_v1/);
  assert.doesNotMatch(goodsReceipts, /backfill_receipt_stock_journal_20260820_v1/);
  assert.doesNotMatch(warehouseTransfers, /repair_transfer_stock_journal_20260820_v1/);
});

test('semantic ledger backfill menyimpan magnitude positif dan membalik arah reversal legacy', () => {
  const salesBackfill = helpers.slice(
    helpers.indexOf("runInventoryLedgerBackfill($pdo,'backfill_sales_stock_journal_20260820_v1'"),
    helpers.indexOf("runInventoryLedgerBackfill($pdo,'backfill_receipt_stock_journal_20260820_v1'"),
  );
  const receiptBackfill = helpers.slice(
    helpers.indexOf("runInventoryLedgerBackfill($pdo,'backfill_receipt_stock_journal_20260820_v1'"),
    helpers.indexOf("runInventoryLedgerBackfill($pdo,'backfill_stock_adjustment_journal_20260820_v1'"),
  );
  assert.match(salesBackfill, /IF\(d\.qty>0,d\.warehouse_id,NULL\),IF\(d\.qty<0,d\.warehouse_id,NULL\),ABS\(d\.qty\),'sale'/);
  assert.match(receiptBackfill, /IF\(d\.qty<0,r\.warehouse_id,IF\(r\.source_type='Transfer Gudang',r\.source_warehouse_id,NULL\)\),IF\(d\.qty<0,IF\(r\.source_type='Transfer Gudang',r\.source_warehouse_id,NULL\),r\.warehouse_id\),ABS\(d\.qty\)/);
  const signedRepair = helpers.slice(
    helpers.indexOf("runInventoryLedgerBackfill($pdo,'canonicalize_signed_legacy_stock_journal_20260905_v2'"),
    helpers.indexOf('function ensureTableColumn'),
  );
  assert.match(signedRepair, /UPDATE stock_movements m JOIN sales_invoice_items d ON m\.id=CONCAT\('MOV-BFS-',d\.id\) SET m\.source_warehouse_id=IF\(d\.qty>0,d\.warehouse_id,NULL\),m\.destination_warehouse_id=IF\(d\.qty<0,d\.warehouse_id,NULL\),m\.quantity=ABS\(d\.qty\) WHERE d\.qty<0/);
  assert.match(signedRepair, /UPDATE stock_movements m JOIN goods_receipt_items d ON m\.id=CONCAT\('MOV-BFR-',d\.id\) JOIN goods_receipts r ON r\.id=d\.receipt_id SET m\.source_warehouse_id=IF\(d\.qty<0,r\.warehouse_id,IF\(r\.source_type='Transfer Gudang',r\.source_warehouse_id,NULL\)\),m\.destination_warehouse_id=IF\(d\.qty<0,IF\(r\.source_type='Transfer Gudang',r\.source_warehouse_id,NULL\),r\.warehouse_id\),m\.quantity=ABS\(d\.qty\) WHERE d\.qty<0/);
  assert.match(signedRepair, /ON DUPLICATE KEY UPDATE stock_version=stock_version\+1/);
  const intMinGuard = helpers.indexOf('qty=-2147483648');
  const firstSemanticBackfill = helpers.indexOf("runInventoryLedgerBackfill($pdo,'backfill_sales_stock_journal_20260820_v1'");
  assert.ok(intMinGuard >= 0 && intMinGuard < firstSemanticBackfill);
});

test('sales backfill tidak memotong stok untuk Input Cepat Historis dan mem-void jurnal lama', () => {
  const salesBackfill = helpers.slice(
    helpers.indexOf("runInventoryLedgerBackfill($pdo,'backfill_sales_stock_journal_20260820_v1'"),
    helpers.indexOf("runInventoryLedgerBackfill($pdo,'backfill_receipt_stock_journal_20260820_v1'"),
  );
  assert.ok((salesBackfill.match(/COALESCE\(i\.backdate_reason,''\)<>'Input Cepat Historis \(stok tidak dipotong\)'/g) ?? []).length >= 2);

  const repair = helpers.slice(
    helpers.indexOf("runInventoryLedgerBackfill($pdo,'void_nonstock_historical_sales_20260905_v1'"),
    helpers.indexOf('function ensureTableColumn'),
  );
  const bump = repair.indexOf('ON DUPLICATE KEY UPDATE stock_version=stock_version+1');
  const voidMovement = repair.indexOf('SET m.is_voided=1');
  assert.ok(bump >= 0 && voidMovement > bump);
  assert.match(repair, /m\.id=CONCAT\('MOV-BFS-',d\.id\)/);
  assert.match(repair, /i\.backdate_reason='Input Cepat Historis \(stok tidak dipotong\)'/);
});

test('CI MySQL 5.7 menjalankan fixture perilaku remediation ledger legacy', () => {
  const workflow = read('.github/workflows/verify-work-order-estimate.yml');
  assert.match(workflow, /php tests\/fixtures\/inventory-ledger-remediation\.php/);

  const fixture = read('tests/fixtures/inventory-ledger-remediation.php');
  assert.ok((fixture.match(/ensureInventoryLedgerReady\(\$pdo\)/g) ?? []).length >= 2);
  assert.match(fixture, /transfer_send/);
  assert.match(fixture, /transfer_receive/);
  assert.match(fixture, /Input Cepat Historis \(stok tidak dipotong\)/);
  assert.match(fixture, /is_voided/);
  assert.match(fixture, /magnitude positif/);
  assert.match(fixture, /-2147483648/);
  assert.match(fixture, /Legacy quantity minimum INT tidak dapat dinormalisasi/);
});

test('upgrade ledger membuat mutex sebelum semantic data backfill dan menguncinya dalam transaksi', () => {
  const ledgerStart = helpers.indexOf("$ledgerV2Migration='stock_movement_ledger_v2_20260821';");
  const lockTable = helpers.indexOf('CREATE TABLE IF NOT EXISTS inventory_operation_locks');
  assert.ok(lockTable >= 0 && lockTable < ledgerStart);
  const ledgerBlock = helpers.slice(ledgerStart,helpers.indexOf("$stockOpnameHistoryMigration",ledgerStart));
  const begin = ledgerBlock.indexOf('beginTransaction()');
  const lock = ledgerBlock.indexOf('lockInventoryMutation($pdo)');
  const sequence = ledgerBlock.indexOf('UPDATE stock_movements SET movement_sequence=');
  const occurred = ledgerBlock.indexOf('UPDATE stock_movements SET occurred_at=created_at');
  const commit = ledgerBlock.indexOf('commit()');
  assert.ok(begin >= 0 && begin < lock && lock < sequence && sequence < occurred && occurred < commit);
});

test('bootstrap shared memakai penambahan kolom yang kompatibel dengan MySQL 5.7', () => {
  assert.match(helpers, /function ensureTableColumn\(PDO \$pdo, string \$table, string \$column, string \$definition\): void/);
  assert.match(helpers, /information_schema\.COLUMNS WHERE TABLE_SCHEMA=DATABASE\(\) AND TABLE_NAME=\? AND COLUMN_NAME=\?/);
  assert.match(helpers, /ALTER TABLE `"\.\$table\."` ADD COLUMN `"\.\$column\."`/);
  const bootstrap = helpers.slice(helpers.indexOf('function ensureApiSupportTables'),helpers.indexOf('function ensureApiMigrationTable'));
  assert.doesNotMatch(bootstrap,/ADD COLUMN IF NOT EXISTS/);
});

test('mutation Gudang dan Cabang mengikuti mutex authorization lifecycle dan soft delete', () => {
  for (const [source,resource] of [[warehousesEndpoint,'item'],[branchesEndpoint,'branch']]) {
    for (const verb of ['create','edit','delete']) {
      assert.match(source, new RegExp(`lockInventoryMutation\\(\\$pdo\\);\\s*\\$authorization=lockInventoryMutationAuthorization\\(\\$pdo,\\$actor,'${resource}:${verb}'\\);\\s*\\$actor=\\$authorization\\['actor'\\]`));
    }
    assert.doesNotMatch(source, /ADD COLUMN IF NOT EXISTS/);
    assert.match(source, /catch\s*\(Throwable \$error\)[\s\S]*?rollBack\(\)[\s\S]*?transactionExceptionStatus\(\$error,/);
  }
  assert.match(warehousesEndpoint, /SELECT branch_id,is_default,is_system,is_active FROM warehouses WHERE id=\? FOR UPDATE/);
  assert.match(branchesEndpoint, /SELECT id,is_active FROM branches WHERE id=\? FOR UPDATE/);
  for (const action of ['PUT','DELETE']) {
    const start = branchesEndpoint.indexOf(`case '${action}':`);
    const end = branchesEndpoint.indexOf(action === 'PUT' ? "case 'DELETE':" : 'default:', start);
    const block = branchesEndpoint.slice(start, end);
    const authorization = block.indexOf('lockInventoryMutationAuthorization');
    const branchScope = block.indexOf('assertLockedInventoryBranchAccess($authorization,$id)');
    const target = block.indexOf('SELECT id,is_active FROM branches WHERE id=? FOR UPDATE');
    assert.ok(authorization >= 0 && branchScope > authorization && target > branchScope);
  }
  assert.match(branchesEndpoint, /UPDATE branches SET is_active=0 WHERE id=\?/);
  assert.doesNotMatch(branchesEndpoint, /DELETE FROM branches/);
});

test('validasi akses cabang setelah mutex melempar exception agar catch selalu rollback', () => {
  assert.match(helpers, /function assertAccessibleBranch\(PDO \$pdo, array \$user, \?string \$branchId\): void[\s\S]*?throw new DomainException\('Akun tidak memiliki akses ke cabang tersebut', 403\)/);
  assert.match(helpers, /function transactionExceptionStatus\(Throwable \$error, int \$fallback\): int[\s\S]*?in_array\(\$error->getCode\(\), \[403,404,409\], true\)/);
  const expectedCalls = [
    [stockAdjustments, 2, 'stock-adjustments'],
    [salesInvoices, 5, 'sales-invoices'],
    [goodsReceipts, 3, 'goods-receipts'],
    [warehouseTransfers, 4, 'warehouse-transfers'],
    [stockMovements, 1, 'stock-movements'],
  ];
  for (const [source, minimum, label] of expectedCalls) {
    const calls = source.match(/(?:assertAccessibleBranch\(\$pdo,|assertLockedInventoryBranchAccess\(\$authorization,)/g) || [];
    assert.ok(calls.length >= minimum, `${label}: hanya ${calls.length} validasi exception-only, minimal ${minimum}`);
  }
  const expectedCatches = [
    [stockAdjustments, 3, 'stock-adjustments'],
    [salesInvoices, 3, 'sales-invoices'],
    [goodsReceipts, 3, 'goods-receipts'],
    [warehouseTransfers, 4, 'warehouse-transfers'],
    [stockMovements, 1, 'stock-movements'],
  ];
  for (const [source, minimum, label] of expectedCatches) {
    const catches = source.match(/transactionExceptionStatus\(\$e,/g) || [];
    assert.ok(catches.length >= minimum, `${label}: hanya ${catches.length} catch mempertahankan 403, minimal ${minimum}`);
  }
});

test('bootstrap saldo gudang nol ikut mutex persediaan saat traffic masih aktif', () => {
  const backfillStart = helpers.indexOf('INSERT IGNORE INTO warehouse_stocks');
  const scope = helpers.slice(Math.max(0, backfillStart - 1500), backfillStart + 1000);
  assert.match(scope, /beginTransaction\(\)[\s\S]*?lockInventoryMutation\(\$pdo\)[\s\S]*?INSERT IGNORE INTO warehouse_stocks[\s\S]*?commit\(\)/);
  assert.match(scope, /catch \(Throwable \$error\)[\s\S]*?rollBack\(\)[\s\S]*?throw \$error/);
  assert.match(scope, /HAVING COUNT\(w.id\)<>1/);
  assert.match(scope, /INSERT IGNORE INTO warehouse_stocks \(warehouse_id, item_id, quantity, reserved_quantity, stock_version\)/);
  assert.match(scope, /CASE WHEN s.stock<>0 OR GREATEST\(0, s.stock - s.sellable_stock\)<>0 THEN 1 ELSE 0 END/);
});

test('rollback mempertahankan mutex persediaan dan menghapus marker bootstrap fitur', () => {
  assert.doesNotMatch(rollback, /DROP TABLE IF EXISTS `inventory_operation_locks`/);
  assert.match(rollback,/DELETE FROM app_schema_migrations WHERE migration_key IN \('schema_20260904_historical_stock_opname_v2','api_support_20260903_historical_stock_opname_v1'\)/);
});

test('set user terkunci tidak boleh berubah antara preflight dan root lock', () => {
  for (const [start, end] of [
    ["if($method==='PUT'&&$id)", "if($method==='DELETE'&&$id)"],
    ["if($method==='DELETE'&&$id)", 'respondError(\'Method not allowed\''],
  ]) {
    const block = endpoint.slice(endpoint.indexOf(start), endpoint.indexOf(end));
    assert.match(block, /\(string\)\$row\['assigned_user_id'\]!==\(string\)\$preflight\['assigned_user_id'\][\s\S]*?Petugas Perintah Stok Opname berubah, silakan ulangi/);
  }
});

test('hasil Posted tidak dapat dihapus walaupun adjustment_id kosong', () => {
  const deleteBlock = endpoint.slice(endpoint.indexOf("if($method==='DELETE'&&$id)"));
  assert.match(deleteBlock, /\$row\['result_status'\]==='Posted'[\s\S]*?Hasil Stok Opname yang sudah diposting tidak dapat dihapus/);
  assert.doesNotMatch(deleteBlock, /if\(\$row\['adjustment_id'\]\)throw new InvalidArgumentException\('Hapus Penyesuaian Stok/);
});

test('adjustment dari Hasil Stok Opname Posted tidak dapat dibatalkan atau dihapus', () => {
  assert.match(helpers, /SELECT id,order_id,status FROM stock_count_results WHERE adjustment_id=\? FOR UPDATE/);
  assert.match(stockAdjustments, /lockStockOpnameResultForAdjustment\(\$pdo,\$id\)/);
  assert.match(stockAdjustments, /Penyesuaian dari Hasil Stok Opname tidak dapat diubah, diposting ulang, atau dibatalkan/);
  assert.doesNotMatch(stockAdjustments, /UPDATE stock_count_results SET status='Cancelled' WHERE adjustment_id=\?/);
  const deleteBlock = stockAdjustments.slice(stockAdjustments.indexOf("if ($method === 'DELETE'"));
  assert.match(deleteBlock, /lockStockOpnameResultForAdjustment\(\$pdo,\$id\)[\s\S]*?Penyesuaian yang terhubung ke Hasil Stok Opname tidak dapat dihapus/);
  assert.match(page, /selected\.result&&selected\.result\.status!=='Posted'[\s\S]*?Hapus Hasil Stok Opname/);
});

test('UI Penyesuaian Stok menyembunyikan aksi destruktif untuk adjustment linked Opname', () => {
  assert.match(stockAdjustments, /is_stock_opname_linked/);
  assert.match(stockAdjustments, /'isStockOpnameLinked'\s*=>\s*!empty\(\$row\['is_stock_opname_linked'\]\)/);
  assert.match(openingStockImport, /isStockOpnameLinked:\s*boolean/);
  assert.match(openingStockImport, /canDeleteAdjustment\(document\)/);
  assert.match(openingStockImport, /canCancelAdjustment\(selectedDocument\)/);
});

test('aksi adjustment memakai predicate status dan linkage yang sama pada list serta detail', () => {
  assert.match(openingStockImport,/const canDeleteAdjustment = \(document: AdjustmentDocument\) =>\s*document\.status === ["']Draft["'] && !document\.isStockOpnameLinked/);
  assert.match(openingStockImport,/const canCancelAdjustment = \(document: AdjustmentDocument\) =>\s*document\.status === ["']Posted["'] && !document\.isStockOpnameLinked/);
  assert.ok((openingStockImport.match(/canDeleteAdjustment\((?:document|selectedDocument)\)/g)||[]).length>=2);
  assert.ok((openingStockImport.match(/canCancelAdjustment\((?:document|selectedDocument)\)/g)||[]).length>=1);
  assert.doesNotMatch(openingStockImport,/document\.status !== ["']Draft["'][\s\S]{0,300}handleDelete\(document\)/);
  const processBlock=openingStockImport.slice(openingStockImport.indexOf('const processDocument = async'),openingStockImport.indexOf('const filteredDocuments'));
  const deleteGuard=processBlock.indexOf("action === \"delete\" && !canDeleteAdjustment(document)");
  const cancelGuard=processBlock.indexOf("action === \"cancel\" && !canCancelAdjustment(document)");
  const apiCall=processBlock.indexOf('await api.');
  assert.ok(deleteGuard>=0&&cancelGuard>=0&&deleteGuard<apiCall&&cancelGuard<apiCall);
});

test('concurrency CI merace posting Opname dengan pembatalan adjustment linked dan memverifikasi state akhir', () => {
  const workerUrl = new URL('../tests/fixtures/stock-opname-lock-worker.php', import.meta.url);
  assert.equal(existsSync(workerUrl), true);
  const worker = readFileSync(workerUrl, 'utf8');
  assert.match(helpers, /function lockStockOpnameResultForAdjustment\(PDO \$pdo, string \$adjustmentId\): \?array/);
  assert.match(stockAdjustments, /lockStockOpnameResultForAdjustment\(\$pdo,\$id\)/);
  assert.match(worker, /lockInventoryMutation\(\$pdo\)/);
  assert.match(worker, /lockInventoryMutationAuthorization\(\$pdo,\['id'=>\$userIds\[0\]\],\$permission,array_slice\(\$userIds,1\)\)/);
  assert.doesNotMatch(worker, /lockStockOpnameUsers\(/);
  assert.match(worker, /\$mode==='post'/);
  assert.match(worker, /\$mode==='cancel'/);
  assert.match(worker, /lockStockOpnameResultForAdjustment\(\$pdo,\s*\$adjustmentId\)/);
  assert.match(migrationWorkflow, /stock-opname-lock-worker\.php post USER-A,USER-B SC-LOCK SCR-LOCK ADJ-LOCK[\s\S]*?stock-opname-lock-worker\.php cancel USER-B,USER-A SC-LOCK SCR-LOCK ADJ-LOCK/);
  assert.match(migrationWorkflow, /CREATE TABLE roles\(id VARCHAR\(20\) PRIMARY KEY,code VARCHAR\(20\),name VARCHAR\(50\),permissions LONGTEXT,is_active TINYINT\(1\) NOT NULL\)/);
  assert.match(migrationWorkflow, /INSERT INTO roles\(id,code,name,permissions,is_active\)/);
  assert.match(migrationWorkflow, /ROLE-LOCK-A[\s\S]*?ROLE-LOCK-B/);
  assert.match(migrationWorkflow, /USER-A','ROLE-LOCK-A[\s\S]*?USER-B','ROLE-LOCK-B/);
  assert.match(migrationWorkflow, /INSERT INTO users\(id,role_id,is_active,is_owner,branch_id\)/);
  assert.match(migrationWorkflow, /test "\$CANCEL_STATUS" = "3"/);
  assert.match(migrationWorkflow, /FINAL_RESULT_STATUS[\s\S]*?FINAL_ADJUSTMENT_STATUS[\s\S]*?FINAL_QUANTITY[\s\S]*?test "\$FINAL_RESULT_STATUS" = "Posted"[\s\S]*?test "\$FINAL_ADJUSTMENT_STATUS" = "Posted"[\s\S]*?test "\$FINAL_QUANTITY" = "9"/);
  assert.doesNotMatch(migrationWorkflow, /stock_count_lock_actors|stock_count_lock_orders/);
  assert.match(worker,/post-ready/);
  assert.match(worker,/cancel-attempting/);
  assert.match(worker,/cancel-observed/);
  assert.match(worker,/observe-without-mutex/);
  assert.match(worker,/release/);
  assert.match(migrationWorkflow,/INFORMATION_SCHEMA\.INNODB_LOCK_WAITS/);
  assert.match(migrationWorkflow,/NEGATIVE_CONTROL[\s\S]*?Draft:Draft:8/);
  assert.match(migrationWorkflow,/CANCEL_OBSERVED[\s\S]*?Posted:Posted/);
  assert.doesNotMatch(migrationWorkflow,/sleep 0\.1/);
  assert.doesNotMatch(migrationWorkflow,/ADJ-LOCK 750/);
});

test('aksi start mengunci ulang gudang dan menolak gudang lintas cabang, nonaktif, atau sistem', () => {
  const startBlock = endpoint.slice(endpoint.indexOf("if($action==='start')"), endpoint.indexOf("if(!$row['result_id']||"));
  assert.match(startBlock, /SELECT id,branch_id,is_active,is_system FROM warehouses WHERE id=\? FOR UPDATE/);
  assert.match(startBlock, /\(string\)\$startWarehouse\['branch_id'\]!==\(string\)\$row\['branch_id'\]/);
  assert.match(startBlock, /!\(bool\)\$startWarehouse\['is_active'\][\s\S]*?\(bool\)\$startWarehouse\['is_system'\]/);
});

test('aksi start menolak end_date legacy yang masih di masa depan', () => {
  const startBlock = endpoint.slice(endpoint.indexOf("if($action==='start')"), endpoint.indexOf("if(!$row['result_id']||"));
  assert.match(startBlock, /\(string\)\$row\['end_date'\]>date\('Y-m-d'\)/);
  assert.match(startBlock, /Tanggal akhir Stok Opname belum tercapai/);
});

test('nomor Hasil Stok Opname memakai bulan Tanggal Akhir historis', () => {
  const startBlock = endpoint.slice(endpoint.indexOf("if($action==='start')"), endpoint.indexOf("if(!$row['result_id']||"));
  assert.match(startBlock, /\$period=date\('ym',strtotime\(\(string\)\$row\['end_date'\]\)\)/);
  assert.match(startBlock, /\$resultNumber='HSO-'\.\$period/);
});

test('aksi start mengunci ulang kategori dan petugas sesuai cabang order', () => {
  const startBlock = endpoint.slice(endpoint.indexOf("if($action==='start')"), endpoint.indexOf("if(!$row['result_id']||"));
  assert.match(startBlock, /SELECT id,is_active FROM item_categories WHERE id=\? FOR UPDATE/);
  assert.match(startBlock, /lockedInventoryDelegatedUserForBranch\(\$authorization,\(string\)\$row\['assigned_user_id'\],\(string\)\$row\['branch_id'\]/);
});

test('GET detail dan preflight tidak membocorkan keberadaan order lintas cabang', () => {
  assert.match(endpoint, /\$loadOrder\s*=\s*static function\(PDO \$pdo, string \$id, array \$accessibleBranchIds=\[\]\)/);
  assert.match(endpoint, /o\.branch_id IN \(/);
  assert.match(endpoint, /\$loadOrder\(\$pdo,\$id,\$accessibleBranchIds\)/);
  const listQuery = endpoint.slice(endpoint.indexOf("if($method==='GET')"), endpoint.indexOf('$d=getInput()'));
  assert.match(listQuery, /o\.branch_id IN \([\s\S]*?ORDER BY[\s\S]*?LIMIT 250/);
  assert.doesNotMatch(listQuery, /foreach\(\$rows as \$row\).*in_array/);
});

test('Owner dan role all_branches tetap dapat membaca histori cabang nonaktif', () => {
  const helper = helpers.slice(helpers.indexOf('function getAccessibleBranchIds'),helpers.indexOf('function requireAccessibleBranch'));
  assert.match(helper,/SELECT id FROM branches ORDER BY id/);
  assert.doesNotMatch(helper,/is_active\s*=\s*1/);
  assert.match(helpers,/Transaksi baru maupun perubahan transaksi hanya boleh menyentuh cabang aktif/);
});

test('POST mengunci dan memvalidasi ulang izin gudang cabang kategori serta petugas', () => {
  const post = endpoint.slice(endpoint.indexOf("if($method==='POST')"), endpoint.indexOf("if($method==='PUT'"));
  const transaction = post.slice(post.indexOf('beginTransaction'));
  assert.match(transaction, /lockInventoryMutationAuthorization\(\$pdo,\$actor,'stock_opname:create',\[\$assignedId\]\)/);
  assert.match(transaction, /FROM warehouses WHERE id=\? FOR UPDATE/);
  assert.match(transaction, /SELECT id,is_active FROM branches WHERE id=\? FOR UPDATE/);
  assert.match(transaction, /getAccessibleBranchIds\(\$pdo,\$actor\)/);
  assert.match(transaction, /lockedInventoryDelegatedUserForBranch\(\$authorization,\$assignedId/);
  assert.match(transaction, /FROM item_categories WHERE id=\? FOR UPDATE/);
});

test('simpan dan posting menolak payload parsial atau nilai opname tidak sah', () => {
  assert.match(endpoint, /array_key_exists\(\(int\)\$item\['id'\],\$byId\)/);
  assert.match(endpoint, /Daftar barang hasil penghitungan tidak lengkap/);
  assert.match(endpoint, /parseBoundedDecimalInteger\(\$value,'0','2147483647','Kuantitas fisik'\)/);
});

test('posting mengunci ulang gudang dan cabang sebelum membuat adjustment', () => {
  const put = endpoint.slice(endpoint.indexOf("if($method==='PUT'&&$id)"), endpoint.indexOf("if($method==='DELETE'&&$id)"));
  const posting = put.slice(put.indexOf("if(!$complete)"));
  assert.match(posting, /SELECT id,branch_id,is_active,is_system FROM warehouses WHERE id=\? FOR UPDATE/);
  assert.match(posting, /SELECT id,is_active FROM branches WHERE id=\? FOR UPDATE/);
  assert.match(posting, /\$postingWarehouse\['branch_id'\][\s\S]*?\$row\['branch_id'\]/);
});

test('Opname dan selisih dibatasi INT serta nomor ADJ mengikuti tanggal akhir', () => {
  assert.match(endpoint, /2147483647/);
  assert.match(endpoint, /-2147483648/);
  assert.match(endpoint, /date\('ym',strtotime\(\(string\)\$row\['end_date'\]\)\)/);
  assert.match(page, /max=\{2147483647\}/);
});

test('verifikasi Barang mengunci mutex authorization admin dan item sebelum audit atomik', () => {
  const start = itemsEndpoint.indexOf("if($d['action']==='verify')");
  const end = itemsEndpoint.indexOf("$isAdmin=!empty($actor['is_owner']);", start + 1);
  const block = itemsEndpoint.slice(start, end);
  const begin = block.indexOf('$pdo->beginTransaction()');
  const mutex = block.indexOf('lockInventoryMutation($pdo)');
  const authorization = block.indexOf("lockInventoryMutationAuthorization($pdo,$actor,'item:edit')");
  const admin = block.indexOf('assertLockedInventoryOwnerOrAdministrator($authorization)');
  const itemLock = block.indexOf("verification_status='Pending' FOR UPDATE");
  const update = block.indexOf("UPDATE items SET verification_status='Verified'");
  const audit = block.indexOf('INSERT INTO item_verification_audit');
  const commit = block.indexOf('$pdo->commit()');
  assert.ok(begin >= 0 && mutex > begin && authorization > mutex && admin > authorization && itemLock > admin && update > itemLock && audit > update && commit > audit);
  assert.doesNotMatch(block, /catch\s*\(Throwable \$auditError\)/);
  assert.match(block, /error_log\('item verification failed: '\.\$e->getMessage\(\)\);respondError\('Verifikasi barang gagal',500\)/);
  assert.doesNotMatch(block, /Verifikasi barang gagal: '\.\$e->getMessage/);
});

test('GET Transfer Gudang hanya menawarkan gudang pada cabang yang dapat diakses actor', () => {
  const get = warehouseTransfers.slice(warehouseTransfers.indexOf("if($method==='GET')"), warehouseTransfers.indexOf("if($method==='POST')"));
  assert.match(warehouseTransfers, /\$accessibleBranchIds=getAccessibleBranchIds\(\$pdo,\$actor\);\s*\$allowed=array_fill_keys\(\$accessibleBranchIds,true\)/);
  assert.match(get, /branch_id IN \(\$branchPlaceholders\)/);
  assert.match(get, /\$warehouseOptionsStmt->execute\(\$accessibleBranchIds\)/);
  assert.doesNotMatch(get, /\$pdo->query\("SELECT w\.id,w\.code,w\.name,w\.branch_id AS branchId/);
});

test('mutation Faktur Penjualan selalu memiliki actor dan atribusi hapus memakai actor terkunci', () => {
  const switchAt = salesInvoices.indexOf('switch ($method)');
  assert.match(salesInvoices.slice(0, switchAt), /\$actor\s*=\s*\$requestUser\s*\?\?\s*requireAuthenticatedUser\(\$pdo\);/);
  assert.doesNotMatch(salesInvoices, /\$deleteActor\b/);
  const remove = salesInvoices.slice(salesInvoices.indexOf("case 'DELETE':"));
  assert.match(remove, /assertLockedInventoryBranchAccess\(\$authorization, \(string\)\$linkedWorkOrder\['branch_id'\]\)/);
  assert.match(remove, /json_encode\(\$snapshot[\s\S]*?\$actor\['id'\][\s\S]*?\$actor\['name'\]/);
  assert.match(remove, /UPDATE stock_movements SET is_voided=1[\s\S]*?->execute\(\[\$actor\['id'\]/);
});

test('barang provisional memilih dan mengunci ulang kontrak izin penerimaan', () => {
  const post = itemsEndpoint.slice(itemsEndpoint.indexOf("case 'POST':"), itemsEndpoint.indexOf("case 'PUT':"));
  assert.match(post, /\$isProvisional=!empty\(\$d\['provisional'\]\)/);
  assert.match(post, /\$createPermission=authenticatedUserHasPermission\(\$pdo,\$actor,'item:create'\)\?'item:create':'receipt:create'/);
  assert.match(post, /if\(!\$isProvisional&&\$createPermission!=='item:create'\)respondError/);
  assert.match(post, /lockInventoryMutationAuthorization\(\$pdo,\$actor,\$createPermission\)/);
  assert.doesNotMatch(post, /lockInventoryMutationAuthorization\(\$pdo,\$actor,'item:create'\)/);
});

test('mutasi stok mengunci gudang dan cabang aktif lalu memakai scope authorization terkunci', () => {
  const warehouseHelper = helpers.slice(helpers.indexOf('function lockActiveInventoryWarehouses'), helpers.indexOf('function lockActiveInventoryItems'));
  assert.match(warehouseHelper, /SELECT \* FROM warehouses WHERE id IN \(\$placeholders\) ORDER BY id FOR UPDATE/);
  assert.match(warehouseHelper, /SELECT id,is_active FROM branches WHERE id IN \(\$branchPlaceholders\) ORDER BY id FOR UPDATE/);
  assert.match(warehouseHelper, /count\(\$activeBranches\) !== count\(\$branchIds\)/);

  const receiptPut = goodsReceipts.slice(goodsReceipts.indexOf("case 'PUT':"), goodsReceipts.indexOf("case 'DELETE':"));
  const receiptDelete = goodsReceipts.slice(goodsReceipts.indexOf("case 'DELETE':"));
  for (const [label, block] of [['receipt PUT', receiptPut], ['receipt DELETE', receiptDelete]]) {
    const authorization = block.indexOf('lockInventoryMutationAuthorization');
    const warehouseLock = block.indexOf('lockActiveInventoryWarehouses', authorization);
    assert.ok(authorization >= 0 && warehouseLock > authorization, `${label} tidak mengunci gudang aktif setelah authorization`);
    assert.match(block.slice(warehouseLock), /assertLockedInventoryBranchAccess\(\$authorization,/);
    assert.doesNotMatch(block.slice(authorization), /assertAccessibleBranch\(/);
  }

  const adjustmentPost = stockAdjustments.slice(stockAdjustments.indexOf("if ($method === 'POST')"), stockAdjustments.indexOf("if ($method === 'PUT'"));
  const adjustmentPut = stockAdjustments.slice(stockAdjustments.indexOf("if ($method === 'PUT'"), stockAdjustments.indexOf("if ($method === 'DELETE'"));
  assert.match(adjustmentPost, /lockActiveInventoryWarehouses\(\$pdo,array_column\(\$rows,'warehouseId'\)\)/);
  assert.match(adjustmentPut, /lockActiveInventoryWarehouses\(\$pdo,array_column\(\$rows,'warehouseId'\)\)/);
  assert.match(adjustmentPut, /lockActiveInventoryWarehouses\(\$pdo,array_column\(\$lines,'warehouse_id'\)\)/);
  for (const block of [adjustmentPost, adjustmentPut]) {
    assert.match(block, /assertLockedInventoryBranchAccess\(\$authorization,/);
    assert.doesNotMatch(block.slice(block.indexOf('lockInventoryMutationAuthorization')), /assertAccessibleBranch\(/);
  }

  const transferPut = warehouseTransfers.slice(warehouseTransfers.indexOf("if($method==='PUT'&&$id)"), warehouseTransfers.indexOf("if($method==='DELETE'&&$id)"));
  assert.equal((transferPut.match(/lockActiveInventoryWarehouses\(\$pdo,\[\$transfer\['source_warehouse_id'\],\$transfer\['destination_warehouse_id'\]\]\)/g) ?? []).length, 3);
  assert.doesNotMatch(transferPut.slice(transferPut.indexOf('lockInventoryMutationAuthorization')), /assertAccessibleBranch\(/);

  const openingImport = stockMovements.slice(stockMovements.indexOf("if(($d['action']??'')==='opening_balance_import')"), stockMovements.indexOf("$qty=(int)($d['quantity']"));
  assert.match(openingImport, /lockActiveInventoryWarehouses\(\$pdo,array_column\(\$normalizedRows,'warehouseId'\)\)/);
  assert.match(openingImport, /assertLockedInventoryBranchAccess\(\$authorization,/);
  assert.doesNotMatch(openingImport.slice(openingImport.indexOf('lockInventoryMutationAuthorization')), /assertAccessibleBranch\(/);
});

test('kuantitas Penyesuaian Stok divalidasi sebagai signed INT tepat sebelum konversi', () => {
  const integerHelper = helpers.slice(helpers.indexOf('function normalizeBoundedDecimalInteger'), helpers.indexOf('function formatWitaTimestamp'));
  assert.match(integerHelper, /is_bool\(\$value\)/);
  assert.match(integerHelper, /!is_int\(\$value\)&&!is_string\(\$value\)/);
  assert.match(integerHelper, /preg_match\('\/\^-\?\\d\+\$\/'/);
  const post = stockAdjustments.slice(stockAdjustments.indexOf("if ($method === 'POST')"), stockAdjustments.indexOf("if ($method === 'PUT'"));
  const put = stockAdjustments.slice(stockAdjustments.indexOf("if ($method === 'PUT'"), stockAdjustments.indexOf("if ($method === 'DELETE'"));
  const save = put.slice(put.indexOf("if($requestedAction==='save')"), put.indexOf("if($requestedAction==='post'"));
  for (const [label, block] of [['POST', post], ['save', save]]) {
    assert.match(block, /parseBoundedDecimalInteger\(\$input\['quantity'\]\?\?null,'-2147483647','2147483647'/, `${label} wajib parse exact signed INT yang dapat dicatat sebagai magnitude positif`);
    assert.doesNotMatch(block, /\$quantity=\(int\)\(\$input\['quantity'\]/, `${label} masih cast sebelum validasi`);
  }
});

test('rollback membatalkan marker bootstrap API agar bootstrap berikutnya memperbaiki schema', () => {
  assert.match(rollback, /DELETE FROM app_schema_migrations WHERE migration_key IN \('schema_20260904_historical_stock_opname_v2','api_support_20260903_historical_stock_opname_v1'\)/);
  const rollout = migrationWorkflow.slice(migrationWorkflow.indexOf('name: Verify standalone migration then API ledger bootstrap'), migrationWorkflow.indexOf('name: Reject negative partial stock opname schema'));
  const firstBootstrap = rollout.indexOf('ensureApiSupportTablesVersioned($pdo,"api_support_20260903_historical_stock_opname_v1")');
  const rollbackRun = rollout.indexOf('rollback_stock_opname_history.sql', firstBootstrap);
  const secondBootstrap = rollout.indexOf('ensureApiSupportTablesVersioned($pdo,"api_support_20260903_historical_stock_opname_v1")', firstBootstrap + 1);
  assert.ok(firstBootstrap >= 0 && rollbackRun > firstBootstrap && secondBootstrap > rollbackRun);
  assert.match(rollout, /POST_ROLLBACK_API_MARKER[\s\S]*?test "\$POST_ROLLBACK_API_MARKER" = "1"/);
});

test('ownership migration memulihkan definisi adopted dan menghapus semua kolom fresh termasuk system_version', () => {
  assert.match(migration, /stock_opname_schema_ownership[\s\S]*?`?prior_definition`? LONGTEXT NULL/);
  assert.match(migration, /'column','stock_count_result_items','system_version'/);
  assert.ok(migration.indexOf("'column','stock_count_result_items','system_version'") < migration.indexOf('ADD COLUMN `system_version`'));
  assert.match(rollback, /CALL `drop_owned_stock_opname_column`\('stock_count_result_items','system_version'\)/);
  assert.match(rollback, /prior_definition[\s\S]*?MODIFY COLUMN/);
  assert.match(rollback, /IF\(@prior_definition IS NULL[\s\S]*?DROP COLUMN[\s\S]*?MODIFY COLUMN/);
  const ownershipHelper = helpers.slice(helpers.indexOf('function ensureOwnedStockOpnameColumn'), helpers.indexOf('function assertCompatibleStockCountResultItemIndex'));
  assert.match(ownershipHelper, /prior_definition/);
  assert.match(ownershipHelper, /information_schema\.COLUMNS/);
  assert.match(helpers, /ensureOwnedStockOpnameColumn\(\$pdo,'stock_count_result_items','system_version'/);
  assert.match(migrationWorkflow, /ADOPTED_DEFINITION_BEFORE[\s\S]*?test "\$ROLLED_BACK" = "5"[\s\S]*?ADOPTED_DEFINITION_AFTER[\s\S]*?test "\$ADOPTED_DEFINITION_AFTER" = "\$ADOPTED_DEFINITION_BEFORE"/);
  assert.match(migrationWorkflow, /name: Verify fresh stock opname migration ownership rollback[\s\S]*?FRESH_REMAINING_COLUMNS[\s\S]*?test "\$FRESH_REMAINING_COLUMNS" = "0"/);
});
