-- Jalankan hanya bila bootstrap API tidak dapat melakukan ALTER otomatis.
-- Backup database produksi sebelum migrasi.
ALTER TABLE work_orders
  MODIFY COLUMN updated_at TIMESTAMP(6) NOT NULL
  DEFAULT CURRENT_TIMESTAMP(6)
  ON UPDATE CURRENT_TIMESTAMP(6);
