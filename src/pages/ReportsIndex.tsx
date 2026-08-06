import { useNavigate } from 'react-router-dom';
import { BarChart3, Boxes, Coins, History, Landmark, ShoppingCart, Wrench } from 'lucide-react';

const reports = [
  { label: 'Laporan WO', description: 'Status, nilai, pelanggan, kendaraan, dan cabang.', icon: Wrench, path: '/reports/workorders', tone: 'green' },
  { label: 'Laporan Penjualan', description: 'Faktur, pembayaran, pendapatan, dan piutang.', icon: BarChart3, tone: 'green' },
  { label: 'Laporan Pembelian', description: 'Pembelian, pembayaran supplier, dan utang.', icon: ShoppingCart, tone: 'blue' },
  { label: 'Laporan Persediaan', description: 'Stok, mutasi, nilai persediaan, dan minimum.', icon: Boxes, tone: 'blue' },
  { label: 'Laporan Kas & Bank', description: 'Penerimaan, pengeluaran, dan setoran cabang.', icon: Landmark, tone: 'purple' },
  { label: 'Kinerja & Bonus', description: 'Kehadiran, produktivitas teknisi, rules custom, dan pembayaran bonus.', icon: Coins, path: '/performance-bonus', tone: 'purple' },
  { label: 'Audit Log', description: 'Riwayat aktivitas dan perubahan data pengguna.', icon: History, path: '/users', tone: 'purple' },
] as const;

export default function ReportsIndex() {
  const navigate = useNavigate();
  const tones = {
    green: 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100',
    blue: 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
    purple: 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100',
  };
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold text-gray-900">Daftar Laporan</h1><p className="text-sm text-gray-500">Pilih laporan yang ingin dilihat, difilter, atau diekspor.</p></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {reports.map(report => {
          const Icon = report.icon;
          const available = 'path' in report && !!report.path;
          return (
            <button key={report.label} type="button" disabled={!available} onClick={() => available && navigate(report.path!)} className={`relative flex min-h-40 items-center gap-5 rounded-xl border p-5 text-left transition-all ${tones[report.tone]} ${available ? 'hover:-translate-y-0.5 hover:shadow-md' : 'cursor-not-allowed opacity-45'}`}>
              <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-white/80"><Icon className="h-8 w-8" /></span>
              <span><span className="block text-lg font-bold text-gray-800">{report.label}</span><span className="mt-1 block text-sm leading-relaxed text-gray-600">{report.description}</span></span>
            </button>
          );
        })}
      </div>
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">Laporan yang berwarna redup sedang disiapkan dan belum dapat dibuka.</div>
    </div>
  );
}
