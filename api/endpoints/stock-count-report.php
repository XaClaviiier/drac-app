<?php
$actor = $requestUser ?? requireAuthenticatedUser($pdo);
if ($method !== 'GET') respondError('Method not allowed', 405);

$date = trim((string)($_GET['date'] ?? ''));
$warehouseId = trim((string)($_GET['warehouseId'] ?? ''));
$branchId = trim((string)($_GET['branchId'] ?? 'ALL'));
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) respondError('Tanggal laporan tidak valid', 422);
if ($date > date('Y-m-d')) respondError('Tanggal laporan tidak boleh melewati hari ini', 422);
if ($warehouseId === '') respondError('Gudang wajib dipilih', 422);

$accessibleBranchIds=getAccessibleBranchIds($pdo,$actor);
if(!$accessibleBranchIds)respondError('Gudang tidak ditemukan atau nonaktif',404);
$branchMarks=implode(',',array_fill(0,count($accessibleBranchIds),'?'));
$warehouseStmt = $pdo->prepare("SELECT w.id,w.code,w.name,w.branch_id,b.name branch_name,w.is_default
    FROM warehouses w JOIN branches b ON b.id=w.branch_id
    WHERE w.id=? AND w.branch_id IN ($branchMarks) AND w.is_active=1 AND w.is_system=0 LIMIT 1");
$warehouseStmt->execute(array_merge([$warehouseId],$accessibleBranchIds));
$warehouse = $warehouseStmt->fetch();
if (!$warehouse) respondError('Gudang tidak ditemukan atau nonaktif', 404);
if ($branchId !== 'ALL' && $branchId !== (string)$warehouse['branch_id']) respondError('Gudang bukan milik cabang yang dipilih', 422);

$items = $pdo->query("SELECT id,code,name,unit,category_id,category_name,brand
    FROM items WHERE type='Persediaan' AND is_active=1
    ORDER BY category_name,name,code")->fetchAll();
$categoryUsage = [];
$usageRows = $pdo->query("SELECT COALESCE(NULLIF(TRIM(i.category_name),''),'Tanpa Kategori') category_name,
        COALESCE(SUM(ABS(d.qty)),0) usage_count
    FROM sales_invoice_items d
    JOIN items i ON i.id=d.item_id COLLATE utf8mb4_unicode_ci
    WHERE i.type='Persediaan'
    GROUP BY COALESCE(NULLIF(TRIM(i.category_name),''),'Tanpa Kategori')")->fetchAll();
foreach ($usageRows as $usageRow) $categoryUsage[(string)$usageRow['category_name']] = (int)$usageRow['usage_count'];
usort($items, static function(array $left, array $right) use ($categoryUsage): int {
    $leftCategory = (string)($left['category_name'] ?: 'Tanpa Kategori');
    $rightCategory = (string)($right['category_name'] ?: 'Tanpa Kategori');
    $usageComparison = ($categoryUsage[$rightCategory] ?? 0) <=> ($categoryUsage[$leftCategory] ?? 0);
    return $usageComparison
        ?: strcasecmp($leftCategory, $rightCategory)
        ?: strcasecmp((string)$left['name'], (string)$right['name'])
        ?: strcasecmp((string)$left['code'], (string)$right['code']);
});
$quantities = array_fill_keys(array_map(fn($row) => (string)$row['id'], $items), 0);
foreach(historicalWarehouseQuantitiesFromLedger($pdo,$warehouseId,$date) as $itemId=>$quantity){
    if(array_key_exists((string)$itemId,$quantities))$quantities[(string)$itemId]=(int)$quantity;
}

$rows = array_map(function($item) use ($quantities, $categoryUsage) {
    $categoryName = (string)($item['category_name'] ?: 'Tanpa Kategori');
    return [
        'id' => (string)$item['id'], 'code' => (string)$item['code'], 'name' => (string)$item['name'],
        'unit' => (string)($item['unit'] ?? ''), 'categoryId' => (string)($item['category_id'] ?? ''),
        'categoryName' => $categoryName, 'categoryUsageCount' => (int)($categoryUsage[$categoryName] ?? 0),
        'brand' => (string)($item['brand'] ?? ''),
        'quantity' => (int)($quantities[(string)$item['id']] ?? 0),
    ];
}, $items);

respondSuccess([
    'date' => $date,
    'warehouse' => ['id'=>(string)$warehouse['id'],'code'=>(string)$warehouse['code'],'name'=>(string)$warehouse['name']],
    'branch' => ['id'=>(string)$warehouse['branch_id'],'name'=>(string)$warehouse['branch_name']],
    'rows' => $rows,
]);
