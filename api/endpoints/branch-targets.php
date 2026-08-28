<?php
// Target finansial hanya dikirim kepada sesi yang telah lolos pemeriksaan
// `report:view` pada router API. Jangan pindahkan nilai ini ke bundle frontend.
if ($method !== 'GET') {
    respondError('Method not allowed', 405);
}

respondSuccess([
    'PERINTIS' => 150000000,
    'CAKALANG' => 75000000,
    'MAMUJU' => 75000000,
]);
