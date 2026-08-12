<?php
$pdo->exec("CREATE TABLE IF NOT EXISTS customer_contact_logs (
    id VARCHAR(64) PRIMARY KEY, customer_id VARCHAR(64) NOT NULL, customer_name VARCHAR(150) NOT NULL,
    phone VARCHAR(40) NOT NULL, template_type VARCHAR(40) NOT NULL, message_text TEXT NOT NULL,
    vehicle_id VARCHAR(64) NULL, vehicle_info VARCHAR(180) NULL, work_order_id VARCHAR(64) NULL,
    work_order_number VARCHAR(50) NULL, invoice_id VARCHAR(64) NULL, invoice_number VARCHAR(50) NULL,
    branch_id VARCHAR(64) NULL, status VARCHAR(40) NOT NULL DEFAULT 'WhatsApp Dibuka',
    created_by VARCHAR(64) NULL, created_by_name VARCHAR(150) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_contact_customer (customer_id, created_at), INDEX idx_contact_branch (branch_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

if ($method === 'GET') {
    $user = requireUserPermission($pdo, 'customer:view');
    $where = $id ? ' WHERE customer_id=?' : '';
    $stmt = $pdo->prepare("SELECT * FROM customer_contact_logs{$where} ORDER BY created_at DESC LIMIT 500");
    $stmt->execute($id ? [$id] : []);
    $rows = array_values(array_filter($stmt->fetchAll(), static function($row) use ($pdo,$user) {
        return empty($row['branch_id']) || !empty($user['is_owner']) || in_array($row['branch_id'], getUserBranchIds($pdo, $user['id']), true);
    }));
    foreach ($rows as &$row) {
        foreach (['customer_id'=>'customerId','customer_name'=>'customerName','template_type'=>'templateType','message_text'=>'messageText','vehicle_info'=>'vehicleInfo','work_order_number'=>'workOrderNumber','invoice_number'=>'invoiceNumber','branch_id'=>'branchId','created_by_name'=>'createdByName','created_at'=>'createdAt'] as $from=>$to) $row[$to]=$row[$from];
    }
    respondSuccess($rows);
}

if ($method === 'POST') {
    $user = requireUserPermission($pdo, 'customer:view');
    $d = getInput();
    if (empty($d['customerId']) || empty($d['messageText']) || empty($d['templateType'])) respondError('Data histori kontak belum lengkap', 422);
    $branchId = (string)($d['branchId'] ?? '');
    if ($branchId !== '') requireAccessibleBranch($pdo, $user, $branchId);
    $stmt=$pdo->prepare("INSERT INTO customer_contact_logs(id,customer_id,customer_name,phone,template_type,message_text,vehicle_id,vehicle_info,work_order_id,work_order_number,invoice_id,invoice_number,branch_id,created_by,created_by_name) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    $stmt->execute([generateId(),$d['customerId'],$d['customerName']??'',$d['phone']??'',$d['templateType'],$d['messageText'],$d['vehicleId']??null,$d['vehicleInfo']??null,$d['workOrderId']??null,$d['workOrderNumber']??null,$d['invoiceId']??null,$d['invoiceNumber']??null,$branchId?:null,$user['id']??null,$user['name']??$user['username']??null]);
    respondSuccess(null, 'Histori kontak disimpan');
}
respondError('Method not allowed',405);
