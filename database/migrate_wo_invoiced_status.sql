-- Pisahkan status dokumen WO dari status pembayaran faktur.
ALTER TABLE work_orders
  MODIFY COLUMN status ENUM('Pengecekan','Pending','Proses','Selesai','Dibayar','Invoiced','Batal')
  NOT NULL DEFAULT 'Pengecekan';

UPDATE work_orders SET status = 'Invoiced' WHERE status = 'Dibayar';

ALTER TABLE work_orders
  MODIFY COLUMN status ENUM('Pengecekan','Pending','Proses','Selesai','Invoiced','Batal')
  NOT NULL DEFAULT 'Pengecekan';
