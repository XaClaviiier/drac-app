import { useMemo, useState } from 'react';
import { PackageCheck, Plus, Search, Edit, Trash2, X, Save, CheckCircle2, AlertCircle, Package, Eye, ReceiptText, ArrowRight, CalendarDays, Filter, Printer, RefreshCw, Settings2, List } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { GoodsReceipt, GoodsReceiptItem, PurchaseInvoice, PurchaseInvoiceItem } from '../types';
import { useNavigate } from 'react-router-dom';
import { addLocalDays, localDateKey } from '../lib/date';

export default function GoodsReceiptPage() {
  const navigate = useNavigate();
  const {
    data, addGoodsReceipt, updateGoodsReceipt, deleteGoodsReceipt,
    generateReceiptNumber, receiveGoods,
    addPurchaseInvoice, generatePurchaseInvoiceNumber,
    currentBranchId, hasPermission, currentUser, addItem, refreshData,
  } = useApp();

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterInvoice, setFilterInvoice] = useState('');
  const [filterFromDate, setFilterFromDate] = useState('');

  // Receipt modal
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<GoodsReceipt | null>(null);
  const [viewing, setViewing] = useState<GoodsReceipt | null>(null);
  const [form, setForm] = useState({
    date: localDateKey(),
    supplierId: '',
    doNumber: '',
    items: [] as GoodsReceiptItem[],
    notes: '',
    status: 'Draft' as GoodsReceipt['status'],
    warehouseId: '',
  });
  const [showQuickItem, setShowQuickItem] = useState(false);
  const [quickItem, setQuickItem] = useState({ name: '', categoryId: '', vehicleBrandId: '', unit: 'PCS', barcode: '' });
  const [mergeTargets, setMergeTargets] = useState<Record<string,string>>({});

  // Item picker
  const [itemSearch, setItemSearch] = useState('');
  const [showItemPicker, setShowItemPicker] = useState(false);

  // === Invoice Preview Modal ===
  const [invoiceReceipt, setInvoiceReceipt] = useState<GoodsReceipt | null>(null);
  const [invoiceForm, setInvoiceForm] = useState({
    date: localDateKey(),
    dueDate: addLocalDays(30),
    supplierInvoiceNumber: '',
    items: [] as PurchaseInvoiceItem[],
    discount: 0,
    tax: 0,
    notes: '',
  });
  const [showSuccessMsg, setShowSuccessMsg] = useState('');

  const openInvoicePreview = (r: GoodsReceipt) => {
    if (r.sourceType === 'Transfer Gudang') { window.alert('Transfer antar gudang tidak membuat Faktur Pembelian.'); return; }
    if (!r.supplierId) { window.alert('Pasangkan supplier terlebih dahulu sebelum membuat Faktur Pembelian.'); return; }
    const newItems: PurchaseInvoiceItem[] = r.items
      .filter(it => it.qty - (it.qtyInvoiced || 0) > 0)
      .map(it => {
        const masterItem = data.items.find(m => m.id === it.itemId);
        const remainingQty = it.qty - (it.qtyInvoiced || 0);
        const unitPrice = masterItem?.purchasePrice || 0;
        return {
          id: `${Date.now()}-${it.itemId}-${Math.random().toString(36).slice(2, 5)}`,
          receiptId: r.id, receiptNumber: r.receiptNumber,
          itemId: it.itemId, itemCode: it.itemCode, itemName: it.itemName,
          qty: remainingQty, unit: it.unit,
          unitPrice,
          discount: 0,
          subtotal: remainingQty * unitPrice,
        };
      });
    setInvoiceReceipt(r);
    setInvoiceForm({
      date: localDateKey(),
      dueDate: addLocalDays(30),
      supplierInvoiceNumber: '',
      items: newItems,
      discount: 0, tax: 0, notes: '',
    });
  };

  const updateInvoiceLine = (id: string, field: 'qty' | 'unitPrice' | 'discount', value: number) => {
    setInvoiceForm(prev => ({
      ...prev,
      items: prev.items.map(it => {
        if (it.id !== id) return it;
        const u = { ...it, [field]: value };
        u.subtotal = Math.max(0, u.qty * u.unitPrice - u.discount);
        return u;
      }),
    }));
  };

  const invSubtotal = invoiceForm.items.reduce((s, i) => s + i.subtotal, 0);
  const invTotal = invSubtotal - invoiceForm.discount + invoiceForm.tax;

  const submitInvoice = async () => {
    if (!invoiceReceipt) return;
    if (invoiceForm.items.length === 0) { window.alert('Tidak ada item untuk difakturkan'); return; }
    if (invoiceForm.items.some(it => it.unitPrice <= 0)) {
      if (!window.confirm('Ada barang dengan harga 0. Lanjutkan?')) return;
    }
    const branchId = invoiceReceipt.branchId;
    const payload: PurchaseInvoice = {
      id: Date.now().toString(),
      invoiceNumber: generatePurchaseInvoiceNumber(branchId),
      date: invoiceForm.date,
      dueDate: invoiceForm.dueDate,
      supplierId: invoiceReceipt.supplierId,
      supplierName: invoiceReceipt.supplierName,
      supplierInvoiceNumber: invoiceForm.supplierInvoiceNumber,
      receiptIds: [invoiceReceipt.id],
      items: invoiceForm.items,
      subtotal: invSubtotal,
      discount: invoiceForm.discount,
      tax: invoiceForm.tax,
      total: invTotal,
      payments: [],
      paidAmount: 0,
      status: 'Belum Lunas',
      notes: invoiceForm.notes,
      branchId,
      createdAt: localDateKey(),
    };
    const created = await addPurchaseInvoice(payload);
    setShowSuccessMsg(`Faktur Pembelian ${created.invoiceNumber} berhasil dibuat!`);
    setInvoiceReceipt(null);
    setTimeout(() => setShowSuccessMsg(''), 5000);
  };

  // Helper: compute invoice status of a receipt based on qtyInvoiced
  const getInvoiceStatus = (r: GoodsReceipt): 'Belum' | 'Sebagian' | 'Lunas' | '-' => {
    if (r.status !== 'Diterima') return '-';
    const totalQty = r.items.reduce((s, i) => s + i.qty, 0);
    const totalInv = r.items.reduce((s, i) => s + (i.qtyInvoiced || 0), 0);
    if (totalInv === 0) return 'Belum';
    if (totalInv >= totalQty) return 'Lunas';
    return 'Sebagian';
  };

  const filtered = useMemo(() => {
    return data.goodsReceipts
      .filter((r) => {
        const branchMatch = currentBranchId === 'ALL' || r.branchId === currentBranchId;
        if (!branchMatch) return false;
        const q = search.toLowerCase();
        const searchMatch = !q ||
          r.receiptNumber.toLowerCase().includes(q) ||
          r.items.some(item => item.itemCode.toLowerCase().includes(q) || item.itemName.toLowerCase().includes(q));
        const statusMatch = !filterStatus || r.status === filterStatus;
        const dateMatch = !filterFromDate || r.date >= filterFromDate;
        const invStatus = getInvoiceStatus(r);
        const invMatch = !filterInvoice || invStatus === filterInvoice;
        return searchMatch && statusMatch && dateMatch && invMatch;
      })
      .sort((a, b) => {
        const dc = b.date.localeCompare(a.date);
        return dc !== 0 ? dc : b.receiptNumber.localeCompare(a.receiptNumber);
      });
  }, [data.goodsReceipts, search, filterStatus, filterFromDate, filterInvoice, currentBranchId]);

  const pickableItems = useMemo(() => {
    const q = itemSearch.toLowerCase();
    return data.items.filter((i) =>
      i.type === 'Persediaan' && i.isActive &&
      (i.code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q))
    );
  }, [data.items, itemSearch]);

  const totalQty = form.items.reduce((s, i) => s + i.qty, 0);

  const openModal = (receipt?: GoodsReceipt) => {
    if (receipt) {
      setEditing(receipt);
      setForm({
        date: receipt.date,
        supplierId: receipt.supplierId,
        doNumber: receipt.doNumber,
        items: [...receipt.items],
        notes: receipt.notes,
        status: receipt.status,
        warehouseId: receipt.warehouseId || '',
      });
    } else {
      setEditing(null);
      const branchId=(currentBranchId==='ALL'?currentUser?.branchId:currentBranchId)||'BR-001';
      const defaultWarehouse=data.warehouses.find(w=>w.branchId===branchId&&w.isActive&&w.isDefault)||data.warehouses.find(w=>w.branchId===branchId&&w.isActive);
      setForm({
        date: localDateKey(),
        supplierId: '', doNumber: '', items: [], notes: '', status: 'Draft',
        warehouseId: defaultWarehouse?.id||'',
      });
    }
    setShowModal(true);
  };

  const addItemLine = (item: typeof data.items[0]) => {
    if (form.items.some(l => l.itemId === item.id)) return;
    const newLine: GoodsReceiptItem = {
      id: Date.now().toString(),
      itemId: item.id, itemCode: item.code, itemName: item.name,
      qty: 1, unit: item.unit, qtyInvoiced: 0,
    };
    setForm(prev => ({ ...prev, items: [...prev.items, newLine] }));
    setItemSearch('');
    setShowItemPicker(false);
  };

  const updateLine = (id: string, qty: number) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.map(l => l.id === id ? { ...l, qty: Math.max(1, qty) } : l),
    }));
  };

  const removeLine = (id: string) => {
    setForm(prev => ({ ...prev, items: prev.items.filter(l => l.id !== id) }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.items.length === 0) { window.alert('Tambahkan minimal 1 barang'); return; }
    const supplier = data.suppliers.find(s => s.id === form.supplierId);
    const branchId = (currentBranchId === 'ALL' ? currentUser?.branchId : currentBranchId) || 'BR-001';
    const warehouseId = form.warehouseId || data.warehouses.find(w => w.branchId === branchId && w.isActive && w.isDefault)?.id || data.warehouses.find(w => w.branchId === branchId && w.isActive)?.id || '';
    if (!warehouseId) { window.alert('Gudang tujuan wajib dipilih.'); return; }

    if (editing) {
      updateGoodsReceipt(editing.id, {
        ...editing, ...form, warehouseId, supplierName: supplier?.name || '',
        receivedBy: form.status === 'Diterima' ? (currentUser?.name || 'System') : editing.receivedBy,
      });
    } else {
      addGoodsReceipt({
        id: Date.now().toString(),
        receiptNumber: generateReceiptNumber(branchId),
        ...form, warehouseId, supplierName: supplier?.name || '', branchId,
        receivedBy: form.status === 'Diterima' ? (currentUser?.name || 'System') : undefined,
        createdAt: localDateKey(),
      });
    }
    setShowModal(false);
  };

  const createQuickItem = async () => {
    const category=data.itemCategories.find(c=>c.id===quickItem.categoryId);
    if(!quickItem.name.trim()||!category){window.alert('Nama dan kategori barang wajib diisi.');return;}
    const branchId=(currentBranchId==='ALL'?currentUser?.branchId:currentBranchId)||'BR-001';
    const created=await addItem({id:Date.now().toString(),code:'AUTO',name:quickItem.name,categoryId:category.id,categoryName:category.name,type:'Persediaan',brand:'',vehicleBrandId:quickItem.vehicleBrandId||undefined,unit:quickItem.unit||'PCS',stock:0,sellableStock:0,purchasePrice:0,sellingPrice:0,isActive:true,isQuickService:false,description:'Dibuat saat penerimaan barang; menunggu verifikasi admin',barcode:quickItem.barcode,branchId,autoCode:true,provisional:true});
    addItemLine(created);setShowQuickItem(false);setQuickItem({name:'',categoryId:'',vehicleBrandId:'',unit:'PCS',barcode:''});
  };

  const verifyItem = async (itemId:string, targetItemId?:string) => {
    const { api } = await import('../lib/apiClient');
    await api.update('items',itemId,targetItemId?{action:'merge',targetItemId}:{action:'verify'});
    await refreshData();
  };

  const handleDelete = (r: GoodsReceipt) => {
    if (r.status === 'Difakturkan' || r.status === 'Sebagian') {
      window.alert(`Tidak bisa dihapus. Penerimaan ${r.receiptNumber} sudah difakturkan.`);
      return;
    }
    const msg = r.status === 'Diterima'
      ? `Hapus penerimaan ${r.receiptNumber}? Stok akan dikurangi kembali.`
      : `Hapus penerimaan ${r.receiptNumber}?`;
    if (window.confirm(msg)) deleteGoodsReceipt(r.id);
  };

  const handleReceive = (r: GoodsReceipt) => {
    if (window.confirm(`Terima barang ${r.receiptNumber}? Stok akan otomatis bertambah.`)) receiveGoods(r.id);
  };

  const statusColors: Record<string, string> = {
    Draft: 'bg-gray-100 text-gray-800',
    Diterima: 'bg-green-100 text-green-800',
    Difakturkan: 'bg-blue-100 text-blue-800',
    Sebagian: 'bg-yellow-100 text-yellow-800',
    Batal: 'bg-red-100 text-red-800',
  };

  const branchReceipts = data.goodsReceipts.filter(r => currentBranchId === 'ALL' || r.branchId === currentBranchId);
  const draftCount = branchReceipts.filter(r => r.status === 'Draft').length;
  const pendingItems=data.items.filter(i=>i.verificationStatus==='Pending');
  const canVerify=Boolean(currentUser?.isOwner)||String(currentUser?.roleName||'').toLowerCase().includes('admin');
  const transactionBranchId=(currentBranchId==='ALL'?currentUser?.branchId:currentBranchId)||'BR-001';
  const activeWarehouses=data.warehouses.filter(w=>w.branchId===transactionBranchId&&w.isActive&&!w.isSystem);

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-none border-0 bg-[#f2f2f2] shadow-none [&_thead]:!bg-[#60778e]">
        <div className="mt-0.5 flex items-end border-b border-[#b8b8b8] bg-[#fafafa] pl-1.5"><div className="flex h-11 w-14 items-center justify-center rounded-t-lg border border-b-0 border-[#b8b8b8] bg-[#f2f2f2] text-blue-700" title="Daftar Penerimaan"><List className="h-5 w-5"/></div></div>
        <div className="space-y-3 bg-[#ededed] p-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500"/><input type="date" value={filterFromDate} onChange={e=>setFilterFromDate(e.target.value)} className="rounded border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm" title="Tampilkan mulai tanggal"/></label>
            <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Status: Semua</option><option value="Draft">Draft</option><option value="Diterima">Diterima</option><option value="Batal">Batal</option></select>
            <button onClick={()=>{setFilterFromDate('');setFilterStatus('');setFilterInvoice('')}} className="rounded border border-blue-600 bg-blue-50 px-3 py-2 text-blue-700" title="Bersihkan filter"><Filter className="h-5 w-5"/></button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">{hasPermission('receipt:create')&&<button onClick={()=>navigate('/receipts/new')} className="rounded bg-blue-800 px-5 py-2 text-white" title="Penerimaan Baru"><Plus className="h-6 w-6"/></button>}<button onClick={()=>void refreshData()} className="rounded border border-blue-600 bg-white px-3 py-2 text-blue-700" title="Refresh"><RefreshCw className="h-5 w-5"/></button></div>
            <div className="flex items-center gap-2"><button onClick={()=>window.print()} className="rounded border border-blue-600 bg-white p-2.5 text-blue-700" title="Cetak"><Printer className="h-5 w-5"/></button>{hasPermission('purchase:view')&&<button onClick={()=>navigate('/purchase-invoices')} className="rounded border border-blue-600 bg-white p-2.5 text-blue-700" title="Faktur Pembelian"><Settings2 className="h-5 w-5"/></button>}<div className="relative"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Ketik dan [Enter]" className="w-64 rounded border border-slate-300 bg-white px-3 py-2.5 pr-10 text-slate-900 placeholder:text-slate-400 focus:bg-white"/><Search className="absolute right-3 top-3 h-5 w-5"/></div><span className="min-w-16 rounded border border-slate-300 bg-white px-4 py-2.5 text-center">{filtered.length}</span></div>
          </div>
        </div>
        {showSuccessMsg&&<div className="border-y border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700">{showSuccessMsg}</div>}
        <div className="mx-3 mt-2 min-h-[440px] overflow-x-auto rounded-t-lg border border-[#d8d8d8] bg-white"><table className="w-full min-w-[980px] text-[13px] font-normal text-[#111827]"><thead className="bg-slate-600 text-[12px] font-semibold text-white"><tr>{['Nomor #','Tanggal','Keterangan','Diterima Oleh','Jumlah Barang','Gudang','Status'].map(label=><th key={label} className="border-r border-[#d8d8d8]/50 p-3 text-left last:border-r-0">{label}</th>)}</tr></thead><tbody>{filtered.map(r=><tr key={r.id} tabIndex={0} onClick={()=>navigate(`/receipts/view/${encodeURIComponent(r.id)}`)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();navigate(`/receipts/view/${encodeURIComponent(r.id)}`)}}} className="cursor-pointer border-b border-[#d8d8d8] odd:bg-white even:bg-[#f3f3f3] hover:!bg-[#eaf3ff] focus:!bg-[#d6e8ff] focus:outline-none focus:shadow-[inset_4px_0_0_#2563eb]"><td className="border-r border-[#d8d8d8] p-3 font-normal text-blue-700 underline-offset-2 hover:underline">{r.sourceType==='Transfer Gudang'?(r.transferNumber||r.receiptNumber):r.receiptNumber}</td><td className="whitespace-nowrap border-r border-[#d8d8d8] p-3">{new Date(`${r.date}T00:00:00`).toLocaleDateString('id-ID')}</td><td className="max-w-[280px] truncate border-r border-[#d8d8d8] p-3" title={r.notes||''}>{r.notes||'-'}</td><td className="border-r border-[#d8d8d8] p-3">{r.receivedBy||'-'}</td><td className="whitespace-nowrap border-r border-[#d8d8d8] p-3">{r.items.length} item ({r.items.reduce((sum,item)=>sum+item.qty,0)} pcs)</td><td className="border-r border-[#d8d8d8] p-3">{data.warehouses.find(w=>w.id===r.warehouseId)?.name||'-'}</td><td className="p-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${r.status==='Diterima'?'bg-green-100 text-green-700':r.status==='Batal'?'bg-red-100 text-red-700':'bg-amber-100 text-amber-700'}`}>{r.status}</span></td></tr>)}</tbody></table>{!filtered.length&&<div className="py-20 text-center text-slate-400"><PackageCheck className="mx-auto mb-3 h-12 w-12"/>Belum ada penerimaan barang.</div>}</div>
      </section>
      <div className="hidden">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Penerimaan Barang</h2>
          <p className="mt-1 text-gray-500">
            Catat barang yang diterima dari supplier (qty saja). Stok otomatis bertambah saat status "Diterima".
          </p>
        </div>
        <div className="flex gap-2">
          {hasPermission('purchase:view') && (
            <button
              onClick={() => navigate('/purchase-invoices')}
              className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 font-medium text-blue-700 hover:bg-blue-100"
              title="Buka Faktur Pembelian"
            >
              <ReceiptText className="h-4 w-4" /> Faktur Pembelian <ArrowRight className="h-4 w-4" />
            </button>
          )}
          {hasPermission('receipt:create') && (
            <button onClick={() => navigate('/receipts/new')} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700">
              <Plus className="h-5 w-5" /> Terima Barang
            </button>
          )}
        </div>
      </div>

      {/* Success Message */}
      {showSuccessMsg && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-sm font-medium text-green-800 flex-1">{showSuccessMsg}</p>
          <button
            onClick={() => navigate('/purchase-invoices')}
            className="text-xs font-medium text-green-700 hover:text-green-900 underline"
          >
            Lihat di Faktur Pembelian →
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Total Penerimaan</p>
          <p className="text-2xl font-bold text-gray-900">{branchReceipts.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Draft</p>
          <p className="text-2xl font-bold text-yellow-600">{draftCount}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Diterima (Stok Masuk)</p>
          <p className="text-2xl font-bold text-green-600">{branchReceipts.filter(r => r.status === 'Diterima').length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Batal</p>
          <p className="text-2xl font-bold text-red-600">{branchReceipts.filter(r => r.status === 'Batal').length}</p>
        </div>
      </div>

      {canVerify && pendingItems.length>0 && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
        <h3 className="font-semibold text-amber-900">Verifikasi Barang Baru ({pendingItems.length})</h3>
        <p className="mb-3 text-sm text-amber-700">Sahkan jika datanya benar, atau konversi ke master lama bila ternyata duplikat.</p>
        <div className="space-y-2">{pendingItems.map(item=><div key={item.id} className="grid gap-2 rounded-lg bg-white p-3 md:grid-cols-[1fr_1fr_auto_auto] md:items-center">
          <div><b>{item.code}</b> — {item.name}<div className="text-xs text-gray-500">{item.categoryName} · stok {item.stock} {item.unit}</div></div>
          <select value={mergeTargets[item.id]||''} onChange={e=>setMergeTargets({...mergeTargets,[item.id]:e.target.value})} className="rounded-lg border px-3 py-2 text-sm"><option value="">Pilih master jika duplikat...</option>{data.items.filter(x=>x.id!==item.id&&x.isActive&&x.verificationStatus!=='Pending'&&x.type==='Persediaan').map(x=><option key={x.id} value={x.id}>{x.code} — {x.name}</option>)}</select>
          <button onClick={()=>verifyItem(item.id)} className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white">Verifikasi</button>
          <button disabled={!mergeTargets[item.id]} onClick={()=>verifyItem(item.id,mergeTargets[item.id])} className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40">Gabungkan</button>
        </div>)}</div>
      </div>}

      {/* Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nomor terima, supplier, no. surat jalan..." className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500">
          <option value="">Semua Status</option>
          <option value="Draft">Draft</option>
          <option value="Diterima">Diterima</option>
          <option value="Batal">Batal</option>
        </select>
        <select value={filterInvoice} onChange={(e) => setFilterInvoice(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500">
          <option value="">Semua Faktur</option>
          <option value="Belum">Belum Difakturkan</option>
          <option value="Sebagian">Sebagian Difakturkan</option>
          <option value="Lunas">Sudah Difakturkan</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-blue-800 to-blue-900 text-white">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Tanggal</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">No. Surat Jalan</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Supplier</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">No. Surat Jalan</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">Item</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">Total Qty</th>
                {currentBranchId === 'ALL' && <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Cabang</th>}
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">Status Barang</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">Status Faktur</th>
                <th className="sticky right-0 bg-blue-900 px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.length === 0 ? (
                <tr><td colSpan={10} className="px-6 py-12 text-center text-gray-500"><PackageCheck className="mx-auto mb-3 h-12 w-12 text-gray-300" /><p className="text-sm">Belum ada penerimaan barang</p></td></tr>
              ) : filtered.map((r) => {
                const totalQ = r.items.reduce((s, i) => s + i.qty, 0);
                const totalInv = r.items.reduce((s, i) => s + (i.qtyInvoiced || 0), 0);
                const invStatus = getInvoiceStatus(r);
                const invColors: Record<string, string> = {
                  'Belum': 'bg-red-100 text-red-700',
                  'Sebagian': 'bg-yellow-100 text-yellow-700',
                  'Lunas': 'bg-green-100 text-green-700',
                  '-': 'bg-gray-100 text-gray-500',
                };
                const invLabel: Record<string, string> = {
                  'Belum': 'Belum',
                  'Sebagian': 'Sebagian',
                  'Lunas': 'Sudah',
                  '-': '-',
                };
                return (
                  <tr key={r.id} className="hover:bg-blue-50/50 transition-colors group">
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{r.date}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{r.receiptNumber}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{r.sourceType==='Transfer Gudang'?<><span className="font-medium text-blue-700">Transfer Gudang</span><span className="block text-xs font-mono text-gray-500">{r.transferNumber||'Manual'}</span></>:r.supplierName||'Supplier menyusul'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 font-mono">{r.doNumber || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-center">{r.items.length}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 text-center">{totalQ}</td>
                    {currentBranchId === 'ALL' && (
                      <td className="px-4 py-3 text-xs">
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-700">
                          {data.branches.find(b => b.id === r.branchId)?.name.replace('CABANG ', '') || '-'}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[r.status]}`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${invColors[invStatus]}`} title={`${totalInv} dari ${totalQ} qty sudah difakturkan`}>
                        {invLabel[invStatus]}
                        {invStatus !== '-' && invStatus !== 'Lunas' && (
                          <span className="text-[10px] opacity-70">({totalInv}/{totalQ})</span>
                        )}
                      </span>
                    </td>
                    <td className="sticky right-0 bg-white group-hover:bg-blue-50 px-4 py-3 shadow-[-4px_0_10px_rgba(0,0,0,0.05)]">
                      <div className="flex items-center justify-center gap-1">
                        {/* View - selalu tampil */}
                        <button
                          onClick={() => setViewing(r)}
                          className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 transition-colors"
                          title="Lihat Detail"
                        >
                          <Eye className="h-4 w-4" />
                        </button>

                        {/* Tombol Terima (hanya jika Draft) */}
                        {r.status === 'Draft' && hasPermission('receipt:edit') && (
                          <button
                            onClick={() => handleReceive(r)}
                            className="rounded-lg bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700 inline-flex items-center gap-1"
                            title="Terima Barang (Stok Masuk)"
                          >
                            <CheckCircle2 className="h-3 w-3" /> Terima
                          </button>
                        )}

                        {/* Tombol Faktur (jika sudah Diterima dan belum fully invoiced) */}
                        {r.status === 'Diterima' && r.sourceType !== 'Transfer Gudang' && invStatus !== 'Lunas' && hasPermission('purchase:create') && (
                          <button
                            onClick={() => openInvoicePreview(r)}
                            className="rounded-lg bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 inline-flex items-center gap-1"
                            title="Buat Faktur Pembelian"
                          >
                            <ReceiptText className="h-3 w-3" /> Faktur
                          </button>
                        )}

                        {/* Edit - selalu tampil */}
                        {hasPermission('receipt:edit') && (
                          <button
                            onClick={() => {
                              if (invStatus === 'Lunas' || invStatus === 'Sebagian') {
                                window.alert(`Penerimaan ${r.receiptNumber} sudah difakturkan (${invStatus}). Hapus faktur pembelian terkait terlebih dahulu sebelum edit.`);
                                return;
                              }
                              openModal(r);
                            }}
                            className={`rounded-lg p-1.5 transition-colors ${
                              (invStatus === 'Lunas' || invStatus === 'Sebagian')
                                ? 'text-gray-300 cursor-not-allowed'
                                : 'text-blue-600 hover:bg-blue-100'
                            }`}
                            title={(invStatus === 'Lunas' || invStatus === 'Sebagian') ? 'Tidak bisa edit (sudah difakturkan)' : 'Edit'}
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                        )}

                        {/* Delete - selalu tampil */}
                        {hasPermission('receipt:delete') && (
                          <button
                            onClick={() => {
                              if (invStatus === 'Lunas' || invStatus === 'Sebagian') {
                                window.alert(`Penerimaan ${r.receiptNumber} sudah difakturkan (${invStatus}). Hapus faktur pembelian terkait terlebih dahulu sebelum menghapus penerimaan.`);
                                return;
                              }
                              handleDelete(r);
                            }}
                            className={`rounded-lg p-1.5 transition-colors ${
                              (invStatus === 'Lunas' || invStatus === 'Sebagian')
                                ? 'text-gray-300 cursor-not-allowed'
                                : 'text-red-600 hover:bg-red-100'
                            }`}
                            title={(invStatus === 'Lunas' || invStatus === 'Sebagian') ? 'Tidak bisa hapus (sudah difakturkan)' : 'Hapus'}
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
      </div>

      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 rounded-t-xl">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{editing ? 'Edit Penerimaan Barang' : 'Terima Barang Baru'}</h3>
                <p className="text-sm text-gray-500">Catat barang yang diterima (qty saja). Harga & pembayaran nanti via Faktur Pembelian.</p>
              </div>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-2 hover:bg-gray-100"><X className="h-5 w-5 text-gray-500" /></button>
            </div>
            <form onSubmit={save} className="space-y-4 p-6">
              {/* Auto-generated No. Terima Banner */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
                <span className="text-sm text-blue-700 font-medium">No. Terima (Auto Generate)</span>
                <span className="text-base font-bold text-blue-700 font-mono">
                  {editing
                    ? editing.receiptNumber
                    : generateReceiptNumber(
                        (currentBranchId === 'ALL' ? currentUser?.branchId : currentBranchId) || 'BR-001'
                      )}
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Tanggal *</label>
                  <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as GoodsReceipt['status'] })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
                    <option value="Draft">Draft (Pending)</option>
                    <option value="Diterima">Diterima → Stok Bertambah</option>
                    <option value="Batal">Batal</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Supplier (boleh menyusul)</label>
                  <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
                    <option value="">Belum ditentukan / menyusul</option>
                    {data.suppliers.filter(s => s.isActive).map(s => <option key={s.id} value={s.id}>{s.code} - {s.name}</option>)}
                  </select>
                </div>
                <div><label className="mb-1 block text-sm font-medium text-gray-700">Gudang Tujuan *</label><select required value={form.warehouseId} onChange={e=>setForm({...form,warehouseId:e.target.value})} className="w-full rounded-lg border border-gray-300 px-4 py-2.5"><option value="">Pilih gudang</option>{activeWarehouses.map(w=><option key={w.id} value={w.id}>{w.code} - {w.name}{w.isDefault?' (Utama)':''}</option>)}</select></div>
                <div><label className="mb-1 block text-sm font-medium text-gray-700">Diterima Oleh</label><input readOnly value={currentUser?.name||'-'} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5" /></div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">No. Surat Jalan (DO)</label>
                  <input value={form.doNumber} onChange={(e) => setForm({ ...form, doNumber: e.target.value })} placeholder="Mis: DO-001/2026" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div className="rounded-lg border-2 border-blue-200 bg-blue-50/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="flex items-center gap-2 font-semibold text-blue-800">
                    <Package className="h-5 w-5" /> Barang Diterima ({form.items.length})
                  </h4>
                  <button type="button" onClick={() => setShowItemPicker(!showItemPicker)} className="text-sm font-medium text-blue-600 hover:text-blue-700">
                    {showItemPicker ? '× Tutup' : '+ Tambah Barang'}
                  </button>
                </div>

                {showItemPicker && (
                  <div className="rounded-lg border border-blue-200 bg-white p-3">
                    <div className="relative mb-2">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input autoFocus value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} placeholder="Cari kode/nama barang persediaan..." className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500" />
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {pickableItems.length === 0 ? (
                        <p className="p-3 text-center text-xs text-gray-500">Tidak ada barang ditemukan</p>
                      ) : pickableItems.slice(0, 10).map((it) => {
                        const added = form.items.some(l => l.itemId === it.id);
                        return (
                          <button key={it.id} type="button" disabled={added} onClick={() => addItemLine(it)} className="flex w-full items-center justify-between border-b border-gray-100 px-3 py-2 text-left text-sm hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 last:border-b-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-gray-500">{it.code}</span>
                              <span className="font-medium text-gray-900">{it.name}</span>
                            </div>
                            <span className="text-xs text-gray-500">Stok: {it.stock} {it.unit}</span>
                          </button>
                        );
                      })}
                    </div>
                    <button type="button" onClick={()=>setShowQuickItem(!showQuickItem)} className="mt-2 text-sm font-semibold text-blue-700">+ Barang belum ada di master</button>
                    {showQuickItem&&<div className="mt-2 grid gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 md:grid-cols-2"><input value={quickItem.name} onChange={e=>setQuickItem({...quickItem,name:e.target.value})} placeholder="Nama barang *" className="rounded border px-3 py-2"/><select value={quickItem.categoryId} onChange={e=>setQuickItem({...quickItem,categoryId:e.target.value})} className="rounded border px-3 py-2"><option value="">Kategori *</option>{data.itemCategories.filter(c=>c.isActive).map(c=><option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}</select><input value={quickItem.barcode} onChange={e=>setQuickItem({...quickItem,barcode:e.target.value})} placeholder="Barcode (opsional)" className="rounded border px-3 py-2"/><input value={quickItem.unit} onChange={e=>setQuickItem({...quickItem,unit:e.target.value})} placeholder="Satuan" className="rounded border px-3 py-2"/><div className="md:col-span-2 text-xs text-amber-800">Kode dibuat otomatis. Barang langsung dapat diterima, tetapi berstatus Menunggu Verifikasi Admin.</div><button type="button" onClick={createQuickItem} className="rounded bg-blue-600 px-3 py-2 text-white md:col-span-2">Buat Barang & Pilih</button></div>}
                  </div>
                )}

                {form.items.length === 0 ? (
                  <div className="rounded-lg bg-white p-8 text-center text-sm text-gray-500">
                    <Package className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                    Belum ada barang. Klik "Tambah Barang".
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-blue-200 bg-white">
                    <table className="w-full text-sm">
                      <thead className="bg-blue-100/70">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-blue-700">Kode</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-blue-700">Nama Barang</th>
                          <th className="px-3 py-2 text-center text-xs font-medium text-blue-700 w-24">Qty</th>
                          <th className="px-3 py-2 text-center text-xs font-medium text-blue-700 w-20">Satuan</th>
                          <th className="px-3 py-2 w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {form.items.map((line) => (
                          <tr key={line.id} className="border-t border-blue-100">
                            <td className="px-3 py-2 font-mono text-xs text-gray-600">{line.itemCode}</td>
                            <td className="px-3 py-2 text-gray-900">{line.itemName}</td>
                            <td className="px-3 py-2">
                              <input type="number" min="1" value={line.qty} onChange={(e) => updateLine(line.id, parseInt(e.target.value) || 1)} className="w-full rounded border border-gray-300 px-2 py-1 text-center text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                            </td>
                            <td className="px-3 py-2 text-center text-xs text-gray-600">{line.unit}</td>
                            <td className="px-3 py-2">
                              <button type="button" onClick={() => removeLine(line.id)} className="rounded p-1 text-red-500 hover:bg-red-50"><X className="h-4 w-4" /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-blue-200 bg-blue-50">
                          <td colSpan={2} className="px-3 py-2 text-right text-sm font-bold text-gray-700">Total Qty Diterima</td>
                          <td className="px-3 py-2 text-center text-base font-bold text-blue-700">{totalQty}</td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Catatan</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full resize-none rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
              </div>

              {form.status === 'Diterima' && (
                <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 flex items-start gap-2 text-sm">
                  <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-yellow-800">Perhatian!</p>
                    <p className="text-yellow-700">Status "Diterima" akan otomatis menambah stok ke inventory.</p>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium text-gray-700 hover:bg-gray-50">Batal</button>
                <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700"><Save className="h-4 w-4" /> Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW MODAL */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl">
            <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white px-6 py-4 rounded-t-xl flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">Detail Penerimaan</h3>
                <p className="text-blue-100">{viewing.receiptNumber}</p>
              </div>
              <button onClick={() => setViewing(null)} className="rounded-lg p-2 hover:bg-white/20"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-gray-500">Tanggal</p><p className="font-medium">{viewing.date}</p></div>
                <div><p className="text-gray-500">Status</p><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[viewing.status]}`}>{viewing.status}</span></div>
                <div><p className="text-gray-500">Sumber Barang</p><p className="font-medium">{viewing.sourceType==='Transfer Gudang'?`${viewing.transferNumber||'Transfer manual'} · ${data.warehouses.find(w=>w.id===viewing.sourceWarehouseId)?.name||'Gudang asal'}`:viewing.supplierName||'Supplier belum ditentukan'}</p></div>
                <div><p className="text-gray-500">No. Surat Jalan</p><p className="font-medium font-mono">{viewing.doNumber || '-'}</p></div>
                <div><p className="text-gray-500">Cabang</p><p className="font-medium">{data.branches.find(b => b.id === viewing.branchId)?.name}</p></div>
                <div><p className="text-gray-500">Diterima Oleh</p><p className="font-medium">{viewing.receivedBy || '-'}</p></div>
                <div><p className="text-gray-500">Gudang</p><p className="font-medium">{data.warehouses.find(w=>w.id===viewing.warehouseId)?.name||'-'}</p></div>
                {viewing.shippingNotes&&<div className="col-span-2"><p className="text-gray-500">Keterangan Pengiriman</p><p className="font-medium">{viewing.shippingNotes}</p></div>}
              </div>
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Kode</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Nama Barang</th>
                      <th className="px-3 py-2 text-center font-medium text-gray-600">Qty</th>
                      <th className="px-3 py-2 text-center font-medium text-gray-600">Satuan</th>
                      <th className="px-3 py-2 text-center font-medium text-gray-600">Difakturkan</th>
                      <th className="px-3 py-2 text-center font-medium text-gray-600">Sisa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewing.items.map(item => {
                      const inv = item.qtyInvoiced || 0;
                      const sisa = item.qty - inv;
                      return (
                      <tr key={item.id} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-mono text-xs">{item.itemCode}</td>
                        <td className="px-3 py-2">{item.itemName}</td>
                        <td className="px-3 py-2 text-center font-semibold">{item.qty}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{item.unit}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={inv === 0 ? 'text-gray-400' : inv >= item.qty ? 'text-green-600 font-semibold' : 'text-yellow-600 font-semibold'}>
                            {inv}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={sisa === 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                            {sisa}
                          </span>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {viewing.notes && <div className="rounded-lg bg-gray-50 p-3 text-sm"><p className="font-medium text-gray-700 mb-1">Catatan:</p><p className="text-gray-600">{viewing.notes}</p></div>}
              <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                {viewing.status==='Draft'&&hasPermission('receipt:edit')&&<button onClick={()=>{handleReceive(viewing);setViewing(null)}} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white">Terima Barang</button>}
                {viewing.status==='Diterima'&&viewing.sourceType!=='Transfer Gudang'&&getInvoiceStatus(viewing)!=='Lunas'&&hasPermission('purchase:create')&&<button onClick={()=>{openInvoicePreview(viewing);setViewing(null)}} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">Buat Faktur</button>}
                {hasPermission('receipt:edit')&&<button onClick={()=>{const selected=viewing;setViewing(null);openModal(selected)}} className="rounded-lg border border-blue-300 px-4 py-2 text-sm font-medium text-blue-700">Edit</button>}
                {hasPermission('receipt:delete')&&<button onClick={()=>{handleDelete(viewing);setViewing(null)}} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700">Hapus</button>}
                <button onClick={()=>setViewing(null)} className="rounded-lg border px-4 py-2 text-sm">Tutup</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== INVOICE PREVIEW MODAL ===== */}
      {invoiceReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[95vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-blue-600 to-blue-800 px-6 py-4 rounded-t-xl text-white">
              <div className="flex items-center gap-3">
                <ReceiptText className="h-6 w-6" />
                <div>
                  <h3 className="text-lg font-bold">Preview Faktur Pembelian</h3>
                  <p className="text-blue-100 text-sm">
                    Dari Penerimaan: <span className="font-mono">{invoiceReceipt.receiptNumber}</span>
                  </p>
                </div>
              </div>
              <button onClick={() => setInvoiceReceipt(null)} className="rounded-lg p-2 hover:bg-white/20"><X className="h-5 w-5" /></button>
            </div>

            <div className="p-6 space-y-4">
              {/* Auto-generated Invoice Number */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
                <span className="text-sm text-blue-700 font-medium">No. Faktur (Auto Generate)</span>
                <span className="text-base font-bold text-blue-700 font-mono">
                  {generatePurchaseInvoiceNumber(invoiceReceipt.branchId)}
                </span>
              </div>

              {/* Supplier Info */}
              <div className="rounded-lg bg-gray-50 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Supplier</span>
                  <span className="font-semibold text-gray-900">{invoiceReceipt.supplierName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">No. Surat Jalan</span>
                  <span className="font-mono text-gray-700">{invoiceReceipt.doNumber || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Tanggal Terima</span>
                  <span className="text-gray-700">{invoiceReceipt.date}</span>
                </div>
              </div>

              {/* Invoice Form */}
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Tanggal Faktur *</label>
                  <input type="date" required value={invoiceForm.date} onChange={(e) => setInvoiceForm({ ...invoiceForm, date: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Jatuh Tempo *</label>
                  <input type="date" required value={invoiceForm.dueDate} onChange={(e) => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">No. Inv Supplier</label>
                  <input value={invoiceForm.supplierInvoiceNumber} onChange={(e) => setInvoiceForm({ ...invoiceForm, supplierInvoiceNumber: e.target.value })} placeholder="Mis: INV-W/2026/0145" className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {/* Items Table - editable price */}
              <div className="overflow-x-auto rounded-lg border border-blue-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-blue-100/70">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-blue-700">Kode</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-blue-700">Nama Barang</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-blue-700 w-20">Qty</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-blue-700 w-16">Satuan</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-blue-700 w-32">Harga Beli</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-blue-700 w-24">Diskon</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-blue-700">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceForm.items.map(line => (
                      <tr key={line.id} className="border-t border-blue-100">
                        <td className="px-3 py-2 font-mono text-xs text-gray-600">{line.itemCode}</td>
                        <td className="px-3 py-2 text-gray-900">{line.itemName}</td>
                        <td className="px-3 py-2 text-center">
                          <input type="number" min="1" value={line.qty} onChange={(e) => updateInvoiceLine(line.id, 'qty', parseInt(e.target.value) || 1)} className="w-full rounded border border-gray-300 px-2 py-1 text-center text-sm outline-none focus:border-blue-500" />
                        </td>
                        <td className="px-3 py-2 text-center text-xs text-gray-600">{line.unit}</td>
                        <td className="px-3 py-2">
                          <input type="number" min="0" value={line.unitPrice} onChange={(e) => updateInvoiceLine(line.id, 'unitPrice', parseInt(e.target.value) || 0)} className="w-full rounded border border-gray-300 px-2 py-1 text-right text-sm outline-none focus:border-blue-500" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min="0" value={line.discount} onChange={(e) => updateInvoiceLine(line.id, 'discount', parseInt(e.target.value) || 0)} className="w-full rounded border border-gray-300 px-2 py-1 text-right text-sm outline-none focus:border-blue-500" />
                        </td>
                        <td className="px-3 py-2 text-right font-medium whitespace-nowrap">Rp {line.subtotal.toLocaleString('id-ID')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="rounded-lg bg-gray-50 p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-medium">Rp {invSubtotal.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">Diskon Faktur</span>
                  <input type="number" min="0" value={invoiceForm.discount} onChange={(e) => setInvoiceForm({ ...invoiceForm, discount: parseInt(e.target.value) || 0 })} className="w-32 rounded border border-gray-300 px-2 py-1 text-right text-sm" />
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">Pajak / PPN</span>
                  <input type="number" min="0" value={invoiceForm.tax} onChange={(e) => setInvoiceForm({ ...invoiceForm, tax: parseInt(e.target.value) || 0 })} className="w-32 rounded border border-gray-300 px-2 py-1 text-right text-sm" />
                </div>
                <div className="flex justify-between border-t pt-2 text-lg font-bold">
                  <span>TOTAL</span>
                  <span className="text-blue-700">Rp {invTotal.toLocaleString('id-ID')}</span>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Catatan</label>
                <textarea value={invoiceForm.notes} onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })} rows={2} className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
              </div>

              {/* Info Banner */}
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 flex items-start gap-2 text-sm">
                <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-blue-700">
                  <p className="font-medium">Setelah Faktur dibuat:</p>
                  <ul className="text-xs mt-1 list-disc list-inside space-y-0.5">
                    <li>Status faktur akan menjadi <strong>Belum Lunas</strong></li>
                    <li>Anda bisa melakukan pembayaran via menu <strong>Faktur Pembelian</strong></li>
                    <li>Status penerimaan ini akan berubah menjadi <strong>Sebagian/Sudah Difakturkan</strong></li>
                  </ul>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
                <button type="button" onClick={() => setInvoiceReceipt(null)} className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium text-gray-700 hover:bg-gray-50">Batal</button>
                <button type="button" onClick={submitInvoice} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700">
                  <ReceiptText className="h-4 w-4" /> Buat Faktur
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
