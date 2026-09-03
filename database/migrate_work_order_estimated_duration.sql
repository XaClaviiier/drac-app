-- Estimasi operasional WO: durasi rencana, waktu mulai, dan target selesai.
-- Kompatibel MySQL 5.7 dan aman dijalankan ulang.
SET @schema_name = DATABASE();

SET @ddl = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name
      AND TABLE_NAME = 'work_orders'
      AND COLUMN_NAME = 'estimated_duration_minutes'
  ),
  'SELECT 1',
  'ALTER TABLE `work_orders` ADD COLUMN `estimated_duration_minutes` SMALLINT UNSIGNED NULL AFTER `estimate_total`'
);
PREPARE wo_estimate_migration FROM @ddl;
EXECUTE wo_estimate_migration;
DEALLOCATE PREPARE wo_estimate_migration;

SET @ddl = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name
      AND TABLE_NAME = 'work_orders'
      AND COLUMN_NAME = 'work_started_at'
  ),
  'SELECT 1',
  'ALTER TABLE `work_orders` ADD COLUMN `work_started_at` DATETIME NULL AFTER `estimated_duration_minutes`'
);
PREPARE wo_estimate_migration FROM @ddl;
EXECUTE wo_estimate_migration;
DEALLOCATE PREPARE wo_estimate_migration;

SET @ddl = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name
      AND TABLE_NAME = 'work_orders'
      AND COLUMN_NAME = 'estimated_completion_at'
  ),
  'SELECT 1',
  'ALTER TABLE `work_orders` ADD COLUMN `estimated_completion_at` DATETIME NULL AFTER `work_started_at`'
);
PREPARE wo_estimate_migration FROM @ddl;
EXECUTE wo_estimate_migration;
DEALLOCATE PREPARE wo_estimate_migration;
