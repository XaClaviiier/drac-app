-- ==========================================================
-- DOKTER AC MOBIL - Database Schema
-- Untuk MySQL/MariaDB (cPanel)
-- Version: 1.0
-- ==========================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+07:00";

-- ==========================================================
-- 1. TABEL CABANG (BRANCHES)
-- ==========================================================
CREATE TABLE IF NOT EXISTS `branches` (
  `id` VARCHAR(20) NOT NULL,
  `code` VARCHAR(20) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `address` TEXT,
  `phone` VARCHAR(30),
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sample Data
INSERT INTO `branches` (`id`, `code`, `name`, `address`, `phone`, `is_active`) VALUES
('BR-001', 'CBG-001', 'CABANG PERINTIS', 'Jl. Perintis Kemerdekaan No. 45, Makassar', '0411-123456', 1),
('BR-002', 'CBG-002', 'CABANG CAKALANG', 'Jl. Cakalang No. 12, Makassar', '0411-234567', 1),
('BR-003', 'CBG-003', 'CABANG MAMUJU', 'Jl. Karampuang No. 8, Mamuju', '0426-345678', 1);

-- ==========================================================
-- 2. TABEL ROLES (GRUP AKSES)
-- ==========================================================
CREATE TABLE IF NOT EXISTS `roles` (
  `id` VARCHAR(20) NOT NULL,
  `code` VARCHAR(20) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT,
  `permissions` JSON,
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `roles` (`id`, `code`, `name`, `description`, `is_active`) VALUES
('1', 'ADM', 'Administrator', 'Akses penuh semua fitur & cabang', 1),
('2', 'SPV', 'Supervisor', 'Mengelola operasional & semua cabang', 1),
('3', 'KSR', 'Kasir', 'Melayani transaksi faktur', 1),
('4', 'TKN', 'Teknisi', 'Mengerjakan order kerja service AC', 1);

-- ==========================================================
-- 3. TABEL USERS (PENGGUNA)
-- ==========================================================
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(20) NOT NULL,
  `username` VARCHAR(50) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(100),
  `password` VARCHAR(255) NOT NULL,
  `role_id` VARCHAR(20) NOT NULL,
  `branch_id` VARCHAR(20) NOT NULL,
  `is_active` TINYINT(1) DEFAULT 1,
  `last_login` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`),
  FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Default users (password: admin123, kasir123, teknisi123, spv123)
-- CATATAN: Ini masih plain text, di Laravel nanti akan di-hash bcrypt
INSERT INTO `users` (`id`, `username`, `name`, `email`, `password`, `role_id`, `branch_id`, `is_active`) VALUES
('1', 'admin', 'ADMIN UTAMA', 'admin@dokterac.id', 'admin123', '1', 'BR-001', 1),
('2', 'kasir1', 'SITI KASIR', 'kasir1@dokterac.id', 'kasir123', '3', 'BR-001', 1),
('3', 'teknisi1', 'BUDI TEKNISI', 'teknisi1@dokterac.id', 'teknisi123', '4', 'BR-001', 1),
('4', 'spv1', 'AGUS SUPERVISOR', 'spv1@dokterac.id', 'spv123', '2', 'BR-002', 1),
('5', 'kasir2', 'RINA KASIR', 'kasir2@dokterac.id', 'kasir123', '3', 'BR-002', 1),
('6', 'teknisi2', 'DONI TEKNISI', 'teknisi2@dokterac.id', 'teknisi123', '4', 'BR-003', 1),
('7', 'kasir3', 'MAYA KASIR', 'kasir3@dokterac.id', 'kasir123', '3', 'BR-003', 1);

-- ==========================================================
-- 4. TABEL CUSTOMERS (PELANGGAN)
-- ==========================================================
CREATE TABLE IF NOT EXISTS `customers` (
  `id` VARCHAR(20) NOT NULL,
  `customer_code` VARCHAR(20) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(30),
  `email` VARCHAR(100),
  `address` TEXT,
  `branch_id` VARCHAR(20) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_code` (`customer_code`),
  KEY `idx_branch` (`branch_id`),
  FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==========================================================
-- 5. TABEL VEHICLES (KENDARAAN)
-- ==========================================================
CREATE TABLE IF NOT EXISTS `vehicles` (
  `id` VARCHAR(20) NOT NULL,
  `plate_number` VARCHAR(20) NOT NULL,
  `brand` VARCHAR(50),
  `model` VARCHAR(50),
  `year` INT,
  `color` VARCHAR(30),
  `customer_id` VARCHAR(20),
  `customer_name` VARCHAR(100),
  `customer_code` VARCHAR(20),
  `phone` VARCHAR(30),
  `address` TEXT,
  `registration_date` DATE,
  `notes` TEXT,
  `branch_id` VARCHAR(20) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_plate` (`plate_number`),
  KEY `idx_customer` (`customer_id`),
  KEY `idx_branch` (`branch_id`),
  FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==========================================================
-- 6. TABEL SUPPLIERS
-- ==========================================================
CREATE TABLE IF NOT EXISTS `suppliers` (
  `id` VARCHAR(20) NOT NULL,
  `code` VARCHAR(20) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `contact_person` VARCHAR(100),
  `phone` VARCHAR(30),
  `email` VARCHAR(100),
  `address` TEXT,
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==========================================================
-- 7. TABEL ITEM CATEGORIES (KATEGORI BARANG)
-- ==========================================================
CREATE TABLE IF NOT EXISTS `item_categories` (
  `id` VARCHAR(20) NOT NULL,
  `code` VARCHAR(20) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `type` ENUM('Semua', 'Persediaan', 'Jasa', 'Non Persediaan', 'Group') DEFAULT 'Semua',
  `description` TEXT,
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  UNIQUE KEY `unique_category_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `item_categories` (`id`, `code`, `name`, `type`, `description`, `is_active`) VALUES
('1', 'KAT-001', 'Sparepart AC', 'Persediaan', 'Komponen utama sistem AC mobil', 1),
('2', 'KAT-002', 'Chemical & Freon', 'Persediaan', 'Freon, cleaner, coolant', 1),
('3', 'KAT-003', 'Jasa Service AC', 'Jasa', 'Jasa teknisi & perawatan AC', 1),
('4', 'KAT-004', 'Tools Bengkel', 'Non Persediaan', 'Alat bengkel operasional', 1);

-- ==========================================================
-- 8. TABEL ITEMS (BARANG & JASA)
-- ==========================================================
CREATE TABLE IF NOT EXISTS `items` (
  `id` VARCHAR(20) NOT NULL,
  `code` VARCHAR(30) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `category_id` VARCHAR(20),
  `category_name` VARCHAR(100),
  `type` ENUM('Persediaan', 'Jasa', 'Non Persediaan', 'Group') NOT NULL,
  `brand` VARCHAR(50),
  `unit` VARCHAR(20),
  `stock` INT DEFAULT 0,
  `sellable_stock` INT DEFAULT 0,
  `purchase_price` DECIMAL(15,2) DEFAULT 0,
  `selling_price` DECIMAL(15,2) DEFAULT 0,
  `is_active` TINYINT(1) DEFAULT 1,
  `is_quick_service` TINYINT(1) DEFAULT 0,
  `description` TEXT,
  `receipt_description` VARCHAR(255),
  `barcode` VARCHAR(100) NULL,
  `branch_id` VARCHAR(20),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  UNIQUE KEY `uq_items_barcode` (`barcode`),
  KEY `idx_type` (`type`),
  KEY `idx_branch` (`branch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==========================================================
-- 9. TABEL GROUP MEMBERS (ISI PAKET)
-- ==========================================================
CREATE TABLE IF NOT EXISTS `item_group_members` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `group_item_id` VARCHAR(20) NOT NULL,
  `member_item_id` VARCHAR(20) NOT NULL,
  `member_code` VARCHAR(30),
  `member_name` VARCHAR(200),
  `member_type` VARCHAR(30),
  `qty` INT DEFAULT 1,
  `unit_price` DECIMAL(15,2) DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_group` (`group_item_id`),
  FOREIGN KEY (`group_item_id`) REFERENCES `items`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==========================================================
-- 10. TABEL WORK ORDERS (ORDER KERJA)
-- ==========================================================
CREATE TABLE IF NOT EXISTS `work_orders` (
  `id` VARCHAR(20) NOT NULL,
  `wo_number` VARCHAR(30) NOT NULL,
  `date` DATE NOT NULL,
  `customer_ref_id` VARCHAR(20),
  `customer_id` VARCHAR(50),
  `customer_name` VARCHAR(100),
  `vehicle_ref_id` VARCHAR(20),
  `plate_number` VARCHAR(20),
  `vehicle_info` VARCHAR(200),
  `description` TEXT,
  `findings` TEXT,
  `total` DECIMAL(15,2) DEFAULT 0,
  `estimate_total` DECIMAL(15,2) DEFAULT NULL,
  `approved_at` DATE DEFAULT NULL,
  `status` ENUM('Pengecekan', 'Proses', 'Selesai', 'Dibayar', 'Batal') DEFAULT 'Pengecekan',
  `notes` TEXT,
  `invoice_id` VARCHAR(20),
  `invoice_number` VARCHAR(30),
  `branch_id` VARCHAR(20) NOT NULL,
  `continued_from_wo_id` VARCHAR(20) DEFAULT NULL,
  `continued_from_wo_number` VARCHAR(30) DEFAULT NULL,
  `continued_from_branch_name` VARCHAR(100) DEFAULT NULL,
  `continued_to_wo_id` VARCHAR(20) DEFAULT NULL,
  `continued_to_wo_number` VARCHAR(30) DEFAULT NULL,
  `continued_to_branch_name` VARCHAR(100) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `wo_number` (`wo_number`),
  KEY `idx_status` (`status`),
  KEY `idx_branch` (`branch_id`),
  FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==========================================================
-- 11. TABEL WO SERVICES (RINCIAN LAYANAN WO)
-- ==========================================================
CREATE TABLE IF NOT EXISTS `work_order_services` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `wo_id` VARCHAR(20) NOT NULL,
  `item_id` VARCHAR(20),
  `code` VARCHAR(30),
  `name` VARCHAR(200) NOT NULL,
  `description` TEXT,
  `price` DECIMAL(15,2) DEFAULT 0,
  `qty` INT DEFAULT 1,
  `subtotal` DECIMAL(15,2) DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_wo` (`wo_id`),
  FOREIGN KEY (`wo_id`) REFERENCES `work_orders`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==========================================================
-- 12. TABEL SALES INVOICES (FAKTUR PENJUALAN)
-- ==========================================================
CREATE TABLE IF NOT EXISTS `sales_invoices` (
  `id` VARCHAR(20) NOT NULL,
  `invoice_number` VARCHAR(30) NOT NULL,
  `date` DATE NOT NULL,
  `customer_ref_id` VARCHAR(20),
  `customer_id` VARCHAR(50),
  `customer_name` VARCHAR(100),
  `vehicle_info` VARCHAR(200),
  `description` TEXT,
  `total` DECIMAL(15,2) DEFAULT 0,
  `payment` DECIMAL(15,2) DEFAULT 0,
  `payment_method` VARCHAR(30) NOT NULL DEFAULT 'Tunai',
  `status` ENUM('Lunas', 'Belum Lunas') DEFAULT 'Belum Lunas',
  `age` INT DEFAULT 0,
  `wo_id` VARCHAR(20),
  `wo_number` VARCHAR(30),
  `branch_id` VARCHAR(20) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `invoice_number` (`invoice_number`),
  KEY `idx_status` (`status`),
  KEY `idx_branch` (`branch_id`),
  KEY `idx_date` (`date`),
  FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==========================================================
-- 13. TABEL SALES INVOICE ITEMS
-- ==========================================================
CREATE TABLE IF NOT EXISTS `sales_invoice_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `invoice_id` VARCHAR(20) NOT NULL,
  `item_id` VARCHAR(20),
  `code` VARCHAR(30),
  `name` VARCHAR(200),
  `description` TEXT,
  `price` DECIMAL(15,2) DEFAULT 0,
  `qty` INT DEFAULT 1,
  `subtotal` DECIMAL(15,2) DEFAULT 0,
  KEY `idx_invoice` (`invoice_id`),
  FOREIGN KEY (`invoice_id`) REFERENCES `sales_invoices`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==========================================================
-- 14. TABEL GOODS RECEIPTS (PENERIMAAN BARANG)
-- ==========================================================
CREATE TABLE IF NOT EXISTS `goods_receipts` (
  `id` VARCHAR(20) NOT NULL,
  `receipt_number` VARCHAR(30) NOT NULL,
  `date` DATE NOT NULL,
  `supplier_id` VARCHAR(20),
  `supplier_name` VARCHAR(100),
  `do_number` VARCHAR(50),
  `status` ENUM('Draft', 'Diterima', 'Difakturkan', 'Sebagian', 'Batal') DEFAULT 'Draft',
  `notes` TEXT,
  `branch_id` VARCHAR(20) NOT NULL,
  `received_by` VARCHAR(100),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `receipt_number` (`receipt_number`),
  KEY `idx_status` (`status`),
  KEY `idx_branch` (`branch_id`),
  FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`),
  FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==========================================================
-- 15. TABEL GOODS RECEIPT ITEMS
-- ==========================================================
CREATE TABLE IF NOT EXISTS `goods_receipt_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `receipt_id` VARCHAR(20) NOT NULL,
  `item_id` VARCHAR(20) NOT NULL,
  `item_code` VARCHAR(30),
  `item_name` VARCHAR(200),
  `qty` INT DEFAULT 0,
  `unit` VARCHAR(20),
  `qty_invoiced` INT DEFAULT 0,
  KEY `idx_receipt` (`receipt_id`),
  KEY `idx_item` (`item_id`),
  FOREIGN KEY (`receipt_id`) REFERENCES `goods_receipts`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==========================================================
-- 16. TABEL PURCHASE INVOICES (FAKTUR PEMBELIAN)
-- ==========================================================
CREATE TABLE IF NOT EXISTS `purchase_invoices` (
  `id` VARCHAR(20) NOT NULL,
  `invoice_number` VARCHAR(30) NOT NULL,
  `date` DATE NOT NULL,
  `due_date` DATE,
  `supplier_id` VARCHAR(20),
  `supplier_name` VARCHAR(100),
  `supplier_invoice_number` VARCHAR(100),
  `subtotal` DECIMAL(15,2) DEFAULT 0,
  `discount` DECIMAL(15,2) DEFAULT 0,
  `tax` DECIMAL(15,2) DEFAULT 0,
  `total` DECIMAL(15,2) DEFAULT 0,
  `paid_amount` DECIMAL(15,2) DEFAULT 0,
  `status` ENUM('Belum Lunas', 'Sebagian', 'Lunas', 'Batal') DEFAULT 'Belum Lunas',
  `notes` TEXT,
  `branch_id` VARCHAR(20) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `invoice_number` (`invoice_number`),
  KEY `idx_status` (`status`),
  KEY `idx_branch` (`branch_id`),
  FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`),
  FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==========================================================
-- 17. TABEL PURCHASE INVOICE ITEMS
-- ==========================================================
CREATE TABLE IF NOT EXISTS `purchase_invoice_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `invoice_id` VARCHAR(20) NOT NULL,
  `receipt_id` VARCHAR(20),
  `receipt_number` VARCHAR(30),
  `item_id` VARCHAR(20),
  `item_code` VARCHAR(30),
  `item_name` VARCHAR(200),
  `qty` INT DEFAULT 0,
  `unit` VARCHAR(20),
  `unit_price` DECIMAL(15,2) DEFAULT 0,
  `discount` DECIMAL(15,2) DEFAULT 0,
  `subtotal` DECIMAL(15,2) DEFAULT 0,
  KEY `idx_invoice` (`invoice_id`),
  FOREIGN KEY (`invoice_id`) REFERENCES `purchase_invoices`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==========================================================
-- 18. TABEL PURCHASE PAYMENTS (PEMBAYARAN HUTANG)
-- ==========================================================
CREATE TABLE IF NOT EXISTS `purchase_payments` (
  `id` VARCHAR(20) NOT NULL,
  `payment_number` VARCHAR(30) NOT NULL,
  `invoice_id` VARCHAR(20) NOT NULL,
  `date` DATE NOT NULL,
  `amount` DECIMAL(15,2) DEFAULT 0,
  `payment_method` ENUM('Kas', 'Transfer Bank', 'Cek', 'Lainnya') DEFAULT 'Kas',
  `bank_account` VARCHAR(100),
  `notes` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_invoice` (`invoice_id`),
  FOREIGN KEY (`invoice_id`) REFERENCES `purchase_invoices`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==========================================================
-- SELESAI
-- ==========================================================
-- Total: 18 tabel
-- Cek dengan: SHOW TABLES;
