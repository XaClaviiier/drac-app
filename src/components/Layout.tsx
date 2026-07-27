import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Car, FileText, Users, Wrench, Boxes, PackageCheck, Truck, ReceiptText,
  Settings, Menu, Bell, User, ChevronDown, LogOut, Building2, Shield, Bot,
} from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../context/AppContext';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard:view' as const },
  { path: '/vehicles', label: 'Register Kendaraan', icon: Car, perm: 'vehicle:view' as const },
  { path: '/invoices', label: 'Faktur Penjualan', icon: FileText, perm: 'invoice:view' as const },
  { path: '/customers', label: 'Pelanggan', icon: Users, perm: 'customer:view' as const },
  { path: '/workorders', label: 'Order Kerja', icon: Wrench, perm: 'wo:view' as const },
  { path: '/items', label: 'Barang & Jasa', icon: Boxes, perm: 'item:view' as const },
  { path: '/suppliers', label: 'Supplier', icon: Truck, perm: 'supplier:view' as const },
  { path: '/receipts', label: 'Penerimaan Barang', icon: PackageCheck, perm: 'receipt:view' as const },
  { path: '/purchase-invoices', label: 'Faktur Pembelian', icon: ReceiptText, perm: 'purchase:view' as const },
  { path: '/ai', label: 'Asisten AI', icon: Bot, perm: 'dashboard:view' as const },
  { path: '/users', label: 'Pengguna & Akses', icon: Shield, perm: 'user:view' as const },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
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

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleBranchChange = (branchId: string) => {
    setCurrentBranchId(branchId);
    setBranchMenuOpen(false);
  };

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-16'
        } bg-gradient-to-b from-blue-900 via-blue-800 to-blue-900 text-white flex flex-col transition-all duration-300 flex-shrink-0`}
      >
        {/* Logo */}
        <div className="p-4 border-b border-blue-700/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <Wrench className="w-5 h-5 text-white" />
            </div>
            {sidebarOpen && (
              <div>
                <h1 className="font-bold text-sm">DOKTER AC MOBIL</h1>
                <p className="text-xs text-blue-300">Management System</p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 mx-2 rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                    : 'text-blue-200 hover:bg-blue-700/50 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && <span className="text-sm font-medium">{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-blue-700/50">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex items-center gap-3 text-blue-300 hover:text-white transition-colors w-full"
          >
            <Menu className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && <span className="text-sm">Sembunyikan Menu</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold text-gray-800">{getPageTitle()}</h2>
            {location.pathname === '/' && (
              <span className="text-sm text-gray-500">
                Hari ini: {new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            {/* Branch Switcher */}
            {hasPermission('all_branches') && (
              <div className="relative">
                <button
                  onClick={() => setBranchMenuOpen(!branchMenuOpen)}
                  className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Building2 className={`h-4 w-4 ${isAll ? 'text-blue-600' : 'text-gray-600'}`} />
                  <span className={isAll ? 'text-blue-700 font-semibold' : ''}>
                    {isAll ? 'Semua Cabang' : (currentBranch?.name || 'Pilih Cabang')}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                </button>
                {branchMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-lg border border-gray-200 bg-white shadow-xl">
                    <div className="p-2">
                      <button
                        onClick={() => handleBranchChange('ALL')}
                        className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${currentBranchId === 'ALL' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
                      >
                        Semua Cabang
                      </button>
                      {data.branches.filter((b) => b.isActive).map((branch) => (
                        <button
                          key={branch.id}
                          onClick={() => handleBranchChange(branch.id)}
                          className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${currentBranchId === branch.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
                        >
                          {branch.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Stats in header */}
            <div className="hidden md:flex items-center gap-4 text-sm">
              <div className="bg-green-50 px-3 py-1.5 rounded-lg">
                <span className="text-green-600 font-medium">
                  Pendapatan Hari Ini: Rp {todayRevenue.toLocaleString('id-ID')}
                </span>
              </div>
              <div className="bg-blue-50 px-3 py-1.5 rounded-lg">
                <span className="text-blue-600 font-medium">
                  Kendaraan: {data.vehicles.filter((v) => isAll ? true : v.branchId === currentBranchId).length}
                </span>
              </div>
            </div>

            <button className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>

            {/* User Menu */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
                <div className="hidden md:block text-left">
                  <p className="text-sm font-medium text-gray-800">{currentUser?.name || 'Guest'}</p>
                  <p className="text-xs text-gray-500">{currentUser?.roleName} • {isAll ? 'Semua Cabang' : currentBranch?.name}</p>
                </div>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900">{currentUser?.name}</p>
                    <p className="text-xs text-gray-500">{currentUser?.email}</p>
                    <p className="text-xs text-blue-600 mt-1">{currentUser?.roleName}</p>
                    <p className="text-xs text-gray-400">{isAll ? 'Semua Cabang' : currentBranch?.name}</p>
                  </div>
                  <button className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                    <Settings className="w-4 h-4" /> Pengaturan
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" /> Keluar
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Demo Mode Banner */}
        {isDemoMode && (
          <div className="bg-yellow-100 border-b border-yellow-300 px-4 py-2 text-center text-sm text-yellow-800 flex-shrink-0">
            ⚠️ <strong>DEMO MODE</strong> — Backend API tidak tersedia. Perubahan data hanya sementara (hilang setelah refresh). Upload backend ke server untuk mode produksi.
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
