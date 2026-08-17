import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Edit, Trash2, Wrench, X, Save, FileText, CheckCircle2, Receipt, User, Car, ArrowLeftRight, Building2, CalendarClock, Star, ListPlus, CalendarDays, Eye, Copy, MessageCircle, RefreshCw, Settings2, Lightbulb, Clock3, GitBranch, AlertTriangle, Undo2, LockKeyhole, Download, Printer, Filter } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Customer, LegacyWOStatus, Vehicle, WorkOrder, WorkOrderService, WOStatus } from '../types';
import CustomerPicker from '../components/CustomerPicker';
import VehiclePicker from '../components/VehiclePicker';
import { localDateKey } from '../lib/date';
import { api } from '../lib/apiClient';
import ItemSearchOption from '../components/ItemSearchOption';
import { childTabClass, ui } from '../components/ui/interfaceStandards';

// Layanan yang sering digunakan akan diambil otomatis dari Master Barang & Jasa (Type: Jasa / Group)

const DEFAULT_COMPLAINT_TEMPLATES = [
  'AC tidak dingin',
  'Berisik',
  'Berbau',
  'Freon habis',
  'Pengecekan rutin',
  'Lainnya',
];

const COMPLAINT_TEMPLATE_KEY = 'dokterac_complaint_templates';
const COMPLAINT_TEMPLATE_VERSION_KEY = 'dokterac_complaint_templates_version';
const COMPLAINT_TEMPLATE_VERSION = '2';
const DEFAULT_LOST_SALES_REASONS = [
  { id: 'customer-cancel', label: 'Pelanggan membatalkan', isActive: true, requiresNote: false },
  { id: 'price-rejected', label: 'Harga tidak disetujui', isActive: true, requiresNote: false },
  { id: 'customer-delay', label: 'Pelanggan menunda', isActive: true, requiresNote: false },
  { id: 'parts-unavailable', label: 'Suku cadang tidak tersedia', isActive: true, requiresNote: false },
  { id: 'other-workshop', label: 'Kendaraan dibawa ke bengkel lain', isActive: true, requiresNote: false },
  { id: 'unreachable', label: 'Tidak dapat dihubungi', isActive: true, requiresNote: false },
  { id: 'other', label: 'Lainnya', isActive: true, requiresNote: true },
];
const DEFAULT_PENDING_REASONS = [
  { id: 'think', label: 'Pikir-pikir', isActive: true },
  { id: 'fund', label: 'Menyiapkan dana', isActive: true },
  { id: 'schedule', label: 'Menunggu jadwal', isActive: true },
  { id: 'other', label: 'Lainnya', isActive: true },
];
const COMPLETION_NOTE_TEMPLATES = [
  'Pekerjaan selesai, AC kembali dingin dan berfungsi normal.',
  'Pekerjaan selesai dan sudah diuji bersama pelanggan.',
  'Pekerjaan selesai, pelanggan menyetujui hasil pengerjaan.',
];
const formatPaymentInput = (value: number) => value ? value.toLocaleString('id-ID') : '';
const parsePaymentInput = (value: string) => Number(value.replace(/\D/g, '')) || 0;
const localTimeKey = (date = new Date()) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
const formatAuditTime = (value?: string) => {
  if (!value) return '-';
  const parsed = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
};
const formatBusinessDate = (value?: string) => {
  if (!value) return '-';
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(parsed);
};
const formatPlateNumber = (value?: string) => {
  const normalized = String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!normalized) return '-';
  const match = normalized.match(/^([A-Z]{1,2})(\d{1,4})([A-Z]{0,3})$/);
  if (!match) return String(value || '').trim().toUpperCase();
  return [match[1], match[2], match[3]].filter(Boolean).join(' ');
};

type WorkOrderColumnKey = 'number' | 'customer' | 'vehicle' | 'services' | 'total' | 'status' | 'createdBy' | 'actions';
const WORK_ORDER_COLUMNS: Array<{ key: WorkOrderColumnKey; label: string; locked?: boolean }> = [
  { key: 'number', label: 'No. WO / Tanggal', locked: true },
  { key: 'customer', label: 'Pelanggan' },
  { key: 'vehicle', label: 'Kendaraan' },
  { key: 'services', label: 'Layanan' },
  { key: 'total', label: 'Total' },
  { key: 'status', label: 'Status' },
  { key: 'createdBy', label: 'Dibuat Oleh' },
  { key: 'actions', label: 'Aksi', locked: true },
];
const DEFAULT_WORK_ORDER_COLUMNS = WORK_ORDER_COLUMNS.map(column => column.key);
type WorkOrderPeriod = 'all' | 'today' | '7days' | 'thisMonth' | 'lastMonth' | 'custom';
type WorkOrderFinancialTimeline = {
  woId: string;
  invoice: null | { id: string; invoiceNumber: string; date: string; total: number; payment: number; status: string; createdAt?: string; updatedAt?: string };
  payments: Array<{ id: string; paymentNumber: string; date: string; amount: number; paymentMethod: string; accountName?: string; createdByName?: string; createdAt?: string }>;
  paymentAudits: Array<{ id: string; paymentNumber: string; action: string; reason?: string; amount: number; paymentMethod?: string; accountName?: string; userName?: string; createdAt?: string }>;
  canViewPayments: boolean;
};
const EMPTY_FINANCIAL_TIMELINE: WorkOrderFinancialTimeline = { woId: '', invoice: null, payments: [], paymentAudits: [], canViewPayments: false };

export default function WorkOrders() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    data,
    addWorkOrder, updateWorkOrder, deleteWorkOrder,
    continueWorkOrder, findActiveWoByPlate, changeWorkOrderStatus,
    createInvoiceFromWO, addItem,
    currentUser, currentBranchId, resolveBranchId, hasPermission, generateDocumentNumber, updateSettings, refreshData, isLoading,
  } = useApp();
  const [showModal, setShowModal] = useState(false);
  const defaultNewTabOpenedRef = useRef(false);
  const [diagnosisMode, setDiagnosisMode] = useState(false);
  const [serviceEditMode, setServiceEditMode] = useState(false);
  const diagnosisSubmitAction = useRef<'save' | 'process' | 'invoice' | 'lost'>('save');
  const lostSalesReason = useRef('');
  const [continueWO, setContinueWO] = useState<WorkOrder | null>(null);
  const [editingWO, setEditingWO] = useState<WorkOrder | null>(null);
  const [isAutoRegisteredDraft, setIsAutoRegisteredDraft] = useState(false);
  const [isAutoRegistering, setIsAutoRegistering] = useState(false);
  const autoRegisteringRef = useRef(false);
  const [activeWoConflict, setActiveWoConflict] = useState<WorkOrder | null>(null);
  const [statusDialog, setStatusDialog] = useState<{ wo: WorkOrder; next: WorkOrder['status'] } | null>(null);
  const [completionWO, setCompletionWO] = useState<WorkOrder | null>(null);
  const [completionForm, setCompletionForm] = useState({ temperature: '', lp: '', hp: '', note: '' });
  const [completionError, setCompletionError] = useState('');
  const [isCompletingWO, setIsCompletingWO] = useState(false);
  const [statusReason, setStatusReason] = useState('');
  const [cancelStep, setCancelStep] = useState<1 | 2>(1);
  const [cancelReasonChoice, setCancelReasonChoice] = useState('');
  const [cancelReasonNotes, setCancelReasonNotes] = useState('');
  const [showPendingTemplateEditor, setShowPendingTemplateEditor] = useState(false);
  const [pendingTemplateDraft, setPendingTemplateDraft] = useState(
    data.settings.pendingReasonTemplates || DEFAULT_PENDING_REASONS
  );
  const [newPendingTemplate, setNewPendingTemplate] = useState('');
  const [savingPendingTemplates, setSavingPendingTemplates] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [periodFilter, setPeriodFilter] = useState<WorkOrderPeriod>('all');
  // State lama dipertahankan sementara agar tampilan mobile lama tetap kompatibel.
  const [todayOnly, setTodayOnly] = useState(false);
  const [activeBranchOnly, setActiveBranchOnly] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<WorkOrderColumnKey[]>(DEFAULT_WORK_ORDER_COLUMNS);
  const [invoiceWO, setInvoiceWO] = useState<WorkOrder | null>(null);
  const [invoiceCashPayment, setInvoiceCashPayment] = useState(0);
  const [invoiceTransferPayment, setInvoiceTransferPayment] = useState(0);
  const invoicePayment = invoiceCashPayment + invoiceTransferPayment;
  const [invoiceDate, setInvoiceDate] = useState(localDateKey());
  const [invoicePaymentDate, setInvoicePaymentDate] = useState(localDateKey());
  const [invoiceDateUnlocked, setInvoiceDateUnlocked] = useState(false);
  const [invoicePaymentDateUnlocked, setInvoicePaymentDateUnlocked] = useState(false);
  const [invoiceBackdateReason, setInvoiceBackdateReason] = useState('');
  const [woDateUnlocked, setWoDateUnlocked] = useState(false);
  const [woBackdateReason, setWoBackdateReason] = useState('');
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);
  const [detailWO, setDetailWO] = useState<WorkOrder | null>(null);
  const [linkedServiceDetail, setLinkedServiceDetail] = useState<WorkOrderService | null>(null);
  const [detailTabIds, setDetailTabIds] = useState<string[]>([]);
  const [financialTimeline, setFinancialTimeline] = useState<WorkOrderFinancialTimeline>(EMPTY_FINANCIAL_TIMELINE);
  const [financialTimelineLoading, setFinancialTimelineLoading] = useState(false);
  const [lostSalesFollowUp, setLostSalesFollowUp] = useState<WorkOrder | null>(null);
  const [isFollowingUpLostSales, setIsFollowingUpLostSales] = useState(false);
  const [resumeLostSalesAfterEstimate, setResumeLostSalesAfterEstimate] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const canShowAdminRowActions = Boolean(
    currentUser?.isOwner || /^(owner|administrator)$/i.test((currentUser?.roleName || '').trim())
  );
  const [showComplaintEditor, setShowComplaintEditor] = useState(false);
  const [newComplaintTemplate, setNewComplaintTemplate] = useState('');
  const [complaintTemplates, setComplaintTemplates] = useState<string[]>(() => {
    try {
      if (localStorage.getItem(COMPLAINT_TEMPLATE_VERSION_KEY) !== COMPLAINT_TEMPLATE_VERSION) {
        localStorage.setItem(COMPLAINT_TEMPLATE_KEY, JSON.stringify(DEFAULT_COMPLAINT_TEMPLATES));
        localStorage.setItem(COMPLAINT_TEMPLATE_VERSION_KEY, COMPLAINT_TEMPLATE_VERSION);
        return DEFAULT_COMPLAINT_TEMPLATES;
      }
      const saved = localStorage.getItem(COMPLAINT_TEMPLATE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // fallback ke default
    }
    return DEFAULT_COMPLAINT_TEMPLATES;
  });
  const [complaintTemplateDraft, setComplaintTemplateDraft] = useState<string[]>([]);

  const openDetailTab = (wo: WorkOrder) => {
    setDetailTabIds(previous => previous.includes(wo.id) ? previous : [...previous, wo.id]);
    setDetailWO(wo);
  };

  const closeDetailTab = (woId: string) => {
    const closingIndex = detailTabIds.indexOf(woId);
    const remainingTabs = detailTabIds.filter(id => id !== woId);
    setDetailTabIds(remainingTabs);
    if (detailWO?.id !== woId) return;
    const fallbackId = remainingTabs[Math.min(Math.max(closingIndex - 1, 0), remainingTabs.length - 1)];
    setDetailWO(data.workOrders.find(wo => wo.id === fallbackId) || null);
  };

  const previousWorkOrderFor = (wo: WorkOrder) => data.workOrders
    .filter(candidate => candidate.id !== wo.id && (
      (candidate.vehicleRefId && candidate.vehicleRefId === wo.vehicleRefId)
      || candidate.plateNumber.trim().toLowerCase() === wo.plateNumber.trim().toLowerCase()
    ))
    .sort((left, right) => `${right.date} ${right.transactionTime || ''}`.localeCompare(`${left.date} ${left.transactionTime || ''}`))[0];

  const takeServicesFromPreviousWO = (wo: WorkOrder) => {
    const previous = previousWorkOrderFor(wo);
    if (!previous || previous.services.length === 0) {
      window.alert(`Belum ada layanan WO sebelumnya untuk kendaraan ${wo.plateNumber}.`);
      return;
    }
    handleOpenModal(wo, true);
    setFormData(current => ({
      ...current,
      services: previous.services.map((service, index) => ({
        ...service,
        id: `svc-copy-${Date.now()}-${index}`,
      })),
    }));
    setSuccessMsg(`Layanan dari ${previous.woNumber} sudah diambil. Periksa kembali sebelum disimpan.`);
    setTimeout(() => setSuccessMsg(''), 5000);
  };

  const openFavoriteServicesForWO = (wo: WorkOrder) => {
    handleOpenModal(wo, true);
    setShowQuickServices(true);
  };

  const takePreviousServicesIntoForm = async () => {
    if (!customerVehicleReady) {
      window.alert('Pilih atau daftarkan pelanggan dan kendaraan terlebih dahulu.');
      return;
    }
    const previous = data.workOrders
      .filter(candidate => candidate.id !== editingWO?.id && (
        (formData.vehicleRefId && candidate.vehicleRefId === formData.vehicleRefId)
        || (formData.plateNumber && candidate.plateNumber.trim().toLowerCase() === formData.plateNumber.trim().toLowerCase())
      ) && candidate.services.length > 0)
      .sort((left, right) => `${right.date} ${right.transactionTime || ''}`.localeCompare(`${left.date} ${left.transactionTime || ''}`))[0];
    if (!previous) {
      window.alert('Pilih pelanggan dan kendaraan terlebih dahulu. Kendaraan ini belum memiliki layanan WO sebelumnya.');
      return;
    }
    const copiedServices = previous.services.map((service, index) => ({ ...service, id: `svc-copy-${Date.now()}-${index}` }));
    if (await persistServicesAfterAdd(copiedServices)) {
      setSuccessMsg(`Layanan dari ${previous.woNumber} sudah diambil ke ${editingWO?.woNumber || 'WO baru'}.`);
      setTimeout(() => setSuccessMsg(''), 5000);
    }
  };

  const handleActionMenuToggle = (event: React.SyntheticEvent<HTMLDetailsElement>) => {
    const currentMenu = event.currentTarget;
    if (!currentMenu.open) return;
    document.querySelectorAll<HTMLDetailsElement>('details[data-wo-action-menu][open]').forEach(menu => {
      if (menu !== currentMenu) menu.open = false;
    });
  };

  const handleActionMenuBlur = (event: React.FocusEvent<HTMLDetailsElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
      event.currentTarget.open = false;
    }
  };

  const handleActionMenuKeyDown = (event: React.KeyboardEvent<HTMLDetailsElement>) => {
    if (event.key !== 'Escape') return;
    event.currentTarget.open = false;
    event.currentTarget.querySelector<HTMLElement>('summary')?.focus();
  };

  const closeActionMenuAfterChoice = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!(event.target as HTMLElement).closest('button')) return;
    const menu = event.currentTarget.closest('details') as HTMLDetailsElement | null;
    if (menu) menu.open = false;
  };

  useEffect(() => {
    const closeMenusFromOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node | null;
      document.querySelectorAll<HTMLDetailsElement>('details[data-wo-action-menu][open]').forEach(menu => {
        if (!target || !menu.contains(target)) menu.open = false;
      });
    };
    document.addEventListener('pointerdown', closeMenusFromOutsideClick);
    return () => document.removeEventListener('pointerdown', closeMenusFromOutsideClick);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!detailWO) {
      setFinancialTimeline(EMPTY_FINANCIAL_TIMELINE);
      setFinancialTimelineLoading(false);
      return () => { cancelled = true; };
    }
    setFinancialTimeline(EMPTY_FINANCIAL_TIMELINE);
    setFinancialTimelineLoading(true);
    void api.get<WorkOrderFinancialTimeline>(`work-orders/${detailWO.id}/timeline`).then(result => {
      if (cancelled) return;
      if (result.success && result.data) setFinancialTimeline(result.data);
      setFinancialTimelineLoading(false);
    });
    return () => { cancelled = true; };
  }, [detailWO?.id]);

  const workOrderColumnStorageKey = `dokterac_wo_columns_${currentUser?.id || currentUser?.username || 'default'}`;
  useEffect(() => {
    try {
      const saved = localStorage.getItem(workOrderColumnStorageKey);
      if (!saved) {
        setVisibleColumns(DEFAULT_WORK_ORDER_COLUMNS);
        return;
      }
      const parsed = JSON.parse(saved) as WorkOrderColumnKey[];
      const valid = parsed.filter(key => WORK_ORDER_COLUMNS.some(column => column.key === key));
      setVisibleColumns(Array.from(new Set<WorkOrderColumnKey>(['number', ...valid, 'actions'])));
    } catch {
      setVisibleColumns(DEFAULT_WORK_ORDER_COLUMNS);
    }
  }, [workOrderColumnStorageKey]);

  const isColumnVisible = (key: WorkOrderColumnKey) => visibleColumns.includes(key);
  const updateVisibleColumns = (columns: WorkOrderColumnKey[]) => {
    const next = Array.from(new Set<WorkOrderColumnKey>(['number', ...columns, 'actions']));
    setVisibleColumns(next);
    localStorage.setItem(workOrderColumnStorageKey, JSON.stringify(next));
  };
  const toggleColumn = (key: WorkOrderColumnKey) => {
    const config = WORK_ORDER_COLUMNS.find(column => column.key === key);
    if (config?.locked) return;
    updateVisibleColumns(isColumnVisible(key)
      ? visibleColumns.filter(column => column !== key)
      : [...visibleColumns, key]);
  };

  const [formData, setFormData] = useState({
    date: localDateKey(),
    transactionTime: localTimeKey(),
    customerRefId: '',
    customerId: '',
    customerName: '',
    vehicleRefId: '',
    plateNumber: '',
    vehicleInfo: '',
    description: '',
    diagnosisTemperature: undefined as number | undefined,
    diagnosisLp: undefined as number | undefined,
    diagnosisHp: undefined as number | undefined,
    finalTemperature: undefined as number | undefined,
    finalLp: undefined as number | undefined,
    finalHp: undefined as number | undefined,
    services: [] as WorkOrderService[],
    findings: '',
    notes: '',
    technicianId: '',
    technicianName: '',
    status: 'Register' as WorkOrder['status'],
  });

  useEffect(() => {
    setPendingTemplateDraft(data.settings.pendingReasonTemplates || DEFAULT_PENDING_REASONS);
  }, [data.settings.pendingReasonTemplates]);

  const savePendingTemplates = async () => {
    const cleaned = pendingTemplateDraft
      .map(template => ({ ...template, label: template.label.trim() }))
      .filter(template => template.label);
    if (cleaned.length === 0) {
      window.alert('Minimal satu template alasan harus tersedia.');
      return;
    }
    setSavingPendingTemplates(true);
    try {
      await updateSettings({ ...data.settings, pendingReasonTemplates: cleaned });
      setShowPendingTemplateEditor(false);
    } catch (error: any) {
      window.alert(error?.message || 'Gagal menyimpan template alasan.');
    } finally {
      setSavingPendingTemplates(false);
    }
  };

  const movePendingTemplate = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= pendingTemplateDraft.length) return;
    setPendingTemplateDraft(current => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const saveComplaintTemplates = (next: string[]) => {
    const cleaned = [...new Set(next.map(t => t.trim()).filter(Boolean))];
    setComplaintTemplates(cleaned);
    localStorage.setItem(COMPLAINT_TEMPLATE_KEY, JSON.stringify(cleaned));
    localStorage.setItem(COMPLAINT_TEMPLATE_VERSION_KEY, COMPLAINT_TEMPLATE_VERSION);
  };

  const addComplaintTemplate = () => {
    const value = newComplaintTemplate.trim();
    if (!value) return;
    const exists = complaintTemplateDraft.some(t => t.trim().toLowerCase() === value.toLowerCase());
    if (exists) {
      window.alert(`Template "${value}" sudah ada.`);
      return;
    }
    setComplaintTemplateDraft(current => [...current, value]);
    setNewComplaintTemplate('');
  };

  const updateComplaintTemplate = (index: number, value: string) => {
    setComplaintTemplateDraft(current => current.map((template, currentIndex) => currentIndex === index ? value : template));
  };

  const deleteComplaintTemplate = (index: number) => {
    setComplaintTemplateDraft(current => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const resetComplaintTemplates = () => {
    if (window.confirm('Kembalikan list keluhan ke template bawaan?')) {
      setComplaintTemplateDraft([...DEFAULT_COMPLAINT_TEMPLATES]);
    }
  };

  const openComplaintEditor = () => {
    setComplaintTemplateDraft([...complaintTemplates]);
    setNewComplaintTemplate('');
    setShowComplaintEditor(true);
  };

  const finishComplaintEditor = () => {
    const cleaned = complaintTemplateDraft.map(template => template.trim()).filter(Boolean);
    saveComplaintTemplates(cleaned.length > 0 ? cleaned : DEFAULT_COMPLAINT_TEMPLATES);
    setShowComplaintEditor(false);
  };

  const [showServiceForm, setShowServiceForm] = useState(true);
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceSearchFocused, setServiceSearchFocused] = useState(false);
  const [isServiceSearching, setIsServiceSearching] = useState(false);
  const [showQuickServices, setShowQuickServices] = useState(() => localStorage.getItem('dokterac_wo_quick_services') === 'open');
  const isLegacyFreeInspection = (item: typeof data.items[number]) => {
    const label = `${item.code} ${item.name} ${item.receiptDescription || ''}`.toUpperCase();
    return item.sellingPrice <= 0 && (/PENGECEKAN\s+GRATIS/.test(label) || /(^|\s)CEK[\s-]*AC($|\s)/.test(label));
  };
  // Item pengecekan gratis lama tetap tersimpan untuk histori, tetapi tidak lagi
  // ditawarkan pada transaksi baru.
  const availableServiceItems = data.items.filter((item) => item.isActive && !isLegacyFreeInspection(item));
  const isPackageHeaderService = (service: WorkOrderService) => (
    service.name.startsWith('[PAKET]')
    || data.items.some(item => item.id === service.itemId && item.type === 'Group')
  );
  const isPackageMemberService = (service: WorkOrderService) => (
    service.name.startsWith('   -') || /^Isi dari paket:/i.test(service.description || '')
  );
  const cleanPackageLabel = (value: string) => value.replace(/^(?:\s*\[PAKET\]\s*)+/i, '').trim();
  const masterItemForService = (service: WorkOrderService) => data.items.find(item => item.id === service.itemId);
  const serviceReceiptName = (service: WorkOrderService) => {
    const master = masterItemForService(service);
    const description = master?.receiptDescription?.trim();
    const storedReceiptName = !/^Isi dari paket:/i.test(service.description || '') ? service.description?.trim() : '';
    const fallback = storedReceiptName || master?.name?.trim() || service.name.replace(/^\s*-\s*/, '').trim();
    return cleanPackageLabel(description || fallback);
  };
  const serviceBarcodeOrCode = (service: WorkOrderService) => {
    const master = masterItemForService(service);
    return master?.barcode?.trim() || service.code || master?.code || '-';
  };
  const serviceItemCode = (service: WorkOrderService) => service.code || masterItemForService(service)?.code || '-';
  const packageMembersAfterService = (services: WorkOrderService[], index: number) => {
    const members: WorkOrderService[] = [];
    for (let cursor = index + 1; cursor < services.length && isPackageMemberService(services[cursor]); cursor += 1) {
      members.push(services[cursor]);
    }
    return members;
  };

  // Quick-add Item modal state
  const [showQuickAddItem, setShowQuickAddItem] = useState(false);
  const [quickItemForm, setQuickItemForm] = useState({
    name: '',
    type: 'Jasa' as 'Persediaan' | 'Jasa' | 'Non Persediaan',
    unit: 'JASA',
    sellingPrice: 0,
    categoryId: '',
  });

  useEffect(() => {
    if (!serviceSearch.trim()) {
      setIsServiceSearching(false);
      return;
    }
    setIsServiceSearching(true);
    const timer = window.setTimeout(() => setIsServiceSearching(false), 180);
    return () => window.clearTimeout(timer);
  }, [serviceSearch]);

  const toggleQuickServices = () => {
    setShowQuickServices(previous => {
      const next = !previous;
      localStorage.setItem('dokterac_wo_quick_services', next ? 'open' : 'closed');
      return next;
    });
  };

  const selectQuickService = (itemId: string) => {
    handleUseItem(itemId);
    setShowQuickServices(false);
    localStorage.setItem('dokterac_wo_quick_services', 'closed');
  };

  const handleQuickAddItem = async () => {
    if (!customerVehicleReady) {
      window.alert('Pilih atau daftarkan pelanggan dan kendaraan sebelum menambahkan layanan.');
      return;
    }
    if (!quickItemForm.name) { window.alert('Nama barang/jasa harus diisi'); return; }

    // Nama barang/jasa wajib unik
    const nameUpper = quickItemForm.name.trim().toUpperCase();
    const dupName = data.items.find(i => i.name.trim().toUpperCase() === nameUpper);
    if (dupName) {
      window.alert(`Nama "${nameUpper}" sudah ada di master (kode ${dupName.code}).\nGunakan item tersebut dari daftar, atau beri nama lain.`);
      return;
    }

    if (!quickItemForm.categoryId) {
      const firstCat = data.itemCategories.find(c => c.isActive);
      if (!firstCat) { window.alert('Belum ada kategori barang. Buat kategori dulu di menu Barang & Jasa.'); return; }
      quickItemForm.categoryId = firstCat.id;
    }
    const category = data.itemCategories.find(c => c.id === quickItemForm.categoryId);
    const prefix = quickItemForm.type === 'Jasa' ? 'JSA' : quickItemForm.type === 'Non Persediaan' ? 'NP' : 'BRG';
    const count = data.items.filter(item => item.code.startsWith(prefix)).length + 1;
    const newCode = `${prefix}-${String(count).padStart(4, '0')}`;

    const newItem = {
      id: Date.now().toString(),
      code: newCode,
      name: quickItemForm.name.toUpperCase(),
      categoryId: quickItemForm.categoryId,
      categoryName: category?.name || '-',
      type: quickItemForm.type,
      brand: '',
      unit: quickItemForm.unit,
      stock: 0,
      sellableStock: 0,
      purchasePrice: 0,
      sellingPrice: quickItemForm.sellingPrice,
      isActive: true,
      isQuickService: false,
      description: '',
      branchId: resolveBranchId(),
    };
    await addItem(newItem);

    await persistServicesAfterAdd([
      ...formData.services,
      {
        id: Date.now().toString() + '-svc',
        itemId: newItem.id,
        code: newItem.code,
        name: newItem.name,
        description: '',
        price: newItem.sellingPrice,
        qty: 1,
      },
    ]);

    setQuickItemForm({ name: '', type: 'Jasa', unit: 'JASA', sellingPrice: 0, categoryId: '' });
    setShowQuickAddItem(false);
  };

  const selectedCustomer = data.customers.find((customer) => customer.id === formData.customerRefId) || null;
  const customerVehicleReady = Boolean(formData.customerRefId && formData.vehicleRefId);
  const customerVehicleLocked = Boolean(isAutoRegistering || editingWO);

  const handleCustomerSelect = (customerRefId: string) => {
    const customer = data.customers.find((item) => item.id === customerRefId);
    if (!customer) {
      setFormData((prev) => ({
        ...prev,
        customerRefId: '',
        customerId: '',
        customerName: '',
        vehicleRefId: '',
        plateNumber: '',
        vehicleInfo: '',
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      customerRefId: customer.id,
      customerId: customer.customerCode,
      customerName: customer.name,
      vehicleRefId: '',
      plateNumber: '',
      vehicleInfo: '',
    }));
  };

  // Refresh API setelah simpan berjalan asinkron. Gunakan objek hasil simpan
  // supaya pelanggan baru langsung terpilih tanpa menutup alur WO di HP.
  const handleNewCustomerCreated = (customer: Customer) => {
    setFormData((prev) => ({
      ...prev,
      customerRefId: customer.id,
      customerId: customer.customerCode,
      customerName: customer.name,
      vehicleRefId: '',
      plateNumber: '',
      vehicleInfo: '',
    }));
  };

  const handleVehicleSelect = (vehicleId: string) => {
    const vehicle = data.vehicles.find((item) => item.id === vehicleId);
    if (!vehicle) return;

    setFormData((prev) => ({
      ...prev,
      vehicleRefId: vehicle.id,
      plateNumber: vehicle.plateNumber,
      vehicleInfo: `${vehicle.brand} ${vehicle.model}${vehicle.year ? ` ${vehicle.year}` : ''} - ${vehicle.color}`,
    }));
  };

  // Pilih kendaraan baru dari objek yang baru disimpan. Daftar kendaraan pada
  // render lama belum tentu sudah berisi ID tersebut ketika callback dijalankan.
  const handleNewVehicleCreated = (vehicle: Vehicle) => {
    setFormData((prev) => ({
      ...prev,
      vehicleRefId: vehicle.id,
      plateNumber: vehicle.plateNumber,
      vehicleInfo: `${vehicle.brand} ${vehicle.model}${vehicle.year ? ` ${vehicle.year}` : ''} - ${vehicle.color}`,
    }));
  };

  const canViewAllBranches = hasPermission('all_branches');
  const selectedBranchId = currentBranchId === 'ALL'
    ? (currentUser?.branchId || resolveBranchId())
    : currentBranchId;
  const selectedBranch = data.branches.find(branch => branch.id === selectedBranchId);
  const selectedBranchLabel = selectedBranch?.name.replace('CABANG ', '') || 'Cabang Aktif';
  const toLocalDate = (date: Date) => localDateKey(date);
  const todayDate = toLocalDate(new Date());

  const activeBranchIds = data.branches.filter(branch => branch.isActive).map(branch => branch.id);

  const isAllBranchDropdown = currentBranchId === 'ALL';
  const branchScopeLabel = isAllBranchDropdown ? 'Semua Cabang' : selectedBranchLabel;

  const periodRange = useMemo(() => {
    const now = new Date();
    if (periodFilter === 'today') return { from: todayDate, to: todayDate };
    if (periodFilter === '7days') {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      return { from: toLocalDate(start), to: todayDate };
    }
    if (periodFilter === 'thisMonth') {
      return { from: toLocalDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: todayDate };
    }
    if (periodFilter === 'lastMonth') {
      return {
        from: toLocalDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: toLocalDate(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    }
    if (periodFilter === 'custom') return { from: dateFrom, to: dateTo };
    return { from: '', to: '' };
  }, [periodFilter, todayDate, dateFrom, dateTo]);

  const filteredWOs = useMemo(() => {
    return data.workOrders
      .filter((wo) => {
        // Cabang selalu otomatis mengikuti dropdown cabang pada header.
        const branchMatch = isAllBranchDropdown
          ? activeBranchIds.includes(wo.branchId)
          : wo.branchId === selectedBranchId;
        if (!branchMatch) return false;

        const dateMatch = (!periodRange.from || wo.date >= periodRange.from) && (!periodRange.to || wo.date <= periodRange.to);
        if (!dateMatch) return false;

        const matchesSearch =
          wo.woNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
          wo.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (data.customers.find(customer => customer.id === wo.customerRefId || customer.customerCode === wo.customerId)?.phone || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          wo.plateNumber.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = !filterStatus || wo.status === filterStatus;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        // Newest first: compare by date desc, then by WO number desc (for same-day records)
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return b.woNumber.localeCompare(a.woNumber);
      });
  }, [
    data.workOrders,
    data.customers,
    searchTerm,
    filterStatus,
    isAllBranchDropdown,
    activeBranchIds,
    selectedBranchId,
    periodRange,
  ]);

  const activeFilterCount = (filterStatus ? 1 : 0) + (periodFilter !== 'all' ? 1 : 0);
  const resetWorkOrderFilters = () => {
    setFilterStatus('');
    setPeriodFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  const totalServices = formData.services.reduce((sum, s) => sum + s.price * s.qty, 0);
  const newWOReadyForRegister = Boolean(
    !editingWO
    && currentBranchId !== 'ALL'
    && formData.customerRefId
    && formData.vehicleRefId
    && formData.description.trim()
  );

  const resetForm = () => {
    setFormData({
      date: localDateKey(),
      transactionTime: localTimeKey(),
      customerRefId: '',
      customerId: '',
      customerName: '',
      vehicleRefId: '',
      plateNumber: '',
      vehicleInfo: '',
      description: '',
      diagnosisTemperature: undefined,
      diagnosisLp: undefined,
      diagnosisHp: undefined,
      finalTemperature: undefined,
      finalLp: undefined,
      finalHp: undefined,
      services: [],
      findings: '',
      notes: '',
      technicianId: '',
      technicianName: '',
      status: 'Register',
    });
    setShowServiceForm(true);
    setServiceSearch('');
    setEditingWO(null);
    setIsAutoRegisteredDraft(false);
    setIsAutoRegistering(false);
    autoRegisteringRef.current = false;
    setWoDateUnlocked(false);
    setWoBackdateReason('');
  };

  const handleOpenModal = (wo?: WorkOrder, servicesOnly = false) => {
    setDetailWO(null);
    setDiagnosisMode(false);
    setServiceEditMode(Boolean(wo && servicesOnly));
    setIsAutoRegisteredDraft(false);
    if (wo) {
      setEditingWO(wo);
      const matchedVehicle = data.vehicles.find(
        (v) => v.plateNumber === wo.plateNumber && v.customerName === wo.customerName
      );
      setFormData({
        date: wo.date,
        transactionTime: wo.transactionTime?.slice(0, 5) || (wo.createdAt ? localTimeKey(new Date(wo.createdAt.replace(' ', 'T'))) : localTimeKey()),
        customerRefId: wo.customerRefId || '',
        customerId: wo.customerId,
        customerName: wo.customerName,
        vehicleRefId: matchedVehicle?.id || '',
        plateNumber: wo.plateNumber,
        vehicleInfo: wo.vehicleInfo,
        description: wo.description || '',
        diagnosisTemperature: wo.diagnosisTemperature,
        diagnosisLp: wo.diagnosisLp,
        diagnosisHp: wo.diagnosisHp,
        finalTemperature: wo.finalTemperature,
        finalLp: wo.finalLp,
        finalHp: wo.finalHp,
        services: wo.services,
        findings: wo.findings || '',
        notes: wo.notes || '',
        technicianId: wo.technicianId || '',
        technicianName: wo.technicianName || '',
        status: wo.status,
      });
      setWoDateUnlocked(wo.date !== localDateKey());
      setWoBackdateReason(wo.backdateReason || '');
    } else {
      resetForm();
    }
    setShowModal(true);
  };

  const handleOpenDiagnosis = (wo: WorkOrder) => {
    handleOpenModal(wo);
    setDiagnosisMode(true);
    setServiceEditMode(false);
  };

  const requestedNewWO = searchParams.get('new');
  const requestedEditWO = searchParams.get('edit');
  const requestedViewWO = searchParams.get('view');

  // Saat modul WO pertama kali dibuka, tampilkan Data Baru sekali saja.
  // Setelah pengguna menutupnya, jangan membuka kembali sampai modul dibuka ulang.
  useEffect(() => {
    if (defaultNewTabOpenedRef.current || isLoading) return;
    if (requestedNewWO || requestedEditWO || requestedViewWO) return;
    if (!hasPermission('wo:create') || currentBranchId === 'ALL') return;
    defaultNewTabOpenedRef.current = true;
    handleOpenModal();
  }, [isLoading, requestedNewWO, requestedEditWO, requestedViewWO, currentBranchId]);

  // Aksi dari WO Timeline selalu membawa ID WO agar baris yang dipilih itulah
  // yang dibuka. WO yang sudah difakturkan hanya boleh dilihat (read-only).
  useEffect(() => {
    if (!requestedNewWO && !requestedEditWO && !requestedViewWO) return;
    if ((requestedEditWO || requestedViewWO) && isLoading && data.workOrders.length === 0) return;

    if (requestedNewWO === '1') {
      setSearchParams({}, { replace: true });
      if (!hasPermission('wo:create')) {
        window.alert('Anda tidak memiliki hak membuat WO.');
        return;
      }
      if (currentBranchId === 'ALL') {
        window.alert('Pilih cabang aktif terlebih dahulu sebelum membuat WO baru.');
        return;
      }
      handleOpenModal();
      return;
    }

    const targetId = requestedEditWO || requestedViewWO || '';
    const targetWO = data.workOrders.find(wo => wo.id === targetId);
    setSearchParams({}, { replace: true });
    if (!targetWO) {
      window.alert('WO yang dipilih tidak ditemukan atau tidak dapat diakses.');
      return;
    }

    const lockedByInvoice = Boolean(targetWO.invoiceId);
    if (requestedViewWO || lockedByInvoice || !hasPermission('wo:edit')) {
      openDetailTab(targetWO);
      if (lockedByInvoice && requestedEditWO) {
        window.alert(`WO ${targetWO.woNumber} sudah memiliki faktur dan dibuka dalam mode lihat.`);
      }
      return;
    }

    handleOpenModal(targetWO, true);
  }, [requestedNewWO, requestedEditWO, requestedViewWO, isLoading, data.workOrders]);

  const handleCloseModal = () => {
    setShowModal(false);
    setDiagnosisMode(false);
    setServiceEditMode(false);
    setResumeLostSalesAfterEstimate(false);
    resetForm();
  };

  const requestCloseEditor = () => {
    const hasUnsavedNewData = !editingWO && Boolean(
      formData.customerRefId || formData.vehicleRefId || formData.description ||
      formData.notes || formData.findings || formData.services.length > 1
    );
    if (hasUnsavedNewData && !window.confirm('Tutup Data Baru? Data yang belum disimpan akan hilang.')) return;
    handleCloseModal();
  };

  const handleRemoveService = (id: string) => {
    setFormData(prev => {
      const targetIndex = prev.services.findIndex(service => service.id === id);
      if (targetIndex < 0) return prev;
      const target = prev.services[targetIndex];
      if (!isPackageHeaderService(target)) {
        return { ...prev, services: prev.services.filter(service => service.id !== id) };
      }
      let endIndex = targetIndex + 1;
      while (endIndex < prev.services.length && isPackageMemberService(prev.services[endIndex])) endIndex += 1;
      return { ...prev, services: prev.services.filter((_, index) => index < targetIndex || index >= endIndex) };
    });
  };

  const handleUpdateService = (id: string, field: 'price' | 'qty' | 'description', value: number | string) => {
    setFormData(prev => {
      const targetIndex = prev.services.findIndex(service => service.id === id);
      if (targetIndex < 0) return prev;
      const target = prev.services[targetIndex];
      const nextValue = field === 'qty' ? Math.max(1, Number(value) || 1) : value;
      const oldPackageQty = Math.max(1, Number(target.qty) || 1);
      const services = prev.services.map((service, index) => {
        if (index === targetIndex) return { ...service, [field]: nextValue };
        if (field !== 'qty' || !isPackageHeaderService(target) || index <= targetIndex) return service;
        let belongsToPackage = true;
        for (let cursor = targetIndex + 1; cursor <= index; cursor += 1) {
          if (!isPackageMemberService(prev.services[cursor])) {
            belongsToPackage = false;
            break;
          }
        }
        if (!belongsToPackage) return service;
        return { ...service, qty: Math.max(1, Math.round(service.qty * Number(nextValue) / oldPackageQty)) };
      });
      return { ...prev, services };
    });
  };

  const getDuplicateServices = (itemId: string) => {
    const item = data.items.find((entry) => entry.id === itemId);
    if (!item) return [];

    // Paket hanya dianggap duplikat jika header paket yang sama sudah dipilih.
    // Komponen yang kebetulan dipakai paket lain tidak boleh menyalakan semua paket.
    const candidateIds = [item.id];

    return formData.services.filter(service => service.itemId && candidateIds.includes(service.itemId));
  };

  const isItemAdded = (itemId: string) => getDuplicateServices(itemId).length > 0;

  const persistServicesAfterAdd = async (nextServices: WorkOrderService[]) => {
    if (!customerVehicleReady) {
      window.alert('Pilih atau daftarkan pelanggan dan kendaraan sebelum menambahkan layanan.');
      return false;
    }
    if (!editingWO) {
      window.alert('Register WO terlebih dahulu sebelum menambahkan layanan.');
      return false;
    }
    if (autoRegisteringRef.current) return false;
    setFormData(previous => ({ ...previous, services: nextServices }));
    return true;
  };

  // Klik item/favorit langsung menambah satu baris. Panel tetap terbuka agar bisa tambah banyak.
  const handleUseItem = async (itemId: string) => {
    if (!editingWO) {
      window.alert('Register WO terlebih dahulu sebelum menambahkan layanan.');
      return;
    }
    const item = data.items.find((entry) => entry.id === itemId);
    if (!item) return;

    const duplicates = getDuplicateServices(itemId);
    if (duplicates.length > 0) {
      const names = [...new Set(duplicates.map(service => service.name.replace(/^\s*-\s*/, '')))];
      window.alert(`Tidak ditambahkan karena sudah ada di WO:\n• ${names.join('\n• ')}`);
      return;
    }

    // Group ditampilkan sebagai header harga paket + komponen harga 0.
    if (item.type === 'Group' && item.groupMembers && item.groupMembers.length > 0) {
      const stamp = Date.now();
      const groupHeader: WorkOrderService = {
        id: `head-${stamp}`,
        itemId: item.id,
        code: item.code,
        name: `[PAKET] ${cleanPackageLabel(item.name)}`,
        description: item.receiptDescription || item.name,
        price: item.sellingPrice,
        qty: 1,
      };

      const memberLines: WorkOrderService[] = item.groupMembers.map((member, index) => ({
        id: `mem-${stamp}-${index}`,
        itemId: member.itemId,
        code: member.itemCode,
        name: `   - ${member.itemName}`,
        description: `Isi dari paket: ${item.name}`,
        price: 0,
        qty: member.qty,
      }));

      await persistServicesAfterAdd([...formData.services, groupHeader, ...memberLines]);
      return;
    }

    const service: WorkOrderService = {
      id: `svc-${Date.now()}-${item.id}`,
      itemId: item.id,
      code: item.code,
      name: item.name,
      description: item.receiptDescription || item.name,
      price: item.sellingPrice,
      qty: 1,
    };

    await persistServicesAfterAdd([...formData.services, service]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Pengaman untuk komponen tambah pelanggan/kendaraan yang berada di dalam
    // form WO. Submit dari kontrol anak tidak boleh menutup/menyimpan form induk.
    if (e.target !== e.currentTarget) return;
    const shouldCreateInvoice = diagnosisMode && diagnosisSubmitAction.current === 'invoice';
    const shouldMarkLostSales = diagnosisSubmitAction.current === 'lost';
    const shouldProcessNew = !editingWO && diagnosisSubmitAction.current === 'process';
    const shouldProcessEditing = Boolean(editingWO && editingWO.status === 'Register' && diagnosisSubmitAction.current === 'process');
    diagnosisSubmitAction.current = 'save';

    if (editingWO?.invoiceId) {
      window.alert(`WO ${editingWO.woNumber} sudah difakturkan dan tidak dapat diubah.`);
      return;
    }
    if (!editingWO && autoRegisteringRef.current) return;

    // Validasi wajib
    if (!formData.customerRefId) {
      setSuccessMsg('');
      window.alert('Pelanggan wajib dipilih dari data pelanggan.');
      return;
    }
    if (!formData.vehicleRefId) {
      window.alert('Kendaraan wajib dipilih dari data kendaraan.');
      return;
    }
    if (!formData.description.trim()) {
      window.alert('Keluhan atau keterangan service wajib diisi.');
      return;
    }
    if ((diagnosisMode || serviceEditMode || shouldProcessNew || shouldProcessEditing) && formData.services.length === 0) {
      window.alert('Tambahkan minimal 1 layanan/barang sebelum menyimpan.');
      return;
    }
    if ((diagnosisMode || serviceEditMode || shouldProcessNew || shouldProcessEditing) && totalServices <= 0) {
      window.alert('Total estimasi harus lebih dari Rp0. Isi harga minimal satu layanan/barang sebelum menyimpan diagnosa.');
      return;
    }
    const diagnosisMeasurements = [formData.diagnosisTemperature, formData.diagnosisLp, formData.diagnosisHp];
    const hasAnyMeasurement = diagnosisMeasurements.some(value => value !== undefined && value !== null);
    const hasCompleteMeasurements = diagnosisMeasurements
      .every(value => value !== undefined && value !== null && Number.isFinite(Number(value)));
    if (diagnosisMode && hasAnyMeasurement && !hasCompleteMeasurements) {
      window.alert('Data pengukuran belum lengkap. Jika salah satu diisi, Suhu, LP, dan HP wajib diisi semuanya.');
      return;
    }
    if (shouldCreateInvoice) {
      const hasCompletionNote = Boolean(formData.findings.trim());
      if (!hasCompleteMeasurements && !hasCompletionNote) {
        window.alert('Pekerjaan belum dapat diselesaikan. Isi Suhu, LP, dan HP secara lengkap atau tuliskan catatan hasil pekerjaan.');
        return;
      }
    }

    // Aturan: satu mobil hanya boleh punya satu WO aktif dalam satu waktu.
    if (!editingWO) {
      const active = findActiveWoByPlate(formData.plateNumber);
      if (active) {
        setActiveWoConflict(active);
        return;
      }
    }

    const today = localDateKey();
    const transactionDateChanged = editingWO ? formData.date !== editingWO.date : true;
    const transactionTimeChanged = editingWO
      ? formData.transactionTime !== (editingWO.transactionTime?.slice(0, 5) || formData.transactionTime)
      : false;
    if (formData.date > today) {
      window.alert('Tanggal WO tidak boleh melewati hari ini.');
      return;
    }
    if (`${formData.date}T${formData.transactionTime}` > `${today}T${localTimeKey()}`) {
      window.alert('Tanggal dan waktu WO tidak boleh melewati waktu sekarang.');
      return;
    }
    // Mengubah harga/layanan pada WO lama bukan transaksi tanggal mundur baru.
    // Izin dan alasan hanya diminta ketika tanggal benar-benar diubah, atau saat membuat WO baru.
    if (transactionDateChanged && formData.date < today && !hasPermission('wo:backdate')) {
      window.alert('Anda tidak memiliki hak akses tanggal mundur.');
      return;
    }
    if (transactionTimeChanged && !hasPermission('wo:backdate')) {
      window.alert('Anda tidak memiliki hak mengubah waktu WO.');
      return;
    }
    if (transactionDateChanged && data.settings.security.requireBackdateReason !== false && formData.date < today && !woBackdateReason.trim()) {
      window.alert('Alasan tanggal mundur wajib diisi.');
      return;
    }
    const targetBranch = resolveBranchId();
    const woNumber = generateDocumentNumber('workOrder', targetBranch, new Date(`${formData.date}T12:00:00`));

    if (shouldCreateInvoice && !window.confirm(
      'Tandai pekerjaan selesai dan buka Faktur/Pembayaran sekarang?'
    )) {
      return;
    }

    if (!editingWO) {
      autoRegisteringRef.current = true;
      setIsAutoRegistering(true);
    }
    try {
      if (editingWO) {
        const savedWorkOrder: WorkOrder = {
          ...editingWO,
          ...formData,
          backdateReason: woBackdateReason.trim() || undefined,
          total: totalServices,
          estimateTotal: diagnosisMode || editingWO.status === 'Register'
            ? totalServices
            : editingWO.estimateTotal,
        };
        let finalWorkOrder = resumeLostSalesAfterEstimate ? {
          ...savedWorkOrder,
          status: 'Proses' as const,
          statusLog: [...(editingWO.statusLog || []), {
            from: editingWO.status,
            to: 'Proses' as const,
            at: new Date().toISOString(),
            byUserId: currentUser?.id || '-',
            byUserName: currentUser?.name || 'System',
            reason: 'Lost Sales ditindaklanjuti untuk masalah yang sama setelah estimasi dilengkapi.',
          }],
        } : savedWorkOrder;
        if (shouldProcessEditing) {
          finalWorkOrder = {
            ...savedWorkOrder,
            status: 'Proses',
            statusLog: [
              ...(editingWO.statusLog || []),
              {
                from: editingWO.status,
                to: 'Proses',
                at: new Date().toISOString(),
                byUserId: currentUser?.id || '-',
                byUserName: currentUser?.name || 'System',
                reason: 'Estimasi disetujui dan pekerjaan mulai dikerjakan.',
              },
            ],
          };
        }
        if (shouldCreateInvoice) {
          const actor = {
            byUserId: currentUser?.id || '-',
            byUserName: currentUser?.name || 'System',
          };
          if (editingWO.status === 'Register') {
            const processWorkOrder: WorkOrder = {
              ...savedWorkOrder,
              status: 'Proses',
              statusLog: [
                ...(editingWO.statusLog || []),
                {
                  from: 'Register',
                  to: 'Proses',
                  at: new Date().toISOString(),
                  ...actor,
                  reason: 'Estimasi disetujui dan pekerjaan dikerjakan.',
                },
              ],
            };
            await updateWorkOrder(editingWO.id, processWorkOrder);
            finalWorkOrder = {
              ...processWorkOrder,
              status: 'Selesai',
              statusLog: [
                ...(processWorkOrder.statusLog || []),
                {
                  from: 'Proses',
                  to: 'Selesai',
                  at: new Date().toISOString(),
                  ...actor,
                  reason: 'Pekerjaan selesai dan dilanjutkan ke penagihan.',
                },
              ],
            };
          } else {
            finalWorkOrder = {
              ...savedWorkOrder,
              status: 'Selesai',
              statusLog: [
                ...(editingWO.statusLog || []),
                {
                  from: editingWO.status,
                  to: 'Selesai',
                  at: new Date().toISOString(),
                  ...actor,
                  reason: 'Pekerjaan selesai dan dilanjutkan ke penagihan.',
                },
              ],
            };
          }
        }
        await updateWorkOrder(editingWO.id, finalWorkOrder);
        if (shouldMarkLostSales) {
          const result = await changeWorkOrderStatus(editingWO.id, 'Closed', lostSalesReason.current);
          lostSalesReason.current = '';
          if (!result.ok) throw new Error(result.message || 'WO gagal diubah menjadi Lost Sales.');
          setSuccessMsg(`${editingWO.woNumber} berhasil disimpan sebagai Lost Sales.`);
        }
        if (serviceEditMode) await refreshData();
        if (!shouldMarkLostSales) setSuccessMsg(
          shouldProcessEditing
            ? `${editingWO.woNumber} berhasil disimpan dan masuk status Dikerjakan.`
            : resumeLostSalesAfterEstimate
              ? `${editingWO.woNumber} berhasil dilengkapi dan masuk status Dikerjakan.`
              : diagnosisMode
                ? `Diagnosa ${editingWO.woNumber} berhasil disimpan.`
                : `${editingWO.woNumber} berhasil diperbarui.`,
        );
        if (shouldCreateInvoice) {
          handleCloseModal();
          handleOpenInvoiceModal(finalWorkOrder);
          return;
        }
      } else {
        const created = await addWorkOrder({
          id: Date.now().toString(),
          woNumber,
          ...formData,
          status: shouldProcessNew ? 'Proses' : 'Register',
          statusLog: shouldProcessNew ? [{
            from: 'Register',
            to: 'Proses',
            at: new Date().toISOString(),
            byUserId: currentUser?.id || '-',
            byUserName: currentUser?.name || 'System',
            reason: 'WO dibuat dan langsung diproses.',
          }] : undefined,
          backdateReason: woBackdateReason.trim() || undefined,
          total: totalServices,
          estimateTotal: totalServices > 0 ? totalServices : undefined,
          branchId: targetBranch,
        });
        const bName = data.branches.find(b => b.id === targetBranch)?.name || targetBranch;
        setEditingWO(created);
        setIsAutoRegisteredDraft(true);
        setSuccessMsg(`${created.woNumber} berhasil diregistrasikan di ${bName}. Tambahkan layanan lalu simpan.`);
        setTimeout(() => setSuccessMsg(''), 4000);
        return;
      }
      setTimeout(() => setSuccessMsg(''), 4000);
      if (!isAutoRegisteredDraft) handleCloseModal();
    } catch (err: any) {
      window.alert('Gagal menyimpan Order Kerja: ' + (err?.message || 'terjadi kesalahan'));
    } finally {
      autoRegisteringRef.current = false;
      setIsAutoRegistering(false);
    }
  };

  const handleDelete = async (wo: WorkOrder) => {
    if (wo.invoiceId) {
      window.alert(`WO tidak dapat dihapus karena sudah terhubung dengan Faktur ${wo.invoiceNumber || ''}. Hapus pembayaran dan faktur terlebih dahulu.`);
      return;
    }
    if (!['Register', 'Selesai'].includes(wo.status)) {
      window.alert(`WO berstatus ${wo.status} tidak dapat dihapus permanen. Gunakan pembatalan atau arsip agar histori tetap tersimpan.`);
      return;
    }
    if (!window.confirm(`Hapus ${wo.woNumber}? Data layanan pada WO ini juga akan dihapus.`)) return;
    try {
      await deleteWorkOrder(wo.id);
      setSuccessMsg(`${wo.woNumber} berhasil dihapus.`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      window.alert(err?.message || 'WO gagal dihapus.');
    }
  };

  // Alur status berurutan: dipanggil dari tombol aksi di kartu WO.
  const requestStatusChange = (wo: WorkOrder, next: WorkOrder['status']) => {
    if (next === 'Closed' && wo.invoiceId) {
      window.alert(`WO tidak dapat dibatalkan karena sudah terhubung dengan Faktur ${wo.invoiceNumber || ''}.`);
      return;
    }
    setStatusReason('');
    setCancelStep(1);
    setCancelReasonChoice('');
    setCancelReasonNotes('');
    setStatusDialog({ wo, next });
  };

  const openCompletionModal = (wo: WorkOrder) => {
    setCompletionWO(wo);
    setCompletionForm({
      temperature: wo.finalTemperature === undefined || wo.finalTemperature === null ? '' : String(wo.finalTemperature),
      lp: wo.finalLp === undefined || wo.finalLp === null ? '' : String(wo.finalLp),
      hp: wo.finalHp === undefined || wo.finalHp === null ? '' : String(wo.finalHp),
      note: wo.findings?.trim() || '',
    });
    setCompletionError('');
  };

  const closeCompletionModal = () => {
    if (isCompletingWO) return;
    setCompletionWO(null);
    setCompletionError('');
  };

  const completeWorkOrder = async () => {
    if (!completionWO || isCompletingWO) return;
    const measurementValues = [completionForm.temperature, completionForm.lp, completionForm.hp];
    const filledMeasurements = measurementValues.filter(value => value.trim() !== '').length;
    if (filledMeasurements > 0 && filledMeasurements < 3) {
      setCompletionError('Jika mengisi hasil pengukuran, Suhu, LP, dan HP harus diisi lengkap.');
      return;
    }
    if (filledMeasurements === 0 && !completionForm.note.trim()) {
      setCompletionError('Isi Suhu, LP, dan HP secara lengkap atau tuliskan catatan hasil pekerjaan.');
      return;
    }
    const parsedMeasurements = measurementValues.map(value => Number(value.replace(',', '.')));
    if (filledMeasurements === 3 && parsedMeasurements.some(value => !Number.isFinite(value))) {
      setCompletionError('Nilai Suhu, LP, atau HP tidak valid. Gunakan angka, misalnya 8 atau 35.5.');
      return;
    }

    setIsCompletingWO(true);
    setCompletionError('');
    try {
      const now = new Date().toISOString();
      const completed: WorkOrder = {
        ...completionWO,
        status: 'Selesai',
        finalTemperature: filledMeasurements === 3 ? parsedMeasurements[0] : completionWO.finalTemperature,
        finalLp: filledMeasurements === 3 ? parsedMeasurements[1] : completionWO.finalLp,
        finalHp: filledMeasurements === 3 ? parsedMeasurements[2] : completionWO.finalHp,
        findings: completionForm.note.trim() || completionWO.findings,
        statusLog: [
          ...(completionWO.statusLog || []),
          {
            from: completionWO.status,
            to: 'Selesai',
            at: now,
            byUserId: currentUser?.id || '-',
            byUserName: currentUser?.name || 'System',
            reason: 'Pekerjaan selesai dan hasil akhir dicatat.',
          },
        ],
      };
      await updateWorkOrder(completionWO.id, completed);
      setSuccessMsg(`${completionWO.woNumber} berhasil diselesaikan. Selanjutnya dapat dibuatkan faktur.`);
      setTimeout(() => setSuccessMsg(''), 4000);
      setCompletionWO(null);
      setDetailWO(null);
    } catch (error: any) {
      setCompletionError(error?.message || 'WO gagal diselesaikan. Periksa data lalu coba lagi.');
    } finally {
      setIsCompletingWO(false);
    }
  };

  const confirmStatusChange = async (reasonOverride?: string) => {
    if (!statusDialog) return;
    const { wo, next } = statusDialog;
    try {
      const result = await changeWorkOrderStatus(wo.id, next, reasonOverride ?? statusReason);
      if (!result.ok) {
        window.alert(result.message || 'Perubahan status ditolak.');
        return;
      }
      setSuccessMsg(`${wo.woNumber}: status berubah menjadi ${statusLabel(next)}.`);
      setTimeout(() => setSuccessMsg(''), 4000);
      setStatusDialog(null);
      setStatusReason('');
      setCancelStep(1);
      setCancelReasonChoice('');
      setCancelReasonNotes('');
      setDetailWO(current => current?.id === wo.id ? { ...current, status: next } : current);
    } catch (error: any) {
      window.alert(`Gagal mengubah status: ${error?.message || 'server tidak merespons'}`);
    }
  };

  const handleReopenCompletedWorkOrder = async (wo: WorkOrder) => {
    if (wo.invoiceId || wo.invoiceNumber || data.invoices.some(invoice => invoice.woId === wo.id)) {
      window.alert('WO sudah memiliki faktur. Hapus faktur dan pembayarannya terlebih dahulu sebelum mengembalikan WO ke Dikerjakan.');
      return;
    }
    const reason = window.prompt(`Mundur ${wo.woNumber} kembali ke Dikerjakan.\n\nMasukkan alasan perubahan:`, 'Salah menekan Selesai');
    if (reason === null) return;
    if (!reason.trim()) {
      window.alert('Alasan mengembalikan WO ke Dikerjakan wajib diisi.');
      return;
    }
    try {
      const result = await changeWorkOrderStatus(wo.id, 'Proses', reason.trim());
      if (!result.ok) {
        window.alert(result.message || 'WO tidak dapat dikembalikan ke Dikerjakan.');
        return;
      }
      setSuccessMsg(`${wo.woNumber} dikembalikan ke Dikerjakan.`);
      setTimeout(() => setSuccessMsg(''), 4000);
      setDetailWO(current => current?.id === wo.id ? { ...current, status: 'Proses' } : current);
    } catch (error: any) {
      window.alert(`Gagal mengembalikan WO: ${error?.message || 'server tidak merespons'}`);
    }
  };

  const handleOpenInvoiceModal = (wo: WorkOrder) => {
    if (wo.status !== 'Selesai') {
      window.alert(`WO ${wo.woNumber} masih berstatus ${wo.status}. Ubah status menjadi Selesai sebelum membuat faktur.`);
      return;
    }
    setInvoiceWO(wo);
    setInvoiceCashPayment(wo.total);
    setInvoiceTransferPayment(0);
    const today = localDateKey();
    setInvoiceDate(today);
    setInvoicePaymentDate(today);
    setInvoiceDateUnlocked(false);
    setInvoicePaymentDateUnlocked(false);
    setInvoiceBackdateReason('');
  };

  const openActiveWorkOrder = async (wo: WorkOrder) => {
    setActiveWoConflict(null);
    const sameBranch = wo.branchId === resolveBranchId();

    if (!sameBranch) {
      openDetailTab(wo);
      return;
    }

    if (wo.status === 'Register') {
      handleOpenDiagnosis(wo);
      return;
    }
    if (wo.status === 'Proses') {
      handleOpenModal(wo);
      return;
    }
    if (wo.status === 'Selesai' && hasPermission('invoice:create') && !wo.invoiceId) {
      handleOpenInvoiceModal(wo);
      return;
    }

    openDetailTab(wo);
  };

  const activeWorkOrderActionLabel = (wo: WorkOrder, sameBranch: boolean) => {
    if (!sameBranch) return 'Buka WO (Read-only, cabang lain)';
    if (wo.status === 'Register') return wo.services.length ? 'Edit Layanan' : '+ Tambah Layanan';
    if (wo.status === 'Proses') return 'Buka Pekerjaan';
    if (wo.status === 'Selesai' && hasPermission('invoice:create') && !wo.invoiceId) return 'Buat Faktur';
    return 'Lihat WO Ini';
  };

  // Cabang aktif user saat ini (untuk melanjutkan pekerjaan)
  const activeBranchId = currentBranchId === 'ALL'
    ? (currentUser?.branchId || 'BR-001')
    : currentBranchId;

  const submitContinue = async () => {
    if (!continueWO) return;
    const created = await continueWorkOrder(continueWO.id, activeBranchId);
    if (created) {
      const tgt = data.branches.find(b => b.id === activeBranchId);
      setSuccessMsg(`${created.woNumber} dibuat di ${tgt?.name} sebagai lanjutan dari ${continueWO.woNumber}.`);
      setTimeout(() => setSuccessMsg(''), 5000);
    }
    setContinueWO(null);
  };

  const handleCreateInvoice = async () => {
    if (invoiceWO && !isCreatingInvoice) {
      const today = localDateKey();
      if (invoiceDate > today || (invoicePayment > 0 && invoicePaymentDate > today)) {
        window.alert('Tanggal transaksi tidak boleh melewati hari ini.');
        return;
      }
      if (invoicePayment > 0 && invoicePaymentDate < invoiceDate) {
        window.alert('Tanggal pembayaran tidak boleh sebelum tanggal faktur.');
        return;
      }
      if (data.settings.security.requireBackdateReason !== false && (invoiceDate < today || (invoicePayment > 0 && invoicePaymentDate < today)) && !invoiceBackdateReason.trim()) {
        window.alert('Alasan tanggal mundur wajib diisi.');
        return;
      }
      if (invoicePayment > invoiceWO.total) {
        const difference = invoicePayment - invoiceWO.total;
        window.alert(`Pembayaran melebihi tagihan Rp ${difference.toLocaleString('id-ID')}. Kurangi nominal Tunai atau Transfer.`);
        return;
      }
      setIsCreatingInvoice(true);
      try {
        const invoice = await createInvoiceFromWO(invoiceWO.id, invoiceCashPayment, invoiceTransferPayment, invoiceDate, invoicePayment > 0 ? invoicePaymentDate : undefined, invoiceBackdateReason);
      if (invoice) {
        setSuccessMsg(`Faktur ${invoice.invoiceNumber} berhasil dibuat dari ${invoiceWO.woNumber}!`);
        setTimeout(() => setSuccessMsg(''), 4000);
      }
        setInvoiceWO(null);
        setInvoiceCashPayment(0);
        setInvoiceTransferPayment(0);
      } catch (error: any) {
        window.alert(`Gagal membuat faktur: ${error?.message || 'terjadi kesalahan'}`);
      } finally {
        setIsCreatingInvoice(false);
      }
    }
  };

  const statusColors: Record<string, string> = {
    Register: 'bg-slate-100 text-slate-700',
    Proses: 'bg-blue-100 text-blue-800',
    Selesai: 'bg-green-100 text-green-800',
    Closed: 'bg-rose-100 text-rose-800',
  };
  const statusLabel = (status: WOStatus | LegacyWOStatus) => status === 'Closed' || status === 'Batal' ? 'Lost Sales' : status === 'Proses' ? 'Dikerjakan' : status === 'Pengecekan' || status === 'Pending' ? 'Register' : status === 'Invoiced' || status === 'Dibayar' ? 'Selesai' : status;
  const diagnosisMeasurementLabel = (wo: WorkOrder) => [
    wo.diagnosisTemperature != null ? `Suhu ${wo.diagnosisTemperature}°C` : '',
    wo.diagnosisLp != null ? `LP ${wo.diagnosisLp} PSI` : '',
    wo.diagnosisHp != null ? `HP ${wo.diagnosisHp} PSI` : '',
  ].filter(Boolean).join(' · ');

  const openLinkedInvoice = (wo: WorkOrder) => {
    const invoice = data.invoices.find(item =>
      item.id === wo.invoiceId || item.woId === wo.id || item.invoiceNumber === wo.invoiceNumber
    );
    const target = invoice?.id || wo.invoiceId || wo.invoiceNumber;
    if (!target) return window.alert('Faktur terkait belum ditemukan.');
    window.location.assign(`/invoices?view=${encodeURIComponent(target)}`);
  };

  const openLinkedItem = (service: WorkOrderService) => {
    setLinkedServiceDetail(service);
  };
  const linkedServiceMaster = linkedServiceDetail ? masterItemForService(linkedServiceDetail) : undefined;

  const customerPhoneForWO = (wo: WorkOrder) => {
    const customer = data.customers.find(item =>
      item.id === wo.customerRefId
      || (!!wo.customerId && item.customerCode === wo.customerId)
      || item.name.trim().toLowerCase() === wo.customerName.trim().toLowerCase()
    );
    if (customer?.phone) return customer.phone;
    const vehicle = data.vehicles.find(item =>
      item.id === wo.vehicleRefId
      || item.plateNumber.replace(/[^a-z0-9]/gi, '').toLowerCase() === wo.plateNumber.replace(/[^a-z0-9]/gi, '').toLowerCase()
    );
    return vehicle?.phone || '—';
  };

  const workOrderAuditTimeline = (wo: WorkOrder) => {
    const branchName = data.branches.find(branch => branch.id === wo.branchId)?.name || wo.branchId;
    const events: Array<{ at: string; title: string; description: string; tone: string; continuation?: boolean }> = [{
      at: wo.createdAt || `${wo.date}T00:00:00`,
      title: 'WO diregister',
      description: `Tanggal transaksi ${formatBusinessDate(wo.date)} · ${branchName} · Input ${wo.createdByName || '-'}`,
      tone: 'bg-blue-600',
    }];
    if (wo.continuedFromWoId) events.push({
      at: wo.createdAt || `${wo.date}T00:00:00`,
      title: `Lanjutan dari ${wo.continuedFromWoNumber || 'WO sebelumnya'}`,
      description: `Asal ${wo.continuedFromBranchName || '-'}`,
      tone: 'bg-violet-600',
      continuation: true,
    });
    (wo.statusLog || []).filter(log => log.from !== log.to).forEach(log => events.push({
      at: log.at,
      title: `${statusLabel(log.from)} → ${statusLabel(log.to)}`,
      description: `Oleh ${log.byUserName || '-'}${log.reason ? ` · ${log.reason}` : ''}`,
      tone: 'bg-amber-500',
    }));
    const finance = financialTimeline.woId === wo.id ? financialTimeline : EMPTY_FINANCIAL_TIMELINE;
    if (finance.invoice) {
      const invoice = finance.invoice;
      events.push({
        at: invoice.createdAt || `${invoice.date}T23:57:00`,
        title: `Faktur ${invoice.invoiceNumber} dibuat`,
        description: `Tanggal faktur ${formatBusinessDate(invoice.date)} · Total Rp ${Number(invoice.total).toLocaleString('id-ID')} · ${invoice.status}`,
        tone: 'bg-emerald-600',
      });
      finance.payments.forEach(payment => events.push({
        at: payment.createdAt || `${payment.date}T23:58:00`,
        title: `Pembayaran ${payment.paymentNumber}`,
        description: `Rp ${Number(payment.amount).toLocaleString('id-ID')} · ${payment.paymentMethod}${payment.accountName ? ` → ${payment.accountName}` : ''} · Input ${payment.createdByName || '-'}`,
        tone: 'bg-green-600',
      }));
      finance.paymentAudits.filter(audit => audit.action === 'delete').forEach(audit => events.push({
        at: audit.createdAt || invoice.updatedAt || `${invoice.date}T23:59:00`,
        title: `Pembayaran ${audit.paymentNumber || '-'} dihapus`,
        description: `Rp ${Number(audit.amount).toLocaleString('id-ID')} · Oleh ${audit.userName || '-'}${audit.reason ? ` · ${audit.reason}` : ''}`,
        tone: 'bg-red-600',
      }));
      if (invoice.status === 'Lunas') {
        const lastPayment = finance.payments[finance.payments.length - 1];
        events.push({
          at: lastPayment?.createdAt || invoice.updatedAt || invoice.createdAt || `${invoice.date}T23:59:30`,
          title: 'Faktur Lunas',
          description: `Total pembayaran Rp ${Number(invoice.payment).toLocaleString('id-ID')} dari nilai faktur Rp ${Number(invoice.total).toLocaleString('id-ID')}`,
          tone: 'bg-green-800',
        });
      }
    }
    if (wo.continuedToWoId) events.push({
      at: wo.continuedAt || data.workOrders.find(item => item.id === wo.continuedToWoId)?.createdAt || wo.updatedAt || wo.date,
      title: `Dilanjutkan ke ${wo.continuedToWoNumber || 'WO baru'}`,
      description: `${wo.continuedToBranchName || data.branches.find(branch => branch.id === wo.continuedBranchId)?.name || '-'} · Oleh ${wo.continuedByName || '-'}`,
      tone: 'bg-violet-600',
      continuation: true,
    });
    return events.sort((left, right) => {
      const leftTime = new Date(left.at.includes('T') ? left.at : left.at.replace(' ', 'T')).getTime();
      const rightTime = new Date(right.at.includes('T') ? right.at : right.at.replace(' ', 'T')).getTime();
      return (Number.isNaN(leftTime) || Number.isNaN(rightTime)) ? left.at.localeCompare(right.at) : leftTime - rightTime;
    });
  };

  const formatShareDate = (date: string) => {
    const [year, month, day] = date.split('-');
    return year && month && day ? `${Number(day)}/${Number(month)}/${year}` : date;
  };

  const workOrderShareText = (wo: WorkOrder) => {
    const vehicle = data.vehicles.find(item =>
      item.id === wo.vehicleRefId
      || item.plateNumber.replace(/[^a-z0-9]/gi, '').toLowerCase() === wo.plateNumber.replace(/[^a-z0-9]/gi, '').toLowerCase()
    );
    const vehicleLabel = vehicle
      ? `${vehicle.brand} ${vehicle.model}${vehicle.year ? ` ${vehicle.year}` : ''}${vehicle.color ? ` (${vehicle.color})` : ''}`
      : wo.vehicleInfo;
    const inputBy = wo.statusLog?.[0]?.byUserName || currentUser?.name || '-';
    const phone = customerPhoneForWO(wo).replace(/^[—–-]+$/, '');
    const measurement = [
      wo.diagnosisTemperature != null ? `Suhu ${wo.diagnosisTemperature}°C` : '',
      wo.diagnosisLp != null ? `LP ${wo.diagnosisLp} PSI` : '',
      wo.diagnosisHp != null ? `HP ${wo.diagnosisHp} PSI` : '',
    ].filter(Boolean).join(' · ');
    return `${wo.woNumber} ( ${formatShareDate(wo.date)} )\n🚗 ${wo.plateNumber} – ${vehicleLabel}\n👤 ${wo.customerName}${phone ? ` ${phone}` : ''}\nKeluhan: ${wo.description?.trim() || '-'}${wo.findings ? `\nHasil diagnosa: ${wo.findings}` : ''}${measurement ? `\nPengukuran: ${measurement}` : ''}\nInput: ${inputBy}`;
  };

  const copyWorkOrder = async (wo: WorkOrder) => {
    try {
      await navigator.clipboard.writeText(workOrderShareText(wo));
      setSuccessMsg(`${wo.woNumber} berhasil disalin.`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      window.alert('Teks WO gagal disalin. Izinkan akses clipboard lalu coba lagi.');
    }
  };

  const shareWorkOrderToWhatsApp = (wo: WorkOrder) => {
    window.open(`https://wa.me/?text=${encodeURIComponent(workOrderShareText(wo))}`, '_blank', 'noopener,noreferrer');
  };

  const handleRefresh = async () => {
    await refreshData();
  };

  const openNewRegistration = () => {
    if (showModal && !diagnosisMode && !serviceEditMode && !editingWO) return;
    if (currentBranchId === 'ALL') {
      window.alert('Pilih cabang aktif dulu dari menu dropdown di header sebelum membuat registrasi WO.');
      return;
    }
    handleOpenModal();
  };

  const continueLostSalesSameIssue = async () => {
    if (!lostSalesFollowUp || isFollowingUpLostSales) return;
    const positiveEstimate = lostSalesFollowUp.services.reduce((sum, service) => sum + Number(service.price || 0) * Number(service.qty || 0), 0);
    if (!lostSalesFollowUp.services.length || positiveEstimate <= 0) {
      const sourceWO = lostSalesFollowUp;
      setLostSalesFollowUp(null);
      setDetailWO(null);
      setResumeLostSalesAfterEstimate(true);
      handleOpenDiagnosis(sourceWO);
      setSuccessMsg(`${sourceWO.woNumber}: lengkapi layanan dan estimasi sebelum melanjutkan ke Dikerjakan.`);
      setTimeout(() => setSuccessMsg(''), 5000);
      return;
    }
    const activeWO = findActiveWoByPlate(lostSalesFollowUp.plateNumber);
    if (activeWO && activeWO.id !== lostSalesFollowUp.id) {
      window.alert(`Kendaraan ${lostSalesFollowUp.plateNumber} sudah memiliki WO aktif ${activeWO.woNumber}.`);
      setLostSalesFollowUp(null);
      openDetailTab(activeWO);
      return;
    }
    setIsFollowingUpLostSales(true);
    try {
      const result = await changeWorkOrderStatus(lostSalesFollowUp.id, 'Proses');
      if (!result.ok) {
        window.alert(result.message || 'WO Lost Sales tidak dapat dilanjutkan.');
        return;
      }
      setSuccessMsg(`${lostSalesFollowUp.woNumber} dipulihkan dari Lost Sales dan masuk status Dikerjakan.`);
      setTimeout(() => setSuccessMsg(''), 5000);
      setLostSalesFollowUp(null);
      setDetailWO(null);
    } catch (error: any) {
      window.alert(error?.message || 'Gagal melanjutkan WO Lost Sales.');
    } finally {
      setIsFollowingUpLostSales(false);
    }
  };

  const continueLostSalesDifferentIssue = async () => {
    if (!lostSalesFollowUp || isFollowingUpLostSales) return;
    setIsFollowingUpLostSales(true);
    try {
      const sourceWO = lostSalesFollowUp;
      const created = await continueWorkOrder(sourceWO.id, sourceWO.branchId, { resetJob: true });
      if (!created) {
        window.alert('WO baru tidak dapat dibuat.');
        return;
      }
      setSuccessMsg(`${created.woNumber} dibuat untuk masalah berbeda; pelanggan dan kendaraan sudah terisi.`);
      setTimeout(() => setSuccessMsg(''), 5000);
      setLostSalesFollowUp(null);
      setDetailWO(null);
      handleOpenModal(created);
    } catch (error: any) {
      window.alert(error?.message || 'Gagal membuat WO baru dari Lost Sales.');
    } finally {
      setIsFollowingUpLostSales(false);
    }
  };

  return (
    <div className="space-y-6 lg:-mx-5 lg:-mt-5 lg:space-y-1">
      <div className={ui.childBar}>
        <button type="button" onClick={() => { requestCloseEditor(); setDetailWO(null); }} className={ui.childListTab} title="Daftar Order Kerja">
          <ListPlus className="h-5 w-5" />
        </button>
        {showModal && diagnosisMode && editingWO ? (
          <button
            type="button"
            className={`${ui.childTabActive} gap-2 px-5 text-sm`}
          >
            <Wrench className="h-4 w-4" /> DIAGNOSA {editingWO.woNumber}
            <X className="ml-1 h-4 w-4" onClick={(event) => { event.stopPropagation(); handleCloseModal(); }} />
          </button>
        ) : showModal && serviceEditMode && editingWO ? (
          <button type="button" className={`${ui.childTabActive} gap-2 px-5 text-sm`}>
            EDIT PEKERJAAN {editingWO.woNumber}
            <X className="ml-1 h-4 w-4" onClick={(event) => { event.stopPropagation(); handleCloseModal(); }} />
          </button>
        ) : showModal && editingWO ? (
          <button type="button" className={`${ui.childTabActive} gap-2 px-5 text-sm`}>
            {isAutoRegisteredDraft ? <FileText className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
            {isAutoRegisteredDraft ? editingWO.woNumber : `Edit ${editingWO.woNumber}`}
            <X className="ml-1 h-4 w-4" onClick={(event) => { event.stopPropagation(); handleCloseModal(); }} />
          </button>
        ) : showModal && hasPermission('wo:create') ? (
          <button type="button" className={`${ui.childTabActive} gap-2 px-5 text-sm`}>
            Data Baru
            <X className="ml-1 h-4 w-4" onClick={(event) => { event.stopPropagation(); requestCloseEditor(); }} />
          </button>
        ) : null}
        {!showModal && (
          <div className="hidden min-w-0 items-end gap-0 overflow-x-auto lg:flex">
            {detailTabIds.map(tabId => {
              const tabWO = data.workOrders.find(wo => wo.id === tabId);
              if (!tabWO) return null;
              const active = detailWO?.id === tabId;
              return (
                <button
                  key={tabId}
                  type="button"
                  onClick={() => setDetailWO(tabWO)}
                  className={`${childTabClass(active)} max-w-[230px] flex-shrink-0 gap-2 px-4 text-sm`}
                  title={tabWO.woNumber}
                >
                  <span className="truncate font-mono">{tabWO.woNumber}</span>
                  <X className="h-4 w-4 flex-shrink-0" onClick={(event) => { event.stopPropagation(); closeDetailTab(tabId); }} />
                </button>
              );
            })}
          </div>
        )}
        <div className="ml-auto flex h-11 items-center gap-2 border-b-0 px-2">
          <button type="button" onClick={() => setShowColumnPicker(value => !value)} className="flex h-9 w-11 items-center justify-center rounded border border-blue-600 bg-white text-blue-700 hover:bg-blue-50" title="Pengaturan tampilan"><Settings2 className="h-5 w-5" /></button>
          <button type="button" className="flex h-9 w-11 items-center justify-center rounded bg-amber-500 text-white" title="Panduan Work Order"><Lightbulb className="h-5 w-5" /></button>
        </div>
      </div>

      {!showModal && !detailWO && <>
      {/* Success Message */}
      {successMsg && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3 animate-pulse">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-sm font-medium text-green-800">{successMsg}</p>
        </div>
      )}

      {/* Filters */}
      <div className="border-y border-gray-300 bg-[#eeeeee] px-3 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="order-5 relative ml-auto min-w-[260px] flex-[0_1_360px] xl:min-w-[300px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Cari nomor WO, pelanggan, telepon, atau nomor plat..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          {periodFilter === 'custom' && (
            <div className="order-1 flex items-center gap-1">
              <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} className="h-10 rounded-lg border border-gray-300 bg-white px-2 text-xs" />
              <span className="text-gray-400">–</span>
              <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} className="h-10 rounded-lg border border-gray-300 bg-white px-2 text-xs" />
            </div>
          )}
          <select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value as WorkOrderPeriod)} className="order-1 h-10 rounded border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none focus:border-blue-500">
            <option value="all">Tanggal: Semua</option><option value="today">Tanggal: Hari Ini</option><option value="7days">Tanggal: 7 Hari</option><option value="thisMonth">Tanggal: Bulan Ini</option><option value="lastMonth">Tanggal: Bulan Lalu</option><option value="custom">Tanggal: Pilih Rentang</option>
          </select>
          <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)} className="order-1 h-10 rounded border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none focus:border-blue-500">
            <option value="">Status: Semua</option><option value="Register">Status: Register</option><option value="Proses">Status: Dikerjakan</option><option value="Selesai">Status: Selesai</option><option value="Closed">Status: Lost Sales</option>
          </select>
          {hasPermission('wo:create') && <button type="button" onClick={openNewRegistration} className="order-3 inline-flex h-10 w-16 flex-shrink-0 items-center justify-center rounded bg-blue-800 text-white shadow-sm hover:bg-blue-700"><Plus className="h-5 w-5" /></button>}
          <button type="button" onClick={() => void handleRefresh()} disabled={isLoading} className="order-4 inline-flex h-10 w-12 flex-shrink-0 items-center justify-center rounded border border-blue-600 bg-white text-blue-700 hover:bg-blue-50 disabled:opacity-50" title="Refresh data">
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <div className="order-1 relative flex-shrink-0" tabIndex={-1} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setShowFilterPanel(false); }}>
            <button type="button" onClick={() => setShowFilterPanel(value => !value)} className={`inline-flex h-10 items-center gap-2 rounded border px-3 text-sm font-semibold ${showFilterPanel || activeFilterCount > 0 ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-blue-600 bg-white text-blue-700 hover:bg-blue-50'}`} title="Filter daftar WO"><Filter className="h-4 w-4" /> Filter{activeFilterCount > 0 && <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] leading-none text-white">{activeFilterCount}</span>}</button>
            {showFilterPanel && <div className="absolute right-0 top-[calc(100%+6px)] z-40 w-[min(360px,calc(100vw-24px))] rounded-xl border border-gray-200 bg-white p-4 shadow-xl">
              <div className="mb-3 flex items-center justify-between border-b border-gray-100 pb-2"><strong className="text-sm text-gray-800">Filter Order Kerja</strong><button type="button" onClick={resetWorkOrderFilters} className="text-xs font-semibold text-blue-700 hover:underline">Reset</button></div>
              <label className="block text-xs font-semibold text-gray-600">Status<select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-normal text-gray-800"><option value="">Semua Status</option><option value="Register">Register</option><option value="Proses">Dikerjakan</option><option value="Selesai">Selesai</option><option value="Closed">Lost Sales</option></select></label>
              <label className="mt-3 block text-xs font-semibold text-gray-600">Tanggal<select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value as WorkOrderPeriod)} className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-normal text-gray-800"><option value="all">Semua Tanggal</option><option value="today">Hari Ini</option><option value="7days">7 Hari Terakhir</option><option value="thisMonth">Bulan Ini</option><option value="lastMonth">Bulan Lalu</option><option value="custom">Pilih Tanggal</option></select></label>
              {periodFilter === 'custom' && <div className="mt-3 grid grid-cols-2 gap-2"><label className="text-xs text-gray-600">Dari<input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-2 text-xs" /></label><label className="text-xs text-gray-600">Sampai<input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-2 text-xs" /></label></div>}
              <button type="button" onClick={() => setShowFilterPanel(false)} className="mt-4 h-10 w-full rounded-lg bg-blue-600 text-sm font-semibold text-white">Terapkan Filter</button>
            </div>}
          </div>
          <div className="order-2 h-0 basis-full" />
          <div className="order-6 flex flex-wrap items-center gap-2 xl:flex-nowrap">
          <button type="button" className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50" title="Download"><Download className="h-4 w-4" /></button>
          <button type="button" className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50" title="Print"><Printer className="h-4 w-4" /></button>
          <div className="relative flex-shrink-0" tabIndex={-1} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setShowColumnPicker(false); }}>
            <button type="button" onClick={() => setShowColumnPicker(value => !value)} className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border ${showColumnPicker ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}`} title="Pilih kolom">
              <Settings2 className="h-4 w-4" />
            </button>
            {showColumnPicker && (
              <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
                <div className="mb-2 flex items-center justify-between border-b border-gray-100 pb-2"><span className="text-sm font-bold text-gray-800">Kolom Daftar WO</span><button type="button" onClick={() => setShowColumnPicker(false)} className="p-1 text-gray-400"><X className="h-4 w-4" /></button></div>
                {WORK_ORDER_COLUMNS.map(column => (
                  <label key={column.key} className={`flex items-center gap-2 rounded-lg px-2 py-2 text-sm ${column.locked ? 'cursor-not-allowed bg-gray-50 text-gray-500' : 'cursor-pointer hover:bg-blue-50'}`}>
                    <input type="checkbox" checked={isColumnVisible(column.key)} disabled={column.locked} onChange={() => toggleColumn(column.key)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                    <span>{column.label}</span>
                    {column.locked && <span className="ml-auto text-[10px] font-semibold uppercase text-gray-400">Wajib</span>}
                  </label>
                ))}
                <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3"><button type="button" onClick={() => updateVisibleColumns(DEFAULT_WORK_ORDER_COLUMNS)} className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">Semua</button><button type="button" onClick={() => updateVisibleColumns(['number', 'customer', 'vehicle', 'status', 'actions'])} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50">Ringkas</button></div>
              </div>
            )}
          </div>
          </div>
          <span className="order-6 flex h-10 min-w-16 items-center justify-center rounded border border-gray-300 bg-white px-3 text-sm text-gray-700">{filteredWOs.length}</span>
        </div>
      </div>
      <div className="hidden px-3 py-0.5">
        <div className="flex flex-col gap-2">
          {/* Quick list toggles */}
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Cari nomor WO, pelanggan, atau nomor plat..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="h-12 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-4 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
            </div>
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={isLoading}
              className="inline-flex h-12 flex-shrink-0 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60"
              title="Ambil ulang data Order Kerja dari server"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden lg:inline">{isLoading ? 'Memuat…' : 'Refresh'}</span>
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={todayOnly}
              onClick={() => setTodayOnly(value => !value)}
              className={`flex h-12 flex-shrink-0 items-center justify-between gap-3 px-2 transition-colors lg:w-[180px] ${
                todayOnly
                  ? 'text-blue-800'
                  : 'text-gray-600'
              }`}
            >
              <span className="flex items-center gap-2 text-left">
                <CalendarDays className={`h-4 w-4 ${todayOnly ? 'text-blue-600' : 'text-gray-400'}`} />
                <span>
                  <span className="block text-xs font-semibold">Hari Ini</span>
                </span>
              </span>
              <span className={`relative flex h-7 w-16 flex-shrink-0 items-center rounded-full px-1 transition-colors ${todayOnly ? 'bg-blue-600' : 'bg-gray-300'}`}>
                <span className={`absolute text-[8px] font-bold text-white ${todayOnly ? 'left-2' : 'right-1.5'}`}>{todayOnly ? 'ON' : 'OFF'}</span>
                <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${todayOnly ? 'translate-x-9' : 'translate-x-0'}`} />
              </span>
            </button>

            {/* Toggle cabang hanya muncul untuk cabang yang dipilih pada dropdown header. */}
            {!isAllBranchDropdown && (
              <button
                type="button"
                role="switch"
                aria-checked={activeBranchOnly || !canViewAllBranches}
                disabled={!canViewAllBranches}
                onClick={() => canViewAllBranches && setActiveBranchOnly(value => !value)}
                title={!canViewAllBranches ? 'Akun ini hanya boleh melihat cabangnya sendiri' : activeBranchOnly ? `Matikan untuk melihat semua cabang aktif` : `Aktifkan untuk hanya melihat ${selectedBranchLabel}`}
                className={`flex h-12 flex-shrink-0 items-center justify-between gap-3 px-2 transition-colors lg:w-[205px] ${
                  activeBranchOnly || !canViewAllBranches
                    ? 'text-emerald-800'
                    : 'text-gray-500'
                } ${!canViewAllBranches ? 'cursor-not-allowed opacity-80' : ''}`}
              >
                <span className="flex min-w-0 items-center gap-2 text-left">
                  <Building2 className={`h-4 w-4 flex-shrink-0 ${activeBranchOnly || !canViewAllBranches ? 'text-emerald-600' : 'text-gray-400'}`} />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-bold">{selectedBranchLabel}</span>
                  </span>
                </span>
                <span className={`relative flex h-7 w-16 flex-shrink-0 items-center rounded-full px-1 transition-colors ${activeBranchOnly || !canViewAllBranches ? 'bg-emerald-600' : 'bg-gray-300'}`}>
                  <span className={`absolute text-[8px] font-bold text-white ${activeBranchOnly || !canViewAllBranches ? 'left-2' : 'right-1.5'}`}>{activeBranchOnly || !canViewAllBranches ? 'ON' : 'OFF'}</span>
                  <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${activeBranchOnly || !canViewAllBranches ? 'translate-x-9' : 'translate-x-0'}`} />
                </span>
              </button>
            )}

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="h-12 flex-shrink-0 rounded-lg border border-gray-300 bg-white px-4 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 lg:w-[190px]"
            >
              <option value="">Semua Status</option>
              <option value="Register">Register</option>
              <option value="Closed">Lost Sales</option>
              <option value="Proses">Dikerjakan</option>
              <option value="Selesai">Selesai</option>
            </select>

            <div className="relative hidden flex-shrink-0 lg:block">
              <button
                type="button"
                onClick={() => setShowColumnPicker(value => !value)}
                className={`inline-flex h-12 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors ${showColumnPicker ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
                title="Pilih kolom yang tampil"
              >
                <Settings2 className="h-4 w-4" />
                Kolom
              </button>
              {showColumnPicker && (
                <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
                  <div className="mb-2 flex items-center justify-between border-b border-gray-100 pb-2">
                    <span className="text-sm font-bold text-gray-800">Kolom Daftar WO</span>
                    <button type="button" onClick={() => setShowColumnPicker(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Tutup pilihan kolom"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="space-y-1">
                    {WORK_ORDER_COLUMNS.map(column => (
                      <label key={column.key} className={`flex items-center gap-2 rounded-lg px-2 py-2 text-sm ${column.locked ? 'cursor-not-allowed bg-gray-50 text-gray-500' : 'cursor-pointer text-gray-700 hover:bg-blue-50'}`}>
                        <input
                          type="checkbox"
                          checked={isColumnVisible(column.key)}
                          disabled={column.locked}
                          onChange={() => toggleColumn(column.key)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>{column.label}</span>
                        {column.locked && <span className="ml-auto text-[10px] font-semibold uppercase text-gray-400">Wajib</span>}
                      </label>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3">
                    <button type="button" onClick={() => updateVisibleColumns(DEFAULT_WORK_ORDER_COLUMNS)} className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">Tampilkan Semua</button>
                    <button type="button" onClick={() => updateVisibleColumns(['number', 'customer', 'vehicle', 'createdBy', 'actions'])} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50">Ringkas</button>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Hari Ini OFF: range tanggal opsional. Kosong = semua tanggal. */}
          {!todayOnly && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-indigo-800">Dari Tanggal</label>
                    <input
                      type="date"
                      value={dateFrom}
                      max={dateTo || undefined}
                      onChange={(event) => setDateFrom(event.target.value)}
                      className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-indigo-800">Sampai Tanggal</label>
                    <input
                      type="date"
                      value={dateTo}
                      min={dateFrom || undefined}
                      onChange={(event) => setDateTo(event.target.value)}
                      className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setPeriodFilter('7days')} className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">7 Hari Terakhir</button>
                  <button type="button" onClick={() => setPeriodFilter('thisMonth')} className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">Bulan Ini</button>
                  <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); }} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100">Reset</button>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-indigo-700">
                {dateFrom || dateTo
                  ? `Menampilkan ${dateFrom || 'awal'} sampai ${dateTo || 'akhir'}.`
                  : 'Range kosong: menampilkan WO dari semua tanggal.'}
              </p>
            </div>
          )}

          <div className="hidden">
            <span>
              {todayOnly
                ? `Hari ini: ${todayDate}`
                : dateFrom || dateTo
                ? `${dateFrom || 'awal'} – ${dateTo || 'akhir'}`
                : 'Semua tanggal'}
              {' · '}{branchScopeLabel}
            </span>
            <span className="font-semibold text-gray-800">{filteredWOs.length} WO</span>
          </div>
        </div>
      </div>

      {/* Desktop Work Order List */}
      {filteredWOs.length > 0 && (
        <div className="mx-3 mt-0.5 hidden overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm lg:block">
          <div className="max-h-[calc(100vh-285px)] overflow-auto">
            <table className="w-full min-w-[1100px] text-left">
              <thead className="sticky top-0 z-10 bg-blue-800 text-xs uppercase tracking-wide text-white">
                <tr>
                  {isColumnVisible('number') && <th className="px-4 py-3 font-semibold">No. WO / Tanggal</th>}
                  {isColumnVisible('customer') && <th className="px-4 py-3 font-semibold">Pelanggan</th>}
                  {isColumnVisible('vehicle') && <th className="px-4 py-3 font-semibold">Kendaraan</th>}
                  {isColumnVisible('services') && <th className="px-4 py-3 font-semibold">Layanan</th>}
                  {isColumnVisible('total') && <th className="px-4 py-3 text-right font-semibold">Total</th>}
                  {isColumnVisible('status') && <th className="px-4 py-3 text-center font-semibold">Status</th>}
                  {isColumnVisible('createdBy') && <th className="px-4 py-3 font-semibold">Dibuat Oleh</th>}
                  {isColumnVisible('actions') && <th className="px-4 py-3 text-right font-semibold">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredWOs.map((wo) => (
                  <tr key={wo.id} className="transition-colors hover:bg-blue-50/50">
                    {isColumnVisible('number') && <td className="px-4 py-3">
                      <button type="button" onClick={() => openDetailTab(wo)} className="text-left">
                        <span className="block font-mono text-sm font-bold text-blue-700 hover:underline">{wo.woNumber}</span>
                        <span className="mt-0.5 block text-xs text-gray-500">
                          {wo.date}{wo.transactionTime ? ` · ${wo.transactionTime.slice(0, 5)}` : ''}
                          {canViewAllBranches && (isAllBranchDropdown || !activeBranchOnly) && (
                            <> · {data.branches.find(b => b.id === wo.branchId)?.name.replace('CABANG ', '')}</>
                          )}
                        </span>
                      </button>
                    </td>}
                    {isColumnVisible('customer') && <td className="px-4 py-3">
                      <span className="block max-w-[180px] truncate text-sm font-semibold text-gray-900">{wo.customerName}</span>
                      <span className="mt-0.5 block text-xs text-gray-500">{customerPhoneForWO(wo)}</span>
                    </td>}
                    {isColumnVisible('vehicle') && <td className="px-4 py-3">
                      <span className="block font-mono text-sm font-bold text-gray-900">{formatPlateNumber(wo.plateNumber)}</span>
                      <span className="mt-0.5 block max-w-[210px] truncate text-xs text-gray-500">{wo.vehicleInfo.replace(/\s+-\s+/g, ' · ')}</span>
                    </td>}
                    {isColumnVisible('services') && <td className="px-4 py-3">
                      <span className="block max-w-[230px] truncate text-sm text-gray-800">
                        {wo.services.map(service => service.name).join(', ') || 'Belum ada layanan'}
                      </span>
                      <span className="block text-xs text-gray-500">{wo.services.length} item layanan</span>
                    </td>}
                    {isColumnVisible('total') && <td className={`whitespace-nowrap px-4 py-3 text-right text-sm font-bold ${statusLabel(wo.status) === 'Lost Sales' ? 'text-gray-400' : 'text-gray-900'}`}>
                      Rp {wo.total.toLocaleString('id-ID')}
                    </td>}
                    {isColumnVisible('status') && <td className="px-4 py-3 text-center">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusColors[wo.status] || 'bg-gray-100 text-gray-700'}`}>
                        {statusLabel(wo.status)}
                      </span>
                    </td>}
                    {isColumnVisible('createdBy') && <td className="px-4 py-3">
                      <span className="block max-w-[170px] truncate text-sm font-semibold text-gray-800" title={wo.createdByName || 'Data lama belum memiliki pencatat pembuat'}>
                        {wo.createdByName || '—'}
                      </span>
                    </td>}
                    {isColumnVisible('actions') && <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => shareWorkOrderToWhatsApp(wo)}
                          className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                          title="Bagikan WO ke WhatsApp"
                          aria-label={`Bagikan ${wo.woNumber} ke WhatsApp`}
                        >
                          <MessageCircle className="h-4 w-4" />
                        </button>
                        <button onClick={() => openDetailTab(wo)} className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 hover:text-blue-700" title="Lihat detail">
                          <Eye className="h-4 w-4" />
                        </button>
                        {canShowAdminRowActions && hasPermission('wo:edit') && wo.status !== 'Closed' && !wo.invoiceId && (
                          <button onClick={() => handleOpenModal(wo)} className="rounded-lg p-2 text-blue-600 hover:bg-blue-100" title="Edit">
                            <Edit className="h-4 w-4" />
                          </button>
                        )}
                        {canShowAdminRowActions && hasPermission('wo:delete') && ['Register', 'Selesai'].includes(wo.status) && !wo.invoiceId && (
                          <button onClick={() => void handleDelete(wo)} className="rounded-lg p-2 text-red-600 hover:bg-red-100" title="Hapus">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
            <span>Klik nomor WO atau ikon mata untuk melihat rincian lengkap.</span>
            <span className="font-semibold">{filteredWOs.length} order kerja</span>
          </div>
        </div>
      )}
      {filteredWOs.length === 0 && (
        <div className="hidden rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm lg:block">
          <Wrench className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <p className="text-lg font-medium text-gray-900">Tidak ada order kerja</p>
          <p className="text-sm text-gray-500">
            {todayOnly
              ? `Tidak ada WO hari ini di ${branchScopeLabel}. Matikan filter Hari Ini untuk melihat riwayat.`
              : 'Ubah filter atau buat Order Kerja baru.'}
          </p>
        </div>
      )}

      {/* Ringkasan WO mobile: padat, urutan informasi mengikuti alur operasional. */}
      <div className="space-y-2 px-2 pb-3 lg:hidden">
        {filteredWOs.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-10 text-center shadow-sm">
            <Wrench className="mx-auto mb-2 h-9 w-9 text-gray-300" />
            <p className="font-semibold text-gray-900">Tidak ada Servis Job</p>
            <p className="mt-1 text-xs text-gray-500">Ubah filter atau tekan + New untuk registrasi kendaraan masuk.</p>
          </div>
        ) : filteredWOs.map(wo => {
          const serviceNames = wo.services.map(service => service.name);
          const branchName = data.branches.find(branch => branch.id === wo.branchId)?.name.replace('CABANG ', '');
          return (
            <article key={`compact-${wo.id}`} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <button type="button" onClick={() => openDetailTab(wo)} className="block w-full px-3 pb-2.5 pt-3 text-left">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-mono text-sm font-bold text-blue-700">{wo.woNumber}</span>
                  <span className="whitespace-nowrap text-[11px] text-gray-500">
                    {formatBusinessDate(wo.date)}{wo.transactionTime ? ` · ${wo.transactionTime.slice(0, 5)}` : ''}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm font-semibold text-gray-900">{formatPlateNumber(wo.plateNumber)} — {wo.vehicleInfo}</p>
                <p className="mt-0.5 truncate text-xs text-gray-600">{wo.customerName} — {customerPhoneForWO(wo) || '-'}</p>
                {wo.description && <p className="mt-1 line-clamp-2 text-xs text-gray-600"><span className="font-semibold text-gray-700">Keluhan:</span> {wo.description}</p>}
                <p className="mt-1 truncate text-xs text-gray-500">
                  <span className="font-semibold text-gray-700">Layanan:</span>{' '}
                  {serviceNames.length ? `${serviceNames.slice(0, 2).join(', ')}${serviceNames.length > 2 ? ` +${serviceNames.length - 2}` : ''}` : 'Belum ada layanan'}
                </p>
              </button>
              <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 bg-gray-50 px-3 py-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusColors[wo.status] || 'bg-gray-100 text-gray-700'}`}>{statusLabel(wo.status)}</span>
                {canViewAllBranches && <span className="text-[10px] font-semibold text-gray-400">{branchName}</span>}
                {wo.invoiceId && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Faktur {wo.invoiceNumber || 'tersedia'}</span>}
                <span className="ml-auto text-xs font-bold text-gray-800">Rp {wo.total.toLocaleString('id-ID')}</span>
                <button type="button" onClick={() => openDetailTab(wo)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600" aria-label={`Lihat detail ${wo.woNumber}`}><Eye className="h-4 w-4" /></button>
                {canShowAdminRowActions && hasPermission('wo:edit') && wo.status !== 'Closed' && !wo.invoiceId && (
                  <button type="button" onClick={() => handleOpenModal(wo)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-white text-blue-600" aria-label={`Edit ${wo.woNumber}`}><Edit className="h-4 w-4" /></button>
                )}
                {canShowAdminRowActions && hasPermission('wo:delete') && ['Register', 'Selesai'].includes(wo.status) && !wo.invoiceId && (
                  <button type="button" onClick={() => void handleDelete(wo)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600" aria-label={`Hapus ${wo.woNumber}`}><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* Layout kartu lama dipertahankan sementara sebagai referensi, tidak dirender. */}
      <div className="hidden">
        {filteredWOs.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <Wrench className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-lg font-medium text-gray-900">Tidak ada order kerja</p>
            <p className="text-sm text-gray-500">
              {todayOnly
                ? `Tidak ada WO hari ini di ${branchScopeLabel}. Matikan filter Hari Ini untuk melihat riwayat.`
                : 'Klik "Buat Order Kerja" untuk menambahkan order baru.'}
            </p>
          </div>
        ) : (
          filteredWOs.map((wo) => (
            <div key={wo.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
              <div className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center">
                      <Wrench className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-gray-900 text-lg">{wo.woNumber}</h3>
                        {wo.continuedFromWoNumber && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-semibold text-cyan-700"
                            title={`Lanjutan dari ${wo.continuedFromWoNumber} di ${wo.continuedFromBranchName}`}
                          >
                            <ArrowLeftRight className="h-3 w-3" />
                            Lanjutan {wo.continuedFromWoNumber}
                          </span>
                        )}
                        {wo.continuedToWoNumber && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700"
                            title={`Sudah dilanjutkan di ${wo.continuedToWoNumber} (${wo.continuedToBranchName})`}
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Dilanjutkan → {wo.continuedToWoNumber}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">
                        {wo.date} • {wo.plateNumber}
                        {canViewAllBranches && (isAllBranchDropdown || !activeBranchOnly) && (
                          <> • <span className="font-medium text-blue-600">{data.branches.find(b => b.id === wo.branchId)?.name.replace('CABANG ', '')}</span></>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${statusColors[wo.status]}`}
                      title={`Status saat ini: ${wo.status}`}
                    >
                      {wo.status === 'Register' && '0.'}
                      {wo.status === 'Proses' && '1.'}
                      {wo.status === 'Selesai' && '2.'}
                      {wo.status === 'Closed' && '✕'}
                      <span>{statusLabel(wo.status)}</span>
                    </span>

                    {/* Tombol aksi status berurutan */}
                    {hasPermission('wo:edit') && wo.status === 'Register' && !wo.continuedToWoId && (
                      <button onClick={() => handleOpenDiagnosis(wo)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">{wo.services.length ? 'Edit Layanan' : '+ Tambah Layanan'}</button>
                    )}
                    {hasPermission('wo:edit') && wo.status === 'Proses' && (
                      <button
                        onClick={() => openCompletionModal(wo)}
                        className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
                        title="Pekerjaan selesai, siap dibuat faktur"
                      >
                        Tandai Selesai
                      </button>
                    )}
                    {wo.status === 'Closed' && wo.cancelReason && (
                      <span className="text-[11px] italic text-gray-500" title={wo.cancelReason}>
                        Alasan: {wo.cancelReason}
                      </span>
                    )}
                    {wo.invoiceId ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm font-medium">
                        <FileText className="w-4 h-4" />
                        {wo.invoiceNumber}
                      </span>
                    ) : wo.status === 'Selesai' && wo.total > 0 ? (
                      hasPermission('invoice:create') && (
                        <button
                          onClick={() => handleOpenInvoiceModal(wo)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                          title="Buat Faktur dari Order Kerja"
                        >
                          <Receipt className="w-4 h-4" />
                          Buat Faktur
                        </button>
                      )
                    ) : (wo.status === 'Register' || wo.status === 'Proses' || (wo.status === 'Selesai' && wo.total <= 0)) ? (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-500"
                        title="Tombol faktur tersedia setelah status WO menjadi Selesai"
                      >
                        <Receipt className="h-3.5 w-3.5" />
                        {wo.status === 'Selesai' && wo.total <= 0 ? 'Lengkapi layanan & harga' : 'Selesaikan WO untuk membuat faktur'}
                      </span>
                    ) : null}
                    {hasPermission('wo:create')
                      && wo.status === 'Register'
                      && !wo.continuedToWoId
                      && wo.branchId !== activeBranchId && (
                      <button
                        onClick={() => setContinueWO(wo)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300 bg-cyan-50 px-2.5 py-1.5 text-xs font-semibold text-cyan-700 transition-colors hover:bg-cyan-100"
                        title="Buat WO baru di cabang ini, tarik data pengecekan"
                      >
                        <ArrowLeftRight className="h-3.5 w-3.5" /> Lanjutkan di Sini
                      </button>
                    )}
                    {wo.status !== 'Closed' && <button
                      type="button"
                      onClick={() => void copyWorkOrder(wo)}
                      className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                      title="Salin ringkasan WO"
                    >
                      <Copy className="h-3.5 w-3.5" /> Salin
                    </button>}
                    {wo.status !== 'Closed' && <button
                      type="button"
                      onClick={() => shareWorkOrderToWhatsApp(wo)}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                      title="Bagikan WO ke WhatsApp"
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </button>}
                    <button
                      type="button"
                      onClick={() => openDetailTab(wo)}
                      className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-100 hover:text-blue-700"
                      title={wo.status === 'Closed' ? 'Lihat detail Lost Sales' : 'Lihat detail WO'}
                      aria-label={`Lihat detail ${wo.woNumber}`}
                    >
                      <Eye className="h-5 w-5" />
                    </button>
                    {hasPermission('wo:edit') && wo.status !== 'Closed' && !wo.invoiceId && (
                      <button
                        onClick={() => handleOpenModal(wo)}
                        className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    )}
                    {hasPermission('wo:delete') && ['Register', 'Selesai'].includes(wo.status) && !wo.invoiceId && (
                      <button
                        onClick={() => void handleDelete(wo)}
                        className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                        title="Hapus"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Pelanggan</p>
                    <p className="text-gray-900">{wo.customerName}</p>
                    <p className="text-xs text-gray-500">{customerPhoneForWO(wo)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">Kendaraan</p>
                    <p className="text-gray-900">{wo.vehicleInfo}</p>
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Layanan ({wo.services.length})</p>
                  <div className="space-y-2">
                    {wo.services.map((service) => (
                      <div key={service.id} className="flex items-center justify-between text-sm">
                        <div>
                          <span className="font-medium text-gray-900">{service.name}</span>
                          <span className="text-gray-500 ml-2">x{service.qty}</span>
                        </div>
                        <span className="text-gray-900 font-medium">
                          Rp {(service.price * service.qty).toLocaleString('id-ID')}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
                    <span className="font-semibold text-gray-900">Total</span>
                    <span className="text-xl font-bold text-blue-600">
                      Rp {wo.total.toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>

                {wo.continuedToWoNumber && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-slate-300 bg-slate-100 p-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-600" />
                    <p className="text-xs text-slate-700">
                      Pengecekan ini <strong>sudah dilanjutkan</strong> di{' '}
                      <strong className="font-mono">{wo.continuedToWoNumber}</strong> ({wo.continuedToBranchName}).
                      WO ini tidak perlu ditagih.
                    </p>
                  </div>
                )}

                {wo.continuedFromWoNumber && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-cyan-200 bg-cyan-50 p-3">
                    <ArrowLeftRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-cyan-600" />
                    <p className="text-xs text-cyan-800">
                      Lanjutan dari pengecekan <strong className="font-mono">{wo.continuedFromWoNumber}</strong>
                      {' '}di <strong>{wo.continuedFromBranchName}</strong>. Keluhan & hasil pemeriksaan sudah tersalin.
                    </p>
                  </div>
                )}

                {wo.status === 'Register' && !wo.continuedToWoId && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <CalendarClock className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                    <p className="text-xs text-amber-800">
                      <strong>Register</strong> — tambahkan layanan dan harga sebelum pekerjaan disetujui.
                    </p>
                  </div>
                )}

                {(wo.description || wo.notes) && (
                  <div className="mt-4 space-y-2">
                    {wo.description && (
                      <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                        <p className="text-sm text-gray-700">
                          <span className="font-medium text-blue-700">Keterangan:</span> {wo.description}
                        </p>
                      </div>
                    )}
                    {wo.notes && (
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-600">
                          <span className="font-medium">Catatan:</span> {wo.notes}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      </>}

      {/* Detail WO: layar penuh di HP, subtab penuh di desktop. */}
      {detailWO && (
        <div className="fixed inset-0 z-50 block lg:static lg:z-auto lg:px-3 lg:pb-3" role="dialog" aria-modal="true">
          <aside className="absolute inset-0 flex w-full flex-col bg-white shadow-2xl lg:static lg:max-h-[calc(100vh-205px)] lg:min-h-[560px] lg:overflow-hidden lg:rounded-md lg:border lg:border-gray-200 lg:shadow-sm">
            <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-6 lg:px-3 lg:py-2.5">
              <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1">
                <span className="text-xs text-gray-500">Nomor: <strong className="font-mono text-gray-900">{detailWO.woNumber}</strong></span>
                <span className="text-xs text-gray-500">Cabang: <strong className="text-gray-900">{data.branches.find(b => b.id === detailWO.branchId)?.name}</strong></span>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusColors[detailWO.status] || 'bg-gray-100 text-gray-700'}`}>{statusLabel(detailWO.status)}</span>
                {(detailWO.invoiceId || detailWO.invoiceNumber) && (
                  <button type="button" onClick={() => openLinkedInvoice(detailWO)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 hover:underline" title="Buka faktur terkait">
                    <FileText className="h-3.5 w-3.5" /> Faktur: {detailWO.invoiceNumber || 'Buka Faktur'}
                  </button>
                )}
              </div>
              <div className="hidden shrink-0 items-center gap-2 lg:flex">
                <details data-wo-action-menu className={`group relative ${statusLabel(detailWO.status) === 'Lost Sales' || detailWO.invoiceId ? 'pointer-events-none opacity-50' : ''}`} onToggle={handleActionMenuToggle} onBlur={handleActionMenuBlur} onKeyDown={handleActionMenuKeyDown}>
                  <summary aria-disabled={statusLabel(detailWO.status) === 'Lost Sales' || Boolean(detailWO.invoiceId)} tabIndex={statusLabel(detailWO.status) === 'Lost Sales' || detailWO.invoiceId ? -1 : 0} className="flex h-9 cursor-pointer list-none items-center gap-1 rounded-md border border-blue-500 bg-white px-3 text-sm font-medium text-blue-700 hover:bg-blue-50">Ambil <span className="text-xs">⌄</span></summary>
                  <div onClick={closeActionMenuAfterChoice} className="absolute right-0 z-50 mt-1 w-60 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-xl">
                    <button type="button" onClick={() => takeServicesFromPreviousWO(detailWO)} className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50"><strong className="block">Layanan WO Sebelumnya</strong><span className="text-xs text-gray-500">Salin layanan kendaraan ini</span></button>
                    <button type="button" onClick={() => openFavoriteServicesForWO(detailWO)} className="block w-full border-t border-gray-100 px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50"><strong className="block">Paket / Layanan Favorit</strong><span className="text-xs text-gray-500">Pilih dari quick service</span></button>
                  </div>
                </details>
                <details data-wo-action-menu className="group relative" onToggle={handleActionMenuToggle} onBlur={handleActionMenuBlur} onKeyDown={handleActionMenuKeyDown}>
                  <summary className="flex h-9 cursor-pointer list-none items-center gap-1 rounded-md border border-blue-500 bg-white px-3 text-sm font-medium text-blue-700 hover:bg-blue-50">Proses <span className="text-xs">⌄</span></summary>
                  <div onClick={closeActionMenuAfterChoice} className="absolute right-0 z-50 mt-1 w-64 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-xl">
                    {detailWO.status === 'Register' && <><button type="button" disabled={!detailWO.services.length || detailWO.total <= 0} onClick={() => requestStatusChange(detailWO, 'Proses')} className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 disabled:text-gray-300">Mulai Dikerjakan</button><button type="button" onClick={() => requestStatusChange(detailWO, 'Closed')} className="block w-full px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50">Batalkan / Lost Sales</button></>}
                    {detailWO.status === 'Proses' && <><button type="button" onClick={() => openCompletionModal(detailWO)} className="block w-full px-3 py-2 text-left text-sm text-emerald-700 hover:bg-emerald-50">Tandai Selesai</button><button type="button" onClick={() => requestStatusChange(detailWO, 'Closed')} className="block w-full px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50">Batalkan Pekerjaan / Lost Sales</button></>}
                    {detailWO.status === 'Selesai' && !detailWO.invoiceId && <>{hasPermission('invoice:create') && detailWO.total > 0 && <button type="button" onClick={() => handleOpenInvoiceModal(detailWO)} className="block w-full px-3 py-2 text-left text-sm font-medium text-emerald-700 hover:bg-emerald-50">Buat Faktur</button>}<button type="button" onClick={() => void handleReopenCompletedWorkOrder(detailWO)} className="block w-full px-3 py-2 text-left text-sm text-orange-700 hover:bg-orange-50">Kembali ke Dikerjakan</button><button type="button" onClick={() => requestStatusChange(detailWO, 'Closed')} className="block w-full px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50">Batalkan / Lost Sales</button></>}
                    {detailWO.invoiceId && <><button type="button" onClick={() => openLinkedInvoice(detailWO)} className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50">Lihat Faktur</button><button type="button" onClick={() => window.location.assign(`/customer-payments?invoiceId=${encodeURIComponent(detailWO.invoiceId || '')}`)} className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50">Proses Pembayaran</button></>}
                    {detailWO.status === 'Closed' && <button type="button" onClick={() => setLostSalesFollowUp(detailWO)} className="block w-full px-3 py-2 text-left text-sm text-blue-700 hover:bg-blue-50">Tindak Lanjut Lost Sales</button>}
                  </div>
                </details>
                <button type="button" disabled={Boolean(detailWO.invoiceId) || statusLabel(detailWO.status) === 'Lost Sales' || !hasPermission('wo:edit')} onClick={() => handleOpenModal(detailWO, true)} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"><Save className="h-4 w-4" /> Simpan</button>
                <button onClick={() => closeDetailTab(detailWO.id)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" title="Tutup tab WO"><X className="h-5 w-5" /></button>
              </div>
              <button onClick={() => closeDetailTab(detailWO.id)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden" title="Tutup tab WO"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-6 lg:p-3">
              <div className="grid grid-cols-1 gap-3 rounded border border-gray-200 p-3 lg:grid-cols-[minmax(210px,1fr)_minmax(210px,1fr)_230px]">
                <div>
                  <p className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-700"><User className="h-4 w-4 text-blue-600" /> Data Pelanggan <LockKeyhole className="ml-auto h-3.5 w-3.5 text-gray-400" /></p>
                  <div className="flex h-[42px] items-center rounded-lg border border-gray-300 bg-gray-100 px-3 text-sm text-gray-700"><span className="min-w-0 truncate"><strong>{detailWO.customerName}</strong>{customerPhoneForWO(detailWO) && <span className="ml-2 text-xs text-gray-500">{customerPhoneForWO(detailWO)}</span>}</span></div>
                </div>
                <div>
                  <p className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-700"><Car className="h-4 w-4 text-orange-600" /> Data Kendaraan <LockKeyhole className="ml-auto h-3.5 w-3.5 text-gray-400" /></p>
                  <div className="flex h-[42px] items-center rounded-lg border border-gray-300 bg-gray-100 px-3 text-sm text-gray-700"><span className="min-w-0 truncate"><strong>{detailWO.plateNumber}</strong><span className="ml-2 text-xs text-gray-500">{detailWO.vehicleInfo}</span></span></div>
                </div>
                <div>
                  <p className="mb-1 block text-sm font-medium text-gray-700">Tanggal &amp; Waktu</p>
                  <div className="grid grid-cols-[minmax(0,1fr)_108px] gap-2"><div className="flex h-[42px] items-center rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm font-medium text-gray-700">{detailWO.date}</div><div className="flex h-[42px] items-center rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm font-medium text-gray-700">{detailWO.transactionTime?.slice(0, 5) || '-'}</div></div>
                </div>
              </div>
              <div className="rounded border border-gray-200 bg-white p-3">
                <div className="mb-2 flex items-center gap-2">
                  <button type="button" disabled={!hasPermission('wo:edit') || detailWO.status === 'Closed' || Boolean(detailWO.invoiceId)} onClick={() => handleOpenModal(detailWO, true)} className="relative max-w-xl flex-1 text-left disabled:cursor-default"><span className="flex h-10 w-full items-center rounded-lg border border-gray-300 bg-white py-2.5 pl-3 pr-10 text-sm text-gray-500">Cari/Pilih Barang dan Jasa</span><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /></button>
                  <strong className="ml-auto shrink-0 text-sm text-gray-700">{detailWO.services.length} Barang/Jasa</strong>
                </div>
                <div className="overflow-hidden rounded border border-gray-200">
                <div className="divide-y divide-gray-100 sm:hidden">
                  {detailWO.services.filter(service => !isPackageMemberService(service)).map(service => (
                    <div key={service.id} className="flex items-center justify-between px-4 py-3 text-sm">
                      <button type="button" onClick={() => openLinkedItem(service)} className="min-w-0 text-left text-blue-700 hover:underline"><strong>{serviceReceiptName(service)}</strong> <span className="text-gray-500">×{service.qty}</span></button>
                      <span className="font-medium">Rp {(service.price * service.qty).toLocaleString('id-ID')}</span>
                    </div>
                  ))}
                </div>
                <table className="hidden w-full min-w-[720px] text-sm sm:table">
                  <thead className="bg-slate-600 text-xs uppercase text-white"><tr><th className="w-12 px-3 py-2.5 text-center">No</th><th className="px-3 py-2.5 text-left">Nama Barang/Jasa</th><th className="w-40 px-3 py-2.5 text-left">Barcode / Kode</th><th className="w-24 px-3 py-2.5 text-center">Qty</th><th className="w-40 px-3 py-2.5 text-right">Harga</th><th className="w-40 px-3 py-2.5 text-right">Total Harga</th><th className="w-14 px-3 py-2.5 text-center">Aksi</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {detailWO.services.length > 0 ? detailWO.services.map((service, index) => {
                      if (isPackageMemberService(service)) return null;
                      const members = isPackageHeaderService(service) ? packageMembersAfterService(detailWO.services, index) : [];
                      return <tr key={service.id} className={members.length ? 'bg-purple-50' : 'hover:bg-blue-50/40'}><td className="px-3 py-2.5 text-center text-xs text-gray-400">{detailWO.services.slice(0, index).filter(row => !isPackageMemberService(row)).length + 1}</td><td className="px-3 py-2.5"><button type="button" onClick={() => openLinkedItem(service)} className="block max-w-full text-left hover:underline"><strong className="text-blue-700">{serviceReceiptName(service)}</strong><span className="block font-mono text-[10px] text-blue-500">{serviceItemCode(service)}</span></button>{members.length > 0 && <div className="mt-1 space-y-0.5 border-l-2 border-purple-200 pl-2 text-[10px] text-purple-700">{members.map(member => <button type="button" key={member.id} onClick={() => openLinkedItem(member)} className="block max-w-full text-left hover:underline"><span className="font-mono text-purple-500">{serviceItemCode(member)}</span> · {serviceReceiptName(member)} ×{member.qty}</button>)}</div>}</td><td className="px-3 py-2.5 font-mono text-xs text-gray-600"><button type="button" onClick={() => openLinkedItem(service)} className="hover:text-blue-700 hover:underline">{serviceBarcodeOrCode(service)}</button></td><td className="px-3 py-2.5 text-center">{service.qty}</td><td className="px-3 py-2.5 text-right">Rp {service.price.toLocaleString('id-ID')}</td><td className="px-3 py-2.5 text-right font-semibold">Rp {(service.price * service.qty).toLocaleString('id-ID')}</td><td className="px-3 py-2.5 text-center">{hasPermission('wo:edit') && detailWO.status !== 'Closed' && !detailWO.invoiceId && <button type="button" onClick={() => handleOpenModal(detailWO, true)} className="rounded p-1.5 text-blue-600 hover:bg-blue-50" title="Edit layanan"><Edit className="h-4 w-4" /></button>}</td></tr>;
                    }) : <tr><td colSpan={7} className="h-40 text-center text-sm text-gray-400">Belum ada layanan atau barang.</td></tr>}
                  </tbody>
                </table></div>
              </div>
              {(statusLabel(detailWO.status) === 'Selesai' || detailWO.findings || diagnosisMeasurementLabel(detailWO)) && (
                <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
                  <h4 className="font-semibold text-cyan-900">Keterangan Hasil Kerja</h4>
                  {diagnosisMeasurementLabel(detailWO) && <p className="mt-2 text-sm font-semibold text-cyan-800">{diagnosisMeasurementLabel(detailWO)}</p>}
                  <p className="mt-2 whitespace-pre-wrap text-sm text-cyan-900">{detailWO.findings?.trim() || 'Belum ada keterangan hasil kerja.'}</p>
                </div>
              )}
              <div className="grid items-stretch gap-3 md:grid-cols-[minmax(280px,1fr)_minmax(360px,460px)]">
                <textarea readOnly rows={2} value={detailWO.description || ''} placeholder="Keluhan / keterangan service" className="h-[88px] w-full resize-none rounded border border-gray-300 bg-white px-3 py-2 text-sm leading-5 text-gray-700 outline-none" />
                <div className="grid h-[88px] grid-cols-2 rounded border border-gray-300 bg-white p-2 shadow-sm"><div className="flex flex-col justify-between px-3 py-1"><span className="text-sm text-gray-600">Jumlah Item</span><strong className="text-right text-lg tabular-nums">{detailWO.services.length}</strong></div><div className="flex flex-col justify-between border-l border-gray-200 px-3 py-1"><span className="text-sm text-gray-600">Total Estimasi</span><strong className="text-right text-lg tabular-nums text-blue-700">Rp {detailWO.total.toLocaleString('id-ID')}</strong></div></div>
              </div>
              {detailWO.notes && <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700"><strong>Catatan:</strong> {detailWO.notes}</div>}
              <details className="rounded border border-gray-200 bg-white">
                <summary className="flex cursor-pointer list-none items-center gap-2 p-3 font-semibold text-gray-900">
                  <Clock3 className="h-5 w-5 text-blue-600" />
                  <span>Timeline WO</span>
                  {financialTimelineLoading && <span className="ml-auto text-xs text-gray-400">Memuat transaksi…</span>}
                </summary>
                <div className="relative mx-4 mb-4 ml-6 border-l-2 border-gray-200 pl-6">
                  {workOrderAuditTimeline(detailWO).map((event, index) => (
                    <div key={`${event.at}-${event.title}-${index}`} className="relative pb-5 last:pb-0">
                      <span className={`absolute -left-[31px] top-1 h-3 w-3 rounded-full ring-4 ring-white ${event.tone}`} />
                      <div className="flex items-start gap-2">
                        {event.continuation && <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />}
                        <div><p className="font-semibold text-gray-900">{event.title}</p><p className="text-sm text-gray-600">{event.description}</p><p className="mt-1 text-xs text-gray-400">{formatAuditTime(event.at)}</p></div>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </div>
            <div className="flex flex-shrink-0 flex-wrap justify-end gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3 sm:px-6 sm:py-4 lg:hidden">
              {hasPermission('wo:edit') && detailWO.status === 'Register' && !detailWO.continuedToWoId && (
                <>
                  <button onClick={() => { handleOpenDiagnosis(detailWO); setDetailWO(null); }} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">{detailWO.services.length ? 'Edit Layanan' : '+ Tambah Layanan'}</button>
                  {detailWO.services.length > 0 && detailWO.total > 0 && <button onClick={() => { requestStatusChange(detailWO, 'Proses'); setDetailWO(null); }} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Setuju · Dikerjakan</button>}
                </>
              )}
              {hasPermission('wo:edit') && detailWO.status === 'Proses' && (
                <>
                  <button onClick={() => { handleOpenModal(detailWO, true); setDetailWO(null); }} className="rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">Tambah/Edit Layanan</button>
                  <button onClick={() => openCompletionModal(detailWO)} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">Tandai Selesai</button>
                  <button
                    onClick={() => { requestStatusChange(detailWO, 'Closed'); setDetailWO(null); }}
                    className="rounded-lg border border-red-700 bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700"
                    style={{ backgroundColor: '#dc2626', borderColor: '#b91c1c', color: '#ffffff' }}
                  >
                    Batalkan Pekerjaan
                  </button>
                </>
              )}
              {hasPermission('invoice:create') && detailWO.status === 'Selesai' && !detailWO.invoiceId && detailWO.total > 0 && (
                <button onClick={() => { handleOpenInvoiceModal(detailWO); setDetailWO(null); }} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">Buat Faktur</button>
              )}
              {hasPermission('wo:edit') && detailWO.status === 'Selesai' && !detailWO.invoiceId && (
                <button onClick={() => { requestStatusChange(detailWO, 'Closed'); setDetailWO(null); }} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">Batalkan / Lost Sales</button>
              )}
              {hasPermission('wo:edit') && detailWO.status === 'Closed' && !detailWO.continuedToWoId && (
                <button onClick={() => setLostSalesFollowUp(detailWO)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Tindak Lanjut</button>
              )}
              {hasPermission('wo:edit') && detailWO.status === 'Register' && <button onClick={() => { handleOpenModal(detailWO); setDetailWO(null); }} className="rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">Edit WO</button>}
              <button onClick={() => closeDetailTab(detailWO.id)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100">Tutup</button>
              {hasPermission('wo:edit') && detailWO.status === 'Selesai' && !detailWO.invoiceId && (
                <button onClick={() => { const selected = detailWO; setDetailWO(null); void handleReopenCompletedWorkOrder(selected); }} className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-orange-300 bg-white text-orange-700 hover:bg-orange-50" title="Kembali ke Dikerjakan" aria-label={`Kembalikan ${detailWO.woNumber} ke Dikerjakan`}><Undo2 className="h-5 w-5" /></button>
              )}
              {hasPermission('wo:edit') && detailWO.status === 'Register' && !detailWO.continuedToWoId && (
                <button
                  onClick={() => { requestStatusChange(detailWO, 'Closed'); setDetailWO(null); }}
                  className="rounded-lg border border-red-700 bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700"
                  style={{ backgroundColor: '#dc2626', borderColor: '#b91c1c', color: '#ffffff' }}
                >
                  Lost Sales
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      {lostSalesFollowUp && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-gradient-to-r from-rose-600 to-orange-500 px-5 py-4 text-white">
              <div>
                <h3 className="font-bold">Tindak Lanjut Lost Sales</h3>
                <p className="mt-0.5 font-mono text-xs text-rose-100">{lostSalesFollowUp.woNumber}</p>
              </div>
              <button type="button" onClick={() => setLostSalesFollowUp(null)} className="rounded-lg p-2 hover:bg-white/20" aria-label="Tutup"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4 p-5">
              <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                <p className="font-semibold text-gray-900">{lostSalesFollowUp.customerName}</p>
                <p>{lostSalesFollowUp.plateNumber} · {lostSalesFollowUp.vehicleInfo}</p>
                <p className="mt-2 text-xs text-gray-500">Alasan Lost Sales: {lostSalesFollowUp.cancelReason || '-'}</p>
              </div>
              <p className="text-sm font-semibold text-gray-800">Apakah keluhan pelanggan masih masalah yang sama?</p>
              <button type="button" disabled={isFollowingUpLostSales} onClick={() => void continueLostSalesSameIssue()} className="w-full rounded-xl border border-blue-200 bg-blue-50 p-4 text-left transition-colors hover:bg-blue-100 disabled:opacity-50">
                <span className="block font-semibold text-blue-900">{lostSalesFollowUp.services.length > 0 && lostSalesFollowUp.total > 0 ? 'Masalah sama — lanjut dikerjakan' : 'Masalah sama — lengkapi layanan & estimasi'}</span>
                <span className="mt-1 block text-xs text-blue-700">{lostSalesFollowUp.services.length > 0 && lostSalesFollowUp.total > 0 ? 'Gunakan WO ini beserta diagnosa dan estimasi lama. Status menjadi Dikerjakan.' : 'WO ini belum memiliki layanan berbayar. Lengkapi layanan dan harga terlebih dahulu.'}</span>
              </button>
              <button type="button" disabled={isFollowingUpLostSales} onClick={() => void continueLostSalesDifferentIssue()} className="w-full rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-left transition-colors hover:bg-emerald-100 disabled:opacity-50">
                <span className="block font-semibold text-emerald-900">Masalah berbeda — buat WO baru</span>
                <span className="mt-1 block text-xs text-emerald-700">Pelanggan dan kendaraan disalin; keluhan, diagnosa, layanan, dan estimasi dimulai kosong.</span>
              </button>
              <button type="button" disabled={isFollowingUpLostSales} onClick={() => setLostSalesFollowUp(null)} className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Batal</button>
            </div>
          </div>
        </div>
      )}
      {/* Data Baru / Edit: subtab penuh pada desktop, modal pada mobile */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 p-0 sm:items-center sm:p-4 lg:static lg:z-auto lg:block lg:bg-transparent lg:px-3 lg:pb-3 lg:pt-0">
          <div className="flex h-[100dvh] max-h-[100dvh] w-full max-w-3xl flex-col overflow-hidden rounded-none bg-white shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-xl lg:block lg:h-auto lg:max-h-none lg:max-w-none lg:overflow-visible lg:rounded-md lg:border lg:border-gray-200 lg:shadow-sm">
            <div className="z-30 flex flex-shrink-0 items-start justify-between border-b border-gray-200 bg-white px-4 py-3 sm:rounded-t-xl sm:px-6 sm:py-4 lg:hidden">
              <div className="min-w-0 pr-3">
                <h3 className="break-words text-base font-semibold leading-tight text-gray-900 sm:text-lg">
                  {diagnosisMode && editingWO ? `DIAGNOSA ${editingWO.woNumber}` : serviceEditMode && editingWO ? `EDIT PEKERJAAN ${editingWO.woNumber}` : isAutoRegisteredDraft && editingWO ? editingWO.woNumber : editingWO ? 'Edit Registrasi WO' : 'Register Baru'}
                </h3>
                <p className="mt-1 text-xs leading-snug text-gray-500 sm:text-sm">{diagnosisMode ? 'Isi hasil pemeriksaan dan estimasi layanan' : serviceEditMode ? 'Tambah atau ubah layanan sebelum dibuatkan faktur' : isAutoRegisteredDraft ? 'WO sudah terdaftar. Tambahkan layanan lalu simpan.' : 'Pilih pelanggan, kendaraan, dan isi keluhan untuk Register WO'}</p>
              </div>
              <button
                onClick={handleCloseModal}
                className="flex-shrink-0 rounded-lg p-2 transition-colors hover:bg-gray-100"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:space-y-6 sm:p-6 lg:space-y-3 lg:overflow-visible lg:p-3">
              <div className="hidden items-center justify-between gap-4 border-b border-gray-200 bg-white pb-2 lg:sticky lg:top-0 lg:z-40 lg:flex">
                <div className="flex min-w-0 items-center gap-5 text-xs text-gray-500">
                  <span>Nomor: <strong className="text-gray-900">{editingWO?.woNumber || 'Otomatis saat Register'}</strong></span>
                  <span>Cabang: <strong className="text-gray-900">{data.branches.find(branch => branch.id === (editingWO?.branchId || resolveBranchId()))?.name || 'Pilih cabang'}</strong></span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {editingWO && <details data-wo-action-menu className={`group relative ${statusLabel(editingWO.status) === 'Lost Sales' || editingWO.invoiceId ? 'pointer-events-none opacity-50' : ''}`} onToggle={handleActionMenuToggle} onBlur={handleActionMenuBlur} onKeyDown={handleActionMenuKeyDown}>
                    <summary aria-disabled={statusLabel(editingWO.status) === 'Lost Sales' || Boolean(editingWO.invoiceId)} tabIndex={statusLabel(editingWO.status) === 'Lost Sales' || editingWO.invoiceId ? -1 : 0} className="flex cursor-pointer list-none items-center gap-2 rounded-md border border-blue-500 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50">
                      Ambil <span className="text-xs transition-transform group-open:rotate-180">⌄</span>
                    </summary>
                    <div onClick={closeActionMenuAfterChoice} className="absolute right-0 z-50 mt-1 w-60 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-xl">
                      <button type="button" onClick={takePreviousServicesIntoForm} className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700">
                        Layanan WO Sebelumnya
                      </button>
                      <button type="button" onClick={() => setShowQuickServices(true)} className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700">
                        Paket/Layanan Favorit
                      </button>
                    </div>
                  </details>}

                  {editingWO && <details data-wo-action-menu className="group relative" onToggle={handleActionMenuToggle} onBlur={handleActionMenuBlur} onKeyDown={handleActionMenuKeyDown}>
                    <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md border border-blue-500 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50">
                      Proses <span className="text-xs transition-transform group-open:rotate-180">⌄</span>
                    </summary>
                    <div onClick={closeActionMenuAfterChoice} className="absolute right-0 z-50 mt-1 w-64 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-xl">
                      {editingWO?.status === 'Register' && (
                        <>
                          <button
                            type="submit"
                            onClick={() => { diagnosisSubmitAction.current = 'process'; }}
                            className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700"
                          >
                            Mulai Dikerjakan
                          </button>
                          <button
                            type="button"
                            onClick={() => requestStatusChange(editingWO, 'Closed')}
                            className="block w-full px-3 py-2 text-left text-sm font-medium text-rose-600 hover:bg-rose-50"
                          >
                            Batalkan / Lost Sales
                          </button>
                        </>
                      )}
                      {editingWO?.status === 'Proses' && (
                        <>
                          <button type="button" onClick={() => openCompletionModal(editingWO)} className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-green-50 hover:text-green-700">Tandai Selesai</button>
                          <button type="button" onClick={() => requestStatusChange(editingWO, 'Closed')} className="block w-full px-3 py-2 text-left text-sm font-medium text-rose-600 hover:bg-rose-50">Batalkan Pekerjaan / Lost Sales</button>
                        </>
                      )}
                      {editingWO?.status === 'Selesai' && !editingWO.invoiceId && (
                        <>
                          <button type="button" onClick={() => handleOpenInvoiceModal(editingWO)} className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-green-50 hover:text-green-700">Buat Faktur</button>
                          <button type="button" onClick={() => handleReopenCompletedWorkOrder(editingWO)} className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700">Kembali ke Dikerjakan</button>
                          <button type="button" onClick={() => requestStatusChange(editingWO, 'Closed')} className="block w-full px-3 py-2 text-left text-sm font-medium text-rose-600 hover:bg-rose-50">Batalkan / Lost Sales</button>
                        </>
                      )}
                    </div>
                  </details>}

                  <button
                    type="submit"
                    onClick={() => { diagnosisSubmitAction.current = 'save'; }}
                    className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                    disabled={editingWO ? statusLabel(editingWO.status) === 'Lost Sales' : (!newWOReadyForRegister || isAutoRegistering)}
                  >
                    {editingWO ? <Save className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                    {editingWO ? 'Simpan' : isAutoRegistering ? 'Meregister...' : 'Register'}
                  </button>
                </div>
              </div>
              {/* Blok simpan jika masih Semua Cabang */}
              {currentBranchId === 'ALL' && !editingWO && (
                <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 flex items-start gap-3">
                  <Building2 className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-amber-800">Pilih cabang aktif dulu</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Anda sedang dalam mode <strong>Semua Cabang</strong>. WO tidak bisa disimpan tanpa cabang tertentu.
                      Tutup form ini, pilih cabang di header (Perintis / Cakalang / Mamuju), lalu buat WO baru.
                    </p>
                  </div>
                </div>
              )}
              {(diagnosisMode || serviceEditMode) && editingWO ? (
                <div className="space-y-3">
                  <div className="relative grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm md:grid-cols-2">
                    <div><span className="block text-xs font-semibold uppercase text-slate-500">Pelanggan</span><strong>{editingWO.customerName}</strong><span className="ml-2 text-slate-500">{customerPhoneForWO(editingWO)}</span></div>
                    <div><span className="block text-xs font-semibold uppercase text-slate-500">Tanggal masuk</span><strong>{editingWO.date}</strong></div>
                    <div><span className="block text-xs font-semibold uppercase text-slate-500">Kendaraan</span><strong>{editingWO.vehicleInfo}</strong><span className="ml-2 font-mono text-blue-700">{editingWO.plateNumber}</span></div>
                    <div className="md:col-span-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2"><span className="block text-xs font-semibold uppercase text-blue-600">Keluhan awal</span><strong className="mt-0.5 block whitespace-pre-wrap text-slate-900">{editingWO.description || '-'}</strong></div>
                    {serviceEditMode && (
                      <button type="button" onClick={() => setServiceEditMode(false)} className="absolute right-3 top-3 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50">
                        Edit Data Registrasi
                      </button>
                    )}
                  </div>
                </div>
              ) : <>
              {/* Pelanggan dan tanggal */}
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(210px,1fr)_minmax(210px,1fr)_310px]">
                <div>
                  <label className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-700">
                    <User className="h-4 w-4 text-blue-600" />
                    Data Pelanggan <span className="text-red-500">*</span>
                  </label>
                  <CustomerPicker
                    value={formData.customerRefId}
                    onChange={handleCustomerSelect}
                    onNewCustomerCreated={handleNewCustomerCreated}
                    disabled={customerVehicleLocked}
                  />
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-700">
                    <Car className="h-4 w-4 text-orange-600" />
                    Data Kendaraan <span className="text-red-500">*</span>
                  </label>
                  <VehiclePicker
                    customer={selectedCustomer}
                    value={formData.vehicleRefId}
                    onChange={handleVehicleSelect}
                    onNewVehicleCreated={handleNewVehicleCreated}
                    locked={customerVehicleLocked}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tanggal & Waktu <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-[minmax(150px,1fr)_92px_40px] gap-2">
                    <input
                      type="date"
                      required
                      max={localDateKey()}
                      disabled={!woDateUnlocked}
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                    />
                    <input
                      type="time"
                      required
                      disabled={!woDateUnlocked}
                      value={formData.transactionTime}
                      onChange={(e) => setFormData({ ...formData, transactionTime: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-2 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                      aria-label="Waktu WO"
                    />
                    <button
                      type="button"
                      onClick={() => hasPermission('wo:backdate') ? setWoDateUnlocked(value => {
                        const next = !value;
                        if (!next) setFormData(current => ({ ...current, date: localDateKey(), transactionTime: localTimeKey() }));
                        return next;
                      }) : window.alert('Anda tidak memiliki hak Ubah Tanggal/Waktu WO.')}
                      className={`inline-flex h-[42px] w-10 items-center justify-center rounded-lg border transition-colors ${woDateUnlocked ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-blue-600 hover:bg-blue-50'}`}
                      title={woDateUnlocked ? 'Kunci ke tanggal dan waktu sekarang' : 'Buka tanggal dan waktu mundur'}
                      aria-label={woDateUnlocked ? 'Kunci tanggal dan waktu WO' : 'Buka tanggal dan waktu mundur'}
                    >
                      {woDateUnlocked ? <LockKeyhole className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
              <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
                customerVehicleLocked
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : customerVehicleReady
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-amber-200 bg-amber-50 text-amber-700'
              }`}>
                {customerVehicleLocked ? <LockKeyhole className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                {customerVehicleLocked
                  ? `Pelanggan dan kendaraan sudah teregister${editingWO ? ` pada ${editingWO.woNumber}` : ''}.`
                  : customerVehicleReady
                    ? formData.description.trim()
                      ? 'Data siap. Tekan Register untuk membuat nomor WO.'
                      : 'Isi keluhan/keterangan service sebelum Register.'
                    : 'Pilih atau daftarkan pelanggan dan kendaraan sebelum Register.'}
              </div>
              {data.settings.security.requireBackdateReason !== false && formData.date < localDateKey() && (
                <div className="grid grid-cols-1 md:grid-cols-2"><span /><input required value={woBackdateReason} onChange={(e) => setWoBackdateReason(e.target.value)} placeholder="Alasan tanggal WO dimundurkan" className="w-full px-4 py-2.5 border border-amber-400 bg-amber-50 rounded-lg" /></div>
              )}

              {/* Kendaraan mengikuti pelanggan yang dipilih */}
              <div className="space-y-4">
                <div className="hidden">
                  <label className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                    <Car className="w-4 h-4 text-orange-600" />
                    Data Kendaraan <span className="text-red-500">*</span>
                  </label>
                  <VehiclePicker
                    customer={selectedCustomer}
                    value={formData.vehicleRefId}
                    onChange={handleVehicleSelect}
                    onNewVehicleCreated={handleNewVehicleCreated}
                  />
                </div>

                <div className={!isAutoRegisteredDraft ? '' : 'hidden'}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Keterangan / Keluhan
                      <span className="ml-1 text-xs font-normal text-gray-400">(pilih template atau ketik langsung)</span>
                    </label>
                    <button
                      type="button"
                      onClick={openComplaintEditor}
                      className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                      title="Edit daftar template keluhan"
                    >
                      <Edit className="h-3 w-3" /> Edit List
                    </button>
                  </div>
                  {/* Template keluhan cepat */}
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {complaintTemplates.map((template) => (
                      <button
                        key={template}
                        type="button"
                        onClick={() => setFormData(prev => ({
                          ...prev,
                          description: prev.description
                            ? prev.description + ', ' + template
                            : template
                        }))}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          formData.description.includes(template)
                            ? 'border-blue-400 bg-blue-100 text-blue-700'
                            : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700'
                        }`}
                      >
                        {template}
                      </button>
                    ))}
                    {formData.description && (
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, description: '' }))}
                        className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-500 hover:bg-red-100"
                      >
                        × Hapus
                      </button>
                    )}
                  </div>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Pilih template di atas atau ketik keluhan langsung..."
                    rows={2}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none text-sm"
                  />
                </div>
              </div>
              </>}

              {(diagnosisMode || serviceEditMode || editingWO) && <>
              {/* Layanan langsung tersedia pada WO baru; tetap dipakai saat diagnosa/edit pekerjaan. */}
              <div>
                <div className={editingWO && !isAutoRegisteredDraft ? 'mb-3' : 'hidden'}>
                  <label className="text-sm font-medium text-gray-700">{diagnosisMode ? 'Estimasi Layanan' : 'Pekerjaan / Layanan WO'}</label>
                </div>

                {showServiceForm && (
                  <div className="relative z-20 mb-4">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={toggleQuickServices}
                        disabled={!customerVehicleReady || isAutoRegistering}
                        className={`inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border transition-colors ${showQuickServices ? 'border-amber-400 bg-amber-100 text-amber-600' : 'border-gray-300 bg-white text-gray-500 hover:border-amber-300 hover:text-amber-500'}`}
                        title={showQuickServices ? 'Sembunyikan Quick Select' : 'Tampilkan Quick Select'}
                      >
                        <Star className={`h-5 w-5 ${showQuickServices ? 'fill-amber-400' : ''}`} />
                      </button>
                      <div className="relative flex-1">
                      <input
                        type="text"
                        value={serviceSearch}
                        onChange={(event) => setServiceSearch(event.target.value)}
                        onFocus={() => setServiceSearchFocused(true)}
                        onBlur={() => window.setTimeout(() => setServiceSearchFocused(false), 150)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' || !serviceSearch.trim()) return;
                          event.preventDefault();
                          const query = serviceSearch.trim().toLowerCase();
                          const matchingItems = availableServiceItems.filter(item =>
                            item.code.toLowerCase().includes(query)
                            || (item.barcode || '').toLowerCase().includes(query)
                            || item.name.toLowerCase().includes(query)
                            || (item.receiptDescription || '').toLowerCase().includes(query)
                            || item.categoryName.toLowerCase().includes(query)
                          );
                          const selectedItem = matchingItems.find(item =>
                            item.code.toLowerCase() === query
                            || (item.barcode || '').toLowerCase() === query
                            || item.name.toLowerCase() === query
                          ) || matchingItems[0];
                          if (selectedItem) {
                            handleUseItem(selectedItem.id);
                            setServiceSearch('');
                            setServiceSearchFocused(false);
                          }
                        }}
                        autoFocus
                        disabled={!customerVehicleReady || isAutoRegistering}
                        placeholder={customerVehicleReady ? (isAutoRegistering ? 'Meregistrasikan WO...' : 'Cari/Pilih Barang dan Jasa') : 'Pilih pelanggan dan kendaraan terlebih dahulu'}
                        className="w-full rounded-lg border border-blue-400 py-2.5 pl-3 pr-10 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-100 disabled:text-gray-500"
                      />
                      {isServiceSearching ? (
                        <RefreshCw className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-blue-600" />
                      ) : (
                        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      )}
                      {serviceSearchFocused && serviceSearch.trim() && (
                        <div className="absolute -left-12 top-full z-50 mt-1 max-h-[min(18rem,42dvh)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-lg border border-gray-200 bg-white shadow-2xl sm:left-0 sm:right-0 sm:w-auto sm:max-w-none">
                          {availableServiceItems.filter(item => {
                            const query = serviceSearch.toLowerCase().trim();
                            return item.code.toLowerCase().includes(query) || (item.barcode || '').toLowerCase().includes(query) || item.name.toLowerCase().includes(query) || (item.receiptDescription || '').toLowerCase().includes(query) || item.categoryName.toLowerCase().includes(query);
                          }).slice(0, 12).map(item => {
                            const added = isItemAdded(item.id);
                            return (
                              <button
                                key={item.id}
                                type="button"
                                disabled={added}
                                onClick={() => {
                                  if (added) return;
                                  handleUseItem(item.id);
                                  setServiceSearch('');
                                  setServiceSearchFocused(false);
                                }}
                                className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b border-gray-100 px-3 py-2.5 text-left last:border-0 ${added ? 'cursor-not-allowed bg-green-50 opacity-60' : 'active:bg-blue-100 hover:bg-blue-50'}`}
                              >
                                <ItemSearchOption name={item.name} code={item.code} selected={added}/>
                                {added && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      </div>
                      {hasPermission('item:create') && (
                        <button type="button" disabled={!customerVehicleReady || isAutoRegistering} onClick={() => setShowQuickAddItem(true)} className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center gap-1 rounded-lg border border-green-300 text-sm font-medium text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 sm:w-auto sm:px-3">
                          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Baru</span>
                        </button>
                      )}
                      {!editingWO && <strong className="hidden shrink-0 text-sm text-gray-700 lg:block">{formData.services.filter(service => !isPackageMemberService(service)).length} Barang/Jasa</strong>}
                    </div>
                    {showQuickServices && (
                      <div className="mt-2 flex flex-wrap gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
                        {availableServiceItems.filter(item => item.isQuickService).map(item => {
                          const added = isItemAdded(item.id);
                          return (
                            <button
                              key={item.id}
                              type="button"
                              disabled={added}
                              onClick={() => selectQuickService(item.id)}
                              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold ${added ? 'cursor-not-allowed border-green-200 bg-green-100 text-green-700 opacity-60' : 'border-amber-300 bg-white text-gray-700 hover:bg-amber-100'}`}
                            >
                              {added ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />}
                              {item.name}
                            </button>
                          );
                        })}
                        {availableServiceItems.filter(item => item.isQuickService).length === 0 && (
                          <span className="px-2 py-1 text-xs italic text-gray-500">Belum ada Barang/Jasa favorit.</span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {false && showServiceForm && (
                  <div className="mb-4 overflow-hidden rounded-xl border border-blue-200 bg-white shadow-sm">
                    <div className="border-b border-blue-100 bg-blue-50 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                            <ListPlus className="h-4 w-4" /> Pilih beberapa layanan
                          </p>
                          <p className="mt-0.5 text-xs text-blue-700">Klik favorit atau tombol Tambah. Item yang sudah dipilih tidak dapat ditambahkan dua kali.</p>
                        </div>
                        {hasPermission('item:create') && (
                          <button
                            type="button"
                            onClick={() => setShowQuickAddItem(true)}
                            className="inline-flex flex-shrink-0 items-center justify-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700"
                            title="Tambah barang/jasa baru"
                          >
                            <Plus className="h-4 w-4" /> Barang/Jasa Baru
                          </button>
                        )}
                      </div>

                      {/* Favorit: sekali klik langsung masuk */}
                      <div className="mt-3">
                        <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-blue-800">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" /> Favorit
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {availableServiceItems.filter(item => item.isQuickService).map(item => {
                            const added = isItemAdded(item.id);
                            return (
                              <button
                                key={item.id}
                                type="button"
                                disabled={added}
                                onClick={() => handleUseItem(item.id)}
                                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                                  added
                                    ? 'cursor-not-allowed border-green-200 bg-green-100 text-green-700'
                                    : item.type === 'Group'
                                    ? 'border-purple-200 bg-purple-50 text-purple-700 hover:border-purple-400 hover:bg-purple-100'
                                    : 'border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-400 hover:bg-amber-100'
                                }`}
                              >
                                {added ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                                {item.name}
                              </button>
                            );
                          })}
                          {availableServiceItems.filter(item => item.isQuickService).length === 0 && (
                            <span className="text-xs italic text-gray-400">Belum ada layanan favorit.</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Search */}
                    <div className="border-b border-gray-200 p-3">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          value={serviceSearch}
                          onChange={(e) => setServiceSearch(e.target.value)}
                          placeholder="Cari kode, barcode, nama, kategori, atau jenis…"
                          className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    {/* Master service table */}
                    <div className="max-h-64 overflow-auto">
                      <table className="min-w-[650px] w-full text-sm">
                        <thead className="sticky top-0 z-[1] bg-gray-100 text-xs text-gray-600">
                          <tr>
                            <th className="w-12 px-3 py-2 text-center font-medium">Fav</th>
                            <th className="px-3 py-2 text-left font-medium">Kode</th>
                            <th className="px-3 py-2 text-left font-medium">Barang / Jasa</th>
                            <th className="px-3 py-2 text-left font-medium">Jenis</th>
                            <th className="px-3 py-2 text-right font-medium">Harga</th>
                            <th className="w-24 px-3 py-2 text-center font-medium">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {availableServiceItems
                            .filter(item => {
                              const q = serviceSearch.toLowerCase().trim();
                              return !q || item.code.toLowerCase().includes(q) || (item.barcode || '').toLowerCase().includes(q) || item.name.toLowerCase().includes(q) || (item.receiptDescription || '').toLowerCase().includes(q) || item.type.toLowerCase().includes(q) || item.categoryName.toLowerCase().includes(q);
                            })
                            .map(item => {
                              const added = isItemAdded(item.id);
                              return (
                                <tr key={item.id} className={added ? 'bg-green-50/70' : 'hover:bg-blue-50/50'}>
                                  <td className="px-3 py-2 text-center">
                                    <Star className={`mx-auto h-4 w-4 ${item.isQuickService ? 'fill-amber-400 text-amber-500' : 'text-gray-300'}`} />
                                  </td>
                                  <td className="px-3 py-2 font-mono text-xs text-gray-600">{item.code}</td>
                                  <td className="px-3 py-2">
                                    <p className="font-medium text-gray-900">{item.name}</p>
                                    <p className="text-[10px] text-gray-400">{item.categoryName}{item.type === 'Group' ? ` • ${item.groupMembers?.length || 0} komponen` : ''}</p>
                                  </td>
                                  <td className="px-3 py-2">
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                      item.type === 'Group' ? 'bg-purple-100 text-purple-700' :
                                      item.type === 'Jasa' ? 'bg-green-100 text-green-700' :
                                      item.type === 'Persediaan' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                                    }`}>{item.type}</span>
                                  </td>
                                  <td className="px-3 py-2 text-right font-medium text-gray-900">Rp {item.sellingPrice.toLocaleString('id-ID')}</td>
                                  <td className="px-3 py-2 text-center">
                                    <button
                                      type="button"
                                      disabled={added}
                                      onClick={() => handleUseItem(item.id)}
                                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                                        added ? 'cursor-not-allowed bg-green-100 text-green-700' : 'bg-blue-600 text-white hover:bg-blue-700'
                                      }`}
                                    >
                                      {added ? <><CheckCircle2 className="h-3.5 w-3.5" /> Dipilih</> : <><Plus className="h-3.5 w-3.5" /> Tambah</>}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-600">
                      <span>{formData.services.length} baris sudah dipilih</span>
                      <button type="button" onClick={() => setShowServiceForm(false)} className="font-semibold text-blue-600 hover:text-blue-800">Selesai Memilih</button>
                    </div>
                  </div>
                )}

                {formData.services.length > 0 || !editingWO ? (
                  <>
                  <div className="space-y-2 sm:hidden">
                    {formData.services.length === 0 && (
                      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                        Belum ada layanan atau barang.
                      </div>
                    )}
                    {formData.services.map((service, index) => {
                      const isGroupHeader = isPackageHeaderService(service);
                      const isGroupMember = isPackageMemberService(service);
                      if (isGroupMember) return null;
                      const packageMembers = isGroupHeader
                        ? formData.services.slice(index + 1).filter((candidate, memberIndex, following) => (
                            isPackageMemberService(candidate)
                            && following.slice(0, memberIndex).every(isPackageMemberService)
                          ))
                        : [];
                      const visibleIndex = formData.services.slice(0, index).filter(candidate => !isPackageMemberService(candidate)).length + 1;
                      return (
                        <div key={service.id} className={`rounded-xl border p-3 ${isGroupHeader ? 'border-purple-200 bg-purple-50' : 'border-gray-200 bg-white'}`}>
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 text-xs text-gray-400">{visibleIndex}</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <p className={`break-words text-sm font-semibold ${isGroupHeader ? 'text-purple-700' : 'text-gray-900'}`}>{serviceReceiptName(service)}</p>
                                {isGroupHeader && <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[9px] font-medium text-purple-700">Harga Paket</span>}
                              </div>
                              {service.code && <p className="font-mono text-[10px] text-gray-400">{service.code}</p>}
                            </div>
                            <button type="button" onClick={() => handleRemoveService(service.id)} className="flex-shrink-0 rounded-lg p-1.5 text-red-500 hover:bg-red-100" title="Hapus">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          {packageMembers.length > 0 && (
                            <div className="mt-2 space-y-0.5 rounded-lg bg-white/70 px-2.5 py-2 text-[10px] text-slate-600">
                              {packageMembers.map(member => <p key={member.id}><span className="font-mono text-purple-500">{serviceItemCode(member)}</span> · {serviceReceiptName(member)} ×{member.qty}</p>)}
                            </div>
                          )}
                          <div className="mt-3 grid grid-cols-[4.25rem_minmax(0,1fr)_auto] items-end gap-2">
                            <label className="text-[10px] font-semibold uppercase text-gray-500">
                              Qty
                              <input
                                type="number"
                                inputMode="numeric"
                                min="1"
                                value={service.qty}
                                onChange={(event) => handleUpdateService(service.id, 'qty', parseInt(event.target.value) || 1)}
                                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-2 text-center text-sm font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                              />
                            </label>
                            <label className="text-[10px] font-semibold uppercase text-gray-500">
                              Harga
                              <span className="relative mt-1 block">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">Rp</span>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min="0"
                                  value={service.price}
                                  onChange={(event) => handleUpdateService(service.id, 'price', parseInt(event.target.value) || 0)}
                                  className={`w-full rounded-lg border py-2 pl-7 pr-2 text-right text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${isGroupHeader ? 'border-purple-300 bg-purple-50 font-bold text-purple-700' : service.price === 0 ? 'border-amber-300 bg-amber-50' : 'border-gray-300 bg-white'}`}
                                />
                              </span>
                            </label>
                            <div className="pb-2 text-right">
                              <p className="text-[9px] font-semibold uppercase text-gray-400">Subtotal</p>
                              <p className={`whitespace-nowrap text-sm font-bold ${isGroupHeader ? 'text-purple-700' : 'text-gray-900'}`}>Rp {(service.price * service.qty).toLocaleString('id-ID')}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {editingWO && <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-3 py-3">
                      <span className="text-xs font-semibold text-gray-700">TOTAL ESTIMASI</span>
                      <span className="text-base font-bold text-blue-700">Rp {totalServices.toLocaleString('id-ID')}</span>
                    </div>}
                  </div>
                  <div className="hidden overflow-x-auto rounded border border-gray-200 bg-white sm:block">
                    <table className="min-w-[920px] w-full text-sm">
                      <thead className={editingWO ? 'bg-slate-100 text-xs text-slate-600' : 'bg-slate-600 text-xs uppercase text-white'}>
                        <tr>
                          <th className="w-10 px-3 py-2.5 text-center font-medium">No</th>
                          <th className="px-3 py-2.5 text-left font-medium">Nama Barang/Jasa</th>
                          <th className="w-40 px-3 py-2.5 text-left font-medium">Barcode / Kode</th>
                          <th className="w-24 px-3 py-2.5 text-center font-medium">Qty</th>
                          <th className="w-40 px-3 py-2.5 text-right font-medium">Harga Satuan</th>
                          <th className="w-36 px-3 py-2.5 text-right font-medium">Subtotal</th>
                          <th className="w-14 px-3 py-2.5 text-center font-medium">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {formData.services.map((service, index) => {
                          const isGroupHeader = isPackageHeaderService(service);
                          const isGroupMember = isPackageMemberService(service);
                          if (isGroupMember) return null;
                          const packageMembers = isGroupHeader
                            ? formData.services.slice(index + 1).filter((candidate, memberIndex, following) => (
                                isPackageMemberService(candidate)
                                && following.slice(0, memberIndex).every(isPackageMemberService)
                              ))
                            : [];
                          const visibleIndex = formData.services.slice(0, index).filter(candidate => !isPackageMemberService(candidate)).length + 1;
                          return (
                            <tr key={service.id} className={isGroupHeader ? 'bg-purple-50' : 'hover:bg-blue-50/40'}>
                              <td className="px-3 py-2 text-center text-xs text-gray-400">{visibleIndex}</td>
                              <td className="px-3 py-2">
                                <div className="flex items-start gap-2">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <p className={`font-semibold ${isGroupHeader ? 'text-purple-700' : 'text-gray-900'}`}>{serviceReceiptName(service)}</p>
                                      {isGroupHeader && <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">Harga Paket</span>}
                                    </div>
                                    <p className="font-mono text-[10px] text-gray-400">{serviceItemCode(service)}</p>
                                    {packageMembers.length > 0 && (
                                      <div className="mt-1.5 border-l-2 border-purple-200 pl-2 text-[11px] text-slate-600">
                                        <span className="mr-2 font-semibold text-purple-600">Isi paket:</span>
                                        <span className="inline-flex flex-wrap gap-x-3 gap-y-0.5">
                                          {packageMembers.map(member => <span key={member.id} className="inline-flex min-w-0 items-center gap-1"><span className="font-mono text-[9px] text-purple-500">{serviceItemCode(member)}</span><span>· {serviceReceiptName(member)} ×{member.qty}</span></span>)}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-2 font-mono text-xs text-gray-600">{serviceBarcodeOrCode(service)}</td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  min="1"
                                  value={service.qty}
                                  onChange={(e) => handleUpdateService(service.id, 'qty', parseInt(e.target.value) || 1)}
                                  className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-center font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">Rp</span>
                                  <input
                                    type="number"
                                    min="0"
                                    value={service.price}
                                    onChange={(e) => handleUpdateService(service.id, 'price', parseInt(e.target.value) || 0)}
                                    className={`w-full rounded-lg border px-7 py-1.5 text-right outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${isGroupHeader ? 'border-purple-300 bg-purple-50 font-bold text-purple-700' : service.price === 0 ? 'border-amber-300 bg-amber-50' : 'border-gray-300 bg-white'}`}
                                  />
                                </div>
                              </td>
                              <td className={`px-3 py-2 text-right font-bold whitespace-nowrap ${isGroupHeader ? 'text-purple-700' : 'text-gray-900'}`}>
                                Rp {(service.price * service.qty).toLocaleString('id-ID')}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <button type="button" onClick={() => handleRemoveService(service.id)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-100" title="Hapus">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {formData.services.filter(service => !isPackageMemberService(service)).length === 0 && (
                          <tr>
                            <td colSpan={7} className="h-48 px-4 text-center text-sm text-gray-400">
                              Belum ada layanan atau barang.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center">
                    <Wrench className="mx-auto mb-1.5 h-7 w-7 text-gray-400" />
                    <p className="text-sm font-medium text-gray-700">Belum ada layanan</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Cari dan pilih layanan atau tambahkan layanan baru.
                    </p>
                  </div>
                )}
              </div>

              {/* Ringkasan dua baris dalam tiga kelompok yang terpisah */}
              <div className={!editingWO ? 'hidden' : `grid items-stretch gap-3 ${diagnosisMode ? 'lg:grid-cols-[minmax(0,55fr)_minmax(210px,25fr)_minmax(190px,20fr)]' : 'lg:grid-cols-[minmax(0,1fr)_300px]'}`}>
                <div className="grid min-h-[148px] grid-rows-2 gap-2 rounded-xl border border-cyan-200 bg-cyan-50 p-3">
                  <div className="grid grid-cols-1 gap-2">
                    <label className="text-[11px] font-semibold text-slate-600">
                      Teknisi penanggung jawab <span className="text-red-500">*</span>
                      <select required value={formData.technicianId} onChange={(event) => {
                        const technician = data.users.find(user => user.id === event.target.value);
                        setFormData(previous => ({ ...previous, technicianId: event.target.value, technicianName: technician?.name || '' }));
                      }} className="mt-1 h-9 w-full rounded-lg border border-cyan-200 bg-white px-2 text-xs font-normal outline-none focus:border-blue-500">
                        <option value="">Pilih teknisi</option>
                        {data.users.filter(user => user.isActive && !user.isOwner && (user.branchIds?.includes(editingWO?.branchId || '') || user.branchId === editingWO?.branchId)).map(user => (
                          <option key={user.id} value={user.id}>{user.name} · {user.roleName}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="flex min-h-0 flex-col text-[11px] font-semibold text-slate-600">Catatan hasil pekerjaan
                    <textarea value={diagnosisMode ? formData.findings : formData.notes} onChange={(event) => setFormData(previous => diagnosisMode ? { ...previous, findings: event.target.value } : { ...previous, notes: event.target.value })} placeholder={diagnosisMode ? 'Catatan hasil pekerjaan...' : 'Catatan internal teknisi...'} rows={1} className="mt-1 min-h-0 flex-1 resize-none rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                  </label>
                </div>
                {diagnosisMode && <div className="grid min-h-[148px] grid-rows-2 gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[11px] font-semibold text-slate-600">LP (PSI)<input type="number" step="0.1" min="0" value={formData.diagnosisLp ?? ''} onChange={(event) => setFormData(prev => ({ ...prev, diagnosisLp: event.target.value === '' ? undefined : Number(event.target.value) }))} placeholder="35" className="mt-1 h-9 w-full rounded-lg border border-blue-200 bg-white px-2 text-sm font-normal outline-none focus:border-blue-500" /></label>
                    <label className="text-[11px] font-semibold text-slate-600">HP (PSI)<input type="number" step="0.1" min="0" value={formData.diagnosisHp ?? ''} onChange={(event) => setFormData(prev => ({ ...prev, diagnosisHp: event.target.value === '' ? undefined : Number(event.target.value) }))} placeholder="180" className="mt-1 h-9 w-full rounded-lg border border-blue-200 bg-white px-2 text-sm font-normal outline-none focus:border-blue-500" /></label>
                  </div>
                  <label className="text-[11px] font-semibold text-slate-600">Suhu (°C)<input type="number" step="0.1" value={formData.diagnosisTemperature ?? ''} onChange={(event) => setFormData(prev => ({ ...prev, diagnosisTemperature: event.target.value === '' ? undefined : Number(event.target.value) }))} placeholder="8" className="mt-1 h-9 w-full rounded-lg border border-blue-200 bg-white px-2 text-sm font-normal outline-none focus:border-blue-500" /></label>
                </div>}
                <div className="grid min-h-[148px] grid-rows-2 overflow-hidden rounded-xl border border-gray-300 bg-white shadow-sm">
                  <div className="flex items-center justify-between px-4 py-2"><span className="text-sm text-gray-600">Jumlah Item</span><strong className="text-xl tabular-nums">{formData.services.filter(service => !isPackageMemberService(service)).length}</strong></div>
                  <div className="flex items-center justify-between border-t border-gray-200 px-4 py-2"><span className="text-sm text-gray-600">Total Estimasi</span><strong className="text-lg tabular-nums text-blue-700">Rp {totalServices.toLocaleString('id-ID')}</strong></div>
                </div>
              </div>
              </>}

              {/* Actions */}
              <div className="sticky bottom-0 z-30 -mx-4 flex items-center justify-end gap-2 border-t border-gray-200 bg-white px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-[0_-8px_20px_rgba(15,23,42,0.08)] sm:-mx-6 sm:gap-3 sm:px-6 sm:pb-0 sm:pt-4 sm:shadow-none lg:hidden">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="rounded-lg border border-gray-300 px-3 py-2.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 sm:px-5 sm:text-sm"
                >
                  Batal
                </button>
                {editingWO && editingWO.status === 'Register' && hasPermission('wo:edit') && !editingWO.invoiceId && (
                  <button
                    type="submit"
                    onClick={(event) => {
                      const reason = window.prompt('Alasan Lost Sales:');
                      if (!reason?.trim()) {
                        event.preventDefault();
                        return;
                      }
                      lostSalesReason.current = reason.trim();
                      diagnosisSubmitAction.current = 'lost';
                    }}
                    className="inline-flex items-center justify-center rounded-lg bg-rose-600 px-3 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-rose-700 sm:px-5 sm:text-sm"
                  >
                    Lost Sales
                  </button>
                )}
                <button
                  type={editingWO && !isAutoRegisteredDraft && !diagnosisMode && !serviceEditMode ? 'button' : 'submit'}
                  disabled={!editingWO ? (!newWOReadyForRegister || isAutoRegistering) : false}
                  onClick={() => {
                    if (editingWO && !isAutoRegisteredDraft && !diagnosisMode && !serviceEditMode) {
                      setServiceEditMode(true);
                      return;
                    }
                    diagnosisSubmitAction.current = 'save';
                  }}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2.5 text-xs font-medium text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-700 sm:flex-none sm:gap-2 sm:px-5 sm:text-sm"
                >
                  {editingWO ? <Save className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  {resumeLostSalesAfterEstimate
                    ? 'Setuju · Dikerjakan'
                    : diagnosisMode
                      ? 'Simpan Diagnosa'
                      : serviceEditMode
                        ? 'Simpan Perubahan'
                        : isAutoRegisteredDraft
                          ? 'Simpan'
                        : editingWO
                          ? 'Edit Layanan'
                          : isAutoRegistering ? 'Meregister...' : 'Register'}
                </button>
                {diagnosisMode && editingWO && hasPermission('invoice:create') && !editingWO.invoiceId && (
                  <button
                    type="submit"
                    onClick={() => { diagnosisSubmitAction.current = 'invoice'; }}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2.5 text-xs font-medium text-white shadow-lg shadow-green-600/20 transition-colors hover:bg-green-700 sm:flex-none sm:gap-2 sm:px-5 sm:text-sm"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Selesai &amp; Tagihkan
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Peringatan: WO aktif sudah ada untuk plat ini ===== */}
      {activeWoConflict && (() => {
        const conflict = activeWoConflict;
        const sameBranch = conflict.branchId === resolveBranchId();
        const conflictBranchName = data.branches.find(b => b.id === conflict.branchId)?.name || conflict.branchId;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
              <div className="flex items-center justify-between rounded-t-xl bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-4 text-white">
                <div className="flex items-center gap-2">
                  <CalendarClock className="h-5 w-5" />
                  <h3 className="text-lg font-bold">Mobil sudah memiliki WO aktif</h3>
                </div>
                <button onClick={() => setActiveWoConflict(null)} className="rounded-lg p-2 hover:bg-white/20"><X className="h-5 w-5" /></button>
              </div>
              <div className="space-y-4 p-6 text-sm">
                <p className="text-gray-700">
                  Plat <strong>{conflict.plateNumber}</strong> masih memiliki WO aktif:
                </p>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-1">
                  <div className="flex justify-between"><span className="text-gray-500">Nomor WO</span><span className="font-mono font-semibold">{conflict.woNumber}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Cabang</span><span className="font-medium">{conflictBranchName}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Tanggal</span><span>{conflict.date}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Status</span><span className="font-semibold">{conflict.status}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Total sementara</span><span className="font-semibold">Rp {conflict.total.toLocaleString('id-ID')}</span></div>
                </div>
                <p className="text-xs text-gray-500">
                  Satu mobil hanya boleh memiliki satu WO aktif. Selesaikan dulu WO ini atau lanjutkan pengerjaannya.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => void openActiveWorkOrder(conflict)}
                    className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    {activeWorkOrderActionLabel(conflict, sameBranch)}
                  </button>
                  {!sameBranch && (
                    <button
                      onClick={() => { const target = conflict; setActiveWoConflict(null); setContinueWO(target); }}
                      className="rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-700"
                    >
                      Lanjutkan di Cabang Ini (buat WO baru, WO lama ditandai selesai)
                    </button>
                  )}
                  <button
                    onClick={() => setActiveWoConflict(null)}
                    className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Batal
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== Form penyelesaian pekerjaan ===== */}
      {completionWO && (
        <div className="fixed inset-0 z-[75] flex items-stretch justify-center bg-black/55 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="completion-title">
          <div className="flex h-[100dvh] max-h-[100dvh] w-full max-w-lg flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl">
            <div className="flex flex-shrink-0 items-start justify-between bg-gradient-to-r from-emerald-600 to-green-700 px-5 py-4 text-white">
              <div className="flex min-w-0 items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-6 w-6 flex-shrink-0" />
                <div className="min-w-0">
                  <h3 id="completion-title" className="text-lg font-bold">Penyelesaian Pekerjaan</h3>
                  <p className="truncate font-mono text-xs text-emerald-100">{completionWO.woNumber} · {completionWO.plateNumber}</p>
                </div>
              </div>
              <button type="button" disabled={isCompletingWO} onClick={closeCompletionModal} className="rounded-lg p-2 hover:bg-white/20 disabled:opacity-50" aria-label="Tutup"><X className="h-5 w-5" /></button>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5 sm:p-6">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
                <div className="flex justify-between gap-4"><span className="text-gray-500">Pelanggan</span><strong className="text-right text-gray-900">{completionWO.customerName}</strong></div>
                <div className="mt-1 flex justify-between gap-4"><span className="text-gray-500">Kendaraan</span><strong className="text-right text-gray-900">{completionWO.vehicleInfo}</strong></div>
                <div className="mt-1 flex justify-between gap-4"><span className="text-gray-500">Total pekerjaan</span><strong className="text-blue-700">Rp {completionWO.total.toLocaleString('id-ID')}</strong></div>
              </div>

              {(completionWO.diagnosisTemperature !== undefined || completionWO.diagnosisLp !== undefined || completionWO.diagnosisHp !== undefined) && (
                <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-900">
                  <p className="font-semibold">Pengukuran saat diagnosa</p>
                  <p className="mt-1">Suhu: {completionWO.diagnosisTemperature ?? '-'}°C · LP: {completionWO.diagnosisLp ?? '-'} psi · HP: {completionWO.diagnosisHp ?? '-'} psi</p>
                </div>
              )}

              <div>
                <div className="mb-2">
                  <h4 className="font-semibold text-gray-900">Pengukuran akhir</h4>
                  <p className="text-xs text-gray-500">Opsional, tetapi jika diisi ketiganya harus lengkap.</p>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <label className="text-xs font-semibold text-gray-700">Suhu (°C)
                    <input inputMode="decimal" value={completionForm.temperature} onChange={(e) => { setCompletionForm(current => ({ ...current, temperature: e.target.value })); setCompletionError(''); }} placeholder="8" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-right text-base font-semibold outline-none focus:border-emerald-500" />
                  </label>
                  <label className="text-xs font-semibold text-gray-700">LP (psi)
                    <input inputMode="decimal" value={completionForm.lp} onChange={(e) => { setCompletionForm(current => ({ ...current, lp: e.target.value })); setCompletionError(''); }} placeholder="35" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-right text-base font-semibold outline-none focus:border-emerald-500" />
                  </label>
                  <label className="text-xs font-semibold text-gray-700">HP (psi)
                    <input inputMode="decimal" value={completionForm.hp} onChange={(e) => { setCompletionForm(current => ({ ...current, hp: e.target.value })); setCompletionError(''); }} placeholder="180" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-right text-base font-semibold outline-none focus:border-emerald-500" />
                  </label>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-800">Catatan hasil pekerjaan</label>
                <p className="mb-2 text-xs text-gray-500">Wajib bila pengukuran akhir tidak diisi lengkap.</p>
                <div className="mb-2 flex flex-wrap gap-2">
                  {COMPLETION_NOTE_TEMPLATES.map(template => (
                    <button key={template} type="button" onClick={() => { setCompletionForm(current => ({ ...current, note: template })); setCompletionError(''); }} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-left text-xs font-medium text-emerald-800 hover:bg-emerald-100">
                      {template.replace(/\.$/, '')}
                    </button>
                  ))}
                </div>
                <textarea rows={4} value={completionForm.note} onChange={(e) => { setCompletionForm(current => ({ ...current, note: e.target.value })); setCompletionError(''); }} placeholder="Tuliskan hasil akhir, pengujian, atau keterangan pekerjaan..." className="w-full resize-y rounded-xl border border-gray-300 px-3 py-3 text-sm outline-none focus:border-emerald-500" />
              </div>

              {completionError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{completionError}</span>
                </div>
              )}
            </div>

            <div className="flex flex-shrink-0 gap-3 border-t border-gray-200 bg-white p-4 sm:justify-end sm:px-6">
              <button type="button" disabled={isCompletingWO} onClick={closeCompletionModal} className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 sm:flex-none">Batal</button>
              <button type="button" disabled={isCompletingWO} onClick={() => void completeWorkOrder()} className="inline-flex flex-[1.5] items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60 sm:flex-none">
                <CheckCircle2 className="h-4 w-4" />{isCompletingWO ? 'Menyimpan...' : 'Simpan & Selesaikan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Konfirmasi ubah status WO ===== */}
      {statusDialog && (() => {
        const { wo, next } = statusDialog;
        const needsReason = next === 'Closed';
        const closeStatusDialog = () => {
          setStatusDialog(null);
          setCancelStep(1);
          setCancelReasonChoice('');
          setCancelReasonNotes('');
        };
        const lostSalesReasons = (data.settings.lostSalesReasonTemplates || DEFAULT_LOST_SALES_REASONS).filter(reason => reason.isActive);
        const selectedLostSalesReason = lostSalesReasons.find(reason => reason.id === cancelReasonChoice);
        const finalCancelReason = selectedLostSalesReason?.requiresNote
          ? `${selectedLostSalesReason.label}: ${cancelReasonNotes.trim()}`
          : cancelReasonNotes.trim() ? `${selectedLostSalesReason?.label} — ${cancelReasonNotes.trim()}` : (selectedLostSalesReason?.label || '');
        const finalCancelEnabled = Boolean(selectedLostSalesReason
          && (!selectedLostSalesReason.requiresNote || cancelReasonNotes.trim()));
        return (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
              <div className={`flex items-center justify-between rounded-t-xl bg-gradient-to-r px-6 py-4 text-white ${needsReason ? 'from-rose-600 to-red-700' : 'from-blue-600 to-indigo-600'}`}>
                <div className="flex items-center gap-2">
                  {needsReason ? <AlertTriangle className="h-5 w-5" /> : <ArrowLeftRight className="h-5 w-5" />}
                  <div><h3 className="text-lg font-bold">{needsReason ? 'Batalkan Pekerjaan' : 'Ubah status WO'}</h3>{needsReason && <p className="text-xs text-rose-100">Konfirmasi {cancelStep} dari 2</p>}</div>
                </div>
                <button onClick={closeStatusDialog} className="rounded-lg p-2 hover:bg-white/20"><X className="h-5 w-5" /></button>
              </div>
              <div className="space-y-4 p-6 text-sm">
                <p className="text-gray-700">
                  Ubah status <strong className="font-mono">{wo.woNumber}</strong> dari{' '}
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${statusColors[wo.status]}`}>{statusLabel(wo.status)}</span>
                  {' → '}
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${statusColors[next]}`}>{statusLabel(next)}</span>?
                </p>
                <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600 space-y-0.5">
                  <p>Pelanggan: <strong>{wo.customerName}</strong> ({wo.plateNumber})</p>
                  <p>Layanan: {wo.services.length} item</p>
                  <p>Total: Rp {wo.total.toLocaleString('id-ID')}</p>
                </div>
                {needsReason && cancelStep === 1 && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-800">
                    <strong>Apakah betul pekerjaan ini mau dibatalkan?</strong>
                    <p className="mt-1 text-xs">WO akan menjadi Lost Sales. Data layanan tetap tersimpan dan pembatalan tercatat pada timeline.</p>
                  </div>
                )}
                {needsReason && cancelStep === 2 && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-700">Alasan Lost Sales <span className="text-red-500">*</span></label>
                      <select value={cancelReasonChoice} onChange={(e) => setCancelReasonChoice(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-rose-500">
                        <option value="">Pilih alasan pembatalan</option>
                        {lostSalesReasons.map(reason => <option key={reason.id} value={reason.id}>{reason.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-700">Catatan {selectedLostSalesReason?.requiresNote ? <span className="text-red-500">*</span> : '(opsional)'}</label>
                      <textarea value={cancelReasonNotes} onChange={(e) => setCancelReasonNotes(e.target.value)} rows={2} placeholder="Tambahkan rincian alasan" className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-rose-500" />
                    </div>
                  </>
                )}
                <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
                  {needsReason && cancelStep === 2
                    ? <button onClick={() => setCancelStep(1)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Kembali</button>
                    : <button onClick={closeStatusDialog} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">{needsReason ? 'Tidak' : 'Batal'}</button>}
                  {needsReason
                    ? cancelStep === 1
                      ? <button onClick={() => setCancelStep(2)} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">Ya, Lanjutkan</button>
                      : <button onClick={() => void confirmStatusChange(finalCancelReason)} disabled={!finalCancelEnabled} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-gray-300">Batalkan &amp; Jadikan Lost Sales</button>
                    : <button onClick={() => void confirmStatusChange()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Ya, Ubah Status</button>}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {showPendingTemplateEditor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-slate-800 px-5 py-4 text-white">
              <div>
                <h3 className="font-bold">Template Alasan Pending</h3>
                <p className="text-xs text-slate-300">Perubahan berlaku untuk transaksi berikutnya.</p>
              </div>
              <button type="button" onClick={() => setShowPendingTemplateEditor(false)} className="rounded-lg p-2 hover:bg-white/10"><X className="h-5 w-5" /></button>
            </div>
            <div className="max-h-[60vh] space-y-2 overflow-y-auto p-5">
              {pendingTemplateDraft.map((template, index) => (
                <div key={template.id} className={`flex items-center gap-2 rounded-lg border p-2 ${template.isActive ? 'bg-white' : 'bg-gray-100 opacity-70'}`}>
                  <div className="flex flex-col">
                    <button type="button" disabled={index === 0} onClick={() => movePendingTemplate(index, -1)} className="h-5 px-1 text-xs text-gray-500 disabled:opacity-20">▲</button>
                    <button type="button" disabled={index === pendingTemplateDraft.length - 1} onClick={() => movePendingTemplate(index, 1)} className="h-5 px-1 text-xs text-gray-500 disabled:opacity-20">▼</button>
                  </div>
                  <input value={template.label} onChange={(e) => setPendingTemplateDraft(current => current.map(item => item.id === template.id ? { ...item, label: e.target.value } : item))} className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
                  <button type="button" onClick={() => setPendingTemplateDraft(current => current.map(item => item.id === template.id ? { ...item, isActive: !item.isActive } : item))} className={`rounded-lg px-2.5 py-2 text-xs font-semibold ${template.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>{template.isActive ? 'Aktif' : 'Nonaktif'}</button>
                  <button type="button" onClick={() => setPendingTemplateDraft(current => current.filter(item => item.id !== template.id))} className="rounded-lg p-2 text-red-600 hover:bg-red-50" title="Hapus"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <div className="flex gap-2 border-t pt-3">
                <input value={newPendingTemplate} onChange={(e) => setNewPendingTemplate(e.target.value)} onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const label = newPendingTemplate.trim();
                    if (label) {
                      setPendingTemplateDraft(current => [...current, { id: `reason-${Date.now()}`, label, isActive: true }]);
                      setNewPendingTemplate('');
                    }
                  }
                }} placeholder="Alasan baru..." className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                <button type="button" onClick={() => {
                  const label = newPendingTemplate.trim();
                  if (!label) return;
                  setPendingTemplateDraft(current => [...current, { id: `reason-${Date.now()}`, label, isActive: true }]);
                  setNewPendingTemplate('');
                }} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-4">
              <button type="button" onClick={() => setShowPendingTemplateEditor(false)} className="rounded-lg border px-4 py-2 text-sm">Batal</button>
              <button type="button" disabled={savingPendingTemplates} onClick={savePendingTemplates} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />{savingPendingTemplates ? 'Menyimpan...' : 'Simpan Template'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Lanjutkan Pengecekan di Cabang Ini ===== */}
      {continueWO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between rounded-t-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-4 text-white">
              <div className="flex items-center gap-3">
                <ArrowLeftRight className="h-6 w-6" />
                <div>
                  <h3 className="text-lg font-bold">Lanjutkan Pengerjaan</h3>
                  <p className="text-sm text-cyan-100">Dari {continueWO.woNumber}</p>
                </div>
              </div>
              <button onClick={() => setContinueWO(null)} className="rounded-lg p-2 hover:bg-white/20"><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-4 p-6">
              <div className="rounded-lg bg-gray-50 p-3 text-sm">
                <div className="flex justify-between py-0.5"><span className="text-gray-500">Pelanggan</span><span className="font-medium">{continueWO.customerName}</span></div>
                <div className="flex justify-between py-0.5"><span className="text-gray-500">Kendaraan</span><span className="font-medium">{continueWO.plateNumber}</span></div>
                <div className="flex justify-between py-0.5"><span className="text-gray-500">Estimasi</span><span className="font-medium">Rp {continueWO.total.toLocaleString('id-ID')}</span></div>
                <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2">
                  <span className="text-gray-500">Dicek di</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                    <Building2 className="h-3 w-3" />
                    {data.branches.find(b => b.id === continueWO.branchId)?.name}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-gray-500">Dikerjakan di</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-semibold text-cyan-700">
                    <Building2 className="h-3 w-3" />
                    {data.branches.find(b => b.id === activeBranchId)?.name}
                  </span>
                </div>
              </div>

              {continueWO.description && (
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                  <p className="text-xs font-semibold text-blue-800">Keluhan Pelanggan</p>
                  <p className="mt-0.5 text-sm text-blue-900">{continueWO.description}</p>
                </div>
              )}

              {continueWO.services.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium text-gray-700">Rekomendasi dari pengecekan ({continueWO.services.length} item)</p>
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2">
                    {continueWO.services.map(s => (
                      <div key={s.id} className="flex justify-between text-xs">
                        <span className="text-gray-700">{s.name} ×{s.qty}</span>
                        <span className="font-medium text-gray-900">Rp {(s.price * s.qty).toLocaleString('id-ID')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-xs text-cyan-800">
                <p className="mb-1 font-semibold">Yang akan terjadi:</p>
                <ul className="list-inside list-disc space-y-0.5 text-cyan-700">
                  <li>WO baru dibuat di <strong>{data.branches.find(b => b.id === activeBranchId)?.name}</strong> dengan status <strong>Proses</strong></li>
                  <li>Data pelanggan, kendaraan, keluhan & rekomendasi <strong>tersalin otomatis</strong></li>
                  <li>{continueWO.woNumber} ditandai <strong>"sudah dilanjutkan"</strong> dan tidak akan ditagih</li>
                  <li>Stok & omzet nanti masuk ke cabang ini saat difakturkan</li>
                </ul>
              </div>

              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
                <button type="button" onClick={() => setContinueWO(null)} className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium text-gray-700 hover:bg-gray-50">Batal</button>
                <button
                  type="button"
                  onClick={submitContinue}
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-2.5 font-semibold text-white shadow-lg shadow-cyan-500/30 hover:opacity-90"
                >
                  <ArrowLeftRight className="h-4 w-4" /> Buat WO Lanjutan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Edit Template Keluhan Modal ===== */}
      {showComplaintEditor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between rounded-t-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-white">
              <div>
                <h3 className="text-lg font-bold">Edit List Keluhan</h3>
                <p className="text-sm text-blue-100">Template ini muncul sebagai chip di field Keterangan WO.</p>
              </div>
              <button onClick={() => setShowComplaintEditor(false)} className="rounded-lg p-2 hover:bg-white/20">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 p-6">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Perubahan list keluhan disimpan di browser pengguna ini. Untuk mode database penuh, nanti bisa kita pindahkan ke tabel template agar sama di semua komputer.
              </div>

              {/* Add new */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newComplaintTemplate}
                  onChange={(e) => setNewComplaintTemplate(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addComplaintTemplate(); } }}
                  placeholder="Tambah template baru, mis: AC hidup mati sendiri"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
                <button
                  type="button"
                  onClick={addComplaintTemplate}
                  className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" /> Tambah
                </button>
              </div>

              {/* Editable list */}
              <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border border-gray-200 p-2">
                {complaintTemplateDraft.map((template, index) => (
                  <div key={index} className="flex items-center gap-2 rounded-lg bg-gray-50 p-2">
                    <input
                      type="text"
                      value={template}
                      onChange={(e) => updateComplaintTemplate(index, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); finishComplaintEditor(); } if (e.key === 'Escape') setShowComplaintEditor(false); }}
                      className="flex-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => deleteComplaintTemplate(index)}
                      className="rounded-lg p-2 text-red-600 hover:bg-red-100"
                      title="Hapus template"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex justify-between gap-3 border-t border-gray-200 pt-4">
                <button
                  type="button"
                  onClick={resetComplaintTemplates}
                  className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50"
                >
                  Reset Default
                </button>
                <button
                  type="button"
                  onClick={finishComplaintEditor}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  <Save className="h-4 w-4" /> Selesai
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rincian barang/jasa dari baris WO */}
      {linkedServiceDetail && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3" role="dialog" aria-modal="true" aria-label={`Rincian ${serviceReceiptName(linkedServiceDetail)}`}>
          <section className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
            <header className="flex items-center justify-between bg-[#12386b] px-4 py-3 text-white">
              <div className="flex items-center gap-2"><Edit className="h-5 w-5" /><h3 className="font-semibold">Rincian Barang</h3></div>
              <button type="button" onClick={() => setLinkedServiceDetail(null)} className="rounded p-1 hover:bg-white/10" aria-label="Tutup"><X className="h-5 w-5" /></button>
            </header>
            <div className="flex border-b border-gray-300 px-3 pt-2 text-sm">
              <span className="border-b-2 border-red-500 px-3 py-2 font-medium text-red-600">Rincian Barang</span>
              <span className="px-4 py-2 text-gray-500">Info lainnya</span>
              <span className="px-4 py-2 text-gray-500">Penangguhan</span>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5 text-sm">
              <div className="grid grid-cols-[150px_minmax(0,1fr)] items-center gap-3">
                <span>Kode #</span>
                <button type="button" onClick={() => linkedServiceMaster && window.location.assign(`/items?view=${encodeURIComponent(linkedServiceMaster.id)}`)} disabled={!linkedServiceMaster} className="w-fit font-mono font-semibold text-cyan-600 hover:underline disabled:cursor-default disabled:no-underline">{serviceItemCode(linkedServiceDetail)}</button>
                <span>Nama Barang</span><div className="rounded border border-gray-300 bg-white px-3 py-2 font-medium shadow-sm">{serviceReceiptName(linkedServiceDetail)}</div>
                <span>Kuantitas</span><div className="flex items-center justify-end rounded border border-gray-300 bg-white px-3 py-2 tabular-nums">{linkedServiceDetail.qty}</div>
                <span>@Harga</span><div className="flex items-center rounded border border-gray-300 bg-white"><span className="border-r border-gray-200 px-3 py-2 text-gray-500">Rp</span><strong className="flex-1 px-3 py-2 text-right tabular-nums">{linkedServiceDetail.price.toLocaleString('id-ID')}</strong></div>
                <span>Diskon</span><div className="grid grid-cols-2 gap-3"><div className="rounded border border-gray-300 bg-gray-50 px-3 py-2 text-right text-gray-500">0 %</div><div className="rounded border border-gray-300 bg-gray-50 px-3 py-2 text-right text-gray-500">Rp 0</div></div>
                <span>Total Harga</span><strong className="rounded border border-gray-300 bg-gray-50 px-3 py-2 text-right tabular-nums">Rp {(linkedServiceDetail.price * linkedServiceDetail.qty).toLocaleString('id-ID')}</strong>
                <span>Penjual / Teknisi</span><div className="rounded border border-gray-300 bg-white px-3 py-2">{detailWO?.technicianName || detailWO?.createdByName || '-'}</div>
                <span>Satuan</span><div className="rounded border border-gray-300 bg-gray-50 px-3 py-2">{linkedServiceMaster?.unit || (linkedServiceMaster?.type === 'Jasa' ? 'JASA' : 'PCS')}</div>
              </div>
            </div>
            <footer className="flex justify-end border-t border-gray-300 p-4">
              <button type="button" onClick={() => setLinkedServiceDetail(null)} className="rounded bg-blue-800 px-6 py-2 font-semibold text-white hover:bg-blue-700">Lanjut</button>
            </footer>
          </section>
        </div>
      )}

      {/* Quick Add Item Modal */}
      {showQuickAddItem && (
        <div className="fixed inset-[5%] z-[60] flex items-start justify-center pointer-events-none">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md pointer-events-auto border-2 border-green-500">
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-4 rounded-t-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                <h3 className="text-lg font-bold">Tambah Barang/Jasa Baru</h3>
              </div>
              <button onClick={() => setShowQuickAddItem(false)} className="rounded-lg p-1.5 hover:bg-white/20"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-xs text-blue-700">
                💡 Item akan otomatis tersimpan ke <strong>Master Barang & Jasa</strong> dan langsung masuk ke WO ini.
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Jenis *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Jasa', 'Persediaan', 'Non Persediaan'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setQuickItemForm({ ...quickItemForm, type: t, unit: t === 'Jasa' ? 'JASA' : 'PCS' })}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                        quickItemForm.type === t
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Barang/Jasa *</label>
                <input
                  autoFocus
                  type="text"
                  value={quickItemForm.name}
                  onChange={(e) => setQuickItemForm({ ...quickItemForm, name: e.target.value.toUpperCase() })}
                  placeholder="Mis: ISI FREON R134A"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 uppercase outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Satuan</label>
                  <select
                    value={quickItemForm.unit}
                    onChange={(e) => setQuickItemForm({ ...quickItemForm, unit: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white outline-none focus:border-green-500"
                  >
                    {['PCS', 'SET', 'CAN', 'BOTOL', 'LITER', 'JASA', 'UNIT'].map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Harga Jual</label>
                  <input
                    type="number"
                    min="0"
                    value={quickItemForm.sellingPrice}
                    onChange={(e) => setQuickItemForm({ ...quickItemForm, sellingPrice: parseInt(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-green-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
                <select
                  value={quickItemForm.categoryId}
                  onChange={(e) => setQuickItemForm({ ...quickItemForm, categoryId: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white outline-none focus:border-green-500"
                >
                  <option value="">Auto (kategori pertama)</option>
                  {data.itemCategories.filter(c => c.isActive).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="border-t border-gray-200 p-4 flex gap-2 justify-end">
              <button type="button" onClick={() => setShowQuickAddItem(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Batal</button>
              <button type="button" onClick={handleQuickAddItem} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
                <Save className="w-4 h-4" /> Simpan & Tambahkan ke WO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Confirmation Modal */}
      {invoiceWO && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-hidden bg-black/50 p-2 sm:items-center sm:p-4">
          <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
            <div className="flex flex-shrink-0 items-center justify-between rounded-t-xl bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-4">
              <div className="flex items-center gap-3 text-white">
                <Receipt className="w-6 h-6" />
                <div>
                  <h3 className="text-lg font-semibold">Buat Faktur dari WO</h3>
                  <p className="text-sm text-green-100">{invoiceWO.woNumber}</p>
                </div>
              </div>
              <button
                onClick={() => setInvoiceWO(null)}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-6">
              <div className="rounded-lg bg-gray-50 p-4 space-y-2">
                <div className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-gray-500">Pelanggan</span>
                  <span className="text-right font-medium text-gray-900">
                    <span className="block">{invoiceWO.customerName}</span>
                    <span className="block text-xs font-normal text-gray-500">{customerPhoneForWO(invoiceWO)}</span>
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-gray-500">Kendaraan</span>
                  <span className="max-w-[70%] text-right font-medium text-gray-900">
                    <span className="block font-mono">{invoiceWO.plateNumber}</span>
                    <span className="block text-xs font-normal text-gray-500">{invoiceWO.vehicleInfo || 'Data kendaraan belum lengkap'}</span>
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Jumlah Layanan</span>
                  <span className="font-medium text-gray-900">{invoiceWO.services.length} item</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-200">
                  <span className="font-semibold text-gray-900">Total Tagihan</span>
                  <span className="text-lg font-bold text-green-600">
                    Rp {invoiceWO.total.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              <div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Tanggal Faktur</label>
                    <input type="date" max={localDateKey()} disabled={!invoiceDateUnlocked} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-100" />
                    <p className="mt-1 text-xs font-medium text-gray-600">{formatBusinessDate(invoiceDate)}</p>
                    <button type="button" onClick={() => hasPermission('invoice:backdate') ? setInvoiceDateUnlocked(v => !v) : window.alert('Tidak memiliki hak ubah tanggal faktur.')} className="text-xs font-semibold text-blue-600 mt-1">Buka tanggal</button>
                  </div>
                  {invoicePayment > 0 && <div>
                    <label className="block text-sm font-medium mb-1">Tanggal Pembayaran</label>
                    <input type="date" min={invoiceDate} max={localDateKey()} disabled={!invoicePaymentDateUnlocked} value={invoicePaymentDate} onChange={(e) => setInvoicePaymentDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-100" />
                    <p className="mt-1 text-xs font-medium text-gray-600">{formatBusinessDate(invoicePaymentDate)}</p>
                    <button type="button" onClick={() => hasPermission('payment:backdate') ? setInvoicePaymentDateUnlocked(v => !v) : window.alert('Tidak memiliki hak ubah tanggal pembayaran.')} className="text-xs font-semibold text-blue-600 mt-1">Buka tanggal</button>
                  </div>}
                </div>
                {data.settings.security.requireBackdateReason !== false && (invoiceDate < localDateKey() || (invoicePayment > 0 && invoicePaymentDate < localDateKey())) && (
                  <input required value={invoiceBackdateReason} onChange={(e) => setInvoiceBackdateReason(e.target.value)} placeholder="Alasan transaksi tanggal mundur" className="w-full mb-4 px-3 py-2 border border-amber-400 bg-amber-50 rounded-lg" />
                )}
                <label className="block text-sm font-semibold text-gray-700 mb-2">Rincian Pembayaran</label>
                <div className="space-y-3">
                  <div className="grid grid-cols-[110px_1fr] items-center gap-3">
                    <span className="px-1 text-sm font-medium text-gray-700">Tunai</span>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">Rp</span>
                      <input
                        aria-label="Jumlah pembayaran tunai"
                        type="text"
                        inputMode="numeric"
                        value={formatPaymentInput(invoiceCashPayment)}
                        onChange={(e) => setInvoiceCashPayment(parsePaymentInput(e.target.value))}
                        placeholder="0"
                        className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-right font-semibold tabular-nums outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-[110px_1fr] items-center gap-3">
                    <span className="px-1 text-sm font-medium text-gray-700">Transfer</span>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">Rp</span>
                      <input
                        aria-label="Jumlah pembayaran transfer"
                        type="text"
                        inputMode="numeric"
                        value={formatPaymentInput(invoiceTransferPayment)}
                        onChange={(e) => setInvoiceTransferPayment(parsePaymentInput(e.target.value))}
                        placeholder="0"
                        className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-right font-semibold tabular-nums outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="flex justify-between text-sm"><span className="text-gray-600">Total pembayaran</span><strong>Rp {invoicePayment.toLocaleString('id-ID')}</strong></div>
                <div className="mt-1 flex justify-between text-sm"><span className="text-gray-600">Total tagihan</span><strong>Rp {invoiceWO.total.toLocaleString('id-ID')}</strong></div>
                <div className={`mt-2 flex justify-between border-t pt-2 text-sm font-semibold ${invoicePayment === invoiceWO.total ? 'text-green-700' : invoicePayment > invoiceWO.total ? 'text-red-600' : 'text-amber-700'}`}>
                  <span>{invoicePayment > invoiceWO.total ? 'Kelebihan' : 'Sisa tagihan'}</span><span>Rp {Math.abs(invoiceWO.total - invoicePayment).toLocaleString('id-ID')}</span>
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => { setInvoiceCashPayment(invoiceWO.total); setInvoiceTransferPayment(0); }}
                    className="flex-1 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Bayar Lunas Tunai
                  </button>
                  <button
                    type="button"
                    onClick={() => { setInvoiceCashPayment(0); setInvoiceTransferPayment(0); }}
                    className="flex-1 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Belum Bayar
                  </button>
                </div>
                <p className={`mt-2 text-sm font-medium ${invoicePayment === invoiceWO.total ? 'text-green-600' : invoicePayment > invoiceWO.total ? 'text-red-600' : 'text-yellow-600'}`}>
                  Status: {invoicePayment === invoiceWO.total ? 'Lunas' : invoicePayment === 0 ? 'Belum Lunas' : invoicePayment > invoiceWO.total ? 'Melebihi tagihan' : `Sebagian (sisa Rp ${(invoiceWO.total - invoicePayment).toLocaleString('id-ID')})`}
                </p>
              </div>
            </div>

            <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-gray-200 bg-white px-4 py-3 sm:gap-3 sm:px-6 sm:py-4">
              <button
                type="button"
                onClick={() => setInvoiceWO(null)}
                className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors sm:px-5"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleCreateInvoice}
                disabled={isCreatingInvoice}
                className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2.5 text-xs font-medium text-white shadow-lg shadow-green-600/20 transition-colors hover:bg-green-700 disabled:bg-gray-400 sm:flex-none sm:gap-2 sm:px-5 sm:text-sm"
              >
                <Receipt className="w-4 h-4" />
                {isCreatingInvoice ? 'Menyimpan...' : invoicePayment === 0 ? 'Buat Faktur' : invoicePayment >= invoiceWO.total ? 'Buat Faktur & Bayar' : 'Buat Faktur & Catat Pembayaran'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
