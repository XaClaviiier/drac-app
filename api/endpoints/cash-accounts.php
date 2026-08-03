<?php
if ($method !== 'GET') respondError('Method not allowed', 405);
$rows = $pdo->query("SELECT * FROM cash_accounts WHERE is_active=1 ORDER BY account_type, name")->fetchAll();
foreach ($rows as &$row) {
    $row['accountType']=$row['account_type']; $row['branchId']=$row['branch_id']; $row['isActive']=(bool)$row['is_active'];
}
respondSuccess($rows);
