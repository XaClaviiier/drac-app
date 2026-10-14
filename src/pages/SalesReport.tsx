import { useMemo, useState } from 'react';
import { ArrowDownToLine, BarChart3, CalendarDays, CircleDollarSign, FileText, Printer, Search, SlidersHorizontal, WalletCards } from 'lucide-react';
import { useApp } from '../context/AppContext';
import IndonesianDateInput from '../components/IndonesianDateInput';
import ActiveFilterResetButton from '../components/ActiveFilterResetButton';

const money = (value: number) => `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const csv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const html = (value: unknown) => String(value ?? '-').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] || character));
const dateLabel = (value: string) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-';

export default function SalesReport() {
  const { data, currentBranchId } = useApp();
  const now = new Date();
  const [from, setFrom] = useState(localDate(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(localDate(now));
  const [status, setStatus] = useState('ALL');
  const [branchId, setBranchId] = useState(currentBranchId === 'ALL' ? '' : currentBranchId);
  const [search, setSearch] = useState('');
  const defaultFrom = localDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const defaultTo = localDate(now);
  const filtersActive = Boolean(from !== defaultFrom || to !== defaultTo || status !== 'ALL' || (currentBranchId === 'ALL' && branchId));
  const resetFilters = () => {
    setFrom(defaultFrom);
    setTo(defaultTo);
    setStatus('ALL');
    setBranchId(currentBranchId === 'ALL' ? '' : currentBranchId);
  };

  const rows = useMemo(() => data.invoices.filter(invoice => {
    const effectiveBranch = currentBranchId === 'ALL' ? branchId : currentBranchId;
    if (effectiveBranch && invoice.branchId !== effectiveBranch) return false;
    if (from && invoice.date < from) return false;
    if (to && invoice.date > to) return false;
    if (status !== 'ALL' && invoice.status !== status) return false;
    const customer = data.customers.find(item => item.id === invoice.customerRefId || item.customerCode === invoice.customerId);
    return `${invoice.invoiceNumber} ${invoice.customerName} ${customer?.phone || ''} ${invoice.vehicleInfo} ${invoice.woNumber || ''}`.toLowerCase().includes(search.toLowerCase());
  }).sort((a, b) => b.date.localeCompare(a.date) || b.invoiceNumber.localeCompare(a.invoiceNumber)), [data.invoices, data.customers, currentBranchId, branchId, from, to, status, search]);

  const billed = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const received = rows.reduce((sum, row) => sum + Number(row.payment || 0), 0);
  const outstanding = Math.max(0, billed - received);
  const average = rows.length ? billed / rows.length : 0;
  const paidCount = rows.filter(row => row.status === 'Lunas').length;
  const periodLabel = `${from ? new Date(`${from}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'} – ${to ? new Date(`${to}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}`;
  const setPeriod = (mode: 'today' | 'month' | 'last') => {
    const date = new Date();
    const start = mode === 'today' ? date : mode === 'last' ? new Date(date.getFullYear(), date.getMonth() - 1, 1) : new Date(date.getFullYear(), date.getMonth(), 1);
    const end = mode === 'last' ? new Date(date.getFullYear(), date.getMonth(), 0) : date;
    setFrom(localDate(start)); setTo(localDate(end));
  };
  const exportCsv = () => {
    const header = ['Tanggal', 'Invoice', 'WO', 'Cabang', 'Pelanggan', 'Kendaraan', 'Nilai', 'Dibayar', 'Piutang', 'Status'];
    const body = rows.map(row => [row.date, row.invoiceNumber, row.woNumber || '', data.branches.find(b => b.id === row.branchId)?.name || '', row.customerName, row.vehicleInfo, row.total, row.payment, Math.max(0, row.total - row.payment), row.status].map(csv).join(','));
    const blob = new Blob(['\uFEFF' + [header.map(csv).join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `laporan_penjualan_${from}_${to}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  const printReport = () => {
    const popup = window.open('', '_blank', 'noopener,noreferrer,width=1280,height=800');
    if (!popup) return;
    const branchLabel = branchId ? data.branches.find(branch => branch.id === branchId)?.name || '-' : 'Semua Cabang';
    const tableRows = rows.map(row => {
      const due = Math.max(0, row.total - row.payment);
      return `<tr><td><b>${html(row.invoiceNumber)}</b><small>${html(dateLabel(row.date))}</small></td><td>${html(data.branches.find(branch => branch.id === row.branchId)?.name || '-')}</td><td><b>${html(row.customerName)}</b></td><td>${html(row.vehicleInfo || '-')}</td><td>${html(row.woNumber || '-')}</td><td class="num">${html(money(row.total))}</td><td class="num paid">${html(money(row.payment))}</td><td class="num due">${html(money(due))}</td><td><span class="status ${row.status === 'Lunas' ? 'paid-status' : 'due-status'}">${html(row.status)}</span></td></tr>`;
    }).join('');
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Laporan Penjualan ${html(from)} - ${html(to)}</title><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;color:#172033;font-size:11px}.page{max-width:1400px;margin:0 auto;padding:12mm}.brand{font-size:11px;font-weight:700;letter-spacing:.08em;color:#1d4ed8;text-transform:uppercase}.title-row{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1e3a8a;padding-bottom:12px;margin-bottom:10px}h1{font-size:24px;margin:4px 0}.subtitle,.meta{color:#667085;font-size:11px}.meta{text-align:right;line-height:1.7}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0}.box{border:1px solid #d0d5dd;border-radius:6px;padding:9px 11px}.box span{display:block;color:#667085;font-size:10px}.box b{display:block;margin-top:4px;font-size:15px}.blue b{color:#1d4ed8}.green b,.paid{color:#15803d}.amber b,.due{color:#b45309}.purple b{color:#7e22ce}.scope{background:#eff6ff;border:1px solid #bfdbfe;border-radius:5px;padding:7px 9px;color:#475467;margin-bottom:12px}table{width:100%;border-collapse:collapse;font-size:10px}th{background:#1e293b;color:#fff;text-align:left;padding:8px 7px;font-size:9px;text-transform:uppercase;letter-spacing:.04em}td{border-bottom:1px solid #e4e7ec;padding:7px;vertical-align:top}tr:nth-child(even){background:#f8fafc}small{display:block;color:#667085;margin-top:3px}.num{text-align:right;white-space:nowrap}.status{display:inline-block;border-radius:12px;padding:4px 7px;font-weight:700;font-size:9px}.paid-status{background:#dcfce7;color:#166534}.due-status{background:#fef3c7;color:#92400e}.footer{border-top:1px solid #d0d5dd;margin-top:15px;padding-top:8px;color:#667085;font-size:9px;display:flex;justify-content:space-between}@page{size:landscape;margin:0}@media print{.page{padding:10mm}}
      </style></head><body><main class="page"><div class="title-row"><div><div class="brand">DOKTER AC MOBIL</div><h1>Laporan Penjualan</h1><div class="subtitle">Ringkasan faktur, pembayaran, dan piutang pelanggan</div></div><div class="meta"><b>Periode</b><br>${html(periodLabel)}<br>Dicetak ${html(new Date().toLocaleString('id-ID'))}</div></div><div class="scope"><b>Filter laporan:</b> ${html(branchLabel)} &nbsp;·&nbsp; ${html(status === 'ALL' ? 'Semua Status' : status)} &nbsp;·&nbsp; ${rows.length} faktur</div><div class="summary"><div class="box blue"><span>Nilai Invoice</span><b>${html(money(billed))}</b><span>${rows.length} faktur</span></div><div class="box green"><span>Pembayaran Diterima</span><b>${html(money(received))}</b><span>${Math.round(billed ? received / billed * 100 : 0)}% tertagih</span></div><div class="box amber"><span>Piutang</span><b>${html(money(outstanding))}</b><span>${rows.filter(row => row.status === 'Belum Lunas').length} belum lunas</span></div><div class="box purple"><span>Rata-rata Transaksi</span><b>${html(money(average))}</b><span>per faktur</span></div></div><table><thead><tr><th>Tanggal / Invoice</th><th>Cabang</th><th>Pelanggan</th><th>Kendaraan</th><th>WO</th><th>Nilai</th><th>Dibayar</th><th>Piutang</th><th>Status</th></tr></thead><tbody>${tableRows || '<tr><td colspan="9" style="text-align:center;padding:30px;color:#667085">Tidak ada penjualan sesuai filter.</td></tr>'}</tbody></table><div class="footer"><span>Laporan Penjualan · ${html(periodLabel)}</span><span>${rows.length} transaksi</span></div></main><script>window.onload=()=>{window.focus();window.print()}<\/script></body></html>`);
    popup.document.close();
  };

  return <div className="app-fill-stack space-y-4 pb-5">
    <section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between lg:px-5">
      <div className="flex items-start gap-3"><span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><BarChart3 className="h-5 w-5" /></span><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold text-slate-800">Laporan Penjualan</h1><span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-blue-700">Ringkasan</span></div><p className="mt-1 text-sm text-slate-500">Pantau nilai faktur, pembayaran, dan piutang pelanggan.</p></div></div>
      <div className="flex gap-2"><button onClick={printReport} disabled={!rows.length} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><Printer className="h-4 w-4"/>Cetak / PDF</button><button onClick={exportCsv} disabled={!rows.length} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-blue-600 bg-white px-3 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"><ArrowDownToLine className="h-4 w-4"/>Export CSV</button></div>
    </section>
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-md border border-blue-100 bg-blue-50/60 px-4 py-2.5 text-xs text-slate-600"><span className="inline-flex items-center gap-1.5 font-semibold text-slate-700"><CalendarDays className="h-4 w-4 text-blue-700" /> Periode {periodLabel}</span><span>{rows.length} faktur ditemukan</span><span>{paidCount} lunas</span><span>{rows.length - paidCount} belum lunas</span></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Summary icon={FileText} label="Nilai Invoice" value={money(billed)} note={`${rows.length} faktur`} tone="blue" />
      <Summary icon={WalletCards} label="Pembayaran Diterima" value={money(received)} note={`${Math.round(billed ? received / billed * 100 : 0)}% tertagih`} tone="green" />
      <Summary icon={CircleDollarSign} label="Piutang" value={money(outstanding)} note={`${rows.filter(row => row.status === 'Belum Lunas').length} belum lunas`} tone="amber" />
      <Summary icon={BarChart3} label="Rata-rata Transaksi" value={money(average)} note="per faktur" tone="purple" />
    </div>
    <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm lg:p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><SlidersHorizontal className="h-4 w-4 text-blue-700" /> Filter laporan <span className="text-xs font-normal text-slate-400">Atur periode, cabang, status, atau kata kunci</span></div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(250px,1fr)_150px_140px_145px_145px]">
        <label className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari invoice, WO, pelanggan, HP, kendaraan..." className="h-9 w-full rounded-md border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"/></label>
        {currentBranchId === 'ALL' && <select value={branchId} onChange={e => setBranchId(e.target.value)} className="h-9 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-blue-500"><option value="">Semua Cabang</option>{data.branches.filter(b => b.isActive).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
        <select value={status} onChange={e => setStatus(e.target.value)} className="h-9 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-blue-500"><option value="ALL">Semua Status</option><option>Lunas</option><option>Belum Lunas</option></select>
        <IndonesianDateInput value={from} onChange={setFrom} className="h-9 w-full text-sm"/><IndonesianDateInput value={to} onChange={setTo} className="h-9 w-full text-sm"/>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3"><span className="mr-1 text-xs font-medium text-slate-500">Periode cepat:</span><button onClick={() => setPeriod('today')} className="h-8 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700">Hari Ini</button><button onClick={() => setPeriod('month')} className="h-8 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700">Bulan Ini</button><button onClick={() => setPeriod('last')} className="h-8 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700">Bulan Lalu</button><ActiveFilterResetButton active={filtersActive} onReset={resetFilters} /></div>
    </section>
    <section className="app-fill-stack overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div><h2 className="text-sm font-semibold text-slate-800">Daftar transaksi penjualan</h2><p className="mt-0.5 text-xs text-slate-500">Urut berdasarkan tanggal terbaru</p></div><span className="text-xs text-slate-500">{rows.length} baris</span></div><div className="app-table-scroll app-table-scroll--fill max-h-[calc(100vh-430px)] min-h-[250px] overflow-auto"><table className="w-full min-w-[1180px] text-sm"><thead className="sticky top-0 z-10 bg-slate-800 text-left text-[11px] uppercase tracking-wide text-white"><tr>{['Tanggal / Invoice','Cabang','Pelanggan','Kendaraan','WO','Nilai','Dibayar','Piutang','Status'].map((label, index) => <th key={label} className={`px-4 py-3 ${index >= 5 && index <= 7 ? 'text-right' : ''}`}>{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map(row => { const due = Math.max(0, row.total - row.payment); return <tr key={row.id} className="transition-colors hover:bg-blue-50/50"><td className="px-4 py-3"><b className="text-blue-700">{row.invoiceNumber}</b><small className="mt-0.5 block text-slate-500">{row.date}</small></td><td className="px-4 py-3 text-slate-600">{data.branches.find(b => b.id === row.branchId)?.name || '-'}</td><td className="px-4 py-3 font-semibold text-slate-800">{row.customerName}</td><td className="px-4 py-3 text-slate-600">{row.vehicleInfo || '-'}</td><td className="px-4 py-3 text-slate-600">{row.woNumber || '-'}</td><td className="px-4 py-3 text-right font-semibold text-slate-800">{money(row.total)}</td><td className="px-4 py-3 text-right font-semibold text-green-700">{money(row.payment)}</td><td className="px-4 py-3 text-right font-semibold text-amber-700">{money(due)}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${row.status === 'Lunas' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{row.status}</span></td></tr>})}</tbody></table>{!rows.length && <div className="p-12 text-center text-sm text-slate-400">Tidak ada penjualan sesuai filter.</div>}</div></section>
  </div>;
}

function Summary({ icon: Icon, label, value, note, tone }: { icon: typeof FileText; label: string; value: string; note: string; tone: 'blue'|'green'|'amber'|'purple' }) {
  const colors = { blue: 'text-blue-700', green: 'text-green-700', amber: 'text-amber-700', purple: 'text-purple-700' };
  const backgrounds = { blue: 'bg-blue-50', green: 'bg-green-50', amber: 'bg-amber-50', purple: 'bg-purple-50' };
  return <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm"><div className="flex items-start justify-between gap-2"><p className="text-xs font-medium text-slate-500">{label}</p><span className={`rounded-md p-1.5 ${backgrounds[tone]} ${colors[tone]}`}><Icon className="h-4 w-4" /></span></div><p className={`mt-1 truncate text-lg font-bold ${colors[tone]}`}>{value}</p><p className="mt-0.5 text-[11px] text-slate-400">{note}</p></div>;
}
