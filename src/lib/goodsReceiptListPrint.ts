import type { GoodsReceipt } from '../types';
import { receiptDateLabel, receiptDescription, receiptDocumentNumber, receiptQuantitySummary, receiptStatusLabel } from './goodsReceiptPresentation.ts';

export type ReceiptColumn = 'number' | 'date' | 'notes' | 'receivedBy' | 'itemCount' | 'warehouse' | 'status' | 'supplier';
export const defaultReceiptColumns: ReceiptColumn[] = ['number', 'date', 'notes', 'receivedBy', 'itemCount', 'warehouse', 'status', 'supplier'];
export const receiptColumnLabels: Record<ReceiptColumn, string> = {
  number: 'Nomor #', date: 'Tanggal', notes: 'Keterangan', receivedBy: 'Diterima Oleh',
  itemCount: 'Jumlah Barang', warehouse: 'Gudang', status: 'Status', supplier: 'Status Supplier',
};
const columnWidths: Record<ReceiptColumn, number> = { number: 14, date: 8, notes: 32, receivedBy: 12, itemCount: 12, warehouse: 11, status: 8, supplier: 10 };
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

type ReceiptListPrintOptions = {
  receipts: GoodsReceipt[];
  warehouses: { id: string; name: string }[];
  periodLabel: string;
  filters: string[];
  columns?: ReceiptColumn[];
  includeSupplier?: boolean;
  supplierMapped?: (receipt: GoodsReceipt) => boolean;
  printedAt?: Date;
};

export function buildGoodsReceiptListPrintHtml(options: ReceiptListPrintOptions): string {
  const { receipts, warehouses, periodLabel, filters, columns = defaultReceiptColumns, includeSupplier = false } = options;
  const warehouseNames = new Map(warehouses.map(warehouse => [warehouse.id, warehouse.name]));
  const printedAt = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Makassar', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(options.printedAt || new Date()) + ' WITA';
  const cell = (receipt: GoodsReceipt, column: ReceiptColumn): string => {
    if (column === 'number') return escapeHtml(receiptDocumentNumber(receipt));
    if (column === 'date') return escapeHtml(receiptDateLabel(receipt.date));
    if (column === 'notes') return escapeHtml(receiptDescription(receipt));
    if (column === 'receivedBy') return escapeHtml(receipt.receivedBy || '-');
    if (column === 'itemCount') return `${receipt.items.length} item<br><span>${escapeHtml(receiptQuantitySummary(receipt.items))}</span>`;
    if (column === 'warehouse') return escapeHtml(warehouseNames.get(receipt.warehouseId) || '-');
    if (column === 'supplier') return options.supplierMapped?.(receipt) ? '✓' : receipt.sourceType === 'Transfer Gudang' ? '—' : 'X';
    return escapeHtml(receiptStatusLabel(receipt.status));
  };
  const rows = receipts.map((receipt, index) => `<tr><td class="sequence">${index + 1}</td>${columns.map(column => `<td class="${column}">${cell(receipt, column)}</td>`).join('')}${includeSupplier ? `<td>${escapeHtml(receipt.supplierName || 'Belum dipetakan')}</td>` : ''}</tr>`).join('');
  const colCount = columns.length + 1 + Number(includeSupplier);
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Daftar Penerimaan Barang</title><style>
@page{size:A4 landscape;margin:12mm 10mm 16mm;@bottom-left{content:"DOKTER AC MOBIL · ${escapeHtml(printedAt)}";font:8pt Arial;color:#444}@bottom-right{content:"Halaman " counter(page) " / " counter(pages);font:8pt Arial;color:#444}}
*{box-sizing:border-box}body{margin:0;background:#e5e7eb;color:#111;font-family:Arial,sans-serif}.toolbar{position:sticky;top:0;z-index:1;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:12px;padding:12px;background:#fff;border-bottom:1px solid #ccc;font-size:14px}.toolbar button{padding:9px 16px;background:#1456b8;color:white;border:0;border-radius:5px;font:inherit;cursor:pointer}.toolbar button.secondary{background:#f1f5f9;color:#222}.toolbar small{font-size:12px;color:#555}.paper{width:297mm;min-height:210mm;margin:20px auto;padding:12mm 10mm 16mm;background:white;box-shadow:0 2px 12px #0002}.heading{text-align:center}.company{font-size:12pt;font-weight:bold;letter-spacing:.4px}h1{font-size:18pt;margin:5mm 0 2mm}.period{font-size:10pt}.metadata{margin:6mm 0 3mm;display:flex;flex-wrap:wrap;gap:2mm 6mm;font-size:9pt;line-height:1.5}.metadata span{overflow-wrap:anywhere}table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:9pt;line-height:1.4}thead{display:table-header-group}th,td{border:1px solid #b8bec5;padding:2mm 1.5mm;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#e9edf1;font-weight:bold;color:#111}tr{break-inside:avoid;page-break-inside:avoid}.notes{white-space:pre-wrap}.sequence{text-align:center}.date{white-space:nowrap}.itemCount span{display:inline-block;margin-top:1mm}.summary{margin-top:4mm;display:flex;justify-content:space-between;gap:6mm;font-size:9pt;break-inside:avoid}.empty{text-align:center;padding:12mm}.timestamp{color:#444}
@media screen and (max-width:1150px){.paper{margin:12px 0}.toolbar{justify-content:flex-start}}@media print{body{background:white}.toolbar{display:none}.paper{width:100%;min-height:0;margin:0;padding:0;box-shadow:none}th{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body><nav class="toolbar"><button type="button" onclick="window.print()">Cetak / Simpan PDF</button><button type="button" class="secondary" onclick="window.close()">Tutup</button><small>A4 landscape · Nonaktifkan header dan footer bawaan browser.</small></nav><main class="paper"><header class="heading"><div class="company">DOKTER AC MOBIL</div><h1>DAFTAR PENERIMAAN BARANG</h1><div class="period">${escapeHtml(periodLabel)}</div></header><div class="metadata">${filters.map(filter => `<span>${escapeHtml(filter)}</span>`).join('')}</div><table><colgroup><col style="width:3%">${columns.map(column => `<col style="width:${includeSupplier && column === 'notes' ? 18 : columnWidths[column]}%">`).join('')}${includeSupplier ? '<col style="width:14%">' : ''}</colgroup><thead><tr><th class="sequence">No.</th>${columns.map(column => `<th>${escapeHtml(receiptColumnLabels[column])}</th>`).join('')}${includeSupplier ? '<th>Supplier</th>' : ''}</tr></thead><tbody>${rows || `<tr><td colspan="${colCount}" class="empty">Tidak ada penerimaan yang sesuai filter.</td></tr>`}</tbody></table><footer class="summary"><strong>Total: ${receipts.length.toLocaleString('id-ID')} penerimaan</strong><span class="timestamp">Dicetak ${escapeHtml(printedAt)}</span></footer></main></body></html>`;
}
