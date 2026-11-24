import type { StockMovement } from '../types';
import { movementLabels, reportDate, reportNumber, type InventoryReportOptions } from './inventoryReports';

export type WarehouseMovement = StockMovement & {
  itemCode: string; unit: string; warehouseId: string; warehouseName: string;
  branchId: string; branchName: string; incoming: number; outgoing: number;
  verifiedAt?: string | null; verifiedBy?: string | null; verificationNote?: string | null;
};
export type WarehouseMovementsReport = InventoryReportOptions & {
  dateFrom: string; dateTo: string; rows: WarehouseMovement[];
};
export type MovementFilters = { search: string; direction: string; type: string; sort: string };
export const movementDirections = [['ALL', 'Masuk & Keluar'], ['IN', 'Masuk'], ['OUT', 'Keluar']] as const;
export const movementKinds = [
  ['ALL', 'Semua Transaksi'], ['receipt', 'Penerimaan Barang'], ['usage', 'Pemakaian Barang'],
  ['sale', 'Penjualan'], ['transfer', 'Transfer Gudang'], ['adjustment', 'Penyesuaian Stok'],
  ['reversal', 'Pembatalan / Koreksi'],
] as const;
export const movementSorts = [['date', 'Tanggal'], ['item', 'Nama Barang']] as const;

export function filterWarehouseMovements(rows: WarehouseMovement[], filters: MovementFilters): WarehouseMovement[] {
  const search = filters.search.trim().toLocaleLowerCase('id-ID');
  const result = rows.filter(row => (filters.direction !== 'IN' || row.incoming > 0)
    && (filters.direction !== 'OUT' || row.outgoing > 0)
    && (filters.type === 'ALL' || (filters.type === 'transfer'
      ? ['transfer', 'transfer_send', 'transfer_receive'].includes(row.movementType) : row.movementType === filters.type))
    && `${row.itemCode} ${row.itemName} ${row.referenceNumber || row.id} ${row.notes} ${row.warehouseName} ${row.branchName} ${movementLabels[row.movementType] || row.movementType}`.toLocaleLowerCase('id-ID').includes(search));
  return result.sort((a, b) => {
    const byItem = filters.sort === 'item' ? a.itemName.localeCompare(b.itemName, 'id-ID') || a.itemCode.localeCompare(b.itemCode, 'id-ID') : 0;
    return byItem || (a.occurredAt || a.createdAt).slice(0, 10).localeCompare((b.occurredAt || b.createdAt).slice(0, 10))
      || (a.movementSequence || 0) - (b.movementSequence || 0)
      || a.warehouseName.localeCompare(b.warehouseName, 'id-ID') || a.id.localeCompare(b.id);
  });
}

export type MovementReportHeading = { company: string; dateFrom: string; dateTo: string; warehouse: string; filters: string };

export function warehouseMovementCsv(rows: WarehouseMovement[], heading: MovementReportHeading): unknown[][] {
  return [
    [heading.company], ['Mutasi per Gudang'], ['Periode', reportDate(heading.dateFrom), reportDate(heading.dateTo)],
    ['Gudang', heading.warehouse], ['Filter', heading.filters], [],
    ['Kode Barang', 'Nama Barang', 'Nomor Dokumen', 'Tanggal', 'Jenis Transaksi', 'Deskripsi', 'Cabang', 'Gudang', 'Masuk', 'Keluar', 'Satuan', 'Verifikasi'],
    ...rows.map(row => [row.itemCode, row.itemName, row.referenceNumber || row.id, reportDate(row.occurredAt || row.createdAt),
      movementLabels[row.movementType] || row.movementType, row.notes, row.branchName, row.warehouseName, row.incoming, row.outgoing, row.unit, row.verifiedAt ? 'V' : 'Belum']),
  ];
}

const escapeHtml = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

export function warehouseMovementPrintHtml(rows: WarehouseMovement[], heading: MovementReportHeading): string {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Mutasi per Gudang</title><style>
    @page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font:11px Arial,sans-serif;color:#172b3b;margin:0}
    header{text-align:center;margin-bottom:20px}header p{margin:6px 0}h1{color:#9f1239;font-size:23px;margin:6px 0}
    .meta{display:flex;justify-content:space-between;gap:20px;margin:12px 0}.meta p{margin:0}table{width:100%;border-collapse:collapse;table-layout:fixed}
    th{text-align:left;color:#164e63;border-bottom:1px solid #334155;padding:7px 6px}td{padding:6px;vertical-align:top;overflow-wrap:anywhere;border-bottom:1px solid #e2e8f0}
    thead{display:table-header-group}tr{break-inside:avoid}.number{text-align:right;font-variant-numeric:tabular-nums}small{display:block;color:#64748b;margin-top:3px}
    footer{margin-top:12px;color:#475569}.code{width:11%}.item{width:20%}.document{width:13%}.date{width:9%}.description{width:21%}.warehouse{width:13%}.quantity{width:6.5%}.verification{width:7%}
  </style></head><body><header><p>${escapeHtml(heading.company)}</p><h1>Mutasi per Gudang</h1><p>Dari ${escapeHtml(reportDate(heading.dateFrom))} s/d ${escapeHtml(reportDate(heading.dateTo))}</p></header>
  <div class="meta"><p><b>Gudang:</b> ${escapeHtml(heading.warehouse)}</p><p>${escapeHtml(heading.filters)}</p></div>
  <table><thead><tr><th class="code">Kode Barang</th><th class="item">Nama Barang</th><th class="document">Nomor Dokumen</th><th class="date">Tanggal</th><th class="description">Deskripsi</th><th class="warehouse">Gudang</th><th class="number quantity">Masuk</th><th class="number quantity">Keluar</th><th class="verification">Verifikasi</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escapeHtml(row.itemCode)}</td><td>${escapeHtml(row.itemName)}<small>${escapeHtml(row.unit)}</small></td><td>${escapeHtml(row.referenceNumber || row.id)}</td><td>${escapeHtml(reportDate(row.occurredAt || row.createdAt))}</td><td>${escapeHtml(row.notes || movementLabels[row.movementType] || row.movementType)}<small>${escapeHtml(movementLabels[row.movementType] || row.movementType)}</small></td><td>${escapeHtml(row.warehouseName)}<small>${escapeHtml(row.branchName)}</small></td><td class="number">${reportNumber(row.incoming)}</td><td class="number">${reportNumber(row.outgoing)}</td><td>${row.verifiedAt ? 'V' : 'Belum'}</td></tr>`).join('')}</tbody></table>
  <footer>${rows.length.toLocaleString('id-ID')} baris mutasi · ${new Set(rows.map(row => row.itemId)).size.toLocaleString('id-ID')} barang</footer></body></html>`;
}
