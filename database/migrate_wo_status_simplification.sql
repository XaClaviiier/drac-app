-- Normalisasi permanen alur WO: Register -> Proses -> Selesai, atau Closed.
-- Invoice dan pembayaran tidak lagi menjadi status WO.
ALTER TABLE work_orders
  MODIFY COLUMN status ENUM(
    'Register','Pengecekan','Pending','Proses','Selesai',
    'Dibayar','Invoiced','Batal','Closed'
  ) NOT NULL DEFAULT 'Register';

UPDATE work_orders SET status='Register' WHERE status IN ('Pengecekan','Pending');
UPDATE work_orders SET status='Selesai' WHERE status IN ('Dibayar','Invoiced');
UPDATE work_orders SET status='Closed' WHERE status='Batal';
UPDATE work_orders
SET status='Register', approved_at=NULL, approved_services_json=NULL, estimate_total=0
WHERE invoice_id IS NULL AND total<=0 AND status IN ('Proses','Selesai');

ALTER TABLE work_orders
  MODIFY COLUMN status ENUM('Register','Proses','Selesai','Closed')
  NOT NULL DEFAULT 'Register';
