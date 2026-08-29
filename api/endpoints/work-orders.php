<?php
if (!class_exists('WorkOrderVersionConflictException')) {
    class WorkOrderVersionConflictException extends RuntimeException {}
}

$validateWorkOrderDate = static function ($value): string {
    $dateValue = trim((string)$value);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateValue)) {
        throw new InvalidArgumentException('Tanggal WO tidak valid. Gunakan format YYYY-MM-DD.');
    }
    $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $dateValue, new DateTimeZone('Asia/Makassar'));
    $errors = DateTimeImmutable::getLastErrors();
    if (!$parsed || ($errors !== false && (($errors['warning_count'] ?? 0) > 0 || ($errors['error_count'] ?? 0) > 0)) || $parsed->format('Y-m-d') !== $dateValue) {
        throw new InvalidArgumentException('Tanggal WO tidak valid.');
    }
    return $dateValue;
};

$normalizeWorkOrderVersion = static function ($value): ?string {
    if ($value === null || trim((string)$value) === '') return null;
    try {
        return (new DateTimeImmutable((string)$value, new DateTimeZone('Asia/Makassar')))
            ->setTimezone(new DateTimeZone('UTC'))
            ->format('Y-m-d H:i:s.u');
    } catch (Throwable $error) {
        throw new InvalidArgumentException('Versi WO tidak valid. Muat ulang data lalu coba lagi.');
    }
};

$logWorkOrderFailure = static function (string $operation, Throwable $error): string {
    $reference = substr(hash('sha256', uniqid('', true)), 0, 10);
    error_log(sprintf(
        'Work order %s failed [%s] %s in %s:%d',
        $operation,
        $reference,
        $error->getMessage(),
        $error->getFile(),
        $error->getLine()
    ));
    return $reference;
};

$timelineStageFromStatusLog = static function (array $statusLog, string $coreStatus): string {
    for ($index = count($statusLog) - 1; $index >= 0; $index--) {
        $entry = $statusLog[$index] ?? null;
        if (!is_array($entry)) continue;
        if (preg_match('/\[WO_TIMELINE_STAGE:(diagnosis|approval|parts|working)\]/i', (string)($entry['reason'] ?? ''), $matches)) {
            return strtolower((string)$matches[1]);
        }
        $targetStatus = (string)($entry['to'] ?? '');
        if ($targetStatus === 'Proses') return 'working';
        if (in_array($targetStatus, ['Closed', 'Batal'], true)) return 'lost';
    }
    return $coreStatus === 'Proses' ? 'working' : 'diagnosis';
};

$isTimelineStageTransitionAllowed = static function (string $current, string $next): bool {
    $allowedTransitions = [
        'diagnosis' => ['working'],
        'working' => ['approval', 'parts'],
        'approval' => ['working'],
        'parts' => ['working'],
        'lost' => [],
    ];
    return in_array($next, $allowedTransitions[$current] ?? [], true);
};

$resolveWorkOrderContinuations = static function (
    PDO $pdo,
    array $actor,
    string $currentWoId,
    ?string $fromWoId,
    ?string $toWoId,
    ?string $declaredToBranchId = null,
    ?string $expectedCustomerRefId = null,
    ?string $expectedVehicleRefId = null,
    ?string $currentWoStatus = null
): array {
    $fromWoId = trim((string)$fromWoId) ?: null;
    $toWoId = trim((string)$toWoId) ?: null;
    if (($fromWoId !== null && $fromWoId === $currentWoId) || ($toWoId !== null && $toWoId === $currentWoId)) {
        throw new InvalidArgumentException('WO tidak dapat dilanjutkan ke dirinya sendiri.');
    }
    if ($fromWoId !== null && $fromWoId === $toWoId) {
        throw new InvalidArgumentException('WO asal dan WO tujuan lanjutan tidak boleh sama.');
    }

    $normalizeSourceStatus = static function ($status): string {
        $legacySourceStatus = [
            'Pengecekan' => 'Register',
            'Pending' => 'Register',
            'Batal' => 'Closed',
        ];
        $status = trim((string)$status);
        return $legacySourceStatus[$status] ?? $status;
    };
    $assertSourceCanContinue = static function ($status) use ($normalizeSourceStatus): void {
        if (!in_array($normalizeSourceStatus($status), ['Register', 'Proses', 'Closed'], true)) {
            throw new DomainException('WO asal hanya dapat dilanjutkan ketika berstatus Register, Dikerjakan, atau Lost Sales.');
        }
    };

    $accessibleBranches = array_fill_keys(getAccessibleBranchIds($pdo, $actor), true);
    $loadWo = $pdo->prepare('SELECT id,wo_number,branch_id,customer_ref_id,vehicle_ref_id,status,continued_from_wo_id,continued_to_wo_id FROM work_orders WHERE id=? LIMIT 1 FOR UPDATE');
    $loadBranch = $pdo->prepare('SELECT name,is_active FROM branches WHERE id=? LIMIT 1');
    $loaded = [];
    foreach (['from' => $fromWoId, 'to' => $toWoId] as $direction => $referenceId) {
        if ($referenceId === null) continue;
        $loadWo->execute([$referenceId]);
        $row = $loadWo->fetch();
        if (!$row) throw new InvalidArgumentException('Referensi WO lanjutan tidak ditemukan.');
        $branchId = (string)$row['branch_id'];
        if (!isset($accessibleBranches[$branchId])) {
            throw new DomainException('Akun tidak memiliki akses ke cabang WO lanjutan.');
        }
        $loadBranch->execute([$branchId]);
        $branch = $loadBranch->fetch();
        if (!$branch) throw new InvalidArgumentException('Cabang WO lanjutan tidak ditemukan.');
        if (!(bool)$branch['is_active']) throw new DomainException('Cabang WO lanjutan sudah nonaktif.');
        if ($expectedCustomerRefId !== null && (string)$row['customer_ref_id'] !== $expectedCustomerRefId) {
            throw new DomainException('WO lanjutan harus memakai pelanggan yang sama.');
        }
        if ($expectedVehicleRefId !== null && (string)$row['vehicle_ref_id'] !== $expectedVehicleRefId) {
            throw new DomainException('WO lanjutan harus memakai kendaraan yang sama.');
        }
        $row['branch_name'] = (string)$branch['name'];
        $loaded[$direction] = $row;
    }

    if (isset($loaded['from'])) {
        $existingTarget = trim((string)($loaded['from']['continued_to_wo_id'] ?? ''));
        if ($existingTarget !== '' && $existingTarget !== $currentWoId) {
            throw new DomainException('WO asal sudah dilanjutkan ke WO lain.');
        }
        if ($existingTarget === '') {
            $assertSourceCanContinue($loaded['from']['status']);
        }
    }
    if (isset($loaded['to'])) {
        $existingSource = trim((string)($loaded['to']['continued_from_wo_id'] ?? ''));
        if ($existingSource !== '' && $existingSource !== $currentWoId) {
            throw new DomainException('WO tujuan sudah memiliki WO asal yang berbeda.');
        }
        if ($existingSource === '') {
            $assertSourceCanContinue($currentWoStatus);
        }
        $actualTargetBranchId = (string)$loaded['to']['branch_id'];
        if ($declaredToBranchId !== null && trim($declaredToBranchId) !== '' && trim($declaredToBranchId) !== $actualTargetBranchId) {
            throw new InvalidArgumentException('Cabang tujuan lanjutan tidak sesuai dengan data WO tujuan.');
        }

        $seen = [];
        $cursor = $toWoId;
        $cycleStmt = $pdo->prepare('SELECT continued_to_wo_id FROM work_orders WHERE id=? LIMIT 1');
        for ($hop = 0; $cursor !== null && $hop < 100; $hop++) {
            if ($cursor === $currentWoId) throw new DomainException('Relasi lanjutan WO membentuk siklus.');
            if (isset($seen[$cursor])) throw new DomainException('Relasi lanjutan WO tujuan sudah membentuk siklus.');
            $seen[$cursor] = true;
            $cycleStmt->execute([$cursor]);
            $next = trim((string)($cycleStmt->fetchColumn() ?: ''));
            $cursor = $next !== '' ? $next : null;
        }
        if ($cursor !== null) throw new DomainException('Rantai lanjutan WO terlalu panjang untuk divalidasi.');
    }

    return [
        'fromId' => $fromWoId,
        'fromNumber' => isset($loaded['from']) ? (string)$loaded['from']['wo_number'] : null,
        'fromBranchName' => isset($loaded['from']) ? (string)$loaded['from']['branch_name'] : null,
        'toId' => $toWoId,
        'toNumber' => isset($loaded['to']) ? (string)$loaded['to']['wo_number'] : null,
        'toBranchName' => isset($loaded['to']) ? (string)$loaded['to']['branch_name'] : null,
        'toBranchId' => isset($loaded['to']) ? (string)$loaded['to']['branch_id'] : null,
        'fromNeedsSync' => isset($loaded['from'])
            && trim((string)($loaded['from']['continued_to_wo_id'] ?? '')) !== $currentWoId,
        'toNeedsSync' => isset($loaded['to'])
            && trim((string)($loaded['to']['continued_from_wo_id'] ?? '')) !== $currentWoId,
    ];
};

$normalizeWorkOrderServices = static function (PDO $pdo, array $services): array {
    $result = [];
    $total = 0.0;
    $itemStmt = $pdo->prepare("SELECT id,code,name,receipt_description,type,is_active FROM items WHERE id=?");
    foreach ($services as $service) {
        $qty = max(1, (int)($service['qty'] ?? 1));
        $price = max(0, (float)($service['price'] ?? 0));
        $itemId = !empty($service['itemId']) ? (string)$service['itemId'] : null;
        if ($itemId) {
            $itemStmt->execute([$itemId]);
            $item = $itemStmt->fetch();
            if (!$item || !(bool)$item['is_active']) throw new InvalidArgumentException('Barang atau layanan pada estimasi tidak ditemukan atau nonaktif.');
            $code = (string)$item['code'];
            $name = (string)$item['name'];
            $description = trim((string)($service['description'] ?? '')) ?: (string)($item['receipt_description'] ?? '');
        } else {
            $code = trim((string)($service['code'] ?? ''));
            $name = trim((string)($service['name'] ?? ''));
            $description = trim((string)($service['description'] ?? ''));
            if ($name === '') throw new InvalidArgumentException('Nama layanan manual wajib diisi.');
        }
        $subtotal = $price * $qty;
        $total += $subtotal;
        $result[] = compact('itemId','code','name','description','price','qty','subtotal');
    }
    return ['services' => $result, 'total' => $total];
};
$resolveWorkOrderContacts = static function(PDO $pdo,string $customerId,array $data): array {
    $customerStmt=$pdo->prepare("SELECT primary_contact_id,billing_contact_id FROM customers WHERE id=?");$customerStmt->execute([$customerId]);$customer=$customerStmt->fetch()?:[];
    $load=static function(PDO $pdo,string $personId,string $customerId): ?array {if($personId==='')return null;$stmt=$pdo->prepare("SELECT id,name,phone FROM customer_people WHERE id=? AND customer_id=? AND is_active=1");$stmt->execute([$personId,$customerId]);$row=$stmt->fetch();if(!$row)throw new InvalidArgumentException('Kontak yang dipilih tidak terhubung dengan akun pelanggan.');return $row;};
    $driver=$load($pdo,(string)($data['driverContactId']??''),$customerId);
    $approvalId=(string)($data['approvalContactId']??($customer['primary_contact_id']??''));$approval=$load($pdo,$approvalId,$customerId);
    $billingId=(string)($data['billingContactId']??($customer['billing_contact_id']??$approvalId));$billing=$load($pdo,$billingId,$customerId);
    return [
        'driverContactId'=>$driver['id']??null,'driverName'=>$driver['name']??trim((string)($data['driverName']??'')),'driverPhone'=>$driver['phone']??trim((string)($data['driverPhone']??'')),
        'approvalContactId'=>$approval['id']??null,'approvalContactName'=>$approval['name']??trim((string)($data['approvalContactName']??'')),'approvalContactPhone'=>$approval['phone']??trim((string)($data['approvalContactPhone']??'')),
        'billingContactId'=>$billing['id']??null,'billingContactName'=>$billing['name']??trim((string)($data['billingContactName']??'')),'billingContactPhone'=>$billing['phone']??trim((string)($data['billingContactPhone']??'')),
    ];
};
$syncWorkOrderTechnicians = static function(PDO $pdo, string $woId, string $branchId, ?string $primaryId, array $assistantIds): array {
    $primaryId = trim((string)$primaryId);
    $orderedIds = [];
    if ($primaryId !== '') $orderedIds[] = $primaryId;
    foreach ($assistantIds as $assistantId) {
        $assistantId = trim((string)$assistantId);
        if ($assistantId !== '' && $assistantId !== $primaryId && !in_array($assistantId, $orderedIds, true)) $orderedIds[] = $assistantId;
    }

    assertActiveBranch($pdo, $branchId);
    $loadUser = $pdo->prepare("SELECT u.id,u.name,r.code AS role_code,r.name AS role_name FROM users u JOIN roles r ON r.id=u.role_id AND r.is_active=1 WHERE u.id=? AND u.is_active=1 AND (u.branch_id=? OR EXISTS (SELECT 1 FROM user_branch_access uba WHERE uba.user_id=u.id AND uba.branch_id=?)) LIMIT 1");
    $insert = $pdo->prepare("INSERT INTO work_order_technicians(wo_id,user_id,user_name,assignment_role,sort_order) VALUES(?,?,?,?,?)");
    $primaryName = '';
    $assistantNames = [];
    $validatedUsers = [];
    foreach ($orderedIds as $index => $userId) {
        $loadUser->execute([$userId, $branchId, $branchId]);
        $user = $loadUser->fetch();
        if (!$user) throw new InvalidArgumentException('Teknisi yang dipilih tidak ditemukan atau sudah nonaktif.');
        $roleCode = strtoupper(trim((string)($user['role_code'] ?? '')));
        $roleName = strtolower(trim((string)($user['role_name'] ?? '')));
        if ($roleCode !== 'TKN' && !str_contains($roleName, 'teknisi') && !str_contains($roleName, 'technician')) {
            throw new InvalidArgumentException('Petugas yang dipilih bukan pengguna dengan role Teknisi.');
        }
        $validatedUsers[$userId] = $user;
    }

    // Jangan hapus penugasan lama sebelum seluruh pilihan baru lolos validasi.
    $pdo->prepare("DELETE FROM work_order_technicians WHERE wo_id=?")->execute([$woId]);
    if (!$orderedIds) return ['primaryName' => '', 'assistantIds' => [], 'assistantNames' => []];

    foreach ($orderedIds as $index => $userId) {
        $user = $validatedUsers[$userId];
        $role = $userId === $primaryId ? 'primary' : 'assistant';
        $insert->execute([$woId, $userId, (string)$user['name'], $role, $index]);
        if ($role === 'primary') $primaryName = (string)$user['name'];
        else $assistantNames[] = (string)$user['name'];
    }
    return [
        'primaryName' => $primaryName,
        'assistantIds' => array_values(array_filter($orderedIds, fn($userId) => $userId !== $primaryId)),
        'assistantNames' => $assistantNames,
    ];
};
$formatAuditTimestamp = static function($value): ?string {
    if ($value === null || trim((string)$value) === '') return null;
    try {
        return (new DateTimeImmutable((string)$value, new DateTimeZone('Asia/Makassar')))
            ->format(DateTimeInterface::ATOM);
    } catch (Throwable $error) {
        return (string)$value;
    }
};
$formatWorkOrderVersion = static function($value): ?string {
    if ($value === null || trim((string)$value) === '') return null;
    try {
        return (new DateTimeImmutable((string)$value, new DateTimeZone('Asia/Makassar')))
            ->format('Y-m-d\TH:i:s.uP');
    } catch (Throwable $error) {
        return (string)$value;
    }
};

switch ($method) {
    case 'GET':
        $actor = $requestUser ?? requireAuthenticatedUser($pdo);
        if ($id && $action === 'timeline') {
            $woStmt = $pdo->prepare("SELECT id, branch_id, invoice_id, invoice_number FROM work_orders WHERE id=? LIMIT 1");
            $woStmt->execute([$id]);
            $timelineWo = $woStmt->fetch();
            if (!$timelineWo) throw new InvalidArgumentException('WO tidak ditemukan.');
            requireAccessibleBranch($pdo, $actor, (string)$timelineWo['branch_id']);

            $payload = [
                'woId' => (string)$timelineWo['id'],
                'invoice' => null,
                'payments' => [],
                'paymentAudits' => [],
                'canViewPayments' => authenticatedUserHasPermission($pdo, $actor, 'payment:view'),
            ];
            if (!authenticatedUserHasPermission($pdo, $actor, 'invoice:view')) {
                respondSuccess($payload);
            }

            $invoiceStmt = $pdo->prepare("SELECT * FROM sales_invoices WHERE id=? OR wo_id=? ORDER BY created_at DESC LIMIT 1");
            $invoiceStmt->execute([(string)($timelineWo['invoice_id'] ?? ''), (string)$timelineWo['id']]);
            $invoice = $invoiceStmt->fetch();
            if (!$invoice) respondSuccess($payload);

            $payload['invoice'] = [
                'id' => (string)$invoice['id'],
                'invoiceNumber' => (string)$invoice['invoice_number'],
                'date' => (string)$invoice['date'],
                'total' => (float)$invoice['total'],
                'payment' => (float)$invoice['payment'],
                'status' => (string)$invoice['status'],
                'createdAt' => $formatAuditTimestamp($invoice['created_at'] ?? null),
                'updatedAt' => $formatAuditTimestamp($invoice['updated_at'] ?? null),
            ];

            if ($payload['canViewPayments']) {
                $paymentStmt = $pdo->prepare("SELECT * FROM customer_payments WHERE invoice_id=? ORDER BY date ASC, created_at ASC, id ASC");
                $paymentStmt->execute([(string)$invoice['id']]);
                $payload['payments'] = array_map(static fn($payment) => [
                    'id' => (string)$payment['id'],
                    'paymentNumber' => (string)$payment['payment_number'],
                    'date' => (string)$payment['date'],
                    'amount' => (float)$payment['amount'],
                    'paymentMethod' => (string)$payment['payment_method'],
                    'accountName' => (string)($payment['account_name'] ?? ''),
                    'createdByName' => (string)($payment['created_by_name'] ?? ''),
                    'createdAt' => $formatAuditTimestamp($payment['created_at'] ?? null),
                ], $paymentStmt->fetchAll());

                $auditStmt = $pdo->prepare("SELECT * FROM customer_payment_audit_logs WHERE invoice_id=? ORDER BY created_at ASC, id ASC");
                $auditStmt->execute([(string)$invoice['id']]);
                $payload['paymentAudits'] = array_map(static function($audit) use ($formatAuditTimestamp) {
                    $snapshot = json_decode((string)($audit['snapshot_json'] ?? '{}'), true);
                    return [
                        'id' => (string)$audit['id'],
                        'paymentNumber' => (string)($audit['payment_number'] ?? ''),
                        'action' => (string)($audit['action'] ?? ''),
                        'reason' => (string)($audit['reason'] ?? ''),
                        'amount' => (float)($snapshot['amount'] ?? 0),
                        'paymentMethod' => (string)($snapshot['payment_method'] ?? ''),
                        'accountName' => (string)($snapshot['account_name'] ?? ''),
                        'userName' => (string)($audit['user_name'] ?? ''),
                        'createdAt' => $formatAuditTimestamp($audit['created_at'] ?? null),
                    ];
                }, $auditStmt->fetchAll());
            }
            respondSuccess($payload);
        }
        $allowedBranchMap = array_fill_keys(getAccessibleBranchIds($pdo, $actor), true);
        $rows = array_values(array_filter(
            $pdo->query("SELECT * FROM work_orders ORDER BY date DESC, wo_number DESC")->fetchAll(),
            fn($row) => isset($allowedBranchMap[(string)$row['branch_id']])
        ));
        foreach ($rows as &$r) {
            $r['woNumber']                = $r['wo_number'];
            $r['customerRefId']           = $r['customer_ref_id'];
            $r['customerId']              = $r['customer_id'];
            $r['customerName']            = $r['customer_name'];
            $r['vehicleRefId']            = $r['vehicle_ref_id'];
            $r['plateNumber']             = $r['plate_number'];
            $r['vehicleInfo']             = $r['vehicle_info'];
            $r['driverContactId']         = $r['driver_contact_id'] ?? null;
            $r['driverName']              = $r['driver_name'] ?? null;
            $r['driverPhone']             = $r['driver_phone'] ?? null;
            $r['approvalContactId']       = $r['approval_contact_id'] ?? null;
            $r['approvalContactName']     = $r['approval_contact_name'] ?? null;
            $r['approvalContactPhone']    = $r['approval_contact_phone'] ?? null;
            $r['billingContactId']        = $r['billing_contact_id'] ?? null;
            $r['billingContactName']      = $r['billing_contact_name'] ?? null;
            $r['billingContactPhone']     = $r['billing_contact_phone'] ?? null;
            $r['transactionTime']         = isset($r['transaction_time']) ? substr((string)$r['transaction_time'], 0, 5) : null;
            $r['branchId']                = $r['branch_id'];
            $r['createdBy']               = $r['created_by'] ?? null;
            $r['createdByName']           = $r['created_by_name'] ?? null;
            $r['technicianId']            = $r['technician_id'] ?? null;
            $r['technicianName']          = $r['technician_name'] ?? null;
            $r['complaintComment']        = $r['complaint_comment'] ?? null;
            $r['backdateReason']          = $r['backdate_reason'] ?? null;
            $r['invoiceId']               = $r['invoice_id'];
            $r['invoiceNumber']           = $r['invoice_number'];
            $r['total']                   = (float)$r['total'];
            $r['findings']                = $r['findings'] ?? null;
            $r['diagnosisTemperature']    = isset($r['diagnosis_temperature']) ? (float)$r['diagnosis_temperature'] : null;
            $r['diagnosisLp']             = isset($r['diagnosis_lp']) ? (float)$r['diagnosis_lp'] : null;
            $r['diagnosisHp']             = isset($r['diagnosis_hp']) ? (float)$r['diagnosis_hp'] : null;
            $r['finalTemperature']        = isset($r['final_temperature']) ? (float)$r['final_temperature'] : null;
            $r['finalLp']                 = isset($r['final_lp']) ? (float)$r['final_lp'] : null;
            $r['finalHp']                 = isset($r['final_hp']) ? (float)$r['final_hp'] : null;
            $r['estimateTotal']           = isset($r['estimate_total']) ? (float)$r['estimate_total'] : null;
            $r['approvedAt']              = $r['approved_at'] ?? null;
            $r['approvedServices']        = isset($r['approved_services_json']) && $r['approved_services_json'] ? json_decode($r['approved_services_json'], true) : [];
            $r['pendingAt']               = $r['pending_at'] ?? null;
            $r['pendingUntil']            = $r['pending_until'] ?? null;
            $r['pendingReason']           = $r['pending_reason'] ?? null;
            $r['cancelReason']            = $r['cancel_reason'] ?? null;
            $statusLog                    = isset($r['status_log']) && $r['status_log'] ? json_decode($r['status_log'], true) : [];
            if (!is_array($statusLog)) $statusLog = [];
            $r['statusLog']               = array_values(array_map(static function ($entry) use ($formatAuditTimestamp) {
                if (!is_array($entry)) return $entry;
                if (!empty($entry['at'])) $entry['at'] = $formatAuditTimestamp($entry['at']);
                return $entry;
            }, $statusLog));
            $r['continuedFromWoId']       = $r['continued_from_wo_id'] ?? null;
            $r['continuedFromWoNumber']   = $r['continued_from_wo_number'] ?? null;
            $r['continuedFromBranchName'] = $r['continued_from_branch_name'] ?? null;
            $r['continuedToWoId']         = $r['continued_to_wo_id'] ?? null;
            $r['continuedToWoNumber']     = $r['continued_to_wo_number'] ?? null;
            $r['continuedToBranchName']   = $r['continued_to_branch_name'] ?? null;
            $r['continuedAt']             = $formatAuditTimestamp($r['continued_at'] ?? null);
            $r['continuedBy']             = $r['continued_by'] ?? null;
            $r['continuedByName']         = $r['continued_by_name'] ?? null;
            $r['continuedBranchId']       = $r['continued_branch_id'] ?? null;
            $r['createdAt']               = $formatAuditTimestamp($r['created_at'] ?? null);
            $r['updatedAt']               = $formatWorkOrderVersion($r['updated_at'] ?? null);

            $stmt = $pdo->prepare("SELECT * FROM work_order_services WHERE wo_id = ?");
            $stmt->execute([$r['id']]);
            $r['services'] = array_map(function($s) {
                return [
                    'id'          => (string)$s['id'],
                    'itemId'      => $s['item_id'],
                    'code'        => $s['code'],
                    'name'        => $s['name'],
                    'description' => $s['description'],
                    'price'       => (float)$s['price'],
                    'qty'         => (int)$s['qty'],
                ];
            }, $stmt->fetchAll());
            $technicianStmt = $pdo->prepare("SELECT user_id,user_name,assignment_role FROM work_order_technicians WHERE wo_id=? ORDER BY sort_order,user_name");
            $technicianStmt->execute([$r['id']]);
            $assignments = $technicianStmt->fetchAll();
            $r['assistantTechnicianIds'] = array_values(array_map(static fn($row) => (string)$row['user_id'], array_filter($assignments, static fn($row) => $row['assignment_role'] === 'assistant')));
            $r['assistantTechnicianNames'] = array_values(array_map(static fn($row) => (string)$row['user_name'], array_filter($assignments, static fn($row) => $row['assignment_role'] === 'assistant')));
        }
        respondSuccess($rows);
        break;

    case 'POST':
        $d = getInput();
        $actor = requireUserPermission($pdo, 'wo:create');
        $pdo->beginTransaction();
        try {
            $normalizedServices = $normalizeWorkOrderServices($pdo, is_array($d['services'] ?? null) ? $d['services'] : []);
            $woId = trim((string)($d['id'] ?? '')) ?: generateId();
            $branchId = (string)($d['branchId'] ?? '');
            assertActiveBranch($pdo, $branchId);
            requireAccessibleBranch($pdo, $actor, $branchId);
            $invoiceCollision = $pdo->prepare('SELECT id FROM sales_invoices WHERE wo_id=? LIMIT 1 FOR UPDATE');
            $invoiceCollision->execute([$woId]);
            if ($invoiceCollision->fetchColumn()) throw new DomainException('ID WO sudah terhubung dengan faktur lain. Muat ulang lalu coba lagi.');
            [$customer, $vehicle] = resolveCustomerVehicle(
                $pdo,
                (string)($d['customerRefId'] ?? ''),
                (string)($d['vehicleRefId'] ?? ''),
                true
            );
            $contacts = $resolveWorkOrderContacts($pdo, (string)$customer['id'], $d);
            // WO baru selalu dimulai dari Register, termasuk WO lanjutan.
            $initialStatus = 'Register';
            $transactionDate = $validateWorkOrderDate($d['date'] ?? date('Y-m-d'));
            $transactionTime = substr((string)($d['transactionTime'] ?? date('H:i')), 0, 5);
            $backdateReason = trim((string)($d['backdateReason'] ?? ''));
            $complaint = trim((string)($d['description'] ?? ''));
            if ($complaint === '') throw new InvalidArgumentException('Keluhan pelanggan wajib diisi.');
            if (!preg_match('/^(?:[01]\\d|2[0-3]):[0-5]\\d$/', $transactionTime)) {
                throw new InvalidArgumentException('Waktu WO tidak valid.');
            }
            if ($transactionDate > date('Y-m-d')) {
                throw new InvalidArgumentException('Tanggal WO tidak boleh melewati hari ini.');
            }
            if ($transactionDate . ' ' . $transactionTime > date('Y-m-d H:i')) {
                throw new InvalidArgumentException('Tanggal dan waktu WO tidak boleh melewati waktu sekarang.');
            }
            if ($transactionDate < date('Y-m-d')) {
                requireUserPermission($pdo, 'wo:backdate');
            }
            if (isBackdateReasonRequired($pdo) && $transactionDate < date('Y-m-d') && $backdateReason === '') {
                throw new InvalidArgumentException('Alasan tanggal mundur wajib diisi.');
            }
            $continuation = $resolveWorkOrderContinuations(
                $pdo,
                $actor,
                $woId,
                ($d['continuedFromWoId'] ?? '') ?: null,
                ($d['continuedToWoId'] ?? '') ?: null,
                ($d['continuedBranchId'] ?? '') ?: null,
                (string)$customer['id'],
                (string)$vehicle['id'],
                $initialStatus
            );
            // WO asal yang sedang dipindahkan/dilanjutkan dikecualikan. Relasi
            // dua arah dipasang dalam transaksi ini sebelum commit, sehingga
            // setelahnya sumber tidak lagi dihitung sebagai WO aktif mandiri.
            assertNoActiveWorkOrder($pdo, (string)$vehicle['id'], $continuation['fromId']);
            $woNumber = nextDocumentNumber($pdo, 'work_order', $branchId, $transactionDate);
            // Diagnosa/estimasi adalah aktivitas di dalam tahap Register, bukan
            // status operasional tersendiri.
            $statusLog = [[
                'from' => 'Register',
                'to' => 'Register',
                'at' => date('c'),
                'byUserId' => $actor['id'] ?? '-',
                'byUserName' => $actor['name'] ?? 'System',
                'reason' => '[WO_TIMELINE_STAGE:diagnosis] WO diregister',
            ]];
            $stmt = $pdo->prepare("
                INSERT INTO work_orders (
                    id, wo_number, date, transaction_time, backdate_reason,
                    customer_ref_id, customer_id, customer_name,
                    vehicle_ref_id, plate_number, vehicle_info,
                    driver_contact_id, driver_name, driver_phone,
                    approval_contact_id, approval_contact_name, approval_contact_phone,
                    billing_contact_id, billing_contact_name, billing_contact_phone,
                    description, findings, diagnosis_temperature, diagnosis_lp, diagnosis_hp, final_temperature, final_lp, final_hp,
                    total, estimate_total, approved_at, approved_services_json, pending_at, pending_until, pending_reason,
                    status, cancel_reason, status_log, notes, branch_id, created_by, created_by_name, technician_id, technician_name,
                    continued_from_wo_id, continued_from_wo_number, continued_from_branch_name,
                    continued_to_wo_id, continued_to_wo_number, continued_to_branch_name
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $woId, $woNumber, $transactionDate, $transactionTime, $backdateReason ?: null,
                $customer['id'], $customer['customer_code'], $customer['name'],
                $vehicle['id'], normalizeVehiclePlate($vehicle['plate_number']),
                trim($vehicle['brand'] . ' ' . $vehicle['model'] . ($vehicle['year'] ? ' ' . $vehicle['year'] : '') . ' - ' . $vehicle['color']),
                $contacts['driverContactId'], $contacts['driverName'], $contacts['driverPhone'],
                $contacts['approvalContactId'], $contacts['approvalContactName'], $contacts['approvalContactPhone'],
                $contacts['billingContactId'], $contacts['billingContactName'], $contacts['billingContactPhone'],
                $complaint, $d['findings'] ?? null,
                $d['diagnosisTemperature'] ?? null, $d['diagnosisLp'] ?? null, $d['diagnosisHp'] ?? null,
                $d['finalTemperature'] ?? null, $d['finalLp'] ?? null, $d['finalHp'] ?? null,
                $normalizedServices['total'], $normalizedServices['total'], null, null,
                $d['pendingAt'] ?? null, $d['pendingUntil'] ?? null, $d['pendingReason'] ?? null,
                $initialStatus,
                null,
                json_encode($statusLog),
                $d['notes'] ?? '', $branchId, $actor['id'] ?? null, $actor['name'] ?? null,
                ($d['technicianId'] ?? '') ?: null, ($d['technicianName'] ?? '') ?: null,
                $continuation['fromId'], $continuation['fromNumber'], $continuation['fromBranchName'],
                $continuation['toId'], $continuation['toNumber'], $continuation['toBranchName'],
            ]);
            $pdo->prepare("UPDATE work_orders SET complaint_comment=? WHERE id=?")->execute([($d['complaintComment'] ?? '') ?: null, $woId]);
            $technicianAssignment = $syncWorkOrderTechnicians($pdo, $woId, $branchId, ($d['technicianId'] ?? '') ?: null, is_array($d['assistantTechnicianIds'] ?? null) ? $d['assistantTechnicianIds'] : []);
            if ($technicianAssignment['primaryName'] !== '') {
                $pdo->prepare("UPDATE work_orders SET technician_name=? WHERE id=?")->execute([$technicianAssignment['primaryName'], $woId]);
            }

            if (!empty($normalizedServices['services'])) {
                $sStmt = $pdo->prepare("INSERT INTO work_order_services (wo_id, item_id, code, name, description, price, qty, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                foreach ($normalizedServices['services'] as $s) {
                    $sStmt->execute([$woId, $s['itemId'], $s['code'], $s['name'], $s['description'], $s['price'], $s['qty'], $s['subtotal']]);
                }
            }
            $branchNameStmt = $pdo->prepare('SELECT name FROM branches WHERE id=? LIMIT 1');
            $branchNameStmt->execute([$branchId]);
            $currentBranchName = (string)($branchNameStmt->fetchColumn() ?: $branchId);
            $sourceVersion = null;
            if ($continuation['fromId'] !== null && $continuation['fromNeedsSync']) {
                $pdo->prepare("UPDATE work_orders SET continued_to_wo_id=?,continued_to_wo_number=?,continued_to_branch_name=?,continued_at=CURRENT_TIMESTAMP(6),continued_by=?,continued_by_name=?,continued_branch_id=?,updated_at=CURRENT_TIMESTAMP(6) WHERE id=?")
                    ->execute([$woId,$woNumber,$currentBranchName,$actor['id']??null,$actor['name']??'System',$branchId,$continuation['fromId']]);
                $sourceVersionStmt = $pdo->prepare('SELECT updated_at FROM work_orders WHERE id=?');
                $sourceVersionStmt->execute([$continuation['fromId']]);
                $sourceVersion = $formatWorkOrderVersion($sourceVersionStmt->fetchColumn());
            }
            if ($continuation['toId'] !== null && $continuation['toNeedsSync']) {
                $pdo->prepare("UPDATE work_orders SET continued_from_wo_id=?,continued_from_wo_number=?,continued_from_branch_name=?,updated_at=CURRENT_TIMESTAMP(6) WHERE id=?")
                    ->execute([$woId,$woNumber,$currentBranchName,$continuation['toId']]);
            }
            $versionStmt = $pdo->prepare('SELECT updated_at FROM work_orders WHERE id=?');
            $versionStmt->execute([$woId]);
            $createdVersion = $formatWorkOrderVersion($versionStmt->fetchColumn());
            $pdo->commit();
            respondSuccess([
                'id' => $woId,
                'woNumber' => $woNumber,
                'updatedAt' => $createdVersion,
                'sourceWorkOrder' => $continuation['fromId'] !== null
                    ? ['id' => $continuation['fromId'], 'updatedAt' => $sourceVersion]
                    : null,
            ], 'WO disimpan');
        } catch (InvalidArgumentException | DomainException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            respondError($e->getMessage(), 422);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            $reference = $logWorkOrderFailure('create', $e);
            respondError('Gagal simpan WO. Referensi: ' . $reference, 500);
        }
        break;

    case 'PUT':
        if (!$id) respondError('ID required');
        $d = getInput();
        if ($action === 'timeline-stage') {
            $actor = $requestUser ?? requireAuthenticatedUser($pdo);
            $allowedStages = ['diagnosis', 'approval', 'parts', 'working'];
            $stage = strtolower(trim((string)($d['stage'] ?? '')));
            if (!in_array($stage, $allowedStages, true)) {
                respondError('Tahap timeline tidak valid.', 422);
            }
            $pdo->beginTransaction();
            try {
                $stageStmt = $pdo->prepare("SELECT id,status,branch_id,invoice_id,status_log FROM work_orders WHERE id=? LIMIT 1 FOR UPDATE");
                $stageStmt->execute([$id]);
                $stageWorkOrder = $stageStmt->fetch();
                if (!$stageWorkOrder) throw new InvalidArgumentException('WO tidak ditemukan.');
                assertActiveBranch($pdo, (string)$stageWorkOrder['branch_id']);
                requireAccessibleBranch($pdo, $actor, (string)$stageWorkOrder['branch_id']);
                $coreStatus = (string)$stageWorkOrder['status'];
                if (in_array($coreStatus, ['Selesai', 'Closed', 'Batal'], true) || !empty($stageWorkOrder['invoice_id'])) {
                    throw new DomainException('Tahap WO yang sudah selesai, Lost Sales, atau difakturkan tidak dapat diubah.');
                }
                $statusLog = json_decode((string)($stageWorkOrder['status_log'] ?? '[]'), true);
                if (!is_array($statusLog)) $statusLog = [];
                if ($coreStatus !== 'Proses') {
                    throw new DomainException('Tahap operasional hanya dapat diubah setelah WO berada pada Dikerjakan.');
                }
                $currentTimelineStage = $timelineStageFromStatusLog($statusLog, $coreStatus);
                if (!$isTimelineStageTransitionAllowed($currentTimelineStage, $stage)) {
                    throw new DomainException('Transisi tahap tidak sesuai. Status tunggu hanya dapat dipilih dari Dikerjakan.');
                }
                $note = trim((string)($d['note'] ?? ''));
                $statusLog[] = [
                    'from' => $coreStatus,
                    'to' => $coreStatus,
                    'at' => date('c'),
                    'byUserId' => $actor['id'] ?? '-',
                    'byUserName' => $actor['name'] ?? 'System',
                    'reason' => '[WO_TIMELINE_STAGE:' . $stage . ']' . ($note !== '' ? ' ' . $note : ''),
                ];
                $pendingStage = in_array($stage, ['approval', 'parts'], true);
                $pdo->prepare("UPDATE work_orders SET status_log=?,pending_at=?,pending_reason=?,updated_at=CURRENT_TIMESTAMP(6) WHERE id=?")
                    ->execute([json_encode($statusLog), $pendingStage ? date('Y-m-d H:i:s') : null, $pendingStage ? ($note ?: null) : null, $id]);
                $versionStmt = $pdo->prepare('SELECT updated_at FROM work_orders WHERE id=?');
                $versionStmt->execute([$id]);
                $updatedAt = $formatWorkOrderVersion($versionStmt->fetchColumn());
                $pdo->commit();
                respondSuccess(['id' => $id, 'stage' => $stage, 'updatedAt' => $updatedAt], 'Tahap timeline diperbarui');
            } catch (InvalidArgumentException | DomainException $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                respondError($e->getMessage(), 422);
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                $reference = $logWorkOrderFailure('timeline stage', $e);
                respondError('Gagal mengubah tahap timeline. Referensi: ' . $reference, 500);
            }
        }
        $pdo->beginTransaction();
        try {
            $normalizedServices = $normalizeWorkOrderServices($pdo, is_array($d['services'] ?? null) ? $d['services'] : []);
            [$customer, $vehicle] = resolveCustomerVehicle(
                $pdo,
                (string)($d['customerRefId'] ?? ''),
                (string)($d['vehicleRefId'] ?? ''),
                true,
                false
            );
            $contacts = $resolveWorkOrderContacts($pdo, (string)$customer['id'], $d);
            $currentStmt = $pdo->prepare("SELECT wo_number,customer_ref_id,customer_name,vehicle_ref_id,plate_number,date,transaction_time,backdate_reason,description,status,branch_id,invoice_id,invoice_number,status_log,estimate_total,approved_at,approved_services_json,technician_id,continued_from_wo_id,continued_from_wo_number,continued_from_branch_name,continued_to_wo_id,continued_to_wo_number,continued_to_branch_name,continued_at,continued_by,continued_by_name,continued_branch_id,updated_at FROM work_orders WHERE id=? FOR UPDATE");
            $currentStmt->execute([$id]);
            $currentWorkOrder = $currentStmt->fetch();
            if (!$currentWorkOrder) {
                throw new InvalidArgumentException('WO tidak ditemukan.');
            }
            $actor = $requestUser ?? requireAuthenticatedUser($pdo);
            assertActiveBranch($pdo, (string)$currentWorkOrder['branch_id']);
            requireAccessibleBranch($pdo, $actor, (string)$currentWorkOrder['branch_id']);
            if (!array_key_exists('updatedAt', $d) || trim((string)$d['updatedAt']) === '') {
                throw new WorkOrderVersionConflictException('Versi WO tidak tersedia. Muat ulang data sebelum menyimpan kembali.');
            }
            $clientVersion = $normalizeWorkOrderVersion($d['updatedAt']);
            $databaseVersion = $normalizeWorkOrderVersion($currentWorkOrder['updated_at'] ?? null);
            if ($clientVersion === null || $databaseVersion === null || $clientVersion !== $databaseVersion) {
                throw new WorkOrderVersionConflictException('WO telah berubah di perangkat lain. Muat ulang data sebelum menyimpan kembali.');
            }
            $linkedInvoiceStmt = $pdo->prepare('SELECT id,invoice_number FROM sales_invoices WHERE wo_id=? LIMIT 1 FOR UPDATE');
            $linkedInvoiceStmt->execute([$id]);
            $reverseLinkedInvoice = $linkedInvoiceStmt->fetch();
            if (!empty($currentWorkOrder['invoice_id']) || $reverseLinkedInvoice) {
                throw new DomainException('WO yang sudah difakturkan tidak dapat diedit. Ubah rincian pada faktur atau hapus faktur terlebih dahulu.');
            }
            $vehicleChanged = (string)$currentWorkOrder['vehicle_ref_id'] !== (string)$vehicle['id'];
            if ($vehicleChanged) assertVehicleColorClear($vehicle);
            $identityChanged = (string)$currentWorkOrder['customer_ref_id'] !== (string)$customer['id']
                || (string)$currentWorkOrder['vehicle_ref_id'] !== (string)$vehicle['id'];
            $correctionReason = trim((string)($d['correctionReason'] ?? ''));
            if ($identityChanged) {
                requireUserPermission($pdo, 'wo:edit');
                if ($correctionReason === '') throw new InvalidArgumentException('Alasan koreksi customer/kendaraan wajib diisi.');
            }
            $legacyStatusMap = [
                'Pengecekan' => 'Register',
                'Pending' => 'Register',
                'Invoiced' => 'Selesai',
            ];
            $storedStatus = (string)$currentWorkOrder['status'];
            $currentStatus = $legacyStatusMap[$storedStatus] ?? $storedStatus;
            $requestedStatus = (string)($d['status'] ?? $currentStatus);
            $nextStatus = $legacyStatusMap[$requestedStatus] ?? $requestedStatus;
            $complaint = trim((string)($d['description'] ?? $currentWorkOrder['description'] ?? ''));
            if ($complaint === '') throw new InvalidArgumentException('Keluhan pelanggan wajib diisi.');
            $technicianId = trim((string)($d['technicianId'] ?? $currentWorkOrder['technician_id'] ?? ''));
            $allowedTransitions = [
                'Register' => ['Register', 'Proses', 'Closed'],
                'Proses' => ['Proses', 'Selesai', 'Closed'],
                'Selesai' => ['Selesai', 'Proses', 'Closed'],
                'Closed' => ['Closed', 'Proses'],
            ];
            if (!isset($allowedTransitions[$currentStatus]) || !in_array($nextStatus, $allowedTransitions[$currentStatus], true)) {
                throw new InvalidArgumentException("Perubahan status {$currentStatus} ke {$nextStatus} tidak diizinkan.");
            }
            $hasPositiveEstimate = !empty($normalizedServices['services']) && $normalizedServices['total'] > 0;
            if (in_array($nextStatus, ['Proses', 'Selesai'], true) && !$hasPositiveEstimate) {
                throw new InvalidArgumentException(
                    $nextStatus === 'Proses'
                        ? 'Persetujuan tidak dapat diproses. Tambahkan minimal satu layanan dan pastikan total estimasi lebih dari Rp0.'
                        : 'WO tidak dapat diselesaikan. Tambahkan minimal satu layanan dan pastikan total pekerjaan lebih dari Rp0.'
                );
            }
            if (in_array($nextStatus, ['Proses', 'Selesai'], true) && $technicianId === '') {
                throw new InvalidArgumentException('Teknisi utama wajib dipilih sebelum WO dikerjakan atau diselesaikan.');
            }
            if ($nextStatus === 'Selesai') {
                $hasMeasurementSet = static function (array $keys) use ($d): bool {
                    foreach ($keys as $key) {
                        if (!array_key_exists($key, $d) || $d[$key] === null || $d[$key] === '' || !is_numeric($d[$key])) {
                            return false;
                        }
                    }
                    return true;
                };
                $hasDiagnosisMeasurements = $hasMeasurementSet(['diagnosisTemperature', 'diagnosisLp', 'diagnosisHp']);
                $hasFinalMeasurements = $hasMeasurementSet(['finalTemperature', 'finalLp', 'finalHp']);
                $hasCompletionNote = trim((string)($d['findings'] ?? '')) !== '';
                if (!$hasDiagnosisMeasurements && !$hasFinalMeasurements && !$hasCompletionNote) {
                    throw new InvalidArgumentException('WO belum dapat diselesaikan. Isi Suhu, LP, dan HP secara lengkap atau tuliskan catatan hasil pekerjaan.');
                }
            }
            // Validasi WO aktif hanya diperlukan bila kendaraan benar-benar diganti.
            // Perubahan status pada WO yang sama tidak boleh tertahan oleh data lama/duplikat.
            if ($vehicleChanged) {
                assertNoActiveWorkOrder($pdo, (string)$vehicle['id'], (string)$id);
            }
            if ($nextStatus === 'Closed' && trim((string)($d['cancelReason'] ?? '')) === '') {
                throw new InvalidArgumentException('Alasan Lost Sales wajib diisi.');
            }
            $incomingStatusLog = is_array($d['statusLog'] ?? null) ? $d['statusLog'] : [];
            $incomingLastLog = !empty($incomingStatusLog) ? end($incomingStatusLog) : null;
            $reopenReason = is_array($incomingLastLog) ? trim((string)($incomingLastLog['reason'] ?? '')) : '';
            if ($currentStatus === 'Selesai' && $nextStatus === 'Proses' && $reopenReason === '') {
                throw new InvalidArgumentException('Alasan mengembalikan WO ke Dikerjakan wajib diisi.');
            }
            if ($nextStatus === 'Closed') {
                $linkedInvoice = !empty($currentWorkOrder['invoice_id']);
                if (!$linkedInvoice) {
                    $invoiceCheck = $pdo->prepare("SELECT COUNT(*) FROM sales_invoices WHERE wo_id=?");
                    $invoiceCheck->execute([$id]);
                    $linkedInvoice = (int)$invoiceCheck->fetchColumn() > 0;
                }
                if ($linkedInvoice) {
                    throw new InvalidArgumentException('WO yang sudah memiliki faktur tidak dapat dijadikan Lost Sales. Batalkan transaksi melalui Maintenance Data terlebih dahulu.');
                }
            }
            $transactionDate = $validateWorkOrderDate($d['date'] ?? $currentWorkOrder['date']);
            $transactionTime = substr((string)($d['transactionTime'] ?? $currentWorkOrder['transaction_time'] ?? date('H:i')), 0, 5);
            $backdateReason = trim((string)($d['backdateReason'] ?? ''));
            $dateChanged = $transactionDate !== (string)$currentWorkOrder['date'];
            $timeChanged = $transactionTime !== substr((string)($currentWorkOrder['transaction_time'] ?? ''), 0, 5);
            if (!preg_match('/^(?:[01]\\d|2[0-3]):[0-5]\\d$/', $transactionTime)) {
                throw new InvalidArgumentException('Waktu WO tidak valid.');
            }
            if ($transactionDate > date('Y-m-d')) {
                throw new InvalidArgumentException('Tanggal WO tidak boleh melewati hari ini.');
            }
            if ($transactionDate . ' ' . $transactionTime > date('Y-m-d H:i')) {
                throw new InvalidArgumentException('Tanggal dan waktu WO tidak boleh melewati waktu sekarang.');
            }
            if ($dateChanged && $transactionDate < date('Y-m-d')) {
                requireUserPermission($pdo, 'wo:backdate');
            }
            if ($timeChanged) {
                requireUserPermission($pdo, 'wo:backdate');
            }
            if (isBackdateReasonRequired($pdo) && $dateChanged && $transactionDate < date('Y-m-d') && $backdateReason === '') {
                throw new InvalidArgumentException('Alasan tanggal mundur wajib diisi.');
            }
            if (!$dateChanged && $backdateReason === '') {
                $backdateReason = (string)($currentWorkOrder['backdate_reason'] ?? '');
            }
            $statusLog = json_decode((string)($currentWorkOrder['status_log'] ?? '[]'), true);
            if (!is_array($statusLog)) $statusLog = [];
            if ($identityChanged) {
                $statusLog[] = [
                    'from' => $currentStatus,
                    'to' => $currentStatus,
                    'at' => date('c'),
                    'byUserId' => $actor['id'] ?? '-',
                    'byUserName' => $actor['name'] ?? 'System',
                    'reason' => sprintf('Koreksi customer/kendaraan: %s. %s / %s menjadi %s / %s.', $correctionReason, (string)$currentWorkOrder['customer_name'], normalizeVehiclePlate((string)$currentWorkOrder['plate_number']), (string)$customer['name'], normalizeVehiclePlate((string)$vehicle['plate_number'])),
                ];
            }
            if ($nextStatus !== $currentStatus) {
                $statusReason = $nextStatus === 'Closed'
                    ? trim((string)($d['cancelReason'] ?? ''))
                    : (($currentStatus === 'Selesai' && $nextStatus === 'Proses') ? $reopenReason : null);
                $statusLog[] = [
                    'from' => $currentStatus,
                    'to' => $nextStatus,
                    'at' => date('c'),
                    'byUserId' => $actor['id'] ?? '-',
                    'byUserName' => $actor['name'] ?? 'System',
                    'reason' => $statusReason ?: null,
                ];
            }
            $isApproval = $nextStatus === 'Proses' && in_array($currentStatus, ['Register', 'Closed'], true);
            $approvedAt = $isApproval ? date('Y-m-d') : ($currentWorkOrder['approved_at'] ?? null);
            $approvedServicesJson = $isApproval
                ? json_encode($normalizedServices['services'])
                : ($currentWorkOrder['approved_services_json'] ?? null);
            $estimateTotal = $isApproval
                ? $normalizedServices['total']
                : ($currentWorkOrder['estimate_total'] ?? $normalizedServices['total']);
            $continuedFromWoId = array_key_exists('continuedFromWoId', $d)
                ? (($d['continuedFromWoId'] ?? '') ?: null)
                : (($currentWorkOrder['continued_from_wo_id'] ?? '') ?: null);
            $continuedToWoId = array_key_exists('continuedToWoId', $d)
                ? (($d['continuedToWoId'] ?? '') ?: null)
                : (($currentWorkOrder['continued_to_wo_id'] ?? '') ?: null);
            $continuation = $resolveWorkOrderContinuations(
                $pdo,
                $actor,
                (string)$id,
                $continuedFromWoId,
                $continuedToWoId,
                ($d['continuedBranchId'] ?? $currentWorkOrder['continued_branch_id'] ?? '') ?: null,
                (string)$customer['id'],
                (string)$vehicle['id'],
                $currentStatus
            );
            $continuationChanged = (string)($currentWorkOrder['continued_to_wo_id'] ?? '') !== (string)($continuation['toId'] ?? '');
            $continuedAt = $continuation['toId'] === null ? null : ($continuationChanged ? date('Y-m-d H:i:s') : ($currentWorkOrder['continued_at'] ?? null));
            $continuedBy = $continuation['toId'] === null ? null : ($continuationChanged ? ($actor['id'] ?? null) : ($currentWorkOrder['continued_by'] ?? null));
            $continuedByName = $continuation['toId'] === null ? null : ($continuationChanged ? ($actor['name'] ?? 'System') : ($currentWorkOrder['continued_by_name'] ?? null));
            $continuedBranchId = $continuation['toBranchId'];
            $stmt = $pdo->prepare("
                UPDATE work_orders SET
                    wo_number=?, date=?, transaction_time=?, backdate_reason=?,
                    customer_ref_id=?, customer_id=?, customer_name=?,
                    vehicle_ref_id=?, plate_number=?, vehicle_info=?,
                    driver_contact_id=?, driver_name=?, driver_phone=?,
                    approval_contact_id=?, approval_contact_name=?, approval_contact_phone=?,
                    billing_contact_id=?, billing_contact_name=?, billing_contact_phone=?,
                    description=?, findings=?, diagnosis_temperature=?, diagnosis_lp=?, diagnosis_hp=?, final_temperature=?, final_lp=?, final_hp=?,
                    total=?, estimate_total=?, approved_at=?, approved_services_json=?,
                    pending_at=?, pending_until=?, pending_reason=?,
                    status=?, cancel_reason=?, status_log=?, notes=?, branch_id=?, technician_id=?, technician_name=?,
                    invoice_id=?, invoice_number=?,
                    continued_from_wo_id=?, continued_from_wo_number=?, continued_from_branch_name=?,
                    continued_to_wo_id=?, continued_to_wo_number=?, continued_to_branch_name=?,
                    continued_at=?, continued_by=?, continued_by_name=?, continued_branch_id=?,
                    updated_at=CURRENT_TIMESTAMP(6)
                WHERE id=?
            ");
            $stmt->execute([
                $currentWorkOrder['wo_number'], $transactionDate, $transactionTime, $backdateReason ?: null,
                $customer['id'], $customer['customer_code'], $customer['name'],
                $vehicle['id'], normalizeVehiclePlate($vehicle['plate_number']),
                trim($vehicle['brand'] . ' ' . $vehicle['model'] . ($vehicle['year'] ? ' ' . $vehicle['year'] : '') . ' - ' . $vehicle['color']),
                $contacts['driverContactId'], $contacts['driverName'], $contacts['driverPhone'],
                $contacts['approvalContactId'], $contacts['approvalContactName'], $contacts['approvalContactPhone'],
                $contacts['billingContactId'], $contacts['billingContactName'], $contacts['billingContactPhone'],
                $complaint, $d['findings'] ?? null,
                $d['diagnosisTemperature'] ?? null, $d['diagnosisLp'] ?? null, $d['diagnosisHp'] ?? null,
                $d['finalTemperature'] ?? null, $d['finalLp'] ?? null, $d['finalHp'] ?? null,
                $normalizedServices['total'], $estimateTotal, $approvedAt, $approvedServicesJson,
                $d['pendingAt'] ?? null, $d['pendingUntil'] ?? null, $d['pendingReason'] ?? null,
                $nextStatus,
                $d['cancelReason'] ?? null,
                json_encode($statusLog),
                $d['notes'] ?? '', $currentWorkOrder['branch_id'],
                $technicianId ?: null, ($d['technicianName'] ?? '') ?: null,
                $currentWorkOrder['invoice_id'], $currentWorkOrder['invoice_number'],
                $continuation['fromId'], $continuation['fromNumber'], $continuation['fromBranchName'],
                $continuation['toId'], $continuation['toNumber'], $continuation['toBranchName'],
                $continuedAt, $continuedBy, $continuedByName, $continuedBranchId,
                $id
            ]);

            // Jaga relasi lanjutan dua arah dalam transaksi yang sama. Kondisi pada
            // relasi lama mencegah WO lain ikut berubah bila data historis tidak konsisten.
            $oldFromWoId = trim((string)($currentWorkOrder['continued_from_wo_id'] ?? '')) ?: null;
            $oldToWoId = trim((string)($currentWorkOrder['continued_to_wo_id'] ?? '')) ?: null;
            if ($oldFromWoId !== null && $oldFromWoId !== $continuation['fromId']) {
                $pdo->prepare("UPDATE work_orders SET continued_to_wo_id=NULL,continued_to_wo_number=NULL,continued_to_branch_name=NULL,continued_at=NULL,continued_by=NULL,continued_by_name=NULL,continued_branch_id=NULL,updated_at=CURRENT_TIMESTAMP(6) WHERE id=? AND continued_to_wo_id=?")
                    ->execute([$oldFromWoId, $id]);
            }
            if ($oldToWoId !== null && $oldToWoId !== $continuation['toId']) {
                $pdo->prepare("UPDATE work_orders SET continued_from_wo_id=NULL,continued_from_wo_number=NULL,continued_from_branch_name=NULL,updated_at=CURRENT_TIMESTAMP(6) WHERE id=? AND continued_from_wo_id=?")
                    ->execute([$oldToWoId, $id]);
            }
            $currentBranchStmt = $pdo->prepare('SELECT name FROM branches WHERE id=? LIMIT 1');
            $currentBranchStmt->execute([(string)$currentWorkOrder['branch_id']]);
            $currentBranchName = (string)($currentBranchStmt->fetchColumn() ?: '');
            if ($continuation['fromId'] !== null && $continuation['fromNeedsSync']) {
                $sourceLinkStmt = $pdo->prepare("UPDATE work_orders SET continued_to_wo_id=?,continued_to_wo_number=?,continued_to_branch_name=?,continued_at=CURRENT_TIMESTAMP(6),continued_by=?,continued_by_name=?,continued_branch_id=?,updated_at=CURRENT_TIMESTAMP(6) WHERE id=?");
                $sourceLinkStmt->execute([$id, $currentWorkOrder['wo_number'], $currentBranchName, $actor['id'] ?? null, $actor['name'] ?? 'System', $currentWorkOrder['branch_id'], $continuation['fromId']]);
                if ($sourceLinkStmt->rowCount() !== 1) throw new DomainException('Relasi WO asal gagal diperbarui. Muat ulang data lalu coba lagi.');
            }
            if ($continuation['toId'] !== null && $continuation['toNeedsSync']) {
                $targetLinkStmt = $pdo->prepare("UPDATE work_orders SET continued_from_wo_id=?,continued_from_wo_number=?,continued_from_branch_name=?,updated_at=CURRENT_TIMESTAMP(6) WHERE id=?");
                $targetLinkStmt->execute([$id, $currentWorkOrder['wo_number'], $currentBranchName, $continuation['toId']]);
                if ($targetLinkStmt->rowCount() !== 1) throw new DomainException('Relasi WO tujuan gagal diperbarui. Muat ulang data lalu coba lagi.');
            }
            $pdo->prepare("UPDATE work_orders SET complaint_comment=? WHERE id=?")->execute([($d['complaintComment'] ?? '') ?: null, $id]);
            $technicianAssignment = $syncWorkOrderTechnicians($pdo, $id, (string)$currentWorkOrder['branch_id'], $technicianId ?: null, is_array($d['assistantTechnicianIds'] ?? null) ? $d['assistantTechnicianIds'] : []);
            $pdo->prepare("UPDATE work_orders SET technician_name=? WHERE id=?")->execute([$technicianAssignment['primaryName'] ?: null, $id]);

            $pdo->prepare("DELETE FROM work_order_services WHERE wo_id = ?")->execute([$id]);
            if (!empty($normalizedServices['services'])) {
                $sStmt = $pdo->prepare("INSERT INTO work_order_services (wo_id, item_id, code, name, description, price, qty, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                foreach ($normalizedServices['services'] as $s) {
                    $sStmt->execute([$id, $s['itemId'], $s['code'], $s['name'], $s['description'], $s['price'], $s['qty'], $s['subtotal']]);
                }
            }
            $versionStmt = $pdo->prepare('SELECT updated_at FROM work_orders WHERE id=?');
            $versionStmt->execute([$id]);
            $updatedVersion = $formatWorkOrderVersion($versionStmt->fetchColumn());
            $pdo->commit();
            respondSuccess(['updatedAt' => $updatedVersion], 'WO diupdate');
        } catch (WorkOrderVersionConflictException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            respondError($e->getMessage(), 409);
        } catch (InvalidArgumentException | DomainException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            respondError($e->getMessage(), 422);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            $reference = $logWorkOrderFailure('update', $e);
            respondError('Gagal update WO. Referensi: ' . $reference, 500);
        }
        break;

    case 'DELETE':
        if (!$id) respondError('ID required', 422);
        $deleteActor = $requestUser ?? requireAuthenticatedUser($pdo);
        if (!authenticatedUserIsOwnerOrAdministrator($pdo, $deleteActor)) {
            respondError('Hanya Admin atau Owner yang dapat menghapus WO.', 403);
        }
        $pdo->beginTransaction();
        try {
            $woStmt = $pdo->prepare("
                SELECT id, wo_number, status, invoice_id, invoice_number, branch_id
                FROM work_orders WHERE id=? FOR UPDATE
            ");
            $woStmt->execute([$id]);
            $wo = $woStmt->fetch();
            if (!$wo) throw new InvalidArgumentException('WO tidak ditemukan.');
            assertActiveBranch($pdo, (string)$wo['branch_id']);
            requireAccessibleBranch($pdo, $deleteActor, (string)$wo['branch_id']);

            // Jangan hanya mengandalkan work_orders.invoice_id. Data lama mungkin
            // sudah memiliki sales_invoices.wo_id tetapi tautan balik WO belum terisi.
            // Periksa kedua arah relasi secara terpisah. Membandingkan kolom ID
            // lama dengan collation berbeda dalam satu query dapat memicu error
            // "Illegal mix of collations" pada database hasil migrasi.
            $invoiceStmt = $pdo->prepare("
                SELECT id, invoice_number, payment
                FROM sales_invoices WHERE wo_id = ? LIMIT 1 FOR UPDATE
            ");
            $invoiceStmt->execute([$id]);
            $invoice = $invoiceStmt->fetch();
            if (!$invoice && !empty($wo['invoice_id'])) {
                $invoiceStmt = $pdo->prepare("
                    SELECT id, invoice_number, payment
                    FROM sales_invoices WHERE id = ? LIMIT 1 FOR UPDATE
                ");
                $invoiceStmt->execute([$wo['invoice_id']]);
                $invoice = $invoiceStmt->fetch();
            }
            if ($invoice) {
                $paymentStmt = $pdo->prepare("SELECT COUNT(*) FROM customer_payments WHERE invoice_id = ?");
                $paymentStmt->execute([$invoice['id']]);
                $invoiceNumber = $invoice['invoice_number'] ?: ($wo['invoice_number'] ?: 'terkait');
                $hasPayment = (float)$invoice['payment'] > 0 || (int)$paymentStmt->fetchColumn() > 0;
                $instruction = $hasPayment
                    ? 'Hapus pembayaran, lalu hapus faktur terlebih dahulu.'
                    : 'Hapus faktur terlebih dahulu.';
                throw new DomainException("WO tidak dapat dihapus karena terhubung dengan Faktur {$invoiceNumber}. {$instruction}");
            }

            // WO selesai boleh dihapus setelah seluruh pembayaran dan faktur terkait
            // sudah dihapus. Pemeriksaan relasi faktur dilakukan di atas.
            // Lost Sales adalah histori konversi penjualan dan tidak boleh dihapus.
            $deletableStatuses = ['Register', 'Selesai'];
            if (!in_array((string)$wo['status'], $deletableStatuses, true)) {
                throw new DomainException("WO berstatus {$wo['status']} tidak dapat dihapus permanen. Gunakan pembatalan atau arsip agar histori tetap tersimpan.");
            }

            // Putuskan referensi dari WO lanjutan. Ini juga aman untuk database
            // lama yang foreign key-nya belum memakai ON DELETE SET NULL.
            $pdo->prepare("
                UPDATE work_orders
                SET continued_from_wo_id=NULL,
                    continued_from_wo_number=NULL,
                    continued_from_branch_name=NULL
                WHERE continued_from_wo_id=?
            ")->execute([$id]);
            $pdo->prepare("
                UPDATE work_orders
                SET continued_to_wo_id=NULL,
                    continued_to_wo_number=NULL,
                    continued_to_branch_name=NULL,
                    continued_at=NULL,
                    continued_by=NULL,
                    continued_by_name=NULL,
                    continued_branch_id=NULL
                WHERE continued_to_wo_id=?
            ")->execute([$id]);

            $pdo->prepare("DELETE FROM work_order_services WHERE wo_id=?")->execute([$id]);
            $pdo->prepare("DELETE FROM work_order_technicians WHERE wo_id=?")->execute([$id]);
            $pdo->prepare("DELETE FROM work_orders WHERE id=?")->execute([$id]);
            $pdo->commit();
            respondSuccess(null, 'WO dihapus');
        } catch (InvalidArgumentException | DomainException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            respondError($e->getMessage(), 422);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            $reference = $logWorkOrderFailure('delete', $e);
            respondError('Gagal menghapus WO. Referensi: ' . $reference, 500);
        }
        break;

    default: respondError('Method not allowed', 405);
}
