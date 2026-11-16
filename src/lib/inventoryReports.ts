import type { StockMovement } from '../types';

export type ReportWarehouse = { id: string; name: string; branchId: string; branchName: string };
export type ReportItem = { id: string; code: string; name: string; unit: string; categoryName: string };
export type InventoryReportOptions = { warehouses: ReportWarehouse[]; items: ReportItem[]; canViewCosts: boolean; asOf: string };
export type InventoryBalance = {
  itemId: string; code: string; name: string; unit: string; categoryName: string;
  warehouseId: string; warehouseName: string; branchId: string; branchName: string;
  quantity: number; reservedQuantity: number; averageCost?: number; inventoryValue?: number;
};
export type InventoryBalancesReport = InventoryReportOptions & { rows: InventoryBalance[] };
export type StockCardReportData = InventoryReportOptions & {
  item: ReportItem; warehouse: ReportWarehouse; dateFrom: string; dateTo: string;
  opening: number; incoming: number; outgoing: number; closing: number; rows: StockMovement[];
};
export const stockAvailability = [
  ['ALL', 'Semua Stok'], ['AVAILABLE', 'Tersedia'], ['EMPTY', 'Kosong'], ['NEGATIVE', 'Minus'], ['ATTENTION', 'Kosong / Minus'],
] as const;
export function matchesStockAvailability(quantity: number, filter: string): boolean {
  return filter === 'AVAILABLE' ? quantity > 0 : filter === 'EMPTY' ? quantity === 0 : filter === 'NEGATIVE' ? quantity < 0 : filter === 'ATTENTION' ? quantity <= 0 : true;
}
export function inventoryBalanceCsv(rows: InventoryBalance[], canViewCosts: boolean): unknown[][] {
  return [
    ['Kode', 'Barang', 'Cabang', 'Gudang', 'Stok', 'Satuan', ...(canViewCosts ? ['HPP Average', 'Nilai Stok'] : [])],
    ...rows.map(row => [row.code, row.name, row.branchName, row.warehouseName, row.quantity, row.unit, ...(canViewCosts ? [row.averageCost ?? 0, row.inventoryValue ?? 0] : [])]),
  ];
}
export function downloadReportCsv(filename: string, rows: unknown[][]): void {
  const escape = (value: unknown) => {
    let text = String(value ?? '');
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const blob = new Blob(['\uFEFF' + rows.map(row => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}
export const movementLabels: Record<string, string> = {
  receipt: 'Penerimaan Barang', sale: 'Penjualan', usage: 'Pemakaian Barang', adjustment: 'Penyesuaian Stok',
  transfer: 'Transfer Gudang', transfer_send: 'Pengiriman Transfer', transfer_receive: 'Penerimaan Transfer', reversal: 'Pembatalan / Koreksi',
};
export const reportNumber = (value: number) => value.toLocaleString('id-ID', { maximumFractionDigits: 4 });
export const reportMoney = (value: number, decimals = 2) => `Rp ${value.toLocaleString('id-ID', { maximumFractionDigits: decimals })}`;
export const reportDate = (value: string) => value.slice(0, 10).split('-').reverse().join('/');
