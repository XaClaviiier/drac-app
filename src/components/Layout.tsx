import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ui, workspaceTabClass } from "./ui/interfaceStandards";
import {
  LayoutDashboard,
  Car,
  FileText,
  Users,
  Wrench,
  Boxes,
  PackageCheck,
  Truck,
  ReceiptText,
  Settings,
  Menu,
  Bell,
  User,
  ChevronDown,
  LogOut,
  Building2,
  Shield,
  Bot,
  FolderTree,
  X,
  Warehouse,
  ArrowLeft,
  Home,
  CirclePlus,
  ChevronRight,
  BookOpen,
  Landmark,
  ShoppingCart,
  BarChart3,
  CreditCard,
  ClipboardList,
  ArrowLeftRight,
  History,
  Banknote,
  Activity,
  LoaderCircle,
  CheckCircle2,
  AlertCircle,
  Coins,
  CalendarClock,
  Upload,
  CircleHelp,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import {
  PROCESS_QUEUE_EVENT,
  SystemProcess,
  clearFinishedSystemProcesses,
  readProcessQueue,
} from "../lib/processQueue";

function CrossedToolsIcon({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center text-[21px] leading-none ${className}`}
      aria-hidden="true"
    >
      🛠️
    </span>
  );
}

const navItems = [
  {
    path: "/",
    label: "Dashboard",
    short: "Home",
    icon: LayoutDashboard,
    perm: "dashboard:view" as const,
    color: "from-blue-500 to-indigo-600",
  },
  {
    path: "/workorders",
    label: "Order Kerja",
    short: "Order",
    icon: Wrench,
    perm: "wo:view" as const,
    color: "from-orange-500 to-red-600",
  },
  {
    path: "/invoices",
    label: "Faktur Penjualan",
    short: "Faktur",
    icon: FileText,
    perm: "invoice:view" as const,
    color: "from-green-500 to-emerald-600",
  },
  {
    path: "/customer-payments",
    label: "Pembayaran Pelanggan",
    short: "Pembayaran",
    icon: Banknote,
    perm: "payment:view" as const,
    color: "from-green-400 to-emerald-600",
  },
  {
    path: "/customers",
    label: "Pelanggan",
    short: "Pelanggan",
    icon: Users,
    perm: "customer:view" as const,
    color: "from-violet-500 to-purple-600",
  },
  {
    path: "/vehicles",
    label: "Register Kendaraan",
    short: "Kendaraan",
    icon: Car,
    perm: "vehicle:view" as const,
    color: "from-sky-500 to-blue-600",
  },
  {
    path: "/items",
    label: "Barang & Jasa",
    short: "Barang",
    icon: Boxes,
    perm: "item:view" as const,
    color: "from-teal-500 to-cyan-600",
  },
  {
    path: "/warehouses",
    label: "Gudang & Stok",
    short: "Gudang",
    icon: Warehouse,
    perm: "item:view" as const,
    color: "from-cyan-500 to-blue-700",
  },
  {
    path: "/categories",
    label: "Kategori",
    short: "Kategori",
    icon: FolderTree,
    perm: "item:view" as const,
    color: "from-lime-500 to-green-600",
  },
  {
    path: "/suppliers",
    label: "Supplier",
    short: "Supplier",
    icon: Truck,
    perm: "supplier:view" as const,
    color: "from-amber-500 to-orange-600",
  },
  {
    path: "/receipts",
    label: "Penerimaan Barang",
    short: "Terima",
    icon: PackageCheck,
    perm: "receipt:view" as const,
    color: "from-rose-500 to-pink-600",
  },
  {
    path: "/purchase-invoices",
    label: "Faktur Pembelian",
    short: "Pembelian",
    icon: ReceiptText,
    perm: "purchase:view" as const,
    color: "from-fuchsia-500 to-purple-600",
  },
  {
    path: "/ai",
    label: "Asisten AI",
    short: "AI",
    icon: Bot,
    perm: "ai:view" as const,
    color: "from-cyan-400 to-blue-600",
  },
  {
    path: "/users",
    label: "Pengguna & Akses",
    short: "Pengguna",
    icon: Shield,
    perm: "user:view" as const,
    color: "from-slate-500 to-slate-700",
  },
  {
    path: "/help",
    label: "Dokumentasi Online",
    short: "Panduan",
    icon: CircleHelp,
    perm: "dashboard:view" as const,
    color: "from-blue-500 to-cyan-600",
  },
  {
    path: "/settings",
    label: "Pengaturan",
    short: "Atur",
    icon: Settings,
    perm: "settings:view" as const,
    color: "from-indigo-500 to-violet-700",
  },
];

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/workorders": "Order Kerja",
  "/workorders/timeline": "WO Timeline",
  "/invoices": "Faktur Penjualan",
  "/customer-payments": "Pembayaran Pelanggan",
  "/customers": "Pelanggan",
  "/vehicles": "Register Kendaraan",
  "/items": "Barang & Jasa",
  "/warehouses": "Gudang & Stok",
  "/warehouse-transfers": "Transfer Gudang",
  "/categories": "Kategori",
  "/suppliers": "Supplier",
  "/receipts": "Penerimaan Barang",
  "/receipts/new": "Terima Barang Baru",
  "/purchase-invoices": "Faktur Pembelian",
  "/ai": "Asisten AI",
  "/users": "Pengguna & Akses",
  "/settings": "Pengaturan",
  "/reports": "Daftar Laporan",
  "/reports/workorders": "Laporan WO",
  "/reports/sales": "Laporan Penjualan",
  "/reports/purchases": "Laporan Pembelian",
  "/reports/inventory": "Laporan Persediaan",
  "/reports/stock-count-sheet": "Stok Opname",
  "/opening-stock": "Penyesuaian Stok",
  "/help": "Dokumentasi Online",
  "/reports/cash-bank": "Laporan Kas & Bank",
  "/cash-accounts": "Kas Cabang",
  "/bank-accounts": "Rekening Bank",
  "/branch-deposits": "Setoran Cabang",
  "/chart-of-accounts": "Akun Perkiraan",
  "/performance-bonus": "Kinerja & Bonus",
  "/historical-entry": "Input Cepat Historis",
};

const workspacePathFor = (path: string) =>
  path.startsWith("/receipts/") ? "/receipts" : path;

type DesktopMenuItem = {
  label: string;
  path?: string;
  icon: any;
  perm?: Parameters<ReturnType<typeof useApp>["hasPermission"]>[0];
  tone: "green" | "blue" | "purple" | "orange";
};

const desktopGroups = [
  {
    id: "settings",
    label: "Pengaturan",
    icon: Settings,
    items: [
      {
        label: "Dokumentasi Online",
        path: "/help",
        icon: CircleHelp,
        tone: "blue",
      },
      {
        label: "Profil & Preferensi",
        path: "/settings",
        icon: Settings,
        perm: "settings:view",
        tone: "orange",
      },
      {
        label: "Pengguna",
        path: "/users",
        icon: Users,
        perm: "user:view",
        tone: "blue",
      },
      {
        label: "Grup Akses",
        path: "/users",
        icon: Shield,
        perm: "role:view",
        tone: "blue",
      },
    ],
  },
  {
    id: "ledger",
    label: "Buku Besar",
    icon: BookOpen,
    items: [
      {
        label: "Akun Perkiraan",
        path: "/chart-of-accounts",
        icon: BookOpen,
        perm: "settings:view",
        tone: "blue",
      },
      { label: "Jurnal Umum", icon: ClipboardList, tone: "green" },
      { label: "Buku Besar", icon: BookOpen, tone: "purple" },
      { label: "Saldo Awal", icon: Banknote, tone: "orange" },
      { label: "Laba Rugi", icon: BarChart3, tone: "purple" },
      { label: "Neraca", icon: BarChart3, tone: "purple" },
    ],
  },
  {
    id: "cash",
    label: "Kas & Bank",
    icon: Landmark,
    items: [
      {
        label: "Kas Cabang",
        path: "/cash-accounts",
        icon: Banknote,
        perm: "invoice:view",
        tone: "green",
      },
      {
        label: "Rekening Bank",
        path: "/bank-accounts",
        icon: Landmark,
        perm: "invoice:view",
        tone: "blue",
      },
      { label: "Penerimaan Lain", icon: CreditCard, tone: "green" },
      { label: "Pengeluaran", icon: CreditCard, tone: "orange" },
      {
        label: "Setoran Cabang",
        path: "/branch-deposits",
        icon: ArrowLeftRight,
        perm: "invoice:view",
        tone: "blue",
      },
      {
        label: "Verifikasi Setoran",
        path: "/branch-deposits",
        icon: Shield,
        perm: "invoice:view",
        tone: "purple",
      },
    ],
  },
  {
    id: "sales",
    label: "SERVIS ORDER",
    icon: CrossedToolsIcon,
    items: [
      {
        label: "Daftar WO",
        path: "/workorders",
        icon: Wrench,
        perm: "wo:view",
        tone: "green",
      },
      {
        label: "WO Timeline",
        path: "/workorders/timeline",
        icon: Activity,
        perm: "wo:view",
        tone: "blue",
      },
      {
        label: "Input Cepat Historis",
        path: "/historical-entry",
        icon: CalendarClock,
        perm: "invoice:create",
        tone: "orange",
      },
      {
        label: "Faktur Penjualan",
        path: "/invoices",
        icon: FileText,
        perm: "invoice:view",
        tone: "green",
      },
      {
        label: "Pembayaran Pelanggan",
        path: "/customer-payments",
        icon: Banknote,
        perm: "payment:view",
        tone: "green",
      },
      {
        label: "Pelanggan",
        path: "/customers",
        icon: Users,
        perm: "customer:view",
        tone: "blue",
      },
      {
        label: "Kendaraan",
        path: "/vehicles",
        icon: Car,
        perm: "vehicle:view",
        tone: "blue",
      },
      { label: "Riwayat Pembayaran", icon: History, tone: "purple" },
    ],
  },
  {
    id: "purchase",
    label: "Pembelian",
    icon: ShoppingCart,
    items: [
      {
        label: "Supplier",
        path: "/suppliers",
        icon: Truck,
        perm: "supplier:view",
        tone: "blue",
      },
      {
        label: "Penerimaan Barang",
        path: "/receipts",
        icon: PackageCheck,
        perm: "receipt:view",
        tone: "green",
      },
      {
        label: "Faktur Pembelian",
        path: "/purchase-invoices",
        icon: ReceiptText,
        perm: "purchase:view",
        tone: "green",
      },
      {
        label: "Pembayaran Supplier",
        path: "/purchase-invoices",
        icon: Banknote,
        perm: "purchase:pay",
        tone: "green",
      },
      { label: "Utang Supplier", icon: CreditCard, tone: "orange" },
      { label: "Retur Pembelian", icon: ArrowLeftRight, tone: "purple" },
    ],
  },
  {
    id: "inventory",
    label: "Persediaan",
    icon: Boxes,
    items: [
      {
        label: "Penerimaan Barang",
        path: "/receipts",
        icon: PackageCheck,
        perm: "receipt:view",
        tone: "green",
      },
      {
        label: "Transfer Gudang",
        path: "/warehouse-transfers",
        icon: ArrowLeftRight,
        perm: "item:view",
        tone: "green",
      },
      {
        label: "Penyesuaian Stok",
        path: "/warehouses",
        icon: ClipboardList,
        perm: "item:edit",
        tone: "green",
      },
      {
        label: "Penyesuaian Stok",
        path: "/opening-stock",
        icon: Upload,
        perm: "item:edit",
        tone: "green",
      },
      { label: "Stok Opname", path: "/reports/stock-count-sheet", icon: ClipboardList, perm: "item:view", tone: "green" },
      { label: "Permintaan Barang", icon: FileText, tone: "blue" },
      {
        label: "Barang & Jasa",
        path: "/items",
        icon: Boxes,
        perm: "item:view",
        tone: "blue",
      },
      {
        label: "Gudang",
        path: "/warehouses",
        icon: Warehouse,
        perm: "item:view",
        tone: "blue",
      },
      {
        label: "Stok per Gudang",
        path: "/warehouses",
        icon: Warehouse,
        perm: "item:view",
        tone: "blue",
      },
      {
        label: "Kartu Stok",
        path: "/warehouses",
        icon: History,
        perm: "item:view",
        tone: "purple",
      },
      {
        label: "Stok Minimum",
        path: "/items",
        icon: BarChart3,
        perm: "item:view",
        tone: "purple",
      },
      {
        label: "Kategori Barang",
        path: "/categories",
        icon: FolderTree,
        perm: "item:view",
        tone: "purple",
      },
      {
        label: "Merek & Satuan",
        path: "/items",
        icon: Boxes,
        perm: "item:view",
        tone: "purple",
      },
    ],
  },
  {
    id: "reports",
    label: "Daftar Laporan",
    icon: BarChart3,
    items: [
      {
        label: "Daftar Laporan",
        path: "/reports",
        icon: BarChart3,
        perm: "report:view",
        tone: "blue",
      },
      {
        label: "Kinerja & Bonus",
        path: "/performance-bonus",
        icon: Coins,
        perm: "report:view",
        tone: "purple",
      },
    ],
  },
] satisfies Array<{
  id: string;
  label: string;
  icon: any;
  items: DesktopMenuItem[];
}>;

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      return window.localStorage.getItem("drac-desktop-sidebar-open") === "true";
    } catch {
      return false;
    }
  });
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopMenuOpen, setDesktopMenuOpen] = useState<string | null>(null);
  const [processMenuOpen, setProcessMenuOpen] = useState(false);
  const [systemProcesses, setSystemProcesses] = useState<SystemProcess[]>(() =>
    readProcessQueue(),
  );
  const [processClock, setProcessClock] = useState(() => Date.now());
  const [workspaceTabs, setWorkspaceTabs] = useState<
    Array<{ path: string; label: string }>
  >(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("drac-workspace-tabs") || "[]",
      );
      if (!Array.isArray(saved)) return [];
      return saved
        .filter((tab) => tab?.path && tab.path !== "/" && tab?.label)
        .reduce<Array<{ path: string; label: string }>>((tabs, tab) => {
          const path = workspacePathFor(tab.path);
          if (tabs.some((current) => current.path === path)) return tabs;
          tabs.push({
            path,
            label: path === "/receipts" ? "Penerimaan Barang" : tab.label,
          });
          return tabs;
        }, []);
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "drac-desktop-sidebar-open",
        String(sidebarOpen),
      );
    } catch {
      // Tetap gunakan state lokal bila penyimpanan browser tidak tersedia.
    }
  }, [sidebarOpen]);
  const location = useLocation();
  const navigate = useNavigate();
  const {
    data,
    currentUser,
    currentBranchId,
    setCurrentBranchId,
    logout,
    hasPermission,
    isDemoMode,
  } = useApp();

  const isAll = currentBranchId === "ALL";
  const currentBranch = isAll
    ? null
    : data.branches.find((b) => b.id === currentBranchId);
  const refreshRunning = systemProcesses.some(
    (task) => task.label === "Refresh Data" && task.status === "running",
  );
  const recentProcessSuccess = systemProcesses.some(
    (task) =>
      task.status === "success" &&
      task.finishedAt &&
      processClock - new Date(task.finishedAt).getTime() < 2000,
  );
  const canUseSupplier = Boolean(
    currentUser?.isOwner ||
    currentUser?.roleName?.trim().toLowerCase() === "administrator",
  );
  const canAccessDesktopItem = (item: DesktopMenuItem) =>
    (!item.perm || hasPermission(item.perm)) &&
    (item.path !== "/suppliers" || canUseSupplier);

  const visibleNavItems = navItems.filter(
    (item) =>
      hasPermission(item.perm) &&
      (item.path !== "/suppliers" || canUseSupplier),
  );
  // Supplier dikelola dari desktop saja; jangan tampilkan pada menu HP.
  const mobileVisibleNavItems = visibleNavItems.filter(
    (item) => item.path !== "/suppliers",
  );

  const getPageTitle = () => {
    if (location.pathname.startsWith("/receipts/view/")) {
      const receiptId = decodeURIComponent(
        location.pathname.slice("/receipts/view/".length),
      );
      return (
        data.goodsReceipts.find((receipt) => receipt.id === receiptId)
          ?.receiptNumber || "Detail Penerimaan"
      );
    }
    return (
      pageTitles[location.pathname] ||
      visibleNavItems.find((item) => item.path === location.pathname)?.label ||
      "Dashboard"
    );
  };

  const closeWorkspaceTab = (path: string) => {
    const index = workspaceTabs.findIndex((tab) => tab.path === path);
    const remaining = workspaceTabs.filter((tab) => tab.path !== path);
    setWorkspaceTabs(remaining);
    if (workspacePathFor(location.pathname) === path) {
      const fallback =
        remaining[Math.min(index, remaining.length - 1)]?.path || "/";
      navigate(fallback);
    }
  };

  // Tutup menu mobile saat pindah halaman
  useEffect(() => {
    setMobileMenuOpen(false);
    setDesktopMenuOpen(null);
  }, [location.pathname]);
  useEffect(() => {
    if (location.pathname === "/") return;
    const path = workspacePathFor(location.pathname);
    const label = path === "/receipts" ? "Penerimaan Barang" : getPageTitle();
    setWorkspaceTabs((current) => {
      const withoutReceiptChildren =
        path === "/receipts"
          ? current.filter((tab) => !tab.path.startsWith("/receipts/"))
          : current;
      const existing = withoutReceiptChildren.find((tab) => tab.path === path);
      if (!existing) return [...withoutReceiptChildren, { path, label }];
      if (existing.label === label) return withoutReceiptChildren;
      return withoutReceiptChildren.map((tab) =>
        tab.path === path ? { ...tab, label } : tab,
      );
    });
  }, [location.pathname, data.goodsReceipts]);
  useEffect(() => {
    localStorage.setItem("drac-workspace-tabs", JSON.stringify(workspaceTabs));
  }, [workspaceTabs]);
  useEffect(() => {
    const syncProcesses = (event: Event) =>
      setSystemProcesses(
        (event as CustomEvent<SystemProcess[]>).detail || readProcessQueue(),
      );
    window.addEventListener(PROCESS_QUEUE_EVENT, syncProcesses);
    return () => window.removeEventListener(PROCESS_QUEUE_EVENT, syncProcesses);
  }, []);
  useEffect(() => {
    setProcessClock(Date.now());
    const latestFinished = systemProcesses.reduce(
      (latest, task) =>
        Math.max(
          latest,
          task.finishedAt ? new Date(task.finishedAt).getTime() : 0,
        ),
      0,
    );
    if (!latestFinished) return;
    const remaining = 2050 - (Date.now() - latestFinished);
    if (remaining <= 0) return;
    const timer = window.setTimeout(
      () => setProcessClock(Date.now()),
      remaining,
    );
    return () => window.clearTimeout(timer);
  }, [systemProcesses]);
  useEffect(() => {
    if (!desktopMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDesktopMenuOpen(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [desktopMenuOpen]);
  // Kunci scroll saat menu mobile terbuka
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };
  const handleBranchChange = (branchId: string) => {
    setCurrentBranchId(branchId);
    setBranchMenuOpen(false);
  };

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-gray-100 lg:h-screen">
      {/* ========== SIDEBAR (desktop) ========== */}
      <aside
        className={`${sidebarOpen ? "w-64" : "w-[84px]"} relative z-[70] hidden flex-shrink-0 flex-col bg-[#061a3a] pt-12 text-white shadow-[4px_0_18px_rgba(2,12,30,0.22)] transition-all duration-300 lg:flex`}
      >
        <nav className="flex-1 overflow-visible py-4">
          {/* Dashboard tetap tersedia di tab atas; spacer menjaga posisi menu desktop lain. */}
          <div className="h-12" aria-hidden="true" />
          {desktopGroups.map((group) => {
            const Icon = group.icon;
            const accessibleItems = group.items.filter(canAccessDesktopItem);
            if (accessibleItems.length === 0) return null;
            const groupPaths = accessibleItems.flatMap((item) =>
              item.path ? [item.path] : [],
            );
            const isActive = desktopMenuOpen
              ? desktopMenuOpen === group.id
              : groupPaths.includes(location.pathname);
            return (
              <button
                key={group.id}
                type="button"
                onClick={() =>
                  setDesktopMenuOpen((current) =>
                    current === group.id ? null : group.id,
                  )
                }
                className={`group relative flex h-12 items-center gap-3 rounded-md text-left transition-all ${sidebarOpen ? "mx-2 w-[calc(100%-1rem)] px-4" : "mx-auto w-12 justify-center p-0"} ${isActive ? "bg-[#020d20] text-white shadow-[inset_4px_0_0_#22d3ee]" : "text-white/80 hover:bg-[#12356b] hover:text-white"}`}
              >
                <Icon className="h-6 w-6 flex-shrink-0" />
                {sidebarOpen && (
                  <>
                    <span className="flex-1 text-sm font-medium">
                      {group.label}
                    </span>
                    <ChevronRight
                      className={`h-4 w-4 transition-transform ${desktopMenuOpen === group.id ? "rotate-90" : ""}`}
                    />
                  </>
                )}
                {!sidebarOpen && (
                  <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-[80] -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-gray-800 opacity-0 shadow-lg transition-all group-hover:translate-x-0 group-hover:opacity-100 before:absolute before:-left-1.5 before:top-1/2 before:h-3 before:w-3 before:-translate-y-1/2 before:rotate-45 before:border-b before:border-l before:border-amber-300 before:bg-amber-50">
                    {group.label}
                  </span>
                )}
              </button>
            );
          })}
          {hasPermission("ai:view") && (
            <NavLink
              to="/ai"
              className={`group relative mx-2 mt-4 flex items-center gap-3 rounded-lg border-t border-white/10 py-3 pt-4 transition-all ${sidebarOpen ? "px-4" : "justify-center px-0"} ${location.pathname === "/ai" && !desktopMenuOpen ? "bg-[#020d20] text-white shadow-[inset_4px_0_0_#22d3ee]" : "text-white/80 hover:bg-blue-600 hover:text-white"}`}
            >
              <Bot className="h-6 w-6 flex-shrink-0" />
              {sidebarOpen && (
                <span className="text-sm font-medium">Asisten AI</span>
              )}
              {!sidebarOpen && (
                <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-[80] -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-gray-800 opacity-0 shadow-lg transition-all group-hover:translate-x-0 group-hover:opacity-100 before:absolute before:-left-1.5 before:top-1/2 before:h-3 before:w-3 before:-translate-y-1/2 before:rotate-45 before:border-b before:border-l before:border-amber-300 before:bg-amber-50">
                  Asisten AI
                </span>
              )}
            </NavLink>
          )}
        </nav>

        <div className="border-t border-white/10 p-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex w-full items-center gap-3 text-blue-300 transition-colors hover:text-white"
          >
            <Menu className="h-6 w-6 flex-shrink-0" />
            {sidebarOpen && <span className="text-sm">Sembunyikan Menu</span>}
          </button>
        </div>
      </aside>

      {desktopMenuOpen &&
        (() => {
          const group = desktopGroups.find(
            (item) => item.id === desktopMenuOpen,
          );
          if (!group) return null;
          const items = group.items.filter(canAccessDesktopItem);
          const tones: Record<DesktopMenuItem["tone"], string> = {
            green:
              "border-green-200 bg-green-50 text-green-700 hover:bg-green-100",
            blue: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
            purple:
              "border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100",
            orange:
              "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100",
          };
          return (
            <>
              <button
                type="button"
                aria-label="Tutup menu"
                onClick={() => setDesktopMenuOpen(null)}
                className="fixed inset-0 z-30 hidden bg-transparent lg:block"
              />
              <section
                className={`fixed top-12 z-[60] hidden max-h-[calc(100vh-3rem)] w-[min(520px,calc(100vw-18rem))] overflow-hidden rounded-r-xl border-y border-r border-gray-200 bg-white shadow-[10px_12px_30px_rgba(15,23,42,0.20)] lg:block ${sidebarOpen ? "left-64" : "left-[84px]"}`}
              >
                <div className="px-4 pb-0 pt-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-normal text-gray-600">
                      {group.label}
                    </h2>
                    <button
                      type="button"
                      onClick={() => setDesktopMenuOpen(null)}
                      className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      aria-label="Tutup"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="mt-3 h-0.5 w-full bg-blue-600" />
                </div>
                <div className="p-4">
                  <div className="grid max-h-[calc(100vh-8rem)] grid-cols-3 gap-2.5 overflow-y-auto pr-1">
                    {items.map((item, index) => {
                      const Icon = item.icon;
                      const available = !!item.path;
                      return (
                        <button
                          key={`${item.label}-${index}`}
                          type="button"
                          disabled={!available}
                          onClick={() => {
                            if (!item.path) return;
                            navigate(item.path);
                            setDesktopMenuOpen(null);
                          }}
                          className={`relative flex h-20 flex-col items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-center transition-all duration-150 ${tones[item.tone]} ${available ? "shadow-[0_2px_7px_rgba(15,23,42,0.10)] hover:-translate-y-0.5 hover:shadow-[0_5px_12px_rgba(15,23,42,0.16)] active:translate-y-0" : "cursor-not-allowed opacity-40 shadow-none"}`}
                        >
                          <Icon className="h-6 w-6 stroke-[1.8]" />
                          <span className="text-[13px] font-medium leading-tight text-gray-700">
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            </>
          );
        })()}

      {/* ========== MAIN ========== */}
      <div className="flex flex-1 flex-col overflow-hidden lg:pt-12">
        {/* Header */}
        <header
          className={`${location.pathname === "/" || location.pathname === "/ai" ? "hidden lg:flex" : "flex"} app-brand-header relative flex-shrink-0 items-center justify-between border-b border-blue-300/30 px-3 py-2.5 shadow-sm sm:px-5 sm:py-2 lg:fixed lg:inset-x-0 lg:top-0 lg:z-[75] lg:h-12 lg:py-1`}
        >
          <div className="hidden items-center gap-2.5 lg:flex">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 shadow-sm">
              <Wrench className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-[13px] font-bold leading-4 text-white">
                DOKTER AC MOBIL
              </h1>
              <p className="text-[10px] leading-3 text-blue-100">Management System</p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2 sm:gap-4 lg:hidden">
            {/* Kembali ke dashboard mobile; menu lama tidak digunakan lagi. */}
            <button
              onClick={() => navigate("/")}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md active:scale-95 lg:hidden"
              aria-label="Kembali ke Beranda"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-white sm:text-xl">
                {getPageTitle()}
              </h2>
              {location.pathname === "/" && (
                <span className="hidden text-sm text-blue-100 md:inline">
                  {new Date().toLocaleDateString("id-ID", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              )}
            </div>
          </div>

          <div className="ml-auto flex flex-shrink-0 items-center gap-1.5 sm:gap-3">
            {/* Branch switcher */}
            {hasPermission("all_branches") && (
              <div className="relative">
                <button
                  onClick={() => setBranchMenuOpen(!branchMenuOpen)}
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-white/30 bg-white/10 px-2 text-xs font-medium text-white backdrop-blur-sm hover:bg-white/20 sm:px-3 sm:text-sm lg:h-8"
                >
                  <Building2
                    className={`h-4 w-4 ${isAll ? "text-cyan-200" : "text-blue-100"}`}
                  />
                  <span
                    className={`hidden sm:inline ${isAll ? "font-semibold text-white" : ""}`}
                  >
                    {isAll ? "Semua Cabang" : currentBranch?.name}
                  </span>
                  <span
                    className={`max-w-24 truncate sm:hidden ${isAll ? "font-semibold text-white" : ""}`}
                  >
                    {isAll
                      ? "Semua Cabang"
                      : currentBranch?.name.replace("CABANG ", "")}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-blue-100" />
                </button>
                {branchMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setBranchMenuOpen(false)}
                    />
                    <div className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-gray-200 bg-white p-2 shadow-xl">
                      <button
                        onClick={() => handleBranchChange("ALL")}
                        className={`w-full rounded-lg px-3 py-2 text-left text-sm ${isAll ? "bg-blue-50 font-medium text-blue-700" : "text-gray-700 hover:bg-gray-50"}`}
                      >
                        Semua Cabang
                      </button>
                      {data.branches
                        .filter((b) => b.isActive)
                        .map((b) => (
                          <button
                            key={b.id}
                            onClick={() => handleBranchChange(b.id)}
                            className={`w-full rounded-lg px-3 py-2 text-left text-sm ${currentBranchId === b.id ? "bg-blue-50 font-medium text-blue-700" : "text-gray-700 hover:bg-gray-50"}`}
                          >
                            {b.name}
                          </button>
                        ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="relative hidden sm:block">
              <button
                type="button"
                onClick={() => setProcessMenuOpen((current) => !current)}
                title={
                  refreshRunning
                    ? "Sedang memperbarui data…"
                    : recentProcessSuccess
                      ? "Data berhasil diperbarui"
                      : "Status proses sistem"
                }
                className="relative flex h-9 w-9 items-center justify-center rounded-lg text-blue-100 transition-colors hover:bg-white/15 hover:text-white lg:h-8 lg:w-8"
              >
                {refreshRunning ? (
                  <span className="h-3.5 w-3.5 animate-pulse rounded-full bg-green-500 shadow-[0_0_0_5px_rgba(34,197,94,0.18)]" />
                ) : systemProcesses.some(
                    (task) => task.status === "running",
                  ) ? (
                  <LoaderCircle className="h-5 w-5 animate-spin text-blue-600" />
                ) : systemProcesses.some((task) => task.status === "error") ? (
                  <span className="h-3.5 w-3.5 rounded-full bg-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.14)]" />
                ) : recentProcessSuccess ? (
                  <span className="h-3.5 w-3.5 rounded-full bg-green-500 shadow-[0_0_0_4px_rgba(34,197,94,0.14)]" />
                ) : (
                  <span className="h-3.5 w-3.5 rounded-full bg-gray-300" />
                )}
                {systemProcesses.filter((task) => task.status === "running")
                  .length > 0 && (
                  <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-bold text-white">
                    {
                      systemProcesses.filter(
                        (task) => task.status === "running",
                      ).length
                    }
                  </span>
                )}
              </button>
              {processMenuOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Tutup antrian proses"
                    onClick={() => setProcessMenuOpen(false)}
                    className="fixed inset-0 z-40"
                  />
                  <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
                    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-blue-600" />
                        <h3 className="text-sm font-semibold text-gray-900">
                          Aktivitas Proses
                        </h3>
                      </div>
                      {systemProcesses.some(
                        (task) => task.status !== "running",
                      ) && (
                        <button
                          type="button"
                          onClick={() => {
                            clearFinishedSystemProcesses();
                            setSystemProcesses(readProcessQueue());
                          }}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800"
                        >
                          Bersihkan
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto p-2">
                      {systemProcesses.length === 0 ? (
                        <div className="px-4 py-8 text-center">
                          <span className="mx-auto mb-3 block h-4 w-4 rounded-full bg-gray-300" />
                          <p className="text-sm text-gray-600">
                            Tidak ada proses yang sedang berjalan
                          </p>
                        </div>
                      ) : (
                        systemProcesses.map((task) => (
                          <div
                            key={task.id}
                            className="mb-1 rounded-lg border border-gray-100 p-3 last:mb-0"
                          >
                            <div className="flex items-start gap-2">
                              {task.status === "running" ? (
                                <LoaderCircle className="mt-0.5 h-4 w-4 flex-shrink-0 animate-spin text-blue-600" />
                              ) : task.status === "success" ? (
                                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                              ) : (
                                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-gray-800">
                                  {task.label}
                                </p>
                                {task.message && (
                                  <p className="mt-0.5 text-xs text-gray-500">
                                    {task.message}
                                  </p>
                                )}
                              </div>
                              <span
                                className={`text-[10px] font-semibold ${task.status === "running" ? "text-blue-600" : task.status === "success" ? "text-green-600" : "text-red-600"}`}
                              >
                                {task.status === "running"
                                  ? `${task.progress || 0}%`
                                  : task.status === "success"
                                    ? "Selesai"
                                    : "Gagal"}
                              </span>
                            </div>
                            {task.status === "running" && (
                              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                                <div
                                  className="h-full rounded-full bg-blue-600 transition-all"
                                  style={{ width: `${task.progress || 0}%` }}
                                />
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <button className="relative hidden h-9 w-9 items-center justify-center rounded-lg text-blue-100 transition-colors hover:bg-white/15 hover:text-white sm:flex lg:h-8 lg:w-8">
              <Bell className="h-4 w-4" />
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
            </button>

            {/* User */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-white/15 lg:py-1"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 lg:h-7 lg:w-7">
                  <User className="h-4 w-4 text-white" />
                </div>
                <div className="hidden text-left md:block">
                  <p className="text-[13px] font-medium leading-4 text-white">
                    {currentUser?.name || "Guest"}
                  </p>
                  <p className="text-[10px] leading-3 text-blue-100">
                    {currentUser?.roleName}
                  </p>
                </div>
                <ChevronDown className="hidden h-4 w-4 text-blue-100 sm:block" />
              </button>
              {userMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setUserMenuOpen(false)}
                  />
                  <div className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                    <div className="border-b border-gray-100 px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">
                        {currentUser?.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {currentUser?.email}
                      </p>
                      <p className="mt-1 text-xs text-blue-600">
                        {currentUser?.roleName}
                      </p>
                      <p className="text-xs text-gray-400">
                        {isAll ? "Semua Cabang" : currentBranch?.name}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        navigate("/settings");
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Settings className="h-4 w-4" /> Pengaturan
                    </button>
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                    >
                      <LogOut className="h-4 w-4" /> Keluar
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <div className={`${ui.workspaceBar} hidden lg:flex`}>
          <div className="relative z-10 flex h-[34px] min-w-0 flex-1 items-start gap-0.5 overflow-x-auto overflow-y-hidden">
            <button
              type="button"
              onClick={() => navigate("/")}
              className={`${workspaceTabClass(location.pathname === "/")} justify-between gap-3 px-4 text-sm`}
            >
              <span className="truncate">Dashboard</span>
            </button>
            {workspaceTabs.map((tab) => {
              const active = workspacePathFor(location.pathname) === tab.path;
              return (
                <div
                  key={tab.path}
                  className={`${workspaceTabClass(active)} min-w-40 max-w-56`}
                >
                  <button
                    type="button"
                    onClick={() => navigate(tab.path)}
                    title={tab.label}
                    className={`min-w-0 flex-1 truncate px-3 text-left text-sm ${active ? "font-semibold" : ""}`}
                  >
                    {tab.label}
                  </button>
                  <button
                    type="button"
                    onClick={() => closeWorkspaceTab(tab.path)}
                    title={`Tutup ${tab.label}`}
                    className={`mr-1 rounded p-1 ${active ? "hover:bg-blue-700" : "hover:bg-gray-300"}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
          {workspaceTabs.length > 0 && (
            <select
              aria-label="Pilih modul yang terbuka"
              title="Pilih tab yang terbuka"
              value=""
              onChange={(event) =>
                event.target.value && navigate(event.target.value)
              }
              className="relative z-10 ml-1 h-[34px] w-16 flex-shrink-0 rounded-t-md border border-b-0 border-gray-300 bg-gray-200 px-2 text-sm text-gray-700 outline-none hover:bg-gray-50"
            >
              <option value="">{workspaceTabs.length + 1}</option>
              <option value="/">Dashboard</option>
              {workspaceTabs.map((tab) => (
                <option key={tab.path} value={tab.path}>
                  {tab.label}
                </option>
              ))}
            </select>
          )}
        </div>

        {isDemoMode && (
          <div className="flex-shrink-0 border-b border-yellow-300 bg-yellow-100 px-4 py-2 text-center text-xs text-yellow-800 sm:text-sm">
            ⚠️ <strong>DEMO MODE</strong> — Perubahan data hanya sementara.
          </div>
        )}

        <main
          className={`flex-1 ${location.pathname === "/ai" ? "overflow-hidden p-0 pb-[64px] lg:overflow-y-auto lg:p-6 lg:pb-6" : location.pathname === "/" ? "overflow-y-auto p-0 lg:p-6" : location.pathname.startsWith("/receipts") || location.pathname === "/items" || location.pathname === "/opening-stock" ? "overflow-y-auto p-0 pb-24 lg:pb-0" : "overflow-y-auto p-3 pb-24 sm:p-6 lg:pb-6"}`}
        >
          <Outlet />
        </main>
        {location.pathname !== "/" && (
          <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md items-end justify-around rounded-t-3xl border border-white/10 bg-[#092542]/95 px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 text-white shadow-2xl backdrop-blur-xl lg:hidden">
            <MobileBottom
              icon={Home}
              label="Beranda"
              active={false}
              onClick={() => navigate("/")}
            />
            <MobileBottom
              icon={Activity}
              label="Timeline"
              active={location.pathname === "/workorders/timeline"}
              onClick={() => navigate("/workorders/timeline")}
            />
            <MobileBottom
              icon={CirclePlus}
              label="Tambah"
              active={false}
              onClick={() =>
                navigate(currentBranchId === "ALL" ? "/" : "/workorders")
              }
            />
            {hasPermission("ai:view") && (
              <MobileBottom
                icon={Bot}
                label="Asisten AI"
                active={location.pathname === "/ai"}
                onClick={() => navigate("/ai")}
              />
            )}
            <MobileBottom
              icon={Settings}
              label="Akun"
              active={location.pathname === "/settings"}
              onClick={() => navigate("/settings")}
            />
          </nav>
        )}
      </div>

      {/* ========== MOBILE FULLSCREEN MENU (Doughnut Grid) ========== */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          {/* Backdrop gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-blue-950 via-slate-900 to-blue-900" />
          <div
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 20%, rgba(34,211,238,.4), transparent 45%), radial-gradient(circle at 80% 75%, rgba(99,102,241,.45), transparent 45%)",
            }}
          />

          <div className="relative flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-6 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 shadow-lg shadow-cyan-500/30">
                  <Wrench className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="font-display text-base font-bold text-white">
                    DOKTER AC MOBIL
                  </h1>
                  <p className="text-xs text-blue-300">Management System</p>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white backdrop-blur active:scale-95"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Cabang aktif selalu terlihat di bagian atas menu HP */}
            {hasPermission("all_branches") && (
              <div className="mx-5 mb-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-blue-300">
                  Cabang aktif
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  <button
                    onClick={() => handleBranchChange("ALL")}
                    className={`flex flex-shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${isAll ? "bg-cyan-400 text-slate-950" : "bg-white/10 text-slate-200"}`}
                  >
                    <Building2 className="h-4 w-4" /> Semua Cabang
                  </button>
                  {data.branches
                    .filter((b) => b.isActive)
                    .map((b) => (
                      <button
                        key={b.id}
                        onClick={() => handleBranchChange(b.id)}
                        className={`flex-shrink-0 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${currentBranchId === b.id ? "bg-cyan-400 text-slate-950" : "bg-white/10 text-slate-200"}`}
                      >
                        {b.name.replace("CABANG ", "")}
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
                <p className="truncate text-sm font-semibold text-white">
                  {currentUser?.name}
                </p>
                <p className="text-xs text-blue-200">{currentUser?.roleName}</p>
              </div>
            </div>

            {/* Menu grid — kartu bulat penuh layar */}
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <div className="grid grid-cols-3 gap-3">
                {mobileVisibleNavItems.map((item, idx) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <button
                      key={item.path}
                      onClick={() => {
                        navigate(item.path);
                        setMobileMenuOpen(false);
                      }}
                      style={{ animationDelay: `${idx * 35}ms` }}
                      className={`animate-msg-in flex flex-col items-center gap-2 rounded-2xl p-3 transition-all active:scale-95 ${
                        isActive
                          ? "bg-white/20 ring-2 ring-cyan-400"
                          : "bg-white/5 hover:bg-white/10"
                      }`}
                    >
                      {/* Doughnut icon */}
                      <div
                        className={`relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br ${item.color} shadow-lg`}
                      >
                        <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-slate-900/85">
                          <Icon className="h-6 w-6 text-white" />
                        </div>
                        {isActive && (
                          <span className="absolute -bottom-0.5 h-1.5 w-1.5 rounded-full bg-cyan-300" />
                        )}
                      </div>
                      <span
                        className={`text-center text-[11px] font-semibold leading-tight ${isActive ? "text-cyan-200" : "text-slate-300"}`}
                      >
                        {item.short}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom actions */}
            <div className="border-t border-white/10 p-4">
              <button
                onClick={handleLogout}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500/20 py-3 text-sm font-semibold text-red-200 active:scale-[.98]"
              >
                <LogOut className="h-4 w-4" /> Keluar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MobileBottom({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: any;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-16 flex-col items-center gap-1 py-1 text-[10px] ${active ? "text-sky-400" : "text-slate-400"}`}
    >
      <Icon className="h-5 w-5" />
      {label}
    </button>
  );
}
