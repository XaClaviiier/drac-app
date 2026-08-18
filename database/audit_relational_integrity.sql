-- ==========================================================
-- AUDIT RELASI DATA PRODUKSI (READ ONLY)
-- Aman dijalankan dari phpMyAdmin: tidak mengubah data.
-- Nilai orphan_count harus 0. Baris detail di bagian kedua
-- menunjukkan data yang perlu diperbaiki bila nilainya bukan 0.
-- ==========================================================

SET NAMES utf8mb4;

SELECT 'work_orders.customer_ref_id -> customers' AS audit_name, COUNT(*) AS orphan_count
FROM work_orders w LEFT JOIN customers c ON c.id = w.customer_ref_id
WHERE w.customer_ref_id IS NOT NULL AND w.customer_ref_id <> '' AND c.id IS NULL
UNION ALL
SELECT 'work_orders.vehicle_ref_id -> vehicles', COUNT(*)
FROM work_orders w LEFT JOIN vehicles v ON v.id = w.vehicle_ref_id
WHERE w.vehicle_ref_id IS NOT NULL AND w.vehicle_ref_id <> '' AND v.id IS NULL
UNION ALL
SELECT 'work_orders.invoice_id -> sales_invoices', COUNT(*)
FROM work_orders w LEFT JOIN sales_invoices i ON i.id = w.invoice_id
WHERE w.invoice_id IS NOT NULL AND w.invoice_id <> '' AND i.id IS NULL
UNION ALL
SELECT 'sales_invoices.wo_id -> work_orders', COUNT(*)
FROM sales_invoices i LEFT JOIN work_orders w ON w.id = i.wo_id
WHERE i.wo_id IS NOT NULL AND i.wo_id <> '' AND w.id IS NULL
UNION ALL
SELECT 'work_order_services.wo_id -> work_orders', COUNT(*)
FROM work_order_services d LEFT JOIN work_orders w ON w.id = d.wo_id
WHERE w.id IS NULL
UNION ALL
SELECT 'sales_invoice_items.invoice_id -> sales_invoices', COUNT(*)
FROM sales_invoice_items d LEFT JOIN sales_invoices i ON i.id = d.invoice_id
WHERE i.id IS NULL
UNION ALL
SELECT 'customer_payments.invoice_id -> sales_invoices', COUNT(*)
FROM customer_payments p LEFT JOIN sales_invoices i ON i.id = p.invoice_id
WHERE i.id IS NULL
UNION ALL
SELECT 'goods_receipts.branch_id -> branches', COUNT(*)
FROM goods_receipts r LEFT JOIN branches b ON b.id = r.branch_id
WHERE b.id IS NULL
UNION ALL
SELECT 'goods_receipts.warehouse_id -> warehouses', COUNT(*)
FROM goods_receipts r LEFT JOIN warehouses w ON w.id = r.warehouse_id
WHERE r.warehouse_id IS NOT NULL AND r.warehouse_id <> '' AND w.id IS NULL
UNION ALL
SELECT 'goods_receipt_items.receipt_id -> goods_receipts', COUNT(*)
FROM goods_receipt_items d LEFT JOIN goods_receipts r ON r.id = d.receipt_id
WHERE r.id IS NULL
UNION ALL
SELECT 'warehouse_stocks.warehouse_id -> warehouses', COUNT(*)
FROM warehouse_stocks s LEFT JOIN warehouses w ON w.id = s.warehouse_id
WHERE w.id IS NULL
UNION ALL
SELECT 'warehouse_stocks.item_id -> items', COUNT(*)
FROM warehouse_stocks s LEFT JOIN items i ON i.id = s.item_id
WHERE i.id IS NULL
UNION ALL
SELECT 'stock_adjustment_items.adjustment_id -> stock_adjustments', COUNT(*)
FROM stock_adjustment_items d LEFT JOIN stock_adjustments h ON h.id = d.adjustment_id
WHERE h.id IS NULL
UNION ALL
SELECT 'stock_adjustment_items.item_id -> items', COUNT(*)
FROM stock_adjustment_items d LEFT JOIN items i ON i.id = d.item_id
WHERE i.id IS NULL
UNION ALL
SELECT 'stock_adjustment_items.warehouse_id -> warehouses', COUNT(*)
FROM stock_adjustment_items d LEFT JOIN warehouses w ON w.id = d.warehouse_id
WHERE w.id IS NULL;

-- Nomor dokumen yang seharusnya unik. Hasil kosong berarti sehat.
SELECT 'work_order' AS document_type, wo_number AS document_number, COUNT(*) AS duplicate_count
FROM work_orders GROUP BY wo_number HAVING COUNT(*) > 1
UNION ALL
SELECT 'sales_invoice', invoice_number, COUNT(*)
FROM sales_invoices GROUP BY invoice_number HAVING COUNT(*) > 1
UNION ALL
SELECT 'goods_receipt', receipt_number, COUNT(*)
FROM goods_receipts GROUP BY receipt_number HAVING COUNT(*) > 1
UNION ALL
SELECT 'stock_adjustment', adjustment_number, COUNT(*)
FROM stock_adjustments GROUP BY adjustment_number HAVING COUNT(*) > 1;

-- Master barang dan kendaraan yang berpotensi ganda.
SELECT 'item_code' AS duplicate_type, UPPER(TRIM(code)) AS duplicate_value, COUNT(*) AS duplicate_count
FROM items WHERE code IS NOT NULL AND TRIM(code) <> ''
GROUP BY UPPER(TRIM(code)) HAVING COUNT(*) > 1
UNION ALL
SELECT 'vehicle_plate', UPPER(REPLACE(REPLACE(TRIM(plate_number), ' ', ''), '-', '')), COUNT(*)
FROM vehicles WHERE plate_number IS NOT NULL AND TRIM(plate_number) <> ''
GROUP BY UPPER(REPLACE(REPLACE(TRIM(plate_number), ' ', ''), '-', '')) HAVING COUNT(*) > 1;

-- Ringkasan silang WO/faktur. Hasil selain 0 perlu diperiksa.
SELECT
  SUM(CASE WHEN w.invoice_id IS NOT NULL AND i.wo_id IS NOT NULL AND i.wo_id <> w.id THEN 1 ELSE 0 END) AS mismatched_wo_invoice,
  SUM(CASE WHEN w.status = 'Invoiced' AND i.id IS NULL THEN 1 ELSE 0 END) AS invoiced_without_invoice,
  SUM(CASE WHEN i.id IS NOT NULL AND (w.invoice_id IS NULL OR w.invoice_id <> i.id) THEN 1 ELSE 0 END) AS invoice_not_linked_back
FROM work_orders w
LEFT JOIN sales_invoices i ON i.wo_id = w.id;
