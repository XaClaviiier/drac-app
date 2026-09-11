import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('sales invoices no longer trigger otomatis posting untuk journal/manual otomatis', () => {
  const s = read('api/endpoints/sales-invoices.php');
  assert.equal((s.match(/postInvoiceJournal\(/g) || []).length, 0);
  assert.equal((s.match(/assertInvoiceAccountingInput\(/g) || []).length, 0);
  assert.equal((s.match(/assertJournalSourceMutable\(/g) || []).length, 0);
  assert.equal((s.match(/accounting_eligible/g) || []).length, 0);
  assert.match(s, /prepare\("INSERT INTO sales_invoices/);
});

test('customer payments tidak auto posting dan tidak punya guard sumber jurnal', () => {
  const s = read('api/endpoints/customer-payments.php');
  assert.equal((s.match(/postCustomerPaymentJournal\(/g) || []).length, 0);
  assert.equal((s.match(/assertJournalSourceMutable\(/g) || []).length, 0);
});

test('manual accounting migration initialized on endpoint, not in global bootstrap', () => {
  const index = read('api/index.php');
  const schema = read('api/accounting-schema.php');
  const schemaRouter = read('api/endpoints/general-journals.php');

  assert.ok(index.includes("require_once __DIR__.'/accounting-schema.php';"));
  assert.ok(!index.includes('ensureAccountingSchema($pdo)'));
  assert.match(schema, /CREATE TABLE IF NOT EXISTS journal_entries/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS journal_lines/);
  assert.match(schema, /INSERT IGNORE INTO app_schema_migrations/);
  assert.equal((schema.match(/SIGNAL SQLSTATE/g) || []).length, 0);
  assert.equal((schema.match(/accounting_eligible/g) || []).length, 0);
  assert.match(schemaRouter, /ensureAccountingSchema\(\$pdo\)/);
});

test('manual journal tetap menolak sumber otomatis dan simpan jalan manual', () => {
  const s = read('api/endpoints/general-journals.php');
  assert.ok(s.includes('array_key_exists(\'sourceType\'') || s.includes('array_key_exists(\"sourceType\"'));
  assert.match(s, /postJournal\(\$pdo/);
  assert.match(s, /sourceType.*sourceId/);
});

test('journal screens tetap terhubung di UI', () => {
  const s = read('src/pages/GeneralJournal.tsx');
  const app = read('src/App.tsx');
  const layout = read('src/components/Layout.tsx');
  assert.ok(s.includes("api.get('general-journals')"));
  assert.match(app, /report:view/);
  assert.match(layout, /Jurnal Umum/);
});
