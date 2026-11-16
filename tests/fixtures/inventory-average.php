<?php
require_once __DIR__.'/../../api/inventory-cost.php';
$input = json_decode($argv[1], true, 512, JSON_THROW_ON_ERROR);
echo json_encode(isset($input['receipt']) ? inventoryReceiptUnitCost($input['receipt']) : inventoryAverageHistory($input['movements'], $input['defaultCost'] ?? 0), JSON_THROW_ON_ERROR);
