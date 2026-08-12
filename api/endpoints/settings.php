<?php
$defaultSettings = [
    'company' => [
        'name' => 'DOKTER AC MOBIL', 'legalName' => '', 'phone' => '', 'email' => '',
        'taxNumber' => '', 'address' => '', 'timezone' => 'Asia/Makassar',
        'invoiceFooter' => 'Terima kasih telah mempercayakan kendaraan Anda kepada kami.',
    ],
    'branchDocumentCodes' => ['BR-001' => 'D', 'BR-002' => 'C', 'BR-003' => 'M'],
    'documents' => [
        'workOrderPrefix' => 'WO-', 'invoicePrefix' => 'INV-',
        'sequenceDigits' => 3, 'resetPeriod' => 'daily',
    ],
    'security' => ['sessionHours' => 8, 'maxLoginAttempts' => 5, 'auditLogEnabled' => true, 'requireBackdateReason' => true],
    'ai' => [
        'provider' => 'groq', 'model' => 'llama-3.3-70b-versatile',
        'allowCustomerData' => true, 'allowInventoryData' => true,
        'allowFinancialData' => false, 'allowCreateWorkOrder' => true,
    ],
    'pendingReasonTemplates' => [
        ['id' => 'think', 'label' => 'Pikir-pikir', 'isActive' => true],
        ['id' => 'fund', 'label' => 'Menyiapkan dana', 'isActive' => true],
        ['id' => 'schedule', 'label' => 'Menunggu jadwal', 'isActive' => true],
        ['id' => 'other', 'label' => 'Lainnya', 'isActive' => true],
    ],
    'lostSalesReasonTemplates' => [
        ['id' => 'customer-cancel', 'label' => 'Pelanggan membatalkan', 'isActive' => true, 'requiresNote' => false],
        ['id' => 'price-rejected', 'label' => 'Harga tidak disetujui', 'isActive' => true, 'requiresNote' => false],
        ['id' => 'customer-delay', 'label' => 'Pelanggan menunda', 'isActive' => true, 'requiresNote' => false],
        ['id' => 'parts-unavailable', 'label' => 'Suku cadang tidak tersedia', 'isActive' => true, 'requiresNote' => false],
        ['id' => 'other-workshop', 'label' => 'Kendaraan dibawa ke bengkel lain', 'isActive' => true, 'requiresNote' => false],
        ['id' => 'unreachable', 'label' => 'Tidak dapat dihubungi', 'isActive' => true, 'requiresNote' => false],
        ['id' => 'other', 'label' => 'Lainnya', 'isActive' => true, 'requiresNote' => true],
    ],
];

if ($method === 'GET') {
    $stmt = $pdo->prepare("SELECT settings_json FROM app_settings WHERE id = 1");
    $stmt->execute();
    $row = $stmt->fetch();
    $storedSettings = $row ? json_decode($row['settings_json'], true) : [];
    respondSuccess(array_replace($defaultSettings, is_array($storedSettings) ? $storedSettings : []));
}

if ($method === 'PUT') {
    $settings = getInput();
    if (!isset($settings['company'], $settings['documents'], $settings['branchDocumentCodes'])) {
        respondError('Format pengaturan tidak valid');
    }
    $stmt = $pdo->prepare("
        INSERT INTO app_settings (id, settings_json) VALUES (1, ?)
        ON DUPLICATE KEY UPDATE settings_json = VALUES(settings_json), updated_at = CURRENT_TIMESTAMP
    ");
    $stmt->execute([json_encode($settings, JSON_UNESCAPED_UNICODE)]);
    respondSuccess($settings, 'Pengaturan berhasil disimpan');
}

respondError('Method not allowed', 405);
