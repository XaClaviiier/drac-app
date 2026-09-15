export const IMPORT_MAX_ROWS = 5000;
export const IMPORT_MAX_BYTES = 8 * 1024 * 1024;
export const importFields = {
  name: ['Nama', 'name_clean', 'name'], phone: ['Handphone', 'phone'],
  businessPhone: ['No. Telp. Bisnis', 'business_phone'], category: ['Kategori', 'customer_category', 'category'],
  accurateId: ['ID Pelanggan', 'accurate_id'], email: ['Email'], address: ['Alamat Penagihan', 'address'],
  contact: ['Kontak', 'contact'], description: ['Default Deskripsi', 'description'],
} as const;
export type ImportField = keyof typeof importFields;
export type ImportMapping = Record<ImportField, string>;
export type ImportRow = Record<ImportField, string> & { rowNumber: number };
export type ImportResult = ImportRow & {
  cleanName: string; normalizedPhone: string; categories: string[];
  status: 'new' | 'existing' | 'duplicate' | 'conflict' | 'invalid' | 'created';
  reason: string; customerId?: string; duplicateOf?: number;
};
export type ImportPreview = { rows: ImportResult[]; digest: string; counts: Record<string, number>; verified?: boolean };
export type ImportTable = { headers: string[]; rows: { rowNumber: number; cells: string[] }[] };

// RFC 4180 quoted fields, embedded newlines, BOM, comma and semicolon exports.
export function parseCustomerCsv(text: string): string[][] {
  text = text.replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/, 1)[0];
  const delimiter = (first.match(/;/g)?.length || 0) > (first.match(/,/g)?.length || 0) ? ';' : ',';
  const rows: string[][] = []; let row: string[] = [], value = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else value += c;
    } else if (c === '"' && value === '' && !closed) quoted = true;
    else if (c === delimiter) { row.push(value); value = ''; closed = false; }
    else if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(value); rows.push(row); row = []; value = ''; closed = false;
    } else { if (closed || c === '"') throw new Error('CSV memiliki tanda kutip tidak valid.'); value += c; }
  }
  if (quoted) throw new Error('CSV memiliki tanda kutip yang belum ditutup.');
  if (value || row.length || closed) { row.push(value); rows.push(row); }
  return rows;
}

export function customerTable(matrix: string[][]): ImportTable {
  const headerIndex = matrix.findIndex(row => row.some(cell => importFields.name.some(alias => alias.toLowerCase() === cell.trim().toLowerCase())));
  if (headerIndex < 0) throw new Error('Header Nama / name_clean / name tidak ditemukan. Gunakan template.');
  const headers = matrix[headerIndex].map(cell => cell.trim());
  const nonempty = headers.filter(Boolean).map(h => h.toLowerCase());
  if (new Set(nonempty).size !== nonempty.length) throw new Error('Header kolom duplikat.');
  const rows = matrix.slice(headerIndex + 1).map((cells, i) => ({ rowNumber: headerIndex + i + 2, cells }))
    .filter(row => row.cells.some(cell => cell.trim()));
  if (!rows.length || rows.length > IMPORT_MAX_ROWS) throw new Error(`File harus berisi 1–${IMPORT_MAX_ROWS} baris data.`);
  if (rows.some(row => row.cells.length > headers.length)) throw new Error('Ada baris dengan kolom melebihi header.');
  return { headers, rows };
}

export function guessCustomerMapping(headers: string[]): ImportMapping {
  return Object.fromEntries(Object.entries(importFields).map(([field, aliases]) => [field, headers.find(h => aliases.some(a => a.toLowerCase() === h.toLowerCase())) || ''])) as ImportMapping;
}

export function mapCustomerRows(table: ImportTable, mapping: ImportMapping): ImportRow[] {
  if (!mapping.name || !mapping.phone) throw new Error('Pilih kolom nama dan telepon.');
  const selected = Object.values(mapping).filter(Boolean);
  if (new Set(selected).size !== selected.length) throw new Error('Satu kolom tidak boleh dipakai untuk dua field.');
  return table.rows.map(row => ({ rowNumber: row.rowNumber, ...Object.fromEntries(Object.entries(mapping).map(([field, header]) => [field, header ? row.cells[table.headers.indexOf(header)] || '' : ''])) })) as ImportRow[];
}

export async function readCustomerFile(file: File): Promise<ImportTable> {
  if (file.size > IMPORT_MAX_BYTES) throw new Error('Ukuran file maksimal 8 MB.');
  if (/\.csv$/i.test(file.name)) return customerTable(parseCustomerCsv(await file.text()));
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Gunakan CSV atau XLSX (bukan XLS).');
  const { default: ExcelJS } = await import('exceljs');
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await file.arrayBuffer());
  const sheet = book.getWorksheet('Daftar Pelanggan') || (book.worksheets.length === 1 ? book.worksheets[0] : undefined);
  if (!sheet) throw new Error('Pilih workbook satu sheet atau sheet bernama Daftar Pelanggan.');
  if (sheet.rowCount > IMPORT_MAX_ROWS + 20 || sheet.columnCount > 200) throw new Error('Workbook melebihi batas baris/kolom.');
  const matrix: string[][] = [];
  // Iterate actual addressed cells: Accurate may declare A1 while containing 1000+ rows.
  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r); const cells: string[] = [];
    for (let c = 1; c <= sheet.columnCount; c++) {
      const cell = row.getCell(c);
      if (cell.type === ExcelJS.ValueType.Formula || cell.type === ExcelJS.ValueType.Error) throw new Error(`Sel ${cell.address} berisi formula/error. Ekspor nilai saja.`);
      cells.push(cell.text);
    }
    matrix.push(cells);
  }
  return customerTable(matrix);
}

export function downloadImportCsv(filename: string, rows: unknown[][]) {
  const escape = (value: unknown) => {
    let text = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
    if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}
