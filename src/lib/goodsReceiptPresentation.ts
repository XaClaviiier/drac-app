import type { GoodsReceipt, GoodsReceiptItem } from '../types';

type ReceiptDescription = Pick<GoodsReceipt, 'items' | 'notes' | 'receivedBy' | 'status'>;
const quantityFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 6 });

export function receiptQuantityLabel(qty: number, unit: string): string {
  return `${quantityFormat.format(qty)} ${unit.trim() || 'unit'}`;
}

export function receiptQuantitySummary(items: Pick<GoodsReceiptItem, 'qty' | 'unit'>[]): string {
  const totals = new Map<string, { qty: number; unit: string }>();
  for (const item of items) {
    const unit = item.unit.trim() || 'unit';
    const key = unit.toLocaleUpperCase('id-ID');
    const total = totals.get(key) || { qty: 0, unit };
    total.qty += item.qty;
    totals.set(key, total);
  }
  return [...totals.values()].map(({ qty, unit }) => receiptQuantityLabel(qty, unit)).join(' + ');
}

export function receiptDateLabel(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export function receiptStatusLabel(status: GoodsReceipt['status']): string {
  return status === 'Difakturkan' || status === 'Sebagian' ? 'Diterima' : status;
}

export function receiptDocumentNumber(receipt: Pick<GoodsReceipt, 'sourceType' | 'transferNumber' | 'receiptNumber'>): string {
  return receipt.sourceType === 'Transfer Gudang' ? receipt.transferNumber || receipt.receiptNumber : receipt.receiptNumber;
}

// Only the old, standalone boilerplate is replaced. User notes remain intact.
export function receiptManualNotes(notes?: string): string {
  const value = notes?.trim() || '';
  return /^Dibuat via Asisten AI(?: oleh [\p{L}\p{N}][\p{L}\p{N} ._'\-]*)?\.?$/iu.test(value) ? '' : value;
}

export function receiptDescription(receipt: ReceiptDescription): string {
  const manualNotes = receiptManualNotes(receipt.notes);
  if (manualNotes) return manualNotes;
  if (!receipt.items.length) return '-';
  const action = receipt.status === 'Draft' ? 'Rencana terima' : receipt.status === 'Batal' ? 'Batal terima' : 'Terima';
  const items = receipt.items.map(item => `${item.itemName} ${receiptQuantityLabel(item.qty, item.unit)}`).join(', ');
  const receiver = receipt.receivedBy?.trim();
  return `${action} ${items}${receiver && receiver !== '-' ? ` oleh ${receiver}` : ''}.`;
}
