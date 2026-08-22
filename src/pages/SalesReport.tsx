import { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { useApp } from '../context/AppContext';
import IndonesianDateInput from '../components/IndonesianDateInput';

const money = (value: number) => `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const csv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export default function SalesReport() {
  const { data, currentBranchId } = useApp();
  const now = new Date();
  const [from, setFrom] = useState(localDate(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(localDate(now));
  const [status, setStatus] = useState('ALL');
  const [branchId, setBranchId] = useState(currentBranchId === 'ALL' ? '' : currentBranchId);
  const [search, setSearch] = useState('');

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

  return <div className="space-y-3 pb-4">
    <div className="flex justify-end"><button onClick={exportCsv} disabled={!rows.length} className="inline-flex h-9 items-center gap-2 rounded-lg border border-green-300 px-3 text-sm font-semibold text-green-700 disabled:opacity-40"><Download className="h-4 w-4"/>Export CSV</button></div>
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <Summary label="Nilai Invoice" value={money(billed)} note={`${rows.length} faktur`} tone="blue" />
      <Summary label="Pembayaran Diterima" value={money(received)} note={`${Math.round(billed ? received / billed * 100 : 0)}% tertagih`} tone="green" />
      <Summary label="Piutang" value={money(outstanding)} note={`${rows.filter(row => row.status === 'Belum Lunas').length} belum lunas`} tone="amber" />
      <Summary label="Rata-rata Transaksi" value={money(average)} note="per faktur" tone="purple" />
    </div>
    <div className="flex flex-wrap items-center gap-2 border-b border-blue-200 pb-2">
      <label className="relative min-w-64 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari invoice, WO, pelanggan, HP, kendaraan..." className="h-9 w-full rounded-lg border pl-9 pr-3 text-sm"/></label>
      {currentBranchId === 'ALL' && <select value={branchId} onChange={e => setBranchId(e.target.value)} className="h-9 rounded-lg border px-3 text-sm"><option value="">Semua Cabang</option>{data.branches.filter(b => b.isActive).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
      <select value={status} onChange={e => setStatus(e.target.value)} className="h-9 rounded-lg border px-3 text-sm"><option value="ALL">Semua Status</option><option>Lunas</option><option>Belum Lunas</option></select>
      <IndonesianDateInput value={from} onChange={setFrom} className="h-9 w-36 text-sm"/><IndonesianDateInput value={to} onChange={setTo} className="h-9 w-36 text-sm"/>
      <button onClick={() => setPeriod('today')} className="h-9 rounded-lg border px-3 text-xs">Hari Ini</button><button onClick={() => setPeriod('month')} className="h-9 rounded-lg border px-3 text-xs">Bulan Ini</button><button onClick={() => setPeriod('last')} className="h-9 rounded-lg border px-3 text-xs">Bulan Lalu</button>
    </div>
    <div className="overflow-hidden rounded-xl border bg-white"><div className="max-h-[calc(100vh-330px)] overflow-auto"><table className="w-full min-w-[1180px] text-sm"><thead className="sticky top-0 bg-blue-900 text-left text-xs uppercase text-white"><tr>{['Tanggal / Invoice','Cabang','Pelanggan','Kendaraan','WO','Nilai','Dibayar','Piutang','Status'].map(label => <th key={label} className="px-3 py-2.5">{label}</th>)}</tr></thead><tbody className="divide-y">{rows.map(row => { const due = Math.max(0, row.total - row.payment); return <tr key={row.id} className="hover:bg-blue-50/40"><td className="px-3 py-2"><b className="text-blue-700">{row.invoiceNumber}</b><small className="block text-gray-500">{row.date}</small></td><td className="px-3">{data.branches.find(b => b.id === row.branchId)?.name || '-'}</td><td className="px-3 font-semibold">{row.customerName}</td><td className="px-3">{row.vehicleInfo || '-'}</td><td className="px-3">{row.woNumber || '-'}</td><td className="px-3 font-semibold">{money(row.total)}</td><td className="px-3 font-semibold text-green-700">{money(row.payment)}</td><td className="px-3 font-semibold text-amber-700">{money(due)}</td><td className="px-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.status === 'Lunas' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{row.status}</span></td></tr>})}</tbody></table></div>{!rows.length && <div className="p-12 text-center text-gray-400">Tidak ada penjualan sesuai filter.</div>}</div>
  </div>;
}

function Summary({ label, value, note, tone }: { label: string; value: string; note: string; tone: 'blue'|'green'|'amber'|'purple' }) {
  const colors = { blue: 'text-blue-700', green: 'text-green-700', amber: 'text-amber-700', purple: 'text-purple-700' };
  return <div className="rounded-xl border bg-white p-3 shadow-sm"><p className="text-xs text-gray-500">{label}</p><p className={`truncate text-lg font-bold ${colors[tone]}`}>{value}</p><p className="text-[11px] text-gray-400">{note}</p></div>;
}
