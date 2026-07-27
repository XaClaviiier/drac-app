<?php
switch ($method) {
    case 'GET':
        $rows = $pdo->query("SELECT * FROM item_categories ORDER BY code")->fetchAll();
        foreach ($rows as &$r) $r['isActive'] = (bool)$r['is_active'];
        respondSuccess($rows);
        break;

    case 'POST':
        $d = getInput();
        $dup = $pdo->prepare("SELECT id, code, name FROM item_categories WHERE UPPER(code) = UPPER(?) OR LOWER(name) = LOWER(?) LIMIT 1");
        $dup->execute([$d['code'], $d['name']]);
        if ($dup->fetch()) respondError('Kode atau nama kategori sudah digunakan', 409);
        $stmt = $pdo->prepare("INSERT INTO item_categories (id, code, name, type, description, is_active) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $d['id'] ?? generateId(),
            $d['code'], $d['name'], $d['type'] ?? 'Semua',
            $d['description'] ?? '', $d['isActive'] ?? 1
        ]);
        respondSuccess(null, 'Kategori ditambahkan');
        break;

    case 'PUT':
        if (!$id) respondError('ID required');
        $d = getInput();
        $dup = $pdo->prepare("SELECT id FROM item_categories WHERE (UPPER(code) = UPPER(?) OR LOWER(name) = LOWER(?)) AND id <> ? LIMIT 1");
        $dup->execute([$d['code'], $d['name'], $id]);
        if ($dup->fetch()) respondError('Kode atau nama kategori sudah digunakan', 409);
        $stmt = $pdo->prepare("UPDATE item_categories SET code=?, name=?, type=?, description=?, is_active=? WHERE id=?");
        $stmt->execute([$d['code'], $d['name'], $d['type'] ?? 'Semua', $d['description'] ?? '', $d['isActive'] ?? 1, $id]);
        respondSuccess(null, 'Kategori diupdate');
        break;

    case 'DELETE':
        if (!$id) respondError('ID required');
        $used = $pdo->prepare("SELECT COUNT(*) FROM items WHERE category_id = ?");
        $used->execute([$id]);
        if ((int)$used->fetchColumn() > 0) respondError('Kategori masih digunakan oleh barang/jasa', 409);
        $pdo->prepare("DELETE FROM item_categories WHERE id=?")->execute([$id]);
        respondSuccess(null, 'Kategori dihapus');
        break;

    default: respondError('Method not allowed', 405);
}
