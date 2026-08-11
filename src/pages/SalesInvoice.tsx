import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Edit, Trash2, FileText, X, Save, Filter, Download, Printer, Wrench, CheckCircle2, Receipt, User, Car, Copy, MessageCircle, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { SalesInvoice } from '../types';
import CustomerPicker from '../components/CustomerPicker';
import VehiclePicker from '../components/VehiclePicker';
import { api } from '../lib/apiClient';
import { localDateKey } from '../lib/date';

const formatPaymentInput = (value: number) => value ? value.toLocaleString('id-ID') : '';
const parsePaymentInput = (value: string) => Number(value.replace(/\D/g, '')) || 0;

export default function SalesInvoice() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, addInvoice, updateInvoice, deleteInvoice, createInvoiceFromWO, currentBranchId, hasPermission, currentUser, generateDocumentNumber, refreshData, isLoading, hasLoadedData } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<SalesInvoice | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<SalesInvoice | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [showWOPicker, setShowWOPicker] = useState(false);
  const [woSearchTerm, setWoSearchTerm] = useState('');
  const [selectedWOId, setSelectedWOId] = useState('');
  const [woDraftItems, setWoDraftItems] = useState<NonNullable<SalesInvoice['items']>>([]);
  const [woItemToAdd, setWoItemToAdd] = useState('');
  const [woPayment, setWoPayment] = useState(0);
  const [woPaymentMethod, setWoPaymentMethod] = useState<'Tunai' | 'Transfer'>('Tunai');
  const [invoiceDateUnlocked, setInvoiceDateUnlocked] = useState(false);
  const [paymentDateUnlocked, setPaymentDateUnlocked] = useState(false);
  const [woInvoiceDate, setWoInvoiceDate] = useState(localDateKey());
  const [woPaymentDate, setWoPaymentDate] = useState(localDateKey());
  const [woBackdateReason, setWoBackdateReason] = useState('');
  const [isCreatingFromWO, setIsCreatingFromWO] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [formItems, setFormItems] = useState<NonNullable<SalesInvoice['items']>>([]);
  const [formItemToAdd, setFormItemToAdd] = useState('');

  const [formData, setFormData] = useState({
    date: localDateKey(),
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
    status: 'Lunas' as 'Lunas' | 'Belum Lunas',
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
  const formItemsTotal = formItems.reduce((sum, item) => sum + item.price * item.qty, 0);

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
          inv.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          inv.vehicleInfo.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = !filterStatus || inv.status === filterStatus;
        const matchesDate = !filterDate || inv.date === filterDate;
        return matchesSearch && matchesStatus && matchesDate;
      })
      .sort((a, b) => {
        // Newest first: compare by date desc, then by invoice number desc
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return b.invoiceNumber.localeCompare(a.invoiceNumber);
      });
  }, [data.invoices, searchTerm, filterStatus, filterDate, currentBranchId]);

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
    return `INVOICE ${invoice.invoiceNumber} ( ${formatShareDate(invoice.date)} )\n👤 ${invoice.customerName}\n🚗 ${invoice.vehicleInfo || '-'}${invoice.woNumber ? `\nWO: ${invoice.woNumber}` : ''}\n\nRincian:\n${itemLines}\n\nTotal: Rp ${invoice.total.toLocaleString('id-ID')}\nBayar: Rp ${invoice.payment.toLocaleString('id-ID')}\nStatus: ${invoice.status}\nMetode: ${invoice.paymentMethod || 'Tunai'}\n\nDOKTER AC MOBIL — ${branch}`;
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
      status: 'Lunas',
    });
    setEditingInvoice(null);
    setFormItems([]);
    setFormItemToAdd('');
    setInvoiceDateUnlocked(false);
    setPaymentDateUnlocked(false);
  };

  const handleOpenModal = (invoice?: SalesInvoice) => {
    if (invoice) {
      setEditingInvoice(invoice);
      const matchedVehicle = data.vehicles.find(
        (v) => invoice.vehicleInfo.includes(v.plateNumber)
      );
      setFormData({
        date: invoice.date,
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
      setFormItems((invoice.items || []).map((item, index) => ({ ...item, id: `edit-${invoice.id}-${index}` })));
    } else {
      resetForm();
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    resetForm();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
    const finalForm = {
      ...formData,
      total: finalTotal,
      payment: Math.min(formData.payment, finalTotal),
      status: formData.payment >= finalTotal ? 'Lunas' as const : 'Belum Lunas' as const,
      items: formItems,
    };
    const targetBranchId = (currentBranchId === 'ALL' ? currentUser?.branchId : currentBranchId) || 'BR-001';
    const invoiceNumber = generateDocumentNumber('invoice', targetBranchId, new Date(`${formData.date}T12:00:00`));

    if (editingInvoice) {
      updateInvoice(editingInvoice.id, {
        ...editingInvoice,
        ...finalForm,
        age: finalForm.status === 'Lunas' ? 0 : Math.floor((Date.now() - new Date(finalForm.date).getTime()) / (1000 * 60 * 60 * 24)),
      });
    } else {
      addInvoice({
        id: Date.now().toString(),
        invoiceNumber,
        ...finalForm,
        age: finalForm.status === 'Lunas' ? 0 : 0,
        branchId: targetBranchId,
      });
    }
    handleCloseModal();
  };

  const handleDeletePayment = async (invoice: SalesInvoice) => {
    if (invoice.payment <= 0) return;
    if (!window.confirm(`Hapus pembayaran Rp ${invoice.payment.toLocaleString('id-ID')} dari ${invoice.invoiceNumber}? Invoice akan kembali terutang.`)) return;
    try {
      const result = await api.deleteCustomerPaymentsForInvoice(invoice.id);
      if (!result.success) throw new Error(result.message || 'Pembayaran gagal dihapus');
      await refreshData();
      setSuccessMsg(`Pembayaran ${invoice.invoiceNumber} dihapus. Invoice kembali ${invoice.total <= 0 ? 'Lunas (Rp0)' : 'Belum Lunas'}.`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (error: any) {
      window.alert(`Gagal menghapus pembayaran: ${error?.message || 'terjadi kesalahan'}`);
    }
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
          woDraftItems
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
    <div className="space-y-6">
      {/* Success Message */}
      {successMsg && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-sm font-medium text-green-800">{successMsg}</p>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Cari nomor faktur, pelanggan, kendaraan..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white text-sm"
              >
                <option value="">Semua Status</option>
                <option value="Lunas">Lunas</option>
                <option value="Belum Lunas">Belum Lunas</option>
              </select>
            </div>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
            />
          </div>
          <div className="flex gap-2">
            {hasPermission('invoice:create') && (
              <>
                <button
                  type="button"
                  onClick={handleOpenWOPicker}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700"
                >
                  <Wrench className="h-4 w-4" />
                  <span className="hidden xl:inline">Faktur dari WO</span>
                  {unbilledWOs.length > 0 && <span className="rounded-full bg-white px-1.5 text-xs font-bold text-green-700">{unbilledWOs.length}</span>}
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenModal()}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
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
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white p-2.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60 lg:px-3"
              title="Ambil ulang data faktur dari server"
            >
              <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden lg:inline">{isLoading ? 'Memuat…' : 'Refresh'}</span>
            </button>
            <button className="p-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors" title="Download">
              <Download className="w-5 h-5" />
            </button>
            <button className="p-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors" title="Print">
              <Printer className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-blue-800 to-blue-900 text-white">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Tanggal</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Nomor #</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">ID Pelanggan</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Pelanggan</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Keterangan</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider">Umur (hr)</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider">Total</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider">Bayar</th>
                {currentBranchId === 'ALL' && <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Cabang</th>}
                <th className="sticky right-0 bg-blue-900 px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-12 text-center text-gray-500">
                    <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-lg font-medium">Tidak ada data faktur</p>
                    <p className="text-sm">Silakan buat faktur baru atau pilih cabang lain</p>
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-blue-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{invoice.date}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setViewingInvoice(invoice)}
                        className="font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                        title="Buka detail faktur"
                      >
                        {invoice.invoiceNumber}
                      </button>
                      {invoice.woNumber && (
                        <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px] font-medium" title={`Dari ${invoice.woNumber}`}>
                          WO
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 font-mono">{invoice.customerId}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{invoice.customerName}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{invoice.vehicleInfo} / {invoice.description}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                          invoice.status === 'Lunas'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {invoice.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">{invoice.age}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium whitespace-nowrap">
                      {invoice.total.toLocaleString('id-ID')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap">
                      <div>{invoice.payment.toLocaleString('id-ID')}</div>
                      <div className="text-[10px] font-medium text-gray-500">{invoice.paymentMethod || 'Tunai'}</div>
                    </td>
                    {currentBranchId === 'ALL' && (
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-700">
                          {data.branches.find(b => b.id === invoice.branchId)?.name.replace('CABANG ', '') || 'N/A'}
                        </span>
                      </td>
                    )}
                    <td className="sticky right-0 bg-white group-hover:bg-blue-50 px-4 py-3 shadow-[-4px_0_10px_rgba(0,0,0,0.05)]">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => void copyInvoice(invoice)}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                          title="Salin invoice"
                        >
                          <Copy className="h-3.5 w-3.5" /><span className="lg:hidden">Salin</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => shareInvoiceToWhatsApp(invoice)}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                          title="Bagikan invoice ke WhatsApp"
                        >
                          <MessageCircle className="h-3.5 w-3.5" /><span className="lg:hidden">WhatsApp</span>
                        </button>
                        {hasPermission('invoice:edit') && (
                          <button
                            onClick={() => handleOpenModal(invoice)}
                            className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors shadow-sm"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}
                        {hasPermission('invoice:edit') && invoice.payment > 0 && (
                          <button
                            type="button"
                            onClick={() => void handleDeletePayment(invoice)}
                            className="rounded-lg p-1.5 text-orange-600 shadow-sm transition-colors hover:bg-orange-100"
                            title="Hapus pembayaran"
                          >
                            <Receipt className="h-4 w-4" />
                          </button>
                        )}
                        {hasPermission('invoice:delete') && (
                          <button
                            onClick={() => void handleDelete(invoice)}
                            className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors shadow-sm"
                            title="Hapus"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
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
        const remaining = Math.max(0, invoice.total - invoice.payment);
        const items = invoice.items || [];
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-0 sm:p-4">
            <section className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:max-w-3xl sm:rounded-2xl" role="dialog" aria-modal="true" aria-label={`Detail faktur ${invoice.invoiceNumber}`}>
              <header className="flex items-start justify-between border-b border-gray-200 bg-gradient-to-r from-blue-700 to-blue-900 px-5 py-4 text-white sm:px-6">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-blue-100">Detail Faktur Penjualan</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold">{invoice.invoiceNumber}</h2>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${invoice.status === 'Lunas' ? 'bg-emerald-400/20 text-emerald-100' : 'bg-amber-300/20 text-amber-100'}`}>{invoice.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-blue-100">{formatShareDate(invoice.date)} - {branchName}</p>
                </div>
                <button type="button" onClick={() => setViewingInvoice(null)} className="rounded-lg p-2 text-blue-100 hover:bg-white/15 hover:text-white" aria-label="Tutup detail faktur">
                  <X className="h-5 w-5" />
                </button>
              </header>

              <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
                <div className="grid gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 sm:grid-cols-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-blue-500">Pelanggan</span>
                    <p className="font-bold text-gray-900">{invoice.customerName}</p>
                    <p className="text-sm text-gray-600">{customer?.phone || invoice.customerId}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-blue-500">Kendaraan</span>
                    <p className="font-semibold text-gray-900">{invoice.vehicleInfo || '-'}</p>
                    {invoice.woNumber && <p className="text-sm font-medium text-orange-700">Referensi {invoice.woNumber}</p>}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-bold text-gray-900">Rincian Barang &amp; Jasa</h3>
                    <span className="text-xs text-gray-500">{items.filter(item => !isPackageMemberItem(item)).length} item</span>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-gray-200">
                    {items.length > 0 ? items.map((item, index) => {
                      if (isPackageMemberItem(item)) return null;
                      const members = isPackageHeaderItem(item) ? packageMembersAfter(items, index) : [];
                      return (
                        <div key={`${item.id}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0">
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900">{item.description || item.name}</p>
                            <p className="text-xs text-gray-500">{item.code || 'Jasa'} - {item.qty} x Rp {item.price.toLocaleString('id-ID')}</p>
                            {members.length > 0 && <p className="mt-1 text-xs text-purple-700">Isi paket: {members.map(member => member.name.replace(/^\s*-\s*/, '')).join(' - ')}</p>}
                          </div>
                          <strong className="whitespace-nowrap text-gray-900">Rp {(item.qty * item.price).toLocaleString('id-ID')}</strong>
                        </div>
                      );
                    }) : (
                      <div className="px-4 py-6 text-center text-sm text-gray-500">{invoice.description || 'Tidak ada rincian item.'}</div>
                    )}
                  </div>
                </div>

                <div className="ml-auto w-full space-y-2 rounded-xl bg-gray-50 p-4 sm:max-w-md">
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Total</span><strong>Rp {invoice.total.toLocaleString('id-ID')}</strong></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Dibayar ({invoice.paymentMethod || 'Tunai'})</span><strong className="text-emerald-700">Rp {invoice.payment.toLocaleString('id-ID')}</strong></div>
                  <div className="flex justify-between border-t border-gray-200 pt-2"><span className="font-semibold text-gray-700">Sisa</span><strong className={remaining > 0 ? 'text-amber-700' : 'text-emerald-700'}>Rp {remaining.toLocaleString('id-ID')}</strong></div>
                </div>
              </div>

              <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3 sm:px-6">
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingInvoice ? 'Edit Faktur' : 'Buat Faktur Baru'}
                </h3>
                <p className="text-sm text-gray-500">Isi data faktur penjualan</p>
              </div>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Tanggal */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tanggal <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  max={localDateKey()}
                  disabled={!invoiceDateUnlocked}
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg disabled:bg-gray-100 disabled:text-gray-500 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <button type="button" onClick={() => hasPermission('invoice:backdate') ? setInvoiceDateUnlocked(v => !v) : window.alert('Tidak memiliki hak ubah tanggal faktur.')} className="mt-1 text-xs font-semibold text-blue-600">
                  {invoiceDateUnlocked ? 'Kunci tanggal' : 'Buka tanggal mundur'}
                </button>
              </div>
              {data.settings.security.requireBackdateReason !== false && (formData.date < localDateKey() || (formData.payment > 0 && formData.paymentDate < localDateKey())) && (
                <input required value={formData.backdateReason} onChange={(e) => setFormData({ ...formData, backdateReason: e.target.value })} placeholder="Alasan transaksi tanggal mundur" className="w-full px-4 py-2.5 border border-amber-400 bg-amber-50 rounded-lg" />
              )}

              {/* Pelanggan & Kendaraan Picker */}
              <div className="space-y-4">
                {editingInvoice?.woId ? (
                  <div className="grid grid-cols-1 gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 sm:grid-cols-3">
                    <div><span className="block text-[10px] font-bold uppercase text-blue-500">Pelanggan · terkunci</span><strong>{editingInvoice.customerName}</strong></div>
                    <div><span className="block text-[10px] font-bold uppercase text-blue-500">Referensi · terkunci</span><strong>{editingInvoice.woNumber}</strong></div>
                    <div><span className="block text-[10px] font-bold uppercase text-blue-500">Kendaraan · terkunci</span><strong>{editingInvoice.vehicleInfo}</strong></div>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                        <User className="w-4 h-4 text-blue-600" />
                        Data Pelanggan <span className="text-red-500">*</span>
                      </label>
                      <CustomerPicker value={formData.customerRefId} onChange={handleCustomerSelect} />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                        <Car className="w-4 h-4 text-orange-600" />
                        Data Kendaraan <span className="text-red-500">*</span>
                      </label>
                      <VehiclePicker customer={selectedCustomer} value={formData.vehicleRefId} onChange={handleVehicleSelect} />
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center justify-between"><label className="text-sm font-semibold text-gray-800">Barang/Jasa Invoice</label><span className="text-xs text-gray-500">Tidak mengubah barang/jasa WO</span></div>
                <div className="flex gap-2">
                  <select value={formItemToAdd} onChange={(e) => setFormItemToAdd(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
                    <option value="">Pilih barang atau jasa...</option>
                    {data.items.filter((item) => item.isActive && item.type !== 'Group').map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}
                  </select>
                  <button type="button" disabled={!formItemToAdd} onClick={addFormItem} className="rounded-lg bg-blue-600 px-3 py-2 text-white disabled:bg-gray-300"><Plus className="h-4 w-4" /></button>
                </div>
                <div className="max-h-56 space-y-2 overflow-y-auto">
                  {formItems.map((item, index) => {
                    if (isPackageMemberItem(item)) return null;
                    const members = isPackageHeaderItem(item) ? packageMembersAfter(formItems, index) : [];
                    return (
                      <div key={item.id} className={`grid grid-cols-[minmax(0,1fr)_64px_110px_32px] items-center gap-2 rounded-lg border p-2 text-sm ${members.length ? 'border-purple-200 bg-purple-50' : 'bg-white'}`}>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{item.name}</p>
                          <p className="truncate text-[10px] text-gray-500">{item.code || 'Jasa'} · {item.description}</p>
                          {members.length > 0 && <p className="mt-1 text-[10px] text-purple-700"><strong>Isi paket:</strong> {members.map(member => member.name.replace(/^\s*-\s*/, '')).join(' • ')}</p>}
                        </div>
                        <input type="number" min="1" aria-label={`Jumlah ${item.name}`} value={item.qty} onChange={(e) => updateFormItem(item.id, 'qty', Number(e.target.value) || 1)} className="rounded border px-2 py-1 text-center" />
                        <input type="number" min="0" aria-label={`Harga ${item.name}`} value={item.price} onChange={(e) => updateFormItem(item.id, 'price', Number(e.target.value) || 0)} className="rounded border px-2 py-1 text-right" />
                        <button type="button" onClick={() => removeFormItem(item.id)} className="rounded p-1 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    );
                  })}
                  {formItems.length === 0 && <p className="py-4 text-center text-xs text-gray-500">Belum ada barang atau jasa.</p>}
                </div>
              </div>

              {/* Keterangan & Pembayaran */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Keterangan Service <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value.toUpperCase() })}
                    placeholder="Deskripsi service AC yang dilakukan"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none uppercase"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Total (Rp) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    readOnly
                    value={formItemsTotal}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-100 font-semibold outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pembayaran (Rp) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    value={formatPaymentInput(formData.payment)}
                    onChange={(e) => {
                      const payment = parsePaymentInput(e.target.value);
                      setFormData({
                        ...formData,
                        payment,
                        status: payment >= formItemsTotal ? 'Lunas' : 'Belum Lunas',
                      });
                    }}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-right font-semibold tabular-nums focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Metode Pembayaran</label>
                  <select
                    value={formData.paymentMethod}
                    onChange={(e) => setFormData({
                      ...formData,
                      paymentMethod: e.target.value as 'Tunai' | 'Transfer',
                    })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    <option value="Tunai">Tunai</option>
                    <option value="Transfer">Transfer</option>
                  </select>
                </div>
                {formData.payment > 0 && <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Pembayaran</label>
                  <input type="date" min={formData.date} max={localDateKey()} disabled={!paymentDateUnlocked} value={formData.paymentDate} onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })} className="w-full px-4 py-2.5 border rounded-lg disabled:bg-gray-100" />
                  <button type="button" onClick={() => hasPermission('payment:backdate') ? setPaymentDateUnlocked(v => !v) : window.alert('Tidak memiliki hak ubah tanggal pembayaran.')} className="mt-1 text-xs font-semibold text-blue-600">Buka tanggal pembayaran</button>
                </div>}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="status"
                        value="Lunas"
                        checked={formData.status === 'Lunas'}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value as 'Lunas' })}
                        className="w-4 h-4 text-green-600"
                      />
                      <span className="text-sm text-gray-700">Lunas</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="status"
                        value="Belum Lunas"
                        checked={formData.status === 'Belum Lunas'}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value as 'Belum Lunas' })}
                        className="w-4 h-4 text-yellow-600"
                      />
                      <span className="text-sm text-gray-700">Belum Lunas</span>
                    </label>
                  </div>
                </div>
              </div>

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
                  {editingInvoice ? 'Simpan Perubahan' : 'Simpan Faktur'}
                </button>
              </div>
            </form>
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
                          <label className="block text-xs font-semibold mb-1">Tanggal Faktur</label>
                          <input type="date" max={localDateKey()} value={woInvoiceDate} onChange={(e) => setWoInvoiceDate(e.target.value)} disabled={!hasPermission('invoice:backdate')} className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-100" />
                        </div>
                        {woPayment > 0 && <div>
                          <label className="block text-xs font-semibold mb-1">Tanggal Pembayaran</label>
                          <input type="date" min={woInvoiceDate} max={localDateKey()} value={woPaymentDate} onChange={(e) => setWoPaymentDate(e.target.value)} disabled={!hasPermission('payment:backdate')} className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-100" />
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
                          {data.items.filter((item) => item.isActive && item.type !== 'Group').map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}
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
