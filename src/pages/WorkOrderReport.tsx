import { useMemo, useState } from 'react';
import {
  BarChart3, CheckCircle2, Download, FileText, FilterX,
  Printer, Search, Wallet, Wrench, XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { SalesInvoice, WOStatus, WorkOrder } from '../types';
import { localDateKey } from '../lib/date';

const statuses: Array<WOStatus | ''> = ['', 'Pengecekan', 'Pending', 'Proses', 'Selesai', 'Invoiced', 'Closed'];
const rupiah = (value: number) => `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
const dateLabel = (value: string) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('id-ID') : '-';
const today = () => localDateKey();
const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const statusTone: Record<WOStatus, string> = {
  Pengecekan: 'bg-amber-100 text-amber-800',
  Pending: 'bg-orange-100 text-orange-800',
  Proses: 'bg-blue-100 text-blue-800',
  Selesai: 'bg-emerald-100 text-emerald-800',
  Invoiced: 'bg-purple-100 text-purple-800',
  Closed: 'bg-rose-100 text-rose-800',
};
const statusLabel = (status: WOStatus) => status === 'Closed' ? 'Lost Sales' : status;

type ReportRow = WorkOrder & { invoice?: SalesInvoice; branchName: string; customerPhone: string };

export default function WorkOrderReport() {
  const { data, currentBranchId } = useApp();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState<WOStatus | ''>('');
  const [branchId, setBranchId] = useState(currentBranchId === 'ALL' ? '' : currentBranchId);
  const [creator, setCreator] = useState('');
  const [search, setSearch] = useState('');

  const creators = useMemo(() => Array.from(new Set(data.workOrders
    .map(wo => wo.createdByName?.trim())
    .filter((name): name is string => !!name))).sort((a, b) => a.localeCompare(b, 'id')), [data.workOrders]);

  const baseRows = useMemo<ReportRow[]>(() => data.workOrders.map(wo => {
    const invoice = data.invoices.find(inv => inv.woId === wo.id || (!!inv.woNumber && inv.woNumber === wo.woNumber));
    const customer = data.customers.find(item => item.id === wo.customerRefId || item.customerCode === wo.customerId);
    return {
      ...wo,
      invoice,
      branchName: data.branches.find(item => item.id === wo.branchId)?.name || wo.branchId || '-',
      customerPhone: customer?.phone || data.vehicles.find(item => item.id === wo.vehicleRefId)?.phone || '',
    };
  }), [data.workOrders, data.invoices, data.customers, data.vehicles, data.branches]);

  const scopedRows = useMemo(() => baseRows.filter(wo => {
    if (currentBranchId !== 'ALL' && wo.branchId !== currentBranchId) return false;
    if (currentBranchId === 'ALL' && branchId && wo.branchId !== branchId) return false;
    if (dateFrom && wo.date < dateFrom) return false;
    if (dateTo && wo.date > dateTo) return false;
    if (creator && wo.createdByName !== creator) return false;
    const query = search.trim().toLowerCase();
    return !query || [wo.woNumber, wo.invoice?.invoiceNumber, wo.customerName, wo.customerPhone, wo.plateNumber, wo.vehicleInfo, wo.createdByName]
      .some(value => String(value || '').toLowerCase().includes(query));
  }), [baseRows, currentBranchId, branchId, dateFrom, dateTo, creator, search]);

  const rows = useMemo(() => scopedRows
    .filter(wo => !status || wo.status === status)
    .sort((a, b) => b.date.localeCompare(a.date) || b.woNumber.localeCompare(a.woNumber)), [scopedRows, status]);

  const metrics = useMemo(() => {
    const valid = rows.filter(wo => wo.status !== 'Closed');
    return {
      estimate: valid.reduce((sum, wo) => sum + Number(wo.estimateTotal ?? wo.total ?? 0), 0),
      invoiced: valid.reduce((sum, wo) => sum + Number(wo.invoice?.total || 0), 0),
      received: valid.reduce((sum, wo) => sum + Number(wo.invoice?.payment || 0), 0),
      active: rows.filter(wo => ['Pengecekan', 'Pending', 'Proses'].includes(wo.status)).length,
      completed: rows.filter(wo => ['Selesai', 'Invoiced'].includes(wo.status)).length,
      cancelled: rows.filter(wo => wo.status === 'Closed').length,
      recovered: rows.filter(wo => (wo.statusLog || []).some(log => log.from === 'Closed' && log.to === 'Proses')).length,
    };
  }, [rows]);

  const statusCounts = useMemo(() => statuses.slice(1).map(value => ({
    status: value as WOStatus,
    count: scopedRows.filter(wo => wo.status === value).length,
  })), [scopedRows]);

  const setPeriod = (mode: 'today' | 'week' | 'month') => {
    const end = new Date();
    const start = new Date(end);
    if (mode === 'week') start.setDate(end.getDate() - 6);
    if (mode === 'month') start.setDate(1);
    setDateFrom(mode === 'today' ? today() : localDateKey(start));
    setDateTo(today());
  };

  const resetFilters = () => {
    setSearch(''); setDateFrom(''); setDateTo(''); setStatus(''); setCreator('');
    setBranchId(currentBranchId === 'ALL' ? '' : currentBranchId);
  };

  const exportCsv = () => {
    const header = ['No. WO', 'Tanggal', 'Cabang', 'Pelanggan', 'Telepon', 'Plat', 'Kendaraan', 'Keluhan', 'Layanan/Barang', 'Status', 'Estimasi WO', 'No. Invoice', 'Nilai Invoice', 'Pembayaran', 'Pembuat'];
    const csvRows = rows.map(wo => [
      wo.woNumber, wo.date, wo.branchName, wo.customerName, wo.customerPhone, wo.plateNumber, wo.vehicleInfo,
      wo.description || '', wo.services.map(item => `${item.name} x${item.qty}`).join('; '), statusLabel(wo.status),
      wo.estimateTotal ?? wo.total, wo.invoice?.invoiceNumber || '', wo.invoice?.total || 0, wo.invoice?.payment || 0,
      wo.createdByName || '',
    ].map(csvCell).join(','));
    const blob = new Blob(['\uFEFF' + [header.map(csvCell).join(','), ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `laporan_wo_${dateFrom || 'awal'}_${dateTo || 'akhir'}.csv`;
    link.click(); URL.revokeObjectURL(url);
  };

  const printReport = () => {
    const popup = window.open('', '_blank', 'width=1200,height=800');
    if (!popup) return;
    const body = rows.map(wo => `<tr><td><b>${wo.woNumber}</b><br><small>${dateLabel(wo.date)}</small></td><td>${wo.branchName}</td><td><b>${wo.customerName}</b><br><small>${wo.customerPhone || '-'}</small></td><td><b>${wo.plateNumber}</b><br><small>${wo.vehicleInfo}</small></td><td>${wo.services.map(item => `${item.name} x${item.qty}`).join('<br>') || '-'}</td><td>${statusLabel(wo.status)}</td><td class="num">${rupiah(wo.estimateTotal ?? wo.total)}</td><td>${wo.invoice?.invoiceNumber || '-'}<br><small>${wo.invoice ? rupiah(wo.invoice.total) : ''}</small></td><td>${wo.createdByName || '-'}</td></tr>`).join('');
    popup.document.write(`<!doctype html><html><head><title>Laporan WO</title><style>body{font-family:Arial,sans-serif;margin:20px;color:#172033}h1{font-size:22px;margin:0 0 4px}.meta{font-size:12px;color:#667085;margin-bottom:15px}.summary{display:flex;gap:12px;margin-bottom:15px}.box{border:1px solid #d0d5dd;padding:8px 12px;border-radius:6px;font-size:12px}.box b{display:block;font-size:16px;margin-top:3px}table{width:100%;border-collapse:collapse;font-size:9px}th{background:#1e40af;color:white;padding:7px;text-align:left}td{padding:6px;border:1px solid #d0d5dd;vertical-align:top}small{color:#667085}.num{text-align:right;white-space:nowrap}@media print{body{margin:7mm}@page{size:landscape}}</style></head><body><h1>DOKTER AC MOBIL — Laporan Work Order</h1><div class="meta">Periode ${dateLabel(dateFrom)} s.d. ${dateLabel(dateTo)} · Dicetak ${new Date().toLocaleString('id-ID')} · ${rows.length} WO</div><div class="summary"><div class="box">Estimasi WO<b>${rupiah(metrics.estimate)}</b></div><div class="box">Nilai Invoice<b>${rupiah(metrics.invoiced)}</b></div><div class="box">Pembayaran<b>${rupiah(metrics.received)}</b></div></div><table><thead><tr><th>WO / Tanggal</th><th>Cabang</th><th>Pelanggan</th><th>Kendaraan</th><th>Layanan</th><th>Status</th><th>Estimasi</th><th>Invoice</th><th>Pembuat</th></tr></thead><tbody>${body}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`);
    popup.document.close();
  };

  return (
    <div className="space-y-3 pb-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={printReport} disabled={!rows.length} className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"><Printer className="h-4 w-4" /> Print</button>
        <button type="button" onClick={exportCsv} disabled={!rows.length} className="inline-flex h-9 items-center gap-2 rounded-lg border border-green-300 bg-white px-3 text-sm font-medium text-green-700 hover:bg-green-50 disabled:opacity-40"><Download className="h-4 w-4" /> Export CSV</button>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Summary label="Total WO" value={String(rows.length)} sub={`${metrics.active} masih aktif`} icon={Wrench} tone="blue" />
        <Summary label="Estimasi WO" value={rupiah(metrics.estimate)} sub="Tidak memotong stok" icon={BarChart3} tone="orange" />
        <Summary label="Nilai Invoice" value={rupiah(metrics.invoiced)} sub={`${metrics.completed} WO selesai/dibayar`} icon={FileText} tone="purple" />
        <Summary label="Pembayaran Diterima" value={rupiah(metrics.received)} sub={`Sisa ${rupiah(Math.max(0, metrics.invoiced - metrics.received))}`} icon={Wallet} tone="green" />
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white px-2 py-2 shadow-sm">
        <div className="flex min-w-max gap-2">
          <button type="button" onClick={() => setStatus('')} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${!status ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>Semua <b className="ml-1">{scopedRows.length}</b></button>
          {statusCounts.map(item => <button key={item.status} type="button" onClick={() => setStatus(item.status)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${status === item.status ? statusTone[item.status] + ' border-current' : 'border-gray-200 bg-white text-gray-600'}`}>{statusLabel(item.status)} <b className="ml-1">{item.count}</b></button>)}
          <span className="ml-auto inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Selesai {metrics.completed}</span>
          <span className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-3 text-xs font-semibold text-rose-700"><XCircle className="h-3.5 w-3.5" /> Lost Sales {metrics.cancelled}</span>
          <span className="inline-flex items-center gap-1 rounded-lg bg-cyan-50 px-3 text-xs font-semibold text-cyan-700"><CheckCircle2 className="h-3.5 w-3.5" /> Recovered {metrics.recovered}</span>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_150px_150px_170px_170px_auto]">
          <label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari WO, invoice, pelanggan, HP, atau plat..." className="h-9 w-full rounded-lg border border-gray-300 pl-9 pr-3 text-sm outline-none focus:border-blue-500" /></label>
          {currentBranchId === 'ALL' && <select value={branchId} onChange={event => setBranchId(event.target.value)} className="h-9 rounded-lg border border-gray-300 px-2 text-sm outline-none focus:border-blue-500"><option value="">Semua Cabang</option>{data.branches.filter(item => item.isActive).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
          <select value={creator} onChange={event => setCreator(event.target.value)} className="h-9 rounded-lg border border-gray-300 px-2 text-sm outline-none focus:border-blue-500"><option value="">Semua Pembuat</option>{creators.map(name => <option key={name} value={name}>{name}</option>)}</select>
          <input aria-label="Dari tanggal" title="Dari tanggal" type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} className="h-9 rounded-lg border border-gray-300 px-2 text-sm outline-none focus:border-blue-500" />
          <input aria-label="Sampai tanggal" title="Sampai tanggal" type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} className="h-9 rounded-lg border border-gray-300 px-2 text-sm outline-none focus:border-blue-500" />
          <button type="button" onClick={resetFilters} title="Reset filter" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm text-gray-600 hover:bg-gray-50"><FilterX className="h-4 w-4" /> Reset</button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs"><span className="text-gray-500">Periode cepat:</span><button onClick={() => setPeriod('today')} className="rounded border border-gray-200 px-2 py-1 hover:bg-gray-50">Hari Ini</button><button onClick={() => setPeriod('week')} className="rounded border border-gray-200 px-2 py-1 hover:bg-gray-50">7 Hari</button><button onClick={() => setPeriod('month')} className="rounded border border-gray-200 px-2 py-1 hover:bg-gray-50">Bulan Ini</button></div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="max-h-[calc(100vh-390px)] min-h-56 overflow-auto">
          <table className="w-full min-w-[1450px] text-sm">
            <thead className="sticky top-0 z-10 bg-blue-800 text-left text-xs uppercase text-white"><tr><th className="px-3 py-2.5">No. WO / Tanggal</th><th className="px-3 py-2.5">Cabang</th><th className="px-3 py-2.5">Pelanggan</th><th className="px-3 py-2.5">Kendaraan</th><th className="px-3 py-2.5">Layanan / Barang</th><th className="px-3 py-2.5">Dibuat Oleh</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5 text-right">Estimasi WO</th><th className="px-3 py-2.5">Invoice</th><th className="px-3 py-2.5 text-right">Bayar</th></tr></thead>
            <tbody className="divide-y divide-gray-100">{rows.map(wo => <tr key={wo.id} className="hover:bg-blue-50/40"><td className="px-3 py-2.5"><p className="font-semibold text-blue-700">{wo.woNumber}</p><p className="text-xs text-gray-500">{dateLabel(wo.date)}</p></td><td className="px-3 py-2.5">{wo.branchName}</td><td className="px-3 py-2.5"><p className="font-medium">{wo.customerName}</p><p className="text-xs text-gray-500">{wo.customerPhone || '-'}</p></td><td className="px-3 py-2.5"><p className="font-medium">{wo.plateNumber}</p><p className="max-w-52 truncate text-xs text-gray-500" title={wo.vehicleInfo}>{wo.vehicleInfo}</p></td><td className="px-3 py-2.5"><p className="max-w-72 truncate font-medium" title={wo.services.map(item => item.name).join(', ')}>{wo.services.map(item => item.name).join(', ') || '-'}</p><p className="text-xs text-gray-500">{wo.services.length} item</p></td><td className="px-3 py-2.5">{wo.createdByName || '-'}</td><td className="px-3 py-2.5"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone[wo.status]}`}>{statusLabel(wo.status)}</span></td><td className="px-3 py-2.5 text-right font-semibold">{rupiah(wo.estimateTotal ?? wo.total)}</td><td className="px-3 py-2.5">{wo.invoice ? <><p className="font-semibold text-emerald-700">{wo.invoice.invoiceNumber}</p><p className="text-xs text-gray-500">{rupiah(wo.invoice.total)}</p></> : <span className="text-gray-400">Belum dibuat</span>}</td><td className="px-3 py-2.5 text-right font-semibold">{wo.invoice ? rupiah(wo.invoice.payment) : '-'}</td></tr>)}</tbody>
          </table>
        </div>
        {!rows.length && <div className="px-4 py-14 text-center text-sm text-gray-500">Tidak ada data WO sesuai filter.</div>}
        <div className="flex flex-wrap justify-between gap-2 border-t border-gray-200 bg-gray-50 px-4 py-2.5 text-sm"><span>{rows.length} WO ditampilkan</span><div className="flex gap-4"><span>Estimasi <b>{rupiah(metrics.estimate)}</b></span><span>Invoice <b>{rupiah(metrics.invoiced)}</b></span><span>Bayar <b>{rupiah(metrics.received)}</b></span></div></div>
      </div>
    </div>
  );
}

function Summary({ label, value, sub, icon: Icon, tone }: { label: string; value: string; sub: string; icon: any; tone: 'blue' | 'orange' | 'purple' | 'green' }) {
  const colors = { blue: 'bg-blue-50 text-blue-600', orange: 'bg-orange-50 text-orange-600', purple: 'bg-purple-50 text-purple-600', green: 'bg-green-50 text-green-600' };
  return <div className="flex min-w-0 items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm"><div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${colors[tone]}`}><Icon className="h-5 w-5" /></div><div className="min-w-0"><p className="text-xs text-gray-500">{label}</p><p className="truncate text-lg font-bold text-gray-900">{value}</p><p className="truncate text-[11px] text-gray-400">{sub}</p></div></div>;
}
