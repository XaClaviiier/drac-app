<?php
$user = requireAuthenticatedUser($pdo);

if ($method === 'GET') {
    $row = $pdo->query("SELECT model, is_active, updated_at FROM ai_config WHERE id = 1")->fetch();
    $deprecatedModels = [
        'llama-3.3-70b-versatile' => 'openai/gpt-oss-120b',
        'llama-3.1-8b-instant' => 'openai/gpt-oss-20b',
    ];
    $storedModel = (string)($row['model'] ?? '');
    $activeModel = $deprecatedModels[$storedModel] ?? ($storedModel ?: 'openai/gpt-oss-120b');
    if ($row && $activeModel !== $storedModel) {
        $pdo->prepare("UPDATE ai_config SET model=?, updated_at=CURRENT_TIMESTAMP WHERE id=1")->execute([$activeModel]);
    }
    respondSuccess([
        'configured' => (bool)$row,
        'isActive' => $row ? (bool)$row['is_active'] : false,
        'model' => $activeModel,
        'updatedAt' => $row['updated_at'] ?? null,
        'canManage' => (bool)($user['is_owner'] ?? false),
    ]);
}

if ($method === 'PUT') {
    if (!(bool)($user['is_owner'] ?? false)) respondError('Hanya Owner yang dapat mengatur Integrasi AI', 403);
    $input = getInput();
    $apiKey = trim((string)($input['apiKey'] ?? ''));
    $model = trim($input['model'] ?? 'openai/gpt-oss-120b');
    $allowedModels = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
    if (!in_array($model, $allowedModels, true)) {
        respondError('Model Groq tidak didukung. Pilih GPT-OSS 120B atau GPT-OSS 20B.', 422);
    }
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
