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
{"date":"DD/MM/YYYY","customerName":"","phone":"","address":"","plate":"","brand":"","model":"","color":"","complaint":"","items":[{"name":"","qty":1,"price":0,"checked":true}],"total":0}
Aturan: alamat bukan keluhan; merek dan model hanya diisi jika tertulis; angka Panjar bukan total; total harus diambil dari Total Biaya/Total/Grand Total. Untuk nota bercetak yang memiliki daftar layanan/sparepart dan kotak centang, kembalikan SEMUA nama baris yang terlihat: checked=true hanya jika kotaknya benar-benar bertanda centang/coretan pilihan, checked=false jika kotaknya kosong. Jangan menganggap semua baris tercetak sebagai pilihan. Harga tanpa nama dipasangkan hanya ke item checked=true terdekat. Jika hanya ada satu harga layanan yang terbaca dan sama dengan total, gunakan harga itu pada layanan terpilih yang paling sesuai. Gunakan string kosong atau 0 jika tidak terbaca.
PROMPT;
$visionModel = trim((string)($config['model'] ?? ''));
if (!$visionModel || str_contains($visionModel, 'llama-4-scout')) {
    $visionModel = 'qwen/qwen3.6-27b';
    // Migrasi transparan: pertahankan key, hanya perbarui model OCR yang sudah dihentikan Groq.
    $stmt = $pdo->prepare("UPDATE ai_config SET model = ? WHERE id = 2");
    $stmt->execute([$visionModel]);
}
$requestData = [
    'model' => $visionModel,
    'temperature' => 0,
    // Model reasoning dapat memakai sebagian token sebelum menulis JSON.
    // Batas yang terlalu kecil membuat message.content kosong meski foto terbaca.
    'max_tokens' => 2500,
    'response_format' => ['type' => 'json_object'],
    'messages' => [[
        'role' => 'user',
        'content' => [
            ['type' => 'text', 'text' => $instruction],
            ['type' => 'image_url', 'image_url' => ['url' => $image]],
        ],
    ]],
];

function requestReceiptOcr(array $requestData, string $apiKey): array {
    $ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 60,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Bearer ' . $apiKey],
        CURLOPT_POSTFIELDS => json_encode($requestData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    ]);
    $body = curl_exec($ch); $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $curlError = curl_error($ch); curl_close($ch);
    if ($body === false) respondError('Tidak dapat menghubungi Groq', 502, $curlError);
    return [$status, json_decode($body, true) ?: []];
}

function receiptOcrText($value): string {
    if (is_string($value)) return trim($value);
    if (!is_array($value)) return '';
    if (isset($value['text']) && is_string($value['text'])) return trim($value['text']);
    $parts = [];
    foreach ($value as $part) {
        $text = receiptOcrText($part);
        if ($text !== '') $parts[] = $text;
    }
    return trim(implode("\n", $parts));
}

function extractReceiptOcrResult(array $decoded): ?array {
    $message = $decoded['choices'][0]['message'] ?? [];
    $candidates = [
        $message['content'] ?? '',
        $message['reasoning_content'] ?? '',
        $message['reasoning'] ?? '',
        // Groq dapat menyertakan keluaran model di sini ketika validasi JSON gagal.
        $decoded['error']['failed_generation'] ?? '',
    ];

    foreach ($candidates as $candidate) {
        $content = receiptOcrText($candidate);
        if ($content === '') continue;
        $content = html_entity_decode($content, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $content = preg_replace('/<think>.*?<\/think>/is', '', $content) ?? $content;
        if (preg_match('/```(?:json)?\s*(\{.*\})\s*```/is', $content, $match)) $content = $match[1];
        $result = json_decode(trim($content), true);
        if (is_array($result)) return $result;

        $start = strpos($content, '{');
        $end = strrpos($content, '}');
        if ($start === false || $end === false || $end <= $start) continue;
        $result = json_decode(substr($content, $start, $end - $start + 1), true);
        if (is_array($result)) return $result;
    }
    return null;
}

$apiKey = decryptSecret($config['encrypted_api_key']);
[$status, $decoded] = requestReceiptOcr($requestData, $apiKey);
$result = extractReceiptOcrResult($decoded);
// Beberapa model vision Groq sesekali gagal memvalidasi JSON meskipun isi hasilnya
// dapat dibaca. Ulangi sekali tanpa response_format agar upload tidak berhenti.
$errorCode = strtolower((string)($decoded['error']['code'] ?? ''));
$errorMessage = strtolower((string)($decoded['error']['message'] ?? ''));
if (!$result && $status >= 400 && ($errorCode === 'json_validate_failed' || str_contains($errorMessage, 'failed to validate json'))) {
    unset($requestData['response_format']);
    [$status, $decoded] = requestReceiptOcr($requestData, $apiKey);
    $result = extractReceiptOcrResult($decoded);
}
if (!$result && ($status < 200 || $status >= 300)) {
    $msg = $decoded['error']['message'] ?? 'Groq gagal membaca nota';
    if ($status === 401) $msg = 'Groq Key Input Cepat ditolak atau sudah tidak aktif. Tempel key baru pada halaman Input Cepat Historis.';
    if ($status === 429) $msg = 'Kuota Groq sedang habis atau terkena batas. Ganti key atau coba kembali nanti.';
    if (stripos($msg, 'model') !== false && (stripos($msg, 'does not exist') !== false || stripos($msg, 'access') !== false)) $msg = 'Model OCR Groq tidak tersedia untuk key ini. Model sudah diperbarui ke qwen/qwen3.6-27b; silakan coba upload kembali.';
    respondError($msg, $status === 429 ? 429 : 502);
}
if (!$result) respondError('Groq belum menghasilkan data nota yang lengkap. Coba upload ulang; bila tetap gagal, ganti Key OCR.', 422);
respondSuccess($result, 'Nota berhasil dibaca. Periksa kembali hasilnya sebelum disimpan.');
