import { useMemo, useState } from 'react';
import { FolderTree, Plus, Edit, Trash2, X, Save, Search, Package, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { ItemCategory } from '../types';

const emptyForm = { code: '', name: '', type: 'Semua' as ItemCategory['type'], description: '', isActive: true };

export default function Categories() {
  const { data, addItemCategory, updateItemCategory, deleteItemCategory, hasPermission } = useApp();
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ItemCategory | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [msg, setMsg] = useState('');

  const stats = useMemo(() => ({
    total: data.itemCategories.length,
    active: data.itemCategories.filter(c => c.isActive).length,
    used: data.itemCategories.filter(c => data.items.some(i => i.categoryId === c.id)).length,
    empty: data.itemCategories.filter(c => !data.items.some(i => i.categoryId === c.id)).length,
  }), [data.itemCategories, data.items]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return data.itemCategories.filter(c => {
      const activeMatch = filterActive === 'all' || (filterActive === 'active' ? c.isActive : !c.isActive);
      const searchMatch = c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q);
      return activeMatch && searchMatch;
    });
  }, [data.itemCategories, search, filterActive]);

  const nextCode = () => {
    const max = data.itemCategories.reduce((m, c) => {
      const n = parseInt(c.code.replace(/\D/g, '')) || 0;
      return n > m ? n : m;
    }, 0);
    return `KAT-${String(max + 1).padStart(3, '0')}`;
  };

  const itemCount = (catId: string) => data.items.filter(i => i.categoryId === catId).length;

  const openModal = (cat?: ItemCategory) => {
    if (cat) {
      setEditing(cat);
      setForm({ code: cat.code, name: cat.name, type: 'Semua', description: cat.description, isActive: cat.isActive });
    } else {
      setEditing(null);
      setForm({ ...emptyForm, code: nextCode() });
    }
    setShowModal(true);
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const code = form.code.trim().toUpperCase();
    const name = form.name.trim();

    if (!code || !name) { window.alert('Kode dan Nama wajib diisi.'); return; }

    const dupCode = data.itemCategories.find(c => c.code.trim().toUpperCase() === code && c.id !== editing?.id);
    if (dupCode) { window.alert(`Kode "${code}" sudah dipakai oleh kategori "${dupCode.name}".`); return; }

    const dupName = data.itemCategories.find(c => c.name.trim().toLowerCase() === name.toLowerCase() && c.id !== editing?.id);
    if (dupName) { window.alert(`Nama "${name}" sudah ada (kode ${dupName.code}).`); return; }

    const payload: ItemCategory = { id: editing?.id || Date.now().toString(), ...form, type: 'Semua', code, name };
    if (editing) { updateItemCategory(editing.id, payload); setMsg(`Kategori "${name}" diperbarui.`); }
    else { addItemCategory(payload); setMsg(`Kategori "${name}" ditambahkan.`); }

    setTimeout(() => setMsg(''), 3000);
    setShowModal(false);
  };

  const remove = (cat: ItemCategory) => {
    const used = data.items.filter(i => i.categoryId === cat.id);
    if (used.length > 0) {
      const names = used.slice(0, 5).map(i => `• ${i.code} - ${i.name}`).join('\n');
      window.alert(
        `Kategori "${cat.name}" tidak bisa dihapus.\n\nMasih dipakai oleh ${used.length} barang/jasa:\n${names}` +
        (used.length > 5 ? `\n… dan ${used.length - 5} lainnya` : '') +
        `\n\nPindahkan item ke kategori lain terlebih dahulu.`
      );
      return;
    }
    if (window.confirm(`Hapus kategori "${cat.name}" (${cat.code})?`)) {
      deleteItemCategory(cat.id);
      setMsg(`Kategori "${cat.name}" dihapus.`);
      setTimeout(() => setMsg(''), 3000);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Kategori Barang & Jasa</h2>
          <p className="mt-1 text-gray-500">Kelompokkan sparepart, chemical, jasa, dan paket. Kode & nama harus unik.</p>
        </div>
        {hasPermission('item:create') && (
          <button onClick={() => openModal()} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-700">
            <Plus className="h-5 w-5" /> Kategori Baru
          </button>
        )}
      </div>

      {msg && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-medium text-green-800">
          <CheckCircle2 className="h-5 w-5" /> {msg}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Total Kategori</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Aktif</p>
          <p className="text-2xl font-bold text-green-600">{stats.active}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Terpakai</p>
          <p className="text-2xl font-bold text-blue-600">{stats.used}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Kosong</p>
          <p className="text-2xl font-bold text-amber-600">{stats.empty}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari kode, nama, atau keterangan…" className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={filterActive} onChange={e => setFilterActive(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 outline-none focus:border-blue-500">
          <option value="all">Semua Status</option>
          <option value="active">Aktif</option>
          <option value="inactive">Nonaktif</option>
        </select>
      </div>

      {/* Table (desktop) */}
      <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm md:block">
        <table className="w-full">
          <thead className="bg-blue-900 text-white">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase">Kode</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase">Nama Kategori</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase">Keterangan</th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase">Jml Item</th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase">Status</th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                <FolderTree className="mx-auto mb-3 h-12 w-12 text-gray-300" />
                <p className="font-medium">Belum ada kategori</p>
              </td></tr>
            ) : filtered.map(cat => {
              const count = itemCount(cat.id);
              return (
                <tr key={cat.id} className="transition-colors hover:bg-blue-50/50">
                  <td className="px-4 py-3 font-mono text-sm font-medium text-blue-700">{cat.code}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900">{cat.name}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-sm text-gray-500">{cat.description || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex min-w-[2rem] justify-center rounded-full px-2 py-0.5 text-xs font-bold ${count > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>{count}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cat.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {cat.isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-2">
                      {hasPermission('item:edit') && (
                        <button onClick={() => openModal(cat)} className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-100" title="Edit"><Edit className="h-4 w-4" /></button>
                      )}
                      {hasPermission('item:delete') && (
                        <button
                          onClick={() => remove(cat)}
                          className={`rounded-lg p-1.5 ${count > 0 ? 'cursor-not-allowed text-gray-300' : 'text-red-600 hover:bg-red-100'}`}
                          title={count > 0 ? `Dipakai ${count} item` : 'Hapus'}
                        ><Trash2 className="h-4 w-4" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Cards (mobile) */}
      <div className="grid gap-3 md:hidden">
        {filtered.map(cat => {
          const count = itemCount(cat.id);
          return (
            <div key={cat.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{cat.name}</p>
                  <p className="font-mono text-xs text-blue-600">{cat.code}</p>
                </div>
                <div className="flex gap-1">
                  {hasPermission('item:edit') && <button onClick={() => openModal(cat)} className="rounded p-1.5 text-blue-600 hover:bg-blue-100"><Edit className="h-4 w-4" /></button>}
                  {hasPermission('item:delete') && <button onClick={() => remove(cat)} className={`rounded p-1.5 ${count > 0 ? 'text-gray-300' : 'text-red-600 hover:bg-red-100'}`}><Trash2 className="h-4 w-4" /></button>}
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500">{cat.description || '-'}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700"><Package className="h-3 w-3" /> {count} item</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${cat.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{cat.isActive ? 'Aktif' : 'Nonaktif'}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between rounded-t-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-white">
              <div className="flex items-center gap-2">
                <FolderTree className="h-5 w-5" />
                <h3 className="text-lg font-bold">{editing ? 'Edit Kategori' : 'Kategori Baru'}</h3>
              </div>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-2 hover:bg-white/20"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={save} className="space-y-4 p-6">
              <div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Kode <span className="text-red-500">*</span></label>
                  <input required value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 font-mono uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                  <p className="mt-1 text-[11px] text-gray-500">Harus unik</p>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Nama Kategori <span className="text-red-500">*</span></label>
                <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Mis: Sparepart AC" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                <p className="mt-1 text-[11px] text-gray-500">Harus unik</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Keterangan</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="w-full resize-none rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} className="h-4 w-4 rounded text-blue-600" />
                Aktif
              </label>

              {editing && itemCount(editing.id) > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>Kategori ini dipakai <strong>{itemCount(editing.id)} barang/jasa</strong>. Perubahan nama akan ikut terlihat di item tersebut.</span>
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
    </div>
  );
}
