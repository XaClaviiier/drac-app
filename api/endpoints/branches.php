<?php
// BRANCHES CRUD
switch ($method) {
    case 'GET':
        $pdo->exec("ALTER TABLE branches ADD COLUMN IF NOT EXISTS review_url VARCHAR(500) NULL AFTER phone");
        $rows = $pdo->query("SELECT * FROM branches ORDER BY code")->fetchAll();
        foreach ($rows as &$r) { $r['isActive'] = (bool)$r['is_active']; $r['reviewUrl'] = $r['review_url'] ?? ''; }
        respondSuccess($rows);
        break;

    case 'POST':
        $d = getInput();
        $pdo->exec("ALTER TABLE branches ADD COLUMN IF NOT EXISTS review_url VARCHAR(500) NULL AFTER phone");
        $stmt = $pdo->prepare("INSERT INTO branches (id, code, name, address, phone, review_url, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $d['id'] ?? generateId(),
            $d['code'], $d['name'], $d['address'] ?? '',
            $d['phone'] ?? '', $d['reviewUrl'] ?? '', $d['isActive'] ?? 1
        ]);
        respondSuccess(null, 'Cabang ditambahkan');
        break;

    case 'PUT':
        if (!$id) respondError('ID required');
        $d = getInput();
        $pdo->exec("ALTER TABLE branches ADD COLUMN IF NOT EXISTS review_url VARCHAR(500) NULL AFTER phone");
        $stmt = $pdo->prepare("UPDATE branches SET code=?, name=?, address=?, phone=?, review_url=?, is_active=? WHERE id=?");
        $stmt->execute([$d['code'], $d['name'], $d['address'] ?? '', $d['phone'] ?? '', $d['reviewUrl'] ?? '', $d['isActive'] ?? 1, $id]);
        respondSuccess(null, 'Cabang diupdate');
        break;

    case 'DELETE':
        if (!$id) respondError('ID required');
        $pdo->prepare("DELETE FROM branches WHERE id=?")->execute([$id]);
        respondSuccess(null, 'Cabang dihapus');
        break;

    default: respondError('Method not allowed', 405);
}
