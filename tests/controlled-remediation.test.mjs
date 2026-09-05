import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('warehouse transfer cancellation authorizes both locked branches before lifecycle and rejects received terminal state', () => {
  const source = read('api/endpoints/warehouse-transfers.php');
  const block = source.slice(source.indexOf("if($requestedAction==='cancel')"), source.indexOf("if($requestedAction!=='receive')"));
  const sourceScope = block.indexOf("assertLockedInventoryBranchAccess($authorization,(string)$transfer['source_branch_id'])");
  const destinationScope = block.indexOf("assertLockedInventoryBranchAccess($authorization,(string)$transfer['destination_branch_id'])");
  const lifecycle = block.indexOf("in_array($transfer['status'],['Draft','Dalam Perjalanan','Diterima Sebagian'],true)");
  const details = block.indexOf('SELECT * FROM warehouse_transfer_items');
  assert.ok(sourceScope >= 0 && destinationScope > sourceScope && lifecycle > destinationScope && details > lifecycle);
  assert.doesNotMatch(block, /assertAccessibleBranch/);

  const deleteBlock = source.slice(source.indexOf("if($method==='DELETE'&&$id)"));
  const deleteScope = deleteBlock.indexOf("assertLockedInventoryBranchAccess($authorization,(string)$row['branch_id'])");
  const deleteLifecycle = deleteBlock.indexOf("$row['status']!=='Draft'");
  assert.ok(deleteScope >= 0 && deleteLifecycle > deleteScope);
  assert.doesNotMatch(deleteBlock, /assertAccessibleBranch/);
});

test('warehouse transfer revalidates every persisted line after lock before send receive or cancel arithmetic', () => {
  const source = read('api/endpoints/warehouse-transfers.php');
  assert.match(source, /parseBoundedDecimalInteger\(\$item\['qty_sent'\]\?\?null,'1','2147483647','Kuantitas kirim tersimpan'\)/);
  assert.match(source, /parseBoundedDecimalInteger\(\$item\['qty_received'\]\?\?null,'0',\(string\)\$sent,'Kuantitas terima tersimpan'\)/);
  assert.equal((source.match(/\$validatePersistedTransferLine\(\$item\)/g)||[]).length,3);
  for(const [startMarker,endMarker] of [
    ["if($requestedAction==='send')","if($requestedAction==='cancel')"],
    ["if($requestedAction==='cancel')","if($requestedAction!=='receive')"],
    ["if($requestedAction!=='receive')","if($method==='DELETE'"],
  ]){
    const block=source.slice(source.indexOf(startMarker),source.indexOf(endMarker));
    const validation=block.indexOf('$validatePersistedTransferLine($item)');
    const arithmetic=Math.min(...['$available<$sent','$remaining=$sent-$received','$qty>$remaining'].map(token=>{const index=block.indexOf(token);return index<0?Number.POSITIVE_INFINITY:index;}));
    assert.ok(validation>=0&&validation<arithmetic);
  }
});

test('stock adjustment update and delete authorize all locked warehouse scopes before sensitive validation', () => {
  const source = read('api/endpoints/stock-adjustments.php');
  const helpers = read('api/helpers.php');
  const warehouseAuthorization = helpers.slice(
    helpers.indexOf('function lockInventoryWarehousesForAuthorization'),
    helpers.indexOf('function lockActiveInventoryWarehouses'),
  );
  assert.match(warehouseAuthorization, /if\(!\$ids\)throw new DomainException\(\$deniedMessage,\$deniedStatus\)/);
  for (const [start, end] of [
    ["if ($method === 'PUT' && $id)", "if ($method === 'DELETE' && $id)"],
    ["if ($method === 'DELETE' && $id)", "respondError('Method not allowed',405)"],
  ]) {
    const block = source.slice(source.indexOf(start), source.indexOf(end));
    const detailLock = block.indexOf('SELECT * FROM stock_adjustment_items WHERE adjustment_id=? FOR UPDATE');
    const scope = block.indexOf('lockInventoryWarehousesForAuthorization($pdo,$authorization,$warehouseIds');
    const linkage = block.indexOf('lockStockOpnameResultForAdjustment');
    const lifecycle = block.indexOf("$doc['status']");
    assert.ok(detailLock >= 0 && scope > detailLock && linkage > scope && lifecycle > scope);
    assert.match(block, /throw new DomainException\('Penyesuaian stok tidak ditemukan',404\)/);
    assert.match(block, /lockInventoryWarehousesForAuthorization\(\$pdo,\$authorization,\$warehouseIds,'Penyesuaian stok tidak ditemukan',404\)/);
    assert.doesNotMatch(block, /assertAccessibleBranch/);
  }
});

test('stock opname-linked adjustment is immutable for save post cancel and delete regardless of lifecycle', () => {
  const source = read('api/endpoints/stock-adjustments.php');
  const put = source.slice(source.indexOf("if ($method === 'PUT' && $id)"), source.indexOf("if ($method === 'DELETE' && $id)"));
  const linkage = put.indexOf('$linkedResult=lockStockOpnameResultForAdjustment($pdo,$id);');
  const unconditionalGuard = put.indexOf("if($linkedResult)throw new InvalidArgumentException('Penyesuaian dari Hasil Stok Opname tidak dapat diubah, diposting ulang, atau dibatalkan');");
  const firstActionBranch = put.indexOf("if($requestedAction==='save')");
  assert.ok(linkage >= 0 && unconditionalGuard > linkage && firstActionBranch > unconditionalGuard);
  assert.doesNotMatch(put, /\$requestedAction==='cancel'&&\$linkedResult/);

  const remove = source.slice(source.indexOf("if ($method === 'DELETE' && $id)"));
  const deleteLinkage = remove.indexOf('lockStockOpnameResultForAdjustment($pdo,$id)');
  const deleteLifecycle = remove.indexOf("$doc['status']!=='Draft'");
  assert.ok(deleteLinkage >= 0 && deleteLifecycle > deleteLinkage);
});

test('sales invoice mutations authorize locked invoice and WO branches before active or relation checks', () => {
  const source = read('api/endpoints/sales-invoices.php');
  for (const marker of ["case 'PUT':", "case 'DELETE':"]) {
    const start = source.indexOf(marker);
    const end = source.indexOf(marker === "case 'PUT':" ? "case 'DELETE':" : "default:", start);
    const block = source.slice(start, end);
    const invoiceScope = block.indexOf("assertLockedInventoryBranchAccess($authorization, (string)$" + (marker === "case 'PUT':" ? "current" : "invoiceRow") + "['branch_id'])");
    const invoiceActive = block.indexOf("assertActiveBranch($pdo, (string)$" + (marker === "case 'PUT':" ? "current" : "invoiceRow") + "['branch_id'])");
    assert.ok(invoiceScope >= 0 && invoiceActive > invoiceScope);
    assert.doesNotMatch(block, /assertAccessibleBranch/);
    const woScope = block.indexOf("assertLockedInventoryBranchAccess($authorization, (string)$linkedWo");
    const woRelation = block.indexOf("['branch_id'] !== (string)$" + (marker === "case 'PUT':" ? "current" : "invoiceRow") + "['branch_id']");
    const duplicateRelation = marker === "case 'PUT':" ? block.indexOf('SELECT invoice_number FROM sales_invoices WHERE wo_id=? AND id<>?') : woRelation;
    assert.ok(woScope >= 0 && duplicateRelation > woScope && woRelation > woScope);
  }
  const post = source.slice(source.indexOf("case 'POST':"), source.indexOf("case 'PUT':"));
  assert.doesNotMatch(post, /assertActiveBranch\([^;]+;assertLockedInventoryBranchAccess/);
});

test('sales invoice reads and mutation roots are scoped in SQL before rows enter application memory', () => {
  const source = read('api/endpoints/sales-invoices.php');
  const get = source.slice(source.indexOf("case 'GET':"), source.indexOf("case 'POST':"));
  assert.match(get, /SELECT \* FROM sales_invoices WHERE branch_id IN \(\$branchMarks\)/);
  assert.match(get, /FROM sales_invoice_items d JOIN sales_invoices i ON i\.id=d\.invoice_id WHERE i\.branch_id IN \(\$branchMarks\)/);
  assert.doesNotMatch(get, /SELECT \* FROM sales_invoices ORDER BY/);
  assert.doesNotMatch(get, /SELECT \* FROM sales_invoice_items ORDER BY/);

  const invoiceRoot = source.slice(source.indexOf('$lockScopedSalesInvoice='), source.indexOf('$lockScopedWorkOrder='));
  assert.match(invoiceRoot, /WHERE id=\? AND branch_id IN \(\$branchMarks\) FOR UPDATE/);
  const workOrderRoot = source.slice(source.indexOf('$lockScopedWorkOrder='), source.indexOf('$actor ='));
  assert.match(workOrderRoot, /WHERE id=\? AND branch_id IN \(\$branchMarks\) FOR UPDATE/);
  for (const block of [
    source.slice(source.indexOf("case 'POST':"), source.indexOf("case 'PUT':")),
    source.slice(source.indexOf("case 'PUT':"), source.indexOf("case 'DELETE':")),
    source.slice(source.indexOf("case 'DELETE':"), source.indexOf('default:')),
  ]) {
    assert.match(block, /\$lockScoped(?:SalesInvoice|WorkOrder)\(\$pdo,\$authorization/);
  }
});

test('stock count report scopes warehouse lookup in SQL before exposing warehouse state', () => {
  const source = read('api/endpoints/stock-count-report.php');
  const lookup = source.slice(source.indexOf('$warehouseId'), source.indexOf('$items ='));
  const scopes = lookup.indexOf('$accessibleBranchIds=getAccessibleBranchIds($pdo,$actor)');
  const query = lookup.indexOf('w.branch_id IN ($branchMarks)');
  const fetch = lookup.indexOf('$warehouse = $warehouseStmt->fetch()');
  assert.ok(scopes >= 0 && query > scopes && fetch > query);
  assert.doesNotMatch(lookup, /requireAccessibleBranch/);
  assert.match(lookup, /if\(!\$accessibleBranchIds\)respondError\('Gudang tidak ditemukan atau nonaktif',404\)/);
});

test('stock count report excludes non-stock historical invoices from balance rollback', () => {
  const report = read('api/endpoints/stock-count-report.php');
  const helpers = read('api/helpers.php');
  const readiness = helpers.slice(helpers.indexOf('function ensureInventoryLedgerReady'), helpers.indexOf('function historicalWarehouseQuantitiesFromLedger'));
  assert.match(report, /historicalWarehouseQuantitiesFromLedger/);
  assert.match(readiness, /Input Cepat Historis \(stok tidak dipotong\)/);
  assert.match(readiness, /SET m\.is_voided=1/);
});

test('user authorization writers replace authoritative fields and branch scopes atomically under inventory mutex', () => {
  const source = read('api/endpoints/users.php');
  const helper = source.slice(source.indexOf('function saveUserBranches'), source.indexOf("if ($action === 'password'"));
  assert.doesNotMatch(helper, /beginTransaction|commit\(|rollBack\(|respondError/);
  assert.match(helper, /throw new LogicException/);
  for (const [marker, next] of [["case 'POST':", "case 'PUT':"], ["case 'PUT':", "case 'DELETE':"], ["case 'DELETE':", 'default:']]) {
    const block = source.slice(source.indexOf(marker), source.indexOf(next, source.indexOf(marker)));
    const begin = block.indexOf('beginTransaction()');
    const mutex = block.indexOf('lockInventoryMutation($pdo)');
    const actorLock = block.indexOf('lockInventoryMutationAuthorization($pdo,$actor');
    const mutation = Math.max(block.indexOf('INSERT INTO users'), block.indexOf('UPDATE users SET'), block.indexOf('DELETE FROM users'));
    const commit = block.indexOf('commit()');
    assert.ok(begin >= 0 && mutex > begin && actorLock > mutex && mutation > actorLock && commit > mutation);
    assert.match(block, /catch\s*\(Throwable \$e\)[\s\S]*?rollBack\(\)/);
  }
  assert.match(source, /function lockValidUserBranchesForWrite[\s\S]*?ORDER BY id FOR UPDATE/);
  const put = source.slice(source.indexOf("case 'PUT':"), source.indexOf("case 'DELETE':"));
  const targetLock = put.indexOf('$existing=lockUserAuthorizationWriteTarget($pdo,$id,$roleId);');
  const sparseFallback = put.indexOf("if(!array_key_exists('roleId',$d))$roleId=(string)($existing['role_id']??'');");
  const roleWrite = put.indexOf("->execute([$d['username'],$d['name'],$d['email']??'',$roleId");
  assert.ok(targetLock >= 0 && sparseFallback > targetLock && roleWrite > sparseFallback);
});

test('stock opname index ownership is recorded before DDL and rollback distinguishes created from adopted index', () => {
  const helpers = read('api/helpers.php');
  const migration = read('database/migrate_stock_opname_history.sql');
  const rollback = read('database/rollback_stock_opname_history.sql');
  const workflow = read('.github/workflows/verify-work-order-estimate.yml');
  const intent = migration.indexOf("VALUES('index','stock_count_result_items','uq_stock_count_result_item',@index_signature)");
  const add = migration.indexOf('ADD UNIQUE KEY `uq_stock_count_result_item`');
  assert.ok(intent >= 0 && add > intent);
  assert.match(rollback, /component_type`='index'[\s\S]*?DROP INDEX `uq_stock_count_result_item`/);
  assert.match(rollback, /@prior_index_definition='0:result_id,item_id:0'[\s\S]*?ADD UNIQUE KEY `uq_stock_count_result_item`/);
  assert.match(workflow, /FRESH_INDEX_COUNT[\s\S]*?test "\$FRESH_INDEX_COUNT" = "0"/);
  assert.match(workflow, /ADOPTED_INDEX_DEF[\s\S]*?test "\$ADOPTED_INDEX_DEF" = "0:result_id,item_id:0"/);
  const runtimeIndex = helpers.slice(helpers.indexOf('function ensureCanonicalStockCountResultItemIndex'), helpers.indexOf('function assertValidExistingStockOpnameSnapshotValues'));
  const runtimeIntent = runtimeIndex.indexOf("VALUES('index','stock_count_result_items','uq_stock_count_result_item',?)");
  const runtimeDdl = runtimeIndex.indexOf('ADD UNIQUE KEY uq_stock_count_result_item');
  assert.ok(runtimeIntent >= 0 && runtimeDdl > runtimeIntent);
});

test('runtime bootstrap backs up adopted NULL rows before normalizing stock opname columns', () => {
  const helpers = read('api/helpers.php');
  const ownershipHelper = helpers.slice(helpers.indexOf('function ensureOwnedStockOpnameColumn'), helpers.indexOf('function assertCompatibleStockCountResultItemIndex'));
  const backupTable = ownershipHelper.indexOf('CREATE TABLE IF NOT EXISTS stock_opname_schema_value_backups');
  const backupRows = ownershipHelper.indexOf('INSERT IGNORE INTO stock_opname_schema_value_backups');
  const returnExisting = ownershipHelper.indexOf('if($existing)return');
  assert.ok(backupTable >= 0 && backupRows > backupTable && returnExisting > backupRows);
  assert.match(ownershipHelper, /\$existing&&\$existing\['IS_NULLABLE'\]==='YES'/);
  assert.match(ownershipHelper, /CAST\(id AS CHAR\)[\s\S]*?WHERE `"\.\$column\."` IS NULL/);
});

test('sales invoice prologue uses MySQL 5.7 column helper and executes in endpoint runtime CI', () => {
  const source = read('api/endpoints/sales-invoices.php');
  const workflow = read('.github/workflows/verify-work-order-estimate.yml');
  const prologue = source.slice(0, source.indexOf('$normalizeManualReceiptNumber'));
  assert.doesNotMatch(prologue, /ADD COLUMN IF NOT EXISTS/);
  assert.match(prologue, /ensureTableColumn\(\$pdo,'sales_invoice_items','warehouse_id'/);
  assert.match(prologue, /ensureTableColumn\(\$pdo,'sales_invoices','manual_receipt_number'/);
  assert.match(workflow, /Execute inventory endpoint schema prologues on MySQL 5\.7[\s\S]*?api\/endpoints\/sales-invoices\.php/);
});

test('stock-affecting request quantities use exact bounded integer parsing before use', () => {
  const receipts = read('api/endpoints/goods-receipts.php');
  const invoices = read('api/endpoints/sales-invoices.php');
  const transfers = read('api/endpoints/warehouse-transfers.php');
  const movements = read('api/endpoints/stock-movements.php');
  const opnames = read('api/endpoints/stock-opnames.php');
  assert.ok((receipts.match(/parseBoundedDecimalInteger\(\$i\['qty'\]\?\?null,'1','2147483647'/g) || []).length >= 2);
  assert.doesNotMatch(receipts, /\(int\)\(\$(?:i|line)\['qty'\]/);
  const invoiceNormalizer = invoices.slice(invoices.indexOf('$normalizeSalesInvoiceItems'), invoices.indexOf('$recordInitialCustomerPayment'));
  assert.match(invoiceNormalizer, /parseBoundedDecimalInteger\(\$line\['qty'\]\?\?1,'1','2147483647'/);
  assert.doesNotMatch(invoiceNormalizer, /\(int\).*\['qty'\]/);
  assert.match(transfers, /parseBoundedDecimalInteger\(\$line\['qty'\]\?\?null,'1','2147483647'/);
  assert.match(transfers, /parseBoundedDecimalInteger\(\$line\['qtyReceived'\]\?\?null,'0','2147483647'/);
  assert.doesNotMatch(transfers, /\(int\)\(\$line\['(?:qty|qtyReceived)'\]/);
  assert.match(movements, /parseBoundedDecimalInteger\(\$d\['quantity'\]\?\?null,'1','2147483647','Kuantitas mutasi'\)/);
  assert.doesNotMatch(movements, /\(int\)\(\$d\['quantity'\]/);
  const countNormalizer = opnames.slice(opnames.indexOf('$parseCount='), opnames.indexOf('$complete=', opnames.indexOf('$parseCount=')));
  assert.match(countNormalizer, /parseBoundedDecimalInteger\(\$value,'0','2147483647','Kuantitas fisik'\)/);
  assert.doesNotMatch(countNormalizer, /is_numeric|\(float\)|\(int\)\$value/);
});

test('stock adjustment rejects INT minimum before a Draft can reach post or cancel', () => {
  const adjustments = read('api/endpoints/stock-adjustments.php');
  assert.ok((adjustments.match(/parseBoundedDecimalInteger\(\$input\['quantity'\]\?\?null,'-2147483647','2147483647'/g) ?? []).length >= 2);
  assert.doesNotMatch(adjustments, /parseBoundedDecimalInteger\(\$input\['quantity'\]\?\?null,'-2147483648'/);
  const persistedMutation = adjustments.slice(adjustments.indexOf('$lockedWarehouseMap=lockActiveInventoryWarehouses', adjustments.indexOf("if ($method === 'PUT'")), adjustments.indexOf("if($requestedAction==='post') $pdo->prepare"));
  const persistedValidation = persistedMutation.indexOf("parseBoundedDecimalInteger($line['quantity']??null,'-2147483647','2147483647','Kuantitas tersimpan penyesuaian')");
  const deltaUse = persistedMutation.indexOf("$delta=$requestedAction==='post'");
  assert.ok(persistedValidation >= 0 && deltaUse > persistedValidation, 'persisted quantity wajib divalidasi sebelum post/cancel delta');
});

test('stock count report reconstructs every lifecycle from the canonical scoped movement ledger', () => {
  const report = read('api/endpoints/stock-count-report.php');
  const helpers = read('api/helpers.php');
  assert.match(report, /historicalWarehouseQuantitiesFromLedger\(\$pdo,\$warehouseId,\$date\)/);
  assert.doesNotMatch(report, /FROM (?:sales_invoices|goods_receipts|warehouse_transfers|stock_adjustments)/);
  const start = helpers.indexOf('function historicalWarehouseQuantitiesFromLedger');
  const end = helpers.indexOf('\nfunction ', start + 10);
  const block = helpers.slice(start, end);
  assert.match(block, /is_voided=0/);
  assert.match(block, /COALESCE\(occurred_at,created_at\)>CONCAT\(\?,' 23:59:59'\)/);
  assert.match(block, /\(source_warehouse_id=\? OR destination_warehouse_id=\?\)/);
  assert.match(block,/source_warehouse_id'] === \$warehouseId&&\$type!=='transfer_receive'/);
  assert.match(block,/destination_warehouse_id'] === \$warehouseId&&\$type!=='transfer_send'/);
});

test('stock card reports signed legacy reversals as positive movement in the opposite direction', () => {
  const movements = read('api/endpoints/stock-movements.php');
  const classifier = movements.slice(movements.indexOf('$classifyMovement='), movements.indexOf("if(($_GET['reconcile']"));
  assert.match(classifier, /\$qty>=0/);
  assert.match(classifier, /\$sourceVisible&&\$type!=='transfer_receive'\?-\$qty:0/);
  assert.match(classifier, /\$destinationVisible&&\$type!=='transfer_send'\?-\$qty:0/);
  assert.match(movements, /\[\$incoming,\$outgoing\]=\$classifyMovement\(\$row,\$sourceVisible,\$destinationVisible\)/);
  assert.doesNotMatch(movements, /\$incoming=.*?\?\(int\)\$row\['quantity'\]:0;[\s\S]*?\$outgoing=.*?\?\(int\)\$row\['quantity'\]:0;/);
});
