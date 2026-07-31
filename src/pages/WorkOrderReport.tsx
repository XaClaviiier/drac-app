import { useMemo, useState } from 'react';
import { BarChart3, CalendarDays, Download, Search, Wrench } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { WOStatus } from '../types';

const statuses: Array<WOStatus | ''> = ['', 'Pengecekan', 'Pending', 'Proses', 'Selesai', 'Dibayar', 'Batal'];
const rupiah = (value: number) => `Rp ${value.toLocaleString('id-ID')}`;

export default function WorkOrderReport() {
  const { data, currentBranchId } = useApp();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState<WOStatus | ''>('');
  const [search, setSearch] = useState('');

  const rows = useMemo(() => data.workOrders.filter(wo => {
    if (currentBranchId !== 'ALL' && wo.branchId !== currentBranchId) return false;
    if (dateFrom && wo.date < dateFrom) return false;
    if (dateTo && wo.date > dateTo) return false;
    if (status && wo.status !== status) return false;
    const query = search.trim().toLowerCase();
    return !query || [wo.woNumber, wo.customerName, wo.plateNumber, wo.vehicleInfo].some(value => String(value || '').toLowerCase().includes(query));
  }), [data.workOrders, currentBranchId, dateFrom, dateTo, status, search]);

  const total = rows.reduce((sum, wo) => sum + Number(wo.total || 0), 0);
  const paid = rows.filter(wo => wo.status === 'Dibayar').reduce((sum, wo) => sum + Number(wo.total || 0), 0);
  const active = rows.filter(wo => ['Pengecekan', 'Pending', 'Proses'].includes(wo.status)).length;

  const exportCsv = () => {
    const header = ['No. WO', 'Tanggal', 'Cabang', 'Pelanggan', 'Plat', 'Kendaraan', 'Status', 'Total'];
    const csvRows = rows.map(wo => {
      const branch = data.branches.find(item => item.id === wo.branchId)?.name || wo.branchId;
      return [wo.woNumber, wo.date, branch, wo.customerName, wo.plateNumber, wo.vehicleInfo, wo.status, wo.total]
        .map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',');
    });
    const blob = new Blob(['\uFEFF' + [header.join(','), ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `laporan_wo_${dateFrom || 'awal'}_${dateTo || 'akhir'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div><h1 className="text-2xl font-bold text-gray-900">Laporan Order Kerja</h1><p className="text-sm text-gray-500">Analisis WO tanpa mengubah transaksi operasional.</p></div>
        <button type="button" onClick={exportCsv} disabled={rows.length === 0} className="flex items-center justify-center gap-2 rounded-lg border border-blue-600 bg-white px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"><Download className="h-4 w-4" /> Export CSV</button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Summary label="Total WO" value={String(rows.length)} icon={Wrench} tone="blue" />
        <Summary label="WO Aktif" value={String(active)} icon={CalendarDays} tone="orange" />
        <Summary label="Nilai WO" value={rupiah(total)} icon={BarChart3} tone="purple" />
        <Summary label="Sudah Dibayar" value={rupiah(paid)} icon={BarChart3} tone="green" />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_180px_180px_190px]">
          <label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari nomor WO, pelanggan, plat..." className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500" /></label>
          <input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500" />
          <input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500" />
          <select value={status} onChange={event => setStatus(event.target.value as WOStatus | '')} className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500">{statuses.map(value => <option key={value || 'all'} value={value}>{value || 'Semua Status'}</option>)}</select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[950px] text-sm">
            <thead className="bg-blue-800 text-left text-xs uppercase text-white"><tr><th className="px-4 py-3">No. WO / Tanggal</th><th className="px-4 py-3">Cabang</th><th className="px-4 py-3">Pelanggan</th><th className="px-4 py-3">Kendaraan</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Total</th></tr></thead>
            <tbody className="divide-y divide-gray-100">{rows.map(wo => <tr key={wo.id} className="hover:bg-gray-50"><td className="px-4 py-3"><p className="font-semibold text-blue-700">{wo.woNumber}</p><p className="text-xs text-gray-500">{wo.date}</p></td><td className="px-4 py-3">{data.branches.find(item => item.id === wo.branchId)?.name || '-'}</td><td className="px-4 py-3 font-medium">{wo.customerName}</td><td className="px-4 py-3"><p className="font-medium">{wo.plateNumber}</p><p className="text-xs text-gray-500">{wo.vehicleInfo}</p></td><td className="px-4 py-3"><span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">{wo.status}</span></td><td className="px-4 py-3 text-right font-semibold">{rupiah(wo.total || 0)}</td></tr>)}</tbody>
          </table>
        </div>
        {rows.length === 0 && <div className="px-4 py-14 text-center text-sm text-gray-500">Tidak ada data WO sesuai filter.</div>}
        <div className="flex justify-between border-t border-gray-200 bg-gray-50 px-4 py-3 text-sm"><span>{rows.length} WO ditampilkan</span><span className="font-bold">Total {rupiah(total)}</span></div>
      </div>
    </div>
  );
}

function Summary({ label, value, icon: Icon, tone }: { label: string; value: string; icon: any; tone: 'blue' | 'orange' | 'purple' | 'green' }) {
  const colors = { blue: 'bg-blue-50 text-blue-600', orange: 'bg-orange-50 text-orange-600', purple: 'bg-purple-50 text-purple-600', green: 'bg-green-50 text-green-600' };
  return <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${colors[tone]}`}><Icon className="h-5 w-5" /></div><p className="text-xs text-gray-500">{label}</p><p className="mt-1 truncate text-xl font-bold text-gray-900">{value}</p></div>;
}
