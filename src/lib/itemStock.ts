import type { Item } from '../types';

export function itemMinimumStock(item: Pick<Item, 'minimumStock'>): number {
  const minimum = Number(item.minimumStock ?? 0);
  return Number.isInteger(minimum) && minimum >= 0 ? minimum : 0;
}

export function itemStockForBranch(item: Pick<Item, 'stock' | 'branchStocks'>, branchId: string): number {
  const stock = Number(branchId === 'ALL' ? item.stock : item.branchStocks?.[branchId]?.stock ?? 0);
  return Number.isFinite(stock) ? stock : 0;
}

export function isItemBelowMinimum(item: Pick<Item, 'type' | 'minimumStock'>, stock: number): boolean {
  return item.type === 'Persediaan' && stock < itemMinimumStock(item);
}
