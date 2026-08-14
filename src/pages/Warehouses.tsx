import { useEffect, useMemo, useState } from 'react';
import { Building2, Edit3, List, Plus, RotateCw, Save, Search, Warehouse as WarehouseIcon, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/apiClient';
import type { Warehouse } from '../types';

type Tab = 'list' | 'form';
const emptyForm = { code: '', name: '', address: '', branchId: '', isSellable: true, isActive: true };

export default function Warehouses() {
  const { data, currentUser, hasPermission, refreshData } = useApp();
  const [tab, setTab] = useState<Tab>('list');
  const [rows, setRows] = useState<Warehouse[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const canCreate = Boolean(currentUser?.isOwner || hasPermission('item:create'));
  const canEdit = Boolean(currentUser?.isOwner || hasPermission('item:edit'));

  const load = async () => {
    const response = await api.get<Warehouse[]>('warehouses');
    if (response.success) setRows(response.data || []);
  };
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => rows.filter(row => {
    const text = `${row.code} ${row.name} ${row.address || ''} ${row.branchName || ''}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (status === 'all' || (status === 'active' ? row.isActive : !row.isActive));
  }), [rows, query, status]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm, branchId: data.branches.find(branch => branch.isActive)?.id || '' });
    setTab('form');
  };
  const openEdit = (row: Warehouse) => {
    if (row.isSystem || !canEdit) return;
    setEditing(row);
    setForm({ code: row.code, name: row.name, address: row.address || '', branchId: row.branchId, isSellable: row.isSellable, isActive: row.isActive });
    setTab('form');
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage('');
    const response = editing ? await api.update('warehouses', editing.id, form) : await api.create('warehouses', form);
    setBusy(false);
    if (!response.success) return setMessage(response.message || 'Gudang gagal disimpan.');
    setMessage(editing ? 'Data gudang berhasil diperbarui.' : 'Gudang baru berhasil ditambahkan.');
    await Promise.all([load(), refreshData()]); setTab('list');
  };

  return <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
    <div className="flex items-end border-b border-blue-600 bg-slate-100 px-2 pt-2">
      <TabButton active={tab === 'list'} onClick={() => setTab('list')} icon={<List className="h-4 w-4"/>}>Daftar Gudang</TabButton>
      {tab === 'form' && <TabButton active onClick={() => undefined} icon={<Building2 className="h-4 w-4"/>}>{editing ? 'Edit Gudang' : 'Data Baru'}<button type="button" onClick={() => setTab('list')} className="ml-3"><X className="h-4 w-4"/></button></TabButton>}
    </div>

    {tab === 'list' ? <>
      <div className="space-y-3 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <select value={status} onChange={event => setStatus(event.target.value)} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm"><option value="all">Non Aktif: Semua</option><option value="active">Hanya Aktif</option><option value="inactive">Hanya Nonaktif</option></select>
          <div className="relative w-full sm:w-80"><Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-500"/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Ketik dan [Enter]" className="w-full rounded border border-slate-300 px-3 py-2 pr-10 text-sm"/></div>
        </div>
        <div className="flex gap-2">{canCreate && <button onClick={openNew} title="Tambah Gudang" className="rounded bg-blue-700 px-5 py-2 text-white"><Plus className="h-5 w-5"/></button>}<button onClick={() => void load()} title="Refresh" className="rounded border border-blue-600 bg-white px-3 py-2 text-blue-700"><RotateCw className="h-4 w-4"/></button></div>
      </div>
      {message && <div className="border-y border-blue-100 bg-blue-50 px-4 py-2 text-sm text-blue-700">{message}</div>}
      <div className="min-h-[430px] overflow-x-auto">
        <table className="w-full text-sm"><thead className="bg-slate-600 text-white"><tr><th className="w-12 p-2"></th><th className="w-[36%] p-2 text-left">Nama</th><th className="p-2 text-left">Alamat</th></tr></thead>
          <tbody>{filtered.map(row => <tr key={row.id} onDoubleClick={() => openEdit(row)} className="border-b even:bg-slate-50 hover:bg-blue-50">
            <td className="p-2 text-center">{canEdit && !row.isSystem && <button onClick={() => openEdit(row)} title="Edit"><Edit3 className="h-4 w-4 text-blue-600"/></button>}</td>
            <td className="p-2"><div className="flex items-center gap-2"><WarehouseIcon className="h-4 w-4 text-slate-500"/><span className="font-medium">{row.name}</span>{row.isSystem && <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">SISTEM</span>}{!row.isActive && <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] text-slate-600">NONAKTIF</span>}</div><div className="pl-6 text-xs text-slate-500">{row.code} · {row.branchName || '-'}</div></td>
            <td className="p-2 text-slate-600">{row.address || '-'}</td>
          </tr>)}</tbody></table>
        {!filtered.length && <p className="py-20 text-center text-slate-400">Belum ada data gudang.</p>}
      </div>
    </> : <form onSubmit={save} className="p-5">
      <div className="mb-5 flex items-center justify-between border-b pb-4"><div><h2 className="text-xl font-semibold">{editing ? 'Edit Gudang' : 'Gudang Baru'}</h2><p className="text-sm text-slate-500">Isi identitas gudang dan hubungkan dengan cabang.</p></div><button disabled={busy} className="rounded bg-blue-700 px-5 py-3 text-white disabled:opacity-50"><Save className="mr-2 inline h-5 w-5"/>{busy ? 'Menyimpan...' : 'Simpan'}</button></div>
      {message && <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{message}</div>}
      <div className="grid max-w-4xl gap-4 md:grid-cols-2">
        <Field label="Nama Gudang *"><input required value={form.name} onChange={event => setForm({...form, name:event.target.value})} placeholder="Mis: G. PERINTIS"/></Field>
        <Field label="Kode Gudang *"><input required value={form.code} onChange={event => setForm({...form, code:event.target.value.toUpperCase()})} placeholder="Mis: GD-PRT"/></Field>
        <Field label="Cabang *"><select required value={form.branchId} onChange={event => setForm({...form, branchId:event.target.value})}><option value="">Pilih cabang</option>{data.branches.filter(branch => branch.isActive).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></Field>
        <Field label="Alamat"><input value={form.address} onChange={event => setForm({...form, address:event.target.value})} placeholder="Alamat/lokasi gudang"/></Field>
      </div>
      <div className="mt-5 flex flex-wrap gap-5 border-t pt-4"><label className="flex items-center gap-2"><input type="checkbox" checked={form.isActive} onChange={event => setForm({...form,isActive:event.target.checked})}/> Aktif</label><label className="flex items-center gap-2"><input type="checkbox" checked={form.isSellable} onChange={event => setForm({...form,isSellable:event.target.checked})}/> Dapat dipakai transaksi</label></div>
    </form>}
  </div>;
}

function TabButton({active,onClick,icon,children}:{active:boolean;onClick:()=>void;icon:React.ReactNode;children:React.ReactNode}) { return <button type="button" onClick={onClick} className={`flex min-h-10 items-center gap-2 rounded-t border border-b-0 px-4 py-2 text-sm ${active ? 'bg-blue-600 font-semibold text-white' : 'bg-slate-200 text-slate-700'}`}>{icon}{children}</button>; }
function Field({label,children}:{label:string;children:React.ReactNode}) { return <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">{label}</span><span className="block [&_input]:w-full [&_input]:rounded [&_input]:border [&_input]:px-3 [&_input]:py-2.5 [&_select]:w-full [&_select]:rounded [&_select]:border [&_select]:px-3 [&_select]:py-2.5">{children}</span></label>; }
