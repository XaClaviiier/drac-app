-- Migrasi alur WO: Pengecekan -> Proses -> Selesai -> Dibayar
-- Jalankan sekali melalui phpMyAdmin untuk database lama.

ALTER TABLE `work_orders`
  MODIFY COLUMN `status` ENUM('Draft','Pengecekan','Proses','Selesai','Dibayar','Batal') NOT NULL DEFAULT 'Pengecekan';

UPDATE `work_orders` SET `status` = 'Pengecekan' WHERE `status` = 'Draft';

ALTER TABLE `work_orders`
  MODIFY COLUMN `status` ENUM('Pengecekan','Proses','Selesai','Dibayar','Batal') NOT NULL DEFAULT 'Pengecekan',
  ADD COLUMN IF NOT EXISTS `findings` TEXT NULL AFTER `description`,
  ADD COLUMN IF NOT EXISTS `estimate_total` DECIMAL(15,2) NULL AFTER `total`,
  ADD COLUMN IF NOT EXISTS `approved_at` DATE NULL AFTER `estimate_total`,
  ADD COLUMN IF NOT EXISTS `continued_from_wo_id` VARCHAR(20) NULL AFTER `branch_id`,
  ADD COLUMN IF NOT EXISTS `continued_from_wo_number` VARCHAR(30) NULL AFTER `continued_from_wo_id`,
  ADD COLUMN IF NOT EXISTS `continued_from_branch_name` VARCHAR(100) NULL AFTER `continued_from_wo_number`,
  ADD COLUMN IF NOT EXISTS `continued_to_wo_id` VARCHAR(20) NULL AFTER `continued_from_branch_name`,
  ADD COLUMN IF NOT EXISTS `continued_to_wo_number` VARCHAR(30) NULL AFTER `continued_to_wo_id`,
  ADD COLUMN IF NOT EXISTS `continued_to_branch_name` VARCHAR(100) NULL AFTER `continued_to_wo_number`;

-- Nama kategori juga wajib unik.
ALTER TABLE `item_categories`
  ADD UNIQUE KEY `unique_category_name` (`name`);
