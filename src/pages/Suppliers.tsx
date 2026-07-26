import { useMemo, useState } from 'react';
import { Plus, Search, Edit, Trash2, X, Save, Truck, Phone, Mail, MapPin, Building, FileText, PackageCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Supplier } from '../types';

export default function Suppliers() {
  const {
    data, addSupplier, updateSupplier, deleteSupplier, generateSupplierCode, hasPermission,
  } = useApp();

  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState('active');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState({
    name: '', contactPerson: '', phone: '', email: '', address: '', isActive: true,
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return data.suppliers.filter((s) => {
      const activeMatch = filterActive === 'all' || (filterActive === 'active' ? s.isActive : !s.isActive);
      const searchMatch = !q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || s.phone.includes(search) || s.email.toLowerCase().includes(q);
      return activeMatch && searchMatch;
    });
  }, [data.suppliers, search, filterActive]);

  const open = (supplier?: Supplier) => {
    if (supplier) {
      setEditing(supplier);
      setForm({
        name: supplier.name, contactPerson: supplier.contactPerson,
        phone: supplier.phone, email: supplier.email, address: supplier.address, isActive: supplier.isActive,
      });
    } else {
      setEditing(null);
      setForm({ name: '', contactPerson: '', phone: '', email: '', address: '', isActive: true });
    }
    setShowModal(true);
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Supplier = {
      id: editing?.id || Date.now().toString(),
      code: editing?.code || generateSupplierCode(),
      ...form,
      name: form.name.toUpperCase(),
      createdAt: editing?.createdAt || new Date().toISOString().split('T')[0],
    };
    if (editing) updateSupplier(editing.id, payload);
    else addSupplier(payload);
    setShowModal(false);
  };

  const remove = (supplier: Supplier) => {
    const usedRecv = data.goodsReceipts.some(r => r.supplierId === supplier.id);
    const usedInv = data.purchaseInvoices.some(i => i.supplierId === supplier.id);
    if (usedRecv || usedInv) {
      window.alert('Supplier masih digunakan di Penerimaan Barang atau Faktur Pembelian. Hapus transaksi terkait terlebih dahulu.');
      return;
    }
    if (window.confirm(`Hapus supplier ${supplier.name}?`)) deleteSupplier(supplier.id);
  };

  const totalSupplier = data.suppliers.length;
  const activeSupplier = data.suppliers.filter(s => s.isActive).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Data Supplier</h2>
          <p className="mt-1 text-gray-500">Kelola data supplier/vendor pemasok barang.</p>
        </div>
        {hasPermission('supplier:create') && (
          <button onClick={() => open()} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700">
            <Plus className="h-5 w-5" /> Supplier Baru
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Total Supplier</p>
          <p className="text-2xl font-bold text-gray-900">{totalSupplier}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Aktif</p>
          <p className="text-2xl font-bold text-green-600">{activeSupplier}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Total Penerimaan</p>
          <p className="text-2xl font-bold text-blue-600">{data.goodsReceipts.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Faktur Pembelian</p>
          <p className="text-2xl font-bold text-purple-600">{data.purchaseInvoices.length}</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama, kode, telepon, email supplier..." className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
          </div>
          <select value={filterActive} onChange={(e) => setFilterActive(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
            <option value="all">Semua</option>
          </select>
        </div>
      </div>

      {/* Supplier Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.length === 0 ? (
          <div className="col-span-full rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
            <Truck className="mx-auto mb-3 h-12 w-12 text-gray-300" />
            <p className="font-medium text-gray-900">Belum ada supplier</p>
            <p className="text-sm text-gray-500">Klik "Supplier Baru" untuk menambahkan</p>
          </div>
        ) : filtered.map((s) => {
          const recvCount = data.goodsReceipts.filter(r => r.supplierId === s.id).length;
          const invCount = data.purchaseInvoices.filter(i => i.supplierId === s.id).length;
          const unpaidCount = data.purchaseInvoices.filter(i => i.supplierId === s.id && i.status !== 'Lunas' && i.status !== 'Batal').length;
          return (
            <div key={s.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white">
                    <Building className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{s.name}</p>
                    <p className="font-mono text-xs text-blue-600">{s.code}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  {hasPermission('supplier:edit') && <button onClick={() => open(s)} className="rounded p-1.5 text-blue-600 hover:bg-blue-100"><Edit className="h-4 w-4" /></button>}
                  {hasPermission('supplier:delete') && <button onClick={() => remove(s)} className="rounded p-1.5 text-red-600 hover:bg-red-100"><Trash2 className="h-4 w-4" /></button>}
                </div>
              </div>
              <div className="space-y-1.5 text-sm text-gray-600">
                {s.contactPerson && <p className="flex items-center gap-2"><span className="text-gray-400 w-5">👤</span>{s.contactPerson}</p>}
                <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-gray-400 flex-shrink-0" />{s.phone}</p>
                {s.email && <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-gray-400 flex-shrink-0" /><span className="truncate">{s.email}</span></p>}
                {s.address && <p className="flex items-start gap-2"><MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" /><span className="text-xs">{s.address}</span></p>}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${s.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {s.isActive ? 'Aktif' : 'Nonaktif'}
                </span>
                <div className="flex gap-3 text-xs">
                  <span className="text-gray-500 flex items-center gap-1"><PackageCheck className="h-3 w-3" /> {recvCount}</span>
                  <span className="text-gray-500 flex items-center gap-1"><FileText className="h-3 w-3" /> {invCount}</span>
                  {unpaidCount > 0 && <span className="text-yellow-700 font-semibold">⚠ {unpaidCount} Hutang</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">{editing ? 'Edit Supplier' : 'Supplier Baru'}</h3>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-2 hover:bg-gray-100"><X className="h-5 w-5 text-gray-500" /></button>
            </div>
            <form onSubmit={save} className="space-y-4 p-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
                <span className="text-sm text-blue-700 font-medium">Kode Supplier (Auto)</span>
                <span className="text-base font-bold text-blue-700 font-mono">
                  {editing ? editing.code : generateSupplierCode()}
                </span>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Nama Supplier *</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toUpperCase() })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Kontak Person</label>
                  <input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">No. Telepon *</label>
                  <input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Alamat</label>
                <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} className="w-full resize-none rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="h-4 w-4 rounded text-blue-600" />
                Aktif
              </label>
              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium text-gray-700 hover:bg-gray-50">Batal</button>
                <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700"><Save className="h-4 w-4" /> Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
