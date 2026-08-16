import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/apiClient';
import { localDateKey } from '../lib/date';

type PreviewRow = { row: number; code: string; itemName: string; itemId: string; warehouse: string; warehouseId: string; quantity: number; unit: string; error: string };

const parseCsv = (text: string) => text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim()).map(line => {
  const cells: string[] = []; let value = ''; let quoted = false;
  for (let index = 0; index < line.length; index++) { const char = line[index]; if (char === '"') { if (quoted && line[index + 1] === '"') { value += '"'; index++; } else quoted = !quoted; } else if (char === ',' && !quoted) { cells.push(value.trim()); value = ''; } else value += char; }
  cells.push(value.trim()); return cells;
});

export default function OpeningStockImport() {
  const { data, refreshData, currentUser } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [date, setDate] = useState(localDateKey());
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const isAdmin = Boolean(currentUser?.isOwner) || String(currentUser?.roleName || '').toLowerCase().includes('admin');
  const validRows = rows.filter(row => !row.error && row.quantity !== 0);
  const errorRows = rows.filter(row => row.error);
  const duplicateKeys = useMemo(() => { const counts = new Map<string, number>(); rows.forEach(row => { const key = `${row.itemId}|${row.warehouseId}`; if (row.itemId && row.warehouseId) counts.set(key, (counts.get(key) || 0) + 1); }); return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key)); }, [rows]);

  const downloadTemplate = () => {
    const sampleWarehouse = data.warehouses.find(warehouse => warehouse.isActive && !warehouse.isSystem);
    const content = `Kode Barang,Nama Barang,Gudang,Qty Awal,Harga Pokok,Tanggal\r\nCONTOH-001,NAMA BARANG,${sampleWarehouse?.name || 'GUDANG UTAMA'},10,0,${date}`;
    const url = URL.createObjectURL(new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'template_saldo_awal_stok.csv'; link.click(); URL.revokeObjectURL(url);
  };

  const loadFile = async (file?: File) => {
    if (!file) return; setMessage(''); setFileName(file.name); setRows([]);
    try {
      let matrix: any[][];
      if (/\.xlsx?$/i.test(file.name)) { const { default: readXlsxFile } = await import('read-excel-file'); matrix = await readXlsxFile(file); }
      else matrix = parseCsv(await file.text());
      if (matrix.length < 2) throw new Error('File tidak memiliki data.');
      const headers = matrix[0].map(value => String(value || '').toLowerCase().replace(/[_#]+/g, ' ').trim());
      const column = (...names: string[]) => headers.findIndex(header => names.some(name => header === name || header.includes(name)));
      const codeIndex = column('kode barang', 'kode', 'sku'); const warehouseIndex = column('gudang', 'warehouse'); const quantityIndex = column('qty awal', 'kuantitas', 'qty', 'stok');
      if (codeIndex < 0 || warehouseIndex < 0 || quantityIndex < 0) throw new Error('Kolom wajib: Kode Barang, Gudang, dan Qty Awal.');
      const itemsByCode = new Map(data.items.filter(item => item.type === 'Persediaan' && item.isActive).map(item => [item.code.trim().toLowerCase(), item]));
      const warehousesByName = new Map<string, typeof data.warehouses[number]>(); data.warehouses.filter(warehouse => warehouse.isActive && !warehouse.isSystem).forEach(warehouse => { warehousesByName.set(warehouse.name.trim().toLowerCase(), warehouse); warehousesByName.set(warehouse.code.trim().toLowerCase(), warehouse); });
      const preview = matrix.slice(1).filter(row => row.some(value => String(value || '').trim())).map((source, index) => {
        const code = String(source[codeIndex] || '').trim(); const warehouseText = String(source[warehouseIndex] || '').trim(); const quantity = Number(String(source[quantityIndex] || '0').replace(/[^0-9-]/g, '')) || 0;
        const item = itemsByCode.get(code.toLowerCase()); const warehouse = warehousesByName.get(warehouseText.toLowerCase()); const errors: string[] = [];
        if (!item) errors.push('Kode barang tidak ditemukan/bukan persediaan aktif'); if (!warehouse) errors.push('Gudang tidak ditemukan/tidak dapat diakses'); if (!quantity) errors.push('Qty awal harus selain 0');
        return { row: index + 2, code, itemName: item?.name || '', itemId: item?.id || '', warehouse: warehouse?.name || warehouseText, warehouseId: warehouse?.id || '', quantity, unit: item?.unit || '', error: errors.join('; ') };
      });
      const counts = new Map<string, number>(); preview.forEach(row => { const key = `${row.itemId}|${row.warehouseId}`; if (row.itemId && row.warehouseId) counts.set(key, (counts.get(key) || 0) + 1); });
      setRows(preview.map(row => counts.get(`${row.itemId}|${row.warehouseId}`)! > 1 ? { ...row, error: [row.error, 'Barang dan gudang terduplikasi dalam file'].filter(Boolean).join('; ') } : row));
    } catch (error: any) { setMessage(error?.message || 'File tidak dapat dibaca.'); }
  };

  const submit = async () => {
    if (!isAdmin || !validRows.length || errorRows.length || duplicateKeys.size) return;
    setLoading(true); setMessage('');
    try {
      const normalized = validRows.map(row => `${row.itemId}|${row.warehouseId}|${row.quantity}`).sort().join(';') + `|${date}`;
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized)); const batchKey = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('').slice(0, 24).toUpperCase();
      const response = await api.create('stock-movements', { action: 'opening_balance_import', date, batchKey, rows: validRows.map(row => ({ itemId: row.itemId, warehouseId: row.warehouseId, quantity: row.quantity })) });
      if (!response.success) throw new Error(response.message || response.error || 'Import gagal.');
      await refreshData(); setMessage(`${validRows.length} saldo barang berhasil diimport. Batch ${batchKey}.`); setRows([]); setFileName(''); if (inputRef.current) inputRef.current.value = '';
    } catch (error: any) { setMessage(error?.message || 'Import saldo awal gagal.'); } finally { setLoading(false); }
  };

  return <div className="space-y-3">
    <div className="rounded-t-lg border border-slate-300 bg-[#eeeeee] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-slate-900">Saldo Awal Stok</h2><p className="text-sm text-slate-600">Import kuantitas awal per barang dan gudang. Transaksi tercatat pada kartu Mutasi.</p></div><button onClick={downloadTemplate} className="flex h-10 items-center gap-2 rounded border border-blue-600 bg-white px-4 text-sm font-semibold text-blue-700"><Download className="h-4 w-4"/>Unduh Template</button></div></div>
    {!isAdmin && <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800"><AlertTriangle className="mr-2 inline h-4 w-4"/>Import hanya dapat dilakukan Owner atau Administrator.</div>}
    <div className="grid gap-3 rounded border border-slate-300 bg-white p-4 md:grid-cols-[220px_minmax(0,1fr)_auto]"><label className="text-sm">Tanggal Saldo Awal<input type="date" value={date} onChange={event => setDate(event.target.value)} className="mt-1 h-10 w-full rounded border border-slate-300 px-3"/></label><label className="text-sm">File CSV/Excel<div className="mt-1 flex h-10 items-center rounded border border-slate-300 bg-white"><button type="button" onClick={() => inputRef.current?.click()} className="flex h-full items-center gap-2 border-r border-slate-300 px-4 text-blue-700"><Upload className="h-4 w-4"/>Pilih File</button><span className="truncate px-3 text-slate-500">{fileName || 'Belum ada file'}</span>{fileName && <button onClick={() => { setRows([]); setFileName(''); }} className="ml-auto px-3"><X className="h-4 w-4"/></button>}</div><input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" onChange={event => loadFile(event.target.files?.[0])} className="hidden"/></label><button disabled={!isAdmin || loading || !validRows.length || !!errorRows.length} onClick={submit} className="mt-6 h-10 rounded bg-blue-700 px-6 text-sm font-semibold text-white disabled:bg-slate-300">{loading ? 'Mengimpor...' : 'Import Saldo Awal'}</button></div>
    {message && <div className={`rounded border p-3 text-sm ${message.includes('berhasil') ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-red-300 bg-red-50 text-red-700'}`}>{message}</div>}
    <div className="overflow-hidden rounded-t-lg border border-slate-300 bg-white"><div className="flex items-center justify-between bg-[#eeeeee] px-4 py-3 text-sm"><span>Pratinjau: <b>{rows.length}</b> baris · Valid <b className="text-emerald-700">{validRows.length}</b> · Bermasalah <b className="text-red-700">{errorRows.length}</b></span>{rows.length > 0 && !errorRows.length && <span className="text-emerald-700"><CheckCircle2 className="mr-1 inline h-4 w-4"/>Siap diimport</span>}</div><div className="max-h-[calc(100vh-390px)] overflow-auto"><table className="min-w-[1000px] w-full text-[13px]"><thead className="sticky top-0 bg-[#637c93] text-left text-white"><tr><th className="px-3 py-2.5">Baris</th><th className="px-3 py-2.5">Kode Barang</th><th className="px-3 py-2.5">Nama Barang</th><th className="px-3 py-2.5">Gudang</th><th className="px-3 py-2.5 text-right">Qty Awal</th><th className="px-3 py-2.5">Satuan</th><th className="px-3 py-2.5">Status</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.row}-${index}`} className={`border-b ${row.error ? 'bg-red-50' : index % 2 ? 'bg-slate-50' : 'bg-white'}`}><td className="px-3 py-2">{row.row}</td><td className="px-3 py-2 font-medium text-blue-700">{row.code}</td><td className="px-3 py-2">{row.itemName || '—'}</td><td className="px-3 py-2">{row.warehouse}</td><td className="px-3 py-2 text-right font-semibold">{row.quantity}</td><td className="px-3 py-2">{row.unit}</td><td className={`px-3 py-2 ${row.error ? 'text-red-700' : 'text-emerald-700'}`}>{row.error || 'Valid'}</td></tr>)}</tbody></table>{!rows.length && <div className="py-20 text-center text-slate-400"><FileSpreadsheet className="mx-auto mb-3 h-12 w-12"/>Pilih file untuk menampilkan pratinjau.</div>}</div></div>
  </div>;
}
