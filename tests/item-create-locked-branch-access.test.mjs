import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Source-contract regression, NOT a runtime/MySQL concurrency test.
// Race: preflight allows branch -> request waits on inventory mutex -> an
// access edit commits revocation, retaining item:create or receipt:create ->
// create reloads authorization. It must assert branch access before any write.
// A DB integration follow-up must exercise that interleaving and assert 403
// plus no items, branch_item_stocks, or warehouse_stocks rows are persisted.
const endpoint = readFileSync(new URL('../api/endpoints/items.php', import.meta.url), 'utf8');
const post = endpoint.split("case 'POST':")[1]?.split("case 'PUT':")[0];

test('item POST checks the requested branch against locked authorization before mutation (source contract)', () => {
  assert.ok(post, 'items POST route must exist');
  const preflight = post.indexOf('requireAccessibleBranch($pdo, $actor, $branchId);');
  const transaction = post.indexOf('$pdo->beginTransaction();');
  const mutex = post.indexOf('lockInventoryMutation($pdo);');
  const reload = post.indexOf('$authorization=lockInventoryMutationAuthorization($pdo,$actor,$createPermission);');
  assert.ok(preflight >= 0 && preflight < transaction && transaction < mutex && mutex < reload,
    'preflight must be followed by a transaction, inventory mutex, and current authorization reload');

  // Keep the branch assertion unconditional in the common create path, before
  // category validation, code allocation, or item/stock insertion. Both normal
  // item:create and provisional receipt:create therefore use the same gate.
  const beforeCategory = post.slice(reload, post.indexOf('$categoryStmt=', reload));
  assert.match(beforeCategory,
    /^\$authorization=lockInventoryMutationAuthorization\(\$pdo,\$actor,\$createPermission\);\s*(?:\$actor=\$authorization\['actor'\];\s*)?assertLockedInventoryBranchAccess\(\$authorization,\s*\$branchId\);/,
    'item creation must recheck branch access after waiting for the mutex, even when create permission remains');
  for (const write of ['INSERT INTO items', 'INSERT INTO branch_item_stocks', 'INSERT INTO warehouse_stocks']) {
    assert.ok(post.indexOf(write) > reload + beforeCategory.length, `${write} must follow locked branch authorization`);
  }
  assert.match(post, /catch \(InvalidArgumentException \| DomainException \$e\)\s*\{\s*\$pdo->rollBack\(\);\s*respondError\(\$e->getMessage\(\), transactionExceptionStatus\(\$e,422\)\);/,
    'branch denial must roll back and preserve its HTTP status');
});
