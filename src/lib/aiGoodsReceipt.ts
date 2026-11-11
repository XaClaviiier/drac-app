import type { GoodsReceiptItem, Item } from '../types';

export interface AIReceiptDraft {
  action: 'create_goods_receipt';
  id: string;
  items: Array<{ itemId: string; qty: number }>;
  stage: 'items' | 'confirm';
  awaitingItem: boolean;
  selection?: { query: string; qty: number; itemIds: string[] };
}

export const validReceiptQty = (qty: number) => Number.isInteger(qty) && qty > 0 && qty <= 2147483647;

export function parseReceiptItemQuery(rawQuery: string) {
  const source = rawQuery.trim();
  const suffix = source.match(/(?:^|\s)(?:x\s*([\d.,+-]+)|qty\s*([\d.,+-]+)(?:\s*(?:bh|buah|units?|pcs?))?|([\d.,+-]+)\s*(?:bh|buah|units?|pcs?))\s*$/i);
  const query = (suffix ? source.slice(0, suffix.index) : source).trim();
  const qty = suffix ? Number(suffix[1] || suffix[2] || suffix[3]) : 1;
  if (!query) throw new Error('Tuliskan nama atau kode barang, misalnya: terima evap Innova lama 2bh.');
  if (!validReceiptQty(qty)) throw new Error('Qty harus bilangan bulat antara 1 dan 2147483647.');
  return { query, qty };
}

const aliasGroups = [
  ['evp', 'evap', 'evaporator'],
  ['kondensor', 'kondens', 'condenser'],
  ['komp', 'kompresor', 'compressor'],
];

export function receiptItemMatches(items: Item[], query: string): Item[] {
  const normalized = query.trim().toLocaleLowerCase('id-ID');
  const words = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  if (!words.length) return [];
  return items.filter(item => item.isActive && item.type === 'Persediaan')
    .map(item => {
      const code = item.code.toLocaleLowerCase('id-ID');
      const name = item.name.toLocaleLowerCase('id-ID');
      const exact = code === normalized || name === normalized;
      const matches = words.every(word => (aliasGroups.find(group => group.includes(word)) || [word])
        .some(term => name.includes(term) || code.includes(term)));
      return { item, score: exact ? 0 : matches ? 1 : 99 };
    })
    .filter(candidate => candidate.score < 99)
    .sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name, 'id'))
    .map(candidate => candidate.item);
}

export function newReceiptDraft(): AIReceiptDraft {
  return { action: 'create_goods_receipt', id: `${Date.now()}${Math.random().toString(36).slice(2, 8)}`, items: [], stage: 'items', awaitingItem: true };
}

// Older sessions held one item. Restore it into the same basket without posting it.
export function restoreReceiptDraft(value: unknown): AIReceiptDraft | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<AIReceiptDraft> & { itemId?: string; qty?: number };
  if (raw.action !== 'create_goods_receipt') return null;
  const lines = Array.isArray(raw.items) ? raw.items : raw.itemId ? [{ itemId: raw.itemId, qty: raw.qty ?? 1 }] : [];
  if (lines.some(line => !line || typeof line.itemId !== 'string' || !validReceiptQty(line.qty))) return null;
  const items = new Map<string, number>();
  for (const line of lines) {
    const qty = (items.get(line.itemId) || 0) + line.qty;
    if (!validReceiptQty(qty)) return null;
    items.set(line.itemId, qty);
  }
  const base = newReceiptDraft();
  return { ...base, id: typeof raw.id === 'string' && /^[a-z0-9]{1,20}$/i.test(raw.id) ? raw.id : base.id,
    items: [...items].map(([itemId, qty]) => ({ itemId, qty })), awaitingItem: items.size === 0 };
}

export function addReceiptItem(draft: AIReceiptDraft, item: Item, qty: number): AIReceiptDraft {
  if (!item.isActive || item.type !== 'Persediaan') throw new Error('Pilih barang persediaan aktif dari Master Barang.');
  const existing = draft.items.find(line => line.itemId === item.id);
  const total = (existing?.qty || 0) + qty;
  if (!validReceiptQty(qty) || !validReceiptQty(total)) throw new Error('Qty barang tidak valid atau melebihi batas.');
  const items = existing ? draft.items.map(line => line.itemId === item.id ? { ...line, qty: total } : line)
    : [...draft.items, { itemId: item.id, qty }];
  return { ...draft, items, stage: 'items', awaitingItem: false, selection: undefined };
}

export function buildReceiptLines(draft: AIReceiptDraft, master: Item[]): GoodsReceiptItem[] {
  if (!draft.items.length) throw new Error('Tambahkan minimal satu barang.');
  if (draft.selection || draft.awaitingItem) throw new Error('Selesaikan atau batalkan pencarian barang terlebih dahulu.');
  const seen = new Set<string>();
  return draft.items.map(line => {
    const item = master.find(candidate => candidate.id === line.itemId && candidate.isActive && candidate.type === 'Persediaan');
    if (!item) throw new Error('Ada barang yang tidak lagi aktif di Master Barang. Hapus lalu pilih ulang barang tersebut.');
    if (!validReceiptQty(line.qty)) throw new Error(`Qty ${item.name} harus bilangan bulat lebih dari 0.`);
    if (seen.has(item.id)) throw new Error('Barang yang sama harus digabung dalam satu baris.');
    seen.add(item.id);
    return { id: `${draft.id}-${item.id}`, itemId: item.id, itemCode: item.code, itemName: item.name,
      qty: line.qty, unit: item.unit, qtyInvoiced: 0 };
  });
}
