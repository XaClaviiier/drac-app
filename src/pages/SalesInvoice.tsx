import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Edit, Trash2, FileText, X, Save, Filter, Download, Printer, Wrench, CheckCircle2, Receipt, User, Car, Copy, MessageCircle, RefreshCw, ChevronDown, Eye, Settings2, AlertTriangle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { SalesInvoice } from '../types';
import CustomerPicker from '../components/CustomerPicker';
import VehiclePicker from '../components/VehiclePicker';
import { api } from '../lib/apiClient';
import { localDateKey } from '../lib/date';
import ItemSearchOption from '../components/ItemSearchOption';
import { ui } from '../components/ui/interfaceStandards';
import IndonesianDateInput from '../components/IndonesianDateInput';

const formatPaymentInput = (value: number) => value ? value.toLocaleString('id-ID') : '';
const parsePaymentInput = (value: string) => Number(value.replace(/\D/g, '')) || 0;

type InvoiceColumnKey = 'date' | 'number' | 'customer' | 'vehicle' | 'total' | 'branch' | 'actions';
type InvoicePaymentHistory = {
  id: string;
  paymentNumber: string;
  invoiceId?: string;
  invoiceNumber?: string;
  date: string;
  amount: number;
  paymentMethod?: string;
  accountName?: string;
  createdByName?: string;
};
const SALES_INVOICE_COLUMNS: Array<{ key: InvoiceColumnKey; label: string; locked?: boolean }> = [
  { key: 'date', label: 'Tanggal' },
  { key: 'number', label: 'Nomor Faktur / Status', locked: true },
  { key: 'customer', label: 'Pelanggan' },
  { key: 'vehicle', label: 'Data Kendaraan' },
  { key: 'total', label: 'Total / Pembayaran' },
  { key: 'branch', label: 'Cabang' },
  { key: 'actions', label: 'Aksi', locked: true },
];
const DEFAULT_SALES_INVOICE_COLUMNS = SALES_INVOICE_COLUMNS.map(column => column.key);

export default function SalesInvoice() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, addInvoice, updateInvoice, deleteInvoice, createInvoiceFromWO, currentBranchId, hasPermission, currentUser, generateDocumentNumber, refreshData, isLoading, hasLoadedData } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<SalesInvoice | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<SalesInvoice | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<InvoiceColumnKey[]>(DEFAULT_SALES_INVOICE_COLUMNS);
  const [invoicePaymentHistory, setInvoicePaymentHistory] = useState<InvoicePaymentHistory[]>([]);
  const [invoicePaymentHistoryLoading, setInvoicePaymentHistoryLoading] = useState(false);
  const [showWOPicker, setShowWOPicker] = useState(false);
  const [woSearchTerm, setWoSearchTerm] = useState('');
  const [selectedWOId, setSelectedWOId] = useState('');
  const [woDraftItems, setWoDraftItems] = useState<NonNullable<SalesInvoice['items']>>([]);
  const [woItemToAdd, setWoItemToAdd] = useState('');
  const [woPayment, setWoPayment] = useState(0);
  const [woPaymentMethod, setWoPaymentMethod] = useState<'Tunai' | 'Transfer'>('Tunai');
  const [invoiceDateUnlocked, setInvoiceDateUnlocked] = useState(false);
  const [woInvoiceDate, setWoInvoiceDate] = useState(localDateKey());
  const [woPaymentDate, setWoPaymentDate] = useState(localDateKey());
  const [woBackdateReason, setWoBackdateReason] = useState('');
  const [woManualReceiptNumber, setWoManualReceiptNumber] = useState('');
  const [isCreatingFromWO, setIsCreatingFromWO] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [formItems, setFormItems] = useState<NonNullable<SalesInvoice['items']>>([]);
  const [formItemToAdd, setFormItemToAdd] = useState('');
  const [formItemSearch, setFormItemSearch] = useState('');
  const [formActionMenu, setFormActionMenu] = useState<'ambil' | 'proses' | null>(null);
  const [formDiscount, setFormDiscount] = useState(0);
  const [identityCorrection, setIdentityCorrection] = useState({ open: false, customerRefId: '', vehicleRefId: '', driverContactId: '', reason: '', saving: false, error: '' });
  const [itemSearchOpen, setItemSearchOpen] = useState(false);
  const [detailItemId, setDetailItemId] = useState('');
  const [detailQty, setDetailQty] = useState(1);
  const [detailPrice, setDetailPrice] = useState(0);
  const [detailDiscountPercent, setDetailDiscountPercent] = useState(0);
  const [detailDiscountAmount, setDetailDiscountAmount] = useState(0);
  const [detailWarehouseId, setDetailWarehouseId] = useState('');
  const [detailActiveTab, setDetailActiveTab] = useState<'detail' | 'info' | 'image'>('detail');
  const [detailFormRowId, setDetailFormRowId] = useState('');
  const activeFilterCount = [filterCustomer, filterStatus, filterDate].filter(Boolean).length;
  const resetInvoiceFilters = () => {
    setFilterCustomer('');
    setFilterStatus('');
    setFilterDate('');
  };

  const invoiceColumnStorageKey = `dokterac_invoice_columns_${currentUser?.id || currentUser?.username || 'default'}`;
  useEffect(() => {
    try {
      const saved = localStorage.getItem(invoiceColumnStorageKey);
      if (!saved) {
        setVisibleColumns(DEFAULT_SALES_INVOICE_COLUMNS);
        return;
      }
      const parsed = JSON.parse(saved) as InvoiceColumnKey[];
      const valid = parsed.filter(key => SALES_INVOICE_COLUMNS.some(column => column.key === key));
      setVisibleColumns(Array.from(new Set<InvoiceColumnKey>(['number', ...valid, 'actions'])));
    } catch {
      setVisibleColumns(DEFAULT_SALES_INVOICE_COLUMNS);
    }
  }, [invoiceColumnStorageKey]);

  const isInvoiceColumnVisible = (key: InvoiceColumnKey) => visibleColumns.includes(key);
  const updateVisibleInvoiceColumns = (columns: InvoiceColumnKey[]) => {
    const next = Array.from(new Set<InvoiceColumnKey>(['number', ...columns, 'actions']));
    setVisibleColumns(next);
    localStorage.setItem(invoiceColumnStorageKey, JSON.stringify(next));
  };
  const toggleInvoiceColumn = (key: InvoiceColumnKey) => {
    const config = SALES_INVOICE_COLUMNS.find(column => column.key === key);
    if (config?.locked) return;
    updateVisibleInvoiceColumns(isInvoiceColumnVisible(key)
      ? visibleColumns.filter(column => column !== key)
      : [...visibleColumns, key]);
  };

  useEffect(() => {
    let cancelled = false;
    if (!viewingInvoice) {
      setInvoicePaymentHistory([]);
      setInvoicePaymentHistoryLoading(false);
      return () => { cancelled = true; };
    }
    setInvoicePaymentHistoryLoading(true);
    void api.get<InvoicePaymentHistory[]>('customer-payments').then(result => {
      if (cancelled) return;
      const payments = result.success && Array.isArray(result.data)
        ? result.data.filter(payment => payment.invoiceId === viewingInvoice.id || payment.invoiceNumber === viewingInvoice.invoiceNumber)
        : [];
      setInvoicePaymentHistory(payments.sort((left, right) => `${right.date} ${right.paymentNumber}`.localeCompare(`${left.date} ${left.paymentNumber}`)));
      setInvoicePaymentHistoryLoading(false);
    }).catch(() => {
      if (!cancelled) {
        setInvoicePaymentHistory([]);
        setInvoicePaymentHistoryLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [viewingInvoice?.id, viewingInvoice?.invoiceNumber]);

  const [formData, setFormData] = useState({
    date: localDateKey(),
    manualReceiptNumber: '',
    customerRefId: '',
    customerId: '',
    customerName: '',
    vehicleRefId: '',
    vehicleInfo: '',
    description: '',
    total: 0,
    payment: 0,
    paymentDate: localDateKey(),
    backdateReason: '',
    paymentMethod: 'Tunai' as 'Tunai' | 'Transfer',
    status: 'Belum Lunas' as 'Lunas' | 'Belum Lunas',
  });

  type InvoiceItem = NonNullable<SalesInvoice['items']>[number];
  const isPackageHeaderItem = (item: InvoiceItem) => (
    item.name.startsWith('[PAKET]')
    || data.items.some(master => master.id === item.itemId && master.type === 'Group')
  );
  const isPackageMemberItem = (item: InvoiceItem) => (
    item.name.startsWith('   -') || /^Isi dari paket:/i.test(item.description || '')
  );
  const packageMembersAfter = (items: InvoiceItem[], index: number) => {
    const members: InvoiceItem[] = [];
    for (let cursor = index + 1; cursor < items.length && isPackageMemberItem(items[cursor]); cursor += 1) {
      members.push(items[cursor]);
    }
    return members;
  };
  const cleanPackageLabel = (value: string) => value.replace(/^(?:\s*\[PAKET\]\s*)+/i, '').trim();
  const masterItemForInvoiceItem = (item: InvoiceItem) => data.items.find(master => master.id === item.itemId);
  const invoiceItemReceiptName = (item: InvoiceItem) => {
    const master = masterItemForInvoiceItem(item);
    const storedReceiptName = !/^Isi dari paket:/i.test(item.description || '') ? item.description?.trim() : '';
    return cleanPackageLabel(master?.receiptDescription?.trim() || storedReceiptName || master?.name?.trim() || item.name.replace(/^\s*-\s*/, '').trim());
  };
  const invoiceItemCode = (item: InvoiceItem) => item.code || masterItemForInvoiceItem(item)?.code || '-';
  const invoiceItemBarcodeOrCode = (item: InvoiceItem) => masterItemForInvoiceItem(item)?.barcode?.trim() || invoiceItemCode(item);
  const updateInvoiceItems = (items: InvoiceItem[], id: string, field: 'qty' | 'price', value: number) => {
    const targetIndex = items.findIndex(item => item.id === id);
    if (targetIndex < 0) return items;
    const target = items[targetIndex];
    const nextValue = Math.max(field === 'qty' ? 1 : 0, value);
    const oldPackageQty = Math.max(1, target.qty || 1);
    return items.map((item, index) => {
      if (index === targetIndex) return { ...item, [field]: nextValue };
      if (field !== 'qty' || !isPackageHeaderItem(target) || index <= targetIndex) return item;
      if (!items.slice(targetIndex + 1, index + 1).every(isPackageMemberItem)) return item;
      return { ...item, qty: Math.max(1, Math.round(item.qty * nextValue / oldPackageQty)) };
    });
  };
  const removeInvoiceItem = (items: InvoiceItem[], id: string) => {
    const targetIndex = items.findIndex(item => item.id === id);
    if (targetIndex < 0) return items;
    if (!isPackageHeaderItem(items[targetIndex])) return items.filter(item => item.id !== id);
    let endIndex = targetIndex + 1;
    while (endIndex < items.length && isPackageMemberItem(items[endIndex])) endIndex += 1;
    return items.filter((_, index) => index < targetIndex || index >= endIndex);
  };

  const selectedCustomer = data.customers.find((customer) => customer.id === formData.customerRefId) || null;
  const invoiceCustomerPhone = (invoice: SalesInvoice) => data.customers.find(customer => (
    customer.id === invoice.customerRefId || customer.customerCode === invoice.customerId
  ))?.phone || '-';
  const invoiceVehicleSummary = (invoice: SalesInvoice) => {
    const linkedWO = data.workOrders.find(workOrder => workOrder.id === invoice.woId || workOrder.woNumber === invoice.woNumber);
    const rawInfo = linkedWO?.vehicleInfo || invoice.vehicleInfo || '-';
    const plateFromWO = linkedWO?.plateNumber?.trim();
    const plateFromText = rawInfo.toUpperCase().match(/\b[A-Z]{1,2}\s?\d{1,4}\s?[A-Z]{0,3}\b/)?.[0]?.replace(/\s+/g, '');
    const plateNumber = plateFromWO || plateFromText || '-';
    const vehicle = data.vehicles.find(item => (
      item.plateNumber.replace(/\s+/g, '').toUpperCase() === plateNumber.replace(/\s+/g, '').toUpperCase()
    ));
    const detail = vehicle
      ? `${vehicle.brand} ${vehicle.model} · ${vehicle.color}`
      : rawInfo
          .replace(new RegExp(plateNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '')
          .replace(/\s*\/\s*/g, ' · ')
          .replace(/\s*[-–—]\s*/g, ' · ')
          .replace(/(?:\s*·\s*)+$/g, '')
          .trim() || '-';
    return { plateNumber, detail };
  };
  const formItemsTotal = formItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const formGrandTotal = Math.max(0, formItemsTotal - formDiscount);
  const manualInvoiceReady = Boolean(
    currentBranchId !== 'ALL'
    &&
    (editingInvoice || (formData.customerRefId && formData.vehicleRefId))
    && formItems.length > 0
    && formGrandTotal > 0
  );
  const visibleInvoiceItems = formItems.filter(item => !isPackageMemberItem(item));
  const searchableItems = data.items.filter(item => item.isActive && item.type !== 'Group' && (
    !formItemSearch.trim()
    || `${item.code} ${item.name} ${item.description || ''}`.toLowerCase().includes(formItemSearch.trim().toLowerCase())
  ));
  // Akses properti hanya dirender di dalam guard `detailItem &&`; non-null assertion
  // membantu TypeScript mempertahankan narrowing di callback JSX yang bersarang.
  const detailItem = data.items.find(item => item.id === detailItemId)!;
  const availableWarehouses = data.warehouses.filter(warehouse => warehouse.isActive && warehouse.isSellable && (
    currentBranchId === 'ALL' || warehouse.branchId === currentBranchId
  ));
  const detailWarehouseStock = detailItem && detailWarehouseId
    ? data.warehouseStocks.find(stock => stock.warehouseId === detailWarehouseId && stock.itemId === detailItem.id)?.quantity || 0
    : detailItem?.sellableStock || 0;
  const detailGrossTotal = detailPrice * detailQty;
  const detailPercentValue = Math.round(detailGrossTotal * detailDiscountPercent / 100);
  const detailFinalTotal = Math.max(0, detailGrossTotal - detailPercentValue - detailDiscountAmount);

  const handleCustomerSelect = (customerRefId: string) => {
    const customer = data.customers.find((item) => item.id === customerRefId);
    if (!customer) {
      setFormData((prev) => ({
        ...prev,
        customerRefId: '',
        customerId: '',
        customerName: '',
        vehicleRefId: '',
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
      vehicleInfo: '',
    }));
  };

  const handleVehicleSelect = (vehicleId: string) => {
    const vehicle = data.vehicles.find((item) => item.id === vehicleId);
    if (!vehicle) return;

    setFormData((prev) => ({
      ...prev,
      vehicleRefId: vehicle.id,
      vehicleInfo: `${vehicle.model.toUpperCase()} / ${vehicle.color.toUpperCase()} ${vehicle.plateNumber}`,
    }));
  };

  const filteredInvoices = useMemo(() => {
    return data.invoices
      .filter((inv) => {
        const branchMatch = currentBranchId === 'ALL' || inv.branchId === currentBranchId;
        if (!branchMatch) return false;

        const matchesSearch =
          inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (inv.manualReceiptNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          inv.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          inv.vehicleInfo.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = !filterStatus || inv.status === filterStatus;
        const matchesDate = !filterDate || inv.date === filterDate;
        const matchesCustomer = !filterCustomer || inv.customerName === filterCustomer;
        return matchesSearch && matchesStatus && matchesDate && matchesCustomer;
      })
      .sort((a, b) => {
        // Newest first: compare by date desc, then by invoice number desc
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return b.invoiceNumber.localeCompare(a.invoiceNumber);
      });
  }, [data.invoices, searchTerm, filterStatus, filterDate, filterCustomer, currentBranchId]);

  const invoiceCustomers = useMemo(() => Array.from(new Set(
    data.invoices
      .filter(invoice => currentBranchId === 'ALL' || invoice.branchId === currentBranchId)
      .map(invoice => invoice.customerName)
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b)), [data.invoices, currentBranchId]);

  const formatShareDate = (date: string) => {
    const [year, month, day] = date.split('-');
    return year && month && day ? `${Number(day)}/${Number(month)}/${year}` : date;
  };

  const invoiceShareText = (invoice: SalesInvoice) => {
    const branch = data.branches.find(item => item.id === invoice.branchId)?.name.replace('CABANG ', '') || '-';
    const items = invoice.items || [];
    const compactLines: string[] = [];
    let visibleIndex = 0;
    items.forEach((item, index) => {
      if (isPackageMemberItem(item)) return;
      visibleIndex += 1;
      compactLines.push(`${visibleIndex}. ${item.description || item.name} x${item.qty} — Rp ${(item.price * item.qty).toLocaleString('id-ID')}`);
      packageMembersAfter(items, index).forEach(member => {
        compactLines.push(`   • ${member.name.replace(/^\s*-\s*/, '')}`);
      });
    });
    const itemLines = items.length
      ? compactLines.join('\n')
      : `1. ${invoice.description || 'Faktur penjualan'} — Rp ${invoice.total.toLocaleString('id-ID')}`;
    return `INVOICE ${invoice.invoiceNumber} ( ${formatShareDate(invoice.date)} )${invoice.manualReceiptNumber ? `\nNO. NOTA FISIK: ${invoice.manualReceiptNumber}` : ''}\n👤 ${invoice.customerName}\n🚗 ${invoice.vehicleInfo || '-'}${invoice.woNumber ? `\nWO: ${invoice.woNumber}` : ''}\n\nRincian:\n${itemLines}\n\nTotal: Rp ${invoice.total.toLocaleString('id-ID')}\nBayar: Rp ${invoice.payment.toLocaleString('id-ID')}\nStatus: ${invoice.status}\nMetode: ${invoice.paymentMethod || 'Tunai'}\n\nDOKTER AC MOBIL — ${branch}`;
  };

  const copyInvoice = async (invoice: SalesInvoice) => {
    try {
      await navigator.clipboard.writeText(invoiceShareText(invoice));
      setSuccessMsg(`${invoice.invoiceNumber} berhasil disalin.`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      window.alert('Teks invoice gagal disalin. Izinkan akses clipboard lalu coba lagi.');
    }
  };

  const shareInvoiceToWhatsApp = (invoice: SalesInvoice) => {
    window.open(`https://wa.me/?text=${encodeURIComponent(invoiceShareText(invoice))}`, '_blank', 'noopener,noreferrer');
  };

  const handleRefresh = async () => {
    await refreshData();
  };

  const resetForm = () => {
    setFormData({
      date: localDateKey(),
      manualReceiptNumber: '',
      customerRefId: '',
      customerId: '',
      customerName: '',
      vehicleRefId: '',
      vehicleInfo: '',
      description: '',
      total: 0,
      payment: 0,
      paymentDate: localDateKey(),
      backdateReason: '',
      paymentMethod: 'Tunai',
      status: 'Belum Lunas',
    });
    setEditingInvoice(null);
    setFormItems([]);
    setFormItemToAdd('');
    setFormItemSearch('');
    setFormActionMenu(null);
    setFormDiscount(0);
    setItemSearchOpen(false);
    setDetailItemId('');
    setInvoiceDateUnlocked(false);
  };

  const handleOpenModal = (invoice?: SalesInvoice) => {
    setFormActionMenu(null);
    if (invoice) {
      setEditingInvoice(invoice);
      const linkedWO = data.workOrders.find(workOrder => workOrder.id === invoice.woId || workOrder.woNumber === invoice.woNumber);
      const editableItems = invoice.items?.length ? invoice.items : linkedWO?.services || [];
      const matchedVehicle = data.vehicles.find(
        (v) => invoice.vehicleInfo.includes(v.plateNumber)
      );
      setFormData({
        date: invoice.date,
        manualReceiptNumber: invoice.manualReceiptNumber || '',
        customerRefId: invoice.customerRefId || '',
        customerId: invoice.customerId,
        customerName: invoice.customerName,
        vehicleRefId: matchedVehicle?.id || '',
        vehicleInfo: invoice.vehicleInfo,
        description: invoice.description,
        total: invoice.total,
        payment: invoice.payment,
        paymentDate: invoice.paymentDate || invoice.date,
        backdateReason: invoice.backdateReason || '',
        paymentMethod: invoice.paymentMethod === 'Transfer' ? 'Transfer' : 'Tunai',
        status: invoice.status,
      });
      setFormItems(editableItems.map((item, index) => ({ ...item, id: `edit-${invoice.id}-${index}` })));
      setFormDiscount(Math.max(0, editableItems.reduce((sum, item) => sum + item.price * item.qty, 0) - invoice.total));
    } else {
      resetForm();
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedManualReceiptNumber = formData.manualReceiptNumber.trim().toUpperCase();
    const duplicateManualReceipt = normalizedManualReceiptNumber && data.invoices.find(invoice =>
      invoice.id !== editingInvoice?.id && invoice.manualReceiptNumber?.trim().toUpperCase() === normalizedManualReceiptNumber
    );
    if (duplicateManualReceipt) {
      window.alert(`No. Nota Fisik ${normalizedManualReceiptNumber} sudah dipakai pada Faktur ${duplicateManualReceipt.invoiceNumber}.`);
      return;
    }
    const today = localDateKey();
    if (formData.date > today || (formData.payment > 0 && formData.paymentDate > today)) {
      window.alert('Tanggal transaksi tidak boleh melewati hari ini.');
      return;
    }
    if (formData.payment > 0 && formData.paymentDate < formData.date) {
      window.alert('Tanggal pembayaran tidak boleh sebelum tanggal faktur.');
      return;
    }
    if (data.settings.security.requireBackdateReason !== false && (formData.date < today || (formData.payment > 0 && formData.paymentDate < today)) && !formData.backdateReason.trim()) {
      window.alert('Alasan transaksi tanggal mundur wajib diisi.');
      return;
    }

    if (formItems.length === 0) {
      window.alert('Tambahkan minimal satu barang atau jasa.');
      return;
    }
    const finalTotal = formItems.reduce((sum, item) => sum + item.price * item.qty, 0);
    if (finalTotal <= 0) {
      window.alert('Invoice dengan nilai Rp0 tidak dapat dibuat. Isi harga minimal satu layanan atau barang terlebih dahulu.');
      return;
    }
    const updatedInvoiceTotal = Math.max(0, finalTotal - formDiscount);
    const existingPayment = editingInvoice?.payment || 0;
    if (editingInvoice && existingPayment > updatedInvoiceTotal) {
      window.alert(`Total faktur tidak boleh lebih kecil dari pembayaran yang sudah diterima (Rp ${existingPayment.toLocaleString('id-ID')}). Sesuaikan layanan atau koreksi pembayaran melalui menu Pembayaran terlebih dahulu.`);
      return;
    }
    const computedStatus: SalesInvoice['status'] = existingPayment >= updatedInvoiceTotal && updatedInvoiceTotal > 0 ? 'Lunas' : 'Belum Lunas';
    if (editingInvoice?.status === 'Lunas' && computedStatus === 'Belum Lunas' && !window.confirm(
      `Total faktur berubah menjadi Rp ${updatedInvoiceTotal.toLocaleString('id-ID')}, sedangkan pembayaran baru Rp ${existingPayment.toLocaleString('id-ID')}.\n\nStempel LUNAS akan dihapus dan faktur menjadi Belum Lunas dengan sisa Rp ${(updatedInvoiceTotal - existingPayment).toLocaleString('id-ID')}. Lanjutkan?`
    )) return;
    const finalForm = {
      ...formData,
      manualReceiptNumber: normalizedManualReceiptNumber || undefined,
      total: updatedInvoiceTotal,
      payment: existingPayment,
      status: computedStatus,
      items: formItems,
    };
    const targetBranchId = (currentBranchId === 'ALL' ? currentUser?.branchId : currentBranchId) || 'BR-001';
    const invoiceNumber = generateDocumentNumber('invoice', targetBranchId, new Date(`${formData.date}T12:00:00`));

    if (editingInvoice) {
      await updateInvoice(editingInvoice.id, {
        ...editingInvoice,
        ...finalForm,
        age: finalForm.status === 'Lunas' ? 0 : Math.floor((Date.now() - new Date(finalForm.date).getTime()) / (1000 * 60 * 60 * 24)),
      });
      setSuccessMsg(
        finalForm.status === 'Lunas'
          ? `${editingInvoice.invoiceNumber} diperbarui dan tetap Lunas.`
          : `${editingInvoice.invoiceNumber} diperbarui. Pembayaran kurang Rp ${Math.max(0, finalForm.total - finalForm.payment).toLocaleString('id-ID')}; status menjadi Belum Lunas.`,
      );
      setTimeout(() => setSuccessMsg(''), 5000);
    } else {
      await addInvoice({
        id: Date.now().toString(),
        invoiceNumber,
        ...finalForm,
        age: finalForm.status === 'Lunas' ? 0 : 0,
        branchId: targetBranchId,
      });
    }
    handleCloseModal();
  };

  const handleDelete = async (invoice: SalesInvoice) => {
    if (invoice.payment > 0) {
      window.alert('Invoice masih memiliki pembayaran. Hapus pembayaran terlebih dahulu.');
      return;
    }
    if (window.confirm(`Hapus ${invoice.invoiceNumber}? Stok akan dikembalikan dan WO terkait kembali berstatus Selesai.`)) {
      try {
        await deleteInvoice(invoice.id);
        setSuccessMsg(`${invoice.invoiceNumber} dihapus. Stok dikembalikan dan WO terkait dibuka kembali.`);
        setTimeout(() => setSuccessMsg(''), 4000);
      } catch (error: any) {
        window.alert(`Gagal menghapus invoice: ${error?.message || 'terjadi kesalahan'}`);
      }
    }
  };

  const saveIdentityCorrection = async () => {
    if (!editingInvoice || !identityCorrection.customerRefId || !identityCorrection.vehicleRefId || !identityCorrection.reason.trim()) return;
    setIdentityCorrection(current => ({ ...current, saving: true }));
    const result = await api.update('sales-invoices', `${editingInvoice.id}/identity`, {
      customerRefId: identityCorrection.customerRefId,
      vehicleRefId: identityCorrection.vehicleRefId,
      driverContactId: identityCorrection.driverContactId || undefined,
      reason: identityCorrection.reason.trim(),
    });
    if (!result.success) {
      setIdentityCorrection(current => ({ ...current, saving: false, error: result.message || 'Koreksi identitas gagal.' }));
      return;
    }
    await refreshData();
    setSuccessMsg('Identitas WO, faktur, dan tampilan pembayaran berhasil dikoreksi.');
    setIdentityCorrection({ open: false, customerRefId: '', vehicleRefId: '', driverContactId: '', reason: '', saving: false, error: '' });
    handleCloseModal();
  };

  // Hanya WO Selesai yang boleh difakturkan.
  const unbilledWOs = data.workOrders.filter(
    (wo) => !wo.invoiceId && !wo.continuedToWoId && wo.status === 'Selesai'
      && (currentBranchId === 'ALL' || wo.branchId === currentBranchId)
  );
  const visibleUnbilledWOs = unbilledWOs.filter((wo) => {
    const term = woSearchTerm.trim().toLowerCase();
    if (!term) return true;
    return [wo.woNumber, wo.customerName, wo.plateNumber, wo.vehicleInfo]
      .some((value) => value?.toLowerCase().includes(term));
  });
  const selectedWO = data.workOrders.find((wo) => wo.id === selectedWOId);
  const woDraftTotal = woDraftItems.reduce((sum, item) => sum + item.price * item.qty, 0);

  const handleOpenWOPicker = () => {
    setShowWOPicker(true);
    setWoSearchTerm('');
    setSelectedWOId('');
    setWoDraftItems([]);
    setWoItemToAdd('');
    setWoPayment(0);
    setWoPaymentMethod('Tunai');
    const today = localDateKey();
    setWoInvoiceDate(today);
    setWoPaymentDate(today);
    setWoBackdateReason('');
    setWoManualReceiptNumber('');
  };

  const handleSelectWO = (woId: string) => {
    setSelectedWOId(woId);
    const wo = data.workOrders.find((w) => w.id === woId);
    if (wo) {
      const copiedItems = wo.services.map((item, index) => ({ ...item, id: `invoice-${Date.now()}-${index}` }));
      setWoDraftItems(copiedItems);
      setWoPayment(copiedItems.reduce((sum, item) => sum + item.price * item.qty, 0));
    }
  };

  useEffect(() => {
    const woId = searchParams.get('woId');
    if (!woId || !data.workOrders.some((wo) => wo.id === woId)) return;
    handleOpenWOPicker();
    handleSelectWO(woId);
    setSearchParams({}, { replace: true });
  }, [searchParams, data.workOrders, setSearchParams]);

  useEffect(() => {
    const requestedSearch = searchParams.get('search');
    if (!requestedSearch) return;
    setSearchTerm(requestedSearch);
    setSearchParams(params => {
      const next = new URLSearchParams(params);
      next.delete('search');
      return next;
    }, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const requestedInvoiceId = searchParams.get('view');
    if (!requestedInvoiceId || !hasLoadedData) return;

    // Backend all-data sudah memfilter faktur berdasarkan hak akses cabang
    // pengguna. Cabang yang sedang aktif hanya filter daftar/transaksi baru,
    // bukan pembatas untuk membuka dokumen yang memang boleh dibaca.
    const invoice = data.invoices.find(item =>
      item.id === requestedInvoiceId || item.invoiceNumber === requestedInvoiceId
    );

    if (!invoice) {
      window.alert('Faktur tidak ditemukan atau sudah tidak dapat diakses.');
    } else {
      setViewingInvoice(invoice);
    }

    setSearchParams(params => {
      const next = new URLSearchParams(params);
      next.delete('view');
      return next;
    }, { replace: true });
  }, [searchParams, setSearchParams, hasLoadedData, data.invoices]);

  const addFormItem = () => {
    const item = data.items.find((entry) => entry.id === formItemToAdd);
    if (!item) return;
    setFormItems((current) => {
      const existing = current.find((entry) => entry.itemId === item.id);
      return existing
        ? current.map((entry) => entry.id === existing.id ? { ...entry, qty: entry.qty + 1 } : entry)
        : [...current, { id: `invoice-${Date.now()}`, itemId: item.id, code: item.code, name: item.name, description: item.receiptDescription || item.description || item.name, price: item.sellingPrice, qty: 1 }];
    });
    setFormItemToAdd('');
  };

  const addItemDirectly = (itemId: string) => {
    const item = data.items.find(entry => entry.id === itemId);
    if (!item) return;
    setFormItems(current => {
      const existing = current.find(entry => entry.itemId === item.id);
      return existing
        ? current.map(entry => entry.id === existing.id ? { ...entry, qty: entry.qty + 1 } : entry)
        : [...current, { id: `invoice-${Date.now()}`, itemId: item.id, code: item.code, name: item.name, description: item.receiptDescription || item.description || item.name, price: item.sellingPrice, qty: 1 }];
    });
    setFormItemSearch('');
    setItemSearchOpen(false);
    window.setTimeout(() => document.getElementById('invoice-item-search')?.focus(), 0);
  };

  const openItemDetail = (formRowId: string) => {
    const formRow = formItems.find(entry => entry.id === formRowId);
    const item = data.items.find(entry => entry.id === formRow?.itemId);
    if (!item || !formRow) return;
    const defaultWarehouse = availableWarehouses.find(warehouse => warehouse.isDefault) || availableWarehouses[0];
    setDetailFormRowId(formRow.id);
    setDetailItemId(item.id);
    setDetailQty(formRow.qty);
    setDetailPrice(formRow.price);
    setDetailDiscountPercent(0);
    setDetailDiscountAmount(0);
    setDetailWarehouseId(item.type === 'Persediaan' ? formRow.warehouseId || defaultWarehouse?.id || '' : '');
    setDetailActiveTab('detail');
    setItemSearchOpen(false);
  };

  const confirmItemDetail = () => {
    if (!detailItem) return;
    if (detailItem.type === 'Persediaan') {
      if (!detailWarehouseId) return window.alert('Pilih gudang untuk barang persediaan.');
    }
    const effectivePrice = detailQty > 0 ? Math.max(0, Math.round(detailFinalTotal / detailQty)) : 0;
    setFormItems(current => current.map(entry => entry.id === detailFormRowId ? { ...entry, qty: detailQty, price: effectivePrice, warehouseId: detailItem.type === 'Persediaan' ? detailWarehouseId : undefined } : entry));
    setDetailFormRowId('');
    setDetailItemId('');
    setFormItemSearch('');
    window.setTimeout(() => document.getElementById('invoice-item-search')?.focus(), 0);
  };

  const updateFormItem = (id: string, field: 'qty' | 'price', value: number) => {
    setFormItems((current) => updateInvoiceItems(current, id, field, value));
  };

  const updateWODraftItem = (id: string, field: 'qty' | 'price', value: number) => {
    setWoDraftItems((current) => {
      const next = updateInvoiceItems(current, id, field, value);
      setWoPayment(next.reduce((sum, item) => sum + item.price * item.qty, 0));
      return next;
    });
  };

  const removeFormItem = (id: string) => {
    setFormItems(current => removeInvoiceItem(current, id));
  };

  const removeWODraftItem = (id: string) => {
    setWoDraftItems(current => {
      const next = removeInvoiceItem(current, id);
      setWoPayment(next.reduce((sum, item) => sum + item.price * item.qty, 0));
      return next;
    });
  };

  const addWODraftItem = () => {
    const item = data.items.find((entry) => entry.id === woItemToAdd);
    if (!item) return;
    setWoDraftItems((current) => {
      const existing = current.find((entry) => entry.itemId === item.id);
      const next = existing
        ? current.map((entry) => entry.id === existing.id ? { ...entry, qty: entry.qty + 1 } : entry)
        : [...current, { id: `invoice-${Date.now()}`, itemId: item.id, code: item.code, name: item.name, description: item.receiptDescription || item.description || item.name, price: item.sellingPrice, qty: 1 }];
      setWoPayment(next.reduce((sum, entry) => sum + entry.price * entry.qty, 0));
      return next;
    });
    setWoItemToAdd('');
  };

  const handleCreateFromWO = async () => {
    if (selectedWO && !isCreatingFromWO) {
      const normalizedManualReceiptNumber = woManualReceiptNumber.trim().toUpperCase();
      const duplicateManualReceipt = normalizedManualReceiptNumber && data.invoices.find(invoice => invoice.manualReceiptNumber?.trim().toUpperCase() === normalizedManualReceiptNumber);
      if (duplicateManualReceipt) {
        window.alert(`No. Nota Fisik ${normalizedManualReceiptNumber} sudah dipakai pada Faktur ${duplicateManualReceipt.invoiceNumber}.`);
        return;
      }
      const today = localDateKey();
      if (woInvoiceDate > today || (woPayment > 0 && woPaymentDate > today)) {
        window.alert('Tanggal transaksi tidak boleh melewati hari ini.');
        return;
      }
      if (woPayment > 0 && woPaymentDate < woInvoiceDate) {
        window.alert('Tanggal pembayaran tidak boleh sebelum tanggal faktur.');
        return;
      }
      if (data.settings.security.requireBackdateReason !== false && (woInvoiceDate < today || (woPayment > 0 && woPaymentDate < today)) && !woBackdateReason.trim()) {
        window.alert('Alasan transaksi tanggal mundur wajib diisi.');
        return;
      }
      setIsCreatingFromWO(true);
      try {
        if (woDraftItems.length === 0) {
          window.alert('Tambahkan minimal satu barang atau jasa ke faktur.');
          return;
        }
        const invoice = await createInvoiceFromWO(
          selectedWO.id,
          woPaymentMethod === 'Tunai' ? woPayment : 0,
          woPaymentMethod === 'Transfer' ? woPayment : 0,
          woInvoiceDate,
          woPayment > 0 ? woPaymentDate : undefined,
          woBackdateReason,
          woDraftItems,
          normalizedManualReceiptNumber
        );
        if (invoice) {
          setSuccessMsg(`Faktur ${invoice.invoiceNumber} berhasil dibuat dari ${selectedWO.woNumber}!`);
          setTimeout(() => setSuccessMsg(''), 4000);
        }
        setShowWOPicker(false);
        setSelectedWOId('');
        setWoPayment(0);
      } catch (error: any) {
        window.alert(`Gagal membuat faktur: ${error?.message || 'terjadi kesalahan'}`);
      } finally {
        setIsCreatingFromWO(false);
      }
    }
  };

  return (
    <div className="space-y-3 lg:-mx-6 lg:-mt-6 lg:space-y-0">
      {/* Subtab Faktur Penjualan: daftar, data baru/edit, dan detail faktur. */}
      <div className={`${ui.childBar} hidden lg:flex`}>
        <button
          type="button"
          onClick={() => { if (showModal) handleCloseModal(); setViewingInvoice(null); }}
          title="Daftar Faktur Penjualan"
          className={ui.childListTab}
        >
          <FileText className="h-6 w-6" />
        </button>
        {showModal && (
          <div className={`${ui.childTabActive} min-w-48 max-w-80`}>
            <button type="button" className="min-w-0 flex-1 truncate px-4 text-left text-sm font-semibold">{editingInvoice ? editingInvoice.invoiceNumber : 'Data Baru'}</button>
            <button type="button" onClick={handleCloseModal} className="mr-1 rounded p-1.5 hover:bg-blue-700" title="Tutup tab"><X className="h-4 w-4" /></button>
          </div>
        )}
        {viewingInvoice && (
          <div className={`${ui.childTabActive} min-w-40 max-w-72`}>
            <button type="button" className="min-w-0 flex-1 truncate px-4 text-left text-sm font-semibold">{viewingInvoice.invoiceNumber}</button>
            <button type="button" onClick={() => setViewingInvoice(null)} className="mr-1 rounded p-1.5 hover:bg-blue-700" title="Tutup tab"><X className="h-4 w-4" /></button>
          </div>
        )}
      </div>
      {/* Success Message */}
      {successMsg && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-sm font-medium text-green-800">{successMsg}</p>
        </div>
      )}

      {/* Filters */}
      <div className={`${showModal || viewingInvoice ? 'lg:hidden' : ''} ${ui.toolbar} border border-gray-300 p-3 shadow-sm lg:border-x-0 lg:border-y lg:px-3 lg:py-2`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-shrink-0" tabIndex={-1} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setShowFilterPanel(false); }}>
              <button type="button" onClick={() => setShowFilterPanel(value => !value)} className={`inline-flex h-9 items-center gap-2 rounded border px-3 text-sm font-semibold ${showFilterPanel || activeFilterCount > 0 ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-blue-600 bg-white text-blue-700 hover:bg-blue-50'}`} title="Filter daftar faktur"><Filter className="h-4 w-4"/> Filter{activeFilterCount > 0 && <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] leading-none text-white">{activeFilterCount}</span>}</button>
              {showFilterPanel && <div className="absolute left-0 top-[calc(100%+6px)] z-40 w-[min(360px,calc(100vw-24px))] rounded-xl border border-gray-200 bg-white p-4 shadow-xl">
                <div className="mb-3 flex items-center justify-between border-b border-gray-100 pb-2"><strong className="text-sm text-gray-800">Filter Faktur Penjualan</strong><button type="button" onClick={resetInvoiceFilters} className="text-xs font-semibold text-blue-700 hover:underline">Clear</button></div>
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-gray-600">Pelanggan<select value={filterCustomer} onChange={(event) => setFilterCustomer(event.target.value)} className={`${ui.field} mt-1 w-full px-3 text-sm font-normal`}><option value="">Semua pelanggan</option>{invoiceCustomers.map(customer => <option key={customer} value={customer}>{customer}</option>)}</select></label>
                  <label className="block text-xs font-semibold text-gray-600">Status<select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)} className={`${ui.field} mt-1 w-full px-3 text-sm font-normal`}><option value="">Semua status</option><option value="Lunas">Lunas</option><option value="Belum Lunas">Belum Lunas</option></select></label>
                  <label className="block text-xs font-semibold text-gray-600">Tanggal Faktur<IndonesianDateInput value={filterDate} onChange={setFilterDate} className="mt-1 h-10 w-full text-sm font-normal" title="Tanggal faktur"/></label>
                </div>
                <p className="mt-2 text-xs text-gray-500">Kosongkan pilihan untuk menampilkan semua faktur.</p>
                <button type="button" onClick={() => setShowFilterPanel(false)} className="mt-4 h-10 w-full rounded-lg bg-blue-600 text-sm font-semibold text-white">Terapkan Filter</button>
              </div>}
            </div>
            {hasPermission('invoice:create') && (
              <>
                <button
                  type="button"
                  onClick={handleOpenWOPicker}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded bg-emerald-700 px-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-800"
                >
                  <Wrench className="h-4 w-4" />
                  <span className="hidden xl:inline">Faktur dari WO</span>
                  {unbilledWOs.length > 0 && <span className="rounded-full bg-white px-1.5 text-xs font-bold text-green-700">{unbilledWOs.length}</span>}
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenModal()}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded bg-blue-800 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden xl:inline">Buat Faktur</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={isLoading}
              className="inline-flex h-9 w-11 items-center justify-center rounded border border-blue-600 bg-white text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60"
              title="Ambil ulang data faktur dari server"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 lg:flex-nowrap">
            <div className="relative w-full min-w-[240px] sm:w-[360px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Cari faktur, nota fisik, pelanggan, kendaraan..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className={`${ui.search} w-full pl-9 pr-3`} />
            </div>
            <button className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50" title="Download">
              <Download className="h-4 w-4" />
            </button>
            <button className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50" title="Print">
              <Printer className="h-4 w-4" />
            </button>
            <div className="relative" tabIndex={-1} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setShowColumnPicker(false); }}>
              <button type="button" onClick={() => setShowColumnPicker(value => !value)} className={`inline-flex h-9 w-9 items-center justify-center rounded border ${showColumnPicker ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}`} title="Pilih kolom tabel">
                <Settings2 className="h-4 w-4" />
              </button>
              {showColumnPicker && (
                <div className="absolute right-0 top-[calc(100%+6px)] z-40 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
                  <div className="mb-2 flex items-center justify-between border-b border-gray-100 pb-2"><span className="text-sm font-bold text-gray-800">Kolom Daftar Faktur</span><button type="button" onClick={() => setShowColumnPicker(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button></div>
                  {SALES_INVOICE_COLUMNS.map(column => (
                    <label key={column.key} className={`flex items-center gap-2 rounded-lg px-2 py-2 text-sm ${column.locked ? 'cursor-not-allowed bg-gray-50 text-gray-500' : 'cursor-pointer hover:bg-blue-50'}`}>
                      <input type="checkbox" checked={isInvoiceColumnVisible(column.key)} disabled={column.locked} onChange={() => toggleInvoiceColumn(column.key)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                      <span>{column.label}</span>
                      {column.locked && <span className="ml-auto text-[10px] font-semibold uppercase text-gray-400">Wajib</span>}
                    </label>
                  ))}
                  <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3">
                    <button type="button" onClick={() => updateVisibleInvoiceColumns(DEFAULT_SALES_INVOICE_COLUMNS)} className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">Semua</button>
                    <button type="button" onClick={() => updateVisibleInvoiceColumns(['number', 'customer', 'vehicle', 'total', 'actions'])} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50">Ringkas</button>
                  </div>
                </div>
              )}
            </div>
            <span className="flex h-9 min-w-14 items-center justify-center rounded border border-gray-300 bg-white px-3 text-sm text-gray-700">{filteredInvoices.length}</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className={`${showModal || viewingInvoice ? 'lg:hidden' : ''} ${ui.tableShell} mx-1 shadow-sm lg:mx-3 lg:mt-0.5`}>
        <div className="max-h-[calc(100vh-260px)] min-h-[360px] overflow-auto">
          <table className="w-full min-w-[1160px] border-collapse">
            <thead className="sticky top-0 z-20 bg-blue-800 text-white">
              <tr>
                {isInvoiceColumnVisible('date') && <th className="px-4 text-left text-xs font-semibold uppercase tracking-wide">Tanggal</th>}
                {isInvoiceColumnVisible('number') && <th className="px-4 text-left text-xs font-semibold uppercase tracking-wide">Nomor #</th>}
                {isInvoiceColumnVisible('customer') && <th className="px-4 text-left text-xs font-semibold uppercase tracking-wide">Pelanggan</th>}
                {isInvoiceColumnVisible('vehicle') && <th className="px-4 text-left text-xs font-semibold uppercase tracking-wide">Data Kendaraan</th>}
                {isInvoiceColumnVisible('total') && <th className="px-4 text-right text-xs font-semibold uppercase tracking-wide">Total</th>}
                {currentBranchId === 'ALL' && isInvoiceColumnVisible('branch') && <th className="px-4 text-left text-xs font-semibold uppercase tracking-wide">Cabang</th>}
                {isInvoiceColumnVisible('actions') && <th className="sticky right-0 bg-blue-800 px-4 text-center text-xs font-semibold uppercase tracking-wide">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.filter(column => column !== 'branch' || currentBranchId === 'ALL').length} className="px-6 py-12 text-center text-gray-500">
                    <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-lg font-medium">Tidak ada data faktur</p>
                    <p className="text-sm">Silakan buat faktur baru atau pilih cabang lain</p>
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-blue-50/50 transition-colors">
                    {isInvoiceColumnVisible('date') && <td className="whitespace-nowrap border-r border-gray-200 px-3 py-2.5 text-sm text-gray-900">{formatShareDate(invoice.date)}</td>}
                    {isInvoiceColumnVisible('number') && <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setViewingInvoice(invoice)}
                          className="font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                          title="Buka detail faktur"
                        >
                          {invoice.invoiceNumber}
                        </button>
                        {invoice.woNumber && (
                          <span className="inline-flex items-center rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700" title={`Dari ${invoice.woNumber}`}>
                            WO
                          </span>
                        )}
                      </div>
                      {invoice.manualReceiptNumber && (
                        <span className="mt-0.5 block text-[11px] font-medium text-gray-500">Nota fisik: {invoice.manualReceiptNumber}</span>
                      )}
                      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${invoice.status === 'Lunas' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {invoice.status === 'Lunas' ? 'Lunas' : `Belum Lunas (${invoice.age} hr)`}
                      </span>
                    </td>}
                    {isInvoiceColumnVisible('customer') && <td className="min-w-[190px] px-4 py-2.5 text-sm text-gray-900">
                      <strong className="block truncate font-semibold">{invoice.customerName}</strong>
                      <span className="mt-0.5 block whitespace-nowrap text-xs text-gray-500">
                        {invoiceCustomerPhone(invoice)} - {invoice.customerId}
                      </span>
                    </td>}
                    {isInvoiceColumnVisible('vehicle') && <td className="min-w-[210px] max-w-xs px-4 py-2.5 text-sm text-gray-900">
                      <strong className="block truncate font-semibold">{invoiceVehicleSummary(invoice).plateNumber}</strong>
                      <span className="mt-0.5 block truncate text-xs text-gray-500">{invoiceVehicleSummary(invoice).detail}</span>
                    </td>}
                    {isInvoiceColumnVisible('total') && <td className="min-w-[150px] whitespace-nowrap px-4 py-2.5 text-right text-sm text-gray-900">
                      <strong className="block font-semibold tabular-nums">Rp {invoice.total.toLocaleString('id-ID')}</strong>
                      <span className="mt-0.5 block text-[11px] text-gray-500">Bayar Rp {invoice.payment.toLocaleString('id-ID')}</span>
                      {invoice.payment >= invoice.total ? (
                        <span className="block text-[10px] font-semibold text-emerald-700">Lunas</span>
                      ) : (
                        <span className="block text-[10px] font-semibold text-amber-700">Sisa Rp {Math.max(0, invoice.total - invoice.payment).toLocaleString('id-ID')}</span>
                      )}
                    </td>}
                    {currentBranchId === 'ALL' && isInvoiceColumnVisible('branch') && (
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-700">
                          {data.branches.find(b => b.id === invoice.branchId)?.name.replace('CABANG ', '') || 'N/A'}
                        </span>
                      </td>
                    )}
                    {isInvoiceColumnVisible('actions') && <td className="sticky right-0 bg-white group-hover:bg-blue-50 px-4 py-3 shadow-[-4px_0_10px_rgba(0,0,0,0.05)]">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void copyInvoice(invoice)}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                          title="Salin invoice"
                        >
                          <Copy className="h-3.5 w-3.5" /><span className="lg:hidden">Salin</span>
                        </button>
                        {hasPermission('invoice:delete') && invoice.payment <= 0 && (
                          <button
                            onClick={() => void handleDelete(invoice)}
                            className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors shadow-sm"
                            title="Hapus"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-500 flex items-center justify-between">
          <span>Menampilkan {filteredInvoices.length} dari {data.invoices.length} faktur</span>
          <span>Total: {filteredInvoices.length > 0 ? filteredInvoices.reduce((s, i) => s + i.total, 0).toLocaleString('id-ID') : 0}</span>
        </div>
      </div>

      {/* Detail faktur: dibuka langsung dari Asisten AI atau nomor faktur pada daftar. */}
      {viewingInvoice && (() => {
        const invoice = viewingInvoice;
        const branchName = data.branches.find(branch => branch.id === invoice.branchId)?.name || '-';
        const customer = data.customers.find(item => item.id === invoice.customerRefId || item.customerCode === invoice.customerId);
        const linkedWO = data.workOrders.find(workOrder => workOrder.id === invoice.woId || workOrder.woNumber === invoice.woNumber);
        const remaining = Math.max(0, invoice.total - invoice.payment);
        const items = invoice.items?.length ? invoice.items : linkedWO?.services || [];
        const visibleItems = items.filter(item => !isPackageMemberItem(item));
        const itemsSubtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
        const displayedSubtotal = itemsSubtotal > 0 ? itemsSubtotal : invoice.total;
        const displayedDiscount = Math.max(0, displayedSubtotal - invoice.total);
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-0 sm:p-3 lg:static lg:z-auto lg:block lg:bg-transparent lg:p-0">
            <section className="flex h-[100dvh] w-full flex-col overflow-hidden bg-gray-50 shadow-2xl sm:h-[94vh] sm:max-w-6xl sm:rounded-xl sm:border sm:border-gray-300 lg:h-auto lg:max-w-none lg:rounded-md lg:shadow-sm" role="dialog" aria-modal="true" aria-label={`Detail faktur ${invoice.invoiceNumber}`}>
              <header className="flex flex-shrink-0 items-center justify-between border-b border-blue-900 bg-slate-700 px-4 py-3 text-white sm:px-5 lg:hidden">
                <div>
                  <h3 className="text-lg font-semibold">Faktur Penjualan {invoice.invoiceNumber}</h3>
                  <p className="text-xs text-slate-200">Mode lihat · data transaksi terkunci</p>
                </div>
                <button type="button" onClick={() => setViewingInvoice(null)} className="rounded p-2 hover:bg-white/10" aria-label="Tutup detail faktur">
                  <X className="h-5 w-5" />
                </button>
              </header>

              <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <div className="order-first mr-auto flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-500">
                    <span>Nomor: <strong className="text-gray-800">{invoice.invoiceNumber}</strong></span>
                    {invoice.manualReceiptNumber && <span>Nota fisik: <strong className="text-gray-800">{invoice.manualReceiptNumber}</strong></span>}
                    <span>Cabang: <strong className="text-gray-800">{branchName}</strong></span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${invoice.status === 'Lunas' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{invoice.status}</span>
                  </div>
                  <button type="button" disabled title="Ambil hanya tersedia pada faktur baru" className={ui.documentAction}>Ambil <ChevronDown className="h-4 w-4"/></button>
                  <div className="relative">
                    <button type="button" onClick={() => setFormActionMenu(menu => menu === 'proses' ? null : 'proses')} className={ui.documentAction}>Proses <ChevronDown className="h-4 w-4"/></button>
                    {formActionMenu === 'proses' && <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded border bg-white p-1 shadow-xl">
                      <button type="button" onClick={() => window.location.assign(`/customer-payments?viewInvoiceId=${encodeURIComponent(invoice.id)}`)} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-blue-50"><Eye className="h-4 w-4"/>Lihat Riwayat Pembayaran</button>
                      <button type="button" disabled={remaining <= 0} onClick={() => remaining > 0 && window.location.assign(`/customer-payments?invoiceId=${encodeURIComponent(invoice.id)}`)} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-gray-400"><Receipt className="h-4 w-4"/>Tambah Pembayaran</button>
                      <button type="button" onClick={() => { setFormActionMenu(null); void copyInvoice(invoice); }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-blue-50"><Copy className="h-4 w-4"/>Salin Faktur</button>
                      <button type="button" onClick={() => { setFormActionMenu(null); shareInvoiceToWhatsApp(invoice); }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-emerald-50"><MessageCircle className="h-4 w-4 text-emerald-600"/>Kirim WhatsApp</button>
                    </div>}
                  </div>
                  {hasPermission('invoice:edit') ? <button type="button" onClick={() => { setViewingInvoice(null); handleOpenModal(invoice); }} className="inline-flex h-9 items-center gap-2 rounded bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800"><Edit className="h-4 w-4"/>Edit</button> : <button type="button" disabled className="inline-flex h-9 items-center gap-2 rounded bg-gray-300 px-4 text-sm font-semibold text-gray-500"><Save className="h-4 w-4"/>Terkunci</button>}
                </div>

                <section className="grid gap-3 border border-gray-300 bg-white p-3 lg:grid-cols-[1fr_1fr_190px_190px]">
                  <div>
                    <label className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-700"><User className="h-4 w-4 text-blue-600"/>Data Pelanggan</label>
                    <div className="flex h-10 items-center rounded border border-gray-300 bg-gray-100 px-3 text-sm text-gray-700"><span className="truncate font-semibold">{invoice.customerName}</span><span className="ml-2 truncate text-xs text-gray-500">{customer?.phone || invoice.customerId}</span></div>
                  </div>
                  <div>
                    <label className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-700"><Car className="h-4 w-4 text-orange-600"/>Data Kendaraan</label>
                    <div className="flex h-10 items-center rounded border border-gray-300 bg-gray-100 px-3 text-sm font-semibold text-gray-700"><span className="truncate">{invoice.vehicleInfo || '-'}</span>{invoice.woNumber && <span className="ml-2 shrink-0 text-xs text-orange-700">· {invoice.woNumber}</span>}</div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Tanggal</label>
                    <div className="flex h-10 items-center rounded border border-gray-300 bg-gray-100 px-3 text-sm text-gray-600">{invoice.date}</div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">No. Nota Fisik</label>
                    <div className="flex h-10 items-center rounded border border-gray-300 bg-gray-100 px-3 text-sm font-semibold text-gray-700">{invoice.manualReceiptNumber || '-'}</div>
                  </div>
                </section>

                <section className="relative min-h-[320px] space-y-2 border border-gray-300 bg-white p-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="relative w-full max-w-xl"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300"/><input disabled placeholder="Cari/Pilih Barang & Jasa..." className="h-10 w-full rounded border border-gray-300 bg-gray-100 pl-9 pr-10 text-sm text-gray-400"/><Search className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-300"/></div>
                    <strong className="shrink-0 text-sm text-gray-700">{visibleItems.length} Barang/Jasa</strong>
                  </div>
                  <div className="hidden min-w-[980px] grid-cols-[44px_minmax(260px,1fr)_160px_80px_130px_150px_72px] bg-slate-600 px-2 py-2 text-xs font-semibold uppercase text-white lg:grid"><span className="text-center">No</span><span>Nama Barang/Jasa</span><span>Barcode / Kode</span><span className="text-center">Qty</span><span className="text-right">Harga</span><span className="text-right">Total Harga</span><span className="text-center">Aksi</span></div>
                  <div className="max-h-[350px] min-h-[240px] space-y-1 overflow-auto border border-gray-200 p-1">
                    {items.length > 0 ? items.map((item, index) => {
                      if (isPackageMemberItem(item)) return null;
                      const members = isPackageHeaderItem(item) ? packageMembersAfter(items, index) : [];
                      return (
                        <div key={`${item.id}-${index}`} className={`grid grid-cols-[minmax(0,1fr)_56px_92px_64px] items-center gap-2 border-b p-2 text-sm lg:min-w-[980px] lg:grid-cols-[44px_minmax(260px,1fr)_160px_80px_130px_150px_72px] ${members.length ? 'border-purple-200 bg-purple-50' : 'bg-white'}`}>
                          <div className="hidden text-center text-xs text-gray-400 lg:block">{items.slice(0, index).filter(row => !isPackageMemberItem(row)).length + 1}</div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{invoiceItemReceiptName(item)}</p>
                            <p className="truncate font-mono text-[10px] text-gray-500">{invoiceItemCode(item)}</p>
                            {members.length > 0 && <div className="mt-1 space-y-0.5 border-l-2 border-purple-200 pl-2 text-[10px] text-purple-700">{members.map(member => <p key={member.id}><span className="font-mono text-purple-500">{invoiceItemCode(member)}</span> · {invoiceItemReceiptName(member)} ×{member.qty}</p>)}</div>}
                          </div>
                          <div className="hidden truncate font-mono text-xs text-gray-600 lg:block" title={invoiceItemBarcodeOrCode(item)}>{invoiceItemBarcodeOrCode(item)}</div>
                          <div className="rounded border border-gray-200 bg-gray-100 px-2 py-1 text-center text-gray-600">{item.qty}</div>
                          <div className="rounded border border-gray-200 bg-gray-100 px-2 py-1 text-right text-gray-600">{item.price.toLocaleString('id-ID')}</div>
                          <strong className="hidden text-right tabular-nums lg:block">{(item.price * item.qty).toLocaleString('id-ID')}</strong>
                          <div className="flex justify-center"><span className="rounded p-1 text-gray-400" title="Rincian terkunci pada mode lihat"><Eye className="h-4 w-4"/></span></div>
                        </div>
                      );
                    }) : (
                      <div className="flex min-h-[220px] flex-col items-center justify-center px-4 text-center"><FileText className="mb-2 h-9 w-9 text-gray-300"/><p className="text-sm font-medium text-gray-500">Rincian transaksi lama tidak tersedia</p><p className="mt-1 max-w-md text-xs text-gray-400">Total faktur tetap tercatat. Rincian barang/jasa tidak tersimpan pada data faktur maupun WO terkait.</p></div>
                    )}
                  </div>
                </section>

                <section className="grid overflow-hidden rounded border border-gray-300 bg-white shadow-sm lg:grid-cols-2">
                  <div className="border-b border-gray-200 p-3 lg:border-b-0 lg:border-r">
                    <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-blue-700"><FileText className="h-5 w-5" />Informasi Faktur</h3>
                    <dl className="overflow-hidden rounded border border-gray-300 text-sm">
                      <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-3 py-2"><dt>Total</dt><dd className="font-semibold tabular-nums">Rp {invoice.total.toLocaleString('id-ID')}</dd></div>
                      <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-3 py-2"><dt>Pembayaran</dt><dd className="font-semibold tabular-nums text-emerald-700">Rp {invoice.payment.toLocaleString('id-ID')}</dd></div>
                      <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-3 py-2"><dt>Piutang / Sisa</dt><dd className={`font-semibold tabular-nums ${remaining > 0 ? 'text-amber-700' : 'text-gray-900'}`}>Rp {remaining.toLocaleString('id-ID')}</dd></div>
                      <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-3 py-2"><dt>Status</dt><dd><span className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold ${remaining <= 0 && invoice.total > 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>{remaining <= 0 && invoice.total > 0 ? 'Lunas' : 'Belum Lunas'}</span></dd></div>
                      <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-3 py-2"><dt>Tanggal Faktur</dt><dd className="font-medium">{formatShareDate(invoice.date)}</dd></div>
                      <div className="flex items-center justify-between gap-4 px-3 py-2"><dt>Metode Terakhir</dt><dd className="font-medium">{invoice.payment > 0 ? invoice.paymentMethod || 'Tunai' : '-'}</dd></div>
                    </dl>
                  </div>
                  <div className="relative min-h-[250px] p-3">
                    <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-blue-700"><Receipt className="h-5 w-5" />Riwayat Pembayaran</h3>
                    <div className="relative z-[1] max-h-40 space-y-2 overflow-y-auto pr-1">
                      {invoicePaymentHistoryLoading ? (
                        <div className="flex items-center justify-center rounded border border-dashed border-gray-300 py-6 text-sm text-gray-500"><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Memuat riwayat pembayaran...</div>
                      ) : invoicePaymentHistory.length > 0 ? invoicePaymentHistory.map(payment => (
                        <div key={payment.id} className="rounded border border-gray-300 bg-white px-3 py-2 text-sm">
                          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><button type="button" onClick={() => window.location.assign(`/customer-payments?view=${encodeURIComponent(payment.id || payment.paymentNumber)}`)} className="block max-w-full truncate font-semibold text-blue-700 hover:underline" title="Buka detail pembayaran">{payment.paymentNumber}</button><span className="text-[11px] text-gray-500">{formatShareDate(payment.date)} · {payment.paymentMethod || payment.accountName || '-'}</span></div><strong className="whitespace-nowrap tabular-nums">Rp {Number(payment.amount || 0).toLocaleString('id-ID')}</strong></div>
                          {(payment.accountName || payment.createdByName) && <p className="mt-1 truncate text-[11px] text-gray-500">{payment.accountName || '-'}{payment.createdByName ? ` · Input: ${payment.createdByName}` : ''}</p>}
                        </div>
                      )) : invoice.payment > 0 ? (
                        <div className="rounded border border-gray-300 bg-white px-3 py-2 text-sm"><div className="flex items-start justify-between gap-3"><div><strong className="block text-blue-700">Pembayaran tercatat</strong><span className="text-[11px] text-gray-500">{formatShareDate(invoice.paymentDate || invoice.date)} · {invoice.paymentMethod || 'Tunai'}</span></div><strong className="whitespace-nowrap tabular-nums">Rp {invoice.payment.toLocaleString('id-ID')}</strong></div></div>
                      ) : (
                        <div className="rounded border border-dashed border-gray-300 py-6 text-center text-sm text-gray-500">Belum ada pembayaran.</div>
                      )}
                    </div>
                    {remaining <= 0 && invoice.total > 0 && (
                      <div className="pointer-events-none absolute bottom-4 left-4 flex h-28 w-28 -rotate-12 items-center justify-center rounded-full border-[4px] border-emerald-500/25 text-emerald-500/30">
                        <div className="absolute h-20 w-20 rounded-full border-2 border-emerald-500/25" />
                        <div className="relative z-[1] w-[120%] -rotate-0 border-y-[3px] border-emerald-500/25 bg-white/70 py-1 text-center text-xl font-black tracking-widest">LUNAS</div>
                      </div>
                    )}
                  </div>
                </section>

                <section className="grid items-stretch gap-3 md:grid-cols-[minmax(280px,1fr)_minmax(460px,560px)]">
                  <div className="h-[88px] rounded border border-gray-300 bg-white px-3 py-2"><p className="line-clamp-2 text-sm uppercase leading-5 text-gray-700">{invoice.description || linkedWO?.description || 'TIDAK ADA KETERANGAN SERVICE'}</p>{invoice.payment > 0 && <p className="mt-1 text-xs text-emerald-700">Dibayar {invoice.paymentMethod || 'Tunai'}: Rp {invoice.payment.toLocaleString('id-ID')} · Sisa Rp {remaining.toLocaleString('id-ID')}</p>}</div>
                  <div className="grid h-[88px] grid-cols-3 rounded border border-gray-300 bg-white p-2 shadow-sm">
                    <div className="flex flex-col justify-between px-3 py-1"><span className="text-sm text-gray-600">Sub Total</span><strong className="text-right text-lg tabular-nums">Rp {displayedSubtotal.toLocaleString('id-ID')}</strong></div>
                    <div className="flex flex-col justify-between border-l border-gray-200 px-3 py-1"><span className="text-sm text-gray-600">Diskon</span><div className="flex h-9 items-center rounded border border-gray-300 bg-gray-100"><span className="border-r border-gray-200 px-2 text-gray-400">Rp</span><span className="min-w-0 flex-1 px-2 text-right font-semibold tabular-nums text-gray-600">{displayedDiscount.toLocaleString('id-ID')}</span></div></div>
                    <div className="flex flex-col justify-between border-l border-gray-200 px-3 py-1"><span className="text-sm text-gray-600">Total</span><strong className="text-right text-lg tabular-nums text-blue-700">Rp {invoice.total.toLocaleString('id-ID')}</strong></div>
                  </div>
                </section>
              </div>

              <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3 lg:hidden">
                <button type="button" onClick={() => void copyInvoice(invoice)} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"><Copy className="h-4 w-4" /> Salin</button>
                <button type="button" onClick={() => shareInvoiceToWhatsApp(invoice)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><MessageCircle className="h-4 w-4" /> WhatsApp</button>
                {hasPermission('invoice:edit') && <button type="button" onClick={() => { setViewingInvoice(null); handleOpenModal(invoice); }} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"><Edit className="h-4 w-4" /> Edit</button>}
                <button type="button" onClick={() => setViewingInvoice(null)} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">Tutup</button>
              </footer>
            </section>
          </div>
        );
      })()}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-0 sm:p-3 lg:static lg:z-auto lg:block lg:bg-transparent lg:p-0">
          <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-gray-50 shadow-2xl sm:h-[94vh] sm:max-w-6xl sm:rounded-xl sm:border sm:border-gray-300 lg:h-auto lg:max-w-none lg:rounded-md lg:shadow-sm">
            <div className="flex flex-shrink-0 items-center justify-between border-b border-blue-900 bg-slate-700 px-4 py-3 text-white sm:px-5 lg:hidden">
              <div>
                <h3 className="text-lg font-semibold">
                  {editingInvoice ? 'Edit Faktur Penjualan' : 'Data Baru Faktur Penjualan'}
                </h3>
                <p className="text-xs text-slate-200">Isi identitas, rincian barang/jasa, dan pembayaran</p>
              </div>
              <button
                onClick={handleCloseModal}
                className="rounded p-2 hover:bg-white/10"
              >
                <X className="h-5 w-5 text-white" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <div className="relative"><button type="button" onClick={() => setFormActionMenu(menu => menu === 'ambil' ? null : 'ambil')} className={ui.documentAction}>Ambil <ChevronDown className="h-4 w-4"/></button>{formActionMenu === 'ambil' && <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded border bg-white p-1 shadow-xl"><button type="button" onClick={() => { setFormActionMenu(null); setShowModal(false); handleOpenWOPicker(); }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-blue-50"><Wrench className="h-4 w-4 text-emerald-600"/>Ambil dari Order Kerja</button></div>}</div>
                {editingInvoice ? <div className="relative"><button type="button" onClick={() => setFormActionMenu(menu => menu === 'proses' ? null : 'proses')} className={ui.documentAction}>Proses <ChevronDown className="h-4 w-4"/></button>{formActionMenu === 'proses' && <div className="absolute right-0 top-full z-30 mt-1 w-60 rounded border bg-white p-1 shadow-xl"><button type="button" onClick={() => window.location.assign(`/customer-payments?viewInvoiceId=${encodeURIComponent(editingInvoice.id)}`)} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-blue-50"><Eye className="h-4 w-4"/>Lihat Riwayat Pembayaran</button><button type="button" disabled={formGrandTotal <= editingInvoice.payment} onClick={() => formGrandTotal > editingInvoice.payment && window.location.assign(`/customer-payments?invoiceId=${encodeURIComponent(editingInvoice.id)}`)} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-gray-400"><Receipt className="h-4 w-4"/>Tambah Pembayaran</button></div>}</div> : <button type="button" disabled title="Simpan faktur terlebih dahulu" className={ui.documentAction}>Proses <ChevronDown className="h-4 w-4"/></button>}
                <div className="order-first mr-auto flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
                  <span>Nomor: <strong className="text-gray-800">{editingInvoice?.invoiceNumber || 'Otomatis saat disimpan'}</strong></span>
                  <span>Cabang: <strong className="text-gray-800">{currentBranchId === 'ALL' ? 'Wajib pilih cabang' : data.branches.find(branch => branch.id === currentBranchId)?.name || '-'}</strong></span>
                </div>
                <button type="submit" disabled={!manualInvoiceReady} title="Simpan Faktur" className="inline-flex h-9 items-center gap-2 rounded bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-gray-300"><Save className="h-4 w-4"/>Simpan</button>
              </div>
              <section className="grid gap-3 border border-gray-300 bg-white p-3 lg:grid-cols-[1fr_1fr_190px_190px]">
              {/* Tanggal */}
              <div className="lg:order-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tanggal <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <IndonesianDateInput
                    required max={localDateKey()} disabled={!invoiceDateUnlocked}
                    value={formData.date}
                    onChange={date=>setFormData({...formData,date})}
                    className="h-10 min-w-0 flex-1"
                  />
                  <button type="button" onClick={() => hasPermission('invoice:backdate') ? setInvoiceDateUnlocked(v => !v) : window.alert('Tidak memiliki hak ubah tanggal faktur.')} title={invoiceDateUnlocked ? 'Kunci tanggal faktur' : 'Ubah tanggal faktur'} aria-label={invoiceDateUnlocked ? 'Kunci tanggal faktur' : 'Ubah tanggal faktur'} className={`inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded border ${invoiceDateUnlocked ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-blue-600 hover:bg-blue-50'}`}>
                    <Edit className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="lg:order-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">No. Nota Fisik <span className="text-xs font-normal text-gray-400">(opsional)</span></label>
                <input
                  value={formData.manualReceiptNumber}
                  onChange={(event) => setFormData({ ...formData, manualReceiptNumber: event.target.value.toUpperCase() })}
                  maxLength={50}
                  placeholder="Sesuai nota asli"
                  className="app-field h-10 w-full px-3 text-sm font-semibold uppercase"
                />
              </div>
              {/* Pelanggan & Kendaraan Picker */}
              <div className="contents">
                {editingInvoice ? (
                  <div className="space-y-3 lg:col-span-2">
                    <div className="grid grid-cols-1 gap-3 border border-blue-200 bg-blue-50 p-4 sm:grid-cols-3">
                      <div><span className="block text-[10px] font-bold uppercase text-blue-500">Pelanggan · terkunci</span><strong>{editingInvoice.customerName}</strong></div>
                      <div><span className="block text-[10px] font-bold uppercase text-blue-500">Referensi · terkunci</span><strong>{editingInvoice.woNumber || 'Faktur manual'}</strong></div>
                      <div><span className="block text-[10px] font-bold uppercase text-blue-500">Kendaraan · terkunci</span><strong>{editingInvoice.vehicleInfo}</strong></div>
                    </div>
                    {editingInvoice.woId && hasPermission('wo:edit') && (
                      <div className="rounded border border-amber-300 bg-amber-50 p-3">
                        {!identityCorrection.open ? <button type="button" onClick={() => setIdentityCorrection(current => ({ ...current, open: true }))} className="rounded border border-amber-400 bg-white px-3 py-2 text-sm font-semibold text-amber-800">Koreksi Identitas WO & Faktur</button> : (
                          <div className="grid gap-2 md:grid-cols-2">
                            <select aria-label="Customer tujuan koreksi" value={identityCorrection.customerRefId} onChange={event => setIdentityCorrection(current => ({ ...current, customerRefId: event.target.value, vehicleRefId: '', driverContactId: '' }))} className="h-10 rounded border bg-white px-3 text-sm"><option value="">Pilih customer/perusahaan</option>{data.customers.map(customer => <option key={customer.id} value={customer.id}>{customer.customerCode || customer.id} · {customer.companyName ? `${customer.companyName} / ` : ''}{customer.name}</option>)}</select>
                            <select aria-label="Kendaraan tujuan koreksi" value={identityCorrection.vehicleRefId} disabled={!identityCorrection.customerRefId} onChange={event => setIdentityCorrection(current => ({ ...current, vehicleRefId: event.target.value }))} className="h-10 rounded border bg-white px-3 text-sm disabled:bg-gray-100"><option value="">Pilih kendaraan</option>{data.vehicles.filter(vehicle => vehicle.customerRefId === identityCorrection.customerRefId || vehicle.customerId === identityCorrection.customerRefId).map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.plateNumber} · {vehicle.brand} {vehicle.model}</option>)}</select>
                            <select aria-label="Supir atau pembawa" value={identityCorrection.driverContactId} disabled={!identityCorrection.customerRefId} onChange={event => setIdentityCorrection(current => ({ ...current, driverContactId: event.target.value }))} className="h-10 rounded border bg-white px-3 text-sm disabled:bg-gray-100"><option value="">Kontak utama / tanpa supir</option>{data.customerPeople.filter(person => person.customerId === identityCorrection.customerRefId && person.isActive !== false).map(person => <option key={person.id} value={person.id}>{person.name} · {person.phone || '-'}</option>)}</select>
                            <input aria-label="Alasan koreksi terpadu" value={identityCorrection.reason} onChange={event => setIdentityCorrection(current => ({ ...current, reason: event.target.value }))} placeholder="Alasan koreksi *" className="h-10 rounded border bg-white px-3 text-sm" />
                            {identityCorrection.error && <p className="rounded bg-red-50 p-2 text-sm text-red-700 md:col-span-2">{identityCorrection.error}</p>}
                            <div className="flex gap-2 md:col-span-2"><button type="button" disabled={identityCorrection.saving || !identityCorrection.customerRefId || !identityCorrection.vehicleRefId || !identityCorrection.reason.trim()} onClick={() => void saveIdentityCorrection()} className="rounded bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-gray-300">{identityCorrection.saving ? 'Menyimpan...' : 'Simpan Koreksi Terpadu'}</button><button type="button" onClick={() => setIdentityCorrection({ open: false, customerRefId: '', vehicleRefId: '', driverContactId: '', reason: '', saving: false, error: '' })} className="rounded border bg-white px-4 py-2 text-sm">Batal</button></div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="lg:order-1">
                      <label className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                        <User className="w-4 h-4 text-blue-600" />
                        Data Pelanggan <span className="text-red-500">*</span>
                      </label>
                      <CustomerPicker
                        value={formData.customerRefId}
                        onChange={handleCustomerSelect}
                        onVehicleSelect={handleVehicleSelect}
                      />
                    </div>
                    <div className="lg:order-2">
                      <label className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                        <Car className="w-4 h-4 text-orange-600" />
                        Data Kendaraan <span className="text-red-500">*</span>
                      </label>
                      <VehiclePicker customer={selectedCustomer} value={formData.vehicleRefId} onChange={handleVehicleSelect} />
                    </div>
                  </>
                )}
              </div>
              </section>
              {data.settings.security.requireBackdateReason !== false && (formData.date < localDateKey() || (formData.payment > 0 && formData.paymentDate < localDateKey())) && (
                <input required value={formData.backdateReason} onChange={(e) => setFormData({ ...formData, backdateReason: e.target.value })} placeholder="Alasan transaksi tanggal mundur" className="w-full rounded border border-amber-400 bg-amber-50 px-4 py-2.5 lg:col-span-2" />
              )}

              <section className="relative min-h-[320px] space-y-2 border border-gray-300 bg-white p-3">
                {editingInvoice && editingInvoice.payment >= formGrandTotal && formGrandTotal > 0 && <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden"><div className="-rotate-12 rounded-full border-[5px] border-emerald-500/25 px-7 py-4 text-4xl font-black tracking-widest text-emerald-500/25">LUNAS</div></div>}
                <div className="flex items-center justify-between gap-4">
                  <div className="relative w-full max-w-xl" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setItemSearchOpen(false); }}>
                    <Search className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-400"/>
                    <input id="invoice-item-search" value={formItemSearch} onFocus={() => setItemSearchOpen(true)} onChange={event => { setFormItemSearch(event.target.value); setItemSearchOpen(true); }} onKeyDown={event => { if (event.key === 'Escape') setItemSearchOpen(false); if (event.key === 'Enter' && searchableItems[0]) { event.preventDefault(); addItemDirectly(searchableItems[0].id); } }} placeholder="Cari/Pilih Barang & Jasa..." className="h-10 w-full rounded border border-gray-300 pl-9 pr-10 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"/>
                    <button type="button" onClick={() => setItemSearchOpen(current => !current)} className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center text-blue-700"><Search className="h-5 w-5"/></button>
                    {itemSearchOpen && formItemSearch.trim() && <div className="absolute left-0 top-full z-40 mt-1 max-h-72 w-full overflow-y-auto rounded border border-gray-200 bg-white shadow-2xl">
                      {searchableItems.slice(0, 20).map(item => <button key={item.id} type="button" onMouseDown={event => event.preventDefault()} onClick={() => addItemDirectly(item.id)} className="block w-full border-b border-slate-200 px-3 py-2 text-left hover:bg-blue-50"><ItemSearchOption name={item.name} code={item.code}/></button>)}
                      {!searchableItems.length && <p className="p-4 text-center text-sm text-gray-400">Barang atau jasa tidak ditemukan.</p>}
                    </div>}
                  </div>
                  <strong className="shrink-0 text-sm text-gray-700">{visibleInvoiceItems.length} Barang/Jasa</strong>
                </div>
                <div className="hidden gap-2 sm:grid-cols-[minmax(180px,.7fr)_minmax(240px,1fr)_44px]">
                  <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"/><input value={formItemSearch} onChange={event => { setFormItemSearch(event.target.value); setFormItemToAdd(''); }} placeholder="Cari kode atau nama barang/jasa..." className="h-10 w-full rounded border border-gray-300 pl-9 pr-3 text-sm outline-none focus:border-blue-500"/></div>
                  <select value={formItemToAdd} onChange={(e) => setFormItemToAdd(e.target.value)} className="min-w-0 rounded border border-gray-300 bg-white px-3 py-2 text-sm">
                    <option value="">Pilih barang atau jasa...</option>
                    {searchableItems.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.code}</option>)}
                  </select>
                  <button type="button" disabled={!formItemToAdd} onClick={addFormItem} className="rounded bg-blue-700 px-4 py-2 text-white disabled:bg-gray-300"><Plus className="h-4 w-4" /></button>
                </div>
                <div className="hidden min-w-[980px] grid-cols-[44px_minmax(260px,1fr)_160px_80px_130px_150px_72px] bg-slate-600 px-2 py-2 text-xs font-semibold uppercase text-white lg:grid">
                  <span className="text-center">No</span><span>Nama Barang/Jasa</span><span>Barcode / Kode</span><span className="text-center">Qty</span><span className="text-right">Harga</span><span className="text-right">Total Harga</span><span className="text-center">Aksi</span>
                </div>
                <div className="max-h-[350px] min-h-[240px] space-y-1 overflow-auto border border-gray-200 p-1">
                  {formItems.map((item, index) => {
                    if (isPackageMemberItem(item)) return null;
                    const members = isPackageHeaderItem(item) ? packageMembersAfter(formItems, index) : [];
                    return (
                      <div key={item.id} className={`grid grid-cols-[minmax(0,1fr)_56px_92px_64px] items-center gap-2 border-b p-2 text-sm lg:min-w-[980px] lg:grid-cols-[44px_minmax(260px,1fr)_160px_80px_130px_150px_72px] ${members.length ? 'border-purple-200 bg-purple-50' : 'bg-white'}`}>
                        <div className="hidden text-center text-xs text-gray-400 lg:block">{formItems.slice(0, index).filter(row => !isPackageMemberItem(row)).length + 1}</div>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{invoiceItemReceiptName(item)}</p>
                          <p className="truncate font-mono text-[10px] text-gray-500">{invoiceItemCode(item)}</p>
                          {members.length > 0 && <div className="mt-1 space-y-0.5 border-l-2 border-purple-200 pl-2 text-[10px] text-purple-700">{members.map(member => <p key={member.id}><span className="font-mono text-purple-500">{invoiceItemCode(member)}</span> · {invoiceItemReceiptName(member)} ×{member.qty}</p>)}</div>}
                        </div>
                        <div className="hidden truncate font-mono text-xs text-gray-600 lg:block" title={invoiceItemBarcodeOrCode(item)}>{invoiceItemBarcodeOrCode(item)}</div>
                        <input type="number" min="1" aria-label={`Jumlah ${item.name}`} value={item.qty} onChange={(e) => updateFormItem(item.id, 'qty', Number(e.target.value) || 1)} className="rounded border px-2 py-1 text-center" />
                        <input type="number" min="0" aria-label={`Harga ${item.name}`} value={item.price} onChange={(e) => updateFormItem(item.id, 'price', Number(e.target.value) || 0)} className="rounded border px-2 py-1 text-right" />
                        <strong className="hidden text-right tabular-nums lg:block">{(item.price * item.qty).toLocaleString('id-ID')}</strong>
                        <div className="flex items-center justify-center gap-1"><button type="button" onClick={() => openItemDetail(item.id)} className="rounded p-1 text-slate-600 hover:bg-blue-50 hover:text-blue-700" title="Lihat/Edit rincian"><Eye className="h-4 w-4" /></button><button type="button" onClick={() => removeFormItem(item.id)} className="rounded p-1 text-red-600 hover:bg-red-50" title="Hapus"><Trash2 className="h-4 w-4" /></button></div>
                      </div>
                    );
                  })}
                  {formItems.length === 0 && <p className="py-4 text-center text-xs text-gray-500">Belum ada barang atau jasa.</p>}
                </div>
              </section>

              <section className="grid items-stretch gap-3 md:grid-cols-[minmax(280px,1fr)_minmax(460px,560px)]">
                <div className="h-[88px]">
                  <textarea
                    rows={2}
                    required
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value.toUpperCase() })}
                    placeholder="Keterangan service *"
                    className="h-full w-full resize-none rounded border border-gray-300 px-3 py-2 text-sm leading-5 uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div className="grid h-[88px] grid-cols-3 rounded border border-gray-300 bg-white p-2 shadow-sm">
                  <div className="flex flex-col justify-between px-3 py-1"><span className="text-sm text-gray-600">Sub Total</span><strong className="text-right text-lg tabular-nums">Rp {formItemsTotal.toLocaleString('id-ID')}</strong></div>
                  <div className="flex flex-col justify-between border-l border-gray-200 px-3 py-1"><span className="text-sm text-gray-600">Diskon</span><div className="flex h-9 items-center rounded border border-gray-300 bg-white"><span className="border-r border-gray-200 px-2 text-gray-400">Rp</span><input type="text" inputMode="numeric" value={formatPaymentInput(formDiscount)} onChange={event => setFormDiscount(Math.min(formItemsTotal, parsePaymentInput(event.target.value)))} className="min-w-0 flex-1 px-2 text-right font-semibold tabular-nums outline-none"/></div></div>
                  <div className="flex flex-col justify-between border-l border-gray-200 px-3 py-1"><span className="text-sm text-gray-600">Total</span><strong className="text-right text-lg tabular-nums text-blue-700">Rp {formGrandTotal.toLocaleString('id-ID')}</strong></div>
                </div>
              </section>

              <div className="flex items-center justify-end gap-3 border-t border-gray-300 bg-gray-100 px-4 py-2 lg:hidden">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!manualInvoiceReady}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none"
                >
                  <Save className="w-4 h-4" />
                  {editingInvoice ? 'Simpan Perubahan' : 'Simpan Faktur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detailItem && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-2 sm:p-4" role="dialog" aria-modal="true" aria-label={`Rincian ${detailItem.name}`}>
          <div className="flex h-[480px] max-h-[96vh] w-full max-w-2xl flex-col overflow-hidden rounded-sm bg-white shadow-2xl">
            <header className="flex shrink-0 items-center justify-between bg-[#12376b] px-4 py-2 text-white sm:py-2">
              <div className="flex items-center gap-2"><Edit className="h-4 w-4"/><h3 className="text-base font-semibold">Rincian Barang</h3></div>
              <button type="button" onClick={() => setDetailItemId('')} className="rounded p-1 hover:bg-white/10" aria-label="Tutup"><X className="h-4 w-4"/></button>
            </header>

            <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-300 px-3 pt-1">
              <button type="button" onClick={() => setDetailActiveTab('detail')} className={`whitespace-nowrap border-b-2 px-3 py-1.5 text-sm ${detailActiveTab === 'detail' ? 'border-red-500 font-medium text-red-600' : 'border-transparent text-gray-500'}`}>Rincian Barang</button>
              <button type="button" onClick={() => setDetailActiveTab('info')} className={`whitespace-nowrap border-b-2 px-3 py-1.5 text-sm ${detailActiveTab === 'info' ? 'border-red-500 font-medium text-red-600' : 'border-transparent text-gray-500'}`}>Info lainnya</button>
              <button type="button" onClick={() => setDetailActiveTab('image')} className={`whitespace-nowrap border-b-2 px-3 py-1.5 text-sm ${detailActiveTab === 'image' ? 'border-red-500 font-medium text-red-600' : 'border-transparent text-gray-500'}`}>Gambar</button>
            </nav>

            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:px-4 sm:py-3">
              {detailActiveTab === 'detail' && <div className="space-y-2">
                <div className="grid items-center gap-1 sm:grid-cols-[150px_minmax(0,1fr)_140px] sm:gap-2">
                  <span className="text-sm text-gray-800">Kode #</span>
                  <strong className="text-base font-medium text-sky-500">{detailItem.code}</strong>
                  {detailItem.type === 'Persediaan' ? <span className="text-right text-sm">Bisa dijual : <strong className={detailWarehouseStock > 0 ? 'text-orange-500' : 'text-red-600'}>{detailWarehouseStock}</strong></span> : <span className="text-right text-sm font-medium text-green-600">Jasa</span>}
                </div>
                <label className="grid items-center gap-1 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-2"><span className="text-sm text-gray-800">Nama Barang</span><input value={detailItem.name} readOnly className="h-10 w-full rounded border border-gray-300 bg-white px-3 text-sm font-medium outline-none sm:h-9"/></label>
                <label className="grid items-center gap-1 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-2"><span className="text-sm text-gray-800">Kuantitas</span><div className="grid grid-cols-[minmax(0,1fr)_110px]"><input type="number" min="1" value={detailQty} onChange={event => setDetailQty(Math.max(1, Number(event.target.value) || 1))} className="h-10 min-w-0 rounded-l border border-gray-300 px-3 text-right text-sm font-medium outline-none focus:border-blue-500 sm:h-9"/><div className="flex h-10 items-center justify-between rounded-r border border-l-0 border-gray-300 px-3 text-sm sm:h-9"><span className="text-blue-700">{detailItem.unit}</span><Search className="h-4 w-4"/></div></div></label>
                <label className="grid items-center gap-1 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-2"><span className="text-sm text-gray-800">@Harga</span><div className="flex h-10 overflow-hidden rounded border border-gray-300 sm:h-9"><span className="flex items-center border-r bg-gray-50 px-3 text-sm text-gray-500">Rp</span><input type="text" inputMode="numeric" value={formatPaymentInput(detailPrice)} onChange={event => setDetailPrice(parsePaymentInput(event.target.value))} className="min-w-0 flex-1 px-3 text-right text-sm font-medium outline-none"/></div></label>
                <div className="grid items-center gap-1 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-2"><span className="text-sm text-gray-800">Diskon</span><div className="grid gap-2 sm:grid-cols-2"><div className="flex h-10 overflow-hidden rounded border border-gray-300 sm:h-9"><span className="flex items-center border-r bg-gray-50 px-3 text-sm text-gray-500">%</span><input type="number" min="0" max="100" value={detailDiscountPercent} onChange={event => setDetailDiscountPercent(Math.min(100, Math.max(0, Number(event.target.value) || 0)))} className="min-w-0 flex-1 px-3 text-right text-sm outline-none"/></div><div className="flex h-10 overflow-hidden rounded border border-gray-300 sm:h-9"><span className="flex items-center border-r bg-gray-50 px-3 text-sm text-gray-500">Rp</span><input type="text" inputMode="numeric" value={formatPaymentInput(detailDiscountAmount)} onChange={event => setDetailDiscountAmount(Math.min(detailGrossTotal, parsePaymentInput(event.target.value)))} className="min-w-0 flex-1 px-3 text-right text-sm outline-none"/></div></div></div>
                <div className="grid items-center gap-1 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-2"><span className="text-sm text-gray-800">Total Harga</span><div className="flex h-10 items-center justify-end rounded border border-gray-300 bg-gray-50 px-3 sm:h-9"><strong className="text-base tabular-nums text-gray-700">Rp {detailFinalTotal.toLocaleString('id-ID')}</strong></div></div>
                {detailItem.type === 'Persediaan' && <label className="grid items-center gap-1 sm:grid-cols-[150px_minmax(0,1fr)_100px] sm:gap-2"><span className="text-sm text-gray-800">Gudang <span className="text-red-500">*</span></span><select value={detailWarehouseId} onChange={event => setDetailWarehouseId(event.target.value)} className="h-10 min-w-0 rounded border border-gray-300 bg-white px-3 text-sm outline-none sm:h-9"><option value="">Pilih gudang...</option>{availableWarehouses.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select><span className="text-sm">Stok : <strong className={detailWarehouseStock > 0 ? 'text-orange-500' : 'text-red-600'}>{detailWarehouseStock}</strong></span></label>}
                {detailItem.type === 'Persediaan' && detailWarehouseId && detailQty > detailWarehouseStock && <div role="status" className="grid items-start gap-1 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-2"><span/><div className="flex gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/><span>Stok akan menjadi <strong>{detailWarehouseStock-detailQty} {detailItem.unit}</strong>. Barang tetap dapat disimpan; lengkapi penerimaan barang pada gudang yang sama.</span></div></div>}
                <div className="grid items-center gap-1 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-2"><span className="text-sm text-gray-800">Penjual</span><div className="flex h-10 items-center rounded border border-gray-300 bg-gray-50 px-3 text-sm text-gray-600 sm:h-9">{currentUser?.name || '-'}</div></div>
              </div>}
              {detailActiveTab === 'info' && <div className="grid min-h-full content-start gap-3 sm:grid-cols-2"><div className="rounded border p-3"><p className="text-xs text-gray-500">Kategori</p><strong>{detailItem.categoryName}</strong></div><div className="rounded border p-3"><p className="text-xs text-gray-500">Merek</p><strong>{detailItem.brand || '-'}</strong></div><div className="rounded border p-3 sm:col-span-2"><p className="text-xs text-gray-500">Keterangan</p><p className="mt-1">{detailItem.description || 'Belum ada keterangan.'}</p></div></div>}
              {detailActiveTab === 'image' && <div className="flex min-h-full flex-col items-center justify-center rounded border border-dashed bg-gray-50 text-gray-400"><FileText className="mb-2 h-10 w-10"/><p>Belum ada gambar barang.</p></div>}
            </div>
            <footer className="flex shrink-0 justify-end border-t border-gray-300 bg-white px-4 py-2.5"><button type="button" onClick={confirmItemDetail} className="rounded bg-[#1756a9] px-6 py-2 text-sm font-semibold text-white shadow hover:bg-blue-800">Simpan</button></footer>
          </div>
        </div>
      )}

      {/* Rincian versi lama dinonaktifkan; tampilan Accurate digunakan di atas. */}
      {false && detailItem && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-3" role="dialog" aria-modal="true" aria-label={`Rincian ${detailItem.name}`}>
          <div className="w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <header className="flex items-center justify-between bg-blue-900 px-5 py-3 text-white"><div><h3 className="font-semibold">Rincian Barang/Jasa</h3><p className="text-xs text-blue-200">{detailItem.code} · {detailItem.type}</p></div><button type="button" onClick={() => setDetailItemId('')} className="rounded p-2 hover:bg-white/10"><X className="h-5 w-5"/></button></header>
            <div className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-4"><div><p className="text-xs text-gray-500">Nama</p><h4 className="font-bold text-gray-900">{detailItem.name}</h4><p className="text-xs text-gray-500">{detailItem.description || detailItem.categoryName}</p></div>{detailItem.type === 'Persediaan' && <div className="text-right"><p className="text-xs text-gray-500">Bisa dijual</p><strong className={detailWarehouseStock > 0 ? 'text-green-700' : 'text-red-600'}>{detailWarehouseStock} {detailItem.unit}</strong></div>}</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm text-gray-700">Kuantitas<div className="mt-1 flex h-10"><input type="number" min="1" value={detailQty} onChange={event => setDetailQty(Math.max(1, Number(event.target.value) || 1))} className="min-w-0 flex-1 rounded-l border px-3 text-right font-semibold"/><span className="flex items-center rounded-r border border-l-0 bg-gray-50 px-3">{detailItem.unit}</span></div></label>
                <label className="text-sm text-gray-700">Harga<input type="text" inputMode="numeric" value={formatPaymentInput(detailPrice)} onChange={event => setDetailPrice(parsePaymentInput(event.target.value))} className="mt-1 h-10 w-full rounded border px-3 text-right font-semibold"/></label>
                <label className="text-sm text-gray-700">Diskon (%)<input type="number" min="0" max="100" value={detailDiscountPercent} onChange={event => setDetailDiscountPercent(Math.min(100, Math.max(0, Number(event.target.value) || 0)))} className="mt-1 h-10 w-full rounded border px-3 text-right"/></label>
                <label className="text-sm text-gray-700">Diskon (Rp)<input type="text" inputMode="numeric" value={formatPaymentInput(detailDiscountAmount)} onChange={event => setDetailDiscountAmount(Math.min(detailGrossTotal, parsePaymentInput(event.target.value)))} className="mt-1 h-10 w-full rounded border px-3 text-right"/></label>
                {detailItem.type === 'Persediaan' && <label className="text-sm text-gray-700 sm:col-span-2">Gudang <span className="text-red-500">*</span><select value={detailWarehouseId} onChange={event => setDetailWarehouseId(event.target.value)} className="mt-1 h-10 w-full rounded border bg-white px-3"><option value="">Pilih gudang...</option>{availableWarehouses.map(warehouse => { const stock = data.warehouseStocks.find(row => row.warehouseId === warehouse.id && row.itemId === detailItem.id)?.quantity || 0; return <option key={warehouse.id} value={warehouse.id}>{warehouse.name} · Stok {stock} {detailItem.unit}</option>; })}</select></label>}
              </div>
              <div className="flex items-center justify-between rounded-lg bg-blue-50 p-4"><span className="font-semibold text-blue-800">Total Harga</span><strong className="text-xl tabular-nums text-blue-800">Rp {detailFinalTotal.toLocaleString('id-ID')}</strong></div>
            </div>
            <footer className="flex justify-end gap-2 border-t bg-gray-50 px-5 py-3"><button type="button" onClick={() => setDetailItemId('')} className="rounded border px-4 py-2 text-sm">Batal</button><button type="button" onClick={confirmItemDetail} className="rounded bg-blue-700 px-5 py-2 text-sm font-semibold text-white">Lanjut</button></footer>
          </div>
        </div>
      )}

      {/* WO Picker Modal */}
      {showWOPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
              <div className="flex items-center gap-3 text-white">
                <Wrench className="w-6 h-6" />
                <div>
                  <h3 className="text-lg font-semibold">Pilih Order Kerja untuk Difakturkan</h3>
                  <p className="text-sm text-green-100">{unbilledWOs.length} order kerja belum difakturkan</p>
                </div>
              </div>
              <button
                onClick={() => setShowWOPicker(false)}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={woSearchTerm}
                  onChange={(event) => setWoSearchTerm(event.target.value)}
                  placeholder="Cari nomor WO, pelanggan, atau nomor polisi..."
                  className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
                />
              </div>
              {unbilledWOs.length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                  <Wrench className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">Tidak ada order kerja yang bisa difakturkan</p>
                  <p className="text-sm">Semua order kerja sudah difakturkan atau masih draft</p>
                </div>
              ) : visibleUnbilledWOs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
                  WO selesai yang dicari tidak ditemukan.
                </div>
              ) : (
                <>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {visibleUnbilledWOs.map((wo) => (
                      <button
                        key={wo.id}
                        type="button"
                        onClick={() => handleSelectWO(wo.id)}
                        className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                          selectedWOId === wo.id
                            ? 'border-green-500 bg-green-50'
                            : 'border-gray-200 hover:border-green-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                              selectedWOId === wo.id ? 'bg-green-500 text-white' : 'bg-orange-100 text-orange-600'
                            }`}>
                              {selectedWOId === wo.id ? <CheckCircle2 className="w-5 h-5" /> : <Wrench className="w-5 h-5" />}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900">{wo.woNumber}</p>
                              <p className="text-sm font-medium text-gray-800">{wo.customerName}</p>
                              <p className="text-xs text-gray-500">{wo.plateNumber} · {wo.vehicleInfo} · {wo.services.length} layanan</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-gray-900">Rp {wo.total.toLocaleString('id-ID')}</p>
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${
                              wo.status === 'Selesai' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                            }`}>{wo.status}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  {selectedWO && (
                    <div className="bg-gray-50 rounded-lg p-4 space-y-3 border border-gray-200">
                      <div className="grid grid-cols-1 gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm sm:grid-cols-3">
                        <div><span className="block text-[10px] font-bold uppercase text-blue-500">Pelanggan · terkunci</span><strong>{selectedWO.customerName}</strong></div>
                        <div><span className="block text-[10px] font-bold uppercase text-blue-500">Nomor WO · terkunci</span><strong>{selectedWO.woNumber}</strong></div>
                        <div><span className="block text-[10px] font-bold uppercase text-blue-500">Kendaraan · terkunci</span><strong>{selectedWO.plateNumber}</strong><span className="block text-xs text-gray-500">{selectedWO.vehicleInfo}</span></div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold mb-1">No. Nota Fisik <span className="font-normal text-gray-400">(opsional, unik)</span></label>
                          <input value={woManualReceiptNumber} onChange={(event) => setWoManualReceiptNumber(event.target.value.toUpperCase())} maxLength={50} placeholder="Sesuai nota asli" className="app-field h-10 w-full px-3 text-sm font-semibold uppercase" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold mb-1">Tanggal Faktur</label>
                          <IndonesianDateInput max={localDateKey()} value={woInvoiceDate} onChange={setWoInvoiceDate} disabled={!hasPermission('invoice:backdate')} className="h-10 w-full" />
                        </div>
                        {woPayment > 0 && <div>
                          <label className="block text-xs font-semibold mb-1">Tanggal Pembayaran</label>
                          <IndonesianDateInput min={woInvoiceDate} max={localDateKey()} value={woPaymentDate} onChange={setWoPaymentDate} disabled={!hasPermission('payment:backdate')} className="h-10 w-full" />
                        </div>}
                      </div>
                      {data.settings.security.requireBackdateReason !== false && (woInvoiceDate < localDateKey() || (woPayment > 0 && woPaymentDate < localDateKey())) && (
                        <input required value={woBackdateReason} onChange={(e) => setWoBackdateReason(e.target.value)} placeholder="Alasan transaksi tanggal mundur" className="w-full px-3 py-2 border border-amber-400 bg-amber-50 rounded-lg" />
                      )}
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-gray-700">Barang/Jasa Invoice</p>
                        <span className="text-xs text-gray-500">Salinan mandiri dari WO</span>
                      </div>
                      <div className="flex gap-2">
                        <select value={woItemToAdd} onChange={(e) => setWoItemToAdd(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
                          <option value="">Tambah barang atau jasa...</option>
                          {data.items.filter((item) => item.isActive && item.type !== 'Group').map((item) => <option key={item.id} value={item.id}>{item.name} — {item.code}</option>)}
                        </select>
                        <button type="button" disabled={!woItemToAdd} onClick={addWODraftItem} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-gray-300"><Plus className="h-4 w-4" /></button>
                      </div>
                      <div className="max-h-56 space-y-2 overflow-y-auto">
                        {woDraftItems.map((item, index) => {
                          if (isPackageMemberItem(item)) return null;
                          const members = isPackageHeaderItem(item) ? packageMembersAfter(woDraftItems, index) : [];
                          return (
                            <div key={item.id} className={`grid grid-cols-[minmax(0,1fr)_64px_110px_32px] items-center gap-2 rounded-lg border p-2 text-sm ${members.length ? 'border-purple-200 bg-purple-50' : 'bg-white'}`}>
                              <div className="min-w-0">
                                <p className="truncate font-medium text-gray-800">{item.name}</p>
                                <p className="truncate text-[10px] text-gray-500">{item.code || 'Jasa tambahan'} · {item.description}</p>
                                {members.length > 0 && <p className="mt-1 text-[10px] text-purple-700"><strong>Isi paket:</strong> {members.map(member => member.name.replace(/^\s*-\s*/, '')).join(' • ')}</p>}
                              </div>
                              <input aria-label={`Jumlah ${item.name}`} type="number" min="1" value={item.qty} onChange={(e) => updateWODraftItem(item.id, 'qty', Number(e.target.value) || 1)} className="rounded border px-2 py-1 text-center" />
                              <input aria-label={`Harga ${item.name}`} type="number" min="0" value={item.price} onChange={(e) => updateWODraftItem(item.id, 'price', Number(e.target.value) || 0)} className="rounded border px-2 py-1 text-right" />
                              <button type="button" onClick={() => removeWODraftItem(item.id)} className="rounded p-1 text-red-600 hover:bg-red-50" title="Hapus dari invoice"><Trash2 className="h-4 w-4" /></button>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex justify-between border-t pt-3 text-sm font-bold"><span>Total Invoice</span><span>Rp {woDraftTotal.toLocaleString('id-ID')}</span></div>
                      <div className="pt-3 border-t border-gray-200">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Metode Pembayaran</label>
                        <div className="mb-3 grid grid-cols-2 gap-2">
                          {(['Tunai', 'Transfer'] as const).map((method) => (
                            <button
                              key={method}
                              type="button"
                              onClick={() => setWoPaymentMethod(method)}
                              className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                                woPaymentMethod === method
                                  ? 'border-green-500 bg-green-50 text-green-700'
                                  : 'border-gray-300 bg-white text-gray-600'
                              }`}
                            >
                              {method}
                            </button>
                          ))}
                        </div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Jumlah Pembayaran (Rp)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={formatPaymentInput(woPayment)}
                          onChange={(e) => setWoPayment(parsePaymentInput(e.target.value))}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-right font-semibold tabular-nums focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                        />
                        <p className={`mt-2 text-sm font-medium ${woPayment >= selectedWO.total ? 'text-green-600' : 'text-yellow-600'}`}>
                          Status: {woPayment >= woDraftTotal ? 'Lunas' : `Belum Lunas (sisa Rp ${Math.max(0, woDraftTotal - woPayment).toLocaleString('id-ID')})`}
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="px-6 pb-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowWOPicker(false)}
                className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!selectedWO || isCreatingFromWO}
                onClick={handleCreateFromWO}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors shadow-lg shadow-green-600/20"
              >
                <Receipt className="w-4 h-4" />
                {isCreatingFromWO ? 'Menyimpan...' : 'Buat Faktur'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
