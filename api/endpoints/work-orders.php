<?php
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

switch ($method) {
    case 'GET':
        $actor = $requestUser ?? requireAuthenticatedUser($pdo);
        $allowedBranchMap = array_fill_keys(getAccessibleBranchIds($pdo, $actor), true);
        $pdo->exec("UPDATE work_orders SET pending_until=DATE_ADD(pending_at, INTERVAL 10 DAY) WHERE status='Pending' AND pending_at IS NOT NULL AND (pending_until IS NULL OR pending_until > DATE_ADD(pending_at, INTERVAL 10 DAY))");
        $pdo->exec("UPDATE work_orders SET status='Closed', cancel_reason=COALESCE(NULLIF(cancel_reason,''), 'Tidak ada keputusan selama 10 hari') WHERE status='Pending' AND pending_until IS NOT NULL AND pending_until <= NOW()");
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
            $r['branchId']                = $r['branch_id'];
            $r['createdBy']               = $r['created_by'] ?? null;
            $r['createdByName']           = $r['created_by_name'] ?? null;
            $r['technicianId']            = $r['technician_id'] ?? null;
            $r['technicianName']          = $r['technician_name'] ?? null;
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
            $r['pendingAt']               = $r['pending_at'] ?? null;
            $r['pendingUntil']            = $r['pending_until'] ?? null;
            $r['pendingReason']           = $r['pending_reason'] ?? null;
            $r['cancelReason']            = $r['cancel_reason'] ?? null;
            $r['statusLog']               = isset($r['status_log']) && $r['status_log'] ? json_decode($r['status_log'], true) : [];
            $r['continuedFromWoId']       = $r['continued_from_wo_id'] ?? null;
            $r['continuedFromWoNumber']   = $r['continued_from_wo_number'] ?? null;
            $r['continuedFromBranchName'] = $r['continued_from_branch_name'] ?? null;
            $r['continuedToWoId']         = $r['continued_to_wo_id'] ?? null;
            $r['continuedToWoNumber']     = $r['continued_to_wo_number'] ?? null;
            $r['continuedToBranchName']   = $r['continued_to_branch_name'] ?? null;
            $r['continuedAt']             = $r['continued_at'] ?? null;
            $r['continuedBy']             = $r['continued_by'] ?? null;
            $r['continuedByName']         = $r['continued_by_name'] ?? null;
            $r['continuedBranchId']       = $r['continued_branch_id'] ?? null;
            $r['createdAt']               = $r['created_at'] ?? null;
            $r['updatedAt']               = $r['updated_at'] ?? null;

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
        }
        respondSuccess($rows);
        break;

    case 'POST':
        $d = getInput();
        $actor = requireUserPermission($pdo, 'wo:create');
        $pdo->beginTransaction();
        try {
            $normalizedServices = $normalizeWorkOrderServices($pdo, is_array($d['services'] ?? null) ? $d['services'] : []);
            $woId = $d['id'] ?? generateId();
            $branchId = (string)($d['branchId'] ?? '');
            requireAccessibleBranch($pdo, $actor, $branchId);
            [$customer, $vehicle] = resolveCustomerVehicle(
                $pdo,
                (string)($d['customerRefId'] ?? ''),
                (string)($d['vehicleRefId'] ?? ''),
                true
            );
            assertNoActiveWorkOrder($pdo, (string)$vehicle['id']);
            $transactionDate = (string)($d['date'] ?? date('Y-m-d'));
            $backdateReason = trim((string)($d['backdateReason'] ?? ''));
            if ($transactionDate > date('Y-m-d')) {
                throw new InvalidArgumentException('Tanggal WO tidak boleh melewati hari ini.');
            }
            if ($transactionDate < date('Y-m-d')) {
                requireUserPermission($pdo, 'wo:backdate');
            }
            if (isBackdateReasonRequired($pdo) && $transactionDate < date('Y-m-d') && $backdateReason === '') {
                throw new InvalidArgumentException('Alasan tanggal mundur wajib diisi.');
            }
            $woNumber = nextDocumentNumber($pdo, 'work_order', $branchId, $d['date'] ?? null);
            $stmt = $pdo->prepare("
                INSERT INTO work_orders (
                    id, wo_number, date, backdate_reason,
                    customer_ref_id, customer_id, customer_name,
                    vehicle_ref_id, plate_number, vehicle_info,
                    description, findings, diagnosis_temperature, diagnosis_lp, diagnosis_hp, final_temperature, final_lp, final_hp,
                    total, estimate_total, approved_at, pending_at, pending_until, pending_reason,
                    status, cancel_reason, status_log, notes, branch_id, created_by, created_by_name, technician_id, technician_name,
                    continued_from_wo_id, continued_from_wo_number, continued_from_branch_name,
                    continued_to_wo_id, continued_to_wo_number, continued_to_branch_name
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $woId, $woNumber, $transactionDate, $backdateReason ?: null,
                $customer['id'], $customer['customer_code'], $customer['name'],
                $vehicle['id'], normalizeVehiclePlate($vehicle['plate_number']),
                trim($vehicle['brand'] . ' ' . $vehicle['model'] . ($vehicle['year'] ? ' ' . $vehicle['year'] : '') . ' - ' . $vehicle['color']),
                $d['description'] ?? '', $d['findings'] ?? null,
                $d['diagnosisTemperature'] ?? null, $d['diagnosisLp'] ?? null, $d['diagnosisHp'] ?? null,
                $d['finalTemperature'] ?? null, $d['finalLp'] ?? null, $d['finalHp'] ?? null,
                $normalizedServices['total'], $normalizedServices['total'], $d['approvedAt'] ?? null,
                $d['pendingAt'] ?? null, $d['pendingUntil'] ?? null, $d['pendingReason'] ?? null,
                'Pengecekan',
                null,
                json_encode([[
                    'from' => 'Pengecekan',
                    'to' => 'Pengecekan',
                    'at' => date('c'),
                    'byUserId' => $actor['id'] ?? '-',
                    'byUserName' => $actor['name'] ?? 'System',
                ]]),
                $d['notes'] ?? '', $branchId, $actor['id'] ?? null, $actor['name'] ?? null,
                ($d['technicianId'] ?? '') ?: null, ($d['technicianName'] ?? '') ?: null,
                $d['continuedFromWoId'] ?? null, $d['continuedFromWoNumber'] ?? null, $d['continuedFromBranchName'] ?? null,
                $d['continuedToWoId'] ?? null, $d['continuedToWoNumber'] ?? null, $d['continuedToBranchName'] ?? null,
            ]);

            if (!empty($normalizedServices['services'])) {
                $sStmt = $pdo->prepare("INSERT INTO work_order_services (wo_id, item_id, code, name, description, price, qty, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                foreach ($normalizedServices['services'] as $s) {
                    $sStmt->execute([$woId, $s['itemId'], $s['code'], $s['name'], $s['description'], $s['price'], $s['qty'], $s['subtotal']]);
                }
            }
            $pdo->commit();
            respondSuccess(['id' => $woId, 'woNumber' => $woNumber], 'WO disimpan');
        } catch (InvalidArgumentException | DomainException $e) {
            $pdo->rollBack();
            respondError($e->getMessage(), 422);
        } catch (Exception $e) {
            $pdo->rollBack();
            respondError('Gagal simpan WO', 500, $e->getMessage());
        }
        break;

    case 'PUT':
        if (!$id) respondError('ID required');
        $d = getInput();
        $pdo->beginTransaction();
        try {
            $normalizedServices = $normalizeWorkOrderServices($pdo, is_array($d['services'] ?? null) ? $d['services'] : []);
            [$customer, $vehicle] = resolveCustomerVehicle(
                $pdo,
                (string)($d['customerRefId'] ?? ''),
                (string)($d['vehicleRefId'] ?? ''),
                true
            );
            $currentStmt = $pdo->prepare("SELECT wo_number,vehicle_ref_id,date,backdate_reason,status,branch_id,invoice_id,invoice_number,status_log,continued_to_wo_id,continued_at,continued_by,continued_by_name,continued_branch_id FROM work_orders WHERE id=? FOR UPDATE");
            $currentStmt->execute([$id]);
            $currentWorkOrder = $currentStmt->fetch();
            if (!$currentWorkOrder) {
                throw new InvalidArgumentException('WO tidak ditemukan.');
            }
            $actor = $requestUser ?? requireAuthenticatedUser($pdo);
            requireAccessibleBranch($pdo, $actor, (string)$currentWorkOrder['branch_id']);
            if ((string)$currentWorkOrder['status'] === 'Invoiced' || !empty($currentWorkOrder['invoice_id'])) {
                throw new DomainException('WO yang sudah difakturkan tidak dapat diedit. Ubah rincian pada faktur atau hapus faktur terlebih dahulu.');
            }
            $currentStatus = (string)$currentWorkOrder['status'];
            $nextStatus = (string)($d['status'] ?? $currentStatus);
            $allowedTransitions = [
                'Pengecekan' => ['Pengecekan', 'Pending', 'Proses', 'Selesai', 'Closed'],
                // Pending boleh dilanjutkan kembali ke Diagnosa/Pengecekan.
                'Pending' => ['Pending', 'Pengecekan', 'Proses', 'Closed'],
                'Proses' => ['Proses', 'Selesai', 'Closed'],
                'Selesai' => ['Selesai'],
                'Closed' => ['Closed'],
            ];
            if (!isset($allowedTransitions[$currentStatus]) || !in_array($nextStatus, $allowedTransitions[$currentStatus], true)) {
                throw new InvalidArgumentException("Perubahan status {$currentStatus} ke {$nextStatus} tidak diizinkan.");
            }
            // Validasi WO aktif hanya diperlukan bila kendaraan benar-benar diganti.
            // Perubahan status pada WO yang sama tidak boleh tertahan oleh data lama/duplikat.
            if ((string)$currentWorkOrder['vehicle_ref_id'] !== (string)$vehicle['id']) {
                assertNoActiveWorkOrder($pdo, (string)$vehicle['id'], (string)$id);
            }
            if ($nextStatus === 'Pending' && trim((string)($d['pendingReason'] ?? '')) === '') {
                throw new InvalidArgumentException('Alasan Pending wajib diisi.');
            }
            if ($nextStatus === 'Closed' && trim((string)($d['cancelReason'] ?? '')) === '') {
                throw new InvalidArgumentException('Alasan pembatalan wajib diisi.');
            }
            $transactionDate = (string)($d['date'] ?? date('Y-m-d'));
            $backdateReason = trim((string)($d['backdateReason'] ?? ''));
            $dateChanged = $transactionDate !== (string)$currentWorkOrder['date'];
            if ($transactionDate > date('Y-m-d')) {
                throw new InvalidArgumentException('Tanggal WO tidak boleh melewati hari ini.');
            }
            if ($dateChanged && $transactionDate < date('Y-m-d')) {
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
            if ($nextStatus !== $currentStatus) {
                $statusReason = $nextStatus === 'Pending'
                    ? trim((string)($d['pendingReason'] ?? ''))
                    : ($nextStatus === 'Closed' ? trim((string)($d['cancelReason'] ?? '')) : null);
                $statusLog[] = [
                    'from' => $currentStatus,
                    'to' => $nextStatus,
                    'at' => date('c'),
                    'byUserId' => $actor['id'] ?? '-',
                    'byUserName' => $actor['name'] ?? 'System',
                    'reason' => $statusReason ?: null,
                ];
            }
            $continuedToWoId = ($d['continuedToWoId'] ?? '') ?: null;
            $isNewContinuation = empty($currentWorkOrder['continued_to_wo_id']) && $continuedToWoId !== null;
            $continuedAt = $isNewContinuation ? date('Y-m-d H:i:s') : ($currentWorkOrder['continued_at'] ?? null);
            $continuedBy = $isNewContinuation ? ($actor['id'] ?? null) : ($currentWorkOrder['continued_by'] ?? null);
            $continuedByName = $isNewContinuation ? ($actor['name'] ?? 'System') : ($currentWorkOrder['continued_by_name'] ?? null);
            $continuedBranchId = $isNewContinuation
                ? (($d['continuedBranchId'] ?? '') ?: null)
                : ($currentWorkOrder['continued_branch_id'] ?? null);
            $stmt = $pdo->prepare("
                UPDATE work_orders SET
                    wo_number=?, date=?, backdate_reason=?,
                    customer_ref_id=?, customer_id=?, customer_name=?,
                    vehicle_ref_id=?, plate_number=?, vehicle_info=?,
                    description=?, findings=?, diagnosis_temperature=?, diagnosis_lp=?, diagnosis_hp=?, final_temperature=?, final_lp=?, final_hp=?,
                    total=?, estimate_total=?, approved_at=?,
                    pending_at=?, pending_until=?, pending_reason=?,
                    status=?, cancel_reason=?, status_log=?, notes=?, branch_id=?, technician_id=?, technician_name=?,
                    invoice_id=?, invoice_number=?,
                    continued_from_wo_id=?, continued_from_wo_number=?, continued_from_branch_name=?,
                    continued_to_wo_id=?, continued_to_wo_number=?, continued_to_branch_name=?,
                    continued_at=?, continued_by=?, continued_by_name=?, continued_branch_id=?
                WHERE id=?
            ");
            $stmt->execute([
                $currentWorkOrder['wo_number'], $transactionDate, $backdateReason ?: null,
                $customer['id'], $customer['customer_code'], $customer['name'],
                $vehicle['id'], normalizeVehiclePlate($vehicle['plate_number']),
                trim($vehicle['brand'] . ' ' . $vehicle['model'] . ($vehicle['year'] ? ' ' . $vehicle['year'] : '') . ' - ' . $vehicle['color']),
                $d['description'] ?? '', $d['findings'] ?? null,
                $d['diagnosisTemperature'] ?? null, $d['diagnosisLp'] ?? null, $d['diagnosisHp'] ?? null,
                $d['finalTemperature'] ?? null, $d['finalLp'] ?? null, $d['finalHp'] ?? null,
                $normalizedServices['total'], $normalizedServices['total'], $d['approvedAt'] ?? null,
                $d['pendingAt'] ?? null, $d['pendingUntil'] ?? null, $d['pendingReason'] ?? null,
                $nextStatus,
                $d['cancelReason'] ?? null,
                json_encode($statusLog),
                $d['notes'] ?? '', $currentWorkOrder['branch_id'],
                ($d['technicianId'] ?? '') ?: null, ($d['technicianName'] ?? '') ?: null,
                $currentWorkOrder['invoice_id'], $currentWorkOrder['invoice_number'],
                $d['continuedFromWoId'] ?? null, $d['continuedFromWoNumber'] ?? null, $d['continuedFromBranchName'] ?? null,
                $continuedToWoId, $d['continuedToWoNumber'] ?? null, $d['continuedToBranchName'] ?? null,
                $continuedAt, $continuedBy, $continuedByName, $continuedBranchId,
                $id
            ]);

            $pdo->prepare("DELETE FROM work_order_services WHERE wo_id = ?")->execute([$id]);
            if (!empty($normalizedServices['services'])) {
                $sStmt = $pdo->prepare("INSERT INTO work_order_services (wo_id, item_id, code, name, description, price, qty, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                foreach ($normalizedServices['services'] as $s) {
                    $sStmt->execute([$id, $s['itemId'], $s['code'], $s['name'], $s['description'], $s['price'], $s['qty'], $s['subtotal']]);
                }
            }
            $pdo->commit();
            respondSuccess(null, 'WO diupdate');
        } catch (InvalidArgumentException | DomainException $e) {
            $pdo->rollBack();
            respondError($e->getMessage(), 422);
        } catch (Exception $e) {
            $pdo->rollBack();
            respondError('Gagal update WO', 500, $e->getMessage());
        }
        break;

    case 'DELETE':
        if (!$id) respondError('ID required', 422);
        $pdo->beginTransaction();
        try {
            $woStmt = $pdo->prepare("
                SELECT id, wo_number, status, invoice_id, invoice_number, branch_id
                FROM work_orders WHERE id=? FOR UPDATE
            ");
            $woStmt->execute([$id]);
            $wo = $woStmt->fetch();
            if (!$wo) throw new InvalidArgumentException('WO tidak ditemukan.');
            requireAccessibleBranch($pdo, $requestUser ?? requireAuthenticatedUser($pdo), (string)$wo['branch_id']);

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
            $deletableStatuses = ['Pengecekan', 'Pending', 'Selesai', 'Closed'];
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
            $pdo->prepare("DELETE FROM work_orders WHERE id=?")->execute([$id]);
            $pdo->commit();
            respondSuccess(null, 'WO dihapus');
        } catch (InvalidArgumentException | DomainException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            respondError($e->getMessage(), 422);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            respondError('Gagal menghapus WO: ' . $e->getMessage(), 500);
        }
        break;

    default: respondError('Method not allowed', 405);
}
