<?php
require_once __DIR__ . '/../customer-import.php';
if ($method !== 'POST' || !in_array($id, ['import-preview','import'], true)) respondError('Method not allowed', 405);
requireAuthenticatedUserPermission($pdo, $requestUser, 'customer:create');
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 8 * 1024 * 1024) respondError('Payload maksimal 8 MB.', 413);
$body = file_get_contents('php://input', false, null, 0, 8 * 1024 * 1024 + 1);
if (strlen($body) > 8 * 1024 * 1024) respondError('Payload maksimal 8 MB.', 413);
try {
    $input = json_decode($body, true, 32, JSON_THROW_ON_ERROR);
    $rows = customerImportValidateRows($input['rows'] ?? null);
    $branchId = $input['branchId'] ?? null;
    $source = $input['source'] ?? '';
    if (!is_string($branchId) || $branchId === '' || !is_string($source) || strlen($source) > 255) throw new InvalidArgumentException('Cabang asal dan nama file tidak valid.');
    requireAccessibleBranch($pdo, $requestUser, $branchId);
    $branch = $pdo->prepare('SELECT id FROM branches WHERE id=? AND is_active=1'); $branch->execute([$branchId]);
    if (!$branch->fetch()) throw new InvalidArgumentException('Cabang asal tidak aktif.');
    if ($id === 'import-preview') {
        $result = customerImportClassify($rows, $pdo->query('SELECT id,name,phone FROM customers')->fetchAll());
        respondSuccess(['rows'=>$result,'counts'=>customerImportSummary($result),'digest'=>customerImportDigest($result,$branchId,$source)]);
    }
    $runId = $input['runId'] ?? ''; $digest = $input['digest'] ?? '';
    if (!is_string($runId) || !preg_match('/^[a-zA-Z0-9-]{16,64}$/D', $runId) || !is_string($digest) || !preg_match('/^[a-f0-9]{64}$/D', $digest)) throw new InvalidArgumentException('ID import atau preview tidak valid.');
    respondSuccess(customerImportExecute($pdo,$rows,$branchId,$source,$runId,$digest,$requestUser));
} catch (JsonException | InvalidArgumentException $e) { respondError($e->getMessage(), 422, 'IMPORT_REJECTED'); }
