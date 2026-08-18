export type StockOperator = '=' | '>' | '<' | '>=' | '<=';

export interface ItemStockSearch {
  text: string;
  stock?: { operator: StockOperator; value: number };
}

/**
 * Memisahkan pencarian teks dan perintah stok.
 * Format baku: stok=0, stok>0, stok<=1.
 * Alias cepat: =0, >0, <0, 0>, 0<, 1<.
 * Pada alias angka-di-depan, operator tetap dibaca sebagai kondisi stok
 * (contoh 0> sama dengan stok>0), sesuai kebiasaan input pengguna.
 */
export const parseItemStockSearch = (input: string): ItemStockSearch => {
  const normalized = input.trim();
  const canonical = normalized.match(/(?:^|\s)(?:stok\s*)?(<=|>=|=|<|>)\s*(-?\d+)(?=\s|$)/i);
  const suffix = canonical ? null : normalized.match(/(?:^|\s)(-?\d+)\s*(<=|>=|=|<|>)(?=\s|$)/i);
  const match = canonical || suffix;
  if (!match || match.index === undefined) return { text: normalized.toLowerCase() };

  const operator = (canonical ? match[1] : match[2]) as StockOperator;
  const value = Number(canonical ? match[2] : match[1]);
  const text = `${normalized.slice(0, match.index)} ${normalized.slice(match.index + match[0].length)}`
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  return { text, stock: { operator, value } };
};

export const matchesStockSearch = (stock: number, operator: StockOperator, value: number) => {
  if (operator === '>') return stock > value;
  if (operator === '<') return stock < value;
  if (operator === '>=') return stock >= value;
  if (operator === '<=') return stock <= value;
  return stock === value;
};
