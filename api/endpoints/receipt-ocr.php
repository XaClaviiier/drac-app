<?php
$user = requireAuthenticatedUser($pdo);
if ($method !== 'POST') respondError('Method not allowed', 405);

$config = $pdo->query("SELECT encrypted_api_key, model, is_active FROM ai_config WHERE id = 2")->fetch();
if (!$config || !(bool)$config['is_active']) respondError('Groq Key Input Cepat belum diatur. Owner perlu menempel key pada halaman Input Cepat Historis.', 503);

$input = getInput();
$image = trim((string)($input['image'] ?? ''));
if (!preg_match('#^data:image/(jpeg|jpg|png|webp);base64,#i', $image)) respondError('File harus berupa foto JPG, PNG, atau WebP.');
if (strlen($image) > 9 * 1024 * 1024) respondError('Foto terlalu besar. Maksimal sekitar 6 MB.');

$instruction = <<<'PROMPT'
Baca nota bengkel kendaraan pada foto. Jangan mengarang nilai yang tidak terlihat. Kembalikan JSON murni dengan struktur:
{"date":"DD/MM/YYYY","customerName":"","phone":"","address":"","plate":"","brand":"","model":"","color":"","complaint":"","items":[{"name":"","qty":1,"price":0}],"total":0}
Aturan: alamat bukan keluhan; merek dan model hanya diisi jika tertulis; angka Panjar bukan total; total harus diambil dari Total Biaya/Total/Grand Total; item yang dicentang dianggap dipilih; harga tanpa nama dipasangkan ke item dicentang terdekat. Jika hanya ada satu harga layanan yang terbaca dan sama dengan total, gunakan harga itu pada layanan terkait. Gunakan string kosong atau 0 jika tidak terbaca.
PROMPT;
$visionModel = trim((string)($config['model'] ?? ''));
if (!$visionModel || str_contains($visionModel, 'llama-4-scout')) {
    $visionModel = 'qwen/qwen3.6-27b';
    // Migrasi transparan: pertahankan key, hanya perbarui model OCR yang sudah dihentikan Groq.
    $stmt = $pdo->prepare("UPDATE ai_config SET model = ? WHERE id = 2");
    $stmt->execute([$visionModel]);
}
$payload = json_encode([
    'model' => $visionModel,
    'temperature' => 0,
    'max_tokens' => 1000,
    'response_format' => ['type' => 'json_object'],
    'messages' => [[
        'role' => 'user',
        'content' => [
            ['type' => 'text', 'text' => $instruction],
            ['type' => 'image_url', 'image_url' => ['url' => $image]],
        ],
    ]],
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

$ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
curl_setopt_array($ch, [
    CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 60,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Bearer ' . decryptSecret($config['encrypted_api_key'])],
    CURLOPT_POSTFIELDS => $payload,
]);
$body = curl_exec($ch); $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $curlError = curl_error($ch); curl_close($ch);
if ($body === false) respondError('Tidak dapat menghubungi Groq', 502, $curlError);
$decoded = json_decode($body, true);
if ($status < 200 || $status >= 300) {
    $msg = $decoded['error']['message'] ?? 'Groq gagal membaca nota';
    if ($status === 401) $msg = 'Groq Key Input Cepat ditolak atau sudah tidak aktif. Tempel key baru pada halaman Input Cepat Historis.';
    if ($status === 429) $msg = 'Kuota Groq sedang habis atau terkena batas. Ganti key atau coba kembali nanti.';
    if (stripos($msg, 'model') !== false && (stripos($msg, 'does not exist') !== false || stripos($msg, 'access') !== false)) $msg = 'Model OCR Groq tidak tersedia untuk key ini. Model sudah diperbarui ke qwen/qwen3.6-27b; silakan coba upload kembali.';
    respondError($msg, $status === 429 ? 429 : 502);
}
$content = $decoded['choices'][0]['message']['content'] ?? '';
$result = json_decode($content, true);
if (!is_array($result)) respondError('Hasil pembacaan nota tidak valid. Coba foto ulang dengan posisi lebih lurus dan terang.', 422);
respondSuccess($result, 'Nota berhasil dibaca. Periksa kembali hasilnya sebelum disimpan.');
