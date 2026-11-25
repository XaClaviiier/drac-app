<?php
/** Close Register/Diagnosa WOs after the workshop day with an auditable reason. */
function autoCloseExpiredDiagnoses(PDO $pdo): int {
    $zone = new DateTimeZone('Asia/Makassar');
    $now = new DateTimeImmutable('now', $zone);
    $today = $now->format('Y-m-d');
    $cutoff = $now->format('H:i:s');
    $expiredBefore = $cutoff >= '17:30:00' ? $today : date('Y-m-d', $now->modify('-1 day')->getTimestamp());
    $reason = 'Diagnosa tidak dikerjakan sampai akhir hari.';
    $actorName = 'System · Auto Lost Sales';
    $pdo->beginTransaction();
    try {
        // WO yang baru dibuat hari ini boleh memakai tanggal transaksi mundur.
        // Jangan langsung mengubahnya menjadi Lost Sales hanya karena tanggal
        // dokumennya historis; tunggu sampai WO tersebut melewati hari inputnya.
        $createdBeforeTodaySql = $cutoff >= '17:30:00'
            ? '(date=? OR created_at IS NULL OR DATE(created_at)<?)'
            : '(created_at IS NULL OR DATE(created_at)<?)';
        $stmt = $pdo->prepare("SELECT id,status,date,status_log FROM work_orders WHERE status='Register' AND (invoice_id IS NULL OR invoice_id='') AND (invoice_number IS NULL OR invoice_number='') AND (continued_to_wo_id IS NULL OR continued_to_wo_id='') AND date<=? AND {$createdBeforeTodaySql} FOR UPDATE");
        $stmt->execute($cutoff >= '17:30:00' ? [$expiredBefore, $today, $today] : [$expiredBefore, $today]);
        $update = $pdo->prepare("UPDATE work_orders SET status='Closed',cancel_reason=?,status_log=?,updated_at=CURRENT_TIMESTAMP(6) WHERE id=? AND status='Register'");
        $count = 0;
        foreach ($stmt->fetchAll() as $row) {
            $logs = json_decode((string)($row['status_log'] ?? '[]'), true);
            if (!is_array($logs)) $logs = [];
            $logs[] = [
                'from' => 'Register', 'to' => 'Closed', 'at' => $now->format(DateTimeInterface::ATOM),
                'byUserId' => 'SYSTEM_AUTO_LOST_SALES', 'byUserName' => $actorName,
                'reason' => '[AUTO_LOST_SALES_END_OF_DAY] '.$reason,
            ];
            $update->execute([$reason, json_encode($logs, JSON_UNESCAPED_UNICODE), $row['id']]);
            $count += $update->rowCount();
        }
        $pdo->commit();
        return $count;
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}
