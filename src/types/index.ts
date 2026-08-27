export interface Vehicle {
  id: string;
  plateNumber: string;
  brand: string;
  vehicleBrandId?: string;
  vehicleBrandName?: string;
  model: string;
  brandId?: string;
  modelId?: string;
  generationId?: string;
  generationName?: string;
  engineCc?: number | null;
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
  /** Waktu sebenarnya data dimasukkan ke server (berbeda dari tanggal registrasi mundur). */
  createdAt?: string;
  updatedAt?: string;
  notes: string;
  branchId: string;
  /** Cabang tempat kendaraan pertama kali diinput */
  firstSeenBranchId?: string;
}

export interface Customer {
  id: string;
  customerCode: string;
  name: string;
  companyName?: string;
  phone: string;
  address: string;
  email: string;
  createdAt: string;
  branchId: string;
  /** Cabang tempat pelanggan pertama kali diinput (tidak berubah meski data dilihat di cabang lain) */
  firstSeenBranchId?: string;
  accountType?: 'Pribadi' | 'Perusahaan';
  primaryContactId?: string;
  billingContactId?: string;
}

export type CustomerPersonRole = 'Owner' | 'PIC' | 'Supir' | 'Keuangan' | 'Pengelola Kendaraan';
export interface CustomerPerson {
  id: string;
  customerId: string;
  name: string;
  phone: string;
  email: string;
  relationshipLabel: string;
  roles: CustomerPersonRole[];
  vehicleAssignments: Array<{ vehicleId: string; role: 'Owner' | 'Supir'; isPrimary?: boolean }>;
  isPrimaryPic: boolean;
  isBillingContact: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  /** Nomor pada nota fisik asli. Opsional, tetapi unik jika diisi. */
  manualReceiptNumber?: string;
  date: string;
  customerRefId?: string;
  customerId: string;
  customerName: string;
  vehicleInfo: string;
  driverContactId?: string;
  driverName?: string;
  driverPhone?: string;
  approvalContactId?: string;
  approvalContactName?: string;
  approvalContactPhone?: string;
  billingContactId?: string;
  billingContactName?: string;
  billingContactPhone?: string;
  description: string;
  total: number;
  payment: number;
  paymentMethod?: 'Tunai' | 'Transfer' | 'Campuran';
  paymentDate?: string;
  backdateReason?: string;
  status: 'Lunas' | 'Belum Lunas';
  age: number;
  woId?: string;
  woNumber?: string;
  items?: WorkOrderService[];
  branchId: string;
  createdAt?: string;
  updatedAt?: string;
}

export type WOStatus = 'Register' | 'Proses' | 'Selesai' | 'Closed';
export type LegacyWOStatus = 'Pengecekan' | 'Pending' | 'Dibayar' | 'Invoiced' | 'Batal';
export type WorkOrderTimelineStage = 'diagnosis' | 'approval' | 'parts' | 'working';

export interface WOStatusLog {
  from: WOStatus | LegacyWOStatus;
  to: WOStatus | LegacyWOStatus;
  at: string;              // ISO datetime
  byUserId: string;
  byUserName: string;
  reason?: string;         // wajib untuk Closed atau perubahan mundur
}

export interface WorkOrder {
  id: string;
  woNumber: string;
  date: string;
  /** Waktu transaksi operasional yang dipilih pada form (HH:mm). */
  transactionTime?: string;
  /** Waktu sebenarnya WO dibuat di server. */
  createdAt?: string;
  updatedAt?: string;
  backdateReason?: string;
  customerRefId?: string;
  customerId: string;
  customerName: string;
  vehicleRefId?: string;
  plateNumber: string;
  vehicleInfo: string;
  driverContactId?: string;
  driverName?: string;
  driverPhone?: string;
  approvalContactId?: string;
  approvalContactName?: string;
  approvalContactPhone?: string;
  billingContactId?: string;
  billingContactName?: string;
  billingContactPhone?: string;
  correctionReason?: string;
  description?: string;       // keluhan pelanggan
  complaintComment?: string;  // komentar/diagnosis atas keluhan pelanggan
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
  approvedServices?: WorkOrderService[]; // snapshot layanan/harga yang disetujui pelanggan
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
  technicianId?: string;
  technicianName?: string;
  assistantTechnicianIds?: string[];
  assistantTechnicianNames?: string[];
  // Lintas cabang: WO ini lanjutan dari WO lain
  continuedFromWoId?: string;
  continuedFromWoNumber?: string;
  continuedFromBranchName?: string;
  // Lintas cabang: WO ini sudah dilanjutkan di WO lain
  continuedToWoId?: string;
  continuedToWoNumber?: string;
  continuedToBranchName?: string;
  /** Audit saat WO ini dilanjutkan menjadi WO lain. */
  continuedAt?: string;
  continuedBy?: string;
  continuedByName?: string;
  continuedBranchId?: string;
}

export interface WorkOrderService {
  id: string;
  itemId?: string;
  warehouseId?: string;
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

export interface ItemVehicleCompatibility {
  brandId: string;
  brandName?: string;
  modelId?: string;
  modelName?: string;
  generationId?: string;
  generationName?: string;
  engineCc?: number | null;
  engineType?: 'Bensin' | 'Diesel' | 'Hybrid' | 'Listrik' | null;
}

export interface Item {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  categoryName: string;
  type: ItemType;
  brand: string;
  vehicleBrandId?: string;
  vehicleBrandName?: string;
  vehicleBrandIds?: string[];
  vehicleBrandNames?: string[];
  vehicleCompatibilities?: ItemVehicleCompatibility[];
  itemBrandId?: string;
  unit: string;
  stock: number;
  sellableStock: number;
  purchasePrice: number;
  sellingPrice: number;
  isActive: boolean;
  verificationStatus?: 'Pending' | 'Verified' | 'Merged';
  createdBy?: string;
  verifiedBy?: string;
  mergedIntoItemId?: string;
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
  reviewUrl?: string;
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
  lostSalesReasonTemplates?: Array<{ id: string; label: string; isActive: boolean; requiresNote?: boolean }>;
}

export type Permission =
  | 'dashboard:view'
  | 'ai:view'
  | 'invoice:view' | 'invoice:create' | 'invoice:edit' | 'invoice:delete'
  | 'invoice:backdate'
  | 'wo:view' | 'wo:create' | 'wo:edit' | 'wo:delete' | 'wo:backdate'
  | 'payment:view' | 'payment:create' | 'payment:edit' | 'payment:delete' | 'payment:backdate'
  | 'customer:view' | 'customer:create' | 'customer:edit' | 'customer:delete'
  | 'vehicle:view' | 'vehicle:create' | 'vehicle:edit' | 'vehicle:delete'
  | 'item:view' | 'item:create' | 'item:edit' | 'item:delete'
  | 'stock_opname:view' | 'stock_opname:create' | 'stock_opname:count' | 'stock_opname:post' | 'stock_opname:delete'
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
  /** Izin efektif dari server, termasuk baseline role kompatibilitas lama. */
  permissions?: Permission[];
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
  address?: string;
  branchId: string;
  branchName: string;
  isDefault: boolean;
  isSellable: boolean;
  isSystem?: boolean;
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
  movementSequence?: number;
  itemId: string;
  itemName: string;
  sourceWarehouseId?: string;
  sourceName?: string;
  destinationWarehouseId?: string;
  destinationName?: string;
  quantity: number;
  movementType: string;
  referenceType?: string;
  referenceId?: string;
  referenceNumber?: string;
  reversalOfId?: string;
  correctionGroupId?: string;
  unitCost?: number;
  notes: string;
  createdAt: string;
  occurredAt?: string;
  recordedAt?: string;
  incoming?: number;
  outgoing?: number;
  balance?: number;
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
  unitPrice?: number;
  discountPercent?: number;
  discountAmount?: number;
  subtotal?: number;
  technicianId?: string;
  technicianName?: string;
  lineNotes?: string;
  isDeferred?: boolean;
  deferReason?: string;
  deferUntil?: string;
}

export interface GoodsReceipt {
  id: string;
  receiptNumber: string;
  date: string;
  supplierId: string;
  supplierName: string;
  doNumber: string; // No. Surat Jalan / Delivery Order
  deliveryMethod?: string;
  deliveryOther?: string;
  shippingNotes?: string;
  sourceType?: 'Supplier' | 'Transfer Gudang';
  sourceWarehouseId?: string;
  sourceBranchId?: string;
  transferNumber?: string;
  items: GoodsReceiptItem[];
  status: 'Draft' | 'Diterima' | 'Difakturkan' | 'Sebagian' | 'Batal';
  notes: string;
  branchId: string;
  warehouseId: string;
  receivedBy?: string;
  receivedById?: string;
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
  customerPeople: CustomerPerson[];
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
