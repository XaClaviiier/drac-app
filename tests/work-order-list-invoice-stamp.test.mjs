import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { buildSync, transformSync } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const page = readFileSync(new URL('../src/pages/WorkOrders.tsx', import.meta.url), 'utf8');
const numberCell = page.slice(page.indexOf("if (key === 'number') return ") + "if (key === 'number') return ".length, page.indexOf("if (key === 'date') return ")).trim().replace(/;$/, '');
const wo = { id: 'WO-1', woNumber: 'WO-001', branchId: 'BR-1', status: 'Selesai', invoiceId: 'INV-1', invoiceNumber: 'C262027' };
const data = { branches: [{ id: 'BR-1', name: 'CABANG PALU' }], invoices: [] };
const stampPath = new URL('../src/components/WorkOrderPaidStamp.tsx', import.meta.url);
const stampModule = { exports: {} };
const stampCode = buildSync({ entryPoints: [fileURLToPath(stampPath)], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic' }).outputFiles[0].text;
new Function('require', 'module', 'exports', stampCode)(require, stampModule, stampModule.exports);
const WorkOrderPaidStamp = stampModule.exports.default;
const paidInvoice = { id: 'INV-1', invoiceNumber: 'C262027', woId: 'WO-1', branchId: 'BR-1', total: 100, payment: 100, status: 'Lunas' };
const mobileList = page.slice(page.indexOf('{/* Ringkasan WO mobile:'), page.indexOf('{/* Layout kartu lama'));
const mobileHeader = mobileList.slice(mobileList.indexOf('<div className="flex items-start justify-between gap-3">'), mobileList.indexOf('<WorkOrderCustomerVehicleIdentity')).trim();

function renderNumberCell(workOrder = wo, invoices = [], markup = numberCell) {
    const code = transformSync(`export default function Cell({wo, data}) {
    const key = 'number'; const openWorkOrderStandard = () => {}; const formatBusinessDate = value => value;
    const statusColors = {}; const statusLabel = status => status;
    return ${markup};
  }`, { loader: 'tsx', jsx: 'automatic', format: 'cjs' }).code;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'WorkOrderPaidStamp', code)(require, module, module.exports, WorkOrderPaidStamp);
  return renderToStaticMarkup(React.createElement(module.exports.default, { wo: workOrder, data: { ...data, invoices } }));
}

test('desktop original number cell displays invoice once below branch', () => {
  const html = renderNumberCell();
  assert.match(html, /Faktur C262027/);
  assert.ok(html.indexOf('PALU') < html.indexOf('Faktur C262027'));
  assert.equal(html.match(/C262027/g)?.length, 1);
  assert.doesNotMatch(renderNumberCell({ ...wo, invoiceId: undefined, invoiceNumber: undefined }), /Faktur/);
});

test('desktop completed status has a LUNAS stamp only for confirmed fully paid invoice', () => {
  const html = renderNumberCell(wo, [paidInvoice]);
  assert.match(html, />LUNAS</);
  assert.ok(html.indexOf('Selesai') < html.indexOf('LUNAS'));
  for (const invoices of [[], [{ ...paidInvoice, payment: 0 }], [{ ...paidInvoice, payment: 50 }], [{ ...paidInvoice, status: 'Belum Lunas' }], [{ ...paidInvoice, total: 0, payment: 0 }], [{ ...paidInvoice, status: 'Batal' }], [{ ...paidInvoice, branchId: 'BR-2' }], [{ ...paidInvoice, id: 'OTHER' }]]) {
    assert.doesNotMatch(renderNumberCell(wo, invoices), />LUNAS</);
  }
  assert.doesNotMatch(renderNumberCell({ ...wo, status: 'Closed' }, [paidInvoice]), />LUNAS</);
  assert.doesNotMatch(renderNumberCell({ ...wo, status: 'Proses' }, [paidInvoice]), />LUNAS</);
});

test('mobile adds paid stamp below status without duplicating its existing invoice badge', () => {
  const html = renderNumberCell(wo, [paidInvoice], mobileHeader);
  assert.match(html, />LUNAS</);
  assert.ok(html.indexOf('Selesai') < html.indexOf('LUNAS'));
  assert.doesNotMatch(renderNumberCell(wo, [], mobileHeader), />LUNAS</);
  assert.equal(mobileList.match(/Faktur /g)?.length, 1);
  assert.match(mobileList, /\{branchName\}<\/span>\s*\{wo.invoiceId && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-\[10px\] font-bold text-emerald-700">Faktur \{wo.invoiceNumber \|\| 'tersedia'\}/);
});
