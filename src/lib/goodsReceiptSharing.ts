import type { GoodsReceipt } from '../types';
import { receiptDateLabel, receiptManualNotes, receiptQuantityLabel } from './goodsReceiptPresentation.ts';

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

export function buildGoodsReceiptShareText(receipt: GoodsReceipt, location: { warehouseName: string }): string {
  if (!['Diterima', 'Difakturkan', 'Sebagian'].includes(receipt.status)) return '';
  const notes = receiptManualNotes(receipt.notes);
  return [
    '📦 *PENERIMAAN BARANG* ✅',
    `*${receipt.receiptNumber}* · ${receiptDateLabel(receipt.date)}`,
    location.warehouseName,
    ...receipt.items.map(item => `*${receiptQuantityLabel(item.qty, item.unit)} ${item.itemName}*`),
    `${receiptDeliveryLabel(receipt.deliveryMethod, receipt.deliveryOther)} · Ongkir *${receiptShippingCostLabel(receipt.shippingCost)}*`,
    `Diterima: *${receipt.receivedBy || '-'}*`,
    ...(notes ? [`Catatan: ${notes}`] : []),
  ].join('\n');
}
