-- Stok Opname historis: periode, snapshot mutasi, dan item manual.
-- Kompatibel MySQL 5.7 dan aman dijalankan ulang.
SET @schema_name = DATABASE();

CREATE TABLE IF NOT EXISTS `app_schema_migrations` (
  `migration_key` VARCHAR(100) NOT NULL PRIMARY KEY,
  `applied_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inventory_operation_locks` (
  `lock_key` VARCHAR(30) NOT NULL PRIMARY KEY,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO `inventory_operation_locks` (`lock_key`) VALUES ('global');

SET @stock_opname_stale_lock = IS_USED_LOCK('drac_inventory_schema_migration')=CONNECTION_ID();
SET @stock_opname_stale_lock_released = IF(@stock_opname_stale_lock,RELEASE_LOCK('drac_inventory_schema_migration'),NULL);
SELECT GET_LOCK('drac_inventory_schema_migration',60) INTO @stock_opname_migration_lock;
DROP PROCEDURE IF EXISTS `assert_stock_opname_migration_lock`;
DELIMITER //
CREATE PROCEDURE `assert_stock_opname_migration_lock`()
BEGIN
  IF COALESCE(@stock_opname_migration_lock,0) <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tidak dapat memperoleh kunci migration persediaan';
  END IF;
END//
DELIMITER ;
CALL `assert_stock_opname_migration_lock`();
DROP PROCEDURE `assert_stock_opname_migration_lock`;
START TRANSACTION;
SELECT `lock_key` FROM `inventory_operation_locks` WHERE `lock_key`='global' FOR UPDATE;
COMMIT;

SET @index_signature = (
  SELECT CONCAT(MIN(NON_UNIQUE), ':', GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX), ':', SUM(SUB_PART IS NOT NULL))
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='stock_count_result_items' AND INDEX_NAME='uq_stock_count_result_item'
);
DROP PROCEDURE IF EXISTS `assert_stock_opname_result_index`;
DELIMITER //
CREATE PROCEDURE `assert_stock_opname_result_index`()
BEGIN
  IF @index_signature IS NOT NULL AND @index_signature <> '0:result_id,item_id:0' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='uq_stock_count_result_item has an incompatible definition';
  END IF;
END//
DELIMITER ;
CALL `assert_stock_opname_result_index`();
DROP PROCEDURE `assert_stock_opname_result_index`;

SELECT COUNT(*) INTO @duplicate_stock_count_result_items
FROM (
  SELECT result_id,item_id
  FROM stock_count_result_items
  GROUP BY result_id,item_id
  HAVING COUNT(*) > 1
) duplicate_items;
DROP PROCEDURE IF EXISTS `assert_no_duplicate_stock_count_result_items`;
DELIMITER //
CREATE PROCEDURE `assert_no_duplicate_stock_count_result_items`()
BEGIN
  IF @duplicate_stock_count_result_items > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Duplicate stock_count_result_items prevent canonical unique index';
  END IF;
END//
DELIMITER ;
CALL `assert_no_duplicate_stock_count_result_items`();
DROP PROCEDURE `assert_no_duplicate_stock_count_result_items`;

SET @invalid_include_zero_unused = 0;
SET @ddl = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='stock_count_orders' AND COLUMN_NAME='include_zero_unused'),
  'SELECT COUNT(*) INTO @invalid_include_zero_unused FROM stock_count_orders WHERE include_zero_unused IS NOT NULL AND include_zero_unused NOT IN (0,1)',
  'SELECT 0 INTO @invalid_include_zero_unused'
);
PREPARE stock_opname_history_migration FROM @ddl;
EXECUTE stock_opname_history_migration;
DEALLOCATE PREPARE stock_opname_history_migration;

SET @invalid_system_version = 0;
SET @ddl = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='stock_count_result_items' AND COLUMN_NAME='system_version'),
  'SELECT COUNT(*) INTO @invalid_system_version FROM stock_count_result_items WHERE system_version<0',
  'SELECT 0 INTO @invalid_system_version'
);
PREPARE stock_opname_history_migration FROM @ddl;
EXECUTE stock_opname_history_migration;
DEALLOCATE PREPARE stock_opname_history_migration;

SET @invalid_movement_in = 0;
SET @ddl = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='stock_count_result_items' AND COLUMN_NAME='movement_in'),
  'SELECT COUNT(*) INTO @invalid_movement_in FROM stock_count_result_items WHERE movement_in<0',
  'SELECT 0 INTO @invalid_movement_in'
);
PREPARE stock_opname_history_migration FROM @ddl;
EXECUTE stock_opname_history_migration;
DEALLOCATE PREPARE stock_opname_history_migration;

SET @invalid_movement_out = 0;
SET @ddl = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='stock_count_result_items' AND COLUMN_NAME='movement_out'),
  'SELECT COUNT(*) INTO @invalid_movement_out FROM stock_count_result_items WHERE movement_out<0',
  'SELECT 0 INTO @invalid_movement_out'
);
PREPARE stock_opname_history_migration FROM @ddl;
EXECUTE stock_opname_history_migration;
DEALLOCATE PREPARE stock_opname_history_migration;

SET @invalid_is_manual = 0;
SET @ddl = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='stock_count_result_items' AND COLUMN_NAME='is_manual'),
  'SELECT COUNT(*) INTO @invalid_is_manual FROM stock_count_result_items WHERE is_manual IS NOT NULL AND is_manual NOT IN (0,1)',
  'SELECT 0 INTO @invalid_is_manual'
);
PREPARE stock_opname_history_migration FROM @ddl;
EXECUTE stock_opname_history_migration;
DEALLOCATE PREPARE stock_opname_history_migration;

DROP PROCEDURE IF EXISTS `assert_existing_stock_opname_snapshot_values`;
DELIMITER //
CREATE PROCEDURE `assert_existing_stock_opname_snapshot_values`()
BEGIN
  IF @invalid_include_zero_unused + @invalid_system_version + @invalid_movement_in + @invalid_movement_out + @invalid_is_manual > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Schema Stok Opname memiliki nilai di luar domain';
  END IF;
END//
DELIMITER ;
CALL `assert_existing_stock_opname_snapshot_values`();
DROP PROCEDURE `assert_existing_stock_opname_snapshot_values`;

CREATE TABLE IF NOT EXISTS `stock_opname_schema_ownership` (
  `component_type` VARCHAR(20) NOT NULL,
  `table_name` VARCHAR(64) NOT NULL,
  `component_name` VARCHAR(64) NOT NULL,
  `prior_definition` LONGTEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`component_type`,`table_name`,`component_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `stock_opname_schema_value_backups` (
  `table_name` VARCHAR(64) NOT NULL,
  `column_name` VARCHAR(64) NOT NULL,
  `row_key` VARCHAR(191) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`table_name`,`column_name`,`row_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @ddl = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='stock_opname_schema_ownership' AND COLUMN_NAME='prior_definition'),
  'SELECT 1',
  'ALTER TABLE `stock_opname_schema_ownership` ADD COLUMN `prior_definition` LONGTEXT NULL AFTER `component_name`'
);
PREPARE stock_opname_history_migration FROM @ddl;
EXECUTE stock_opname_history_migration;
DEALLOCATE PREPARE stock_opname_history_migration;

-- Catat intent sebelum ADD INDEX yang auto-commit. NULL berarti index belum
-- ada dan harus dihapus saat rollback; signature canonical berarti diadopsi.
INSERT IGNORE INTO `stock_opname_schema_ownership` (`component_type`,`table_name`,`component_name`,`prior_definition`)
VALUES('index','stock_count_result_items','uq_stock_count_result_item',@index_signature);

DROP PROCEDURE IF EXISTS `record_stock_opname_column_ownership`;
DELIMITER //
CREATE PROCEDURE `record_stock_opname_column_ownership`(IN p_component_type VARCHAR(20),IN p_table VARCHAR(64),IN p_column VARCHAR(64))
BEGIN
  INSERT IGNORE INTO `stock_opname_schema_ownership` (`component_type`,`table_name`,`component_name`,`prior_definition`)
  SELECT p_component_type,p_table,p_column,
    CASE WHEN c.COLUMN_NAME IS NULL THEN NULL ELSE CONCAT(
      c.COLUMN_TYPE,
      IF(c.CHARACTER_SET_NAME IS NULL,'',CONCAT(' CHARACTER SET ',c.CHARACTER_SET_NAME,' COLLATE ',c.COLLATION_NAME)),
      IF(c.IS_NULLABLE='YES',' NULL',' NOT NULL'),
      CASE WHEN c.COLUMN_DEFAULT IS NULL THEN IF(c.IS_NULLABLE='YES',' DEFAULT NULL','') ELSE CONCAT(' DEFAULT ',QUOTE(c.COLUMN_DEFAULT)) END,
      IF(c.EXTRA='','',CONCAT(' ',c.EXTRA)),
      IF(c.COLUMN_COMMENT='','',CONCAT(' COMMENT ',QUOTE(c.COLUMN_COMMENT)))
    ) END
  FROM (SELECT 1) seed
  LEFT JOIN information_schema.COLUMNS c
    ON c.TABLE_SCHEMA=@schema_name AND c.TABLE_NAME=p_table AND c.COLUMN_NAME=p_column;
END//
DELIMITER ;

CREATE TABLE IF NOT EXISTS `inventory_import_batches` (
  `batch_key` VARCHAR(100) NOT NULL PRIMARY KEY,
  `payload_sha256` CHAR(64) NOT NULL,
  `status` VARCHAR(20) NOT NULL,
  `import_type` VARCHAR(30) NOT NULL,
  `effective_date` DATE NOT NULL,
  `row_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `created_by` VARCHAR(20) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `completed_at` DATETIME NULL,
  `detail_json` LONGTEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @column_existed = EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='stock_count_orders' AND COLUMN_NAME='end_date');
CALL `record_stock_opname_column_ownership`('column','stock_count_orders','end_date');
SET @ddl = IF(@column_existed,'SELECT 1','ALTER TABLE `stock_count_orders` ADD COLUMN `end_date` DATE NULL AFTER `start_date`');
PREPARE stock_opname_history_migration FROM @ddl;
EXECUTE stock_opname_history_migration;
DEALLOCATE PREPARE stock_opname_history_migration;
INSERT IGNORE INTO `stock_opname_schema_value_backups` (`table_name`,`column_name`,`row_key`)
SELECT 'stock_count_orders','end_date',CAST(id AS CHAR) FROM `stock_count_orders` WHERE `end_date` IS NULL
  AND EXISTS(SELECT 1 FROM `stock_opname_schema_ownership` WHERE `component_type`='column' AND `table_name`='stock_count_orders' AND `component_name`='end_date' AND `prior_definition` IS NOT NULL);
UPDATE stock_count_orders o
LEFT JOIN stock_count_results r ON r.order_id=o.id
SET o.end_date=COALESCE(r.result_date,o.start_date)
WHERE o.end_date IS NULL;
ALTER TABLE `stock_count_orders` MODIFY `end_date` DATE NOT NULL;

SET @column_existed = EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='stock_count_orders' AND COLUMN_NAME='include_zero_unused');
CALL `record_stock_opname_column_ownership`('column','stock_count_orders','include_zero_unused');
SET @ddl = IF(@column_existed,'SELECT 1','ALTER TABLE `stock_count_orders` ADD COLUMN `include_zero_unused` TINYINT(1) NOT NULL DEFAULT 1 AFTER `category_id`');
PREPARE stock_opname_history_migration FROM @ddl;
EXECUTE stock_opname_history_migration;
DEALLOCATE PREPARE stock_opname_history_migration;
INSERT IGNORE INTO `stock_opname_schema_value_backups` (`table_name`,`column_name`,`row_key`)
SELECT 'stock_count_orders','include_zero_unused',CAST(id AS CHAR) FROM `stock_count_orders` WHERE `include_zero_unused` IS NULL
  AND EXISTS(SELECT 1 FROM `stock_opname_schema_ownership` WHERE `component_type`='column' AND `table_name`='stock_count_orders' AND `component_name`='include_zero_unused' AND `prior_definition` IS NOT NULL);

UPDATE `stock_count_orders`
SET `include_zero_unused`=1
WHERE `include_zero_unused` IS NULL;
ALTER TABLE `stock_count_orders` MODIFY `include_zero_unused` TINYINT(1) NOT NULL DEFAULT 1;

SET @column_existed = EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='stock_count_result_items' AND COLUMN_NAME='system_version');
CALL `record_stock_opname_column_ownership`('column','stock_count_result_items','system_version');
SET @ddl = IF(@column_existed,'SELECT 1','ALTER TABLE `stock_count_result_items` ADD COLUMN `system_version` BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER `system_quantity`');
PREPARE stock_opname_history_migration FROM @ddl;
EXECUTE stock_opname_history_migration;
DEALLOCATE PREPARE stock_opname_history_migration;
INSERT IGNORE INTO `stock_opname_schema_value_backups` (`table_name`,`column_name`,`row_key`)
SELECT 'stock_count_result_items','system_version',CAST(id AS CHAR) FROM `stock_count_result_items` WHERE `system_version` IS NULL
  AND EXISTS(SELECT 1 FROM `stock_opname_schema_ownership` WHERE `component_type`='column' AND `table_name`='stock_count_result_items' AND `component_name`='system_version' AND `prior_definition` IS NOT NULL);

SET @column_existed = EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='stock_count_result_items' AND COLUMN_NAME='movement_in');
CALL `record_stock_opname_column_ownership`('column','stock_count_result_items','movement_in');
SET @ddl = IF(@column_existed,'SELECT 1','ALTER TABLE `stock_count_result_items` ADD COLUMN `movement_in` BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER `system_version`');
PREPARE stock_opname_history_migration FROM @ddl;
EXECUTE stock_opname_history_migration;
DEALLOCATE PREPARE stock_opname_history_migration;
INSERT IGNORE INTO `stock_opname_schema_value_backups` (`table_name`,`column_name`,`row_key`)
SELECT 'stock_count_result_items','movement_in',CAST(id AS CHAR) FROM `stock_count_result_items` WHERE `movement_in` IS NULL
  AND EXISTS(SELECT 1 FROM `stock_opname_schema_ownership` WHERE `component_type`='column' AND `table_name`='stock_count_result_items' AND `component_name`='movement_in' AND `prior_definition` IS NOT NULL);

SET @column_existed = EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='stock_count_result_items' AND COLUMN_NAME='movement_out');
CALL `record_stock_opname_column_ownership`('column','stock_count_result_items','movement_out');
SET @ddl = IF(@column_existed,'SELECT 1','ALTER TABLE `stock_count_result_items` ADD COLUMN `movement_out` BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER `movement_in`');
PREPARE stock_opname_history_migration FROM @ddl;
EXECUTE stock_opname_history_migration;
DEALLOCATE PREPARE stock_opname_history_migration;
INSERT IGNORE INTO `stock_opname_schema_value_backups` (`table_name`,`column_name`,`row_key`)
SELECT 'stock_count_result_items','movement_out',CAST(id AS CHAR) FROM `stock_count_result_items` WHERE `movement_out` IS NULL
  AND EXISTS(SELECT 1 FROM `stock_opname_schema_ownership` WHERE `component_type`='column' AND `table_name`='stock_count_result_items' AND `component_name`='movement_out' AND `prior_definition` IS NOT NULL);

SET @column_existed = EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='stock_count_result_items' AND COLUMN_NAME='is_manual');
CALL `record_stock_opname_column_ownership`('column','stock_count_result_items','is_manual');
SET @ddl = IF(@column_existed,'SELECT 1','ALTER TABLE `stock_count_result_items` ADD COLUMN `is_manual` TINYINT(1) NOT NULL DEFAULT 0 AFTER `movement_out`');
PREPARE stock_opname_history_migration FROM @ddl;
EXECUTE stock_opname_history_migration;
DEALLOCATE PREPARE stock_opname_history_migration;
INSERT IGNORE INTO `stock_opname_schema_value_backups` (`table_name`,`column_name`,`row_key`)
SELECT 'stock_count_result_items','is_manual',CAST(id AS CHAR) FROM `stock_count_result_items` WHERE `is_manual` IS NULL
  AND EXISTS(SELECT 1 FROM `stock_opname_schema_ownership` WHERE `component_type`='column' AND `table_name`='stock_count_result_items' AND `component_name`='is_manual' AND `prior_definition` IS NOT NULL);

SET @column_existed = EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='stock_count_result_items' AND COLUMN_NAME='added_by');
CALL `record_stock_opname_column_ownership`('column','stock_count_result_items','added_by');
SET @ddl = IF(@column_existed,'SELECT 1','ALTER TABLE `stock_count_result_items` ADD COLUMN `added_by` VARCHAR(20) NULL AFTER `is_manual`');
PREPARE stock_opname_history_migration FROM @ddl;
EXECUTE stock_opname_history_migration;
DEALLOCATE PREPARE stock_opname_history_migration;

SET @column_existed = EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='stock_count_result_items' AND COLUMN_NAME='added_at');
CALL `record_stock_opname_column_ownership`('column','stock_count_result_items','added_at');
SET @ddl = IF(@column_existed,'SELECT 1','ALTER TABLE `stock_count_result_items` ADD COLUMN `added_at` DATETIME NULL AFTER `added_by`');
PREPARE stock_opname_history_migration FROM @ddl;
EXECUTE stock_opname_history_migration;
DEALLOCATE PREPARE stock_opname_history_migration;
DROP PROCEDURE `record_stock_opname_column_ownership`;

DROP PROCEDURE IF EXISTS `assert_stock_opname_history_domain`;
DELIMITER //
CREATE PROCEDURE `assert_stock_opname_history_domain`()
BEGIN
  IF EXISTS(SELECT 1 FROM `stock_count_orders` WHERE `include_zero_unused` NOT IN (0,1))
     OR EXISTS(SELECT 1 FROM `stock_count_result_items` WHERE `system_version`<0 OR `movement_in`<0 OR `movement_out`<0 OR `is_manual` NOT IN (0,1)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Schema Stok Opname memiliki nilai di luar domain';
  END IF;
END//
DELIMITER ;
CALL `assert_stock_opname_history_domain`();
DROP PROCEDURE `assert_stock_opname_history_domain`;

UPDATE `stock_count_orders` SET `include_zero_unused`=1 WHERE `include_zero_unused` IS NULL;
UPDATE `stock_count_result_items` SET `system_version`=0 WHERE `system_version` IS NULL;
UPDATE `stock_count_result_items` SET `movement_in`=0 WHERE `movement_in` IS NULL;
UPDATE `stock_count_result_items` SET `movement_out`=0 WHERE `movement_out` IS NULL;
UPDATE `stock_count_result_items` SET `is_manual`=0 WHERE `is_manual` IS NULL;
ALTER TABLE `stock_count_result_items` MODIFY `system_version` BIGINT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE `stock_count_result_items` MODIFY `movement_in` BIGINT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE `stock_count_result_items` MODIFY `movement_out` BIGINT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE `stock_count_result_items` MODIFY `is_manual` TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE `stock_count_result_items` MODIFY `added_by` VARCHAR(20) NULL;
ALTER TABLE `stock_count_result_items` MODIFY `added_at` DATETIME NULL;

SET @ddl = IF(
  @index_signature = '0:result_id,item_id:0',
  'SELECT 1',
  'ALTER TABLE `stock_count_result_items` ADD UNIQUE KEY `uq_stock_count_result_item` (`result_id`,`item_id`)'
);
PREPARE stock_opname_history_migration FROM @ddl;
EXECUTE stock_opname_history_migration;
DEALLOCATE PREPARE stock_opname_history_migration;

INSERT IGNORE INTO `app_schema_migrations` (`migration_key`)
VALUES ('schema_20260904_historical_stock_opname_v2');
SELECT RELEASE_LOCK('drac_inventory_schema_migration');
