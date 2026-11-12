import type { GoodsReceipt } from '../types';

export const receiptDeliveryOptions = ['Grab', 'Maxim', 'Supplier', 'Karyawan'] as const;
export const MAX_RECEIPT_SHIPPING_COST = 999999999999;
export const validReceiptShippingCost = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_RECEIPT_SHIPPING_COST;

export function receiptDeliveryLabel(method?: string, other?: string): string {
  if (method === 'Diantar Supplier') return 'Supplier';
  if (method === 'Lainnya') return other?.trim() || 'Lainnya';
  return method?.trim() || 'Belum dicatat';
}

export function receiptShippingCostLabel(value?: number | null): string {
  return validReceiptShippingCost(value) ? `Rp${value.toLocaleString('id-ID')}` : 'Belum dicatat';
}

export function buildGoodsReceiptShareText(receipt: GoodsReceipt, location: { branchName: string; warehouseName: string }): string {
  if (!['Diterima', 'Difakturkan', 'Sebagian'].includes(receipt.status)) return '';
  const date = new Date(`${receipt.date}T00:00:00`);
  const dateLabel = Number.isNaN(date.getTime()) ? receipt.date : date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  return [
    '📦 *PENERIMAAN BARANG*', '',
    `No: ${receipt.receiptNumber}`, `Tanggal: ${dateLabel}`,
    `Cabang: ${location.branchName}`, `Gudang: ${location.warehouseName}`, '',
    `🚚 Pengiriman via: *${receiptDeliveryLabel(receipt.deliveryMethod, receipt.deliveryOther)}*`,
    `💰 Biaya kirim: *${receiptShippingCostLabel(receipt.shippingCost)}*`, '',
    '*Rincian Barang:*',
    ...receipt.items.map((item, index) => `${index + 1}. ${item.itemName}\n   Kode: ${item.itemCode}\n   Qty: *${item.qty.toLocaleString('id-ID')} ${item.unit}*`), '',
    `Diterima oleh: ${receipt.receivedBy || '-'}`, '✅ *Sudah diterima*',
  ].join('\n');
}
