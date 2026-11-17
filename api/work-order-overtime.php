<?php
function workOrderOverTimeActive(array $logs, DateTimeImmutable $now): bool {
    usort($logs, static fn($a, $b) => strtotime($a['at'] ?? '') <=> strtotime($b['at'] ?? ''));
    $until = null;
    foreach ($logs as $log) {
        try { $time = new DateTimeImmutable($log['at'] ?? '', new DateTimeZone('Asia/Makassar')); } catch (Throwable $error) { continue; }
        if ($time > $now) continue;
        if ($until && $time >= $until) $until = null;
        $reason = (string)($log['reason'] ?? '');
        if (str_contains($reason, '[WO_OVERTIME:start]') && !$until) {
            $until = $time->setTimezone(new DateTimeZone('Asia/Makassar'))->setTime(8, 0);
            if ($until <= $time) $until = $until->modify('+1 day');
        } elseif (str_contains($reason, '[WO_OVERTIME:stop]')
            || (($log['from'] ?? '') !== ($log['to'] ?? '') && ($log['to'] ?? '') !== 'Proses')
            || preg_match('/\[WO_TIMELINE_STAGE:(parts|approval|diagnosis)\]/', $reason)) $until = null;
    }
    return $until && $now < $until;
}

function appendWorkOrderOverTime(array $logs, string $status, string $stage, bool $hasInvoice, string $mode, array $actor, DateTimeImmutable $now): array {
    if (!in_array($mode, ['start', 'stop'], true)) throw new InvalidArgumentException('Aksi Over Time tidak valid.');
    if ($status !== 'Proses' || $hasInvoice) throw new DomainException('Over Time hanya untuk WO Dikerjakan yang belum difakturkan.');
    $active = workOrderOverTimeActive($logs, $now);
    if (($mode === 'start') === $active) return $logs;
    if ($mode === 'start') {
        if ($stage !== 'working') throw new DomainException('Lanjutkan ke Dikerjakan sebelum memulai Over Time.');
        $clock = $now->setTimezone(new DateTimeZone('Asia/Makassar'))->format('H:i');
        if ($clock >= '08:00' && $clock < '17:30') throw new DomainException('Jam normal 08.00–17.30 dihitung otomatis. Over Time digunakan di luar jam tersebut.');
    }
    $logs[] = ['from' => $status, 'to' => $status, 'at' => $now->format(DateTimeInterface::ATOM),
        'byUserId' => $actor['id'] ?? '-', 'byUserName' => $actor['name'] ?? 'System',
        'reason' => '[WO_OVERTIME:'.$mode.'] '.($mode === 'start' ? 'Mulai Over Time' : 'Akhiri Over Time')];
    return $logs;
}
