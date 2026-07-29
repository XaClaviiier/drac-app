<?php
$user = requireAuthenticatedUser($pdo);

if ($method === 'GET') {
    $row = $pdo->query("SELECT model, is_active, updated_at FROM ai_config WHERE id = 1")->fetch();
    respondSuccess([
        'configured' => (bool)$row,
        'isActive' => $row ? (bool)$row['is_active'] : false,
        'model' => $row['model'] ?? 'llama-3.3-70b-versatile',
        'updatedAt' => $row['updated_at'] ?? null,
        'canManage' => (bool)($user['is_owner'] ?? false),
    ]);
}

if ($method === 'PUT') {
    if (!(bool)($user['is_owner'] ?? false)) respondError('Hanya Owner yang dapat mengatur Integrasi AI', 403);
    $input = getInput();
    $apiKey = trim((string)($input['apiKey'] ?? ''));
    $model = trim($input['model'] ?? 'llama-3.3-70b-versatile');
    if (!str_starts_with($apiKey, 'gsk_') || strlen($apiKey) < 30) {
        respondError('Format API Key Groq tidak valid');
    }
    try {
        $encryptedKey = encryptSecret($apiKey);
        $stmt = $pdo->prepare("
            INSERT INTO ai_config (id, encrypted_api_key, model, is_active, updated_by)
            VALUES (1, ?, ?, 1, ?)
            ON DUPLICATE KEY UPDATE encrypted_api_key=VALUES(encrypted_api_key),
                model=VALUES(model), is_active=1, updated_by=VALUES(updated_by)
        ");
        $stmt->execute([$encryptedKey, $model, $user['id']]);
    } catch (Throwable $e) {
        respondError('Gagal menyimpan Integrasi AI', 500, $e->getMessage());
    }
    respondSuccess(['configured' => true, 'isActive' => true, 'model' => $model], 'Integrasi AI berhasil disimpan');
}

respondError('Method not allowed', 405);
