-- Pending berlaku 10 hari. Status final WO yang tidak dilanjutkan adalah Closed.
ALTER TABLE work_orders
  MODIFY COLUMN status ENUM('Pengecekan','Pending','Proses','Selesai','Invoiced','Batal','Closed')
  NOT NULL DEFAULT 'Pengecekan';

UPDATE work_orders SET status='Closed' WHERE status='Batal';
UPDATE work_orders
SET pending_until=DATE_ADD(pending_at, INTERVAL 10 DAY)
WHERE status='Pending' AND pending_at IS NOT NULL
  AND (pending_until IS NULL OR pending_until > DATE_ADD(pending_at, INTERVAL 10 DAY));
UPDATE work_orders
SET status='Closed', cancel_reason=COALESCE(NULLIF(cancel_reason,''), 'Tidak ada keputusan selama 10 hari')
WHERE status='Pending' AND pending_until IS NOT NULL AND pending_until <= NOW();

ALTER TABLE work_orders
  MODIFY COLUMN status ENUM('Pengecekan','Pending','Proses','Selesai','Invoiced','Closed')
  NOT NULL DEFAULT 'Pengecekan';
