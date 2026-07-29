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
    $user = requireOwner($pdo);
    $input = getInput();
    $apiKey = trim($input['apiKey'] ?? '');
    $model = trim($input['model'] ?? 'llama-3.3-70b-versatile');
    if (!str_starts_with($apiKey, 'gsk_') || strlen($apiKey) < 30) {
        respondError('Format API Key Groq tidak valid');
    }
    $stmt = $pdo->prepare("
        INSERT INTO ai_config (id, encrypted_api_key, model, is_active, updated_by)
        VALUES (1, ?, ?, 1, ?)
        ON DUPLICATE KEY UPDATE encrypted_api_key=VALUES(encrypted_api_key),
            model=VALUES(model), is_active=1, updated_by=VALUES(updated_by)
    ");
    $stmt->execute([encryptSecret($apiKey), $model, $user['id']]);
    respondSuccess(['configured' => true, 'isActive' => true, 'model' => $model], 'Integrasi AI berhasil disimpan');
}

respondError('Method not allowed', 405);
