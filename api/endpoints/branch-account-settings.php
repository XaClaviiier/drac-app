<?php
function mapBranchAccountSetting(array $r): array {
    return ['branchId'=>$r['branch_id'],'branchName'=>$r['branch_name'],'cashAccountId'=>$r['cash_account_id'],
        'bankAccountId'=>$r['bank_account_id'],'qrisAccountId'=>null,
        'depositDestinationAccountId'=>$r['deposit_destination_account_id'],'receivableCoaId'=>$r['receivable_coa_id'],
        'serviceRevenueCoaId'=>$r['service_revenue_coa_id'],'goodsRevenueCoaId'=>$r['goods_revenue_coa_id'],
        'inventoryCoaId'=>$r['inventory_coa_id']];
}
switch($method){
case 'GET':
    $actor=$requestUser??requireAuthenticatedUser($pdo);$allowed=array_fill_keys(getAccessibleBranchIds($pdo,$actor),true);$rows=array_values(array_filter($pdo->query("SELECT s.*,b.name branch_name FROM branch_account_settings s JOIN branches b ON b.id COLLATE utf8mb4_unicode_ci=s.branch_id COLLATE utf8mb4_unicode_ci ORDER BY b.code")->fetchAll(),fn($row)=>isset($allowed[(string)$row['branch_id']])));
    respondSuccess(array_map('mapBranchAccountSetting',$rows));break;
case 'PUT':
    if (!$id) respondError('Cabang wajib dipilih',422);
    $actor=$requestUser??requireAuthenticatedUser($pdo);
    requireAccessibleBranch($pdo,$actor,(string)$id);
    $d=getInput();
    $fields=[
        'cashAccountId'=>'cash_account_id','bankAccountId'=>'bank_account_id',
        'depositDestinationAccountId'=>'deposit_destination_account_id',
        'receivableCoaId'=>'receivable_coa_id','serviceRevenueCoaId'=>'service_revenue_coa_id',
        'goodsRevenueCoaId'=>'goods_revenue_coa_id','inventoryCoaId'=>'inventory_coa_id',
    ];
    $pdo->beginTransaction();
    try {
        // Serialize writes even when this branch does not yet have a settings row.
        $lock=$pdo->prepare('SELECT id FROM branches WHERE id=? FOR UPDATE');
        $lock->execute([$id]);
        if (!$lock->fetchColumn()) throw new InvalidArgumentException('Cabang tidak ditemukan');
        $query=$pdo->prepare('SELECT * FROM branch_account_settings WHERE branch_id=? FOR UPDATE');
        $query->execute([$id]);
        $current=$query->fetch()?:[];
        $next=[];
        foreach ($fields as $field=>$column) {
            // Each settings tab sends only edited fields; preserve all other mappings.
            if (!array_key_exists($field,$d)) { $next[$field]=$current[$column]??null; continue; }
            if ($d[$field]!==null && !is_string($d[$field])) throw new InvalidArgumentException('Format akun tidak valid');
            $next[$field]=trim((string)($d[$field]??''))?:null;
        }
        foreach (['cashAccountId'=>['cash','Kas default tunai'],'bankAccountId'=>['bank','Kas default transfer'],'depositDestinationAccountId'=>['bank','Tujuan setoran']] as $field=>[$type,$label]) {
            if (!array_key_exists($field,$d) || !$next[$field]) continue;
            $check=$pdo->prepare('SELECT account_type,branch_id FROM cash_accounts WHERE id=? AND is_active=1 FOR UPDATE');
            $check->execute([$next[$field]]);
            $account=$check->fetch();
            if (!$account || $account['account_type']!==$type
                || ($type==='cash' && (string)$account['branch_id']!==(string)$id)
                || ($type==='bank' && $account['branch_id'] && (string)$account['branch_id']!==(string)$id)) {
                throw new InvalidArgumentException($label.' harus memakai akun aktif dengan jenis dan cabang yang sesuai');
            }
            requireCashLedgerAccount($pdo,$next[$field]);
        }
        $pdo->prepare('INSERT INTO branch_account_settings(branch_id,cash_account_id,bank_account_id,deposit_destination_account_id,receivable_coa_id,service_revenue_coa_id,goods_revenue_coa_id,inventory_coa_id)
            VALUES(?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE cash_account_id=VALUES(cash_account_id),bank_account_id=VALUES(bank_account_id),deposit_destination_account_id=VALUES(deposit_destination_account_id),receivable_coa_id=VALUES(receivable_coa_id),service_revenue_coa_id=VALUES(service_revenue_coa_id),goods_revenue_coa_id=VALUES(goods_revenue_coa_id),inventory_coa_id=VALUES(inventory_coa_id)')
            ->execute([$id,...array_values($next)]);
        $pdo->commit();
        respondSuccess(null,'Pemetaan kas cabang disimpan');
    } catch (InvalidArgumentException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        respondError($e->getMessage(),422);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    break;
default:respondError('Method not allowed',405);
}
