-- ==========================================================
-- Konsolidasi relasi, stok multi-cabang, dan nomor dokumen
-- Jalankan SETELAH dokterac_schema.sql, migrate_updates.sql,
-- migrate_wo_workflow.sql, dan migrate_settings.sql.
-- Backup database sebelum menjalankan file ini.
-- ==========================================================

SET NAMES utf8mb4;

-- Status WO final yang digunakan aplikasi.
ALTER TABLE `work_orders`
  MODIFY COLUMN `status`
  ENUM('Pengecekan','Proses','Selesai','Dibayar','Batal')
  NOT NULL DEFAULT 'Pengecekan';

-- Sequence atomik untuk nomor dokumen per cabang dan tanggal.
CREATE TABLE IF NOT EXISTS `document_sequences` (
  `document_type` ENUM('work_order','sales_invoice') NOT NULL,
  `branch_id` VARCHAR(20) NOT NULL,
  `sequence_date` DATE NOT NULL,
  `last_sequence` INT UNSIGNED NOT NULL DEFAULT 0,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`document_type`, `branch_id`, `sequence_date`),
  CONSTRAINT `fk_sequence_branch`
    FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Stok dipisahkan per cabang; items tetap menjadi master barang.
CREATE TABLE IF NOT EXISTS `branch_item_stocks` (
  `branch_id` VARCHAR(20) NOT NULL,
  `item_id` VARCHAR(20) NOT NULL,
  `stock` INT NOT NULL DEFAULT 0,
  `sellable_stock` INT NOT NULL DEFAULT 0,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`branch_id`, `item_id`),
  CONSTRAINT `fk_branch_stock_branch`
    FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_branch_stock_item`
    FOREIGN KEY (`item_id`) REFERENCES `items` (`id`)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Migrasi stok lama ke cabang asal item tanpa menimpa data yang sudah ada.
INSERT IGNORE INTO `branch_item_stocks` (`branch_id`, `item_id`, `stock`, `sellable_stock`)
SELECT `branch_id`, `id`, GREATEST(0, `stock`), GREATEST(0, `sellable_stock`)
FROM `items`
WHERE `branch_id` IS NOT NULL;

-- Bersihkan referensi nullable yang sudah yatim sebelum FK ditambahkan.
UPDATE `vehicles` SET `customer_id` = NULL WHERE `customer_id` = '';
UPDATE `customers` SET `first_seen_branch_id` = NULL WHERE `first_seen_branch_id` = '';
UPDATE `vehicles` SET `first_seen_branch_id` = NULL WHERE `first_seen_branch_id` = '';
UPDATE `items` SET `category_id` = NULL WHERE `category_id` = '';
UPDATE `work_orders`
SET `customer_ref_id` = NULLIF(`customer_ref_id`, ''),
    `vehicle_ref_id` = NULLIF(`vehicle_ref_id`, ''),
    `invoice_id` = NULLIF(`invoice_id`, ''),
    `continued_from_wo_id` = NULLIF(`continued_from_wo_id`, ''),
    `continued_to_wo_id` = NULLIF(`continued_to_wo_id`, '');
UPDATE `sales_invoices`
SET `customer_ref_id` = NULLIF(`customer_ref_id`, ''),
    `wo_id` = NULLIF(`wo_id`, '');
UPDATE `work_order_services` SET `item_id` = NULL WHERE `item_id` = '';
UPDATE `sales_invoice_items` SET `item_id` = NULL WHERE `item_id` = '';
UPDATE `purchase_invoice_items`
SET `receipt_id` = NULLIF(`receipt_id`, ''),
    `item_id` = NULLIF(`item_id`, '');

UPDATE `vehicles` v
LEFT JOIN `customers` c ON c.id = v.customer_id
SET v.customer_id = NULL
WHERE v.customer_id IS NOT NULL AND v.customer_id <> '' AND c.id IS NULL;

UPDATE `customers` c
LEFT JOIN `branches` b ON b.id = c.first_seen_branch_id
SET c.first_seen_branch_id = NULL
WHERE c.first_seen_branch_id IS NOT NULL AND b.id IS NULL;

UPDATE `vehicles` v
LEFT JOIN `branches` b ON b.id = v.first_seen_branch_id
SET v.first_seen_branch_id = NULL
WHERE v.first_seen_branch_id IS NOT NULL AND b.id IS NULL;

UPDATE `items` i
LEFT JOIN `item_categories` c ON c.id = i.category_id
SET i.category_id = NULL
WHERE i.category_id IS NOT NULL AND i.category_id <> '' AND c.id IS NULL;

UPDATE `work_orders` w
LEFT JOIN `customers` c ON c.id = w.customer_ref_id
SET w.customer_ref_id = NULL
WHERE w.customer_ref_id IS NOT NULL AND w.customer_ref_id <> '' AND c.id IS NULL;

UPDATE `work_orders` w
LEFT JOIN `vehicles` v ON v.id = w.vehicle_ref_id
SET w.vehicle_ref_id = NULL
WHERE w.vehicle_ref_id IS NOT NULL AND w.vehicle_ref_id <> '' AND v.id IS NULL;

UPDATE `work_orders` w
LEFT JOIN `sales_invoices` s ON s.id = w.invoice_id
SET w.invoice_id = NULL
WHERE w.invoice_id IS NOT NULL AND s.id IS NULL;

UPDATE `work_orders` w
LEFT JOIN `work_orders` source ON source.id = w.continued_from_wo_id
SET w.continued_from_wo_id = NULL
WHERE w.continued_from_wo_id IS NOT NULL AND source.id IS NULL;

UPDATE `work_orders` w
LEFT JOIN `work_orders` target ON target.id = w.continued_to_wo_id
SET w.continued_to_wo_id = NULL
WHERE w.continued_to_wo_id IS NOT NULL AND target.id IS NULL;

UPDATE `sales_invoices` s
LEFT JOIN `customers` c ON c.id = s.customer_ref_id
SET s.customer_ref_id = NULL
WHERE s.customer_ref_id IS NOT NULL AND s.customer_ref_id <> '' AND c.id IS NULL;

UPDATE `sales_invoices` s
LEFT JOIN `work_orders` w ON w.id = s.wo_id
SET s.wo_id = NULL
WHERE s.wo_id IS NOT NULL AND s.wo_id <> '' AND w.id IS NULL;

UPDATE `work_order_services` d
LEFT JOIN `items` i ON i.id = d.item_id
SET d.item_id = NULL
WHERE d.item_id IS NOT NULL AND i.id IS NULL;

UPDATE `sales_invoice_items` d
LEFT JOIN `items` i ON i.id = d.item_id
SET d.item_id = NULL
WHERE d.item_id IS NOT NULL AND i.id IS NULL;

UPDATE `purchase_invoice_items` d
LEFT JOIN `items` i ON i.id = d.item_id
SET d.item_id = NULL
WHERE d.item_id IS NOT NULL AND i.id IS NULL;

UPDATE `purchase_invoice_items` d
LEFT JOIN `goods_receipts` r ON r.id = d.receipt_id
SET d.receipt_id = NULL
WHERE d.receipt_id IS NOT NULL AND r.id IS NULL;

DELETE gm FROM `item_group_members` gm
LEFT JOIN `items` i ON i.id = gm.member_item_id
WHERE i.id IS NULL;

ALTER TABLE `goods_receipt_items`
  MODIFY COLUMN `item_id` VARCHAR(20) NULL;

UPDATE `goods_receipt_items` d
LEFT JOIN `items` i ON i.id = d.item_id
SET d.item_id = NULL
WHERE d.item_id IS NOT NULL AND i.id IS NULL;

-- Tambahkan FK utama yang sebelumnya hanya berupa ID teks.
ALTER TABLE `vehicles`
  ADD CONSTRAINT `fk_vehicle_customer`
    FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`)
    ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE `customers`
  ADD CONSTRAINT `fk_customer_first_branch`
    FOREIGN KEY (`first_seen_branch_id`) REFERENCES `branches` (`id`)
    ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE `vehicles`
  ADD CONSTRAINT `fk_vehicle_first_branch`
    FOREIGN KEY (`first_seen_branch_id`) REFERENCES `branches` (`id`)
    ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE `items`
  ADD CONSTRAINT `fk_item_category`
    FOREIGN KEY (`category_id`) REFERENCES `item_categories` (`id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  ADD CONSTRAINT `fk_item_branch`
    FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE `item_group_members`
  ADD CONSTRAINT `fk_group_member_item`
    FOREIGN KEY (`member_item_id`) REFERENCES `items` (`id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD UNIQUE KEY `uq_group_member` (`group_item_id`, `member_item_id`);

ALTER TABLE `work_orders`
  ADD CONSTRAINT `fk_wo_customer`
    FOREIGN KEY (`customer_ref_id`) REFERENCES `customers` (`id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  ADD CONSTRAINT `fk_wo_vehicle`
    FOREIGN KEY (`vehicle_ref_id`) REFERENCES `vehicles` (`id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  ADD CONSTRAINT `fk_wo_continued_from`
    FOREIGN KEY (`continued_from_wo_id`) REFERENCES `work_orders` (`id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  ADD CONSTRAINT `fk_wo_continued_to`
    FOREIGN KEY (`continued_to_wo_id`) REFERENCES `work_orders` (`id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  ADD CONSTRAINT `fk_wo_invoice`
    FOREIGN KEY (`invoice_id`) REFERENCES `sales_invoices` (`id`)
    ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE `work_order_services`
  ADD CONSTRAINT `fk_wo_service_item`
    FOREIGN KEY (`item_id`) REFERENCES `items` (`id`)
    ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE `sales_invoices`
  ADD CONSTRAINT `fk_sales_customer`
    FOREIGN KEY (`customer_ref_id`) REFERENCES `customers` (`id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  ADD CONSTRAINT `fk_sales_wo`
    FOREIGN KEY (`wo_id`) REFERENCES `work_orders` (`id`)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE `sales_invoice_items`
  ADD CONSTRAINT `fk_sales_item`
    FOREIGN KEY (`item_id`) REFERENCES `items` (`id`)
    ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE `goods_receipt_items`
  ADD CONSTRAINT `fk_receipt_item`
    FOREIGN KEY (`item_id`) REFERENCES `items` (`id`)
    ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE `purchase_invoice_items`
  ADD CONSTRAINT `fk_purchase_receipt`
    FOREIGN KEY (`receipt_id`) REFERENCES `goods_receipts` (`id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT `fk_purchase_item`
    FOREIGN KEY (`item_id`) REFERENCES `items` (`id`)
    ON UPDATE CASCADE ON DELETE RESTRICT;

-- Indeks untuk query operasional per cabang dan tanggal.
CREATE INDEX `idx_wo_branch_date` ON `work_orders` (`branch_id`, `date`);
CREATE INDEX `idx_sales_branch_date` ON `sales_invoices` (`branch_id`, `date`);
CREATE INDEX `idx_receipt_branch_date` ON `goods_receipts` (`branch_id`, `date`);
CREATE INDEX `idx_purchase_branch_date` ON `purchase_invoices` (`branch_id`, `date`);

SELECT 'Migrasi integritas relasi selesai' AS status;
