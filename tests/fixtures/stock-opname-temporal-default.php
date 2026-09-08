<?php
// DB-free seam: execute the real ownership helper against supplied MySQL metadata.
require __DIR__.'/../../api/helpers.php';
final class TemporalMetadataStatement extends PDOStatement {
    public function __construct(private TemporalMetadataPDO $owner, private string $sql) {}
    public function execute(?array $params = null): bool {
        if (str_contains($this->sql, 'INSERT IGNORE INTO stock_opname_schema_ownership')) $this->owner->definition=$params[2];
        return true;
    }
    public function fetch(int $mode = PDO::FETCH_DEFAULT, int $cursorOrientation = PDO::FETCH_ORI_NEXT, int $cursorOffset = 0): mixed {
        return str_contains($this->sql, 'SELECT COLUMN_TYPE') ? $this->owner->metadata : ['exists'=>1];
    }
}
final class TemporalMetadataPDO extends PDO {
    public ?string $definition=null;
    public function __construct(public array $metadata) {}
    public function prepare(string $query, array $options = []): PDOStatement|false { return new TemporalMetadataStatement($this,$query); }
    public function exec(string $statement): int|false { return 0; }
    public function quote(string $string, int $type = PDO::PARAM_STR): string|false { return "'".str_replace(["\\", "'"], ["\\\\", "\\'"], $string)."'"; }
}
$input=json_decode($argv[1],true,512,JSON_THROW_ON_ERROR);
$pdo=new TemporalMetadataPDO(array_merge([
    'COLUMN_TYPE'=>'datetime','IS_NULLABLE'=>'NO','COLUMN_DEFAULT'=>'CURRENT_TIMESTAMP',
    'EXTRA'=>'','CHARACTER_SET_NAME'=>null,'COLLATION_NAME'=>null,'COLUMN_COMMENT'=>''
],$input));
ensureOwnedStockOpnameColumn($pdo,'stock_count_result_items','added_at','DATETIME NULL');
echo json_encode($pdo->definition,JSON_THROW_ON_ERROR);
