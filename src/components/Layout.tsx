import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Car, FileText, Users, Wrench, Boxes, PackageCheck, Truck, ReceiptText,
  Settings, Menu, Bell, User, ChevronDown, LogOut, Building2, Shield, Bot, FolderTree, X,
  Warehouse,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

const navItems = [
  { path: '/', label: 'Dashboard', short: 'Home', icon: LayoutDashboard, perm: 'dashboard:view' as const, color: 'from-blue-500 to-indigo-600' },
  { path: '/workorders', label: 'Order Kerja', short: 'Order', icon: Wrench, perm: 'wo:view' as const, color: 'from-orange-500 to-red-600' },
  { path: '/invoices', label: 'Faktur Penjualan', short: 'Faktur', icon: FileText, perm: 'invoice:view' as const, color: 'from-green-500 to-emerald-600' },
  { path: '/customers', label: 'Pelanggan', short: 'Pelanggan', icon: Users, perm: 'customer:view' as const, color: 'from-violet-500 to-purple-600' },
  { path: '/vehicles', label: 'Register Kendaraan', short: 'Kendaraan', icon: Car, perm: 'vehicle:view' as const, color: 'from-sky-500 to-blue-600' },
  { path: '/items', label: 'Barang & Jasa', short: 'Barang', icon: Boxes, perm: 'item:view' as const, color: 'from-teal-500 to-cyan-600' },
  { path: '/warehouses', label: 'Gudang & Mutasi', short: 'Gudang', icon: Warehouse, perm: 'item:view' as const, color: 'from-cyan-500 to-blue-700' },
  { path: '/categories', label: 'Kategori', short: 'Kategori', icon: FolderTree, perm: 'item:view' as const, color: 'from-lime-500 to-green-600' },
  { path: '/suppliers', label: 'Supplier', short: 'Supplier', icon: Truck, perm: 'supplier:view' as const, color: 'from-amber-500 to-orange-600' },
  { path: '/receipts', label: 'Penerimaan Barang', short: 'Terima', icon: PackageCheck, perm: 'receipt:view' as const, color: 'from-rose-500 to-pink-600' },
  { path: '/purchase-invoices', label: 'Faktur Pembelian', short: 'Pembelian', icon: ReceiptText, perm: 'purchase:view' as const, color: 'from-fuchsia-500 to-purple-600' },
  { path: '/ai', label: 'Asisten AI', short: 'AI', icon: Bot, perm: 'dashboard:view' as const, color: 'from-cyan-400 to-blue-600' },
  { path: '/users', label: 'Pengguna & Akses', short: 'Pengguna', icon: Shield, perm: 'user:view' as const, color: 'from-slate-500 to-slate-700' },
  { path: '/settings', label: 'Pengaturan', short: 'Atur', icon: Settings, perm: 'settings:view' as const, color: 'from-indigo-500 to-violet-700' },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { data, currentUser, currentBranchId, setCurrentBranchId, logout, hasPermission, isDemoMode } = useApp();

  const isAll = currentBranchId === 'ALL';
  const currentBranch = isAll ? null : data.branches.find((b) => b.id === currentBranchId);

  const todayInvoices = data.invoices.filter(
    (inv) => inv.date === new Date().toISOString().split('T')[0] && (isAll ? true : inv.branchId === currentBranchId)
  );
  const todayRevenue = todayInvoices.reduce((sum, inv) => sum + inv.payment, 0);
  const visibleNavItems = navItems.filter((item) => hasPermission(item.perm));

  const getPageTitle = () => {
    const item = visibleNavItems.find((n) => n.path === location.pathname);
    return item ? item.label : 'Dashboard';
  };

  // Tutup menu mobile saat pindah halaman
  useEffect(() => { setMobileMenuOpen(false); }, [location.pathname]);
  // Kunci scroll saat menu mobile terbuka
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileMenuOpen]);

  const handleLogout = () => { logout(); navigate('/login'); };
  const handleBranchChange = (branchId: string) => { setCurrentBranchId(branchId); setBranchMenuOpen(false); };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* ========== SIDEBAR (desktop) ========== */}
      <aside
        className={`${sidebarOpen ? 'w-64' : 'w-16'} hidden flex-shrink-0 flex-col bg-gradient-to-b from-blue-900 via-blue-800 to-blue-900 text-white transition-all duration-300 lg:flex`}
      >
        <div className="border-b border-blue-700/50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500">
              <Wrench className="h-5 w-5 text-white" />
            </div>
            {sidebarOpen && (
              <div>
                <h1 className="text-sm font-bold">DOKTER AC MOBIL</h1>
                <p className="text-xs text-blue-300">Management System</p>
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                title={!sidebarOpen ? item.label : undefined}
                className={`mx-2 flex items-center gap-3 rounded-lg px-4 py-3 transition-all duration-200 ${
                  isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'text-blue-200 hover:bg-blue-700/50 hover:text-white'
                }`}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {sidebarOpen && <span className="text-sm font-medium">{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-blue-700/50 p-4">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="flex w-full items-center gap-3 text-blue-300 transition-colors hover:text-white">
            <Menu className="h-5 w-5 flex-shrink-0" />
            {sidebarOpen && <span className="text-sm">Sembunyikan Menu</span>}
          </button>
        </div>
      </aside>

      {/* ========== MAIN ========== */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-3 py-2.5 shadow-sm sm:px-6 sm:py-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            {/* Hamburger (mobile) */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md active:scale-95 lg:hidden"
              aria-label="Buka menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-gray-800 sm:text-xl">{getPageTitle()}</h2>
              {location.pathname === '/' && (
                <span className="hidden text-sm text-gray-500 md:inline">
                  {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-3">
            {/* Branch switcher */}
            {hasPermission('all_branches') && (
              <div className="relative">
                <button
                  onClick={() => setBranchMenuOpen(!branchMenuOpen)}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 sm:px-3 sm:text-sm"
                >
                  <Building2 className={`h-4 w-4 ${isAll ? 'text-blue-600' : 'text-gray-600'}`} />
                  <span className={`hidden sm:inline ${isAll ? 'font-semibold text-blue-700' : ''}`}>
                    {isAll ? 'Semua Cabang' : currentBranch?.name}
                  </span>
                  <span className={`max-w-24 truncate sm:hidden ${isAll ? 'font-semibold text-blue-700' : ''}`}>
                    {isAll ? 'Semua Cabang' : currentBranch?.name.replace('CABANG ', '')}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                </button>
                {branchMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setBranchMenuOpen(false)} />
                    <div className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-gray-200 bg-white p-2 shadow-xl">
                      <button onClick={() => handleBranchChange('ALL')} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${isAll ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}>
                        Semua Cabang
                      </button>
                      {data.branches.filter((b) => b.isActive).map((b) => (
                        <button key={b.id} onClick={() => handleBranchChange(b.id)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${currentBranchId === b.id ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}>
                          {b.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Stats (desktop) */}
            <div className="hidden items-center gap-3 text-sm xl:flex">
              <div className="rounded-lg bg-green-50 px-3 py-1.5">
                <span className="font-medium text-green-600">Hari Ini: Rp {todayRevenue.toLocaleString('id-ID')}</span>
              </div>
            </div>

            <button className="relative hidden rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 sm:block">
              <Bell className="h-5 w-5" />
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
            </button>

            {/* User */}
            <div className="relative">
              <button onClick={() => setUserMenuOpen(!userMenuOpen)} className="flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-gray-100 sm:p-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600">
                  <User className="h-4 w-4 text-white" />
                </div>
                <div className="hidden text-left md:block">
                  <p className="text-sm font-medium text-gray-800">{currentUser?.name || 'Guest'}</p>
                  <p className="text-xs text-gray-500">{currentUser?.roleName}</p>
                </div>
                <ChevronDown className="hidden h-4 w-4 text-gray-400 sm:block" />
              </button>
              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                    <div className="border-b border-gray-100 px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{currentUser?.name}</p>
                      <p className="text-xs text-gray-500">{currentUser?.email}</p>
                      <p className="mt-1 text-xs text-blue-600">{currentUser?.roleName}</p>
                      <p className="text-xs text-gray-400">{isAll ? 'Semua Cabang' : currentBranch?.name}</p>
                    </div>
                    <button onClick={() => { setUserMenuOpen(false); navigate('/settings'); }} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
                      <Settings className="h-4 w-4" /> Pengaturan
                    </button>
                    <button onClick={handleLogout} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50">
                      <LogOut className="h-4 w-4" /> Keluar
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {isDemoMode && (
          <div className="flex-shrink-0 border-b border-yellow-300 bg-yellow-100 px-4 py-2 text-center text-xs text-yellow-800 sm:text-sm">
            ⚠️ <strong>DEMO MODE</strong> — Perubahan data hanya sementara.
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-3 pb-6 sm:p-6">
          <Outlet />
        </main>
      </div>

      {/* ========== MOBILE FULLSCREEN MENU (Doughnut Grid) ========== */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          {/* Backdrop gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-blue-950 via-slate-900 to-blue-900" />
          <div className="pointer-events-none absolute inset-0 opacity-30"
            style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(34,211,238,.4), transparent 45%), radial-gradient(circle at 80% 75%, rgba(99,102,241,.45), transparent 45%)' }} />

          <div className="relative flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-6 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 shadow-lg shadow-cyan-500/30">
                  <Wrench className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="font-display text-base font-bold text-white">DOKTER AC MOBIL</h1>
                  <p className="text-xs text-blue-300">Management System</p>
                </div>
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white backdrop-blur active:scale-95">
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Cabang aktif selalu terlihat di bagian atas menu HP */}
            {hasPermission('all_branches') && (
              <div className="mx-5 mb-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-blue-300">Cabang aktif</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  <button onClick={() => handleBranchChange('ALL')} className={`flex flex-shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${isAll ? 'bg-cyan-400 text-slate-950' : 'bg-white/10 text-slate-200'}`}>
                    <Building2 className="h-4 w-4" /> Semua Cabang
                  </button>
                  {data.branches.filter(b => b.isActive).map(b => (
                    <button key={b.id} onClick={() => handleBranchChange(b.id)} className={`flex-shrink-0 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${currentBranchId === b.id ? 'bg-cyan-400 text-slate-950' : 'bg-white/10 text-slate-200'}`}>
                      {b.name.replace('CABANG ', '')}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* User card */}
            <div className="mx-5 mb-4 flex items-center gap-3 rounded-2xl bg-white/10 p-3 backdrop-blur">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-500 text-base font-bold text-white">
                {currentUser?.name?.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{currentUser?.name}</p>
                <p className="text-xs text-blue-200">{currentUser?.roleName}</p>
              </div>
              <div className="rounded-lg bg-green-500/20 px-2.5 py-1.5 text-right">
                <p className="text-[10px] text-green-300">Hari Ini</p>
                <p className="text-xs font-bold text-green-100">Rp {(todayRevenue / 1000).toFixed(0)}rb</p>
              </div>
            </div>

            {/* Menu grid — kartu bulat penuh layar */}
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <div className="grid grid-cols-3 gap-3">
                {visibleNavItems.map((item, idx) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <button
                      key={item.path}
                      onClick={() => { navigate(item.path); setMobileMenuOpen(false); }}
                      style={{ animationDelay: `${idx * 35}ms` }}
                      className={`animate-msg-in flex flex-col items-center gap-2 rounded-2xl p-3 transition-all active:scale-95 ${
                        isActive ? 'bg-white/20 ring-2 ring-cyan-400' : 'bg-white/5 hover:bg-white/10'
                      }`}
                    >
                      {/* Doughnut icon */}
                      <div className={`relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br ${item.color} shadow-lg`}>
                        <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-slate-900/85">
                          <Icon className="h-6 w-6 text-white" />
                        </div>
                        {isActive && <span className="absolute -bottom-0.5 h-1.5 w-1.5 rounded-full bg-cyan-300" />}
                      </div>
                      <span className={`text-center text-[11px] font-semibold leading-tight ${isActive ? 'text-cyan-200' : 'text-slate-300'}`}>
                        {item.short}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom actions */}
            <div className="border-t border-white/10 p-4">
              <button onClick={handleLogout} className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500/20 py-3 text-sm font-semibold text-red-200 active:scale-[.98]">
                <LogOut className="h-4 w-4" /> Keluar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
