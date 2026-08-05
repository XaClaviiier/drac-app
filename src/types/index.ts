export interface Vehicle {
  id: string;
  plateNumber: string;
  brand: string;
  model: string;
  year: number;
  color: string;
  /** Relasi internal ke customers.id */
  customerRefId?: string;
  customerName: string;
  /** Kode pelanggan untuk tampilan, misalnya PLG-001 */
  customerId: string;
  phone: string;
  address: string;
  registrationDate: string;
  notes: string;
  branchId: string;
  /** Cabang tempat kendaraan pertama kali diinput */
  firstSeenBranchId?: string;
}

export interface Customer {
  id: string;
  customerCode: string;
  name: string;
  phone: string;
  address: string;
  email: string;
  createdAt: string;
  branchId: string;
  /** Cabang tempat pelanggan pertama kali diinput (tidak berubah meski data dilihat di cabang lain) */
  firstSeenBranchId?: string;
}

export interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  customerRefId?: string;
  customerId: string;
  customerName: string;
  vehicleInfo: string;
  description: string;
  total: number;
  payment: number;
  paymentMethod?: 'Tunai' | 'QRIS/Transfer';
  paymentDate?: string;
  backdateReason?: string;
  status: 'Lunas' | 'Belum Lunas';
  age: number;
  woId?: string;
  woNumber?: string;
  items?: WorkOrderService[];
  branchId: string;
}

export type WOStatus = 'Pengecekan' | 'Pending' | 'Proses' | 'Selesai' | 'Invoiced' | 'Closed';

export interface WOStatusLog {
  from: WOStatus;
  to: WOStatus;
  at: string;              // ISO datetime
  byUserId: string;
  byUserName: string;
  reason?: string;         // wajib untuk Closed atau perubahan mundur
}

export interface WorkOrder {
  id: string;
  woNumber: string;
  date: string;
  backdateReason?: string;
  customerRefId?: string;
  customerId: string;
  customerName: string;
  vehicleRefId?: string;
  plateNumber: string;
  vehicleInfo: string;
  description?: string;       // keluhan pelanggan
  findings?: string;          // hasil pemeriksaan teknisi
  diagnosisTemperature?: number;
  diagnosisLp?: number;
  diagnosisHp?: number;
  finalTemperature?: number;
  finalLp?: number;
  finalHp?: number;
  services: WorkOrderService[];
  total: number;
  estimateTotal?: number;     // estimasi saat pengecekan (dikunci saat masuk Proses)
  approvedAt?: string;        // tanggal pelanggan menyetujui estimasi
  pendingAt?: string;
  pendingUntil?: string;
  pendingReason?: string;
  status: WOStatus;
  statusLog?: WOStatusLog[];  // jejak audit perubahan status
  cancelReason?: string;      // alasan penutupan bila status Closed
  notes: string;
  invoiceId?: string;
  invoiceNumber?: string;
  branchId: string;
  createdBy?: string;
  createdByName?: string;
  // Lintas cabang: WO ini lanjutan dari WO lain
  continuedFromWoId?: string;
  continuedFromWoNumber?: string;
  continuedFromBranchName?: string;
  // Lintas cabang: WO ini sudah dilanjutkan di WO lain
  continuedToWoId?: string;
  continuedToWoNumber?: string;
  continuedToBranchName?: string;
}

export interface WorkOrderService {
  id: string;
  itemId?: string;
  code?: string;
  name: string;
  description: string;
  price: number;
  qty: number;
}

export type ItemType = 'Persediaan' | 'Jasa' | 'Non Persediaan' | 'Group';

export interface GroupMember {
  itemId: string;
  itemCode: string;
  itemName: string;
  itemType: ItemType;
  qty: number;
  unitPrice: number;
}

export interface ItemCategory {
  id: string;
  code: string;
  name: string;
  type: ItemType | 'Semua';
  description: string;
  isActive: boolean;
}

export interface Item {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  categoryName: string;
  type: ItemType;
  brand: string;
  unit: string;
  stock: number;
  sellableStock: number;
  purchasePrice: number;
  sellingPrice: number;
  isActive: boolean;
  isQuickService: boolean;
  description: string;
  receiptDescription?: string;
  barcode?: string;
  groupMembers?: GroupMember[];
  branchId: string;
  branchStocks?: Record<string, { stock: number; sellableStock: number }>;
}

export interface Branch {
  id: string;
  code: string;
  name: string;
  address: string;
  phone: string;
  isActive: boolean;
}

export interface CompanyProfile {
  name: string;
  legalName: string;
  phone: string;
  email: string;
  taxNumber: string;
  address: string;
  timezone: string;
  invoiceFooter: string;
}

export interface DocumentNumberSettings {
  workOrderPrefix: string;
  invoicePrefix: string;
  sequenceDigits: number;
  resetPeriod: 'daily';
}

export interface SecuritySettings {
  sessionHours: number;
  maxLoginAttempts: number;
  auditLogEnabled: boolean;
  requireBackdateReason?: boolean;
}

export interface AISettings {
  provider: 'groq';
  model: string;
  allowCustomerData: boolean;
  allowInventoryData: boolean;
  allowFinancialData: boolean;
  allowCreateWorkOrder: boolean;
}

export interface AppSettings {
  company: CompanyProfile;
  branchDocumentCodes: Record<string, string>;
  documents: DocumentNumberSettings;
  security: SecuritySettings;
  ai: AISettings;
  pendingReasonTemplates?: Array<{ id: string; label: string; isActive: boolean }>;
}

export type Permission =
  | 'dashboard:view'
  | 'ai:view'
  | 'invoice:view' | 'invoice:create' | 'invoice:edit' | 'invoice:delete'
  | 'invoice:backdate'
  | 'wo:view' | 'wo:create' | 'wo:edit' | 'wo:delete' | 'wo:backdate'
  | 'payment:backdate'
  | 'customer:view' | 'customer:create' | 'customer:edit' | 'customer:delete'
  | 'vehicle:view' | 'vehicle:create' | 'vehicle:edit' | 'vehicle:delete'
  | 'item:view' | 'item:create' | 'item:edit' | 'item:delete'
  | 'user:view' | 'user:create' | 'user:edit' | 'user:delete'
  | 'role:view' | 'role:create' | 'role:edit' | 'role:delete'
  | 'branch:view' | 'branch:create' | 'branch:edit' | 'branch:delete'
  | 'supplier:view' | 'supplier:create' | 'supplier:edit' | 'supplier:delete'
  | 'receipt:view' | 'receipt:create' | 'receipt:edit' | 'receipt:delete'
  | 'purchase:view' | 'purchase:create' | 'purchase:edit' | 'purchase:delete' | 'purchase:pay'
  | 'settings:view' | 'settings:edit'
  | 'report:view'
  | 'all_branches';

export interface Role {
  id: string;
  code: string;
  name: string;
  permissions: Permission[];
  description: string;
  isActive: boolean;
}

export interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  apiToken?: string;
  sessionExpiresAt?: string;
  idleTimeoutMinutes?: number;
  password: string;
  roleId: string;
  roleName: string;
  branchId: string;
  branchName: string;
  branchIds?: string[];
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
  isOwner?: boolean;
  isProtected?: boolean;
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  branchId: string;
  branchName: string;
  isDefault: boolean;
  isSellable: boolean;
  isActive: boolean;
}

export interface WarehouseStock {
  warehouseId: string;
  itemId: string;
  quantity: number;
  reservedQuantity: number;
}

export interface StockMovement {
  id: string;
  itemId: string;
  itemName: string;
  sourceWarehouseId?: string;
  sourceName?: string;
  destinationWarehouseId?: string;
  destinationName?: string;
  quantity: number;
  movementType: string;
  notes: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  isActive: boolean;
  createdAt: string;
}

export interface GoodsReceiptItem {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  qty: number;
  unit: string;
  qtyInvoiced: number; // sudah difakturkan berapa
}

export interface GoodsReceipt {
  id: string;
  receiptNumber: string;
  date: string;
  supplierId: string;
  supplierName: string;
  doNumber: string; // No. Surat Jalan / Delivery Order
  items: GoodsReceiptItem[];
  status: 'Draft' | 'Diterima' | 'Difakturkan' | 'Sebagian' | 'Batal';
  notes: string;
  branchId: string;
  receivedBy?: string;
  createdAt: string;
}

export interface PurchaseInvoiceItem {
  id: string;
  receiptId: string;
  receiptNumber: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  qty: number;
  unit: string;
  unitPrice: number;
  discount: number;
  subtotal: number;
}

export interface PurchasePayment {
  id: string;
  paymentNumber: string;
  date: string;
  amount: number;
  paymentMethod: 'Kas' | 'Transfer Bank' | 'Cek' | 'Lainnya';
  bankAccount?: string;
  notes?: string;
}

export interface PurchaseInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  supplierId: string;
  supplierName: string;
  supplierInvoiceNumber: string;
  receiptIds: string[];
  items: PurchaseInvoiceItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payments: PurchasePayment[];
  paidAmount: number;
  status: 'Belum Lunas' | 'Sebagian' | 'Lunas' | 'Batal';
  notes: string;
  branchId: string;
  createdAt: string;
}

export interface AppData {
  vehicles: Vehicle[];
  customers: Customer[];
  invoices: SalesInvoice[];
  workOrders: WorkOrder[];
  itemCategories: ItemCategory[];
  items: Item[];
  branches: Branch[];
  roles: Role[];
  users: User[];
  suppliers: Supplier[];
  goodsReceipts: GoodsReceipt[];
  purchaseInvoices: PurchaseInvoice[];
  warehouses: Warehouse[];
  warehouseStocks: WarehouseStock[];
  stockMovements: StockMovement[];
  settings: AppSettings;
}
