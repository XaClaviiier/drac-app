<?php
$user = requireAuthenticatedUser($pdo);
if ($method !== 'POST') respondError('Method not allowed', 405);

$config = $pdo->query("SELECT encrypted_api_key, model, is_active FROM ai_config WHERE id = 1")->fetch();
if (!$config || !(bool)$config['is_active']) respondError('Integrasi AI belum diatur oleh Owner', 503);

$input = getInput();
$messages = $input['messages'] ?? [];
if (!is_array($messages) || count($messages) === 0) respondError('Pesan AI tidak boleh kosong');
$messages = array_slice($messages, -6);

$payload = json_encode([
    'model' => $config['model'],
    'temperature' => 0.3,
    'max_tokens' => 1200,
    'messages' => $messages,
], JSON_UNESCAPED_UNICODE);

$ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 45,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . decryptSecret($config['encrypted_api_key']),
    ],
    CURLOPT_POSTFIELDS => $payload,
]);
$body = curl_exec($ch);
$status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($body === false) respondError('Tidak dapat menghubungi Groq', 502, $curlError);
$decoded = json_decode($body, true);
if ($status < 200 || $status >= 300) {
    // Jangan teruskan HTTP 401 dari Groq. Di frontend, 401 khusus berarti sesi
    // aplikasi kedaluwarsa dan akan mengeluarkan user dari aplikasi.
    respondError($decoded['error']['message'] ?? 'Groq menolak permintaan', $status === 429 ? 429 : 502);
}

// Pertahankan format respons Groq agar frontend tidak pernah perlu mengetahui key.
respond($decoded);
