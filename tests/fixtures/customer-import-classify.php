<?php
require __DIR__ . '/../../api/customer-import.php';
$input = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
try {
    $rows = customerImportValidateRows($input['rows']);
    $result = customerImportClassify($rows, $input['existing'] ?? []);
    echo json_encode(['rows'=>$result,'counts'=>customerImportSummary($result)],JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
} catch (Throwable $e) { echo json_encode(['error'=>$e->getMessage()]); }
