-- ==========================================================
-- DOKTER AC MOBIL - Migration: Update Kolom Baru
-- Jalankan di phpMyAdmin setelah schema awal sudah diimport
-- ==========================================================

SET NAMES utf8mb4;

-- ----------------------------------------------------------
-- 1. customers: tambah first_seen_branch_id
-- ----------------------------------------------------------
ALTER TABLE `customers`
  ADD COLUMN IF NOT EXISTS `first_seen_branch_id` VARCHAR(20) NULL AFTER `branch_id`;

-- Isi data lama: first_seen = branch_id jika belum ada
UPDATE `customers` SET `first_seen_branch_id` = `branch_id`
  WHERE `first_seen_branch_id` IS NULL;

-- ----------------------------------------------------------
-- 2. vehicles: tambah first_seen_branch_id
-- ----------------------------------------------------------
ALTER TABLE `vehicles`
  ADD COLUMN IF NOT EXISTS `first_seen_branch_id` VARCHAR(20) NULL AFTER `branch_id`;

UPDATE `vehicles` SET `first_seen_branch_id` = `branch_id`
  WHERE `first_seen_branch_id` IS NULL;

-- ----------------------------------------------------------
-- 3. work_orders: tambah kolom baru
--    - status diperluas (Batal)
--    - findings, estimate_total, approved_at
--    - status_log (JSON)
--    - cancel_reason
--    - lintas cabang: continued_from/to
-- ----------------------------------------------------------

-- Ubah ENUM status agar support 'Batal'
ALTER TABLE `work_orders`
  MODIFY COLUMN `status` ENUM('Pengecekan','Proses','Selesai','Dibayar','Batal') DEFAULT 'Pengecekan';

-- Kolom temuan teknisi
ALTER TABLE `work_orders`
  ADD COLUMN IF NOT EXISTS `findings` TEXT NULL AFTER `description`;

-- Estimasi awal (dikunci saat masuk Proses)
ALTER TABLE `work_orders`
  ADD COLUMN IF NOT EXISTS `estimate_total` DECIMAL(15,2) NULL AFTER `total`;

-- Tanggal pelanggan setuju
ALTER TABLE `work_orders`
  ADD COLUMN IF NOT EXISTS `approved_at` DATE NULL AFTER `estimate_total`;

-- Jejak audit perubahan status (JSON array)
ALTER TABLE `work_orders`
  ADD COLUMN IF NOT EXISTS `status_log` JSON NULL AFTER `approved_at`;

-- Alasan pembatalan
ALTER TABLE `work_orders`
  ADD COLUMN IF NOT EXISTS `cancel_reason` TEXT NULL AFTER `status_log`;

-- Lintas cabang (lanjutan dari WO di cabang lain)
ALTER TABLE `work_orders`
  ADD COLUMN IF NOT EXISTS `continued_from_wo_id`     VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS `continued_from_wo_number` VARCHAR(30) NULL,
  ADD COLUMN IF NOT EXISTS `continued_from_branch_name` VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS `continued_to_wo_id`       VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS `continued_to_wo_number`   VARCHAR(30) NULL,
  ADD COLUMN IF NOT EXISTS `continued_to_branch_name` VARCHAR(100) NULL;

-- ----------------------------------------------------------
-- 4. items: tambah is_quick_service jika belum ada
-- ----------------------------------------------------------
ALTER TABLE `items`
  ADD COLUMN IF NOT EXISTS `is_quick_service` TINYINT(1) DEFAULT 0 AFTER `is_active`;

ALTER TABLE `items`
  ADD COLUMN IF NOT EXISTS `receipt_description` VARCHAR(255) NULL AFTER `description`,
  ADD COLUMN IF NOT EXISTS `barcode` VARCHAR(100) NULL AFTER `receipt_description`;

ALTER TABLE `items`
  ADD UNIQUE INDEX IF NOT EXISTS `uq_items_barcode` (`barcode`);

-- ----------------------------------------------------------
-- 5. sales_invoices: tambah wo_id, wo_number jika belum ada
-- ----------------------------------------------------------
ALTER TABLE `sales_invoices`
  ADD COLUMN IF NOT EXISTS `wo_id`     VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS `wo_number` VARCHAR(30) NULL;

-- ----------------------------------------------------------
-- 6. Verifikasi
-- ----------------------------------------------------------
-- Jalankan ini untuk cek hasilnya:
-- SHOW COLUMNS FROM customers;
-- SHOW COLUMNS FROM vehicles;
-- SHOW COLUMNS FROM work_orders;
-- SHOW COLUMNS FROM items;
-- SHOW COLUMNS FROM sales_invoices;

SELECT 'Migration selesai!' AS status;
