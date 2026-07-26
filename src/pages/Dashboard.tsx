import { Link } from 'react-router-dom';
import {
  Car, FileText, Users, Wrench, TrendingUp,
  Clock, AlertCircle, ArrowRight, Building2, CheckCircle2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

const BRANCH_COLORS: Record<string, { bg: string; text: string; ring: string; gradient: string }> = {
  'ALL':    { bg: 'bg-blue-600',   text: 'text-white',    ring: 'ring-blue-400',   gradient: 'from-blue-600 to-blue-800' },
  'BR-001': { bg: 'bg-emerald-600',text: 'text-white',    ring: 'ring-emerald-400',gradient: 'from-emerald-500 to-green-700' },
  'BR-002': { bg: 'bg-violet-600', text: 'text-white',    ring: 'ring-violet-400', gradient: 'from-violet-500 to-purple-700' },
  'BR-003': { bg: 'bg-orange-500', text: 'text-white',    ring: 'ring-orange-400', gradient: 'from-orange-500 to-amber-600' },
};

export default function Dashboard() {
  const { data, currentUser, currentBranchId, setCurrentBranchId, hasPermission } = useApp();

  const canSeeAllBranches = hasPermission('all_branches');
  const isAll = currentBranchId === 'ALL';

  // Build branch filter
  const branchFilter = (item: { branchId: string }) =>
    isAll ? true : item.branchId === currentBranchId;

  const branchVehicles  = data.vehicles.filter(branchFilter);
  const branchCustomers = data.customers.filter(branchFilter);
  const branchInvoices  = data.invoices.filter(branchFilter);
  const branchWOs       = data.workOrders.filter(branchFilter);

  const totalRevenue    = branchInvoices.reduce((sum, inv) => sum + inv.payment, 0);
  const pendingPayments = branchInvoices.filter((inv) => inv.status === 'Belum Lunas');
  const pendingTotal    = pendingPayments.reduce((sum, inv) => sum + inv.total - inv.payment, 0);
  const today           = new Date().toISOString().split('T')[0];
  const todayInvoices   = branchInvoices.filter((inv) => inv.date === today);
  const todayRevenue    = todayInvoices.reduce((sum, inv) => sum + inv.payment, 0);

  const activeBranch = isAll ? null : data.branches.find((b) => b.id === currentBranchId);

  const recentInvoices = [...branchInvoices]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  const statCards = [
    { title: 'Total Pendapatan', value: `Rp ${totalRevenue.toLocaleString('id-ID')}`, icon: TrendingUp, color: 'from-green-500 to-emerald-600' },
    { title: 'Kendaraan Terdaftar', value: branchVehicles.length.toString(), icon: Car, color: 'from-blue-500 to-indigo-600' },
    { title: 'Total Pelanggan', value: branchCustomers.length.toString(), icon: Users, color: 'from-purple-500 to-violet-600' },
    { title: 'Order Kerja Aktif', value: branchWOs.filter((w) => w.status !== 'Selesai' && w.status !== 'Dibayar').length.toString(), icon: Wrench, color: 'from-orange-500 to-red-600' },
  ];

  return (
    <div className="space-y-6">

      {/* ===== BRANCH SELECTOR (Admin / Supervisor only) ===== */}
      {canSeeAllBranches && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Pilih Cabang</h3>
            <span className="ml-auto text-sm text-gray-500">
              {isAll ? 'Menampilkan data semua cabang' : `Menampilkan data ${activeBranch?.name}`}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {/* All Branches */}
            <button
              onClick={() => setCurrentBranchId('ALL')}
              className={`relative flex flex-col items-center justify-center rounded-xl border-2 p-4 text-center transition-all duration-200 ${
                isAll
                  ? 'border-blue-500 bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-lg shadow-blue-200'
                  : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-blue-300 hover:bg-blue-50'
              }`}
            >
              {isAll && (
                <span className="absolute right-2 top-2">
                  <CheckCircle2 className="h-4 w-4 text-white" />
                </span>
              )}
              <div className={`mb-2 flex h-10 w-10 items-center justify-center rounded-full ${isAll ? 'bg-white/20' : 'bg-blue-100'}`}>
                <Building2 className={`h-5 w-5 ${isAll ? 'text-white' : 'text-blue-600'}`} />
              </div>
              <p className={`text-sm font-bold ${isAll ? 'text-white' : 'text-gray-900'}`}>Semua Cabang</p>
              <p className={`mt-0.5 text-xs ${isAll ? 'text-blue-100' : 'text-gray-500'}`}>
                {data.invoices.length} faktur total
              </p>
            </button>

            {/* Individual Branches */}
            {data.branches.filter((b) => b.isActive).map((branch) => {
              const isSelected = currentBranchId === branch.id;
              const col = BRANCH_COLORS[branch.id] || BRANCH_COLORS['BR-001'];
              const bInvoices = data.invoices.filter((i) => i.branchId === branch.id);
              return (
                <button
                  key={branch.id}
                  onClick={() => setCurrentBranchId(branch.id)}
                  className={`relative flex flex-col items-center justify-center rounded-xl border-2 p-4 text-center transition-all duration-200 ${
                    isSelected
                      ? `border-transparent bg-gradient-to-br ${col.gradient} shadow-lg ${col.text}`
                      : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  {isSelected && (
                    <span className="absolute right-2 top-2">
                      <CheckCircle2 className="h-4 w-4 text-white" />
                    </span>
                  )}
                  <div className={`mb-2 flex h-10 w-10 items-center justify-center rounded-full ${isSelected ? 'bg-white/20' : 'bg-gray-200'}`}>
                    <Building2 className={`h-5 w-5 ${isSelected ? 'text-white' : 'text-gray-600'}`} />
                  </div>
                  <p className={`text-sm font-bold leading-tight ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                    {branch.name.replace('CABANG ', '')}
                  </p>
                  <p className={`mt-0.5 text-xs ${isSelected ? 'text-white/80' : 'text-gray-500'}`}>
                    {bInvoices.length} faktur
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== WELCOME BANNER ===== */}
      <div className={`rounded-xl p-5 text-white shadow-lg bg-gradient-to-r ${
        isAll || !activeBranch
          ? 'from-blue-600 to-blue-800'
          : BRANCH_COLORS[currentBranchId]?.gradient || 'from-blue-600 to-blue-800'
      }`}>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold">
              Selamat Datang, {currentUser?.name}!
            </h2>
            <p className="mt-0.5 text-sm text-white/80">
              {currentUser?.roleName} —{' '}
              {isAll ? (
                <span className="font-medium text-white">Menampilkan semua cabang</span>
              ) : (
                <span className="inline-flex items-center gap-1 font-medium text-white">
                  <Building2 className="h-3.5 w-3.5" /> {activeBranch?.name}
                </span>
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-white/80">
              {new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
            {isAll && canSeeAllBranches && (
              <p className="mt-1 text-xs text-white/60">{data.branches.length} cabang aktif</p>
            )}
          </div>
        </div>
      </div>

      {/* ===== STAT CARDS ===== */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.title} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500">{stat.title}</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{stat.value}</p>
                </div>
                <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${stat.color} shadow-md`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ===== TODAY SUMMARY ===== */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 p-5 text-white">
          <div className="mb-2 flex items-center gap-2 text-blue-100">
            <FileText className="h-4 w-4" /><span className="text-sm">Faktur Hari Ini</span>
          </div>
          <p className="text-3xl font-bold">{todayInvoices.length}</p>
          <p className="mt-1 text-sm text-blue-100">Transaksi</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 p-5 text-white">
          <div className="mb-2 flex items-center gap-2 text-green-100">
            <TrendingUp className="h-4 w-4" /><span className="text-sm">Pendapatan Hari Ini</span>
          </div>
          <p className="text-2xl font-bold">Rp {todayRevenue.toLocaleString('id-ID')}</p>
          <p className="mt-1 text-sm text-green-100">Total pembayaran</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-red-500 to-orange-600 p-5 text-white">
          <div className="mb-2 flex items-center gap-2 text-red-100">
            <AlertCircle className="h-4 w-4" /><span className="text-sm">Piutang Belum Lunas</span>
          </div>
          <p className="text-2xl font-bold">Rp {pendingTotal.toLocaleString('id-ID')}</p>
          <p className="mt-1 text-sm text-red-100">{pendingPayments.length} faktur</p>
        </div>
      </div>

      {/* ===== PER-BRANCH BREAKDOWN (Admin All mode) ===== */}
      {canSeeAllBranches && isAll && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Building2 className="h-5 w-5 text-blue-600" /> Ringkasan per Cabang
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {data.branches.filter((b) => b.isActive).map((branch) => {
              const col = BRANCH_COLORS[branch.id] || BRANCH_COLORS['BR-001'];
              const bInvoices = data.invoices.filter((i) => i.branchId === branch.id);
              const bRevenue  = bInvoices.reduce((s, i) => s + i.payment, 0);
              const bVehicles = data.vehicles.filter((v) => v.branchId === branch.id).length;
              const bCustomers = data.customers.filter((c) => c.branchId === branch.id).length;
              const bPending  = bInvoices.filter((i) => i.status === 'Belum Lunas').length;
              const bWOActive = data.workOrders.filter((w) => w.branchId === branch.id && w.status !== 'Selesai' && w.status !== 'Dibayar').length;
              const bTodayRev = bInvoices.filter((i) => i.date === today).reduce((s, i) => s + i.payment, 0);

              return (
                <button
                  key={branch.id}
                  onClick={() => setCurrentBranchId(branch.id)}
                  className="group rounded-xl border-2 border-gray-200 p-5 text-left transition-all hover:border-gray-300 hover:shadow-md"
                >
                  {/* Branch Header */}
                  <div className={`flex items-center gap-3 mb-4 pb-4 border-b border-gray-100`}>
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${col.gradient} shadow-md`}>
                      <Building2 className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">{branch.name}</p>
                      <p className="text-xs font-mono text-gray-400">{branch.code}</p>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-xl font-bold text-gray-900">{bInvoices.length}</p>
                      <p className="text-[11px] text-gray-500">Total Faktur</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-green-600">
                        {bRevenue >= 1000000
                          ? `${(bRevenue / 1000000).toFixed(1)}JT`
                          : `${(bRevenue / 1000).toFixed(0)}RB`}
                      </p>
                      <p className="text-[11px] text-gray-500">Total Pendapatan</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-blue-600">{bVehicles}</p>
                      <p className="text-[11px] text-gray-500">Kendaraan</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-purple-600">{bCustomers}</p>
                      <p className="text-[11px] text-gray-500">Pelanggan</p>
                    </div>
                    <div>
                      <p className={`text-xl font-bold ${bPending > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>{bPending}</p>
                      <p className="text-[11px] text-gray-500">Blm Lunas</p>
                    </div>
                    <div>
                      <p className={`text-xl font-bold ${bWOActive > 0 ? 'text-orange-600' : 'text-gray-400'}`}>{bWOActive}</p>
                      <p className="text-[11px] text-gray-500">WO Aktif</p>
                    </div>
                  </div>

                  {/* Today Revenue */}
                  <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-center">
                    <p className="text-xs text-gray-500">Pendapatan Hari Ini</p>
                    <p className="font-bold text-gray-900">Rp {bTodayRev.toLocaleString('id-ID')}</p>
                  </div>

                  <p className="mt-3 text-center text-xs text-blue-600 opacity-0 transition-opacity group-hover:opacity-100">
                    Klik untuk lihat detail →
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== BOTTOM GRID: Recent Invoices + Quick Actions ===== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Invoices */}
        <div className="lg:col-span-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 p-5">
            <div>
              <h3 className="font-semibold text-gray-900">Faktur Terbaru</h3>
              <p className="text-xs text-gray-500">
                {isAll ? 'Semua cabang' : activeBranch?.name} — 5 transaksi terakhir
              </p>
            </div>
            <Link to="/invoices" className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700">
              Lihat Semua <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 text-xs font-medium uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-5 py-3 text-left">Tanggal</th>
                  <th className="px-5 py-3 text-left">Nomor</th>
                  <th className="px-5 py-3 text-left">Pelanggan</th>
                  {canSeeAllBranches && isAll && <th className="px-5 py-3 text-left">Cabang</th>}
                  <th className="px-5 py-3 text-right">Total</th>
                  <th className="px-5 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-gray-400 text-sm">Tidak ada faktur</td>
                  </tr>
                ) : recentInvoices.map((invoice) => {
                  const invBranch = data.branches.find((b) => b.id === invoice.branchId);
                  const col = BRANCH_COLORS[invoice.branchId] || BRANCH_COLORS['BR-001'];
                  return (
                    <tr key={invoice.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 text-sm text-gray-700 whitespace-nowrap">{invoice.date}</td>
                      <td className="px-5 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{invoice.invoiceNumber}</td>
                      <td className="px-5 py-3 text-sm text-gray-700">{invoice.customerName}</td>
                      {canSeeAllBranches && isAll && (
                        <td className="px-5 py-3 text-xs">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium bg-gradient-to-r ${col.gradient} text-white`}>
                            {invBranch?.name.replace('CABANG ', '') || '-'}
                          </span>
                        </td>
                      )}
                      <td className="px-5 py-3 text-right text-sm font-medium text-gray-900 whitespace-nowrap">
                        Rp {invoice.total.toLocaleString('id-ID')}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          invoice.status === 'Lunas' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {invoice.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Actions + Pending Alert */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 font-semibold text-gray-900">Aksi Cepat</h3>
            <div className="space-y-2">
              {[
                { to: '/vehicles', icon: Car, label: 'Register Kendaraan', sub: 'Daftarkan kendaraan baru', color: 'blue' },
                { to: '/invoices', icon: FileText, label: 'Buat Faktur', sub: 'Faktur penjualan baru', color: 'green' },
                { to: '/workorders', icon: Wrench, label: 'Order Kerja', sub: 'Buat order kerja baru', color: 'orange' },
                { to: '/customers', icon: Users, label: 'Tambah Pelanggan', sub: 'Daftarkan pelanggan baru', color: 'purple' },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 transition-all hover:bg-gray-50 hover:border-gray-300 group"
                  >
                    <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-${item.color}-100 group-hover:bg-${item.color}-200 transition-colors`}>
                      <Icon className={`h-4 w-4 text-${item.color}-600`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.label}</p>
                      <p className="text-xs text-gray-500">{item.sub}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {pendingPayments.length > 0 && (
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-600" />
                <div>
                  <p className="text-sm font-semibold text-yellow-800">
                    {pendingPayments.length} Faktur Belum Lunas
                  </p>
                  <p className="mt-0.5 text-xs text-yellow-600">
                    Total piutang: Rp {pendingTotal.toLocaleString('id-ID')}
                  </p>
                  <Link to="/invoices" className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-yellow-700 hover:text-yellow-800">
                    Lihat Faktur <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
