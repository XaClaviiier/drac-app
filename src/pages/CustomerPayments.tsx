import { useEffect, useMemo, useState } from 'react';
import { Banknote, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { api } from '../lib/apiClient';
import { useApp } from '../context/AppContext';

type PaymentRow = {
  id: string; paymentNumber: string; invoiceId: string; invoiceNumber: string; date: string;
  customerName: string; customerId: string; vehicleInfo: string; invoiceTotal: number;
  invoicePaid: number; amount: number; paymentMethod: string; branchId: string; createdByName?: string; notes?: string;
};

export default function CustomerPayments() {
  const { data, currentUser, currentBranchId, hasPermission, refreshData } = useApp();
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ invoiceId: '', date: today, amount: 0, paymentMethod: 'Tunai', notes: '' });

  const load = async () => {
    setLoading(true);
    const result = await api.get('customer-payments');
    if (result.success) setRows(result.data || []);
    else window.alert(result.message || 'Gagal mengambil pembayaran pelanggan');
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const unpaidInvoices = data.invoices.filter(inv => inv.total > inv.payment && (currentBranchId === 'ALL' || inv.branchId === currentBranchId));
  const selectedInvoice = data.invoices.find(inv => inv.id === form.invoiceId);
  const outstanding = selectedInvoice ? Math.max(0, selectedInvoice.total - selectedInvoice.payment) : 0;
  const filtered = useMemo(() => rows.filter(row => {
    if (currentBranchId !== 'ALL' && row.branchId !== currentBranchId) return false;
    const q = search.toLowerCase();
    return !q || `${row.paymentNumber} ${row.invoiceNumber} ${row.customerName} ${row.customerId} ${row.vehicleInfo}`.toLowerCase().includes(q);
  }), [rows, search, currentBranchId]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedInvoice || form.amount <= 0 || form.amount > outstanding) return window.alert('Periksa invoice dan nominal pembayaran.');
    const result = await api.create('customer-payments', { ...form, createdBy: currentUser?.id, createdByName: currentUser?.name });
    if (!result.success) return window.alert(result.message || 'Gagal menyimpan pembayaran');
    await refreshData(); await load(); setShowForm(false);
    setForm({ invoiceId: '', date: today, amount: 0, paymentMethod: 'Tunai', notes: '' });
  };

  const remove = async (row: PaymentRow) => {
    if (!window.confirm(`Hapus ${row.paymentNumber} sebesar Rp ${row.amount.toLocaleString('id-ID')}?`)) return;
    const result = await api.remove('customer-payments', row.id);
    if (!result.success) return window.alert(result.message || 'Gagal menghapus pembayaran');
    await refreshData(); await load();
  };

  return <div className="space-y-3">
    <div className="flex items-center gap-2">
      <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari pembayaran, invoice, pelanggan, kendaraan..." className="w-full rounded-lg border px-9 py-2.5 outline-none focus:border-blue-500"/></div>
      <button onClick={()=>void load()} className="rounded-lg border border-blue-200 p-2.5 text-blue-700"><RefreshCw className={`h-5 w-5 ${loading?'animate-spin':''}`}/></button>
      {hasPermission('invoice:edit') && <button onClick={()=>setShowForm(true)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white"><Plus className="h-4 w-4"/> Pembayaran</button>}
    </div>
    <div className="overflow-hidden rounded-xl border bg-white"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-blue-900 text-white"><tr>{['Tanggal','No. Pembayaran','Invoice','Pelanggan','Total','Dibayar','Sisa','Metode','Input Oleh','Aksi'].map(h=><th key={h} className="px-3 py-3 text-left text-xs uppercase">{h}</th>)}</tr></thead><tbody className="divide-y">{filtered.map(row=><tr key={row.id} className="hover:bg-blue-50"><td className="px-3 py-3">{row.date}</td><td className="px-3 font-semibold text-blue-700">{row.paymentNumber}</td><td className="px-3">{row.invoiceNumber}</td><td className="px-3"><b>{row.customerName}</b><small className="block text-gray-500">{row.vehicleInfo}</small></td><td className="px-3">Rp {row.invoiceTotal.toLocaleString('id-ID')}</td><td className="px-3 font-semibold text-green-700">Rp {row.amount.toLocaleString('id-ID')}</td><td className="px-3">Rp {Math.max(0,row.invoiceTotal-row.invoicePaid).toLocaleString('id-ID')}</td><td className="px-3">{row.paymentMethod}</td><td className="px-3">{row.createdByName||'-'}</td><td className="px-3 text-center">{hasPermission('invoice:edit')&&<button onClick={()=>void remove(row)} className="rounded p-2 text-red-600 hover:bg-red-50" title="Hapus pembayaran"><Trash2 className="h-4 w-4"/></button>}</td></tr>)}{!filtered.length&&<tr><td colSpan={10} className="p-12 text-center text-gray-400">Belum ada pembayaran pelanggan</td></tr>}</tbody></table></div></div>
    {showForm&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form onSubmit={save} className="w-full max-w-lg rounded-xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b px-5 py-4"><h3 className="flex items-center gap-2 text-lg font-bold"><Banknote className="h-5 w-5 text-green-600"/>Pembayaran Pelanggan</h3><button type="button" onClick={()=>setShowForm(false)}><X/></button></div><div className="space-y-4 p-5"><label className="block text-sm font-medium">Invoice<select required value={form.invoiceId} onChange={e=>{const inv=data.invoices.find(x=>x.id===e.target.value);setForm({...form,invoiceId:e.target.value,amount:inv?Math.max(0,inv.total-inv.payment):0})}} className="mt-1 w-full rounded-lg border p-2.5"><option value="">Pilih invoice belum lunas</option>{unpaidInvoices.map(inv=><option key={inv.id} value={inv.id}>{inv.invoiceNumber} · {inv.customerName} · Sisa Rp {(inv.total-inv.payment).toLocaleString('id-ID')}</option>)}</select></label>{selectedInvoice&&<div className="grid grid-cols-3 gap-2 rounded-lg bg-blue-50 p-3 text-sm"><span>Total<br/><b>Rp {selectedInvoice.total.toLocaleString('id-ID')}</b></span><span>Dibayar<br/><b>Rp {selectedInvoice.payment.toLocaleString('id-ID')}</b></span><span>Sisa<br/><b className="text-red-600">Rp {outstanding.toLocaleString('id-ID')}</b></span></div>}<div className="grid grid-cols-2 gap-3"><label className="text-sm">Tanggal<input type="date" min={selectedInvoice?.date} max={today} value={form.date} onChange={e=>setForm({...form,date:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5"/></label><label className="text-sm">Metode<select value={form.paymentMethod} onChange={e=>setForm({...form,paymentMethod:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5"><option>Tunai</option><option>Transfer</option><option>QRIS</option></select></label></div><label className="block text-sm">Nominal<input type="number" min="1" max={outstanding} value={form.amount||''} onChange={e=>setForm({...form,amount:Number(e.target.value)})} className="mt-1 w-full rounded-lg border p-2.5 text-lg font-bold"/></label><label className="block text-sm">Catatan<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5" rows={2}/></label></div><div className="flex justify-end gap-2 border-t p-4"><button type="button" onClick={()=>setShowForm(false)} className="rounded-lg border px-4 py-2">Batal</button><button className="rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white">Simpan Pembayaran</button></div></form></div>}
  </div>;
}
