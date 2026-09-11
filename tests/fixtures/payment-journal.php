<?php
require __DIR__.'/../../api/accounting.php';
require __DIR__.'/../../api/accounting-schema.php';

function check($condition,$message){ if(!$condition){ throw new RuntimeException($message);} }
function rejects(callable $fn){ try { $fn(); } catch (DomainException|InvalidArgumentException $e) { return; } throw new RuntimeException('Expected rejection'); }

check(function_exists('journalMoney'),'Exact journal money parser is missing');
check(journalMoney('0.29') === 29, 'Exact cents');
check(journalMoney('9999999999999.99') === 999999999999999, 'Maximum money');
foreach (['-1','1.001','1e3','NaN','',null] as $bad) {
    rejects(fn()=>journalMoney($bad));
}
check(journalDecimal(29) === '0.29', 'Exact serialization');
print "PASS exact monetary values\n";

check(function_exists('postJournal'), 'Manual postJournal is missing');

$pdo = new PDO('sqlite::memory:');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$pdo->exec('CREATE TABLE chart_of_accounts(id TEXT PRIMARY KEY,code TEXT,name TEXT,account_type TEXT,is_active INTEGER,parent_id TEXT)');
$pdo->exec("INSERT INTO chart_of_accounts VALUES ('ar','110','AR','Asset',1,NULL),('sales','410','Sales','Revenue',1,NULL),('cash','110','Kas','Asset',1,NULL)");
$pdo->exec('CREATE TABLE app_schema_migrations(migration_key TEXT PRIMARY KEY)');
$pdo->exec('CREATE TABLE IF NOT EXISTS branches(id TEXT PRIMARY KEY)');
$pdo->exec("INSERT INTO branches VALUES('B1')");
ensureAccountingSchema($pdo);

$lines=[['accountId'=>'ar','debit'=>'0.30','credit'=>'0'],['accountId'=>'sales','debit'=>'0','credit'=>'0.30']];
$before=$pdo->query('SELECT COUNT(*) FROM journal_entries')->fetchColumn();
$pdo->beginTransaction();
$jid=postJournal($pdo,'B1','2026-09-11','Manual Test',$lines,'user-1');
$pdo->commit();
check($pdo->query('SELECT COUNT(*) FROM journal_entries')->fetchColumn() === $before + 1, 'Journal entry persisted');
check(abs((float)$pdo->query("SELECT debit FROM journal_lines WHERE account_id='ar' LIMIT 1")->fetchColumn() - 0.3) < 0.0001, 'Persist exact money');

$pdo->beginTransaction();
rejects(fn()=>postJournal($pdo,'B1','2026-02-30','Bad',$lines,'user-1'));
$pdo->rollBack();
print "PASS balanced manual journal persistence and rollback\n";

// Decoupling checks: posting helpers for auto flow removed from this build.
check(!function_exists('postInvoiceJournal'), 'Invoice auto posting helper should be removed in decoupled mode');
check(!function_exists('postCustomerPaymentJournal'), 'Payment auto posting helper should be removed in decoupled mode');
check(!function_exists('assertInvoiceAccountingInput'), 'Legacy accounting input guard removed in decoupled mode');
check(!function_exists('assertJournalSourceMutable'), 'Legacy journal source guard removed in decoupled mode');
print "PASS manual-only accounting separation checks\n";
