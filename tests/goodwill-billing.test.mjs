import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('../src/lib/billingTreatment.ts', import.meta.url), 'utf8');
const js = transformSync(source, { loader: 'ts', format: 'esm' }).code;
const billing = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const php = input => JSON.parse(execFileSync('php', ['tests/fixtures/goodwill-billing.php', JSON.stringify(input)], { encoding: 'utf8' }));
const service = price => ({ itemId: 'SERVICE', price, qty: 1 });

test('only explicit goodwill allows zero; normal, negative and nonfinite totals remain invalid', () => {
  assert.equal(billing.validBillingTotal(0), false);
  assert.equal(billing.validBillingTotal(0, 'normal'), false);
  assert.equal(billing.validBillingTotal(0, 'goodwill'), true);
  assert.equal(billing.validBillingTotal(400000, 'normal'), true);
  for (const total of [-1, 400000, NaN, Infinity]) assert.equal(billing.validBillingTotal(total, 'goodwill'), false);
  assert.equal(billing.invoiceStatusLabel({ billingTreatment: 'goodwill', status: 'Lunas' }), 'Gratis / Goodwill');
});

test('free service creates neither receivable/revenue entries nor a zero journal, including retry', () => {
  const result = php({ treatment: 'goodwill', items: [service(0)], retry: true });
  assert.equal(result.success, true);
  assert.equal(result.total, 0);
  assert.deepEqual(result.journals, []);
  assert.deepEqual(result.lines, []);
});

test('normal zero, empty goodwill and goodwill with a charge are rejected by the invoice endpoint normalizer', () => {
  for (const input of [{ items: [service(0)] }, { treatment: 'goodwill', items: [] }, { treatment: 'goodwill', items: [service(400000)] }, { treatment: 'unknown', items: [service(0)] }]) {
    assert.equal(php(input).success, false);
  }
});

test('normal sale still posts receivables and service revenue once', () => {
  const result = php({ items: [service(400000)], retry: true });
  assert.equal(result.success, true);
  assert.equal(result.journals.length, 1);
  assert.deepEqual(result.lines, [{ account_id: 'AR', debit: 400000, credit: 0 }, { account_id: 'SERVICE_REV', debit: 0, credit: 400000 }]);
});

test('free stock goods retain actual inventory expense without revenue or a fictitious payment', () => {
  const result = php({ treatment: 'goodwill', items: [{ itemId: 'GOODS', price: 0, qty: 2 }], goodsCost: 100000, retry: true });
  assert.equal(result.success, true);
  assert.equal(result.journals.length, 1);
  assert.deepEqual(result.lines, [{ account_id: 'COGS', debit: 100000, credit: 0 }, { account_id: 'INVENTORY', debit: 0, credit: 100000 }]);
});
