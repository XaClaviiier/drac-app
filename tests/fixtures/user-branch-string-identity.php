<?php
// DB-free behavioral seam: load the actual endpoint functions, not copied source.
// Supplied rows stand in for PDO results; this does not exercise MySQL locks/collation.
declare(strict_types=1);

final class UserBranchIdentityStatement extends PDOStatement {
    public function __construct(private UserBranchIdentityPDO $owner) {}
    public function execute(?array $params = null): bool {
        $this->owner->params = $params;
        return true;
    }
    public function fetchAll(int $mode = PDO::FETCH_DEFAULT, mixed ...$args): array {
        return $this->owner->rows;
    }
}
final class UserBranchIdentityPDO extends PDO {
    public ?string $sql = null;
    public ?array $params = null;
    public function __construct(public array $rows) {}
    public function prepare(string $query, array $options = []): PDOStatement|false {
        $this->sql = $query;
        return new UserBranchIdentityStatement($this);
    }
}
// Only the endpoint bootstrap is stubbed. No authentication/config/DB is loaded.
function requireAuthenticatedUser(PDO $pdo): array { return []; }
function respondError(string $message, int $status = 400): void {
    if ($message !== 'Method not allowed' || $status !== 405) {
        throw new RuntimeException('Unexpected endpoint dispatch');
    }
}
$input = json_decode($argv[1], true, 512, JSON_THROW_ON_ERROR);
$pdo = new UserBranchIdentityPDO($input['rows'] ?? []);
$action = null;
$method = '__USER_BRANCH_IDENTITY_FIXTURE__';
require __DIR__ . '/../../api/endpoints/users.php';
try {
    $ids = normalizeUserBranchIds($input['branchIds'], $input['primaryBranchId'] ?? null);
    if ($input['validate'] ?? false) $ids = lockValidUserBranchesForWrite($pdo, $ids);
    $result = ['ids' => $ids];
} catch (InvalidArgumentException $error) {
    $result = ['error' => $error->getMessage()];
}
$result['sql'] = $pdo->sql;
$result['params'] = $pdo->params;
echo json_encode($result, JSON_THROW_ON_ERROR);
