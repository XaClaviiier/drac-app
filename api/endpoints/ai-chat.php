<?php
$user = requireAuthenticatedUser($pdo);
if ($method !== 'POST') respondError('Method not allowed', 405);

$config = $pdo->query("SELECT encrypted_api_key, model, is_active FROM ai_config WHERE id = 1")->fetch();
if (!$config || !(bool)$config['is_active']) respondError('Integrasi AI belum diatur oleh Owner', 503);

// Groq menghentikan model Llama lama untuk akun Free/Developer pada 16 Agustus
// 2026. Migrasikan konfigurasi lama otomatis supaya instalasi yang sudah aktif
// tidak mendadak berhenti dengan HTTP 502.
$deprecatedModels = [
    'llama-3.3-70b-versatile' => 'openai/gpt-oss-120b',
    'llama-3.1-8b-instant' => 'openai/gpt-oss-20b',
];
$configuredModel = trim((string)($config['model'] ?? ''));
$model = $deprecatedModels[$configuredModel] ?? ($configuredModel ?: 'openai/gpt-oss-120b');
if ($model !== $configuredModel) {
    $pdo->prepare("UPDATE ai_config SET model=?, updated_at=CURRENT_TIMESTAMP WHERE id=1")->execute([$model]);
}

$input = getInput();
$messages = $input['messages'] ?? [];
if (!is_array($messages) || count($messages) === 0) respondError('Pesan AI tidak boleh kosong');
$messages = array_slice($messages, -6);

$payload = json_encode([
    'model' => $model,
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
    $groqMessage = trim((string)($decoded['error']['message'] ?? ''));
    if ($status === 401 || $status === 403) {
        // Jangan teruskan 401 Groq: di frontend 401 khusus berarti sesi aplikasi
        // kedaluwarsa dan dapat mengeluarkan user dari aplikasi.
        respondError('API Key Groq ditolak. Owner perlu mengganti key di Pengaturan > Integrasi AI.', 502);
    }
    if ($status === 404 || str_contains(strtolower($groqMessage), 'model')) {
        respondError('Model AI tidak tersedia di Groq. Pilih GPT-OSS 120B atau GPT-OSS 20B di Pengaturan.', 502);
    }
    if ($status === 429) respondError('Batas pemakaian Groq tercapai. Tunggu sekitar 1 menit lalu coba lagi.', 429);
    respondError($groqMessage !== '' ? 'Groq: ' . $groqMessage : 'Layanan Groq sedang bermasalah', 502);
}

// Pertahankan format respons Groq agar frontend tidak pernah perlu mengetahui key.
respond($decoded);
