import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Pencil, Plus, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/apiClient';
import type { Customer, CustomerPerson, CustomerPersonRole } from '../types';

const contactRoles: CustomerPersonRole[] = ['Owner', 'PIC', 'Supir', 'Keuangan', 'Pengelola Kendaraan'];
const fieldClass = 'mt-1 block h-10 w-full rounded-md border border-gray-300 bg-white px-3 font-normal text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

function ContactEditor({ customerId, person, close }: { customerId: string; person: CustomerPerson | null; close: () => void }) {
  const { data, refreshData } = useApp();
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState(() => ({
    name: person?.name || '', relationshipLabel: person?.relationshipLabel || '',
    email: person?.email || '', phone: person?.phone || '',
    roles: person?.roles || ['Supir' as CustomerPersonRole],
    vehicleAssignments: person?.vehicleAssignments || [],
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const vehicles = data.vehicles.filter(vehicle => vehicle.customerRefId === customerId);
  const vehicleRoles = (['Owner', 'Supir'] as const).filter(role => form.roles.includes(role));

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form, name: form.name.trim(), customerId,
        vehicleAssignments: form.vehicleAssignments.filter(assignment => form.roles.includes(assignment.role)),
        isPrimaryPic: person?.isPrimaryPic ?? false, isBillingContact: person?.isBillingContact ?? false,
        isActive: person?.isActive ?? true,
      };
      const result = person ? await api.update('customer-people', person.id, payload) : await api.create('customer-people', payload);
      if (!result.success) {
        setError(result.message || 'Kontak gagal disimpan.');
        return;
      }
      await refreshData();
      close();
    } catch {
      setError('Kontak gagal dimuat. Periksa kembali daftar kontak.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog ref={dialog} aria-labelledby="customer-contact-title" onCancel={event => { event.preventDefault(); if (!saving) close(); }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-lg bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/50">
      <header className="flex items-center justify-between bg-blue-950 px-4 py-3 text-white">
        <h3 id="customer-contact-title" className="font-semibold">{person ? 'Edit Kontak' : 'Tambah Kontak'}</h3>
        <button type="button" aria-label="Tutup form kontak" disabled={saving} onClick={close}><X className="h-5 w-5" /></button>
      </header>
      <form onSubmit={save} className="space-y-4 p-4">
        <fieldset disabled={saving} className="grid gap-3 text-sm font-medium sm:grid-cols-2">
          <label className="sm:col-span-2">Nama lengkap <span className="text-red-600">*</span>
            <input autoFocus required value={form.name} onChange={e => setForm({ ...form, name: e.target.value.toUpperCase() })} className={fieldClass} />
          </label>
          <label>Jabatan / hubungan<input value={form.relationshipLabel} onChange={e => setForm({ ...form, relationshipLabel: e.target.value })} className={fieldClass} /></label>
          <label>No. telepon<input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={fieldClass} /></label>
          <label className="sm:col-span-2">Email<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={fieldClass} /></label>
        </fieldset>
        <fieldset disabled={saving}>
          <legend className="mb-2 text-sm font-medium">Peran</legend>
          <div className="flex flex-wrap gap-2">{contactRoles.map(role => (
            <label key={role} className="flex items-center gap-2 rounded border px-2 py-1.5 text-xs">
              <input type="checkbox" checked={form.roles.includes(role)} onChange={e => setForm({ ...form, roles: e.target.checked ? [...form.roles, role] : form.roles.filter(item => item !== role) })} />{role}
            </label>
          ))}</div>
        </fieldset>
        {vehicles.length > 0 && vehicleRoles.length > 0 && <fieldset disabled={saving}>
          <legend className="mb-2 text-sm font-medium">Kendaraan</legend>
          <div className="max-h-36 space-y-2 overflow-y-auto">{vehicles.map(vehicle => (
            <div key={vehicle.id} className="flex flex-wrap items-center gap-3 text-xs">
              <strong>{vehicle.plateNumber}</strong>
              {vehicleRoles.map(role => {
                const matches = (assignment: CustomerPerson['vehicleAssignments'][number]) => assignment.vehicleId === vehicle.id && assignment.role === role;
                return <label key={role} className="flex items-center gap-1"><input type="checkbox" aria-label={role + ' ' + vehicle.plateNumber}
                  checked={form.vehicleAssignments.some(matches)} onChange={e => setForm({ ...form, vehicleAssignments: e.target.checked
                    ? [...form.vehicleAssignments, { vehicleId: vehicle.id, role }] : form.vehicleAssignments.filter(item => !matches(item)) })} />{role}</label>;
              })}
            </div>
          ))}</div>
        </fieldset>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <footer className="flex justify-end gap-2 border-t pt-3">
          <button type="button" disabled={saving} onClick={close} className="rounded border px-3 py-2 text-sm">Batal</button>
          <button type="submit" disabled={saving || !form.name.trim()} className="rounded bg-blue-700 px-3 py-2 text-sm font-semibold text-white disabled:bg-gray-400">{saving ? 'Menyimpan...' : 'Simpan Kontak'}</button>
        </footer>
      </form>
    </dialog>
  );
}

export default function CustomerContactsTab({ customer, openGeneral }: { customer: Customer | null; openGeneral: () => void }) {
  const { data, hasPermission } = useApp();
  const [editor, setEditor] = useState<{ person: CustomerPerson | null } | null>(null);
  const contacts = customer ? data.customerPeople.filter(person => person.customerId === customer.id) : [];
  const canEdit = hasPermission('customer:edit');
  return (
    <section className="min-w-0 p-4">
      <div className="mb-3 flex items-center gap-4">
        <h3 className="text-lg font-semibold">Kontak</h3>
        {canEdit && <button type="button" title="Tambah kontak" aria-label="Tambah kontak" disabled={!customer}
          onClick={() => setEditor({ person: null })} className="rounded border border-blue-600 px-3 py-1 text-blue-700 hover:bg-blue-50 disabled:border-gray-300 disabled:text-gray-400"><Plus className="h-5 w-5" /></button>}
      </div>
      <div className="overflow-x-auto rounded border border-gray-300">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-600 text-white"><tr>{['Nama lengkap', 'Jabatan / hubungan', 'Email', 'No. telepon'].map(label => <th key={label} className="whitespace-nowrap px-3 py-2 font-medium">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-200">
            {contacts.map(person => <tr key={person.id}>
              <td className="px-3 py-2">{canEdit ? <button type="button" onClick={() => {
                if (person.isPrimaryPic && person.relationshipLabel === 'Pemilik akun') openGeneral();
                else setEditor({ person });
              }} className="inline-flex items-center gap-2 text-left font-semibold text-blue-700 hover:underline">{person.name}<Pencil className="h-3 w-3 shrink-0" /></button> : person.name}
                {person.isPrimaryPic && <span className="block text-xs text-gray-500">PIC utama</span>}
                {!person.isActive && <span className="block text-xs text-gray-500">Nonaktif</span>}
              </td>
              <td className="px-3 py-2">{person.relationshipLabel || '—'}
                {person.roles.length > 0 && <span className="block text-xs text-gray-500">{person.roles.join(', ')}</span>}
              </td>
              <td className="px-3 py-2">{person.email || '—'}</td>
              <td className="whitespace-nowrap px-3 py-2">{person.phone || '—'}</td>
            </tr>)}
          </tbody>
        </table>
        {!contacts.length && <p className="px-3 py-5 text-center text-sm text-gray-600">{customer ? 'Belum ada kontak.' : 'Simpan pelanggan di tab Umum untuk menambahkan kontak.'}</p>}
      </div>
      {customer && editor && <ContactEditor customerId={customer.id} person={editor.person} close={() => setEditor(null)} />}
    </section>
  );
}
