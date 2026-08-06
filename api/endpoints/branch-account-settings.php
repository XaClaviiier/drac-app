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
    $rows=$pdo->query("SELECT s.*,b.name branch_name FROM branch_account_settings s JOIN branches b ON b.id COLLATE utf8mb4_unicode_ci=s.branch_id COLLATE utf8mb4_unicode_ci ORDER BY b.code")->fetchAll();
    respondSuccess(array_map('mapBranchAccountSetting',$rows));break;
case 'PUT':
    if(!$id)respondError('Cabang wajib dipilih',422);$d=getInput();
    $pdo->prepare("INSERT INTO branch_account_settings(branch_id,cash_account_id,bank_account_id,qris_account_id,deposit_destination_account_id,receivable_coa_id,service_revenue_coa_id,goods_revenue_coa_id,inventory_coa_id)
        VALUES(?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE cash_account_id=VALUES(cash_account_id),bank_account_id=VALUES(bank_account_id),qris_account_id=VALUES(qris_account_id),deposit_destination_account_id=VALUES(deposit_destination_account_id),receivable_coa_id=VALUES(receivable_coa_id),service_revenue_coa_id=VALUES(service_revenue_coa_id),goods_revenue_coa_id=VALUES(goods_revenue_coa_id),inventory_coa_id=VALUES(inventory_coa_id)")
        ->execute([$id,($d['cashAccountId']??'')?:null,($d['bankAccountId']??'')?:null,null,($d['depositDestinationAccountId']??'')?:null,($d['receivableCoaId']??'')?:null,($d['serviceRevenueCoaId']??'')?:null,($d['goodsRevenueCoaId']??'')?:null,($d['inventoryCoaId']??'')?:null]);
    respondSuccess(null,'Pengaitan akun cabang disimpan');break;
default:respondError('Method not allowed',405);
}
