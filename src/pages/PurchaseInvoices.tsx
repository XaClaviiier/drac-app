import { useEffect, useMemo, useState } from 'react';
import { FileText, Plus, Search, Edit, Trash2, X, Save, CheckCircle2, Wallet, Eye, CreditCard, Receipt, Filter, Download, Printer } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { PurchaseInvoice, PurchaseInvoiceItem, PurchasePayment, GoodsReceipt } from '../types';
import { addLocalDays, localDateKey } from '../lib/date';
import { api } from '../lib/apiClient';
import IndonesianDateInput from '../components/IndonesianDateInput';
import ActiveFilterResetButton from '../components/ActiveFilterResetButton';

type CashAccount = {
  id: string;
  name: string;
  code?: string;
  accountType: 'cash' | 'bank';
  branchId?: string | null;
  isActive: boolean;
};

export default function PurchaseInvoicesPage() {
  const {
    data, addPurchaseInvoice, updatePurchaseInvoice, deletePurchaseInvoice,
    generatePurchaseInvoiceNumber, addPurchasePayment, deletePurchasePayment,
    currentBranchId, hasPermission, currentUser,
  } = useApp();

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [periodFilter, setPeriodFilter] = useState<'this_month' | 'last_month' | '7_days' | '30_days' | 'custom' | 'all'>('this_month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const purchaseFiltersActive = Boolean(periodFilter !== 'this_month' || filterStatus || dateFrom || dateTo);
  const resetPurchaseFilters = () => {
    setPeriodFilter('this_month');
    setFilterStatus('');
    setDateFrom('');
    setDateTo('');
  };
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PurchaseInvoice | null>(null);
  const [viewing, setViewing] = useState<PurchaseInvoice | null>(null);
  const [form, setForm] = useState({
    date: localDateKey(),
    dueDate: addLocalDays(30),
    supplierId: '',
    supplierInvoiceNumber: '',
    receiptIds: [] as string[],
    items: [] as PurchaseInvoiceItem[],
    discount: 0,
    tax: 0,
    notes: '',
  });

  const [showReceiptPicker, setShowReceiptPicker] = useState(false);

  useEffect(() => {
    let mounted = true;
    api.get<CashAccount[]>('cash-accounts').then((result) => {
      if (mounted && result.success) setCashAccounts(result.data || []);
    });
    return () => { mounted = false; };
  }, []);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payingInvoice, setPayingInvoice] = useState<PurchaseInvoice | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    date: localDateKey(),
    amount: 0,
    paymentMethod: 'Transfer Bank' as PurchasePayment['paymentMethod'],
    bankAccount: '',
    notes: '',
  });

  const periodRange = useMemo(() => {
    const now = new Date();
    const toKey = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    if (periodFilter === 'this_month') return { from: toKey(startOfThisMonth), to: toKey(now) };
    if (periodFilter === 'last_month') {
      return {
        from: toKey(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: toKey(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    }
    if (periodFilter === '7_days' || periodFilter === '30_days') {
      const days = periodFilter === '7_days' ? 7 : 30;
      const from = new Date(now);
      from.setDate(from.getDate() - (days - 1));
      return { from: toKey(from), to: toKey(now) };
    }
    if (periodFilter === 'custom') return { from: dateFrom, to: dateTo };
    return { from: '', to: '' };
  }, [periodFilter, dateFrom, dateTo]);

  const periodInvoices = useMemo(() => {
    return data.purchaseInvoices.filter((p) => {
      const branchMatch = currentBranchId === 'ALL' || p.branchId === currentBranchId;
      const fromMatch = !periodRange.from || p.date >= periodRange.from;
      const toMatch = !periodRange.to || p.date <= periodRange.to;
      return branchMatch && fromMatch && toMatch;
    });
  }, [data.purchaseInvoices, currentBranchId, periodRange]);

  const filtered = useMemo(() => {
    return periodInvoices
      .filter((p) => {
        const q = search.toLowerCase();
        const searchMatch = !q ||
          p.invoiceNumber.toLowerCase().includes(q) ||
          p.supplierName.toLowerCase().includes(q) ||
          p.supplierInvoiceNumber.toLowerCase().includes(q);
        const statusMatch = !filterStatus || p.status === filterStatus;
        return searchMatch && statusMatch;
      })
      .sort((a, b) => {
        const dc = b.date.localeCompare(a.date);
        return dc !== 0 ? dc : b.invoiceNumber.localeCompare(a.invoiceNumber);
      });
  }, [periodInvoices, search, filterStatus]);

  // Receipts available for selected supplier (still has remaining qty to invoice)
  const availableReceipts = useMemo(() => {
    if (!form.supplierId) return [];
    return data.goodsReceipts.filter(r => {
      if (r.supplierId !== form.supplierId) return false;
      if (r.status !== 'Diterima') return false;
      if (currentBranchId !== 'ALL' && r.branchId !== currentBranchId) return false;
      // Has at least 1 item with remaining qty
      return r.items.some(it => (it.qty - (it.qtyInvoiced || 0)) > 0);
    });
  }, [data.goodsReceipts, form.supplierId, currentBranchId]);

  const subtotal = form.items.reduce((s, i) => s + i.subtotal, 0);
  const total = subtotal - form.discount + form.tax;

  const openModal = (invoice?: PurchaseInvoice) => {
    if (invoice) {
      setEditing(invoice);
      setForm({
        date: invoice.date, dueDate: invoice.dueDate,
        supplierId: invoice.supplierId, supplierInvoiceNumber: invoice.supplierInvoiceNumber,
        receiptIds: [...invoice.receiptIds], items: [...invoice.items],
        discount: invoice.discount, tax: invoice.tax, notes: invoice.notes,
      });
    } else {
      setEditing(null);
      setForm({
        date: localDateKey(),
        dueDate: addLocalDays(30),
        supplierId: '', supplierInvoiceNumber: '', receiptIds: [], items: [], discount: 0, tax: 0, notes: '',
      });
    }
    setShowModal(true);
  };

  const toggleReceipt = (receipt: GoodsReceipt) => {
    const exists = form.receiptIds.includes(receipt.id);
    if (exists) {
      setForm(prev => ({
        ...prev,
        receiptIds: prev.receiptIds.filter(id => id !== receipt.id),
        items: prev.items.filter(it => it.receiptId !== receipt.id),
      }));
    } else {
      const newLines: PurchaseInvoiceItem[] = receipt.items
        .filter(it => it.qty - (it.qtyInvoiced || 0) > 0)
        .map(it => {
          const masterItem = data.items.find(m => m.id === it.itemId);
          const remainingQty = it.qty - (it.qtyInvoiced || 0);
          return {
            id: `${Date.now()}-${it.itemId}-${Math.random().toString(36).slice(2, 5)}`,
            receiptId: receipt.id, receiptNumber: receipt.receiptNumber,
            itemId: it.itemId, itemCode: it.itemCode, itemName: it.itemName,
            qty: remainingQty, unit: it.unit,
            unitPrice: it.unitPrice ?? masterItem?.purchasePrice ?? 0,
            discount: (it.discountAmount || 0) * (remainingQty / Math.max(1, it.qty)),
            subtotal: Math.max(0, remainingQty * (it.unitPrice ?? masterItem?.purchasePrice ?? 0) - ((it.discountAmount || 0) * (remainingQty / Math.max(1, it.qty)))),
          };
        });
      setForm(prev => ({
        ...prev,
        receiptIds: [...prev.receiptIds, receipt.id],
        items: [...prev.items, ...newLines],
      }));
    }
  };

  const updateItemLine = (id: string, field: 'qty' | 'unitPrice' | 'discount', value: number) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.map(it => {
        if (it.id !== id) return it;
        const u = { ...it, [field]: value };
        u.subtotal = Math.max(0, u.qty * u.unitPrice - u.discount);
        return u;
      }),
    }));
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.items.length === 0) { window.alert('Pilih minimal 1 penerimaan barang'); return; }
    if (form.items.some(it => it.unitPrice <= 0)) {
      if (!window.confirm('Ada barang dengan harga 0. Lanjutkan?')) return;
    }
    const supplier = data.suppliers.find(s => s.id === form.supplierId);
    if (!supplier) return;

    const branchId = (currentBranchId === 'ALL' ? currentUser?.branchId : currentBranchId) || 'BR-001';

    const payload: PurchaseInvoice = {
      id: editing?.id || Date.now().toString(),
      invoiceNumber: editing?.invoiceNumber || generatePurchaseInvoiceNumber(branchId),
      date: form.date, dueDate: form.dueDate,
      supplierId: form.supplierId, supplierName: supplier.name,
      supplierInvoiceNumber: form.supplierInvoiceNumber,
      receiptIds: form.receiptIds, items: form.items,
      subtotal, discount: form.discount, tax: form.tax, total,
      payments: editing?.payments || [],
      paidAmount: editing?.paidAmount || 0,
      status: editing?.status || 'Belum Lunas',
      notes: form.notes, branchId,
      createdAt: editing?.createdAt || localDateKey(),
    };

    if (editing) updatePurchaseInvoice(editing.id, payload);
    else addPurchaseInvoice(payload);
    setShowModal(false);
  };

  const handleDelete = (inv: PurchaseInvoice) => {
    if (inv.paidAmount > 0) {
      window.alert('Faktur sudah ada pembayaran. Hapus pembayaran terlebih dahulu.');
      return;
    }
    if (window.confirm(`Hapus faktur ${inv.invoiceNumber}? Status penerimaan terkait akan dikembalikan.`)) {
      deletePurchaseInvoice(inv.id);
    }
  };

  const openPayment = (inv: PurchaseInvoice) => {
    const remaining = inv.total - inv.paidAmount;
    setPayingInvoice(inv);
    setPaymentForm({
      date: localDateKey(),
      amount: remaining,
      paymentMethod: 'Transfer Bank',
      bankAccount: '',
      notes: '',
    });
    setShowPaymentModal(true);
  };

  const savePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingInvoice) return;
    if (paymentForm.amount <= 0) { window.alert('Jumlah pembayaran harus > 0'); return; }
    if (!paymentForm.bankAccount) { window.alert('Pilih akun kas/bank pembayaran.'); return; }
    const remaining = payingInvoice.total - payingInvoice.paidAmount;
    if (paymentForm.amount > remaining) {
      if (!window.confirm(`Pembayaran melebihi sisa tagihan (Rp ${remaining.toLocaleString('id-ID')}). Lanjutkan?`)) return;
    }
    const payment: PurchasePayment = {
      id: Date.now().toString(),
      paymentNumber: `PAY-${Date.now().toString().slice(-6)}`,
      date: paymentForm.date,
      amount: paymentForm.amount,
      paymentMethod: paymentForm.paymentMethod,
      bankAccount: paymentForm.bankAccount,
      notes: paymentForm.notes,
    };
    try {
      await addPurchasePayment(payingInvoice.id, payment);
      setShowPaymentModal(false);
      setViewing(null);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Pembayaran supplier gagal disimpan');
    }
  };

  const removePayment = (invId: string, paymentId: string) => {
    if (window.confirm('Hapus pembayaran ini?')) {
      deletePurchasePayment(invId, paymentId);
      setTimeout(() => {
        setViewing(prev => prev ? data.purchaseInvoices.find(p => p.id === prev.id) || null : prev);
      }, 100);
    }
  };

  const statusColors: Record<string, string> = {
    'Belum Lunas': 'bg-red-100 text-red-800',
    'Sebagian': 'bg-yellow-100 text-yellow-800',
    'Lunas': 'bg-green-100 text-green-800',
    'Batal': 'bg-gray-100 text-gray-800',
  };

  const reportInvoices = periodInvoices.filter(p => p.status !== 'Batal');
  const totalPurchases = reportInvoices.reduce((s, p) => s + p.total, 0);
  const totalUnpaid = reportInvoices.reduce((s, p) => s + Math.max(0, p.total - p.paidAmount), 0);
  const totalPaid = reportInvoices.reduce((s, p) => s + p.paidAmount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Faktur Pembelian</h2>
          <p className="text-gray-500 mt-1">Kelola faktur pembelian & pembayaran hutang ke supplier</p>
        </div>
        {hasPermission('purchase:create') && (
          <button
            onClick={() => openModal()}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-lg shadow-blue-600/20"
          >
            <Plus className="w-5 h-5" />
            Buat Faktur Pembelian
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Faktur</p>
          <p className="text-2xl font-bold text-gray-900">{reportInvoices.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Pembelian</p>
          <p className="text-2xl font-bold text-blue-600">Rp {totalPurchases.toLocaleString('id-ID')}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Terbayar</p>
          <p className="text-2xl font-bold text-green-600">Rp {totalPaid.toLocaleString('id-ID')}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Hutang Belum Lunas</p>
          <p className="text-2xl font-bold text-red-600">Rp {totalUnpaid.toLocaleString('id-ID')}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Cari nomor faktur, supplier, no. inv supplier..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={periodFilter}
                onChange={(e) => setPeriodFilter(e.target.value as typeof periodFilter)}
                className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white text-sm"
                aria-label="Periode laporan pembelian"
              >
                <option value="this_month">Bulan Ini</option>
                <option value="last_month">Bulan Lalu</option>
                <option value="7_days">7 Hari Terakhir</option>
                <option value="30_days">30 Hari Terakhir</option>
                <option value="custom">Pilih Tanggal</option>
                <option value="all">Semua Tanggal</option>
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white text-sm"
              >
                <option value="">Semua Status</option>
                <option value="Belum Lunas">Belum Lunas</option>
                <option value="Sebagian">Sebagian Lunas</option>
                <option value="Lunas">Lunas</option>
                <option value="Batal">Batal</option>
              </select>
              <ActiveFilterResetButton active={purchaseFiltersActive} onReset={resetPurchaseFilters} className="h-10 w-10" />
            </div>
            {periodFilter === 'custom' && (
              <div className="flex items-center gap-2">
                <IndonesianDateInput value={dateFrom} onChange={setDateFrom} ariaLabel="Tanggal awal" className="h-10 w-36 text-sm"/>
                <span className="text-sm text-gray-400">s.d.</span>
                <IndonesianDateInput value={dateTo} min={dateFrom||undefined} onChange={setDateTo} ariaLabel="Tanggal akhir" className="h-10 w-36 text-sm"/>
              </div>
            )}
          </div>
          <div className="flex gap-2">
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
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-blue-800 to-blue-900 text-white">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Tanggal</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">No. Faktur</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Supplier</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">No. Inv Supplier</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">No. Penerimaan</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Jatuh Tempo</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider">Total</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider">Dibayar</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider">Sisa</th>
                {currentBranchId === 'ALL' && <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Cabang</th>}
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">Status</th>
                <th className="sticky right-0 bg-blue-900 px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.length === 0 ? (
                <tr><td colSpan={12} className="px-6 py-12 text-center text-gray-500">
                  <FileText className="mx-auto mb-3 h-12 w-12 text-gray-300" />
                  <p className="text-sm font-medium">Belum ada faktur pembelian</p>
                  <p className="text-xs">Klik "Buat Faktur dari Penerimaan" untuk membuat faktur dari penerimaan yang sudah diterima</p>
                </td></tr>
              ) : filtered.map(p => {
                const remaining = p.total - p.paidAmount;
                const isOverdue = remaining > 0 && new Date(p.dueDate) < new Date();
                const recvNumbers = p.receiptIds.map(rid => data.goodsReceipts.find(r => r.id === rid)?.receiptNumber || rid).join(', ');
                return (
                  <tr key={p.id} className="hover:bg-blue-50/50 transition-colors group">
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{p.date}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{p.invoiceNumber}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{p.supplierName}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 font-mono">{p.supplierInvoiceNumber || '-'}</td>
                    <td className="px-4 py-3 text-xs text-blue-600 font-mono">{recvNumbers}</td>
                    <td className={`px-4 py-3 text-xs whitespace-nowrap ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                      {p.dueDate} {isOverdue && '⚠'}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right whitespace-nowrap">Rp {p.total.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3 text-sm text-green-700 text-right whitespace-nowrap">Rp {p.paidAmount.toLocaleString('id-ID')}</td>
                    <td className={`px-4 py-3 text-sm font-medium text-right whitespace-nowrap ${remaining > 0 ? 'text-red-700' : 'text-gray-400'}`}>
                      Rp {remaining.toLocaleString('id-ID')}
                    </td>
                    {currentBranchId === 'ALL' && (
                      <td className="px-4 py-3 text-xs">
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-700">
                          {data.branches.find(b => b.id === p.branchId)?.name.replace('CABANG ', '') || '-'}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[p.status]}`}>{p.status}</span>
                    </td>
                    <td className="sticky right-0 bg-white group-hover:bg-blue-50 px-4 py-3 shadow-[-4px_0_10px_rgba(0,0,0,0.05)]">
                      <div className="flex items-center justify-center gap-1">
                        {/* View - selalu tampil */}
                        <button
                          onClick={() => setViewing(p)}
                          className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 transition-colors"
                          title="Lihat Detail"
                        >
                          <Eye className="h-4 w-4" />
                        </button>

                        {/* Bayar - hanya jika masih ada sisa hutang */}
                        {remaining > 0 && hasPermission('purchase:pay') && (
                          <button
                            onClick={() => openPayment(p)}
                            className="rounded-lg bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700 inline-flex items-center gap-1"
                            title="Catat Pembayaran"
                          >
                            <CreditCard className="h-3 w-3" /> Bayar
                          </button>
                        )}

                        {/* Edit - selalu tampil */}
                        {hasPermission('purchase:edit') && (
                          <button
                            onClick={() => {
                              if (p.paidAmount > 0) {
                                window.alert(`Faktur ${p.invoiceNumber} sudah ada pembayaran. Hapus pembayaran terlebih dahulu sebelum edit.`);
                                return;
                              }
                              openModal(p);
                            }}
                            className={`rounded-lg p-1.5 transition-colors ${
                              p.paidAmount > 0
                                ? 'text-gray-300 cursor-not-allowed'
                                : 'text-blue-600 hover:bg-blue-100'
                            }`}
                            title={p.paidAmount > 0 ? 'Tidak bisa edit (sudah ada pembayaran)' : 'Edit Faktur'}
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                        )}

                        {/* Delete - selalu tampil */}
                        {hasPermission('purchase:delete') && (
                          <button
                            onClick={() => {
                              if (p.paidAmount > 0) {
                                window.alert(`Faktur ${p.invoiceNumber} sudah ada pembayaran. Hapus pembayaran terlebih dahulu sebelum menghapus faktur.`);
                                return;
                              }
                              handleDelete(p);
                            }}
                            className={`rounded-lg p-1.5 transition-colors ${
                              p.paidAmount > 0
                                ? 'text-gray-300 cursor-not-allowed'
                                : 'text-red-600 hover:bg-red-100'
                            }`}
                            title={p.paidAmount > 0 ? 'Tidak bisa hapus (sudah ada pembayaran)' : 'Hapus Faktur'}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-500 flex items-center justify-between">
          <span>Menampilkan {filtered.length} dari {periodInvoices.length} faktur pembelian pada periode terpilih</span>
          <span>Total Nilai: Rp {filtered.reduce((s, p) => s + p.total, 0).toLocaleString('id-ID')}</span>
        </div>
      </div>

      {/* ===== INVOICE MODAL ===== */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[95vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 rounded-t-xl">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{editing ? 'Edit Faktur Pembelian' : 'Buat Faktur Pembelian Baru'}</h3>
                <p className="text-sm text-gray-500">Pilih penerimaan barang dari supplier untuk difakturkan</p>
              </div>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-2 hover:bg-gray-100"><X className="h-5 w-5 text-gray-500" /></button>
            </div>
            <form onSubmit={save} className="space-y-4 p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Tanggal Faktur *</label>
                  <IndonesianDateInput required value={form.date} onChange={date=>setForm({...form,date})} className="h-11 w-full" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Jatuh Tempo *</label>
                  <IndonesianDateInput required value={form.dueDate} onChange={dueDate=>setForm({...form,dueDate})} className="h-11 w-full" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Supplier *</label>
                  <select required value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value, receiptIds: [], items: [] })} disabled={!!editing} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100">
                    <option value="">Pilih supplier</option>
                    {data.suppliers.filter(s => s.isActive).map(s => <option key={s.id} value={s.id}>{s.code} - {s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">No. Invoice Supplier</label>
                  <input value={form.supplierInvoiceNumber} onChange={(e) => setForm({ ...form, supplierInvoiceNumber: e.target.value })} placeholder="Mis: INV-W/2026/0145" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {form.supplierId && (
                <div className="rounded-lg border-2 border-blue-200 bg-blue-50/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="flex items-center gap-2 font-semibold text-blue-800">
                      <Receipt className="h-5 w-5" /> Penerimaan Barang ({form.receiptIds.length} dipilih)
                    </h4>
                    <button type="button" onClick={() => setShowReceiptPicker(!showReceiptPicker)} className="text-sm font-medium text-blue-600 hover:text-blue-700">
                      {showReceiptPicker ? '× Tutup' : '+ Pilih Penerimaan'}
                    </button>
                  </div>

                  {showReceiptPicker && (
                    <div className="rounded-lg border border-blue-200 bg-white p-3 max-h-64 overflow-y-auto">
                      {availableReceipts.length === 0 ? (
                        <p className="p-3 text-center text-xs text-gray-500">Tidak ada penerimaan yang belum difakturkan untuk supplier ini.</p>
                      ) : availableReceipts.map(r => {
                        const selected = form.receiptIds.includes(r.id);
                        const remainingQty = r.items.reduce((s, i) => s + (i.qty - (i.qtyInvoiced || 0)), 0);
                        return (
                          <label key={r.id} className={`flex items-start gap-3 border-b border-gray-100 p-2 cursor-pointer hover:bg-blue-50 last:border-b-0 ${selected ? 'bg-blue-50' : ''}`}>
                            <input type="checkbox" checked={selected} onChange={() => toggleReceipt(r)} className="mt-1 h-4 w-4 rounded text-blue-600" />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-medium text-blue-600">{r.receiptNumber}</span>
                                <span className="text-xs text-gray-500">{r.date}</span>
                              </div>
                              <p className="text-xs text-gray-600">
                                {r.items.length} item, sisa qty: {remainingQty} {r.doNumber && `• DO: ${r.doNumber}`}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {form.items.length === 0 ? (
                    <div className="rounded-lg bg-white p-8 text-center text-sm text-gray-500">
                      <Receipt className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                      Pilih penerimaan barang di atas untuk dimasukkan ke faktur.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-blue-200 bg-white">
                      <table className="w-full text-sm">
                        <thead className="bg-blue-100/70">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-blue-700">No. Surat Jalan</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-blue-700">Barang</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-blue-700 w-20">Qty</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-blue-700 w-32">Harga Beli</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-blue-700 w-28">Disc</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-blue-700">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {form.items.map(line => (
                            <tr key={line.id} className="border-t border-blue-100">
                              <td className="px-3 py-2 font-mono text-xs text-gray-600 align-top">{line.receiptNumber}</td>
                              <td className="px-3 py-2">
                                <p className="font-mono text-xs text-gray-500">{line.itemCode}</p>
                                <p className="text-gray-900">{line.itemName}</p>
                              </td>
                              <td className="px-3 py-2 text-center">
                                <input type="number" min="1" value={line.qty} onChange={(e) => updateItemLine(line.id, 'qty', parseInt(e.target.value) || 1)} className="w-full rounded border border-gray-300 px-2 py-1 text-center text-sm outline-none focus:border-blue-500" />
                                <p className="text-[10px] text-gray-400 mt-0.5">{line.unit}</p>
                              </td>
                              <td className="px-3 py-2">
                                <input type="number" min="0" value={line.unitPrice} onChange={(e) => updateItemLine(line.id, 'unitPrice', parseInt(e.target.value) || 0)} className="w-full rounded border border-gray-300 px-2 py-1 text-right text-sm outline-none focus:border-blue-500" />
                              </td>
                              <td className="px-3 py-2">
                                <input type="number" min="0" value={line.discount} onChange={(e) => updateItemLine(line.id, 'discount', parseInt(e.target.value) || 0)} className="w-full rounded border border-gray-300 px-2 py-1 text-right text-sm outline-none focus:border-blue-500" />
                              </td>
                              <td className="px-3 py-2 text-right font-medium whitespace-nowrap">Rp {line.subtotal.toLocaleString('id-ID')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {form.items.length > 0 && (
                <div className="rounded-lg bg-gray-50 p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="font-medium">Rp {subtotal.toLocaleString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Diskon Faktur</span>
                    <input type="number" min="0" value={form.discount} onChange={(e) => setForm({ ...form, discount: parseInt(e.target.value) || 0 })} className="w-32 rounded border border-gray-300 px-2 py-1 text-right text-sm" />
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Pajak / PPN</span>
                    <input type="number" min="0" value={form.tax} onChange={(e) => setForm({ ...form, tax: parseInt(e.target.value) || 0 })} className="w-32 rounded border border-gray-300 px-2 py-1 text-right text-sm" />
                  </div>
                  <div className="flex justify-between border-t pt-2 text-lg font-bold">
                    <span>TOTAL</span>
                    <span className="text-blue-700">Rp {total.toLocaleString('id-ID')}</span>
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Catatan</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full resize-none rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
              </div>

              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium text-gray-700 hover:bg-gray-50">Batal</button>
                <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700"><Save className="h-4 w-4" /> Simpan Faktur</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== PAYMENT MODAL ===== */}
      {showPaymentModal && payingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-4 rounded-t-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Wallet className="h-6 w-6" />
                <div>
                  <h3 className="text-lg font-bold">Pembayaran Hutang</h3>
                  <p className="text-sm text-green-100">{payingInvoice.invoiceNumber}</p>
                </div>
              </div>
              <button onClick={() => setShowPaymentModal(false)} className="rounded-lg p-2 hover:bg-white/20"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={savePayment} className="p-6 space-y-4">
              <div className="rounded-lg bg-gray-50 p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Supplier</span><span className="font-medium">{payingInvoice.supplierName}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Total Tagihan</span><span className="font-medium">Rp {payingInvoice.total.toLocaleString('id-ID')}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Sudah Dibayar</span><span className="font-medium text-green-700">Rp {payingInvoice.paidAmount.toLocaleString('id-ID')}</span></div>
                <div className="flex justify-between border-t pt-1"><span className="text-gray-700 font-medium">Sisa Tagihan</span><span className="font-bold text-red-700">Rp {(payingInvoice.total - payingInvoice.paidAmount).toLocaleString('id-ID')}</span></div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Tanggal Bayar *</label>
                <IndonesianDateInput required value={paymentForm.date} onChange={date=>setPaymentForm({...paymentForm,date})} className="h-11 w-full" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Jumlah Bayar *</label>
                <input type="number" required min="1" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: parseInt(e.target.value) || 0 })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500 text-lg font-bold" />
                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={() => setPaymentForm({ ...paymentForm, amount: payingInvoice.total - payingInvoice.paidAmount })} className="flex-1 rounded border border-gray-300 py-1 text-xs hover:bg-gray-50">Bayar Lunas</button>
                  <button type="button" onClick={() => setPaymentForm({ ...paymentForm, amount: Math.round((payingInvoice.total - payingInvoice.paidAmount) / 2) })} className="flex-1 rounded border border-gray-300 py-1 text-xs hover:bg-gray-50">Setengah</button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Metode Bayar *</label>
                <select value={paymentForm.paymentMethod} onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value as PurchasePayment['paymentMethod'], bankAccount: '' })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500">
                  <option value="Kas">Kas</option>
                  <option value="Transfer Bank">Transfer Bank</option>
                  <option value="Cek">Cek</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Akun Pembayaran *</label>
                <select required value={paymentForm.bankAccount} onChange={(e) => setPaymentForm({ ...paymentForm, bankAccount: e.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-green-500">
                  <option value="">Pilih akun kas/bank</option>
                  {cashAccounts
                    .filter(account => account.isActive !== false)
                    .filter(account => !account.branchId || account.branchId === payingInvoice.branchId)
                    .filter(account => paymentForm.paymentMethod === 'Kas' ? account.accountType === 'cash' : account.accountType === 'bank')
                    .map(account => <option key={account.id} value={account.id}>{account.code ? `${account.code} - ` : ''}{account.name}</option>)}
                </select>
                {cashAccounts.filter(account => account.isActive !== false && (!account.branchId || account.branchId === payingInvoice.branchId)).length === 0 && (
                  <p className="mt-1 text-xs text-red-600">Belum ada akun kas/bank aktif untuk cabang faktur.</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Catatan</label>
                <textarea value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} rows={2} className="w-full resize-none rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-green-500" />
              </div>
              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
                <button type="button" onClick={() => setShowPaymentModal(false)} className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium text-gray-700 hover:bg-gray-50">Batal</button>
                <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 font-medium text-white hover:bg-green-700"><CheckCircle2 className="h-4 w-4" /> Catat Pembayaran</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== VIEW INVOICE MODAL ===== */}
      {viewing && (() => {
        const current = data.purchaseInvoices.find(p => p.id === viewing.id) || viewing;
        const remaining = current.total - current.paidAmount;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-2xl">
              <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white px-6 py-4 rounded-t-xl flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold">Detail Faktur Pembelian</h3>
                  <p className="text-blue-100">{current.invoiceNumber}</p>
                </div>
                <button onClick={() => setViewing(null)} className="rounded-lg p-2 hover:bg-white/20"><X className="h-5 w-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><p className="text-gray-500">Tanggal</p><p className="font-medium">{current.date}</p></div>
                  <div><p className="text-gray-500">Jatuh Tempo</p><p className="font-medium">{current.dueDate}</p></div>
                  <div><p className="text-gray-500">Supplier</p><p className="font-medium">{current.supplierName}</p></div>
                  <div><p className="text-gray-500">No. Inv Supplier</p><p className="font-medium font-mono">{current.supplierInvoiceNumber || '-'}</p></div>
                  <div><p className="text-gray-500">Status</p><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[current.status]}`}>{current.status}</span></div>
                  <div><p className="text-gray-500">No. Penerimaan</p><p className="font-medium text-xs">{current.receiptIds.map(rid => data.goodsReceipts.find(r => r.id === rid)?.receiptNumber).join(', ')}</p></div>
                </div>

                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Barang</th>
                        <th className="px-3 py-2 text-center font-medium text-gray-600">Qty</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">Harga</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">Disc</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {current.items.map(item => (
                        <tr key={item.id} className="border-t border-gray-100">
                          <td className="px-3 py-2">
                            <p className="font-mono text-xs text-gray-500">{item.itemCode}</p>
                            <p>{item.itemName}</p>
                          </td>
                          <td className="px-3 py-2 text-center">{item.qty} {item.unit}</td>
                          <td className="px-3 py-2 text-right">Rp {item.unitPrice.toLocaleString('id-ID')}</td>
                          <td className="px-3 py-2 text-right">Rp {item.discount.toLocaleString('id-ID')}</td>
                          <td className="px-3 py-2 text-right font-medium">Rp {item.subtotal.toLocaleString('id-ID')}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                      <tr><td colSpan={4} className="px-3 py-1 text-right text-sm">Subtotal</td><td className="px-3 py-1 text-right">Rp {current.subtotal.toLocaleString('id-ID')}</td></tr>
                      <tr><td colSpan={4} className="px-3 py-1 text-right text-sm">Diskon Faktur</td><td className="px-3 py-1 text-right">- Rp {current.discount.toLocaleString('id-ID')}</td></tr>
                      <tr><td colSpan={4} className="px-3 py-1 text-right text-sm">Pajak</td><td className="px-3 py-1 text-right">Rp {current.tax.toLocaleString('id-ID')}</td></tr>
                      <tr><td colSpan={4} className="px-3 py-2 text-right text-base font-bold">TOTAL</td><td className="px-3 py-2 text-right text-base font-bold text-blue-700">Rp {current.total.toLocaleString('id-ID')}</td></tr>
                      <tr><td colSpan={4} className="px-3 py-1 text-right text-sm text-green-700">Dibayar</td><td className="px-3 py-1 text-right text-green-700">Rp {current.paidAmount.toLocaleString('id-ID')}</td></tr>
                      <tr><td colSpan={4} className="px-3 py-1 text-right text-sm font-bold text-red-700">SISA</td><td className="px-3 py-1 text-right font-bold text-red-700">Rp {remaining.toLocaleString('id-ID')}</td></tr>
                    </tfoot>
                  </table>
                </div>

                <div className="rounded-lg border border-green-200 bg-green-50/50 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-green-800 flex items-center gap-2"><Wallet className="h-5 w-5" /> Riwayat Pembayaran ({current.payments.length})</h4>
                    {remaining > 0 && hasPermission('purchase:pay') && (
                      <button onClick={() => openPayment(current)} className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700">
                        <Plus className="h-3 w-3" /> Bayar
                      </button>
                    )}
                  </div>
                  {current.payments.length === 0 ? (
                    <p className="text-center text-sm text-gray-500 py-4">Belum ada pembayaran</p>
                  ) : (
                    <div className="space-y-2">
                      {current.payments.map(pay => (
                        <div key={pay.id} className="bg-white rounded-lg p-3 border border-green-100 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="bg-green-100 rounded-lg p-2"><CreditCard className="h-4 w-4 text-green-700" /></div>
                            <div>
                              <p className="font-mono text-xs text-gray-500">{pay.paymentNumber} • {pay.date}</p>
                              <p className="font-semibold text-green-700">Rp {pay.amount.toLocaleString('id-ID')}</p>
                              <p className="text-xs text-gray-600">{pay.paymentMethod}{pay.bankAccount && ` • ${pay.bankAccount}`}</p>
                              {pay.notes && <p className="text-xs text-gray-500 italic">"{pay.notes}"</p>}
                            </div>
                          </div>
                          {hasPermission('purchase:pay') && (
                            <button onClick={() => removePayment(current.id, pay.id)} className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {current.notes && (
                  <div className="rounded-lg bg-gray-50 p-3 text-sm">
                    <p className="font-medium text-gray-700 mb-1">Catatan:</p>
                    <p className="text-gray-600">{current.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
