export type JournalRow = {
  id: string; date: string; number: string; description: string;
  sourceType?: string; sourceId?: string; transactionNumber?: string;
  partyType?: string | null; partyId?: string | null; partyName?: string | null;
  branchId?: string | null; branchName?: string | null; total: number;
};

export type DateSelection = {
  mode: 'from' | 'relative'; from: string; untilEnabled: boolean; to: string;
  duration: string; unit: 'Hari' | 'Minggu' | 'Bulan';
};

export const JOURNAL_TYPES = ['Aset Tetap', 'Disposisi Aset Tetap', 'Faktur Pembelian', 'Faktur Penjualan', 'Jurnal Umum', 'Pekerjaan Pesanan', 'Penerimaan Penjualan', 'Pembayaran Pembelian'] as const;
export const JOURNAL_COLUMNS = ['Nomor #', 'No. Trans #', 'Tanggal', 'Tipe Transaksi', 'Keterangan', 'Total', 'Cabang', 'Nama Pihak'] as const;
export const DEFAULT_JOURNAL_COLUMNS = JOURNAL_COLUMNS.slice(0, 6);

export const sourceLabel = (type?: string) => ({
  sales_invoice: 'Faktur Penjualan', customer_payment: 'Penerimaan Penjualan',
  purchase_invoice: 'Faktur Pembelian', supplier_payment: 'Pembayaran Pembelian',
  fixed_asset: 'Aset Tetap', asset_disposal: 'Disposisi Aset Tetap',
  work_order: 'Pekerjaan Pesanan', manual: 'Jurnal Umum',
}[type || 'manual'] || type || 'Jurnal Umum');

export function journalSourceType(label: string): string {
  return ({ 'Aset Tetap': 'fixed_asset', 'Disposisi Aset Tetap': 'asset_disposal', 'Faktur Pembelian': 'purchase_invoice', 'Faktur Penjualan': 'sales_invoice', 'Jurnal Umum': 'manual', 'Pekerjaan Pesanan': 'work_order', 'Penerimaan Penjualan': 'customer_payment', 'Pembayaran Pembelian': 'supplier_payment' } as Record<string, string>)[label] || label;
}

export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export const blankDateSelection = (): DateSelection => ({ mode: 'from', from: '', untilEnabled: false, to: '', duration: '0', unit: 'Bulan' });

function validDate(value: string): boolean {
  const parsed = new Date(`${value}T12:00:00`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parsed.getTime()) && localDate(parsed) === value && value >= '1000-01-01';
}

export function journalDateBounds(selection: DateSelection | null, now = new Date()): { from: string; to: string } {
  if (!selection) return { from: '1000-01-01', to: '9999-12-31' };
  if (selection.mode === 'from') {
    if (!validDate(selection.from)) throw new Error('Isi Dari tanggal dengan tanggal yang valid.');
    if (selection.untilEnabled && !validDate(selection.to)) throw new Error('Isi Hingga tanggal dengan tanggal yang valid.');
    if (selection.untilEnabled && selection.to < selection.from) throw new Error('Hingga tanggal tidak boleh sebelum Dari tanggal.');
    return { from: selection.from, to: selection.untilEnabled ? selection.to : '9999-12-31' };
  }
  const count = Number(selection.duration);
  if (!Number.isSafeInteger(count) || count < 1 || count > 10000) throw new Error('Durasi harus berupa bilangan bulat antara 1 dan 10000.');
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  if (selection.unit === 'Bulan') {
    const day = start.getDate();
    start.setDate(1);
    start.setMonth(start.getMonth() - count);
    const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    start.setDate(Math.min(day, lastDay));
  } else start.setDate(start.getDate() - count * (selection.unit === 'Minggu' ? 7 : 1));
  const from = localDate(start);
  if (!validDate(from)) throw new Error('Durasi menghasilkan tanggal di luar rentang yang didukung.');
  return { from, to: localDate(now) };
}

export function journalDateLabel(selection: DateSelection | null): string {
  if (!selection) return 'Semua';
  if (selection.mode === 'relative') return `${selection.duration} ${selection.unit} terakhir`;
  return selection.untilEnabled ? `${selection.from} – ${selection.to}` : `Dari ${selection.from}`;
}

export function journalCell(row: JournalRow, column: string, branches: ReadonlyMap<string, string>): string | number {
  switch (column) {
    case 'Nomor #': return row.number;
    case 'No. Trans #': return row.transactionNumber || row.sourceId || '';
    case 'Tanggal': return row.date;
    case 'Tipe Transaksi': return sourceLabel(row.sourceType);
    case 'Keterangan': return row.description;
    case 'Total': return Number(row.total);
    case 'Cabang': return row.branchName || branches.get(String(row.branchId)) || 'Tanpa cabang / umum';
    case 'Nama Pihak': return row.partyName || '';
    default: return '';
  }
}

export function visibleJournals(rows: JournalRow[], filters: { types: string[]; branches: string[]; search: string }, sort: { column: string; asc: boolean }, branches: ReadonlyMap<string, string>): JournalRow[] {
  const query = filters.search.trim().toLocaleLowerCase('id');
  return rows.filter(row => (!filters.types.length || filters.types.includes(sourceLabel(row.sourceType)))
    && (!filters.branches.length || filters.branches.includes(String(row.branchId ?? '')))
    && (!query || JOURNAL_COLUMNS.some(column => String(journalCell(row, column, branches)).toLocaleLowerCase('id').includes(query))))
    .sort((a, b) => {
      const left = journalCell(a, sort.column, branches), right = journalCell(b, sort.column, branches);
      return (typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right), 'id', { numeric: true })) * (sort.asc ? 1 : -1);
    });
}

export function journalCsv(rows: JournalRow[], columns: string[], branches: ReadonlyMap<string, string>): string {
  const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  return '\ufeff' + [columns, ...rows.map(row => columns.map(column => journalCell(row, column, branches)))].map(row => row.map(escape).join(';')).join('\r\n');
}
