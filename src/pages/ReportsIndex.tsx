import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3, BookOpen, Boxes, ClipboardList, Coins, Download, FileBarChart,
  History, Landmark, Search, ShoppingCart, Star, Warehouse, Wrench,
} from 'lucide-react';

type ReportCategory = 'memorize' | 'operasional' | 'gudang' | 'penjualan' | 'pembelian' | 'keuangan' | 'audit';
type ReportDefinition = {
  id: string;
  label: string;
  description: string;
  category: Exclude<ReportCategory, 'memorize'>;
  icon: typeof FileBarChart;
  path?: string;
};

const reports: ReportDefinition[] = [
  { id: 'workorders', label: 'Laporan Order Kerja', description: 'Status, nilai, pelanggan, kendaraan, layanan, dan cabang.', category: 'operasional', icon: Wrench, path: '/reports/workorders' },
  { id: 'sales', label: 'Laporan Penjualan', description: 'Faktur, pembayaran, pendapatan, dan piutang pelanggan.', category: 'penjualan', icon: BarChart3, path: '/reports/sales' },
  { id: 'purchases', label: 'Laporan Pembelian', description: 'Pembelian, pembayaran pemasok, dan utang usaha.', category: 'pembelian', icon: ShoppingCart, path: '/reports/purchases' },
  { id: 'inventory', label: 'Stok per Gudang', description: 'Posisi dan nilai persediaan untuk setiap gudang aktif.', category: 'gudang', icon: Boxes, path: '/reports/inventory' },
  { id: 'stock-count-sheet', label: 'Lembar Penghitungan Stok', description: 'Lembar stok opname fisik yang dapat difilter dan dicetak.', category: 'gudang', icon: ClipboardList, path: '/reports/stock-count-sheet' },
  { id: 'cash-bank', label: 'Laporan Kas & Bank', description: 'Penerimaan, pengeluaran, transfer, serta saldo setiap akun.', category: 'keuangan', icon: Landmark, path: '/reports/cash-bank' },
  { id: 'performance-bonus', label: 'Kinerja & Bonus', description: 'Kehadiran, produktivitas teknisi, aturan, dan pembayaran bonus.', category: 'operasional', icon: Coins, path: '/performance-bonus' },
  { id: 'audit-log', label: 'Audit Log', description: 'Riwayat aktivitas dan perubahan data oleh pengguna.', category: 'audit', icon: History },
];

const categories: Array<{ id: ReportCategory; label: string; icon: typeof FileBarChart }> = [
  { id: 'memorize', label: 'Memorize', icon: Star },
  { id: 'operasional', label: 'Operasional', icon: Wrench },
  { id: 'gudang', label: 'Gudang', icon: Warehouse },
  { id: 'penjualan', label: 'Penjualan', icon: BarChart3 },
  { id: 'pembelian', label: 'Pembelian', icon: ShoppingCart },
  { id: 'keuangan', label: 'Keuangan', icon: Landmark },
  { id: 'audit', label: 'Audit & Kontrol', icon: BookOpen },
];

const MEMORIZED_REPORTS_KEY = 'drac.reports.memorized.v1';

function loadMemorizedReports() {
  try {
    const saved = JSON.parse(localStorage.getItem(MEMORIZED_REPORTS_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export default function ReportsIndex() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState<ReportCategory>('gudang');
  const [search, setSearch] = useState('');
  const [memorizedIds, setMemorizedIds] = useState<string[]>(loadMemorizedReports);

  const activeCategoryLabel = categories.find(category => category.id === activeCategory)?.label || 'Daftar Laporan';
  const visibleReports = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('id-ID');
    return reports.filter(report => {
      const matchesCategory = activeCategory === 'memorize' ? memorizedIds.includes(report.id) : report.category === activeCategory;
      return matchesCategory && (!keyword || `${report.label} ${report.description}`.toLocaleLowerCase('id-ID').includes(keyword));
    });
  }, [activeCategory, memorizedIds, search]);

  const toggleMemorized = (reportId: string) => {
    setMemorizedIds(current => {
      const next = current.includes(reportId) ? current.filter(id => id !== reportId) : [...current, reportId];
      localStorage.setItem(MEMORIZED_REPORTS_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <div className="-m-3 bg-gray-100 p-3 lg:-m-4 lg:p-3">
      <div className="grid min-h-[calc(100vh-154px)] overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm lg:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="border-b border-gray-300 bg-white p-3 lg:border-b-0 lg:border-r">
          <nav aria-label="Kategori laporan" className="flex gap-1 overflow-x-auto lg:block lg:space-y-1">
            {categories.map(category => {
              const Icon = category.icon;
              const active = activeCategory === category.id;
              return (
                <button key={category.id} type="button" onClick={() => setActiveCategory(category.id)} className={`flex h-12 flex-none items-center gap-3 rounded-md px-4 text-left text-sm transition-colors lg:w-full lg:text-base ${active ? 'bg-blue-700 font-semibold text-white shadow-sm' : 'text-gray-800 hover:bg-blue-50 hover:text-blue-800'}`}>
                  <Icon className="h-5 w-5 flex-none" />
                  <span>{category.label}</span>
                  {category.id === 'memorize' && memorizedIds.length > 0 && <span className={`ml-auto rounded-full px-2 py-0.5 text-xs ${active ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700'}`}>{memorizedIds.length}</span>}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 p-4 lg:p-5">
          <div className="flex flex-col gap-3 border-b border-gray-200 pb-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-medium text-gray-700 lg:text-3xl">{activeCategoryLabel}</h1>
              <p className="mt-0.5 text-xs text-gray-500">Pilih laporan untuk membuka parameter, melihat data, dan mencetak hasil.</p>
            </div>
            <button type="button" onClick={() => window.print()} title="Cetak daftar laporan" aria-label="Cetak daftar laporan" className="hidden h-10 w-12 items-center justify-center rounded border border-blue-500 bg-white text-blue-700 hover:bg-blue-50 sm:flex">
              <Download className="h-5 w-5" />
            </button>
            <label className="relative block w-full sm:w-80 lg:w-[420px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari laporan..." className="h-10 w-full rounded border border-gray-400 bg-white pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-400" />
            </label>
          </div>

          {visibleReports.length > 0 ? (
            <div className="grid gap-x-8 lg:grid-cols-2">
              {visibleReports.map(report => {
                const Icon = report.icon;
                const available = !!report.path;
                const memorized = memorizedIds.includes(report.id);
                return (
                  <div key={report.id} className="group flex min-h-[104px] items-center border-b border-gray-200 py-3">
                    <button type="button" disabled={!available} onClick={() => available && navigate(report.path!)} className="flex min-w-0 flex-1 items-center gap-4 rounded-md p-2 text-left hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-45">
                      <span className="relative flex h-14 w-14 flex-none items-center justify-center text-blue-700">
                        <FileBarChart className="h-14 w-14 stroke-[1.5]" />
                        <Icon className="absolute bottom-0 right-0 h-5 w-5 rounded bg-white stroke-[2]" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-base font-semibold text-gray-900 lg:text-lg">{report.label}</span>
                        <span className="mt-1 block text-sm leading-5 text-gray-500">{report.description}</span>
                        {!available && <span className="mt-1 block text-xs font-medium text-amber-600">Sedang disiapkan</span>}
                      </span>
                    </button>
                    <button type="button" onClick={() => toggleMemorized(report.id)} title={memorized ? 'Hapus dari Memorize' : 'Simpan ke Memorize'} aria-label={memorized ? `Hapus ${report.label} dari Memorize` : `Simpan ${report.label} ke Memorize`} className={`mr-1 flex h-9 w-9 flex-none items-center justify-center rounded border transition-colors ${memorized ? 'border-amber-300 bg-amber-50 text-amber-500' : 'border-transparent text-gray-300 opacity-100 hover:border-gray-300 hover:bg-white hover:text-amber-500 lg:opacity-0 lg:group-hover:opacity-100'}`}>
                      <Star className={`h-5 w-5 ${memorized ? 'fill-current' : ''}`} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center px-4 text-center text-gray-400">
              <Star className="mb-3 h-12 w-12 stroke-[1.4]" />
              <p className="font-medium text-gray-600">{activeCategory === 'memorize' ? 'Belum ada laporan yang disimpan.' : 'Laporan tidak ditemukan.'}</p>
              <p className="mt-1 max-w-sm text-sm">{activeCategory === 'memorize' ? 'Tekan ikon bintang pada laporan untuk memasukkannya ke Memorize.' : 'Coba gunakan kata pencarian lain.'}</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
