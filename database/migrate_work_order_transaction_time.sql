ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS transaction_time TIME NOT NULL DEFAULT '00:00:00' AFTER date;

UPDATE work_orders
SET transaction_time = TIME(created_at)
WHERE transaction_time = '00:00:00' AND created_at IS NOT NULL;
