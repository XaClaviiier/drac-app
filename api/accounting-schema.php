<?php
// Additive, resumable runtime migration. No historic recognition or balance backfill.
function ensureAccountingSchema(PDO $pdo): void {
    $key='accounting_journal_v1';
    $q=$pdo->prepare('SELECT 1 FROM app_schema_migrations WHERE migration_key=?');$q->execute([$key]);if($q->fetchColumn())return;
    $pdo->exec("CREATE TABLE IF NOT EXISTS journal_entries (
        id VARCHAR(64) PRIMARY KEY, branch_id VARCHAR(64) NOT NULL, date DATE NOT NULL,
        description VARCHAR(255) NOT NULL, source_type VARCHAR(32) NOT NULL, source_id VARCHAR(64) NULL,
        created_by VARCHAR(64) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY journal_source(source_type,source_id), INDEX journal_branch_date(branch_id,date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS journal_lines (
        journal_id VARCHAR(64) NOT NULL, line_number INT NOT NULL, account_id VARCHAR(64) NOT NULL,
        account_code VARCHAR(64) NOT NULL, account_name VARCHAR(255) NOT NULL,
        debit DECIMAL(15,2) NOT NULL DEFAULT 0, credit DECIMAL(15,2) NOT NULL DEFAULT 0,
        PRIMARY KEY(journal_id,line_number), INDEX journal_account(account_id),
        FOREIGN KEY(journal_id) REFERENCES journal_entries(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $q=$pdo->query("SHOW COLUMNS FROM sales_invoices LIKE 'accounting_eligible'");
    if(!$q->fetch())$pdo->exec('ALTER TABLE sales_invoices ADD COLUMN accounting_eligible TINYINT(1) NOT NULL DEFAULT 0');
    // These database guards also protect maintenance/import/helper shortcuts.
    $triggers=[];
    foreach(['sales_invoice_items','customer_payments'] as $table){
        $source=$table==='customer_payments'?"(source_type='customer_payment' AND source_id=OLD.id) OR (source_type='sales_invoice' AND source_id=OLD.invoice_id)":"source_type='sales_invoice' AND source_id=OLD.invoice_id";
        foreach(['UPDATE','DELETE'] as $event)$triggers['journal_guard_'.$table.'_'.strtolower($event)]="BEFORE $event ON $table FOR EACH ROW BEGIN IF EXISTS(SELECT 1 FROM journal_entries WHERE $source) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Sumber sudah dijurnal; koreksi/reversal belum didukung'; END IF; END";
    }
    $triggers['journal_guard_invoice_delete']="BEFORE DELETE ON sales_invoices FOR EACH ROW BEGIN IF EXISTS(SELECT 1 FROM journal_entries WHERE source_type='sales_invoice' AND source_id=OLD.id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Faktur sudah dijurnal; penghapusan ditolak'; END IF; END";
    $changes=[];foreach(['id','invoice_number','date','total','branch_id','customer_ref_id','customer_id','customer_name','vehicle_info','description','wo_id','wo_number','accounting_eligible'] as $field)$changes[]="NOT(NEW.$field <=> OLD.$field)";
    $triggers['journal_guard_invoice_update']="BEFORE UPDATE ON sales_invoices FOR EACH ROW BEGIN IF (".implode(' OR ',$changes).") AND EXISTS(SELECT 1 FROM journal_entries WHERE source_type='sales_invoice' AND source_id=OLD.id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Faktur sudah dijurnal; perubahan ditolak'; END IF; END";
    $triggers['journal_guard_invoice_line_insert']="BEFORE INSERT ON sales_invoice_items FOR EACH ROW BEGIN IF EXISTS(SELECT 1 FROM journal_entries WHERE source_type='sales_invoice' AND source_id=NEW.invoice_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Detail faktur sudah dijurnal; perubahan ditolak'; END IF; END";
    foreach($triggers as $name=>$body){
        $q=$pdo->prepare('SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME=?');$q->execute([$name]);
        if(!$q->fetchColumn())$pdo->exec("CREATE TRIGGER $name $body");
    }
    $pdo->prepare('INSERT IGNORE INTO app_schema_migrations(migration_key) VALUES(?)')->execute([$key]);
}
