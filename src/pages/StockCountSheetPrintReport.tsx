import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Minus, Pencil, Plus, Printer, RefreshCw, Search, SlidersHorizontal,
  X, ZoomIn, ZoomOut,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import IndonesianDateInput from '../components/IndonesianDateInput';
import { api } from '../lib/apiClient';
import { localDateKey } from '../lib/date';

type ReportRow = {
  id: string;
  code: string;
  name: string;
  unit: string;
  categoryId: string;
  categoryName: string;
  brand: string;
  quantity: number;
};

type ReportData = {
  date: string;
  warehouse: { id: string; code: string; name: string };
  branch: { id: string; name: string };
  rows: ReportRow[];
};

type FilterColumn = 'category' | 'quantity' | 'brand' | 'code' | 'name';
type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';
type ReportFilter = { id: string; column: FilterColumn; operator: FilterOperator; value: string };

const columnLabels: Record<FilterColumn, string> = {
  category: 'Kategori Barang', quantity: 'Kuantitas', brand: 'Merek Barang', code: 'Kode Barang', name: 'Nama Barang',
};
const operatorLabels: Record<FilterOperator, string> = {
  eq: 'adalah', neq: 'bukan', gt: 'lebih dari', gte: 'minimal', lt: 'kurang dari', lte: 'maksimal', contains: 'mengandung',
};
const numericOperators: FilterOperator[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'];
const textOperators: FilterOperator[] = ['eq', 'neq', 'contains'];
const escapeHtml = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

function filterLabel(filter: ReportFilter, categories: Array<{ id: string; name: string }>) {
  const value = filter.column === 'category' ? categories.find(category => category.id === filter.value)?.name || filter.value : filter.value;
  return `${columnLabels[filter.column]} ${operatorLabels[filter.operator]} ${value}`;
}

export default function StockCountSheetPrintReport() {
  const { data, currentBranchId } = useApp();
  const initialBranchId = currentBranchId === 'ALL' ? 'ALL' : currentBranchId;
  const [showParameters, setShowParameters] = useState(true);
  const [parameterTab, setParameterTab] = useState<'general' | 'columns'>('general');
  const [date, setDate] = useState(localDateKey());
  const [branchId, setBranchId] = useState(initialBranchId);
  const [warehouseId, setWarehouseId] = useState('');
  const [filters, setFilters] = useState<ReportFilter[]>([]);
  const [selectedFilterId, setSelectedFilterId] = useState('');
  const [editingFilter, setEditingFilter] = useState<ReportFilter | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [zoom, setZoom] = useState(1);

  const branches = useMemo(() => data.branches.filter(branch => branch.isActive), [data.branches]);
  const warehouses = useMemo(() => data.warehouses.filter(warehouse => warehouse.isActive && !warehouse.isSystem && (branchId === 'ALL' || warehouse.branchId === branchId)), [branchId, data.warehouses]);
  const categories = useMemo(() => data.itemCategories.filter(category => category.isActive), [data.itemCategories]);
  useEffect(() => {
    if (warehouseId && !warehouses.some(warehouse => warehouse.id === warehouseId)) setWarehouseId('');
  }, [warehouseId, warehouses]);

  const filteredRows = useMemo(() => (report?.rows || []).filter(row => filters.every(filter => {
    const source = filter.column === 'category' ? row.categoryId : filter.column === 'quantity' ? row.quantity : filter.column === 'brand' ? row.brand : filter.column === 'code' ? row.code : row.name;
    if (filter.column === 'quantity') {
      const target = Number(filter.value);
      const actualQuantity = Number(source);
      if (!Number.isFinite(target)) return true;
      if (filter.operator === 'eq') return actualQuantity === target;
      if (filter.operator === 'neq') return actualQuantity !== target;
      if (filter.operator === 'gt') return actualQuantity > target;
      if (filter.operator === 'gte') return actualQuantity >= target;
      if (filter.operator === 'lt') return actualQuantity < target;
      if (filter.operator === 'lte') return actualQuantity <= target;
      return true;
    }
    const actual = String(source || '').toLocaleLowerCase('id-ID');
    const target = filter.value.toLocaleLowerCase('id-ID');
    if (filter.operator === 'neq') return actual !== target;
    if (filter.operator === 'contains') return actual.includes(target);
    return actual === target;
  })), [filters, report]);

  const groupedRows = useMemo(() => {
    const grouped = new Map<string, ReportRow[]>();
    filteredRows.forEach(row => grouped.set(row.categoryName || 'Tanpa Kategori', [...(grouped.get(row.categoryName || 'Tanpa Kategori') || []), row]));
    return [...grouped.entries()];
  }, [filteredRows]);

  const showReport = async () => {
    if (!warehouseId) { setMessage('Gudang wajib dipilih.'); setParameterTab('general'); return; }
    setLoading(true); setMessage('');
    try {
      const response = await api.get<ReportData>(`stock-count-report?date=${encodeURIComponent(date)}&warehouseId=${encodeURIComponent(warehouseId)}&branchId=${encodeURIComponent(branchId)}`);
      if (!response.success || !response.data) throw new Error(response.message || 'Laporan gagal dimuat.');
      setReport(response.data); setShowParameters(false);
    } catch (error: any) {
      setMessage(error?.message || 'Laporan gagal dimuat.');
    } finally { setLoading(false); }
  };

  const saveFilter = () => {
    if (!editingFilter?.value.trim()) return;
    setFilters(current => current.some(filter => filter.id === editingFilter.id) ? current.map(filter => filter.id === editingFilter.id ? editingFilter : filter) : [...current, editingFilter]);
    setSelectedFilterId(editingFilter.id); setEditingFilter(null);
  };

  const printReport = () => {
    if (!report) return;
    const popup = window.open('', '_blank', 'width=1000,height=800'); if (!popup) return;
    let sequence = 0;
    const body = groupedRows.map(([category, rows]) => `<tr class="group"><td colspan="7">${escapeHtml(category)}</td></tr>${rows.map(row => { sequence += 1; return `<tr><td class="seq">${sequence}</td><td>${escapeHtml(row.code)}</td><td>${escapeHtml(row.name)}</td><td class="qty">${row.quantity}</td><td>${escapeHtml(row.unit)}</td><td class="count"></td><td class="count"></td></tr>`; }).join('')}`).join('');
    const filterText = filters.length ? filters.map(filter => filterLabel(filter, categories)).join(', ') : 'Semua barang persediaan';
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Lembar Penghitungan Stok</title><style>@page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0}.head{text-align:center}.company{font:15px Georgia,serif;letter-spacing:1px}.head h1{margin:8px 0 4px;color:#8c0035;font-size:24px}.date{font:15px Georgia,serif;letter-spacing:1px}.meta{text-align:right;font-size:8px;font-style:italic;margin:12px 0 26px}table{width:100%;border-collapse:collapse;font-size:9px}thead{display:table-header-group}th{color:#06396b;border-bottom:1px solid #222;padding:5px 4px;text-align:left;vertical-align:bottom}td{padding:4px;vertical-align:top}.group td{font-weight:bold;padding-top:9px}.seq{width:28px}.qty{text-align:right;width:45px}.count{width:76px;border-bottom:1px solid #333}tr{break-inside:avoid}</style></head><body><div class="head"><div class="company">DOKTER AC MOBIL</div><h1>Lembar Penghitungan Stok</h1><div class="date">Per Tgl. ${escapeHtml(dateLabel(report.date))}</div></div><div class="meta">Cabang: ${escapeHtml(report.branch.name)}, Gudang: ${escapeHtml(report.warehouse.name)}, Filter: ${escapeHtml(filterText)}</div><table><thead><tr><th>No.</th><th>Kode Barang</th><th>Nama Barang</th><th>Kuantitas</th><th>Satuan</th><th>Hitung #1</th><th>Hitung #2</th></tr></thead><tbody>${body}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`);
    popup.document.close();
  };

  let visibleSequence = 0;
  const filterSummary = filters.length ? filters.map(filter => filterLabel(filter, categories)).join(', ') : 'Semua barang persediaan';
  return (
    <div className="-m-3 min-h-[calc(100vh-130px)] bg-[#666] lg:-m-4">
      <div className="sticky top-0 z-10 flex h-12 items-center justify-center gap-1 border-b border-gray-300 bg-gray-100 px-3">
        <button type="button" onClick={() => setShowParameters(true)} title="Parameter laporan" className="flex h-9 w-10 items-center justify-center rounded border border-blue-500 bg-white text-blue-700"><SlidersHorizontal className="h-5 w-5" /></button>
        <button type="button" onClick={() => void showReport()} title="Muat ulang laporan" className="flex h-9 w-10 items-center justify-center rounded border border-gray-300 bg-white hover:bg-gray-50"><RefreshCw className="h-5 w-5" /></button>
        <button type="button" onClick={printReport} disabled={!report} title="Cetak atau simpan PDF" className="flex h-9 w-10 items-center justify-center rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"><Printer className="h-5 w-5" /></button>
        <span className="mx-2 h-6 border-l border-gray-300" />
        <button type="button" onClick={() => setZoom(value => Math.min(1.25, value + 0.1))} title="Perbesar" className="flex h-9 w-9 items-center justify-center rounded hover:bg-gray-200"><ZoomIn className="h-5 w-5" /></button>
        <button type="button" onClick={() => setZoom(value => Math.max(0.65, value - 0.1))} title="Perkecil" className="flex h-9 w-9 items-center justify-center rounded hover:bg-gray-200"><ZoomOut className="h-5 w-5" /></button>
      </div>
      <div className="overflow-auto px-3 py-4 lg:px-8">
        <article style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', marginBottom: `${Math.max(0, (zoom - 1) * 1120)}px` }} className="mx-auto min-h-[297mm] w-[210mm] bg-white px-[14mm] py-[16mm] shadow-xl">
          <header className="text-center">
            <p className="font-serif text-sm tracking-[0.12em] text-gray-800">DOKTER AC MOBIL</p>
            <h1 className="mt-2 text-2xl font-bold text-[#930039]">Lembar Penghitungan Stok</h1>
            <p className="mt-1 font-serif text-sm tracking-wider">Per Tgl. {report ? dateLabel(report.date) : dateLabel(date)}</p>
          </header>
          <p className="mt-3 text-right text-[9px] italic">Cabang: {report?.branch.name || '-'}, Gudang: {report?.warehouse.name || '-'}, Filter: {filterSummary}</p>
          <table className="mt-8 w-full table-fixed text-[10px]">
            <thead className="text-[#06396b]"><tr className="border-b border-gray-700"><th className="w-[7%] px-1 py-1 text-left">No.</th><th className="w-[18%] px-1 py-1 text-left">Kode Barang</th><th className="w-[35%] px-1 py-1 text-left">Nama Barang</th><th className="w-[10%] px-1 py-1 text-right">Kuantitas</th><th className="w-[9%] px-1 py-1 text-left">Satuan</th><th className="w-[11%] px-1 py-1 text-center">Hitung #1</th><th className="w-[11%] px-1 py-1 text-center">Hitung #2</th></tr></thead>
            <tbody>{groupedRows.map(([category, rows]) => <Fragment key={category}><tr><td colSpan={7} className="px-1 pb-1 pt-3 font-bold">{category}</td></tr>{rows.map(row => { visibleSequence += 1; return <tr key={row.id}><td className="px-1 py-1">{visibleSequence}</td><td className="px-1 py-1 font-mono">{row.code}</td><td className="px-1 py-1">{row.name}</td><td className="px-1 py-1 text-right">{row.quantity}</td><td className="px-1 py-1">{row.unit}</td><td className="border-b border-gray-500 px-1 py-1"/><td className="border-b border-gray-500 px-1 py-1"/></tr>; })}</Fragment>)}</tbody>
          </table>
          {!loading && report && filteredRows.length === 0 && <div className="py-16 text-center text-sm text-gray-400">Tidak ada barang yang sesuai parameter.</div>}
          {!report && <div className="py-24 text-center text-sm text-gray-400">Atur parameter lalu pilih Tampilkan.</div>}
        </article>
      </div>

      {showParameters && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-3">
        <section role="dialog" aria-modal="true" aria-label="Parameter Laporan" className="w-full max-w-[720px] overflow-hidden rounded-lg bg-white shadow-2xl">
          <header className="flex h-12 items-center justify-between bg-[#0c3262] px-4 text-white"><h2 className="text-lg font-semibold">Parameter Laporan</h2><button type="button" onClick={() => report && setShowParameters(false)} aria-label="Tutup parameter"><X className="h-6 w-6" /></button></header>
          <div className="px-4 pt-3">
            <div className="flex border-b border-gray-300"><button type="button" onClick={() => setParameterTab('general')} className={`px-5 py-3 text-base ${parameterTab === 'general' ? 'border-b-2 border-red-500 text-red-600' : 'text-gray-500'}`}>Umum</button><button type="button" onClick={() => setParameterTab('columns')} className={`px-5 py-3 text-base ${parameterTab === 'columns' ? 'border-b-2 border-red-500 text-red-600' : 'text-gray-500'}`}>Kolom</button></div>
          </div>
          <div className="min-h-[390px] p-5">
            {message && <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</div>}
            {parameterTab === 'general' ? <div className="space-y-5">
              <section><h3 className="border-b pb-2 text-2xl text-gray-700">Tanggal</h3><label className="mt-4 grid items-center gap-2 sm:grid-cols-[180px_minmax(0,1fr)]"><span>Per Tanggal <b className="text-red-500">*</b></span><IndonesianDateInput value={date} max={localDateKey()} onChange={setDate} className="h-10 w-full" /></label></section>
              <section><h3 className="border-b pb-2 text-2xl text-gray-700">Parameter Tambahan</h3><div className="mt-4 space-y-3"><label className="grid items-center gap-2 sm:grid-cols-[180px_minmax(0,1fr)]"><span>Gudang <b className="text-red-500">*</b></span><select value={warehouseId} onChange={event => setWarehouseId(event.target.value)} className="h-10 rounded border border-gray-400 bg-white px-3"><option value="">Cari/Pilih Gudang...</option>{warehouses.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label><label className="grid items-center gap-2 sm:grid-cols-[180px_minmax(0,1fr)]"><span>Cabang <b className="text-red-500">*</b></span><select value={branchId} onChange={event => { setBranchId(event.target.value); setWarehouseId(''); }} className="h-10 rounded border border-gray-400 bg-white px-3"><option value="ALL">[Semua Cabang]</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label></div></section>
            </div> : <section><h3 className="border-b pb-2 text-2xl text-gray-700">Parameter Kolom</h3><div className="mt-4 h-48 overflow-auto border border-gray-400 bg-white">{filters.map(filter => <button type="button" key={filter.id} onClick={() => setSelectedFilterId(filter.id)} className={`block w-full px-3 py-2 text-left text-sm ${selectedFilterId === filter.id ? 'bg-blue-100 text-blue-900' : 'hover:bg-gray-50'}`}>{filterLabel(filter, categories)}</button>)}</div><div className="mt-2 flex gap-1"><button type="button" onClick={() => setEditingFilter({ id: `filter-${Date.now()}`, column: 'category', operator: 'eq', value: '' })} title="Tambah filter" className="flex h-10 w-12 items-center justify-center rounded bg-green-600 text-white"><Plus className="h-6 w-6" /></button><button type="button" disabled={!selectedFilterId} onClick={() => setEditingFilter(filters.find(filter => filter.id === selectedFilterId) || null)} title="Edit filter" className="flex h-10 w-12 items-center justify-center rounded bg-gray-200 text-gray-500 disabled:opacity-45"><Pencil className="h-5 w-5" /></button><button type="button" disabled={!selectedFilterId} onClick={() => { setFilters(current => current.filter(filter => filter.id !== selectedFilterId)); setSelectedFilterId(''); }} title="Hapus filter" className="flex h-10 w-12 items-center justify-center rounded bg-gray-200 text-gray-500 disabled:opacity-45"><Minus className="h-5 w-5" /></button></div></section>}
          </div>
          <footer className="flex justify-end border-t border-gray-300 p-4"><button type="button" disabled={loading} onClick={() => void showReport()} className="h-12 rounded bg-blue-800 px-7 text-lg font-semibold text-white disabled:opacity-50">{loading ? 'Memuat...' : 'Tampilkan'}</button></footer>
        </section>
      </div>}

      {editingFilter && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-3"><section role="dialog" aria-modal="true" aria-label="Penyaringan Data" className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-2xl"><header className="flex h-12 items-center justify-between bg-[#0c3262] px-4 text-white"><h3 className="font-semibold">Penyaringan Data</h3><button type="button" onClick={() => setEditingFilter(null)}><X /></button></header><div className="space-y-3 p-4"><label className="grid grid-cols-[110px_1fr] items-center gap-2"><span>Kolom</span><select value={editingFilter.column} onChange={event => { const column = event.target.value as FilterColumn; setEditingFilter({ ...editingFilter, column, operator: column === 'quantity' ? 'eq' : 'eq', value: '' }); }} className="h-10 rounded border border-gray-400 bg-white px-3">{Object.entries(columnLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="grid grid-cols-[110px_1fr] items-center gap-2"><span>Operator</span><select value={editingFilter.operator} onChange={event => setEditingFilter({ ...editingFilter, operator: event.target.value as FilterOperator })} className="h-10 rounded border border-gray-400 bg-white px-3">{(editingFilter.column === 'quantity' ? numericOperators : textOperators).map(operator => <option key={operator} value={operator}>{operatorLabels[operator]}</option>)}</select></label><label className="grid grid-cols-[110px_1fr] items-center gap-2"><span>Nilai</span>{editingFilter.column === 'category' ? <select value={editingFilter.value} onChange={event => setEditingFilter({ ...editingFilter, value: event.target.value })} className="h-10 rounded border border-gray-400 bg-white px-3"><option value="">Cari/Pilih...</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select> : <div className="relative"><input type={editingFilter.column === 'quantity' ? 'number' : 'text'} value={editingFilter.value} onChange={event => setEditingFilter({ ...editingFilter, value: event.target.value })} placeholder="Cari/Pilih..." className="h-10 w-full rounded border border-gray-400 px-3 pr-9"/><Search className="absolute right-3 top-2.5 h-5 w-5" /></div>}</label></div><footer className="flex justify-end border-t p-3"><button type="button" onClick={saveFilter} className="h-11 rounded bg-green-600 px-6 font-semibold text-white">Simpan</button></footer></section></div>}
    </div>
  );
}
