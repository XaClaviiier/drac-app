import { useMemo, useState } from 'react';
import { Building, Download, Edit, List, Mail, MapPin, PackageCheck, Phone, Plus, Printer, RotateCcw, Save, Search, Settings2, Trash2, Truck, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Supplier } from '../types';

type SupplierColumn = 'name' | 'contact' | 'phone' | 'email' | 'address' | 'status' | 'receipts' | 'invoices' | 'actions';
const columns: Array<{ id: SupplierColumn; label: string; locked?: boolean }> = [
  { id: 'name', label: 'Kode / Nama Supplier', locked: true }, { id: 'contact', label: 'Kontak Utama' },
  { id: 'phone', label: 'No. Telepon' }, { id: 'email', label: 'Email' }, { id: 'address', label: 'Alamat' },
  { id: 'status', label: 'Status Aktif' }, { id: 'receipts', label: 'Jumlah Penerimaan' },
  { id: 'invoices', label: 'Jumlah Faktur' }, { id: 'actions', label: 'Aksi', locked: true },
];
const defaults: SupplierColumn[] = ['name', 'contact', 'phone', 'status', 'receipts', 'invoices', 'actions'];
const blankForm = { name: '', contactPerson: '', phone: '', email: '', address: '', isActive: true };

export default function Suppliers() {
  const { data, addSupplier, updateSupplier, deleteSupplier, generateSupplierCode, hasPermission } = useApp();
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState('active');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(blankForm);
  const [showColumns, setShowColumns] = useState(false);
  const [columnSearch, setColumnSearch] = useState('');
  const [visible, setVisible] = useState<SupplierColumn[]>(() => {
    try { const saved = JSON.parse(localStorage.getItem('drac-supplier-columns') || '[]'); return Array.isArray(saved) && saved.length ? Array.from(new Set<SupplierColumn>(['name', ...saved, 'actions'])) : defaults; } catch { return defaults; }
  });

  const filtered = useMemo(() => {
    const query = search.toLowerCase();
    return data.suppliers.filter(supplier => {
      const active = filterActive === 'all' || (filterActive === 'active' ? supplier.isActive : !supplier.isActive);
      const matched = !query || [supplier.name, supplier.code, supplier.contactPerson, supplier.phone, supplier.email].some(value => String(value || '').toLowerCase().includes(query));
      return active && matched;
    });
  }, [data.suppliers, search, filterActive]);

  const dirty = () => editing
    ? form.name !== editing.name || form.contactPerson !== editing.contactPerson || form.phone !== editing.phone || form.email !== editing.email || form.address !== editing.address || form.isActive !== editing.isActive
    : Object.entries(form).some(([key, value]) => key !== 'isActive' && String(value).trim());
  const close = (force = false) => {
    if (!force && dirty() && !window.confirm('Data supplier belum disimpan. Tutup form ini?')) return;
    setShowForm(false); setEditing(null); setForm(blankForm);
  };
  const open = (supplier?: Supplier) => {
    if (supplier) { setEditing(supplier); setForm({ name: supplier.name, contactPerson: supplier.contactPerson, phone: supplier.phone, email: supplier.email, address: supplier.address, isActive: supplier.isActive }); }
    else { setEditing(null); setForm(blankForm); }
    setShowForm(true);
  };
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const payload: Supplier = { id: editing?.id || Date.now().toString(), code: editing?.code || generateSupplierCode(), ...form, name: form.name.toUpperCase(), createdAt: editing?.createdAt || new Date().toISOString().split('T')[0] };
    if (editing) updateSupplier(editing.id, payload); else addSupplier(payload);
    close(true);
  };
  const remove = (supplier: Supplier) => {
    if (data.goodsReceipts.some(item => item.supplierId === supplier.id) || data.purchaseInvoices.some(item => item.supplierId === supplier.id)) return window.alert('Supplier masih digunakan di Penerimaan Barang atau Faktur Pembelian.');
    if (window.confirm(`Hapus supplier ${supplier.name}?`)) deleteSupplier(supplier.id);
  };
  const setColumns = (nextColumns: SupplierColumn[]) => { const next = Array.from(new Set<SupplierColumn>(['name', ...nextColumns, 'actions'])); setVisible(next); localStorage.setItem('drac-supplier-columns', JSON.stringify(next)); };
  const toggleColumn = (id: SupplierColumn) => setColumns(visible.includes(id) ? visible.filter(item => item !== id) : [...visible, id]);
  const reportColumns = columns.filter(column => column.id !== 'actions' && visible.includes(column.id));
  const fieldValue = (supplier: Supplier, field: SupplierColumn) => {
    if (field === 'name') return `${supplier.code} - ${supplier.name}`;
    if (field === 'contact') return supplier.contactPerson || '';
    if (field === 'phone') return supplier.phone || '';
    if (field === 'email') return supplier.email || '';
    if (field === 'address') return supplier.address || '';
    if (field === 'status') return supplier.isActive ? 'Aktif' : 'Nonaktif';
    if (field === 'receipts') return String(data.goodsReceipts.filter(item => item.supplierId === supplier.id).length);
    if (field === 'invoices') return String(data.purchaseInvoices.filter(item => item.supplierId === supplier.id).length);
    return '';
  };
  const exportCsv = () => {
    const csv = [reportColumns.map(column => `"${column.label}"`).join(','), ...filtered.map(supplier => reportColumns.map(column => `"${fieldValue(supplier, column.id).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `daftar_supplier_${new Date().toISOString().split('T')[0]}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  const printList = () => {
    const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const popup = window.open('', '_blank', 'width=1100,height=750'); if (!popup) return window.alert('Izinkan popup untuk mencetak.');
    const head = reportColumns.map(column => `<th>${escape(column.label)}</th>`).join(''); const body = filtered.map(supplier => `<tr>${reportColumns.map(column => `<td>${escape(fieldValue(supplier, column.id))}</td>`).join('')}</tr>`).join('');
    popup.document.write(`<!doctype html><html><head><title>Daftar Supplier</title><style>body{font-family:Arial;margin:24px;color:#172033}h1{font-size:22px;margin:0 0 4px}.meta{font-size:12px;color:#667085;margin-bottom:18px}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#1e40af;color:white;text-align:left;padding:8px}td{border:1px solid #d0d5dd;padding:7px}</style></head><body><h1>DOKTER AC MOBIL — Daftar Supplier</h1><div class="meta">${new Date().toLocaleString('id-ID')} · ${filtered.length} supplier</div><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`); popup.document.close();
  };

  return <div className="space-y-6 lg:-mx-5 lg:-mt-5 lg:space-y-1">
    <div className="hidden items-end border-b border-blue-600 bg-gray-100 px-1 lg:flex">
      <button type="button" onClick={() => showForm && close()} title="Daftar Supplier" className={`flex h-11 w-14 items-center justify-center rounded-t-md border border-b-0 ${!showForm ? 'border-green-600 bg-green-500 text-white' : 'border-gray-300 bg-green-500 text-white hover:bg-green-600'}`}><List className="h-6 w-6" /></button>
      {showForm && <div className="ml-0.5 flex h-11 min-w-48 max-w-80 items-center rounded-t-md border border-b-0 border-blue-600 bg-blue-600 text-white"><span className="min-w-0 flex-1 truncate px-4 text-sm font-semibold">{editing ? `Edit — ${editing.name}` : 'Data Baru'}</span><button type="button" onClick={() => close()} className="mr-1 rounded p-1.5 hover:bg-blue-700"><X className="h-4 w-4" /></button></div>}
    </div>

    <div className={`${showForm ? 'lg:hidden' : ''} space-y-6 lg:space-y-0.5`}>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari kode, nama, kontak, telepon, email..." className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" /></div>
        <select value={filterActive} onChange={event => setFilterActive(event.target.value)} className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none"><option value="active">Aktif</option><option value="inactive">Nonaktif</option><option value="all">Semua</option></select>
        <button onClick={printList} disabled={!filtered.length} className="hidden h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 sm:inline-flex"><Printer className="h-4 w-4" /><span className="hidden xl:inline">Print</span></button>
        <button onClick={exportCsv} disabled={!filtered.length} className="hidden h-9 items-center gap-1.5 rounded-lg border border-green-300 bg-white px-3 text-sm font-medium text-green-700 hover:bg-green-50 disabled:opacity-40 sm:inline-flex"><Download className="h-4 w-4" /><span className="hidden xl:inline">Export</span></button>
        {hasPermission('supplier:create') && <button onClick={() => open()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700"><Plus className="h-5 w-5" /><span className="hidden sm:inline">Tambah</span></button>}
        <div className="relative hidden lg:block"><button onClick={() => setShowColumns(value => !value)} className={`flex h-9 w-9 items-center justify-center rounded-lg border ${showColumns ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-600'}`}><Settings2 className="h-4 w-4" /></button>{showColumns && <><button onClick={() => setShowColumns(false)} className="fixed inset-0 z-20" /><div className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-gray-200 bg-white p-3 shadow-xl"><div className="relative mb-2"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input autoFocus value={columnSearch} onChange={event => setColumnSearch(event.target.value)} placeholder="Cari field..." className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm" /></div><div className="max-h-72 space-y-1 overflow-y-auto">{columns.filter(column => column.label.toLowerCase().includes(columnSearch.toLowerCase())).map(column => <label key={column.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${column.locked ? 'bg-gray-50 text-gray-400' : 'cursor-pointer hover:bg-blue-50'}`}><input type="checkbox" checked={visible.includes(column.id)} disabled={column.locked} onChange={() => toggleColumn(column.id)} />{column.label}</label>)}</div><div className="mt-3 flex justify-between border-t pt-3"><button onClick={() => setColumns(columns.map(column => column.id))} className="text-xs font-semibold text-blue-600">Tampilkan Semua</button><button onClick={() => setColumns(defaults)} className="flex items-center gap-1 text-xs font-semibold text-gray-600"><RotateCcw className="h-3.5 w-3.5" /> Reset Default</button></div></div></>}</div>
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm lg:block"><div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-blue-800 text-xs uppercase text-white"><tr>{columns.filter(column => visible.includes(column.id)).map(column => <th key={column.id} className={`px-4 py-3 ${column.id === 'actions' ? 'text-right' : ''}`}>{column.label}</th>)}</tr></thead><tbody className="divide-y divide-gray-100">{filtered.map(supplier => <tr key={supplier.id} className="hover:bg-blue-50/50">{visible.includes('name') && <td className="px-4 py-3"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-white"><Building className="h-5 w-5" /></span><span><b className="block">{supplier.name}</b><span className="font-mono text-xs text-blue-600">{supplier.code}</span></span></div></td>}{visible.includes('contact') && <td className="px-4 py-3">{supplier.contactPerson || '—'}</td>}{visible.includes('phone') && <td className="px-4 py-3">{supplier.phone || '—'}</td>}{visible.includes('email') && <td className="px-4 py-3">{supplier.email || '—'}</td>}{visible.includes('address') && <td className="max-w-64 truncate px-4 py-3" title={supplier.address}>{supplier.address || '—'}</td>}{visible.includes('status') && <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${supplier.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{supplier.isActive ? 'Aktif' : 'Nonaktif'}</span></td>}{visible.includes('receipts') && <td className="px-4 py-3 text-center">{fieldValue(supplier, 'receipts')}</td>}{visible.includes('invoices') && <td className="px-4 py-3 text-center">{fieldValue(supplier, 'invoices')}</td>}{visible.includes('actions') && <td className="px-4 py-3"><div className="flex justify-end gap-1">{hasPermission('supplier:edit') && <button onClick={() => open(supplier)} className="rounded p-2 text-blue-600 hover:bg-blue-100"><Edit className="h-4 w-4" /></button>}{hasPermission('supplier:delete') && <button onClick={() => remove(supplier)} className="rounded p-2 text-red-600 hover:bg-red-100"><Trash2 className="h-4 w-4" /></button>}</div></td>}</tr>)}</tbody></table></div>{!filtered.length && <div className="p-12 text-center text-sm text-gray-500">Tidak ada supplier sesuai filter.</div>}<div className="flex justify-between border-t bg-gray-50 px-4 py-3 text-xs text-gray-600"><span>Supplier dapat digunakan pada seluruh transaksi pembelian.</span><b>{filtered.length} supplier</b></div></div>

      <div className="grid gap-4 md:grid-cols-2 lg:hidden">{filtered.map(supplier => <div key={supplier.id} className="rounded-xl border bg-white p-5 shadow-sm"><div className="mb-4 flex justify-between"><div className="flex gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white"><Building className="h-5 w-5" /></span><span><b>{supplier.name}</b><span className="block font-mono text-xs text-blue-600">{supplier.code}</span></span></div><button onClick={() => open(supplier)} className="text-blue-600"><Edit className="h-4 w-4" /></button></div><div className="space-y-2 text-sm text-gray-600"><p className="flex gap-2"><Phone className="h-4 w-4" />{supplier.phone}</p>{supplier.email && <p className="flex gap-2"><Mail className="h-4 w-4" />{supplier.email}</p>}{supplier.address && <p className="flex gap-2"><MapPin className="h-4 w-4" />{supplier.address}</p>}</div></div>)}{!filtered.length && <div className="rounded-xl border bg-white p-12 text-center"><Truck className="mx-auto h-12 w-12 text-gray-300" /><p>Belum ada supplier</p></div>}</div>
    </div>

    {showForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 lg:static lg:z-auto lg:grid lg:grid-cols-[minmax(0,1fr)_120px] lg:items-start lg:gap-3 lg:bg-transparent lg:p-0"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-2xl lg:max-h-none lg:max-w-none lg:rounded-md lg:border lg:shadow-sm"><div className="flex justify-between border-b px-6 py-4 lg:hidden"><h3 className="font-semibold">{editing ? 'Edit Supplier' : 'Supplier Baru'}</h3><button onClick={() => close()}><X className="h-5 w-5" /></button></div><div className="hidden border-b bg-gray-100 px-3 lg:flex"><span className="-mb-px rounded-t-md border border-b-white border-t-blue-600 bg-white px-5 py-2.5 text-sm font-semibold">Umum</span></div><form id="supplier-data-form" onSubmit={save} className="space-y-5 p-6 lg:p-4"><div className="grid gap-8 lg:grid-cols-2"><section><h4 className="mb-4 border-b pb-2 text-lg text-blue-600">Info Umum</h4><div className="space-y-4"><Field label="Kode Supplier"><div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 font-mono font-bold text-blue-700">{editing ? editing.code : generateSupplierCode()}</div></Field><Field label="Nama Supplier *"><input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value.toUpperCase() })} className="field uppercase" /></Field><Field label="Kontak Utama"><input value={form.contactPerson} onChange={event => setForm({ ...form, contactPerson: event.target.value })} className="field" /></Field><Field label="No. Telepon *"><input required value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} className="field" /></Field><Field label="Alamat" top><textarea rows={4} value={form.address} onChange={event => setForm({ ...form, address: event.target.value })} className="field resize-y" /></Field></div></section><section><h4 className="mb-4 border-b pb-2 text-lg text-blue-600">Info Lainnya</h4><div className="space-y-4"><Field label="Email (Opsional)"><input type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} className="field" /></Field><Field label="Status"><label className="flex items-center gap-2 py-2"><input type="checkbox" checked={form.isActive} onChange={event => setForm({ ...form, isActive: event.target.checked })} /> Aktif</label></Field></div></section></div><div className="flex justify-end gap-3 border-t pt-4 lg:hidden"><button type="button" onClick={() => close()} className="rounded-lg border px-5 py-2.5">Batal</button><button disabled={!form.name.trim() || !form.phone.trim()} className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-white disabled:bg-gray-200"><Save className="h-4 w-4" /> Simpan</button></div></form></div><button type="submit" form="supplier-data-form" disabled={!form.name.trim() || !form.phone.trim()} title="Simpan Supplier" className="sticky top-[60px] mt-[45px] hidden h-28 w-28 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 lg:inline-flex"><Save className="h-12 w-12" /></button></div>}
  </div>;
}

function Field({ label, children, top = false }: { label: string; children: React.ReactNode; top?: boolean }) {
  return <div className={`grid gap-2 sm:grid-cols-[150px_1fr] ${top ? 'items-start' : 'items-center'}`}><label className={`text-sm font-medium text-gray-700 ${top ? 'pt-2.5' : ''}`}>{label}</label>{children}</div>;
}
