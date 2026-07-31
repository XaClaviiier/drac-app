import { useEffect, useMemo, useState } from 'react';
import {
  Building2, MapPin, Hash, ShieldCheck, Bot, Save, KeyRound,
  CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { AppSettings } from '../types';
import { api } from '../lib/apiClient';

type Tab = 'company' | 'branches' | 'documents' | 'security' | 'ai';

const tabs = [
  { id: 'company' as const, label: 'Profil Perusahaan', icon: Building2 },
  { id: 'branches' as const, label: 'Cabang', icon: MapPin },
  { id: 'documents' as const, label: 'Nomor Dokumen', icon: Hash },
  { id: 'security' as const, label: 'Keamanan', icon: ShieldCheck },
  { id: 'ai' as const, label: 'Integrasi AI', icon: Bot },
];

const inputClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';
const labelClass = 'space-y-1.5 text-sm font-medium text-gray-700';

export default function SettingsPage() {
  const { data, currentUser, updateSettings } = useApp();
  const [tab, setTab] = useState<Tab>('company');
  const [draft, setDraft] = useState<AppSettings>(() => structuredClone(data.settings));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [aiKey, setAiKey] = useState('');
  const [aiConfigured, setAiConfigured] = useState(false);
  const canEdit = Boolean(currentUser?.isOwner || currentUser?.roleName === 'Administrator');

  useEffect(() => {
    setDraft(structuredClone(data.settings));
  }, [data.settings]);

  useEffect(() => {
    api.getAISettings().then(result => {
      if (result.success && result.data) {
        setAiConfigured(Boolean(result.data.configured));
        if (result.data.model) setDraft(prev => ({ ...prev, ai: { ...prev.ai, model: result.data.model } }));
      }
    });
  }, []);

  const previews = useMemo(() => {
    const firstBranch = data.branches[0]?.id || 'BR-001';
    const code = draft.branchDocumentCodes[firstBranch] || 'X';
    const now = new Date();
    const dateKey = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const seq = '1'.padStart(draft.documents.sequenceDigits, '0');
    return {
      workOrder: `${draft.documents.workOrderPrefix}${code}${dateKey}${seq}`,
      invoice: `${draft.documents.invoicePrefix}${code}${dateKey}${seq}`,
    };
  }, [data.branches, draft]);

  const save = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      await updateSettings(draft);
      if (tab === 'ai' && currentUser?.isOwner && aiKey.trim()) {
        const result = await api.updateAISettings(aiKey.trim(), draft.ai.model);
        if (!result.success) throw new Error([result.message, result.error].filter(Boolean).join(': ') || 'Gagal menyimpan API Key Groq');
        setAiConfigured(true);
        setAiKey('');
      }
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3000);
    } catch (error: any) {
      window.alert(error?.message || 'Gagal menyimpan pengaturan');
    } finally {
      setSaving(false);
    }
  };

  const setCompany = (key: keyof AppSettings['company'], value: string) =>
    setDraft(prev => ({ ...prev, company: { ...prev.company, [key]: value } }));

  if (!canEdit) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-500" />
        <h2 className="text-lg font-bold text-amber-900">Akses Pengaturan Dibatasi</h2>
        <p className="mt-1 text-sm text-amber-700">Halaman ini hanya dapat dibuka oleh Owner atau Administrator.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-gray-900">Pengaturan</h2>
        <p className="text-sm text-gray-500">Kelola identitas perusahaan, cabang, penomoran, keamanan, dan integrasi.</p>
      </div>

      {saved && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          <CheckCircle2 className="h-5 w-5" /> Pengaturan berhasil disimpan.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[230px_1fr]">
        <nav className="flex gap-2 overflow-x-auto rounded-xl border border-gray-200 bg-white p-2 shadow-sm lg:flex-col lg:overflow-visible">
          {tabs.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`flex flex-shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
                  tab === item.id ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Icon className="h-4 w-4" /> {item.label}
              </button>
            );
          })}
        </nav>

        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          {tab === 'company' && (
            <div>
              <TabHeader title="Profil Perusahaan" description="Informasi yang tampil pada dokumen dan laporan." />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelClass}>Nama perusahaan<input className={inputClass} value={draft.company.name} onChange={e => setCompany('name', e.target.value)} /></label>
                <label className={labelClass}>Nama legal<input className={inputClass} value={draft.company.legalName} onChange={e => setCompany('legalName', e.target.value)} placeholder="PT/CV (opsional)" /></label>
                <label className={labelClass}>Telepon<input className={inputClass} value={draft.company.phone} onChange={e => setCompany('phone', e.target.value)} /></label>
                <label className={labelClass}>Email<input className={inputClass} type="email" value={draft.company.email} onChange={e => setCompany('email', e.target.value)} /></label>
                <label className={labelClass}>NPWP<input className={inputClass} value={draft.company.taxNumber} onChange={e => setCompany('taxNumber', e.target.value)} /></label>
                <label className={labelClass}>Zona waktu<select className={inputClass} value={draft.company.timezone} onChange={e => setCompany('timezone', e.target.value)}><option value="Asia/Makassar">Asia/Makassar (WITA)</option><option value="Asia/Jakarta">Asia/Jakarta (WIB)</option></select></label>
                <label className={`${labelClass} sm:col-span-2`}>Alamat<textarea className={inputClass} rows={2} value={draft.company.address} onChange={e => setCompany('address', e.target.value)} /></label>
                <label className={`${labelClass} sm:col-span-2`}>Footer faktur<textarea className={inputClass} rows={2} value={draft.company.invoiceFooter} onChange={e => setCompany('invoiceFooter', e.target.value)} /></label>
              </div>
            </div>
          )}

          {tab === 'branches' && (
            <div>
              <TabHeader title="Cabang" description="Kode satu huruf digunakan pada nomor dokumen." />
              <div className="space-y-3">
                {data.branches.map(branch => (
                  <div key={branch.id} className="grid items-center gap-3 rounded-lg border border-gray-200 p-3 sm:grid-cols-[1fr_110px_120px]">
                    <div><p className="font-semibold text-gray-900">{branch.name}</p><p className="text-xs text-gray-500">{branch.id} · {branch.address}</p></div>
                    <label className={labelClass}>Kode<input className={`${inputClass} uppercase`} maxLength={1} value={draft.branchDocumentCodes[branch.id] || ''} onChange={e => setDraft(prev => ({ ...prev, branchDocumentCodes: { ...prev.branchDocumentCodes, [branch.id]: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') } }))} /></label>
                    <span className={`rounded-full px-3 py-1 text-center text-xs font-semibold ${branch.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{branch.isActive ? 'Aktif' : 'Nonaktif'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'documents' && (
            <div>
              <TabHeader title="Nomor Dokumen" description="Urutan direset setiap hari dan dipisahkan per cabang." />
              <div className="space-y-5">
                <DocumentCard title="Work Order" value={draft.documents.workOrderPrefix} preview={previews.workOrder} onChange={value => setDraft(prev => ({ ...prev, documents: { ...prev.documents, workOrderPrefix: value.toUpperCase() } }))} />
                <DocumentCard title="Invoice Penjualan" value={draft.documents.invoicePrefix} preview={previews.invoice} onChange={value => setDraft(prev => ({ ...prev, documents: { ...prev.documents, invoicePrefix: value.toUpperCase() } }))} />
                <label className={labelClass}>Digit urutan<select className={inputClass} value={draft.documents.sequenceDigits} onChange={e => setDraft(prev => ({ ...prev, documents: { ...prev.documents, sequenceDigits: Number(e.target.value) } }))}><option value={3}>3 digit</option><option value={4}>4 digit</option></select></label>
              </div>
            </div>
          )}

          {tab === 'security' && (
            <div>
              <TabHeader title="Keamanan" description="Aturan akun Owner dan sesi pengguna." />
              <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3"><ShieldCheck className="h-8 w-8 text-blue-600" /><div><p className="font-bold text-blue-900">OWNER UTAMA</p><p className="text-xs text-blue-700">Akses penuh · tidak dapat dihapus atau dinonaktifkan</p></div></div>
                  <button className="flex items-center gap-2 rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-medium text-blue-700"><KeyRound className="h-4 w-4" /> Ganti Password</button>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelClass}>Durasi sesi<select className={inputClass} value={draft.security.sessionHours} onChange={e => setDraft(prev => ({ ...prev, security: { ...prev.security, sessionHours: Number(e.target.value) } }))}><option value={1}>1 jam</option><option value={4}>4 jam</option><option value={8}>8 jam</option></select></label>
                <label className={labelClass}>Batas gagal login<select className={inputClass} value={draft.security.maxLoginAttempts} onChange={e => setDraft(prev => ({ ...prev, security: { ...prev.security, maxLoginAttempts: Number(e.target.value) } }))}><option value={3}>3 kali</option><option value={5}>5 kali</option></select></label>
                <Toggle label="Aktifkan audit log" checked={draft.security.auditLogEnabled} onChange={checked => setDraft(prev => ({ ...prev, security: { ...prev.security, auditLogEnabled: checked } }))} />
                <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <Toggle label="Wajibkan alasan saat input tanggal mundur" checked={draft.security.requireBackdateReason !== false} onChange={checked => setDraft(prev => ({ ...prev, security: { ...prev.security, requireBackdateReason: checked } }))} />
                  <p className="mt-2 text-xs text-amber-700">Matikan sementara saat input data awal. Tanggal masa depan tetap tidak diizinkan.</p>
                </div>
              </div>
            </div>
          )}

          {tab === 'ai' && (
            <div>
              <TabHeader title="Integrasi AI" description="Atur model dan jenis data yang boleh digunakan Asisten AI." />
              {currentUser?.isOwner ? (
                <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <label className={labelClass}>
                    API Key Groq perusahaan
                    <input
                      className={inputClass}
                      type="password"
                      value={aiKey}
                      onChange={event => setAiKey(event.target.value)}
                      placeholder={aiConfigured ? 'Sudah tersimpan — isi hanya untuk mengganti key' : 'Masukkan key yang diawali gsk_'}
                    />
                  </label>
                  <p className="mt-2 text-xs text-blue-700">
                    {aiConfigured ? 'Key perusahaan sudah aktif dan tidak ditampilkan kembali.' : 'Belum ada key perusahaan.'}
                  </p>
                </div>
              ) : (
                <p className="mb-4 rounded-lg bg-gray-100 p-3 text-sm text-gray-600">API Key hanya dapat dikelola oleh Owner.</p>
              )}
              <label className={labelClass}>Model Groq<select className={inputClass} value={draft.ai.model} onChange={e => setDraft(prev => ({ ...prev, ai: { ...prev.ai, model: e.target.value } }))}><option value="llama-3.3-70b-versatile">Llama 3.3 70B</option><option value="llama-3.1-8b-instant">Llama 3.1 8B</option><option value="openai/gpt-oss-120b">GPT-OSS 120B</option></select></label>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Toggle label="Data pelanggan & kendaraan" checked={draft.ai.allowCustomerData} onChange={checked => setDraft(prev => ({ ...prev, ai: { ...prev.ai, allowCustomerData: checked } }))} />
                <Toggle label="Data barang & stok" checked={draft.ai.allowInventoryData} onChange={checked => setDraft(prev => ({ ...prev, ai: { ...prev.ai, allowInventoryData: checked } }))} />
                <Toggle label="Data keuangan" checked={draft.ai.allowFinancialData} onChange={checked => setDraft(prev => ({ ...prev, ai: { ...prev.ai, allowFinancialData: checked } }))} />
                <Toggle label="Boleh membuat WO setelah konfirmasi" checked={draft.ai.allowCreateWorkOrder} onChange={checked => setDraft(prev => ({ ...prev, ai: { ...prev.ai, allowCreateWorkOrder: checked } }))} />
              </div>
              <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700">Satu key digunakan seluruh perusahaan melalui server. Pengguna lain tidak dapat melihat API Key.</p>
            </div>
          )}

          <div className="mt-6 flex justify-end border-t border-gray-200 pt-4">
            <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              <Save className="h-4 w-4" /> {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function TabHeader({ title, description }: { title: string; description: string }) {
  return <div className="mb-5"><h3 className="text-xl font-bold text-gray-900">{title}</h3><p className="text-sm text-gray-500">{description}</p></div>;
}

function DocumentCard({ title, value, preview, onChange }: { title: string; value: string; preview: string; onChange: (value: string) => void }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <h4 className="mb-3 font-bold text-gray-900">{title}</h4>
      <label className={labelClass}>Awalan<input className={inputClass} value={value} maxLength={8} onChange={e => onChange(e.target.value)} /></label>
      <div className="mt-3 border-t border-gray-100 pt-3"><p className="text-xs text-gray-500">Preview nomor berikutnya</p><code className="text-lg font-bold text-blue-700">{preview}</code></div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-200 p-3 text-sm font-medium text-gray-700">
      {label}<input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="h-5 w-5 rounded border-gray-300 text-blue-600" />
    </label>
  );
}
