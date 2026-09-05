-- Rollback eksplisit Stok Opname historis.
-- PERINGATAN: menghapus snapshot periode/mutasi dan metadata item manual.
SET @schema_name = DATABASE();

SET @stock_opname_stale_lock = IS_USED_LOCK('drac_inventory_schema_migration')=CONNECTION_ID();
SET @stock_opname_stale_lock_released = IF(@stock_opname_stale_lock,RELEASE_LOCK('drac_inventory_schema_migration'),NULL);
SELECT GET_LOCK('drac_inventory_schema_migration',60) INTO @stock_opname_rollback_lock;
DROP PROCEDURE IF EXISTS `assert_stock_opname_rollback_lock`;
DELIMITER //
CREATE PROCEDURE `assert_stock_opname_rollback_lock`()
BEGIN
  IF COALESCE(@stock_opname_rollback_lock,0) <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tidak dapat memperoleh kunci rollback persediaan';
  END IF;
END//
DELIMITER ;
CALL `assert_stock_opname_rollback_lock`();
DROP PROCEDURE `assert_stock_opname_rollback_lock`;
START TRANSACTION;
SELECT `lock_key` FROM `inventory_operation_locks` WHERE `lock_key`='global' FOR UPDATE;
COMMIT;

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
PREPARE stock_opname_history_rollback FROM @ddl;
EXECUTE stock_opname_history_rollback;
DEALLOCATE PREPARE stock_opname_history_rollback;

SET @prior_index_definition = (
  SELECT `prior_definition` FROM `stock_opname_schema_ownership`
  WHERE `component_type`='index' AND `table_name`='stock_count_result_items' AND `component_name`='uq_stock_count_result_item'
);
SET @owned_index_recorded = EXISTS(
  SELECT 1 FROM `stock_opname_schema_ownership`
  WHERE `component_type`='index' AND `table_name`='stock_count_result_items' AND `component_name`='uq_stock_count_result_item'
);
SET @current_index_exists = EXISTS(
  SELECT 1 FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='stock_count_result_items' AND INDEX_NAME='uq_stock_count_result_item'
);
SET @ddl = IF(
  @owned_index_recorded AND @prior_index_definition IS NULL AND @current_index_exists,
  'ALTER TABLE `stock_count_result_items` DROP INDEX `uq_stock_count_result_item`',
  IF(@owned_index_recorded AND @prior_index_definition='0:result_id,item_id:0' AND NOT @current_index_exists,
    'ALTER TABLE `stock_count_result_items` ADD UNIQUE KEY `uq_stock_count_result_item` (`result_id`,`item_id`)',
    'SELECT 1')
);
PREPARE stock_opname_history_rollback FROM @ddl;
EXECUTE stock_opname_history_rollback;
DEALLOCATE PREPARE stock_opname_history_rollback;
DELETE FROM `stock_opname_schema_ownership`
WHERE `component_type`='index' AND `table_name`='stock_count_result_items' AND `component_name`='uq_stock_count_result_item';

DROP PROCEDURE IF EXISTS `drop_owned_stock_opname_column`;
DELIMITER //
CREATE PROCEDURE `drop_owned_stock_opname_column`(IN p_table VARCHAR(64),IN p_column VARCHAR(64))
BEGIN
  IF EXISTS(
    SELECT 1 FROM `stock_opname_schema_ownership`
    WHERE `component_type`='column' AND `table_name`=p_table AND `component_name`=p_column
  ) THEN
    SELECT `prior_definition` INTO @prior_definition FROM `stock_opname_schema_ownership`
    WHERE `component_type`='column' AND `table_name`=p_table AND `component_name`=p_column;
    IF(@prior_definition IS NULL) THEN
      SET @ddl = IF(
        EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME=p_table AND COLUMN_NAME=p_column),
        CONCAT('ALTER TABLE `',p_table,'` DROP COLUMN `',p_column,'`'),
        'SELECT 1'
      );
    ELSE
      SET @ddl = IF(
        EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME=p_table AND COLUMN_NAME=p_column),
        CONCAT('ALTER TABLE `',p_table,'` MODIFY COLUMN `',p_column,'` ',@prior_definition),
        'SELECT 1'
      );
    END IF;
    PREPARE stock_opname_history_rollback FROM @ddl;
    EXECUTE stock_opname_history_rollback;
    DEALLOCATE PREPARE stock_opname_history_rollback;
    IF(@prior_definition IS NOT NULL) THEN
      SET @ddl = CONCAT(
        'UPDATE `',p_table,'` SET `',p_column,'`=NULL WHERE CAST(`id` AS CHAR) IN (',
        'SELECT `row_key` FROM `stock_opname_schema_value_backups` WHERE `table_name`=',QUOTE(p_table),
        ' AND `column_name`=',QUOTE(p_column),')'
      );
      PREPARE stock_opname_history_rollback FROM @ddl;
      EXECUTE stock_opname_history_rollback;
      DEALLOCATE PREPARE stock_opname_history_rollback;
    END IF;
    DELETE FROM `stock_opname_schema_value_backups`
    WHERE `table_name`=p_table AND `column_name`=p_column;
    DELETE FROM `stock_opname_schema_ownership`
    WHERE `component_type`='column' AND `table_name`=p_table AND `component_name`=p_column;
  END IF;
END//
DELIMITER ;

CALL `drop_owned_stock_opname_column`('stock_count_result_items','added_at');
CALL `drop_owned_stock_opname_column`('stock_count_result_items','added_by');
CALL `drop_owned_stock_opname_column`('stock_count_result_items','is_manual');
CALL `drop_owned_stock_opname_column`('stock_count_result_items','movement_out');
CALL `drop_owned_stock_opname_column`('stock_count_result_items','movement_in');
CALL `drop_owned_stock_opname_column`('stock_count_result_items','system_version');
CALL `drop_owned_stock_opname_column`('stock_count_orders','include_zero_unused');
CALL `drop_owned_stock_opname_column`('stock_count_orders','end_date');
DROP PROCEDURE `drop_owned_stock_opname_column`;

DELETE FROM app_schema_migrations WHERE migration_key IN ('schema_20260904_historical_stock_opname_v2','api_support_20260903_historical_stock_opname_v1');
SELECT RELEASE_LOCK('drac_inventory_schema_migration');
