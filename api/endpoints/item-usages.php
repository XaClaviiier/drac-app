<?php
require_once __DIR__.'/../item-usage.php';
$actor = requireAuthenticatedUser($pdo);
requireAuthenticatedUserPermission($pdo, $actor, 'item_usage:view');

if ($method === 'GET') {
    try {
        if (($_GET['options'] ?? '') === '1') {
            $accounts = $pdo->query("SELECT a.id,a.code,a.name FROM chart_of_accounts a WHERE a.is_active=1 AND a.account_type='Expense' AND NOT EXISTS(SELECT 1 FROM chart_of_accounts c WHERE c.parent_id=a.id) ORDER BY a.code")->fetchAll();
            $branchId = (string)($_GET['branchId'] ?? '');
            $warehouseId = (string)($_GET['warehouseId'] ?? '');
            if ($warehouseId !== '') {
                $warehouse = $pdo->prepare('SELECT branch_id FROM warehouses WHERE id=? AND is_active=1 AND is_system=0 LIMIT 1');
                $warehouse->execute([$warehouseId]);
                $branchId = (string)($warehouse->fetchColumn() ?: '');
            }
            if ($branchId !== '') assertAccessibleBranch($pdo,$actor,$branchId);
            $defaults = getDefaultAccountSettings($pdo,$branchId !== '' ? $branchId : null);
            $defaultId = (string)($defaults['inventoryUsageCoaId'] ?? '');
            $defaultName = '';
            if ($defaultId !== '') {
                $account = $pdo->prepare('SELECT CONCAT("[",code,"] ",name) FROM chart_of_accounts WHERE id=? AND is_active=1 LIMIT 1');
                $account->execute([$defaultId]);
                $defaultName = (string)($account->fetchColumn() ?: '');
            }
            respondSuccess(['accounts'=>$accounts,'defaultExpenseAccountId'=>$defaultId,'defaultExpenseAccountName'=>$defaultName,'branchId'=>$branchId]);
        }
        if (($_GET['preview'] ?? '') === '1') {
            $warehouseId = (string)($_GET['warehouseId'] ?? '');
            $warehouse = $pdo->prepare('SELECT branch_id FROM warehouses WHERE id=? AND is_active=1 AND is_system=0');
            $warehouse->execute([$warehouseId]);
            $branchId = $warehouse->fetchColumn();
            if ($branchId === false) throw new InvalidArgumentException('Gudang tidak tersedia');
            assertAccessibleBranch($pdo,$actor,(string)$branchId);
            itemUsageDate($_GET['date'] ?? '');
            $itemId = (string)($_GET['itemId'] ?? '');
            $item = $pdo->prepare("SELECT id FROM items WHERE id=? AND type='Persediaan' AND is_active=1");
            $item->execute([$itemId]);
            if (!$item->fetchColumn()) throw new InvalidArgumentException('Barang persediaan tidak tersedia');
            $stock = $pdo->prepare('SELECT quantity FROM warehouse_stocks WHERE warehouse_id=? AND item_id=?');
            $stock->execute([$warehouseId,$itemId]);
            respondSuccess(['stock'=>(int)($stock->fetchColumn() ?: 0)]);
        }
        $branches = getAccessibleBranchIds($pdo,$actor);
        $branchFilter = (string)($_GET['branchId'] ?? 'ALL');
        if ($branchFilter !== 'ALL') {
            assertAccessibleBranch($pdo,$actor,$branchFilter);
            $branches = [$branchFilter];
        }
        if (!$branches) { if ($id) respondError('Pemakaian tidak ditemukan',404); respondSuccess([]); }
        $marks = implode(',', array_fill(0,count($branches),'?'));
        $sql = "SELECT u.*,b.name branch_name,w.name warehouse_name,CONCAT('[',a.code,'] ',a.name) expense_account_name,c.name created_by_name
            FROM item_usages u JOIN branches b ON b.id=u.branch_id JOIN warehouses w ON w.id=u.warehouse_id
            LEFT JOIN chart_of_accounts a ON a.id=u.expense_account_id LEFT JOIN users c ON c.id=u.created_by
            WHERE u.branch_id IN ($marks)";
        $params = $branches;
        if ($id) { $sql .= ' AND (u.id=? OR u.usage_number=?)'; $params[]=$id; $params[]=$id; }
        $stmt = $pdo->prepare($sql.' ORDER BY u.usage_date DESC,u.created_at DESC');
        $stmt->execute($params);
        if (!$id) respondSuccess(array_map('mapItemUsage',$stmt->fetchAll()));
        $row = $stmt->fetch();
        if (!$row) respondError('Pemakaian tidak ditemukan',404);
        $doc = mapItemUsage($row);
        $lines = $pdo->prepare('SELECT * FROM item_usage_items WHERE usage_id=? ORDER BY id');
        $lines->execute([$row['id']]);
        $doc['rows'] = array_map(static fn(array $line): array => [
            'itemId'=>$line['item_id'],'code'=>$line['item_code'],'itemName'=>$line['item_name'],'unit'=>$line['unit'],
            'quantity'=>(int)$line['quantity'],
            'stockBefore'=>isset($line['stock_before'])?(int)$line['stock_before']:null,'lineNotes'=>$line['line_notes'],
        ],$lines->fetchAll());
        respondSuccess($doc);
    } catch (Throwable $error) { respondError($error->getMessage(),transactionExceptionStatus($error,422)); }
}

if (!in_array($method,['POST','PUT','DELETE'],true)) respondError('Method not allowed',405);
$input = getInput();
$action = $method === 'POST' ? (string)($input['action'] ?? 'draft') : ($method === 'DELETE' ? 'delete' : (string)($input['action'] ?? ''));
if (($method === 'POST' && !in_array($action,['draft','post'],true)) || ($method === 'PUT' && !in_array($action,['save','post','cancel'],true))) respondError('Aksi pemakaian tidak valid',422);
$permission = $method === 'POST' ? 'create' : ['save'=>'edit','post'=>'post','cancel'=>'cancel','delete'=>'delete'][$action];
requireAuthenticatedUserPermission($pdo,$actor,'item_usage:'.$permission);
$pdo->beginTransaction();
try {
    lockInventoryMutation($pdo);
    $authorization = lockInventoryMutationAuthorization($pdo,$actor,'item_usage:'.$permission);
    assertLockedInventoryPermission($authorization,'item_usage:view');
    if ($action === 'post') assertLockedInventoryPermission($authorization,'item_usage:post');
    $actor = $authorization['actor'];
    if ($method === 'POST') {
        $data = normalizeItemUsage($input);
        $key = itemUsageText($input['requestKey'] ?? '',64,'Identitas permintaan',true);
        if (!preg_match('/^[a-zA-Z0-9_-]{16,64}$/D',$key)) throw new InvalidArgumentException('Identitas permintaan tidak valid');
        $hash = hash('sha256',json_encode([$data,$action],JSON_THROW_ON_ERROR));
        $existing = $pdo->prepare('SELECT * FROM item_usages WHERE request_key=? FOR UPDATE');
        $existing->execute([$key]);
        $doc = $existing->fetch();
        if ($doc) {
            assertLockedInventoryBranchAccess($authorization,(string)$doc['branch_id']);
            if ($doc['created_by'] !== $actor['id'] || !hash_equals($doc['request_hash'],$hash)) throw new DomainException('Permintaan sudah digunakan untuk data berbeda',409);
            $pdo->commit(); respondSuccess(mapItemUsage($doc),'Pemakaian sudah tersimpan');
        }
        $warehouse = lockActiveInventoryWarehouses($pdo,[$data['warehouseId']])[$data['warehouseId']];
        assertLockedInventoryBranchAccess($authorization,(string)$warehouse['branch_id']);
        $data['expenseAccountId'] = resolveItemUsageExpenseAccount($pdo,(string)$warehouse['branch_id']);
        $prefix = 'PAK-'.date('ym',strtotime($data['date'])).'-';
        $sequence = $pdo->prepare('SELECT usage_number FROM item_usages WHERE usage_number LIKE ? ORDER BY usage_number DESC LIMIT 1 FOR UPDATE');
        $sequence->execute([$prefix.'%']);
        $last = (string)($sequence->fetchColumn() ?: '');
        $next = $last === '' ? 1 : ((int)substr($last,-6)+1);
        if ($next > 999999) throw new DomainException('Nomor pemakaian bulan ini telah penuh',409);
        $number = $prefix.str_pad((string)$next,6,'0',STR_PAD_LEFT);
        $id = 'USE-'.bin2hex(random_bytes(12));
        $pdo->prepare('INSERT INTO item_usages(id,usage_number,usage_date,branch_id,warehouse_id,purpose,responsible_name,expense_account_id,request_key,request_hash,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([$id,$number,$data['date'],$warehouse['branch_id'],$data['warehouseId'],$data['purpose'],$data['responsibleName'],$data['expenseAccountId'] ?: null,$key,$hash,$actor['id']]);
        saveItemUsageLines($pdo,$id,$data);
        $stmt = $pdo->prepare('SELECT * FROM item_usages WHERE id=?'); $stmt->execute([$id]); $doc=$stmt->fetch();
        itemUsageAudit($pdo,$actor,$doc,'create',$data['purpose'],['document'=>$doc,'rows'=>$data['rows']]);
        if ($action === 'post') postItemUsage($pdo,$doc,$actor);
    } else {
        if (!$id) throw new InvalidArgumentException('Dokumen wajib dipilih');
        $stmt = $pdo->prepare('SELECT * FROM item_usages WHERE id=? FOR UPDATE'); $stmt->execute([$id]); $doc=$stmt->fetch();
        if (!$doc) throw new DomainException('Pemakaian tidak ditemukan',404);
        assertLockedInventoryBranchAccess($authorization,(string)$doc['branch_id']);
        if (($action === 'post' && $doc['status'] === 'Posted') || ($action === 'cancel' && $doc['status'] === 'Cancelled')) {
            $pdo->commit(); respondSuccess(mapItemUsage($doc),'Pemakaian sudah diproses');
        }
        $revision = parseBoundedDecimalInteger($input['revision'] ?? null,'0','2147483646','Versi dokumen');
        if ($revision !== (int)$doc['revision']) throw new DomainException('Dokumen sudah diubah. Muat ulang pemakaian sebelum melanjutkan.',409);
        if ($action === 'save') {
            if ($doc['status'] !== 'Draft') throw new DomainException('Hanya Draft yang dapat diubah',409);
            $data = normalizeItemUsage($input);
            $warehouse = lockActiveInventoryWarehouses($pdo,[$data['warehouseId']])[$data['warehouseId']];
            assertLockedInventoryBranchAccess($authorization,(string)$warehouse['branch_id']);
            if ((string)$warehouse['branch_id'] !== (string)$doc['branch_id']) throw new InvalidArgumentException('Gudang harus berada di cabang dokumen');
            $data['expenseAccountId'] = resolveItemUsageExpenseAccount($pdo,(string)$warehouse['branch_id']);
            $pdo->prepare('UPDATE item_usages SET usage_date=?,warehouse_id=?,purpose=?,responsible_name=?,expense_account_id=?,revision=revision+1 WHERE id=?')
                ->execute([$data['date'],$data['warehouseId'],$data['purpose'],$data['responsibleName'],$data['expenseAccountId'] ?: null,$id]);
            saveItemUsageLines($pdo,$id,$data);
            itemUsageAudit($pdo,$actor,$doc,'edit',$data['purpose'],['before'=>$doc,'after'=>$data]);
        } elseif ($action === 'post') {
            if ($doc['status'] !== 'Draft') throw new DomainException('Hanya Draft yang dapat diposting',409);
            postItemUsage($pdo,$doc,$actor);
        } elseif ($action === 'cancel') {
            if ($doc['status'] !== 'Posted') throw new DomainException('Hanya pemakaian Diposting yang dapat dibatalkan',409);
            $reason = itemUsageText($input['reason'] ?? '',1000,'Alasan pembatalan',true);
            cancelItemUsage($pdo,$doc,$actor,$reason);
        } else {
            if ($doc['status'] !== 'Draft') throw new DomainException('Hanya Draft yang dapat dihapus. Gunakan Batalkan untuk pemakaian Diposting.',409);
            $lines = $pdo->prepare('SELECT * FROM item_usage_items WHERE usage_id=?'); $lines->execute([$id]);
            itemUsageAudit($pdo,$actor,$doc,'delete','Hapus Draft',['document'=>$doc,'rows'=>$lines->fetchAll()]);
            $pdo->prepare('DELETE FROM item_usage_items WHERE usage_id=?')->execute([$id]);
            $pdo->prepare('DELETE FROM item_usages WHERE id=?')->execute([$id]);
            $pdo->commit(); respondSuccess(null,'Draft pemakaian dihapus');
        }
    }
    $stmt = $pdo->prepare('SELECT * FROM item_usages WHERE id=?'); $stmt->execute([$id]); $result=mapItemUsage($stmt->fetch());
    $pdo->commit();
    respondSuccess($result,$action === 'post' ? 'Pemakaian diposting; stok dan biaya tercatat' : ($action === 'cancel' ? 'Pemakaian dibatalkan; stok dan biaya dibalik' : 'Draft pemakaian disimpan'));
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    respondError($error->getMessage(),transactionExceptionStatus($error,422));
}
