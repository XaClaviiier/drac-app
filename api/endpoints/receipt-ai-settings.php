<?php
$user = requireAuthenticatedUser($pdo);

if ($method === 'GET') {
    $row = $pdo->query("SELECT model, is_active, updated_at FROM ai_config WHERE id = 2")->fetch();
    $model = $row['model'] ?? '';
    if (!$model || str_contains($model, 'llama-4-scout')) $model = 'qwen/qwen3.6-27b';
    respondSuccess([
        'configured' => (bool)$row,
        'isActive' => $row ? (bool)$row['is_active'] : false,
        'model' => $model,
        'updatedAt' => $row['updated_at'] ?? null,
        'canManage' => (bool)($user['is_owner'] ?? false),
    ]);
}

if ($method === 'PUT') {
    if (!(bool)($user['is_owner'] ?? false)) respondError('Hanya Owner yang dapat mengatur Groq Key Input Cepat', 403);
    $input = getInput();
    $apiKey = trim((string)($input['apiKey'] ?? ''));
    $model = trim((string)($input['model'] ?? 'qwen/qwen3.6-27b'));
    if (!$model || str_contains($model, 'llama-4-scout')) $model = 'qwen/qwen3.6-27b';
    if (!str_starts_with($apiKey, 'gsk_') || strlen($apiKey) < 30) respondError('Format Groq Key Input Cepat tidak valid');
    try {
        $stmt = $pdo->prepare("INSERT INTO ai_config (id, encrypted_api_key, model, is_active, updated_by)
            VALUES (2, ?, ?, 1, ?)
            ON DUPLICATE KEY UPDATE encrypted_api_key=VALUES(encrypted_api_key), model=VALUES(model),
                is_active=1, updated_by=VALUES(updated_by)");
        $stmt->execute([encryptSecret($apiKey), $model, $user['id']]);
    } catch (Throwable $e) {
        respondError('Gagal menyimpan Groq Key Input Cepat', 500, $e->getMessage());
    }
    respondSuccess(['configured' => true, 'isActive' => true, 'model' => $model], 'Groq Key Input Cepat berhasil disimpan');
}

respondError('Method not allowed', 405);
