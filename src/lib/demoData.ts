// Demo data untuk preview UI tanpa backend
import type { AppData } from '../types';

const allPermissions: any[] = [
  'dashboard:view',
  'invoice:view', 'invoice:create', 'invoice:edit', 'invoice:delete',
  'wo:view', 'wo:create', 'wo:edit', 'wo:delete',
  'customer:view', 'customer:create', 'customer:edit', 'customer:delete',
  'vehicle:view', 'vehicle:create', 'vehicle:edit', 'vehicle:delete',
  'item:view', 'item:create', 'item:edit', 'item:delete',
  'user:view', 'user:create', 'user:edit', 'user:delete',
  'role:view', 'role:create', 'role:edit', 'role:delete',
  'branch:view', 'branch:create', 'branch:edit', 'branch:delete',
  'supplier:view', 'supplier:create', 'supplier:edit', 'supplier:delete',
  'receipt:view', 'receipt:create', 'receipt:edit', 'receipt:delete',
  'purchase:view', 'purchase:create', 'purchase:edit', 'purchase:delete', 'purchase:pay',
  'settings:view', 'settings:edit',
  'report:view',
  'all_branches',
];

export const demoData: AppData = {
  warehouses: [],
  warehouseStocks: [],
  stockMovements: [],
  settings: {
    company: {
      name: 'DOKTER AC MOBIL',
      legalName: '',
      phone: '',
      email: 'admin@dokterac.id',
      taxNumber: '',
      address: 'Makassar, Sulawesi Selatan',
      timezone: 'Asia/Makassar',
      invoiceFooter: 'Terima kasih telah mempercayakan kendaraan Anda kepada kami.',
    },
    branchDocumentCodes: { 'BR-001': 'D', 'BR-002': 'C', 'BR-003': 'M' },
    documents: { workOrderPrefix: 'WO-', invoicePrefix: 'INV-', sequenceDigits: 3, resetPeriod: 'daily' },
    security: { sessionHours: 8, maxLoginAttempts: 5, auditLogEnabled: true },
    ai: {
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      allowCustomerData: true,
      allowInventoryData: true,
      allowFinancialData: false,
      allowCreateWorkOrder: true,
    },
  },
  branches: [
    { id: 'BR-001', code: 'CBG-001', name: 'CABANG PERINTIS', address: 'Jl. Perintis Kemerdekaan No. 45, Makassar', phone: '0411-123456', isActive: true },
    { id: 'BR-002', code: 'CBG-002', name: 'CABANG CAKALANG', address: 'Jl. Cakalang No. 12, Makassar', phone: '0411-234567', isActive: true },
    { id: 'BR-003', code: 'CBG-003', name: 'CABANG MAMUJU', address: 'Jl. Karampuang No. 8, Mamuju', phone: '0426-345678', isActive: true },
  ],
  roles: [
    { id: '1', code: 'ADM', name: 'Administrator', permissions: allPermissions, description: 'Akses penuh', isActive: true },
    { id: '2', code: 'SPV', name: 'Supervisor', permissions: allPermissions.filter(p => !p.startsWith('user:') && !p.startsWith('role:') && !p.startsWith('branch:delete')), description: 'Kelola operasional', isActive: true },
    { id: '3', code: 'KSR', name: 'Kasir', permissions: ['dashboard:view','invoice:view','invoice:create','invoice:edit','wo:view','customer:view','customer:create','customer:edit','vehicle:view','vehicle:create','vehicle:edit','item:view','report:view'], description: 'Kasir', isActive: true },
    { id: '4', code: 'TKN', name: 'Teknisi', permissions: ['dashboard:view','wo:view','wo:create','wo:edit','customer:view','customer:create','vehicle:view','vehicle:create','item:view'], description: 'Teknisi', isActive: true },
  ],
  users: [
    { id: '1', username: 'admin', name: 'OWNER UTAMA', email: 'admin@dokterac.id', password: 'admin123', roleId: '1', roleName: 'Owner', branchId: 'BR-001', branchName: 'CABANG PERINTIS', isActive: true, createdAt: '2026-01-01', isOwner: true, isProtected: true },
    { id: '2', username: 'kasir1', name: 'SITI KASIR', email: 'kasir1@dokterac.id', password: 'kasir123', roleId: '3', roleName: 'Kasir', branchId: 'BR-001', branchName: 'CABANG PERINTIS', isActive: true, createdAt: '2026-01-15' },
    { id: '3', username: 'teknisi1', name: 'BUDI TEKNISI', email: 'teknisi1@dokterac.id', password: 'teknisi123', roleId: '4', roleName: 'Teknisi', branchId: 'BR-001', branchName: 'CABANG PERINTIS', isActive: true, createdAt: '2026-02-01' },
    { id: '4', username: 'spv1', name: 'AGUS SUPERVISOR', email: 'spv1@dokterac.id', password: 'spv123', roleId: '2', roleName: 'Supervisor', branchId: 'BR-002', branchName: 'CABANG CAKALANG', isActive: true, createdAt: '2026-01-10' },
  ],
  customers: [
    { id: '1', customerCode: 'PLG-001', name: 'AHMAD', phone: '085179958522', address: 'Jl. Sudirman No. 10', email: 'ahmad@email.com', createdAt: '2026-01-15', branchId: 'BR-001' },
    { id: '2', customerCode: 'PLG-002', name: 'TATO', phone: '081234567890', address: 'Jl. Gatot Subroto No. 25', email: 'tato@email.com', createdAt: '2026-02-10', branchId: 'BR-001' },
    { id: '3', customerCode: 'PLG-003', name: 'DIKI', phone: '082134567891', address: 'Jl. Ahmad Yani No. 15', email: 'diki@email.com', createdAt: '2026-03-05', branchId: 'BR-001' },
    { id: '4', customerCode: 'PLG-004', name: 'INTAN', phone: '083134567892', address: 'Jl. Diponegoro No. 8', email: 'intan@email.com', createdAt: '2026-03-20', branchId: 'BR-002' },
    { id: '5', customerCode: 'PLG-005', name: 'HERMAN', phone: '086134567895', address: 'Jl. Veteran No. 18', email: 'herman@email.com', createdAt: '2026-05-01', branchId: 'BR-003' },
  ],
  vehicles: [
    { id: '1', plateNumber: 'DD1486QZ', brand: 'Suzuki', model: 'APV', year: 2018, color: 'Putih', customerName: 'AHMAD', customerId: 'PLG-001', phone: '085179958522', address: 'Jl. Sudirman No. 10', registrationDate: '2026-06-20', notes: 'AC bocor', branchId: 'BR-001' },
    { id: '2', plateNumber: 'DD1502AZ', brand: 'Toyota', model: 'Avanza', year: 2019, color: 'Hitam', customerName: 'DIKI', customerId: 'PLG-003', phone: '082134567891', address: 'Jl. Ahmad Yani No. 15', registrationDate: '2026-06-25', notes: 'Isi freon', branchId: 'BR-001' },
    { id: '3', plateNumber: 'DD1915KB', brand: 'Toyota', model: 'Avanza', year: 2021, color: 'Merah', customerName: 'INTAN', customerId: 'PLG-004', phone: '083134567892', address: 'Jl. Diponegoro No. 8', registrationDate: '2026-06-26', notes: 'Kompresor', branchId: 'BR-002' },
  ],
  suppliers: [
    { id: '1', code: 'SUP-001', name: 'PT WURTH INDONESIA', contactPerson: 'Pak Andi', phone: '021-5551111', email: 'sales@wurth.id', address: 'Jakarta', isActive: true, createdAt: '2026-01-05' },
    { id: '2', code: 'SUP-002', name: 'TOKO DENSO MAKASSAR', contactPerson: 'Pak Hendra', phone: '0411-444333', email: 'denso@gmail.com', address: 'Makassar', isActive: true, createdAt: '2026-02-01' },
  ],
  itemCategories: [
    { id: '1', code: 'KAT-001', name: 'Sparepart AC', type: 'Persediaan', description: 'Komponen AC', isActive: true },
    { id: '2', code: 'KAT-002', name: 'Chemical & Freon', type: 'Persediaan', description: 'Freon, cleaner', isActive: true },
    { id: '3', code: 'KAT-003', name: 'Jasa Service AC', type: 'Jasa', description: 'Jasa teknisi', isActive: true },
  ],
  items: [
    { id: '1', code: 'BF-1055', name: 'AC CLEANER WURTH', categoryId: '2', categoryName: 'Chemical & Freon', type: 'Persediaan', brand: 'Wurth', unit: 'CAN', stock: 8, sellableStock: 8, purchasePrice: 65000, sellingPrice: 95000, isActive: true, isQuickService: false, description: '', branchId: 'BR-001' },
    { id: '2', code: 'FR-R134A', name: 'FREON R134A', categoryId: '2', categoryName: 'Chemical & Freon', type: 'Persediaan', brand: 'Dupont', unit: 'PCS', stock: 18, sellableStock: 18, purchasePrice: 85000, sellingPrice: 150000, isActive: true, isQuickService: true, description: '', branchId: 'BR-001' },
    { id: '5', code: 'JSA-001', name: 'JASA SERVICE AC', categoryId: '3', categoryName: 'Jasa Service AC', type: 'Jasa', brand: '-', unit: 'JASA', stock: 0, sellableStock: 0, purchasePrice: 0, sellingPrice: 200000, isActive: true, isQuickService: true, description: '', branchId: 'BR-001' },
    { id: '6', code: 'JSA-002', name: 'FLUSHING AC', categoryId: '3', categoryName: 'Jasa Service AC', type: 'Jasa', brand: '-', unit: 'JASA', stock: 0, sellableStock: 0, purchasePrice: 0, sellingPrice: 500000, isActive: true, isQuickService: true, description: '', branchId: 'BR-001' },
    {
      id: '15', code: 'GRP-0001', name: 'PAKET SERVICE AC LENGKAP', categoryId: '3', categoryName: 'Jasa Service AC', type: 'Group', brand: '-', unit: 'PAKET', stock: 0, sellableStock: 0, purchasePrice: 0, sellingPrice: 1200000, isActive: true, isQuickService: true,
      description: 'Paket lengkap',
      groupMembers: [
        { itemId: '6', itemCode: 'JSA-002', itemName: 'FLUSHING AC', itemType: 'Jasa', qty: 1, unitPrice: 500000 },
        { itemId: '2', itemCode: 'FR-R134A', itemName: 'FREON R134A', itemType: 'Persediaan', qty: 2, unitPrice: 150000 },
        { itemId: '5', itemCode: 'JSA-001', itemName: 'JASA SERVICE AC', itemType: 'Jasa', qty: 1, unitPrice: 400000 },
      ],
      branchId: 'BR-001',
    },
  ],
  invoices: [
    { id: '1', invoiceNumber: 'D-1970', date: '2026-06-27', customerId: 'PLG-002', customerName: 'TATO', vehicleInfo: 'CRV / ABU DN1435BY', description: 'Service AC', total: 2050000, payment: 2050000, status: 'Lunas', age: 0, branchId: 'BR-001' },
    { id: '2', invoiceNumber: 'D-1969', date: '2026-06-27', customerId: 'PLG-003', customerName: 'DIKI', vehicleInfo: 'AVANZA / HITAM DD1502AZ', description: 'Isi freon', total: 900000, payment: 900000, status: 'Lunas', age: 0, branchId: 'BR-001' },
    { id: '9', invoiceNumber: 'D-1962', date: '2026-06-24', customerId: 'PLG-002', customerName: 'ENSEVAL', vehicleInfo: 'GRANDMAX', description: 'Service', total: 1800000, payment: 0, status: 'Belum Lunas', age: 4, branchId: 'BR-001' },
  ],
  workOrders: [
    {
      id: '1', woNumber: 'WO-P-2026-001', date: '2026-06-27', customerId: 'PLG-001', customerName: 'AHMAD',
      plateNumber: 'DD1486QZ', vehicleInfo: 'Suzuki APV 2018 - Putih',
      description: 'AC tidak dingin, keluar bau tidak sedap',
      findings: 'Evaporator kotor, freon berkurang. Perlu flushing & isi ulang.',
      services: [
        { id: '1', name: 'Flushing AC', description: '', price: 500000, qty: 1 },
        { id: '2', name: 'Isi Freon R134a', description: '', price: 400000, qty: 2 },
        { id: '3', name: 'Jasa Service', description: '', price: 250000, qty: 1 },
      ],
      total: 1550000, estimateTotal: 1550000, status: 'Selesai', notes: 'Sudah dikerjakan, siap difakturkan', branchId: 'BR-001',
    },
    {
      id: '2', woNumber: 'WO-C-2026-001', date: '2026-06-28', customerId: 'PLG-004', customerName: 'INTAN',
      plateNumber: 'DD1915KB', vehicleInfo: 'Toyota Avanza 2021 - Merah',
      description: 'AC bunyi berisik saat dinyalakan',
      findings: 'Bearing kompresor aus. Rekomendasi ganti kompresor.',
      services: [
        { id: '4', name: 'Ganti Kompresor AC', description: 'Estimasi', price: 1650000, qty: 1 },
        { id: '5', name: 'Isi Freon R134a', description: 'Estimasi', price: 150000, qty: 2 },
        { id: '6', name: 'Jasa Pemasangan', description: 'Estimasi', price: 400000, qty: 1 },
      ],
      total: 2350000, status: 'Pengecekan',
      notes: 'Pelanggan minta waktu untuk pertimbangkan. Follow up 3 hari lagi.',
      branchId: 'BR-002',
    },
  ],
  goodsReceipts: [
    {
      id: '1', receiptNumber: 'GR-P-2026-0001', date: '2026-06-15',
      supplierId: '1', supplierName: 'PT WURTH INDONESIA', doNumber: 'DO-W/2026/0145',
      items: [{ id: '1', itemId: '1', itemCode: 'BF-1055', itemName: 'AC CLEANER WURTH', qty: 10, unit: 'CAN', qtyInvoiced: 0 }],
      status: 'Diterima', notes: '', branchId: 'BR-001', receivedBy: 'ADMIN UTAMA', createdAt: '2026-06-15',
    },
  ],
  purchaseInvoices: [],
};
