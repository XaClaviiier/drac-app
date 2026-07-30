import { useMemo, useState } from 'react';
import { ArrowRightLeft, Boxes, Plus, Warehouse as WarehouseIcon } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/apiClient';

export default function Warehouses() {
  const { data, refreshData, currentBranchId, currentUser } = useApp();
  const [form, setForm] = useState({ sourceWarehouseId: '', destinationWarehouseId: '', itemId: '', quantity: 1, notes: '' });
  const [showNew, setShowNew] = useState(false);
  const [warehouseForm, setWarehouseForm] = useState({ code: '', name: '', branchId: data.branches[0]?.id || '' });
  const [message, setMessage] = useState('');
  const warehouses = useMemo(() => data.warehouses.filter(w => w.isActive && (currentBranchId === 'ALL' || w.branchId === currentBranchId)), [data.warehouses, currentBranchId]);
  const inventoryItems = data.items.filter(i => i.type === 'Persediaan' && i.isActive);
  const stock = (warehouseId: string, itemId: string) => data.warehouseStocks.find(s => s.warehouseId === warehouseId && s.itemId === itemId)?.quantity || 0;

  const transfer = async (e: React.FormEvent) => {
    e.preventDefault(); setMessage('');
    const res = await api.create('stock-movements', form);
    setMessage(res.success ? 'Mutasi stok berhasil.' : (res.message || 'Mutasi gagal'));
    if (res.success) { setForm({ ...form, quantity: 1, notes: '' }); await refreshData(); }
  };
  const addWarehouse = async (e: React.FormEvent) => {
    e.preventDefault(); const res = await api.create('warehouses', { ...warehouseForm, isSellable: true, isActive: true });
    setMessage(res.success ? 'Gudang berhasil ditambahkan.' : (res.message || 'Gagal menambah gudang'));
    if (res.success) { setShowNew(false); await refreshData(); }
  };

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-2xl font-bold text-gray-900">Gudang & Mutasi Stok</h2><p className="text-gray-500">Master barang berlaku global; saldo stok dicatat per gudang.</p></div>
      {currentUser?.isOwner && <button onClick={() => setShowNew(!showNew)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white"><Plus className="h-4 w-4"/> Gudang Baru</button>}
    </div>
    {message && <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">{message}</div>}
    {showNew && <form onSubmit={addWarehouse} className="grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-4">
      <input required placeholder="Kode gudang" value={warehouseForm.code} onChange={e=>setWarehouseForm({...warehouseForm,code:e.target.value.toUpperCase()})} className="rounded-lg border px-3 py-2"/>
      <input required placeholder="Nama gudang" value={warehouseForm.name} onChange={e=>setWarehouseForm({...warehouseForm,name:e.target.value.toUpperCase()})} className="rounded-lg border px-3 py-2"/>
      <select required value={warehouseForm.branchId} onChange={e=>setWarehouseForm({...warehouseForm,branchId:e.target.value})} className="rounded-lg border px-3 py-2">{data.branches.filter(b=>b.isActive).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>
      <button className="rounded-lg bg-blue-600 px-4 py-2 text-white">Simpan Gudang</button>
    </form>}
    <div className="grid gap-4 lg:grid-cols-3">{warehouses.map(w=><div key={w.id} className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3"><div className="rounded-lg bg-cyan-100 p-2 text-cyan-700"><WarehouseIcon className="h-5 w-5"/></div><div><p className="font-semibold">{w.name}</p><p className="text-xs text-gray-500">{w.code} · {w.branchName}{w.isDefault?' · Utama':''}</p></div></div>
      <div className="mt-4 max-h-48 space-y-2 overflow-auto">{inventoryItems.map(i=>{const q=stock(w.id,i.id);return q!==0?<div key={i.id} className="flex justify-between border-b pb-1 text-sm"><span>{i.name}</span><strong className={q<0?'text-red-600':''}>{q} {i.unit}</strong></div>:null})}<p className="text-xs text-gray-400"><Boxes className="mr-1 inline h-3 w-3"/>Saldo barang tersimpan per gudang</p></div>
    </div>)}</div>
    <form onSubmit={transfer} className="rounded-xl border bg-white p-5 shadow-sm">
      <h3 className="mb-4 flex items-center gap-2 font-semibold"><ArrowRightLeft className="h-5 w-5 text-blue-600"/> Mutasi Antar-Gudang</h3>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
        <select required value={form.sourceWarehouseId} onChange={e=>setForm({...form,sourceWarehouseId:e.target.value})} className="rounded-lg border px-3 py-2"><option value="">Gudang sumber</option>{data.warehouses.filter(w=>w.isActive).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select>
        <select required value={form.destinationWarehouseId} onChange={e=>setForm({...form,destinationWarehouseId:e.target.value})} className="rounded-lg border px-3 py-2"><option value="">Gudang tujuan</option>{data.warehouses.filter(w=>w.isActive&&w.id!==form.sourceWarehouseId).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select>
        <select required value={form.itemId} onChange={e=>setForm({...form,itemId:e.target.value})} className="rounded-lg border px-3 py-2"><option value="">Pilih barang</option>{inventoryItems.map(i=><option key={i.id} value={i.id}>{i.code} — {i.name} ({stock(form.sourceWarehouseId,i.id)})</option>)}</select>
        <input required min={1} type="number" value={form.quantity} onChange={e=>setForm({...form,quantity:Number(e.target.value)})} className="rounded-lg border px-3 py-2"/>
        <button className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white">Proses Mutasi</button>
      </div>
      <input placeholder="Catatan mutasi" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} className="mt-3 w-full rounded-lg border px-3 py-2"/>
    </form>
    <div className="overflow-hidden rounded-xl border bg-white"><div className="border-b p-4 font-semibold">Riwayat Mutasi</div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-left"><tr><th className="p-3">Tanggal</th><th>Barang</th><th>Dari</th><th>Ke</th><th>Jumlah</th></tr></thead><tbody>{data.stockMovements.map(m=><tr key={m.id} className="border-t"><td className="p-3">{m.createdAt}</td><td>{m.itemName}</td><td>{m.sourceName||'-'}</td><td>{m.destinationName||'-'}</td><td className="font-semibold">{m.quantity}</td></tr>)}</tbody></table></div></div>
  </div>;
}
