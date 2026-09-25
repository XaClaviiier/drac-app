import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { transformSync } from 'esbuild';

const root = new URL('../', import.meta.url);
const pages = Object.fromEntries(['SalesInvoice', 'CustomerPayments', 'WorkOrders'].map(name => {
  const source = readFileSync(new URL(`src/pages/${name}.tsx`, root), 'utf8');
  return [name, ts.createSourceFile(`${name}.tsx`, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)];
}));

// Execute the real callbacks from each page with controlled state. This catches
// list/URL regressions without loading document editors or issuing API writes.
function pageCallback(page, variable) {
  const file = pages[page];
  let callback;
  function visit(node) {
    if (variable && ts.isVariableDeclaration(node) && node.name.getText(file) === variable && node.initializer) {
      callback = ts.isCallExpression(node.initializer)
        ? node.initializer.arguments[0].getText(file)
        : node.initializer.getText(file);
    }
    if (!variable && ts.isCallExpression(node) && node.expression.getText(file) === 'useEffect'
      && /searchParams\.get\(['"]from['"]\)/.test(node.arguments[0]?.getText(file) || '')) {
      callback = node.arguments[0].getText(file);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(callback, `${page}: requested callback exists`);
  const js = transformSync(`const callback = ${callback};`, { loader: 'ts', target: 'es2022' }).code;
  return context => new Function(...Object.keys(context), `${js}\nreturn callback();`)(...Object.values(context));
}

function navigationContext(query) {
  const context = { searchParams: new URLSearchParams(query) };
  const state = {};
  const setters = [
    'SearchTerm', 'FilterCustomer', 'FilterStatus', 'FilterDate', 'FilterDateFrom', 'FilterDateTo', 'FilterMinAge',
    'Period', 'DateFrom', 'DateTo', 'Search', 'MethodFilter', 'StatusFilter', 'AccountFilter', 'UserFilter',
    'FilterAttention', 'PeriodFilter', 'TodayOnly', 'DetailWO',
  ];
  for (const setter of setters) context[`set${setter}`] = value => { state[setter] = value; };
  context.setSearchParams = update => { context.searchParams = update(context.searchParams); };
  context.WORK_ORDER_ATTENTION_LABELS = { register: '', process: '', invoice: '', payment: '' };
  return { context, state };
}

const invoice = (id, date, overrides = {}) => ({
  id, invoiceNumber: id, date, branchId: 'B1', total: 100, payment: 0,
  age: 8, status: 'Belum Lunas', customerName: 'Pelanggan', vehicleInfo: '', ...overrides,
});
const invoiceContext = invoices => ({
  data: { invoices }, currentBranchId: 'B1', searchTerm: '', filterCustomer: '', filterStatus: '',
  filterDate: '', filterDateFrom: '', filterDateTo: '', filterMinAge: '',
});

test('invoice drilldown includes both date boundaries and obeys the current branch', () => {
  const context = invoiceContext([
    invoice('before', '2026-08-31'), invoice('first', '2026-09-01T00:00:00'),
    invoice('last', '2026-09-25 23:59:59'), invoice('after', '2026-09-26'),
    invoice('other-branch', '2026-09-20', { branchId: 'B2' }),
  ]);
  context.filterDateFrom = '2026-09-01';
  context.filterDateTo = '2026-09-25';
  assert.deepEqual(pageCallback('SalesInvoice', 'filteredInvoices')(context).map(row => row.id), ['last', 'first']);
});

test('receivable drilldown uses remaining balance and age, including previous months but excluding future dates', () => {
  const context = invoiceContext([
    invoice('old-unpaid', '2026-08-01', { age: 55, status: 'Lunas' }),
    invoice('eight-days', '2026-09-17'), invoice('seven-days', '2026-09-18', { age: 7 }),
    invoice('settled', '2026-09-01', { payment: 100, age: 24 }),
    invoice('future', '2026-09-26', { age: 99 }),
  ]);
  Object.assign(context, { filterDateTo: '2026-09-25', filterStatus: 'Belum Lunas', filterMinAge: '8' });
  assert.deepEqual(pageCallback('SalesInvoice', 'filteredInvoices')(context).map(row => row.id), ['eight-days', 'old-unpaid']);
});

test('invoice navigation resets stale list filters and consumes only its own parameters', () => {
  const { context, state } = navigationContext('source=dashboard&to=2026-09-25&status=Belum+Lunas&minAge=8&view=INV1&branchId=B2');
  const apply = pageCallback('SalesInvoice');
  apply(context);
  assert.equal(state.FilterDateTo, '2026-09-25');
  assert.equal(state.FilterDateFrom, '');
  assert.equal(state.FilterStatus, 'Belum Lunas');
  assert.equal(state.FilterMinAge, '8');
  assert.equal(state.SearchTerm, '');
  assert.equal(state.FilterCustomer, '');
  assert.equal(context.searchParams.toString(), 'view=INV1&branchId=B2');
  state.FilterDateTo = '';
  apply(context);
  assert.equal(state.FilterDateTo, '', 'manual changes must not be overwritten after navigation');
});

test('legacy invoice date and status links still work', () => {
  const { context, state } = navigationContext('date=2026-09-24&status=Lunas');
  pageCallback('SalesInvoice')(context);
  assert.equal(state.FilterDate, '2026-09-24');
  assert.equal(state.FilterStatus, 'Lunas');
});

test('invoice and WO clear buttons remove all dashboard filters while retaining document parameters', () => {
  const invoices = navigationContext('from=2026-09-01&to=2026-09-25&status=Belum+Lunas&minAge=8&view=INV1');
  pageCallback('SalesInvoice', 'resetInvoiceFilters')(invoices.context);
  for (const key of ['FilterCustomer', 'FilterStatus', 'FilterDate', 'FilterDateFrom', 'FilterDateTo', 'FilterMinAge']) {
    assert.equal(invoices.state[key], '');
  }
  assert.equal(invoices.context.searchParams.toString(), 'view=INV1');
  const workOrders = navigationContext('from=2026-09-01&to=2026-09-25&attentionKind=invoice&status=Selesai&view=WO1');
  pageCallback('WorkOrders', 'resetWorkOrderFilters')(workOrders.context);
  assert.equal(workOrders.state.PeriodFilter, 'all');
  assert.equal(workOrders.state.FilterAttention, 'all');
  assert.equal(workOrders.state.DateFrom, '');
  assert.equal(workOrders.state.DateTo, '');
  assert.equal(workOrders.context.searchParams.toString(), 'view=WO1');
});

test('payment range navigation resets old filters and remains editable after consuming its URL', () => {
  const { context, state } = navigationContext('source=dashboard&from=2026-09-01&to=2026-09-25&method=nonCash&view=PAY1');
  const apply = pageCallback('CustomerPayments');
  apply(context);
  assert.equal(state.Period, 'custom');
  assert.equal(state.DateFrom, '2026-09-01');
  assert.equal(state.DateTo, '2026-09-25');
  assert.equal(state.MethodFilter, 'nonCash');
  assert.equal(state.Search, '');
  assert.equal(state.AccountFilter, 'ALL');
  assert.equal(state.StatusFilter, 'ALL');
  assert.equal(state.UserFilter, 'ALL');
  assert.equal(context.searchParams.toString(), 'view=PAY1');
  state.Period = 'all';
  apply(context);
  assert.equal(state.Period, 'all');
});

test('payment list includes end-date timestamps and all non-cash payment methods', () => {
  const payment = (id, paymentMethod, overrides = {}) => ({ id, paymentMethod,
    branchId: 'B1', date: '2026-09-25T23:59:59', ...overrides });
  const context = {
    rows: [payment('cash', 'Tunai'), payment('bank', 'Transfer'), payment('qris', 'QRIS'),
      payment('next-day', 'Transfer', { date: '2026-09-26' }), payment('other-branch', 'QRIS', { branchId: 'B2' })],
    currentBranchId: 'B1', periodRange: ['2026-09-01', '2026-09-25'], methodFilter: 'nonCash',
    accountFilter: 'ALL', userFilter: 'ALL', statusFilter: 'ALL', search: '',
  };
  assert.deepEqual(pageCallback('CustomerPayments', 'filtered')(context).map(row => row.id), ['bank', 'qris']);
});

test('WO action links select the exact shared attention kind across all dates', () => {
  const { context, state } = navigationContext('source=dashboard&attentionKind=invoice&view=WO1');
  pageCallback('WorkOrders')(context);
  assert.equal(state.PeriodFilter, 'all');
  assert.equal(state.DateFrom, '');
  assert.equal(state.DateTo, '');
  assert.equal(state.FilterAttention, 'invoice');
  assert.equal(state.FilterStatus, '');
  assert.equal(state.SearchTerm, '');
  assert.equal(context.searchParams.toString(), 'view=WO1');
  const workOrder = (id, date, status) => ({ id, woNumber: id, date, status });
  const filtered = pageCallback('WorkOrders', 'filteredWOs')({
    branchScopedWorkOrders: [workOrder('old', '2026-08-01', 'Selesai'), workOrder('fresh', '2026-09-25', 'Selesai'),
      workOrder('late-work', '2026-09-01', 'Proses')],
    data: { customers: [] }, periodRange: { from: '', to: '' }, searchTerm: '', filterStatus: '',
    filterAttention: 'invoice', attentionByWorkOrderId: new Map([
      ['old', { kind: 'invoice' }], ['late-work', { kind: 'process' }],
    ]),
  });
  assert.deepEqual(filtered.map(row => row.id), ['old'], 'fresh completed orders outside shared attention rules remain excluded');
});

test('WO range/status and legacy date/attention links are consumed without retaining previous filters', () => {
  const range = navigationContext('from=2026-09-01&to=2026-09-25&status=Proses');
  pageCallback('WorkOrders')(range.context);
  assert.equal(range.state.PeriodFilter, 'custom');
  assert.equal(range.state.DateFrom, '2026-09-01');
  assert.equal(range.state.DateTo, '2026-09-25');
  assert.equal(range.state.FilterStatus, 'Proses');
  assert.equal(range.state.FilterAttention, 'all');
  const legacy = navigationContext('date=2026-09-24&attention=1');
  pageCallback('WorkOrders')(legacy.context);
  assert.equal(legacy.state.DateFrom, '2026-09-24');
  assert.equal(legacy.state.DateTo, '2026-09-24');
  assert.equal(legacy.state.FilterAttention, 'attention');
});
