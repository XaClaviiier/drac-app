import { useState, useMemo, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, Wrench, X, Save, FileText, CheckCircle2, Receipt, User, Car, ArrowLeftRight, Building2, CalendarClock, Star, ListPlus, CalendarDays, Eye, Copy, MessageCircle, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { WorkOrder, WorkOrderService } from '../types';
import CustomerPicker from '../components/CustomerPicker';
import VehiclePicker from '../components/VehiclePicker';

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
const DEFAULT_PENDING_REASONS = [
  { id: 'think', label: 'Pikir-pikir', isActive: true },
  { id: 'fund', label: 'Menyiapkan dana', isActive: true },
  { id: 'schedule', label: 'Menunggu jadwal', isActive: true },
  { id: 'other', label: 'Lainnya', isActive: true },
];
const formatPaymentInput = (value: number) => value ? value.toLocaleString('id-ID') : '';
const parsePaymentInput = (value: string) => Number(value.replace(/\D/g, '')) || 0;

export default function WorkOrders() {
  const {
    data,
    addWorkOrder, updateWorkOrder, deleteWorkOrder,
    continueWorkOrder, findActiveWoByPlate, changeWorkOrderStatus,
    createInvoiceFromWO, addItem,
    currentUser, currentBranchId, resolveBranchId, hasPermission, generateDocumentNumber, updateSettings, refreshData, isLoading,
  } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [diagnosisMode, setDiagnosisMode] = useState(false);
  const [continueWO, setContinueWO] = useState<WorkOrder | null>(null);
  const [editingWO, setEditingWO] = useState<WorkOrder | null>(null);
  const [activeWoConflict, setActiveWoConflict] = useState<WorkOrder | null>(null);
  const [statusDialog, setStatusDialog] = useState<{ wo: WorkOrder; next: WorkOrder['status'] } | null>(null);
  const [statusReason, setStatusReason] = useState('');
  const [showPendingTemplateEditor, setShowPendingTemplateEditor] = useState(false);
  const [pendingTemplateDraft, setPendingTemplateDraft] = useState(
    data.settings.pendingReasonTemplates || DEFAULT_PENDING_REASONS
  );
  const [newPendingTemplate, setNewPendingTemplate] = useState('');
  const [savingPendingTemplates, setSavingPendingTemplates] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [todayOnly, setTodayOnly] = useState(false);
  const [activeBranchOnly, setActiveBranchOnly] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [invoiceWO, setInvoiceWO] = useState<WorkOrder | null>(null);
  const [invoicePayment, setInvoicePayment] = useState(0);
  const [invoicePaymentMethod, setInvoicePaymentMethod] = useState<'Tunai' | 'QRIS/Transfer'>('Tunai');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [invoicePaymentDate, setInvoicePaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [invoiceDateUnlocked, setInvoiceDateUnlocked] = useState(false);
  const [invoicePaymentDateUnlocked, setInvoicePaymentDateUnlocked] = useState(false);
  const [invoiceBackdateReason, setInvoiceBackdateReason] = useState('');
  const [woDateUnlocked, setWoDateUnlocked] = useState(false);
  const [woBackdateReason, setWoBackdateReason] = useState('');
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);
  const [detailWO, setDetailWO] = useState<WorkOrder | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
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

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
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
    status: 'Pengecekan' as WorkOrder['status'],
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

  const [showServiceForm, setShowServiceForm] = useState(false);
  const [serviceSearch, setServiceSearch] = useState('');
  const availableServiceItems = data.items.filter((item) => item.isActive);

  // Quick-add Item modal state
  const [showQuickAddItem, setShowQuickAddItem] = useState(false);
  const [quickItemForm, setQuickItemForm] = useState({
    name: '',
    type: 'Jasa' as 'Persediaan' | 'Jasa' | 'Non Persediaan',
    unit: 'JASA',
    sellingPrice: 0,
    categoryId: '',
  });

  const handleQuickAddItem = () => {
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
    addItem(newItem);

    // Auto-add to current WO services
    setFormData(prev => ({
      ...prev,
      services: [
        ...prev.services,
        {
          id: Date.now().toString() + '-svc',
          itemId: newItem.id,
          code: newItem.code,
          name: newItem.name,
          description: '',
          price: newItem.sellingPrice,
          qty: 1,
        },
      ],
    }));

    setQuickItemForm({ name: '', type: 'Jasa', unit: 'JASA', sellingPrice: 0, categoryId: '' });
    setShowQuickAddItem(false);
  };

  const selectedCustomer = data.customers.find((customer) => customer.id === formData.customerRefId) || null;

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

  const canViewAllBranches = hasPermission('all_branches');
  const selectedBranchId = currentBranchId === 'ALL'
    ? (currentUser?.branchId || resolveBranchId())
    : currentBranchId;
  const selectedBranch = data.branches.find(branch => branch.id === selectedBranchId);
  const selectedBranchLabel = selectedBranch?.name.replace('CABANG ', '') || 'Cabang Aktif';
  const toLocalDate = (date: Date) => {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().split('T')[0];
  };
  const todayDate = toLocalDate(new Date());

  const activeBranchIds = data.branches.filter(branch => branch.isActive).map(branch => branch.id);

  // Saat dropdown header berganti cabang, filter cabang tersebut otomatis ON.
  useEffect(() => {
    setActiveBranchOnly(true);
  }, [currentBranchId]);

  const isAllBranchDropdown = currentBranchId === 'ALL';
  const branchScopeLabel = isAllBranchDropdown || !activeBranchOnly
    ? 'Semua Cabang'
    : selectedBranchLabel;

  const setLastSevenDays = () => {
    const start = new Date();
    start.setDate(start.getDate() - 6);
    setDateFrom(toLocalDate(start));
    setDateTo(todayDate);
  };

  const setCurrentMonth = () => {
    const now = new Date();
    setDateFrom(toLocalDate(new Date(now.getFullYear(), now.getMonth(), 1)));
    setDateTo(todayDate);
  };

  const filteredWOs = useMemo(() => {
    return data.workOrders
      .filter((wo) => {
        // Dropdown Semua Cabang atau toggle cabang OFF = seluruh cabang aktif.
        const branchMatch = isAllBranchDropdown || !activeBranchOnly
          ? activeBranchIds.includes(wo.branchId)
          : wo.branchId === selectedBranchId;
        if (!branchMatch) return false;

        // Hari Ini ON mengabaikan range. OFF tanpa range berarti semua tanggal.
        const dateMatch = todayOnly
          ? wo.date === todayDate
          : (!dateFrom || wo.date >= dateFrom) && (!dateTo || wo.date <= dateTo);
        if (!dateMatch) return false;

        const matchesSearch =
          wo.woNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
          wo.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
    searchTerm,
    filterStatus,
    isAllBranchDropdown,
    activeBranchOnly,
    activeBranchIds,
    selectedBranchId,
    todayOnly,
    todayDate,
    dateFrom,
    dateTo,
  ]);

  const totalServices = formData.services.reduce((sum, s) => sum + s.price * s.qty, 0);

  // Default layanan saat WO baru: pengecekan gratis
  const defaultCekAcService = {
    id: `svc-cek-${Date.now()}`,
    itemId: undefined as string | undefined,
    code: 'CEK-AC',
    name: 'CEK AC - PENGECEKAN GRATIS',
    description: 'Pengecekan kondisi AC kendaraan',
    price: 0,
    qty: 1,
  };

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
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
      services: [{ ...defaultCekAcService, id: `svc-cek-${Date.now()}` }],
      findings: '',
      notes: '',
      status: 'Pengecekan',
    });
    setShowServiceForm(false);
    setServiceSearch('');
    setEditingWO(null);
    setWoDateUnlocked(false);
    setWoBackdateReason('');
  };

  const handleOpenModal = (wo?: WorkOrder) => {
    setDiagnosisMode(false);
    if (wo) {
      setEditingWO(wo);
      const matchedVehicle = data.vehicles.find(
        (v) => v.plateNumber === wo.plateNumber && v.customerName === wo.customerName
      );
      setFormData({
        date: wo.date,
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
        status: wo.status,
      });
      setWoDateUnlocked(wo.date !== new Date().toISOString().split('T')[0]);
      setWoBackdateReason(wo.backdateReason || '');
    } else {
      resetForm();
    }
    setShowModal(true);
  };

  const handleOpenDiagnosis = (wo: WorkOrder) => {
    handleOpenModal(wo);
    setDiagnosisMode(true);
  };

  const resumeDiagnosis = async (wo: WorkOrder) => {
    const result = await changeWorkOrderStatus(wo.id, 'Pengecekan');
    if (!result.ok) {
      window.alert(result.message || 'Diagnosa tidak dapat dilanjutkan.');
      return;
    }
    handleOpenDiagnosis({ ...wo, status: 'Pengecekan' });
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setDiagnosisMode(false);
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
    setFormData({
      ...formData,
      services: formData.services.filter((s) => s.id !== id),
    });
  };

  const handleUpdateService = (id: string, field: 'price' | 'qty' | 'description', value: number | string) => {
    setFormData(prev => ({
      ...prev,
      services: prev.services.map(s => s.id === id ? { ...s, [field]: value } : s),
    }));
  };

  const getDuplicateServices = (itemId: string) => {
    const item = data.items.find((entry) => entry.id === itemId);
    if (!item) return [];

    const candidateIds = item.type === 'Group'
      ? [item.id, ...(item.groupMembers || []).map(member => member.itemId)]
      : [item.id];

    return formData.services.filter(service => service.itemId && candidateIds.includes(service.itemId));
  };

  const isItemAdded = (itemId: string) => getDuplicateServices(itemId).length > 0;

  // Klik item/favorit langsung menambah satu baris. Panel tetap terbuka agar bisa tambah banyak.
  const handleUseItem = (itemId: string) => {
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
        name: `[PAKET] ${item.name}`,
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

      setFormData((prev) => ({
        ...prev,
        services: [...prev.services, groupHeader, ...memberLines],
      }));
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

    setFormData(prev => ({ ...prev, services: [...prev.services, service] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
    if (formData.services.length === 0) {
      window.alert('Tambahkan minimal 1 layanan/barang sebelum menyimpan.');
      return;
    }

    // Aturan: satu mobil hanya boleh punya satu WO aktif dalam satu waktu.
    if (!editingWO) {
      const active = findActiveWoByPlate(formData.plateNumber);
      if (active) {
        setActiveWoConflict(active);
        return;
      }
    }

    const today = new Date().toISOString().split('T')[0];
    if (formData.date > today) {
      window.alert('Tanggal WO tidak boleh melewati hari ini.');
      return;
    }
    if (formData.date < today && !hasPermission('wo:backdate')) {
      window.alert('Anda tidak memiliki hak akses tanggal mundur.');
      return;
    }
    if (data.settings.security.requireBackdateReason !== false && formData.date < today && !woBackdateReason.trim()) {
      window.alert('Alasan tanggal mundur wajib diisi.');
      return;
    }
    const targetBranch = resolveBranchId();
    const woNumber = generateDocumentNumber('workOrder', targetBranch, new Date(`${formData.date}T12:00:00`));

    try {
      if (editingWO) {
        await updateWorkOrder(editingWO.id, {
          ...editingWO,
          ...formData,
          backdateReason: woBackdateReason.trim() || undefined,
          total: totalServices,
          estimateTotal: diagnosisMode ? totalServices : editingWO.estimateTotal,
        });
        setSuccessMsg(diagnosisMode ? `Diagnosa ${editingWO.woNumber} berhasil disimpan.` : `${editingWO.woNumber} berhasil diperbarui.`);
      } else {
        await addWorkOrder({
          id: Date.now().toString(),
          woNumber,
          ...formData,
          backdateReason: woBackdateReason.trim() || undefined,
          total: totalServices,
          estimateTotal: formData.status === 'Pengecekan' ? totalServices : undefined,
          branchId: targetBranch,
        });
        const bName = data.branches.find(b => b.id === targetBranch)?.name || targetBranch;
        setSuccessMsg(`${woNumber} berhasil dibuat di ${bName}.`);
      }
      setTimeout(() => setSuccessMsg(''), 4000);
      handleCloseModal();
    } catch (err: any) {
      window.alert('Gagal menyimpan Order Kerja: ' + (err?.message || 'terjadi kesalahan'));
    }
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus order kerja ini?')) {
      deleteWorkOrder(id);
    }
  };

  // Alur status berurutan: dipanggil dari tombol aksi di kartu WO.
  const requestStatusChange = (wo: WorkOrder, next: WorkOrder['status']) => {
    setStatusReason('');
    setStatusDialog({ wo, next });
  };

  const confirmStatusChange = async () => {
    if (!statusDialog) return;
    const { wo, next } = statusDialog;
    try {
      const result = await changeWorkOrderStatus(wo.id, next, statusReason);
      if (!result.ok) {
        window.alert(result.message || 'Perubahan status ditolak.');
        return;
      }
      setSuccessMsg(`${wo.woNumber}: status berubah menjadi ${next}.`);
      setTimeout(() => setSuccessMsg(''), 4000);
      setStatusDialog(null);
      setStatusReason('');
    } catch (error: any) {
      window.alert(`Gagal mengubah status: ${error?.message || 'server tidak merespons'}`);
    }
  };

  const handleOpenInvoiceModal = (wo: WorkOrder) => {
    if (wo.status !== 'Selesai') {
      window.alert(`WO ${wo.woNumber} masih berstatus ${wo.status}. Ubah status menjadi Selesai sebelum membuat faktur.`);
      return;
    }
    setInvoiceWO(wo);
    setInvoicePayment(wo.total);
    setInvoicePaymentMethod('Tunai');
    const today = new Date().toISOString().split('T')[0];
    setInvoiceDate(today);
    setInvoicePaymentDate(today);
    setInvoiceDateUnlocked(false);
    setInvoicePaymentDateUnlocked(false);
    setInvoiceBackdateReason('');
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
      const today = new Date().toISOString().split('T')[0];
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
      setIsCreatingInvoice(true);
      try {
        const invoice = await createInvoiceFromWO(invoiceWO.id, invoicePayment, invoicePaymentMethod, invoiceDate, invoicePayment > 0 ? invoicePaymentDate : undefined, invoiceBackdateReason);
      if (invoice) {
        setSuccessMsg(`Faktur ${invoice.invoiceNumber} berhasil dibuat dari ${invoiceWO.woNumber}!`);
        setTimeout(() => setSuccessMsg(''), 4000);
      }
        setInvoiceWO(null);
        setInvoicePayment(0);
      } catch (error: any) {
        window.alert(`Gagal membuat faktur: ${error?.message || 'terjadi kesalahan'}`);
      } finally {
        setIsCreatingInvoice(false);
      }
    }
  };

  const statusColors: Record<string, string> = {
    Pengecekan: 'bg-amber-100 text-amber-800',
    Pending: 'bg-orange-100 text-orange-800',
    Proses: 'bg-blue-100 text-blue-800',
    Selesai: 'bg-green-100 text-green-800',
    Dibayar: 'bg-purple-100 text-purple-800',
  };
  const statusLabel = (status: WorkOrder['status']) => status === 'Pengecekan' ? 'Diagnosa' : status === 'Pending' ? 'Diagnosa Pending' : status === 'Proses' ? 'Dikerjakan' : status;
  const diagnosisMeasurementLabel = (wo: WorkOrder) => [
    wo.diagnosisTemperature != null ? `Suhu ${wo.diagnosisTemperature}°C` : '',
    wo.diagnosisLp != null ? `LP ${wo.diagnosisLp} PSI` : '',
    wo.diagnosisHp != null ? `HP ${wo.diagnosisHp} PSI` : '',
  ].filter(Boolean).join(' · ');

  const isPendingExpired = (wo: WorkOrder) =>
    wo.status === 'Pending' && !!wo.pendingUntil && new Date(wo.pendingUntil).getTime() < Date.now();

  const pendingDaysLeft = (wo: WorkOrder) =>
    Math.max(0, Math.ceil((new Date(wo.pendingUntil || Date.now()).getTime() - Date.now()) / 86400000));

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
    const phone = customerPhoneForWO(wo).replace(/^[—â€“]+$/, '');
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

  const createNewFromPending = async (wo: WorkOrder) => {
    const created = await continueWorkOrder(wo.id, wo.branchId);
    if (created) {
      setSuccessMsg(`${created.woNumber} dibuat dari ${wo.woNumber}; pelanggan dan kendaraan sudah terisi.`);
      setTimeout(() => setSuccessMsg(''), 5000);
    }
  };

  return (
    <div className="space-y-6 lg:-mx-5 lg:-mt-5 lg:space-y-1">
      <div className="flex items-end gap-0.5 border-b border-blue-600 bg-gray-100 px-1">
        <button type="button" onClick={requestCloseEditor} className={`flex h-11 w-14 items-center justify-center rounded-t-md border border-b-0 text-sm font-semibold transition-colors ${!showModal ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-gray-300 bg-emerald-500 text-white hover:bg-emerald-600'}`} title="Daftar Order Kerja">
          <ListPlus className="h-5 w-5" />
        </button>
        {hasPermission('wo:create') && (
          <button
            type="button"
            onClick={() => {
              if (showModal && !diagnosisMode && !editingWO) return;
              if (currentBranchId === 'ALL') {
                window.alert('Pilih cabang aktif dulu dari menu dropdown di header sebelum membuat Order Kerja.\n\nWO harus terikat pada satu cabang agar stok, faktur, dan laporan cabang akurat.');
                return;
              }
              handleOpenModal();
            }}
            className="flex h-11 items-center gap-1 rounded-t-md border border-b-0 border-gray-300 bg-gray-100 px-4 text-sm font-semibold text-gray-600 transition-colors hover:bg-white hover:text-blue-700"
          >
            <Plus className="h-4 w-4" /> New
          </button>
        )}
        {showModal && diagnosisMode && editingWO ? (
          <button
            type="button"
            className="flex h-11 items-center gap-2 rounded-t-md border border-b-0 border-blue-600 bg-blue-600 px-5 text-sm font-semibold text-white"
          >
            <Wrench className="h-4 w-4" /> DIAGNOSA {editingWO.woNumber}
            <X className="ml-1 h-4 w-4" onClick={(event) => { event.stopPropagation(); handleCloseModal(); }} />
          </button>
        ) : showModal && editingWO ? (
          <button type="button" className="flex h-11 items-center gap-2 rounded-t-md border border-b-0 border-blue-600 bg-blue-600 px-5 text-sm font-semibold text-white">
            <Edit className="h-4 w-4" /> Edit {editingWO.woNumber}
            <X className="ml-1 h-4 w-4" onClick={(event) => { event.stopPropagation(); handleCloseModal(); }} />
          </button>
        ) : showModal && hasPermission('wo:create') ? (
          <button type="button" className="flex h-11 items-center gap-2 rounded-t-md border border-b-0 border-blue-600 bg-blue-600 px-5 text-sm font-semibold text-white">
            Data Baru
            <X className="ml-1 h-4 w-4" onClick={(event) => { event.stopPropagation(); requestCloseEditor(); }} />
          </button>
        ) : null}
        <div className="ml-auto flex h-11 items-center gap-2 border-b-0 px-4 text-xs font-medium text-gray-500">
          <span>{todayOnly ? 'Hari ini' : 'Semua tanggal'}</span>
          <span className="text-gray-300">•</span>
          <span className="font-semibold text-gray-700">{branchScopeLabel}</span>
          <span className="text-gray-300">•</span>
          <span className="font-semibold text-blue-700">{filteredWOs.length} WO</span>
        </div>
      </div>

      {!showModal && <>
      {/* Success Message */}
      {successMsg && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3 animate-pulse">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-sm font-medium text-green-800">{successMsg}</p>
        </div>
      )}

      {/* Filters */}
      <div className="px-3 py-0.5">
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
              <option value="Pengecekan">1. Diagnosa</option>
              <option value="Pending">2. Diagnosa Pending</option>
              <option value="Proses">3. Dikerjakan</option>
              <option value="Selesai">4. Selesai</option>
              <option value="Dibayar">5. Dibayar</option>
            </select>

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
                  <button type="button" onClick={setLastSevenDays} className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">7 Hari Terakhir</button>
                  <button type="button" onClick={setCurrentMonth} className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">Bulan Ini</button>
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
                  <th className="px-4 py-3 font-semibold">No. WO / Tanggal</th>
                  <th className="px-4 py-3 font-semibold">Pelanggan</th>
                  <th className="px-4 py-3 font-semibold">Kendaraan</th>
                  <th className="px-4 py-3 font-semibold">Layanan</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                  <th className="px-4 py-3 text-center font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredWOs.map((wo) => (
                  <tr key={wo.id} className="transition-colors hover:bg-blue-50/50">
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => setDetailWO(wo)} className="text-left">
                        <span className="block font-mono text-sm font-bold text-blue-700 hover:underline">{wo.woNumber}</span>
                        <span className="mt-0.5 block text-xs text-gray-500">
                          {wo.date}
                          {canViewAllBranches && (isAllBranchDropdown || !activeBranchOnly) && (
                            <> · {data.branches.find(b => b.id === wo.branchId)?.name.replace('CABANG ', '')}</>
                          )}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block max-w-[180px] truncate text-sm font-semibold text-gray-900">{wo.customerName}</span>
                      <span className="mt-0.5 block text-xs text-gray-500">{customerPhoneForWO(wo)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block max-w-[210px] truncate text-sm text-gray-900">{wo.vehicleInfo}</span>
                      <span className="block text-xs font-semibold text-gray-500">{wo.plateNumber}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block max-w-[230px] truncate text-sm text-gray-800">
                        {wo.services.map(service => service.name).join(', ') || 'Belum ada layanan'}
                      </span>
                      <span className="block text-xs text-gray-500">{wo.services.length} item layanan</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-bold text-gray-900">
                      Rp {wo.total.toLocaleString('id-ID')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusColors[wo.status] || 'bg-gray-100 text-gray-700'}`}>
                        {statusLabel(wo.status)}
                      </span>
                      {wo.status === 'Pending' && <span className="mt-1 block max-w-[150px] truncate text-[10px] text-orange-700" title={wo.pendingReason}>{wo.pendingReason || '-'}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {hasPermission('wo:edit') && wo.status === 'Pengecekan' && !wo.continuedToWoId && (
                          <>
                            <button onClick={() => handleOpenDiagnosis(wo)} className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">Hasil Diagnosa</button>
                            <button onClick={() => requestStatusChange(wo, 'Pending')} className="rounded-lg bg-orange-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-orange-600">Pending</button>
                          </>
                        )}
                        {hasPermission('wo:edit') && wo.status === 'Pending' && !wo.continuedToWoId && (
                          isPendingExpired(wo)
                            ? <button onClick={() => createNewFromPending(wo)} className="rounded-lg bg-cyan-600 px-2.5 py-1.5 text-xs font-semibold text-white">Buat WO Baru</button>
                            : <button onClick={() => void resumeDiagnosis(wo)} className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white">Lanjutkan Diagnosa ({pendingDaysLeft(wo)} hari)</button>
                        )}
                        {hasPermission('wo:edit') && wo.status === 'Proses' && (
                          <button onClick={() => requestStatusChange(wo, 'Selesai')} className="rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-green-700">
                            Selesai
                          </button>
                        )}
                        {hasPermission('invoice:create') && wo.status === 'Selesai' && !wo.invoiceId && (
                          <button onClick={() => handleOpenInvoiceModal(wo)} className="rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-green-700">
                            Faktur
                          </button>
                        )}
                        <button onClick={() => setDetailWO(wo)} className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 hover:text-blue-700" title="Lihat detail">
                          <Eye className="h-4 w-4" />
                        </button>
                        {hasPermission('wo:edit') && (
                          <button onClick={() => handleOpenModal(wo)} className="rounded-lg p-2 text-blue-600 hover:bg-blue-100" title="Edit">
                            <Edit className="h-4 w-4" />
                          </button>
                        )}
                        {hasPermission('wo:delete') && (
                          <button onClick={() => handleDelete(wo.id)} className="rounded-lg p-2 text-red-600 hover:bg-red-100" title="Hapus">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
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

      {/* Mobile Work Order Cards */}
      <div className="space-y-4 lg:hidden">
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
                      {wo.status === 'Pengecekan' && '1.'}
                      {wo.status === 'Pending' && '2.'}
                      {wo.status === 'Proses' && '3.'}
                      {wo.status === 'Selesai' && '4.'}
                      {wo.status === 'Dibayar' && '5.'}
                      {wo.status === 'Batal' && '✕'}
                      <span>{statusLabel(wo.status)}</span>
                    </span>

                    {/* Tombol aksi status berurutan */}
                    {hasPermission('wo:edit') && wo.status === 'Pengecekan' && !wo.continuedToWoId && (
                      <>
                        <button
                          onClick={() => handleOpenDiagnosis(wo)}
                          className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                          title="Pelanggan setuju → mulai pengerjaan"
                        >
                          Hasil Diagnosa
                        </button>
                        <button
                          onClick={() => requestStatusChange(wo, 'Pending')}
                          className="inline-flex items-center rounded-lg bg-orange-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-orange-600"
                          title="Pelanggan pulang dan mempertimbangkan"
                        >
                          Pending
                        </button>
                      </>
                    )}
                    {hasPermission('wo:edit') && wo.status === 'Pending' && !wo.continuedToWoId && (
                      isPendingExpired(wo) ? (
                        <button onClick={() => createNewFromPending(wo)} className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white">Buat WO Baru dari Data Ini</button>
                      ) : (
                        <button onClick={() => void resumeDiagnosis(wo)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">Lanjutkan Diagnosa · {pendingDaysLeft(wo)} hari tersisa</button>
                      )
                    )}
                    {wo.status === 'Pending' && (
                      <span className="text-[11px] text-orange-700">Alasan: {wo.pendingReason || '-'}{isPendingExpired(wo) ? ' · Kedaluwarsa' : ''}</span>
                    )}
                    {hasPermission('wo:edit') && wo.status === 'Proses' && (
                      <>
                        <button
                          onClick={() => requestStatusChange(wo, 'Selesai')}
                          className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
                          title="Pekerjaan selesai, siap dibuat faktur"
                        >
                          Tandai Selesai
                        </button>
                        <button
                          onClick={() => requestStatusChange(wo, 'Pengecekan')}
                          className="inline-flex items-center rounded-lg border border-amber-300 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
                          title="Kembalikan ke Pengecekan"
                        >
                          ← Pengecekan
                        </button>
                        <button
                          onClick={() => requestStatusChange(wo, 'Batal')}
                          className="inline-flex items-center rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                        >
                          Batal
                        </button>
                      </>
                    )}
                    {hasPermission('wo:edit') && wo.status === 'Selesai' && !wo.invoiceId && (
                      <button
                        onClick={() => requestStatusChange(wo, 'Proses')}
                        className="inline-flex items-center rounded-lg border border-blue-300 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
                        title="Perlu tambah item / koreksi"
                      >
                        ← Proses
                      </button>
                    )}
                    {wo.status === 'Batal' && wo.cancelReason && (
                      <span className="text-[11px] italic text-gray-500" title={wo.cancelReason}>
                        Alasan: {wo.cancelReason}
                      </span>
                    )}
                    {wo.invoiceId ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm font-medium">
                        <FileText className="w-4 h-4" />
                        {wo.invoiceNumber}
                      </span>
                    ) : wo.status === 'Selesai' ? (
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
                    ) : (wo.status === 'Pengecekan' || wo.status === 'Proses') ? (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-500"
                        title="Tombol faktur tersedia setelah status WO menjadi Selesai"
                      >
                        <Receipt className="h-3.5 w-3.5" />
                        Selesaikan WO untuk membuat faktur
                      </span>
                    ) : null}
                    {hasPermission('wo:create')
                      && wo.status === 'Pengecekan'
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
                    <button
                      type="button"
                      onClick={() => void copyWorkOrder(wo)}
                      className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                      title="Salin ringkasan WO"
                    >
                      <Copy className="h-3.5 w-3.5" /> Salin
                    </button>
                    <button
                      type="button"
                      onClick={() => shareWorkOrderToWhatsApp(wo)}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                      title="Bagikan WO ke WhatsApp"
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </button>
                    {hasPermission('wo:edit') && (
                      <button
                        onClick={() => handleOpenModal(wo)}
                        className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    )}
                    {hasPermission('wo:delete') && (
                      <button
                        onClick={() => handleDelete(wo.id)}
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

                {wo.status === 'Pengecekan' && !wo.continuedToWoId && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <CalendarClock className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                    <p className="text-xs text-amber-800">
                      <strong>Pengecekan gratis</strong> — estimasi Rp {wo.total.toLocaleString('id-ID')}.
                      Menunggu persetujuan pelanggan sebelum lanjut ke Proses.
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

      {/* Desktop Detail Drawer */}
      {detailWO && (
        <div className="fixed inset-0 z-50 hidden lg:block" role="dialog" aria-modal="true">
          <button type="button" aria-label="Tutup detail" onClick={() => setDetailWO(null)} className="absolute inset-0 bg-gray-950/35" />
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-200 px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Detail Order Kerja</p>
                <h3 className="mt-1 font-mono text-xl font-bold text-gray-900">{detailWO.woNumber}</h3>
                <p className="mt-1 text-sm text-gray-500">{detailWO.date} · {data.branches.find(b => b.id === detailWO.branchId)?.name}</p>
              </div>
              <button onClick={() => setDetailWO(null)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto p-6">
              <div className="flex items-center justify-between">
                <span className={`inline-flex rounded-full px-3 py-1.5 text-sm font-semibold ${statusColors[detailWO.status] || 'bg-gray-100 text-gray-700'}`}>{statusLabel(detailWO.status)}</span>
                <span className="text-xl font-bold text-blue-700">Rp {detailWO.total.toLocaleString('id-ID')}</span>
              </div>
              <div className="grid grid-cols-2 gap-4 rounded-xl border border-gray-200 p-4">
                <div>
                  <p className="text-xs text-gray-500">Pelanggan</p>
                  <p className="mt-1 font-semibold text-gray-900">{detailWO.customerName}</p>
                  <p className="text-xs text-gray-500">{customerPhoneForWO(detailWO)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Nomor Plat</p>
                  <p className="mt-1 font-semibold text-gray-900">{detailWO.plateNumber}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-gray-500">Kendaraan</p>
                  <p className="mt-1 text-sm text-gray-900">{detailWO.vehicleInfo}</p>
                </div>
              </div>
              <div>
                <h4 className="mb-2 font-semibold text-gray-900">Layanan ({detailWO.services.length})</h4>
                <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                  {detailWO.services.map(service => (
                    <div key={service.id} className="flex items-center justify-between px-4 py-3 text-sm">
                      <span><strong>{service.name}</strong> <span className="text-gray-500">×{service.qty}</span></span>
                      <span className="font-medium">Rp {(service.price * service.qty).toLocaleString('id-ID')}</span>
                    </div>
                  ))}
                </div>
              </div>
              {(detailWO.findings || diagnosisMeasurementLabel(detailWO)) && (
                <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
                  <h4 className="font-semibold text-cyan-900">Hasil Diagnosa</h4>
                  {diagnosisMeasurementLabel(detailWO) && <p className="mt-2 text-sm font-semibold text-cyan-800">{diagnosisMeasurementLabel(detailWO)}</p>}
                  {detailWO.findings && <p className="mt-2 whitespace-pre-wrap text-sm text-cyan-900">{detailWO.findings}</p>}
                </div>
              )}
              {detailWO.description && <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900"><strong>Keluhan/Keterangan:</strong><br />{detailWO.description}</div>}
              {detailWO.notes && <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700"><strong>Catatan:</strong><br />{detailWO.notes}</div>}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 bg-gray-50 px-6 py-4">
              {hasPermission('wo:edit') && detailWO.status === 'Pengecekan' && !detailWO.continuedToWoId && (
                <button onClick={() => { handleOpenDiagnosis(detailWO); setDetailWO(null); }} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Hasil Diagnosa</button>
              )}
              {hasPermission('wo:edit') && detailWO.status === 'Proses' && (
                <button onClick={() => { requestStatusChange(detailWO, 'Selesai'); setDetailWO(null); }} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">Tandai Selesai</button>
              )}
              {hasPermission('invoice:create') && detailWO.status === 'Selesai' && !detailWO.invoiceId && (
                <button onClick={() => { handleOpenInvoiceModal(detailWO); setDetailWO(null); }} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">Buat Faktur</button>
              )}
              {hasPermission('wo:edit') && <button onClick={() => { handleOpenModal(detailWO); setDetailWO(null); }} className="rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">Edit WO</button>}
              <button onClick={() => setDetailWO(null)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100">Tutup</button>
            </div>
          </aside>
        </div>
      )}
      </>}

      {/* Data Baru / Edit: subtab penuh pada desktop, modal pada mobile */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 lg:static lg:z-auto lg:block lg:bg-transparent lg:px-3 lg:pb-3 lg:pt-0">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-2xl lg:max-h-none lg:max-w-none lg:rounded-md lg:border lg:border-gray-200 lg:shadow-sm">
            <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-xl border-b border-gray-200 bg-white px-6 py-4 lg:hidden">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {diagnosisMode && editingWO ? `DIAGNOSA ${editingWO.woNumber}` : editingWO ? 'Edit Order Kerja' : 'Buat Order Kerja Baru'}
                </h3>
                <p className="text-sm text-gray-500">{diagnosisMode ? 'Isi hasil pemeriksaan dan estimasi layanan' : 'Isi data order kerja service AC'}</p>
              </div>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
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
              {diagnosisMode && editingWO ? (
                <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm md:grid-cols-2">
                  <div><span className="block text-xs font-semibold uppercase text-slate-500">Pelanggan</span><strong>{editingWO.customerName}</strong><span className="ml-2 text-slate-500">{customerPhoneForWO(editingWO)}</span></div>
                  <div><span className="block text-xs font-semibold uppercase text-slate-500">Tanggal masuk</span><strong>{editingWO.date}</strong></div>
                  <div><span className="block text-xs font-semibold uppercase text-slate-500">Kendaraan</span><strong>{editingWO.vehicleInfo}</strong><span className="ml-2 font-mono text-blue-700">{editingWO.plateNumber}</span></div>
                  <div><span className="block text-xs font-semibold uppercase text-slate-500">Keluhan awal</span><strong>{editingWO.description || '-'}</strong></div>
                </div>
              ) : <>
              {/* Pelanggan dan tanggal */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-700">
                    <User className="h-4 w-4 text-blue-600" />
                    Data Pelanggan <span className="text-red-500">*</span>
                  </label>
                  <CustomerPicker value={formData.customerRefId} onChange={handleCustomerSelect} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tanggal <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    max={new Date().toISOString().split('T')[0]}
                    disabled={!woDateUnlocked}
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg disabled:bg-gray-100 disabled:text-gray-500 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <button type="button" onClick={() => hasPermission('wo:backdate') ? setWoDateUnlocked(v => !v) : window.alert('Anda tidak memiliki hak Ubah Tanggal WO.')} className="mt-1 text-xs font-semibold text-blue-600">
                    {woDateUnlocked ? 'Kunci ke hari ini' : 'Buka tanggal mundur'}
                  </button>
                </div>
              </div>
              {data.settings.security.requireBackdateReason !== false && formData.date < new Date().toISOString().split('T')[0] && (
                <div className="grid grid-cols-1 md:grid-cols-2"><span /><input required value={woBackdateReason} onChange={(e) => setWoBackdateReason(e.target.value)} placeholder="Alasan tanggal WO dimundurkan" className="w-full px-4 py-2.5 border border-amber-400 bg-amber-50 rounded-lg" /></div>
              )}

              {/* Kendaraan mengikuti pelanggan yang dipilih */}
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                    <Car className="w-4 h-4 text-orange-600" />
                    Data Kendaraan <span className="text-red-500">*</span>
                  </label>
                  <VehiclePicker
                    customer={selectedCustomer}
                    value={formData.vehicleRefId}
                    onChange={handleVehicleSelect}
                  />
                </div>

                <div>
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

              {/* Services */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700">{diagnosisMode ? 'Estimasi Layanan' : 'Layanan Service AC'}</label>
                  <button
                    type="button"
                    onClick={() => setShowServiceForm(!showServiceForm)}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {showServiceForm ? 'Batal' : '+ Tambah Layanan'}
                  </button>
                </div>

                {showServiceForm && (
                  <div className="relative z-20 mb-4 flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={serviceSearch}
                        onChange={(event) => setServiceSearch(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' || !serviceSearch.trim()) return;
                          event.preventDefault();
                          const query = serviceSearch.trim().toLowerCase();
                          const exact = availableServiceItems.find(item => item.code.toLowerCase() === query || (item.barcode || '').toLowerCase() === query);
                          if (exact) { handleUseItem(exact.id); setServiceSearch(''); }
                        }}
                        autoFocus
                        placeholder="Cari kode, barcode, atau nama layanan/barang..."
                        className="w-full rounded-lg border border-blue-400 py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                      {serviceSearch.trim() && (
                        <div className="absolute left-0 right-0 top-full mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl">
                          {availableServiceItems.filter(item => {
                            const query = serviceSearch.toLowerCase().trim();
                            return item.code.toLowerCase().includes(query) || (item.barcode || '').toLowerCase().includes(query) || item.name.toLowerCase().includes(query) || (item.receiptDescription || '').toLowerCase().includes(query) || item.categoryName.toLowerCase().includes(query);
                          }).slice(0, 12).map(item => {
                            const added = isItemAdded(item.id);
                            return (
                              <button key={item.id} type="button" disabled={added} onClick={() => { handleUseItem(item.id); setServiceSearch(''); }} className={`flex w-full items-center gap-3 border-b border-gray-100 px-3 py-2 text-left last:border-0 ${added ? 'cursor-not-allowed bg-green-50 opacity-60' : 'hover:bg-blue-50'}`}>
                                <span className="w-24 flex-shrink-0 font-mono text-xs text-gray-500">{item.code}</span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium text-gray-900">{item.name}</span>
                                  <span className="block truncate text-[10px] text-gray-400">{item.categoryName} · {item.type}</span>
                                </span>
                                <span className="flex-shrink-0 text-sm font-semibold text-gray-700">Rp {item.sellingPrice.toLocaleString('id-ID')}</span>
                                {added && <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-600" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {hasPermission('item:create') && (
                      <button type="button" onClick={() => setShowQuickAddItem(true)} className="inline-flex h-10 items-center gap-1 rounded-lg border border-green-300 px-3 text-sm font-medium text-green-700 hover:bg-green-50">
                        <Plus className="h-4 w-4" /> Baru
                      </button>
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

                {formData.services.length > 0 ? (
                  <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                    <table className="min-w-[720px] w-full text-sm">
                      <thead className="bg-slate-100 text-xs text-slate-600">
                        <tr>
                          <th className="w-10 px-3 py-2.5 text-center font-medium">#</th>
                          <th className="px-3 py-2.5 text-left font-medium">Layanan / Barang</th>
                          <th className="w-24 px-3 py-2.5 text-center font-medium">Qty</th>
                          <th className="w-40 px-3 py-2.5 text-right font-medium">Harga Satuan</th>
                          <th className="w-36 px-3 py-2.5 text-right font-medium">Subtotal</th>
                          <th className="w-14 px-3 py-2.5 text-center font-medium">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {formData.services.map((service, index) => {
                          const isGroupHeader = service.name.startsWith('[PAKET]');
                          const isGroupMember = service.name.startsWith('   -');
                          return (
                            <tr key={service.id} className={isGroupHeader ? 'bg-purple-50' : isGroupMember ? 'bg-slate-50' : 'hover:bg-blue-50/40'}>
                              <td className="px-3 py-2 text-center text-xs text-gray-400">{index + 1}</td>
                              <td className={`px-3 py-2 ${isGroupMember ? 'pl-8' : ''}`}>
                                <div className="flex items-start gap-2">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <p className={`font-semibold ${isGroupHeader ? 'text-purple-700' : 'text-gray-900'}`}>{service.name}</p>
                                      {isGroupHeader && <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">Harga Paket</span>}
                                      {isGroupMember && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">Komponen</span>}
                                    </div>
                                    {service.code && <p className="font-mono text-[10px] text-gray-400">{service.code}</p>}
                                    <input
                                      type="text"
                                      value={service.description || ''}
                                      onChange={(e) => handleUpdateService(service.id, 'description', e.target.value)}
                                      placeholder="Keterangan (opsional)"
                                      className="mt-1 w-full border-b border-dashed border-gray-200 bg-transparent py-0.5 text-xs text-gray-500 outline-none focus:border-blue-500"
                                    />
                                  </div>
                                </div>
                              </td>
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
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-blue-300 bg-blue-50">
                          <td colSpan={4} className="px-3 py-3 text-right font-semibold text-gray-900">TOTAL ESTIMASI</td>
                          <td className="px-3 py-3 text-right text-lg font-bold text-blue-700 whitespace-nowrap">Rp {totalServices.toLocaleString('id-ID')}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-center space-y-3">
                    <div>
                      <Wrench className="w-8 h-8 mx-auto mb-1 text-amber-400" />
                      <p className="text-sm text-amber-700 font-medium">Belum ada layanan</p>
                      <p className="text-xs text-amber-600 mt-0.5">
                        Klik tombol di bawah untuk mulai dengan pengecekan gratis,
                        atau tambah layanan manual.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const defaultService = {
                          id: `svc-cek-${Date.now()}`,
                          itemId: undefined,
                          code: 'CEK-AC',
                          name: 'CEK AC - PENGECEKAN GRATIS',
                          description: 'Pengecekan kondisi AC kendaraan',
                          price: 0,
                          qty: 1,
                        };
                        setFormData(prev => ({
                          ...prev,
                          services: [defaultService],
                        }));
                      }}
                      className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      + Mulai dengan Pengecekan Gratis (Rp 0)
                    </button>
                  </div>
                )}
              </div>

              {/* Catatan Internal / Hasil diagnosa */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{diagnosisMode ? 'Hasil Diagnosa' : 'Catatan Internal Bengkel'}</label>
                {diagnosisMode && (
                  <div className="mb-3 grid grid-cols-3 gap-2">
                    <label className="text-xs font-semibold text-gray-600">
                      Suhu (°C)
                      <input type="number" step="0.1" value={formData.diagnosisTemperature ?? ''} onChange={(event) => setFormData(prev => ({ ...prev, diagnosisTemperature: event.target.value === '' ? undefined : Number(event.target.value) }))} placeholder="8" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                    </label>
                    <label className="text-xs font-semibold text-gray-600">
                      LP (PSI)
                      <input type="number" step="0.1" min="0" value={formData.diagnosisLp ?? ''} onChange={(event) => setFormData(prev => ({ ...prev, diagnosisLp: event.target.value === '' ? undefined : Number(event.target.value) }))} placeholder="35" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                    </label>
                    <label className="text-xs font-semibold text-gray-600">
                      HP (PSI)
                      <input type="number" step="0.1" min="0" value={formData.diagnosisHp ?? ''} onChange={(event) => setFormData(prev => ({ ...prev, diagnosisHp: event.target.value === '' ? undefined : Number(event.target.value) }))} placeholder="180" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                    </label>
                  </div>
                )}
                {editingWO && (editingWO.findings || diagnosisMeasurementLabel(editingWO)) && (
                  <div className="mt-4 rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-900">
                    <p className="font-semibold">Hasil Diagnosa</p>
                    {diagnosisMeasurementLabel(editingWO) && <p className="mt-1 font-medium">{diagnosisMeasurementLabel(editingWO)}</p>}
                    {editingWO.findings && <p className="mt-1 whitespace-pre-wrap">{editingWO.findings}</p>}
                  </div>
                )}
                <textarea
                  value={diagnosisMode ? formData.findings : formData.notes}
                  onChange={(e) => setFormData(prev => diagnosisMode ? { ...prev, findings: e.target.value } : { ...prev, notes: e.target.value })}
                  placeholder={diagnosisMode ? 'Tuliskan hasil pemeriksaan teknisi…' : 'Catatan internal teknisi (sparepart, kendala, dll)...'}
                  rows={2}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-lg shadow-blue-600/20"
                >
                  <Save className="w-4 h-4" />
                  {diagnosisMode ? 'Simpan Diagnosa' : editingWO ? 'Simpan Perubahan' : 'Simpan Order Kerja'}
                </button>
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
                    onClick={() => { const target = conflict; setActiveWoConflict(null); handleOpenModal(target); }}
                    className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    {sameBranch ? 'Buka & Lanjutkan WO Ini' : 'Buka WO (Read-only, cabang lain)'}
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

      {/* ===== Konfirmasi ubah status WO ===== */}
      {statusDialog && (() => {
        const { wo, next } = statusDialog;
        const needsReason = next === 'Pending'
          || next === 'Batal'
          || (wo.status === 'Proses' && next === 'Pengecekan')
          || (wo.status === 'Selesai' && next === 'Proses');
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
              <div className="flex items-center justify-between rounded-t-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-white">
                <div className="flex items-center gap-2">
                  <ArrowLeftRight className="h-5 w-5" />
                  <h3 className="text-lg font-bold">Ubah status WO</h3>
                </div>
                <button onClick={() => setStatusDialog(null)} className="rounded-lg p-2 hover:bg-white/20"><X className="h-5 w-5" /></button>
              </div>
              <div className="space-y-4 p-6 text-sm">
                <p className="text-gray-700">
                  Ubah status <strong className="font-mono">{wo.woNumber}</strong> dari{' '}
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${statusColors[wo.status]}`}>{wo.status}</span>
                  {' → '}
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${statusColors[next]}`}>{next}</span>?
                </p>
                <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600 space-y-0.5">
                  <p>Pelanggan: <strong>{wo.customerName}</strong> ({wo.plateNumber})</p>
                  <p>Layanan: {wo.services.length} item</p>
                  <p>Total: Rp {wo.total.toLocaleString('id-ID')}</p>
                </div>
                {needsReason && (
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="block text-xs font-semibold text-gray-700">Alasan <span className="text-red-500">*</span></label>
                      {next === 'Pending' && hasPermission('settings:edit') && (
                        <button type="button" onClick={() => { setPendingTemplateDraft(data.settings.pendingReasonTemplates || DEFAULT_PENDING_REASONS); setShowPendingTemplateEditor(true); }} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800">
                          <Edit className="h-3 w-3" /> Kelola Template
                        </button>
                      )}
                    </div>
                    {next === 'Pending' && (
                      <div className="mb-2 grid grid-cols-2 gap-2">
                        {(data.settings.pendingReasonTemplates || DEFAULT_PENDING_REASONS).filter(template => template.isActive).map(template => (
                          <button key={template.id} type="button" onClick={() => setStatusReason(template.label.toLowerCase() === 'lainnya' ? '' : template.label)} className={`rounded-lg border px-2 py-2 text-xs font-semibold ${statusReason === template.label ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-300 text-gray-600'}`}>{template.label}</button>
                        ))}
                      </div>
                    )}
                    <textarea
                      value={statusReason}
                      onChange={(e) => setStatusReason(e.target.value)}
                      rows={3}
                      placeholder={next === 'Pending' ? 'Pilih alasan di atas atau tulis alasan lainnya' : next === 'Batal' ? 'Contoh: pelanggan menolak estimasi' : 'Contoh: perlu tambah sparepart'}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                )}
                <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
                  <button onClick={() => setStatusDialog(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Batal</button>
                  <button
                    onClick={confirmStatusChange}
                    disabled={needsReason && !statusReason.trim()}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Ya, Ubah Status
                  </button>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-4 rounded-t-xl flex items-center justify-between">
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

            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Pelanggan</span>
                  <span className="font-medium text-gray-900">{invoiceWO.customerName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Kendaraan</span>
                  <span className="font-medium text-gray-900">{invoiceWO.plateNumber}</span>
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
                    <input type="date" max={new Date().toISOString().split('T')[0]} disabled={!invoiceDateUnlocked} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-100" />
                    <button type="button" onClick={() => hasPermission('invoice:backdate') ? setInvoiceDateUnlocked(v => !v) : window.alert('Tidak memiliki hak ubah tanggal faktur.')} className="text-xs font-semibold text-blue-600 mt-1">Buka tanggal</button>
                  </div>
                  {invoicePayment > 0 && <div>
                    <label className="block text-sm font-medium mb-1">Tanggal Pembayaran</label>
                    <input type="date" min={invoiceDate} max={new Date().toISOString().split('T')[0]} disabled={!invoicePaymentDateUnlocked} value={invoicePaymentDate} onChange={(e) => setInvoicePaymentDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-100" />
                    <button type="button" onClick={() => hasPermission('payment:backdate') ? setInvoicePaymentDateUnlocked(v => !v) : window.alert('Tidak memiliki hak ubah tanggal pembayaran.')} className="text-xs font-semibold text-blue-600 mt-1">Buka tanggal</button>
                  </div>}
                </div>
                {data.settings.security.requireBackdateReason !== false && (invoiceDate < new Date().toISOString().split('T')[0] || (invoicePayment > 0 && invoicePaymentDate < new Date().toISOString().split('T')[0])) && (
                  <input required value={invoiceBackdateReason} onChange={(e) => setInvoiceBackdateReason(e.target.value)} placeholder="Alasan transaksi tanggal mundur" className="w-full mb-4 px-3 py-2 border border-amber-400 bg-amber-50 rounded-lg" />
                )}
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Metode Pembayaran
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['Tunai', 'QRIS/Transfer'] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setInvoicePaymentMethod(method)}
                      className={`rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors ${
                        invoicePaymentMethod === method
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Jumlah Pembayaran (Rp)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatPaymentInput(invoicePayment)}
                  onChange={(e) => setInvoicePayment(parsePaymentInput(e.target.value))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-right font-semibold tabular-nums focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setInvoicePayment(invoiceWO.total)}
                    className="flex-1 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Bayar Lunas
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvoicePayment(0)}
                    className="flex-1 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Belum Bayar
                  </button>
                </div>
                <p className={`mt-2 text-sm font-medium ${invoicePayment >= invoiceWO.total ? 'text-green-600' : 'text-yellow-600'}`}>
                  Status: {invoicePayment >= invoiceWO.total ? 'Lunas' : `Belum Lunas (sisa Rp ${(invoiceWO.total - invoicePayment).toLocaleString('id-ID')})`}
                </p>
              </div>
            </div>

            <div className="px-6 pb-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setInvoiceWO(null)}
                className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleCreateInvoice}
                disabled={isCreatingInvoice}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors shadow-lg shadow-green-600/20"
              >
                <Receipt className="w-4 h-4" />
                {isCreatingInvoice ? 'Menyimpan...' : 'Buat Faktur'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
