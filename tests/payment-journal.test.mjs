import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('invoice posting is atomic in both creation routes and initial receipts',()=>{
 const s=read('api/endpoints/sales-invoices.php');
 assert.equal((s.match(/postInvoiceJournal\(\$pdo/g)||[]).length,2);
 assert.match(s,/postCustomerPaymentJournal\(\$pdo,\$paymentId/);
 assert.equal((s.match(/accounting_eligible/g)||[]).length,2);
 assert.match(s,/assertInvoiceAccountingInput\(\$d\)/);
 assert.match(s,/assertJournalSourceMutable/);
});
test('payments post before commit; mutation guard covers batch deletion',()=>{
 const s=read('api/endpoints/customer-payments.php');
 assert.match(s,/postCustomerPaymentJournal\(\$pdo,\$paymentId/);
 assert.ok(s.indexOf('postCustomerPaymentJournal')<s.indexOf('$pdo->commit()'));
 assert.match(s,/assertJournalSourceMutable/);
});
test('runtime migration and database immutability guards cover sibling paths',()=>{
 const s=read('api/accounting-schema.php');
 for(const table of ['sales_invoices','sales_invoice_items','customer_payments'])assert.match(s,new RegExp(table));
 assert.match(s,/UNIQUE KEY/);assert.match(s,/SIGNAL SQLSTATE/);assert.match(s,/accounting_eligible/);
 assert.match(read('api/index.php'),/ensureAccountingSchema/);
 assert.match(read('api/endpoints/data-maintenance.php'),/assertNoPostedAccounting/);
 assert.match(read('api/endpoints/chart-of-accounts.php'),/journal_lines/);
});
test('manual journal endpoint denies impersonation and scopes permission/branches',()=>{
 const s=read('api/endpoints/general-journals.php');
 for(const x of ['sourceType','sourceId','report:view','settings:edit','getAccessibleBranchIds','lockInventoryMutationAuthorization'])assert.ok(s.includes(x),x);
 assert.match(s,/postJournal/);
});
test('journal screen is live and ledger menu is permission gated',()=>{
 const s=read('src/pages/GeneralJournal.tsx');
 for(const x of ["api.get('general-journals')","api.create('general-journals'",'Belum termasuk saldo awal','Debit','Kredit'])assert.ok(s.includes(x),x);
 assert.match(read('src/App.tsx'),/general-journal.*report:view/);
 assert.match(read('src/components/Layout.tsx'),/Jurnal Umum.*general-journal.*report:view/);
});
