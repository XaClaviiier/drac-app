<?php
switch ($method) {
    case 'GET':
        $rows = $pdo->query("SELECT * FROM work_orders ORDER BY date DESC, wo_number DESC")->fetchAll();
        foreach ($rows as &$r) {
            $r['woNumber']                = $r['wo_number'];
            $r['customerRefId']           = $r['customer_ref_id'];
            $r['customerId']              = $r['customer_id'];
            $r['customerName']            = $r['customer_name'];
            $r['vehicleRefId']            = $r['vehicle_ref_id'];
            $r['plateNumber']             = $r['plate_number'];
            $r['vehicleInfo']             = $r['vehicle_info'];
            $r['branchId']                = $r['branch_id'];
            $r['backdateReason']          = $r['backdate_reason'] ?? null;
            $r['invoiceId']               = $r['invoice_id'];
            $r['invoiceNumber']           = $r['invoice_number'];
            $r['total']                   = (float)$r['total'];
            $r['findings']                = $r['findings'] ?? null;
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
        $pdo->beginTransaction();
        try {
            $woId = $d['id'] ?? generateId();
            $branchId = $d['branchId'] ?? 'BR-001';
            [$customer, $vehicle] = resolveCustomerVehicle(
                $pdo,
                (string)($d['customerRefId'] ?? ''),
                (string)($d['vehicleRefId'] ?? ''),
                true
            );
            assertNoActiveWorkOrder($pdo, (string)$vehicle['id']);
            if (empty($d['services'])) {
                throw new InvalidArgumentException('Tambahkan minimal satu layanan atau barang.');
            }
            if (($d['status'] ?? 'Pengecekan') === 'Pending' && trim((string)($d['pendingReason'] ?? '')) === '') {
                throw new InvalidArgumentException('Alasan Pending wajib diisi.');
            }
            $transactionDate = (string)($d['date'] ?? date('Y-m-d'));
            $backdateReason = trim((string)($d['backdateReason'] ?? ''));
            if ($transactionDate > date('Y-m-d')) {
                throw new InvalidArgumentException('Tanggal WO tidak boleh melewati hari ini.');
            }
            if ($transactionDate < date('Y-m-d') && $backdateReason === '') {
                throw new InvalidArgumentException('Alasan tanggal mundur wajib diisi.');
            }
            $woNumber = nextDocumentNumber($pdo, 'work_order', $branchId, $d['date'] ?? null);
            $stmt = $pdo->prepare("
                INSERT INTO work_orders (
                    id, wo_number, date, backdate_reason,
                    customer_ref_id, customer_id, customer_name,
                    vehicle_ref_id, plate_number, vehicle_info,
                    description, findings, total, estimate_total, approved_at, pending_at, pending_until, pending_reason,
                    status, cancel_reason, status_log, notes, branch_id,
                    continued_from_wo_id, continued_from_wo_number, continued_from_branch_name,
                    continued_to_wo_id, continued_to_wo_number, continued_to_branch_name
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $woId, $woNumber, $transactionDate, $backdateReason ?: null,
                $customer['id'], $customer['customer_code'], $customer['name'],
                $vehicle['id'], normalizeVehiclePlate($vehicle['plate_number']),
                trim($vehicle['brand'] . ' ' . $vehicle['model'] . ($vehicle['year'] ? ' ' . $vehicle['year'] : '') . ' - ' . $vehicle['color']),
                $d['description'] ?? '', $d['findings'] ?? null,
                $d['total'] ?? 0, $d['estimateTotal'] ?? null, $d['approvedAt'] ?? null,
                $d['pendingAt'] ?? null, $d['pendingUntil'] ?? null, $d['pendingReason'] ?? null,
                $d['status'] ?? 'Pengecekan',
                $d['cancelReason'] ?? null,
                isset($d['statusLog']) ? json_encode($d['statusLog']) : null,
                $d['notes'] ?? '', $branchId,
                $d['continuedFromWoId'] ?? null, $d['continuedFromWoNumber'] ?? null, $d['continuedFromBranchName'] ?? null,
                $d['continuedToWoId'] ?? null, $d['continuedToWoNumber'] ?? null, $d['continuedToBranchName'] ?? null,
            ]);

            if (!empty($d['services'])) {
                $sStmt = $pdo->prepare("INSERT INTO work_order_services (wo_id, item_id, code, name, description, price, qty, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                foreach ($d['services'] as $s) {
                    $qty   = $s['qty']   ?? 1;
                    $price = $s['price'] ?? 0;
                    $sStmt->execute([$woId, $s['itemId'] ?? null, $s['code'] ?? '', $s['name'], $s['description'] ?? '', $price, $qty, $price * $qty]);
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
            [$customer, $vehicle] = resolveCustomerVehicle(
                $pdo,
                (string)($d['customerRefId'] ?? ''),
                (string)($d['vehicleRefId'] ?? ''),
                true
            );
            assertNoActiveWorkOrder($pdo, (string)$vehicle['id'], (string)$id);
            if (empty($d['services'])) {
                throw new InvalidArgumentException('Tambahkan minimal satu layanan atau barang.');
            }
            if (($d['status'] ?? 'Pengecekan') === 'Pending' && trim((string)($d['pendingReason'] ?? '')) === '') {
                throw new InvalidArgumentException('Alasan Pending wajib diisi.');
            }
            $transactionDate = (string)($d['date'] ?? date('Y-m-d'));
            $backdateReason = trim((string)($d['backdateReason'] ?? ''));
            if ($transactionDate > date('Y-m-d')) {
                throw new InvalidArgumentException('Tanggal WO tidak boleh melewati hari ini.');
            }
            if ($transactionDate < date('Y-m-d') && $backdateReason === '') {
                throw new InvalidArgumentException('Alasan tanggal mundur wajib diisi.');
            }
            $stmt = $pdo->prepare("
                UPDATE work_orders SET
                    wo_number=?, date=?, backdate_reason=?,
                    customer_ref_id=?, customer_id=?, customer_name=?,
                    vehicle_ref_id=?, plate_number=?, vehicle_info=?,
                    description=?, findings=?, total=?, estimate_total=?, approved_at=?,
                    pending_at=?, pending_until=?, pending_reason=?,
                    status=?, cancel_reason=?, status_log=?, notes=?, branch_id=?,
                    invoice_id=?, invoice_number=?,
                    continued_from_wo_id=?, continued_from_wo_number=?, continued_from_branch_name=?,
                    continued_to_wo_id=?, continued_to_wo_number=?, continued_to_branch_name=?
                WHERE id=?
            ");
            $stmt->execute([
                $d['woNumber'], $transactionDate, $backdateReason ?: null,
                $customer['id'], $customer['customer_code'], $customer['name'],
                $vehicle['id'], normalizeVehiclePlate($vehicle['plate_number']),
                trim($vehicle['brand'] . ' ' . $vehicle['model'] . ($vehicle['year'] ? ' ' . $vehicle['year'] : '') . ' - ' . $vehicle['color']),
                $d['description'] ?? '', $d['findings'] ?? null,
                $d['total'] ?? 0, $d['estimateTotal'] ?? null, $d['approvedAt'] ?? null,
                $d['pendingAt'] ?? null, $d['pendingUntil'] ?? null, $d['pendingReason'] ?? null,
                $d['status'] ?? 'Pengecekan',
                $d['cancelReason'] ?? null,
                isset($d['statusLog']) ? json_encode($d['statusLog']) : null,
                $d['notes'] ?? '', $d['branchId'] ?? 'BR-001',
                $d['invoiceId'] ?? null, $d['invoiceNumber'] ?? null,
                $d['continuedFromWoId'] ?? null, $d['continuedFromWoNumber'] ?? null, $d['continuedFromBranchName'] ?? null,
                $d['continuedToWoId'] ?? null, $d['continuedToWoNumber'] ?? null, $d['continuedToBranchName'] ?? null,
                $id
            ]);

            $pdo->prepare("DELETE FROM work_order_services WHERE wo_id = ?")->execute([$id]);
            if (!empty($d['services'])) {
                $sStmt = $pdo->prepare("INSERT INTO work_order_services (wo_id, item_id, code, name, description, price, qty, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                foreach ($d['services'] as $s) {
                    $qty   = $s['qty']   ?? 1;
                    $price = $s['price'] ?? 0;
                    $sStmt->execute([$id, $s['itemId'] ?? null, $s['code'] ?? '', $s['name'], $s['description'] ?? '', $price, $qty, $price * $qty]);
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
        if (!$id) respondError('ID required');
        $pdo->prepare("DELETE FROM work_orders WHERE id=?")->execute([$id]);
        respondSuccess(null, 'WO dihapus');
        break;

    default: respondError('Method not allowed', 405);
}
