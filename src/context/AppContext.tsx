import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { Vehicle, Customer, SalesInvoice, WorkOrder, AppData, AppSettings, Item, ItemCategory, Branch, Role, User, Permission, Supplier, GoodsReceipt, PurchaseInvoice, PurchasePayment, WOStatus } from '../types';
import { api } from '../lib/apiClient';
import { demoData } from '../lib/demoData';
import { failSystemProcess, finishSystemProcess, startSystemProcess } from '../lib/processQueue';
import { localDateKey } from '../lib/date';

interface AppContextType {
  data: AppData;
  currentUser: User | null;
  currentBranchId: string;
  setCurrentBranchId: (id: string) => void;
  /** Cabang efektif untuk menyimpan data baru — tidak pernah mengembalikan 'ALL' */
  resolveBranchId: () => string;
  login: (username: string, password: string) => Promise<User | null>;
  logout: () => void;
  hasPermission: (perm: Permission) => boolean;
  isLoading: boolean;
  isDemoMode: boolean;
  refreshData: () => Promise<void>;
  updateSettings: (settings: AppSettings) => Promise<void>;
  generateDocumentNumber: (type: 'workOrder' | 'invoice', branchId: string, date?: Date) => string;
  addVehicle: (vehicle: Vehicle) => Promise<void>;
  updateVehicle: (id: string, vehicle: Vehicle) => Promise<void>;
  deleteVehicle: (id: string) => Promise<void>;
  addCustomer: (customer: Omit<Customer, 'customerCode'> & { customerCode?: string }) => Promise<Customer>;
  updateCustomer: (id: string, customer: Customer) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  generateCustomerCode: () => string;
  addInvoice: (invoice: SalesInvoice) => Promise<void>;
  updateInvoice: (id: string, invoice: SalesInvoice) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;
  addWorkOrder: (wo: WorkOrder) => Promise<void>;
  updateWorkOrder: (id: string, wo: WorkOrder) => Promise<void>;
  deleteWorkOrder: (id: string) => Promise<void>;
  continueWorkOrder: (
    sourceWoId: string,
    targetBranchId: string,
    options?: { resetJob?: boolean }
  ) => Promise<WorkOrder | null>;
  /** Cari WO aktif (belum Invoiced/Closed dan belum dilanjutkan) untuk plat nomor tertentu. */
  findActiveWoByPlate: (plateNumber: string) => WorkOrder | null;
  /** Ubah status WO dengan validasi urutan dan pencatatan jejak audit. */
  changeWorkOrderStatus: (woId: string, nextStatus: WOStatus, reason?: string) => Promise<{ ok: boolean; message?: string }>;
  createInvoiceFromWO: (woId: string, payment: number, paymentMethod: 'Tunai' | 'Transfer', invoiceDate?: string, paymentDate?: string, backdateReason?: string, items?: WorkOrder['services']) => Promise<SalesInvoice | null>;
  addItem: (item: Item) => Promise<void>;
  updateItem: (id: string, item: Item) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  addItemCategory: (category: ItemCategory) => Promise<void>;
  updateItemCategory: (id: string, category: ItemCategory) => Promise<void>;
  deleteItemCategory: (id: string) => Promise<void>;
  addBranch: (branch: Branch) => Promise<void>;
  updateBranch: (id: string, branch: Branch) => Promise<void>;
  deleteBranch: (id: string) => Promise<void>;
  addRole: (role: Role) => Promise<void>;
  updateRole: (id: string, role: Role) => Promise<void>;
  deleteRole: (id: string) => Promise<void>;
  addUser: (user: User) => Promise<void>;
  updateUser: (id: string, user: User) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  addSupplier: (supplier: Supplier) => Promise<Supplier>;
  updateSupplier: (id: string, supplier: Supplier) => Promise<void>;
  deleteSupplier: (id: string) => Promise<void>;
  generateSupplierCode: () => string;
  addGoodsReceipt: (receipt: GoodsReceipt) => Promise<GoodsReceipt>;
  updateGoodsReceipt: (id: string, receipt: GoodsReceipt) => Promise<void>;
  deleteGoodsReceipt: (id: string) => Promise<void>;
  generateReceiptNumber: (branchId: string) => string;
  receiveGoods: (receiptId: string) => Promise<void>;
  addPurchaseInvoice: (invoice: PurchaseInvoice) => Promise<PurchaseInvoice>;
  updatePurchaseInvoice: (id: string, invoice: PurchaseInvoice) => Promise<void>;
  deletePurchaseInvoice: (id: string) => Promise<void>;
  generatePurchaseInvoiceNumber: (branchId: string) => string;
  addPurchasePayment: (invoiceId: string, payment: PurchasePayment) => Promise<void>;
  deletePurchasePayment: (invoiceId: string, paymentId: string) => Promise<void>;
}

const emptyData: AppData = {
  vehicles: [], customers: [], invoices: [], workOrders: [],
  itemCategories: [], items: [], branches: [], roles: [], users: [],
  suppliers: [], goodsReceipts: [], purchaseInvoices: [],
  warehouses: [], warehouseStocks: [], stockMovements: [],
  settings: demoData.settings,
};

const AppContext = createContext<AppContextType | undefined>(undefined);
// Demo tidak boleh aktif hanya karena backend gagal. Pengembang harus
// mengaktifkannya secara eksplisit dan build produksi tetap selalu memakai API.
const allowDemoMode = import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEMO_MODE === 'true';

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(emptyData);
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('currentUser');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [currentBranchId, setCurrentBranchIdState] = useState<string>(() => {
    return localStorage.getItem('currentBranchId') || 'ALL';
  });
  const [isLoading, setIsLoading] = useState(true);

  const setCurrentBranchId = (id: string) => {
    setCurrentBranchIdState(id);
    localStorage.setItem('currentBranchId', id);
  };

  // Track if using demo mode (backend not available)
  const [isDemoMode, setIsDemoMode] = useState(false);
  const refreshRequestId = useRef(0);

  // Load all data from API (with demo fallback)
  const refreshData = async () => {
    const processId = startSystemProcess('Refresh Data', 'Mengambil data terbaru dari server');
    const requestId = ++refreshRequestId.current;
    setIsLoading(true);
    let res = await api.loadAllData();
    // Koneksi pertama setelah login/redirect HTTPS kadang belum siap.
    // Coba sekali lagi sebelum memutuskan menggunakan data demo.
    if (!res.success) {
      await new Promise(resolve => setTimeout(resolve, 350));
      if (requestId !== refreshRequestId.current) {
        finishSystemProcess(processId, 'Digantikan oleh permintaan refresh terbaru');
        return;
      }
      res = await api.loadAllData();
    }
    // Hanya request terbaru yang boleh mengubah state aplikasi.
    if (requestId !== refreshRequestId.current) {
      finishSystemProcess(processId, 'Digantikan oleh permintaan refresh terbaru');
      return;
    }
    if (res.success && res.data) {
      const access = res.data.currentAccess;
      if (access && Array.isArray(access.permissions)) {
        setCurrentUser((previous) => {
          if (!previous) return previous;
          const synchronizedUser: User = {
            ...previous,
            permissions: access.permissions as Permission[],
            branchId: access.branchId || previous.branchId,
            branchIds: Array.isArray(access.branchIds)
              ? access.branchIds.map(String)
              : previous.branchIds,
          };
          localStorage.setItem('currentUser', JSON.stringify(synchronizedUser));
          return synchronizedUser;
        });
      }
      setData({
        vehicles: (res.data.vehicles || []).map((vehicle: any) => ({
          ...vehicle,
          customerRefId: vehicle.customerRefId || vehicle.customer_id || undefined,
        })),
        customers: res.data.customers || [],
        invoices: res.data.invoices || [],
        workOrders: res.data.workOrders || [],
        itemCategories: res.data.itemCategories || [],
        items: res.data.items || [],
        branches: res.data.branches || [],
        roles: res.data.roles || [],
        users: res.data.users || [],
        suppliers: res.data.suppliers || [],
        goodsReceipts: res.data.goodsReceipts || [],
        purchaseInvoices: res.data.purchaseInvoices || [],
        warehouses: res.data.warehouses || [],
        warehouseStocks: res.data.warehouseStocks || [],
        stockMovements: res.data.stockMovements || [],
        settings: res.data.settings || demoData.settings,
      });
      setIsDemoMode(false);
      finishSystemProcess(processId, 'Data berhasil diperbarui');
    } else if (allowDemoMode) {
      // Backend not available - fallback to demo data
      console.warn('⚠️ Backend API tidak tersedia. Menggunakan DEMO MODE (data tidak akan tersimpan).');
      let savedSettings = demoData.settings;
      try {
        const stored = localStorage.getItem('appSettings');
        if (stored) savedSettings = JSON.parse(stored);
      } catch { /* gunakan pengaturan bawaan */ }
      setData({ ...demoData, settings: savedSettings });
      setIsDemoMode(true);
      finishSystemProcess(processId, 'Data lokal demo berhasil dimuat');
    } else {
      console.error('Backend API tidak tersedia. Data demo dinonaktifkan di production.');
      setIsDemoMode(false);
      failSystemProcess(processId, 'Gagal mengambil data dari server');
    }
    if (requestId === refreshRequestId.current) setIsLoading(false);
  };

  // Load data on startup
  useEffect(() => {
    refreshData();
  }, []);

  // ===== AUTH =====
  const login = async (username: string, password: string): Promise<User | null> => {
    // Try backend API first
    const res = await api.login(username, password);
    let user: User | null = null;

    if (res.success && res.data) {
      user = res.data as User;
      // Pasang identitas dan izin efektif sebelum memuat data. Ini mencegah
      // halaman berizin (mis. AI) sempat menganggap user tidak punya akses.
      setCurrentUser(user);
      localStorage.setItem('currentUser', JSON.stringify(user));
      await refreshData();
    } else if (allowDemoMode) {
      // Fallback: cek dari demo data (untuk preview local)
      const demoUser = demoData.users.find(u => u.username === username && u.password === password && u.isActive);
      if (demoUser) {
        user = { ...demoUser };
        setData(demoData);
        setIsDemoMode(true);
      }
    }

    if (!user) return null;
    if (isDemoMode) {
      setCurrentUser(user);
      localStorage.setItem('currentUser', JSON.stringify(user));
    }
    // Set branch based on permission
    const roles = isDemoMode ? demoData.roles : data.roles;
    const role = roles.find((r) => r.id === user!.roleId);
    const startsAll = Boolean(
      user.isOwner
      || user.permissions?.includes('all_branches')
      || role?.permissions.includes('all_branches'),
    );
    const assignedBranches = Array.from(new Set([
      user.branchId,
      ...(user.branchIds || []),
    ].filter((branchId): branchId is string => Boolean(branchId && branchId !== 'ALL' && branchId !== 'undefined'))));
    const branch = startsAll ? 'ALL' : (assignedBranches[0] || 'ALL');
    setCurrentBranchId(branch);
    return user;
  };

  const logout = () => {
    void api.logout();
    setCurrentUser(null);
    localStorage.removeItem('currentUser');
    localStorage.removeItem('apiToken');
    setCurrentBranchId('ALL');
  };

  useEffect(() => {
    if (!currentUser?.sessionExpiresAt) return;
    const expires = new Date(currentUser.sessionExpiresAt.replace(' ', 'T')).getTime();
    // Jangan menganggap format tanggal yang tidak dikenali browser sebagai
    // sesi kedaluwarsa. Backend baru mengirim ISO-8601 dengan zona waktu.
    if (!Number.isFinite(expires)) return;
    const delay = expires - Date.now();
    if (delay <= 0) { logout(); return; }
    const timer = window.setTimeout(() => logout(), Math.min(delay, 2147483647));
    return () => window.clearTimeout(timer);
  }, [currentUser?.sessionExpiresAt]);

  useEffect(() => {
    const minutes = currentUser?.idleTimeoutMinutes || 0;
    if (!currentUser || currentUser.isOwner || minutes <= 0) return;
    let timer = window.setTimeout(logout, minutes * 60 * 1000);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(logout, minutes * 60 * 1000);
    };
    const events = ['mousedown','keydown','touchstart','scroll'] as const;
    events.forEach(event => window.addEventListener(event, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach(event => window.removeEventListener(event, reset));
    };
  }, [currentUser?.id, currentUser?.idleTimeoutMinutes, currentUser?.isOwner]);

  const hasPermission = (perm: Permission): boolean => {
    if (!currentUser) return false;
    if (currentUser.isOwner) return true;
    // Izin efektif dari server adalah sumber utama. Nilai ini juga berisi
    // baseline kompatibilitas role lama dan otomatis diperbarui saat refresh.
    if (currentUser.permissions?.includes(perm)) return true;
    const role = data.roles.find((r) => r.id === currentUser.roleId);
    // Kompatibilitas role Teknisi lama yang dibuat sebelum izin operasional
    // mobile ditambahkan. Role baru sudah membawa izin ini dari data awal.
    const normalizedRoleName = (role?.name || currentUser.roleName || '').trim().toLowerCase();
    const isTechnicianRole = role?.code?.toUpperCase() === 'TKN'
      || normalizedRoleName.includes('teknisi')
      || normalizedRoleName.includes('technician');
    const technicianBaseline: Permission[] = [
      'ai:view',
      'wo:view', 'wo:create',
      'customer:view', 'customer:create',
      'vehicle:view', 'vehicle:create',
      'item:view',
    ];
    if (isTechnicianRole && technicianBaseline.includes(perm)) return true;
    return role?.permissions.includes(perm) ?? false;
  };

  // Pulihkan pilihan cabang yang kosong/usang (misalnya sesi lama menyimpan
  // nilai "undefined"). User non-owner otomatis diarahkan ke cabang pertama
  // yang memang diberikan kepadanya, tanpa memperluas hak cabang.
  useEffect(() => {
    if (!currentUser || data.branches.length === 0) return;
    const loadedUser = data.users.find(user => user.id === currentUser.id);
    const assignedBranchIds = Array.from(new Set([
      loadedUser?.branchId,
      ...(loadedUser?.branchIds || []),
      currentUser.branchId,
      ...(currentUser.branchIds || []),
    ].filter((branchId): branchId is string => Boolean(
      branchId && branchId !== 'ALL' && branchId !== 'undefined'
        && data.branches.some(branch => branch.id === branchId && branch.isActive)
    ))));
    const canUseAllBranches = currentUser.isOwner || hasPermission('all_branches');
    if (!canUseAllBranches && assignedBranchIds.length > 0 && !assignedBranchIds.includes(currentBranchId)) {
      setCurrentBranchId(assignedBranchIds[0]);
    }
  }, [currentUser?.id, currentBranchId, data.branches, data.roles, data.users]);

  const updateSettings = async (settings: AppSettings) => {
    if (isDemoMode) {
      setData(prev => ({ ...prev, settings }));
      localStorage.setItem('appSettings', JSON.stringify(settings));
      return;
    }
    const res = await api.updateSettings(settings);
    if (!res.success) throw new Error(res.message || 'Gagal menyimpan pengaturan');
    setData(prev => ({ ...prev, settings }));
  };

  const generateDocumentNumber = (type: 'workOrder' | 'invoice', branchId: string, date = new Date()) => {
    const settings = data.settings || demoData.settings;
    const code = (settings.branchDocumentCodes[branchId] || 'X').toUpperCase();
    const yy = String(date.getFullYear()).slice(-2);
    if (type === 'invoice') {
      const branchNumbers: Record<string, string> = { 'BR-001': '3', 'BR-002': '2', 'BR-003': '1' };
      const numberPrefix = `${code}${yy}${branchNumbers[branchId] || '0'}`;
      const maxSequence = data.invoices
        .filter(invoice => invoice.branchId === branchId && invoice.invoiceNumber.startsWith(numberPrefix))
        .reduce((max, invoice) => {
          const sequence = Number(invoice.invoiceNumber.slice(numberPrefix.length));
          return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
        }, 0);
      return `${numberPrefix}${String(maxSequence + 1).padStart(3, '0')}`;
    }
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const dateKey = `${yy}${mm}${dd}`;
    const prefix = settings.documents.workOrderPrefix;
    const source = data.workOrders;
    const numberPrefix = `${prefix}${code}${dateKey}`;
    const maxSequence = source
      .filter(doc => doc.branchId === branchId)
      .reduce((max, doc) => {
        const value = (doc as WorkOrder).woNumber;
        if (!value.startsWith(numberPrefix)) return max;
        const sequence = Number(value.slice(numberPrefix.length));
        return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
      }, 0);
    return `${numberPrefix}${String(maxSequence + 1).padStart(settings.documents.sequenceDigits, '0')}`;
  };

  /**
   * Cabang efektif untuk menyimpan data baru.
   * Jika user sedang melihat "Semua Cabang" (ALL), pakai cabang asal user.
   * Tidak pernah mengembalikan 'ALL' supaya data tidak nyangkut.
   */
  const resolveBranchId = (): string => {
    if (currentBranchId && currentBranchId !== 'ALL') return currentBranchId;
    if (currentUser?.branchId && currentUser.branchId !== 'ALL') return currentUser.branchId;
    const firstActive = data.branches.find(b => b.isActive);
    return firstActive?.id || 'BR-001';
  };

  // Helper: eksekusi CRUD - jika demo mode, langsung update state
  const executeCRUD = async (
    operation: () => Promise<any>,
    localAction: () => void
  ): Promise<void> => {
    if (isDemoMode) {
      localAction();
      return;
    }
    const result = await operation();
    if (!result?.success) {
      throw new Error(result?.message || result?.error || 'Operasi gagal disimpan');
    }
    await refreshData();
  };

  // ===== VEHICLES =====
  const addVehicle = async (v: Vehicle) => {
    const vehicle: Vehicle = { ...v, firstSeenBranchId: v.firstSeenBranchId || v.branchId };
    await executeCRUD(
      () => api.create('vehicles', vehicle),
      () => setData(prev => ({ ...prev, vehicles: [...prev.vehicles, vehicle] }))
    );
  };
  const updateVehicle = async (id: string, v: Vehicle) => {
    await executeCRUD(
      () => api.update('vehicles', id, v),
      () => setData(prev => ({ ...prev, vehicles: prev.vehicles.map(x => x.id === id ? v : x) }))
    );
  };
  const deleteVehicle = async (id: string) => {
    await executeCRUD(
      () => api.remove('vehicles', id),
      () => setData(prev => ({ ...prev, vehicles: prev.vehicles.filter(x => x.id !== id) }))
    );
  };

  // ===== CUSTOMERS =====
  const generateCustomerCode = () => {
    const maxNum = data.customers.reduce((max, c) => {
      const match = c.customerCode?.match(/PLG-(\d+)/);
      const num = match ? parseInt(match[1]) : 0;
      return num > max ? num : max;
    }, 0);
    return `PLG-${String(maxNum + 1).padStart(3, '0')}`;
  };

  const addCustomer = async (customer: Omit<Customer, 'customerCode'> & { customerCode?: string }): Promise<Customer> => {
    const newCustomer: Customer = {
      ...customer,
      customerCode: customer.customerCode || generateCustomerCode(),
      // Catat cabang pertama kali input; tidak berubah meski dilihat dari cabang lain.
      firstSeenBranchId: customer.firstSeenBranchId || customer.branchId,
    };
    await executeCRUD(
      () => api.create('customers', newCustomer),
      () => setData(prev => ({ ...prev, customers: [...prev.customers, newCustomer] }))
    );
    return newCustomer;
  };
  const updateCustomer = async (id: string, c: Customer) => {
    await executeCRUD(
      () => api.update('customers', id, c),
      () => setData(prev => ({ ...prev, customers: prev.customers.map(x => x.id === id ? c : x) }))
    );
  };
  const deleteCustomer = async (id: string) => {
    await executeCRUD(
      () => api.remove('customers', id),
      () => setData(prev => ({ ...prev, customers: prev.customers.filter(x => x.id !== id) }))
    );
  };

  // ===== INVOICES =====
  const addInvoice = async (inv: SalesInvoice) => {
    await executeCRUD(
      () => api.create('sales-invoices', inv),
      () => setData(prev => {
        const nextItems = prev.items.map(item => {
          if (item.type !== 'Persediaan') return item;
          const soldQty = (inv.items || [])
            .filter(detail => detail.itemId === item.id)
            .reduce((sum, detail) => sum + detail.qty, 0);
          return soldQty > 0
            ? { ...item, stock: item.stock - soldQty, sellableStock: item.sellableStock - soldQty }
            : item;
        });
        return { ...prev, items: nextItems, invoices: [...prev.invoices, inv] };
      })
    );
  };
  const updateInvoice = async (id: string, inv: SalesInvoice) => {
    if (!isDemoMode) {
      const res = await api.update('sales-invoices', id, inv);
      if (!res.success) throw new Error(res.message || 'Gagal memperbarui faktur');
      await refreshData();
      return;
    }
    setData(prev => {
      const oldInvoice = prev.invoices.find(x => x.id === id);
      const nextItems = prev.items.map(item => {
        if (item.type !== 'Persediaan') return item;
        const oldQty = (oldInvoice?.items || []).filter(detail => detail.itemId === item.id).reduce((sum, detail) => sum + detail.qty, 0);
        const newQty = (inv.items || []).filter(detail => detail.itemId === item.id).reduce((sum, detail) => sum + detail.qty, 0);
        const delta = oldQty - newQty;
        return delta ? { ...item, stock: item.stock + delta, sellableStock: item.sellableStock + delta } : item;
      });
      return { ...prev, items: nextItems, invoices: prev.invoices.map(x => x.id === id ? inv : x) };
    });
  };
  const deleteInvoice = async (id: string) => {
    await executeCRUD(
      () => api.remove('sales-invoices', id),
      () => setData(prev => {
        const invoice = prev.invoices.find(x => x.id === id);
        const nextItems = prev.items.map(item => {
          if (item.type !== 'Persediaan' || !invoice) return item;
          const returnedQty = (invoice.items || [])
            .filter(detail => detail.itemId === item.id)
            .reduce((sum, detail) => sum + detail.qty, 0);
          return returnedQty > 0
            ? { ...item, stock: item.stock + returnedQty, sellableStock: item.sellableStock + returnedQty }
            : item;
        });
        const nextWorkOrders = invoice?.woId
          ? prev.workOrders.map(wo => wo.id === invoice.woId
            ? { ...wo, status: 'Selesai' as const, invoiceId: undefined, invoiceNumber: undefined }
            : wo)
          : prev.workOrders;
        return { ...prev, items: nextItems, workOrders: nextWorkOrders, invoices: prev.invoices.filter(x => x.id !== id) };
      })
    );
  };

  // ===== WORK ORDERS =====
  const addWorkOrder = async (wo: WorkOrder) => {
    const createdWorkOrder: WorkOrder = {
      ...wo,
      createdBy: wo.createdBy || currentUser?.id,
      createdByName: wo.createdByName || currentUser?.name,
    };
    await executeCRUD(
      () => api.create('work-orders', createdWorkOrder),
      () => setData(prev => ({ ...prev, workOrders: [...prev.workOrders, createdWorkOrder] }))
    );
  };
  const updateWorkOrder = async (id: string, wo: WorkOrder) => {
    await executeCRUD(
      () => api.update('work-orders', id, wo),
      () => setData(prev => ({ ...prev, workOrders: prev.workOrders.map(x => x.id === id ? wo : x) }))
    );
  };
  const deleteWorkOrder = async (id: string) => {
    await executeCRUD(
      () => api.remove('work-orders', id),
      () => setData(prev => ({ ...prev, workOrders: prev.workOrders.filter(x => x.id !== id) }))
    );
  };

  // Lanjutkan WO pengecekan di cabang lain — buat WO BARU, tandai WO lama sudah dilanjutkan
  /** Cari WO aktif untuk plat nomor tertentu — dipakai untuk kunci "1 mobil 1 WO". */
  const findActiveWoByPlate = (plateNumber: string): WorkOrder | null => {
    const clean = plateNumber.replace(/\s+/g, '').toUpperCase();
    if (!clean) return null;
    return data.workOrders.find(wo => {
      if (wo.plateNumber.replace(/\s+/g, '').toUpperCase() !== clean) return false;
      if (wo.status === 'Invoiced' || wo.status === 'Closed') return false;
      if (wo.continuedToWoId) return false; // sudah dilanjutkan di WO lain
      return true;
    }) || null;
  };

  /** Validasi alur status berurutan. */
  const isStatusTransitionAllowed = (from: WOStatus, to: WOStatus): boolean => {
    if (from === to) return false;
    const forward: Record<WOStatus, WOStatus[]> = {
      Pengecekan: ['Proses', 'Pending', 'Closed'],
      // Pending dapat dibuka kembali ke tahap Diagnosa selama belum kedaluwarsa.
      Pending: ['Pengecekan', 'Proses', 'Closed'],
      // Setelah pekerjaan dimulai, WO hanya boleh diselesaikan.
      Proses: ['Selesai'],
      Selesai: ['Invoiced'],
      Invoiced: [],
      // Lost Sales dapat dipulihkan bila pelanggan menyetujui masalah yang sama.
      Closed: ['Proses'],
    };
    return forward[from]?.includes(to) ?? false;
  };

  const changeWorkOrderStatus = async (
    woId: string,
    nextStatus: WOStatus,
    reason?: string
  ): Promise<{ ok: boolean; message?: string }> => {
    const wo = data.workOrders.find(w => w.id === woId);
    if (!wo) return { ok: false, message: 'WO tidak ditemukan.' };

    if (!isStatusTransitionAllowed(wo.status, nextStatus)) {
      return { ok: false, message: `Perubahan status ${wo.status} → ${nextStatus} tidak diizinkan.` };
    }

    // Selesai → Invoiced harus lewat pembuatan faktur, bukan ubah manual.
    if (wo.status === 'Pending' && nextStatus === 'Proses' && wo.pendingUntil && new Date(wo.pendingUntil).getTime() < Date.now()) {
      return { ok: false, message: 'Masa Pending sudah lewat 10 hari. Buat WO baru dari data WO lama.' };
    }

    if (wo.status === 'Selesai' && nextStatus === 'Invoiced' && !wo.invoiceId) {
      return { ok: false, message: 'Status Invoiced hanya diberikan otomatis setelah faktur dibuat.' };
    }

    // Pending dan Lost Sales wajib punya alasan.
    const needsReason = nextStatus === 'Pending'
      || nextStatus === 'Closed';
    if (needsReason && !reason?.trim()) {
      return { ok: false, message: 'Alasan wajib diisi untuk perubahan ini.' };
    }

    const now = new Date().toISOString();
    const databaseNow = now.slice(0, 19).replace('T', ' ');
    const pendingDeadline = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
    const log = [
      ...(wo.statusLog || []),
      {
        from: wo.status,
        to: nextStatus,
        at: now,
        byUserId: currentUser?.id || '-',
        byUserName: currentUser?.name || 'System',
        reason: reason?.trim() || undefined,
      },
    ];

    const patch: WorkOrder = {
      ...wo,
      status: nextStatus,
      statusLog: log,
      cancelReason: nextStatus === 'Closed' ? reason?.trim() : wo.cancelReason,
      pendingAt: nextStatus === 'Pending' ? databaseNow : wo.pendingAt,
      pendingUntil: nextStatus === 'Pending'
        ? pendingDeadline
        : wo.pendingUntil,
      pendingReason: nextStatus === 'Pending' ? reason?.trim() : wo.pendingReason,
      approvedAt: (wo.status === 'Pengecekan' || wo.status === 'Pending' || wo.status === 'Closed') && nextStatus === 'Proses'
        ? localDateKey()
        : wo.approvedAt,
      estimateTotal: wo.status === 'Pengecekan' && nextStatus === 'Proses' && !wo.estimateTotal
        ? wo.total
        : wo.estimateTotal,
    };

    await updateWorkOrder(woId, patch);
    return { ok: true };
  };

  const continueWorkOrder = async (
    sourceWoId: string,
    targetBranchId: string,
    options?: { resetJob?: boolean }
  ): Promise<WorkOrder | null> => {
    const src = data.workOrders.find(w => w.id === sourceWoId);
    if (!src) return null;
    const srcBranch = data.branches.find(b => b.id === src.branchId);
    const tgtBranch = data.branches.find(b => b.id === targetBranchId);
    if (!tgtBranch) return null;

    const today = localDateKey();
    const newWoNumber = generateDocumentNumber('workOrder', targetBranchId);
    const newId = Date.now().toString();

    const resetJob = options?.resetJob === true;
    const copiedServices = resetJob
      ? []
      : src.services.map((s, i) => {
          const currentItem = data.items.find(item => item.id === s.itemId);
          return { ...s, id: `${newId}-${i}`, price: currentItem?.sellingPrice ?? s.price };
        });
    const copiedTotal = resetJob
      ? 0
      : src.services.reduce((sum, service) => {
          const currentItem = data.items.find(item => item.id === service.itemId);
          return sum + (currentItem?.sellingPrice ?? service.price) * service.qty;
        }, 0);

    const newWo: WorkOrder = {
      id: newId,
      woNumber: newWoNumber,
      date: today,
      customerRefId: src.customerRefId,
      customerId: src.customerId,
      customerName: src.customerName,
      vehicleRefId: src.vehicleRefId,
      plateNumber: src.plateNumber,
      vehicleInfo: src.vehicleInfo,
      description: resetJob ? '' : src.description,
      findings: resetJob ? undefined : src.findings,
      diagnosisTemperature: resetJob ? undefined : src.diagnosisTemperature,
      diagnosisLp: resetJob ? undefined : src.diagnosisLp,
      diagnosisHp: resetJob ? undefined : src.diagnosisHp,
      finalTemperature: undefined,
      finalLp: undefined,
      finalHp: undefined,
      services: copiedServices,
      total: copiedTotal,
      estimateTotal: undefined,
      status: ['Pending', 'Closed'].includes(src.status) ? 'Pengecekan' : 'Proses',
      notes: resetJob
        ? `Masalah berbeda. Referensi data pelanggan dan kendaraan dari ${src.woNumber} (${srcBranch?.name || '-'}).`
        : `Lanjutan dari ${src.woNumber} (${srcBranch?.name || '-'}).${src.notes ? `\n${src.notes}` : ''}`,
      branchId: targetBranchId,
      continuedFromWoId: src.id,
      continuedFromWoNumber: src.woNumber,
      continuedFromBranchName: srcBranch?.name || '-',
    };

    await addWorkOrder(newWo);
    await updateWorkOrder(src.id, {
      ...src,
      continuedToWoId: newId,
      continuedToWoNumber: newWoNumber,
      continuedToBranchName: tgtBranch.name,
      continuedAt: new Date().toISOString(),
      continuedBy: currentUser?.id,
      continuedByName: currentUser?.name,
      continuedBranchId: targetBranchId,
      notes: `${src.notes || ''}\n[${today}] Dilanjutkan di ${newWoNumber} (${tgtBranch.name}) oleh ${currentUser?.name || 'System'}`.trim(),
    });

    return newWo;
  };

  const createInvoiceFromWO = async (
    woId: string,
    payment: number,
    paymentMethod: 'Tunai' | 'Transfer',
    invoiceDate?: string,
    paymentDate?: string,
    backdateReason?: string,
    invoiceItems?: WorkOrder['services']
  ): Promise<SalesInvoice | null> => {
    const wo = data.workOrders.find((w) => w.id === woId);
    if (!wo) return null;

    const today = invoiceDate || localDateKey();
    const finalItems = (invoiceItems || wo.services).map((item, index) => ({ ...item, id: `${Date.now()}-${index}` }));
    const invoiceTotal = finalItems.reduce((sum, item) => sum + item.price * item.qty, 0);
    if (invoiceTotal <= 0) {
      throw new Error('Invoice dengan nilai Rp0 tidak dapat dibuat. Isi harga minimal satu layanan atau barang terlebih dahulu.');
    }
    const status: SalesInvoice['status'] = payment >= invoiceTotal ? 'Lunas' : 'Belum Lunas';
    const customer = data.customers.find((c) => c.id === wo.customerRefId || c.name === wo.customerName);
    let invoiceNumber = generateDocumentNumber('invoice', wo.branchId);
    let invoiceId = Date.now().toString();

    if (!isDemoMode) {
      const result = await api.createInvoiceFromWorkOrder(woId, payment, paymentMethod, today, paymentDate, backdateReason, finalItems);
      if (!result.success || !result.data) {
        throw new Error(result.message || 'Gagal membuat faktur dari WO');
      }
      invoiceNumber = result.data.invoiceNumber;
      invoiceId = result.data.id;
    }

    const newInvoice: SalesInvoice = {
      id: invoiceId,
      invoiceNumber, date: today,
      customerRefId: customer?.id || wo.customerRefId,
      customerId: wo.customerId || wo.plateNumber.replace(/[^a-zA-Z0-9]/g, ''),
      customerName: wo.customerName,
      vehicleInfo: `${wo.vehicleInfo} ${wo.plateNumber}`,
      description: finalItems.map((s) => s.description || s.name).join(', '),
      total: invoiceTotal, payment, paymentMethod, paymentDate: payment > 0 ? (paymentDate || today) : undefined, backdateReason, status, age: 0,
      woId: wo.id, woNumber: wo.woNumber, items: finalItems,
      branchId: wo.branchId,
    };

    if (!isDemoMode) {
      await refreshData();
      return newInvoice;
    }

    await addInvoice(newInvoice);
    await updateWorkOrder(woId, {
      ...wo, status: 'Invoiced', invoiceId: newInvoice.id, invoiceNumber,
    });
    return newInvoice;
  };

  // ===== ITEMS =====
  const addItem = async (item: Item) => {
    await executeCRUD(() => api.create('items', item), () => setData(prev => ({ ...prev, items: [...prev.items, item] })));
  };
  const updateItem = async (id: string, item: Item) => {
    await executeCRUD(() => api.update('items', id, item), () => setData(prev => ({ ...prev, items: prev.items.map(x => x.id === id ? item : x) })));
  };
  const deleteItem = async (id: string) => {
    await executeCRUD(() => api.remove('items', id), () => setData(prev => ({ ...prev, items: prev.items.filter(x => x.id !== id) })));
  };

  // ===== ITEM CATEGORIES =====
  const addItemCategory = async (c: ItemCategory) => {
    await executeCRUD(() => api.create('item-categories', c), () => setData(prev => ({ ...prev, itemCategories: [...prev.itemCategories, c] })));
  };
  const updateItemCategory = async (id: string, c: ItemCategory) => {
    await executeCRUD(() => api.update('item-categories', id, c), () => setData(prev => ({ ...prev, itemCategories: prev.itemCategories.map(x => x.id === id ? c : x) })));
  };
  const deleteItemCategory = async (id: string) => {
    await executeCRUD(() => api.remove('item-categories', id), () => setData(prev => ({ ...prev, itemCategories: prev.itemCategories.filter(x => x.id !== id) })));
  };

  // ===== BRANCHES =====
  const addBranch = async (b: Branch) => {
    await executeCRUD(() => api.create('branches', b), () => setData(prev => ({ ...prev, branches: [...prev.branches, b] })));
  };
  const updateBranch = async (id: string, b: Branch) => {
    await executeCRUD(() => api.update('branches', id, b), () => setData(prev => ({ ...prev, branches: prev.branches.map(x => x.id === id ? b : x) })));
  };
  const deleteBranch = async (id: string) => {
    await executeCRUD(() => api.remove('branches', id), () => setData(prev => ({ ...prev, branches: prev.branches.filter(x => x.id !== id) })));
  };

  // ===== ROLES =====
  const addRole = async (r: Role) => {
    await executeCRUD(() => api.create('roles', r), () => setData(prev => ({ ...prev, roles: [...prev.roles, r] })));
  };
  const updateRole = async (id: string, r: Role) => {
    await executeCRUD(() => api.update('roles', id, r), () => setData(prev => ({ ...prev, roles: prev.roles.map(x => x.id === id ? r : x) })));
  };
  const deleteRole = async (id: string) => {
    await executeCRUD(() => api.remove('roles', id), () => setData(prev => ({ ...prev, roles: prev.roles.filter(x => x.id !== id) })));
  };

  // ===== USERS =====
  const addUser = async (u: User) => {
    await executeCRUD(() => api.create('users', u), () => setData(prev => ({ ...prev, users: [...prev.users, u] })));
  };
  const updateUser = async (id: string, u: User) => {
    const existing = data.users.find(x => x.id === id);
    if (existing?.isProtected && (!u.isActive || u.roleId !== existing.roleId)) {
      throw new Error('Akun Owner tidak dapat dinonaktifkan atau diganti rolenya');
    }
    await executeCRUD(() => api.update('users', id, u), () => setData(prev => ({ ...prev, users: prev.users.map(x => x.id === id ? u : x) })));
  };
  const deleteUser = async (id: string) => {
    if (data.users.find(x => x.id === id)?.isProtected) {
      throw new Error('Akun Owner tidak dapat dihapus');
    }
    await executeCRUD(() => api.remove('users', id), () => setData(prev => ({ ...prev, users: prev.users.filter(x => x.id !== id) })));
  };

  // ===== SUPPLIERS =====
  const generateSupplierCode = () => {
    const maxNum = data.suppliers.reduce((max, s) => {
      const match = s.code?.match(/SUP-(\d+)/);
      const num = match ? parseInt(match[1]) : 0;
      return num > max ? num : max;
    }, 0);
    return `SUP-${String(maxNum + 1).padStart(3, '0')}`;
  };
  const addSupplier = async (s: Supplier): Promise<Supplier> => {
    await executeCRUD(() => api.create('suppliers', s), () => setData(prev => ({ ...prev, suppliers: [...prev.suppliers, s] })));
    return s;
  };
  const updateSupplier = async (id: string, s: Supplier) => {
    await executeCRUD(() => api.update('suppliers', id, s), () => setData(prev => ({ ...prev, suppliers: prev.suppliers.map(x => x.id === id ? s : x) })));
  };
  const deleteSupplier = async (id: string) => {
    await executeCRUD(() => api.remove('suppliers', id), () => setData(prev => ({ ...prev, suppliers: prev.suppliers.filter(x => x.id !== id) })));
  };

  // ===== GOODS RECEIPTS =====
  const generateReceiptNumber = (branchId: string) => {
    const prefixes: Record<string, string> = { 'BR-001': 'GR-P', 'BR-002': 'GR-C', 'BR-003': 'GR-M' };
    const prefix = prefixes[branchId] || 'GR';
    const year = new Date().getFullYear();
    const branchReceipts = data.goodsReceipts.filter((r) => r.branchId === branchId);
    return `${prefix}-${year}-${String(branchReceipts.length + 1).padStart(4, '0')}`;
  };

  const addGoodsReceipt = async (receipt: GoodsReceipt): Promise<GoodsReceipt> => {
    await executeCRUD(
      () => api.create('goods-receipts', receipt),
      () => setData(prev => ({ ...prev, goodsReceipts: [...prev.goodsReceipts, receipt] }))
    );
    return receipt;
  };
  const updateGoodsReceipt = async (id: string, receipt: GoodsReceipt) => {
    await executeCRUD(
      () => api.update('goods-receipts', id, receipt),
      () => setData(prev => ({ ...prev, goodsReceipts: prev.goodsReceipts.map(x => x.id === id ? receipt : x) }))
    );
  };
  const deleteGoodsReceipt = async (id: string) => {
    await executeCRUD(
      () => api.remove('goods-receipts', id),
      () => setData(prev => ({ ...prev, goodsReceipts: prev.goodsReceipts.filter(x => x.id !== id) }))
    );
  };
  const receiveGoods = async (receiptId: string) => {
    const receipt = data.goodsReceipts.find((r) => r.id === receiptId);
    if (!receipt) return;
    const updated = { ...receipt, status: 'Diterima' as const, receivedBy: currentUser?.name || 'System' };
    await updateGoodsReceipt(receiptId, updated);
  };

  // ===== PURCHASE INVOICES =====
  const generatePurchaseInvoiceNumber = (branchId: string) => {
    const prefixes: Record<string, string> = { 'BR-001': 'PI-P', 'BR-002': 'PI-C', 'BR-003': 'PI-M' };
    const prefix = prefixes[branchId] || 'PI';
    const year = new Date().getFullYear();
    const branchInvoices = data.purchaseInvoices.filter((p) => p.branchId === branchId);
    return `${prefix}-${year}-${String(branchInvoices.length + 1).padStart(4, '0')}`;
  };

  const addPurchaseInvoice = async (inv: PurchaseInvoice): Promise<PurchaseInvoice> => {
    await executeCRUD(
      () => api.create('purchase-invoices', inv),
      () => setData(prev => ({ ...prev, purchaseInvoices: [...prev.purchaseInvoices, inv] }))
    );
    return inv;
  };
  const updatePurchaseInvoice = async (id: string, inv: PurchaseInvoice) => {
    await executeCRUD(
      () => api.update('purchase-invoices', id, inv),
      () => setData(prev => ({ ...prev, purchaseInvoices: prev.purchaseInvoices.map(x => x.id === id ? inv : x) }))
    );
  };
  const deletePurchaseInvoice = async (id: string) => {
    await executeCRUD(
      () => api.remove('purchase-invoices', id),
      () => setData(prev => ({ ...prev, purchaseInvoices: prev.purchaseInvoices.filter(x => x.id !== id) }))
    );
  };
  const addPurchasePayment = async (invoiceId: string, payment: PurchasePayment) => {
    await executeCRUD(
      () => api.addPurchasePayment(invoiceId, payment),
      () => setData(prev => ({
        ...prev,
        purchaseInvoices: prev.purchaseInvoices.map(inv => {
          if (inv.id !== invoiceId) return inv;
          const newPayments = [...inv.payments, payment];
          const paid = newPayments.reduce((s, p) => s + p.amount, 0);
          const status: PurchaseInvoice['status'] = paid >= inv.total ? 'Lunas' : (paid > 0 ? 'Sebagian' : 'Belum Lunas');
          return { ...inv, payments: newPayments, paidAmount: paid, status };
        })
      }))
    );
  };
  const deletePurchasePayment = async (invoiceId: string, paymentId: string) => {
    await executeCRUD(
      () => api.deletePurchasePayment(invoiceId, paymentId),
      () => setData(prev => ({
        ...prev,
        purchaseInvoices: prev.purchaseInvoices.map(inv => {
          if (inv.id !== invoiceId) return inv;
          const payments = inv.payments.filter(payment => payment.id !== paymentId);
          const paidAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);
          const status: PurchaseInvoice['status'] = paidAmount <= 0 ? 'Belum Lunas' : (paidAmount >= inv.total ? 'Lunas' : 'Sebagian');
          return { ...inv, payments, paidAmount, status };
        }),
      }))
    );
  };

  return (
    <AppContext.Provider
      value={{
        data, currentUser, currentBranchId, setCurrentBranchId, resolveBranchId,
        login, logout, hasPermission, isLoading, isDemoMode, refreshData,
        updateSettings, generateDocumentNumber,
        addVehicle, updateVehicle, deleteVehicle,
        addCustomer, updateCustomer, deleteCustomer, generateCustomerCode,
        addInvoice, updateInvoice, deleteInvoice,
        addWorkOrder, updateWorkOrder, deleteWorkOrder, continueWorkOrder,
        findActiveWoByPlate, changeWorkOrderStatus,
        createInvoiceFromWO,
        addItem, updateItem, deleteItem,
        addItemCategory, updateItemCategory, deleteItemCategory,
        addBranch, updateBranch, deleteBranch,
        addRole, updateRole, deleteRole,
        addUser, updateUser, deleteUser,
        addSupplier, updateSupplier, deleteSupplier, generateSupplierCode,
        addGoodsReceipt, updateGoodsReceipt, deleteGoodsReceipt,
        generateReceiptNumber, receiveGoods,
        addPurchaseInvoice, updatePurchaseInvoice, deletePurchaseInvoice,
        generatePurchaseInvoiceNumber, addPurchasePayment, deletePurchasePayment,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
}
