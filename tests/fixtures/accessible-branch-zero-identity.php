<?php
// Execute the real helpers with controlled PDO rows, without config or MySQL.
declare(strict_types=1);
require __DIR__ . '/../../api/helpers.php';

final class AccessibleZeroStatement extends PDOStatement {
    public function __construct(private array $rows, private ?array $expectedParams = null) {}
    public function execute(?array $params = null): bool {
        if ($params !== $this->expectedParams) throw new LogicException('Unexpected query parameters');
        return true;
    }
    public function fetch(int $mode = PDO::FETCH_DEFAULT, int $cursorOrientation = PDO::FETCH_ORI_NEXT, int $cursorOffset = 0): mixed {
        return $this->rows[0] ?? false;
    }
    public function fetchAll(int $mode = PDO::FETCH_DEFAULT, mixed ...$args): array { return $this->rows; }
}
final class AccessibleZeroPDO extends PDO {
    public array $queries = [];
    public function __construct(private array $input) {}
    public function prepare(string $query, array $options = []): PDOStatement|false {
        $this->queries[] = $query;
        if ($query === 'SELECT code, name, permissions FROM roles WHERE id = ? AND is_active = 1 LIMIT 1') {
            return new AccessibleZeroStatement([['code' => 'STAFF', 'name' => 'Staff', 'permissions' => json_encode($this->input['permissions'] ?? [])]], ['role-test']);
        }
        if ($query === 'SELECT branch_id FROM user_branch_access WHERE user_id = ? ORDER BY branch_id') {
            return new AccessibleZeroStatement(array_map(static fn($id): array => ['branch_id' => $id], $this->input['memberships'] ?? []), ['user-test']);
        }
        throw new LogicException('Unexpected SQL: ' . $query);
    }
    public function query(string $query, ?int $fetchMode = null, mixed ...$fetchModeArgs): PDOStatement|false {
        $this->queries[] = $query;
        if ($query !== 'SELECT id FROM branches ORDER BY id') throw new LogicException('Unexpected SQL: ' . $query);
        return new AccessibleZeroStatement(array_map(static fn($id): array => ['id' => $id], $this->input['allBranches'] ?? []));
    }
}
// Helpers' response boundary only; authorization code itself is not mocked.
function respondError(string $message, int $status = 400): void { throw new DomainException($message, $status); }
$input = json_decode($argv[1], true, 512, JSON_THROW_ON_ERROR);
$pdo = new AccessibleZeroPDO($input);
$user = ['id' => 'user-test', 'role_id' => 'role-test', 'is_active' => 1, 'is_owner' => $input['owner'] ?? false];
if (array_key_exists('primary', $input)) $user['branch_id'] = $input['primary'];
$authorization = [
    'actor' => $user, 'permissions' => $input['permissions'] ?? [],
    'users' => ['user-test' => $user], 'rolesByUser' => ['user-test' => ['is_active' => 1]],
    'permissionsByUser' => ['user-test' => $input['permissions'] ?? []],
    'branchAccess' => ['user-test' => $input['memberships'] ?? []],
];
try {
    switch ($input['mode'] ?? 'list') {
        case 'list': $result = ['ids' => getAccessibleBranchIds($pdo, $user)]; break;
        case 'memberships': $result = ['ids' => getUserBranchIds($pdo, 'user-test')]; break;
        case 'assert': assertAccessibleBranch($pdo, $user, $input['target']); $result = ['allowed' => true]; break;
        case 'require': requireAccessibleBranch($pdo, $user, $input['target']); $result = ['allowed' => true]; break;
        case 'locked': assertLockedInventoryBranchAccess($authorization, $input['target']); $result = ['allowed' => true]; break;
        case 'delegate': lockedInventoryDelegatedUserForBranch($authorization, 'user-test', $input['target'], 'Petugas'); $result = ['allowed' => true]; break;
        default: throw new LogicException('Unexpected fixture mode');
    }
} catch (DomainException | InvalidArgumentException $error) {
    $result = ['error' => get_class($error), 'code' => $error->getCode()];
}
$result['queries'] = $pdo->queries;
echo json_encode($result, JSON_THROW_ON_ERROR);
