export type ItemColumn = 'code' | 'name' | 'receiptDescription' | 'type' | 'category' | 'barcode' | 'price' | 'stock' | 'minimumStock' | 'unit' | 'brand' | 'purchasePrice' | 'status' | 'actions';

export const defaultItemColumns: ItemColumn[] = ['code', 'barcode', 'name', 'stock', 'minimumStock', 'unit', 'category', 'brand', 'actions'];

export const itemColumnLabels: Record<ItemColumn, string> = {
  code: 'Kode',
  barcode: 'Barcode',
  name: 'Nama Barang/Jasa',
  receiptDescription: 'Deskripsi Nota',
  type: 'Jenis',
  category: 'Kategori',
  price: 'Harga Jual',
  stock: 'KTS/Stok',
  minimumStock: 'Min. Stok',
  unit: 'Satuan',
  brand: 'Merek',
  purchasePrice: 'Harga Beli',
  status: 'Status Aktif',
  actions: 'Aksi',
};

export const defaultItemColumnWidths: Record<ItemColumn, number> = {
  code: 140,
  name: 360,
  receiptDescription: 240,
  type: 140,
  category: 180,
  barcode: 180,
  price: 150,
  stock: 100,
  minimumStock: 100,
  unit: 100,
  brand: 150,
  purchasePrice: 150,
  status: 120,
  actions: 100,
};

export function restoreItemColumns(saved: unknown, upgradeLegacy = false): ItemColumn[] {
  if (!Array.isArray(saved)) return [...defaultItemColumns];
  const columns = [...new Set(saved.filter((column): column is ItemColumn =>
    typeof column === 'string' && Object.prototype.hasOwnProperty.call(itemColumnLabels, column)
  ))];
  if (!columns.includes('name')) columns.push('name');
  if (!columns.includes('actions')) columns.push('actions');
  if (upgradeLegacy) {
    for (const [column, anchor] of [['barcode', 'code'], ['minimumStock', 'stock']] as const) {
      if (columns.includes(column)) continue;
      const anchorIndex = columns.indexOf(anchor);
      columns.splice(anchorIndex >= 0 ? anchorIndex + 1 : columns.indexOf('actions'), 0, column);
    }
  }
  return columns;
}
