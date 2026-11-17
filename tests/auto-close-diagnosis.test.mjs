import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('expired Register diagnoses auto-close as audited Lost Sales with a required system reason', () => {
  const helper = source('api/auto-close-diagnosis.php');
  const allData = source('api/endpoints/all-data.php');
  const workOrders = source('api/endpoints/work-orders.php');
  const helpArticles = source('src/data/helpArticles.ts');
  assert.match(helper, /status='Register'/);
  assert.match(helper, /invoice_id IS NULL OR invoice_id=''/);
  assert.match(helper, /invoice_number IS NULL OR invoice_number=''/);
  assert.match(helper, /date<=\?/);
  assert.match(helper, /17:30:00/);
  assert.match(helper, /status='Closed',cancel_reason=\?,status_log=\?/);
  assert.match(helper, /Diagnosa tidak dikerjakan sampai akhir hari/);
  assert.match(helper, /AUTO_LOST_SALES_END_OF_DAY/);
  assert.match(allData, /require_once __DIR__.'\/\.\.\/auto-close-diagnosis\.php'/);
  assert.match(allData, /autoCloseExpiredDiagnoses\(\$pdo\)/);
  assert.match(workOrders, /require_once __DIR__.'\/\.\.\/auto-close-diagnosis\.php'/);
  assert.match(workOrders, /autoCloseExpiredDiagnoses\(\$pdo\)/);
  assert.match(helpArticles, /otomatis ditutup menjadi Lost Sales setelah pukul 17\.30/);
  assert.doesNotMatch(helpArticles, /Sistem tidak mengubah Register menjadi Lost Sales secara otomatis/);
});
