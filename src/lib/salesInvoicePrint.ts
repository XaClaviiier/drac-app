import type { CompanyProfile, Branch } from '../types';

export type SalesInvoicePrintFormat = 'a4' | 'thermal80';

export interface SalesInvoicePrintData {
  number: string;
  date: string;
  customer: string;
  customerCompany?: string;
  customerContact?: string;
  customerContactPhone?: string;
  customerAccountType?: 'Pribadi' | 'Perusahaan';
  vehicle: string;
  workOrder?: string;
  receipt?: string;
  description?: string;
  printNote?: string;
  draft?: boolean;
  company: Pick<CompanyProfile, 'name' | 'address' | 'invoiceFooter'>;
  branch?: Pick<Branch, 'name' | 'address' | 'phone'>;
  status: string;
  lines: { name: string; qty: number; price: number; members: { name: string; qty: number }[] }[];
  subtotal: number;
  discount: number;
  total: number;
  payment: number;
}

const clean = (value?: string | null) => value?.trim() || '';
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]!);
const number = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 6 });
const money = (value: number) => `Rp ${number.format(value)}`;

export function buildSalesInvoicePrintHtml(data: SalesInvoicePrintData, format: SalesInvoicePrintFormat = 'a4') {
  const thermal = format === 'thermal80';
  const customerCompany = clean(data.customerCompany);
  const corporateA4 = !thermal && Boolean(customerCompany || data.customerAccountType === 'Perusahaan');
  const showPaymentStatus = !corporateA4 && (thermal || data.status !== 'Belum Lunas');
  const company = data.company.name.trim() || 'DOKTER AC MOBIL';
  const address = thermal ? data.branch?.address : data.company.address;
  const title = data.draft ? 'Pratinjau Faktur' : 'Faktur Penjualan';
  const field = (label: string, value?: string) => value?.trim()
    ? `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>` : '';
  const contact = clean(data.customerContact) || clean(data.customer);
  const customerLabel = customerCompany || clean(data.customer);
  const contactLine = [
    contact.toLowerCase() !== customerLabel.toLowerCase() ? contact : '',
    clean(data.customerContactPhone),
  ].filter(Boolean).join(' / ');
  const customerIdentity = corporateA4
    ? `<div>${field('Pelanggan', customerLabel)}${field('PIC / Kontak', contactLine)}</div>`
    : field('Pelanggan', data.customer);
  const rows = data.lines.map((line, i) => {
    const members = line.members.length ? `<ul>${line.members.map(member =>
      `<li>${escape(member.name)} <span>× ${number.format(member.qty)}</span></li>`).join('')}</ul>` : '';
    const name = `<strong>${escape(line.name)}</strong>${members}`;
    const amount = number.format(line.price * line.qty);
    if (thermal) return `<li class="item">${name}<div class="item-price"><span>${number.format(line.qty)} × ${money(line.price)}</span><b>${money(line.price * line.qty)}</b></div></li>`;
    return `<tr><td class="seq">${String(i + 1).padStart(2, '0')}</td><td>${name}</td>
      <td class="qty">${number.format(line.qty)}</td><td class="num">${number.format(line.price)}</td><td class="num amount">${amount}</td></tr>`;
  }).join('');
  const fallback = escape(data.description?.trim() || 'Rincian barang/jasa tidak tersedia.');
  const remaining = Math.max(0, data.total - data.payment);
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${escape(`${title} ${data.number}`.trim())}</title><style>
${thermal ? '@page { size:auto; margin:0 }' : `@page { size:A4 portrait; margin:15mm 15mm 18mm;
  @top-left { content:""; } @top-center { content:""; } @top-right { content:""; }
  @bottom-left { content:""; } @bottom-center { content:""; }
  @bottom-right { content:"Halaman " counter(page) " / " counter(pages); font:8pt Arial,sans-serif; color:#58616b; }
}`}
* { box-sizing:border-box }
body { margin:0; color:#20272c; background:#fff; font:10pt/1.45 Arial,Helvetica,sans-serif; font-variant-numeric:tabular-nums; -webkit-print-color-adjust:exact; print-color-adjust:exact }
header { display:flex; align-items:flex-start; justify-content:space-between; gap:7mm; padding:5mm 0 6mm; border-top:1.4mm solid #aa2635; border-bottom:.3mm solid #afb7bc }
.brand { max-width:51%; overflow-wrap:anywhere }
.brand strong { display:block; font-size:15pt; letter-spacing:-.35pt }
.branch { margin-top:1mm; font-weight:600; font-size:9pt }
.contact, .date { margin-top:1.5mm; color:#505b63; font-size:9pt }
.contact { white-space:pre-line }
.heading { text-align:right; overflow-wrap:anywhere }
h1 { margin:0; font-size:23pt; line-height:1.05; letter-spacing:-1pt }
.ref { margin-top:2mm; font-weight:700; font-size:13pt; color:#9e2634 }
dl { margin:0 }
.identity { display:grid; grid-template-columns:minmax(0,.85fr) minmax(0,1.45fr) minmax(0,1fr); gap:5mm; padding:5mm 0 6mm; break-inside:avoid }
dt, h2 { font-size:8pt; font-weight:bold; text-transform:uppercase; letter-spacing:.7pt; color:#565f68 }
dd { margin:1mm 0 0; font-weight:600; overflow-wrap:anywhere }
.identity dt:not(:first-child) { margin-top:1mm }
h2 { margin:0 0 2.5mm; color:#293239; break-after:avoid }
table { width:100%; border-collapse:collapse; table-layout:fixed }
col.seq { width:8% } col.qty { width:8% } col.price { width:18% } col.amount { width:18% }
thead { display:table-header-group } th { padding:2.4mm 1.5mm; background:#303b42; color:white; font-size:8pt; text-align:left }
td { padding:2.8mm 1.5mm; vertical-align:top; border-bottom:.22mm solid #d4dade; font-size:9pt }
td strong { font-weight:600; overflow-wrap:anywhere }
.seq, .qty { text-align:center } td.seq { color:#68737c }
.num { text-align:right; white-space:nowrap } td.amount { font-weight:600 }
ul { margin:1.5mm 0 0; padding-left:4mm; font-size:8.5pt; color:#4b5760 }
li { padding:.3mm 0; overflow-wrap:anywhere } li span { white-space:nowrap }
tr { break-inside:avoid }
.settlement { display:flex; justify-content:space-between; align-items:flex-start; gap:8mm; margin-top:6mm; break-inside:avoid }
.status { display:inline-block; margin-top:2mm; padding:1mm 3mm; font-weight:bold; border:.3mm solid #919b9f; border-radius:1mm }
.totals { width:80mm; max-width:62% }
.totals div { display:flex; justify-content:space-between; align-items:baseline; gap:4mm; padding:1mm 0 }
.totals dt { color:inherit; font-size:9pt; letter-spacing:0; text-transform:none; font-weight:normal }
.totals dd { margin:0; text-align:right; white-space:nowrap }
.totals .total { border-top:.3mm solid #bcc4c9; margin-top:1mm; padding-top:2mm }
.total dt { font-weight:bold }
.totals .balance { margin-top:2mm; border-top:.7mm solid #aa2635; padding:2mm 0; color:#8d202c }
.balance dt { font-weight:bold } .balance dd { font-size:15pt }
.authorization { flex:1; min-width:0 }
.print-note { margin-top:4mm; padding:2.5mm; border:.25mm solid #afb7bc; }
.print-note:first-child { margin-top:0 }
.print-note h2 { margin-bottom:1mm } .print-note p { margin:0; white-space:pre-wrap; overflow-wrap:anywhere }
.signatures { margin-top:5mm; display:grid; grid-template-columns:1fr 1fr; gap:5mm; text-align:center; font-size:8pt }
.signatures span { display:block; margin-top:18mm; border-top:.25mm solid #68737c; padding-top:1mm; color:#505b63 }
footer { margin-top:7mm; padding-top:2.5mm; border-top:.25mm solid #cbd1d4; white-space:pre-line; color:#56616b; font-size:8pt; break-inside:avoid }
@media screen { body { max-width:210mm; margin:auto; padding:15mm; box-shadow:0 0 18px #0002 } }
${thermal ? `
body { width:80mm; max-width:100%; padding:3mm 4mm; margin:0 auto; color:#000; box-shadow:none; font:9pt/1.3 Arial,sans-serif }
header { display:block; padding:0 0 2mm; border:0; border-bottom:1px dashed black; text-align:center }
.brand { max-width:none } .brand strong { font-size:13pt }
.heading { text-align:center; margin-top:2mm } h1 { font-size:12pt; letter-spacing:0 }
.ref { font-size:10pt; color:#000; margin-top:.6mm }
.branch,.date,.contact { margin-top:.6mm; font-size:8.5pt; color:#000 }
.identity { display:block; padding:2mm 0; border-bottom:1px dashed black }
.identity div:has(> dt) { display:grid; grid-template-columns:20mm minmax(0,1fr); gap:1mm; padding:.5mm 0 }
.identity dt { font-weight:normal; text-transform:none; letter-spacing:0; color:#000 }
.identity dd { margin:0 }
h2 { color:#000; margin:2mm 0 1mm; font-size:8.5pt; letter-spacing:0 }
.items { list-style:none; padding:0; margin:0; font-size:9pt; color:#000 }
.item { padding:1.6mm 0; border-bottom:1px dotted black; break-inside:avoid }
.item strong { display:block } .item ul { margin:.8mm 0; padding-left:4mm; font-size:8pt; color:#000 }
.item-price { display:flex; justify-content:space-between; flex-wrap:wrap; gap:1mm; margin-top:.7mm }
.settlement { display:block; margin-top:2mm }
.authorization { display:flex; align-items:baseline; justify-content:space-between; gap:1mm }
.authorization h2 { font-size:8pt; margin:0 } .status { margin:0; padding:0; border:0 }
.totals { width:auto; max-width:none; margin-top:1mm }
.totals div { padding:.6mm 0; gap:1mm } .totals .total,.totals .balance { border-top:1px dashed black; color:#000; margin-top:1mm; padding:1mm 0 0 }
.balance dd { font-size:11pt }
footer { margin-top:2mm; font-size:8pt; color:#000; border-top:1px dashed black; text-align:center }
` : ''}
</style></head><body>
<header><div class="brand"><strong>${escape(company)}</strong>${data.branch?.name ? `<div class="branch">${escape(data.branch.name)}</div>` : ''}
${[address, data.branch?.phone].map(clean).filter(Boolean).map(value => `<div class="contact">${escape(value)}</div>`).join('')}</div>
<div class="heading"><h1>${title}</h1>${data.number ? `<div class="ref">${escape(data.number)}</div>` : ''}<div class="date">${escape(data.date)}</div></div></header>
<dl class="identity">${customerIdentity}${field('Kendaraan', data.vehicle)}
<div>${field('Work order', data.workOrder)}${field('Nota fisik', data.receipt)}</div></dl>
<h2>Rincian barang dan jasa</h2>
${thermal ? `<ol class="items">${rows || `<li class="item">${fallback}</li>`}</ol>` : `<table><colgroup><col class="seq"><col><col class="qty"><col class="price"><col class="amount"></colgroup>
<thead><tr><th class="seq">No.</th><th>Uraian</th><th class="qty">Qty</th><th class="num">Harga (Rp)</th><th class="num">Jumlah (Rp)</th></tr></thead>
<tbody>${rows || `<tr><td colspan="5">${fallback}</td></tr>`}</tbody></table>`}
<section class="settlement"><div class="authorization">
${showPaymentStatus ? `<h2>Status pembayaran</h2><span class="status">${escape(data.status)}</span>` : ''}
${!thermal && data.printNote?.trim() ? `<div class="print-note"><h2>Catatan</h2><p>${escape(data.printNote.trim())}</p></div>` : ''}
${thermal ? '' : '<div class="signatures"><div>Dibuat oleh<span>Nama petugas</span></div><div>Diterima oleh<span>Nama penerima</span></div></div>'}</div>
<dl class="totals">${field('Subtotal', money(data.subtotal))}${field('Diskon', money(data.discount))}
<div class="total${corporateA4 ? ' balance' : ''}"><dt>Total faktur</dt><dd>${money(data.total)}</dd></div>
${corporateA4 ? '' : `${field('Pembayaran', money(data.payment))}<div class="balance"><dt>Sisa tagihan</dt><dd>${money(remaining)}</dd></div>`}</dl></section>
${data.company.invoiceFooter?.trim() ? `<footer>${escape(data.company.invoiceFooter)}</footer>` : ''}
</body></html>`;
}
