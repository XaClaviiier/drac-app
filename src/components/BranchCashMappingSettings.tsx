import { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, Banknote, Landmark, Link2, LoaderCircle, RefreshCw, Save, Search, X } from 'lucide-react';
import { api } from '../lib/apiClient';
import './BranchCashMappingSettings.css';

interface Branch { id: string; name: string; isActive?: boolean }
interface CashAccount {
  id: string;
  code?: string;
  name: string;
  accountType: 'cash' | 'bank';
  branchId?: string | null;
  isActive?: boolean;
  postingEnabled?: boolean;
  mappingError?: string | null;
  ledgerAccountCode?: string | null;
  ledgerAccountName?: string | null;
}
const mappingFields = ['cashAccountId', 'bankAccountId', 'depositDestinationAccountId'] as const;
type MappingField = typeof mappingFields[number];
type Mapping = { branchId: string } & Partial<Record<MappingField, string | null>>;

function accountIssue(account: CashAccount, branchId: string, type: CashAccount['accountType']) {
  if (account.accountType !== type) return 'Jenis akun tidak sesuai.';
  if ((type === 'cash' && account.branchId !== branchId) || (account.branchId && account.branchId !== branchId)) return 'Akun milik cabang lain.';
  if (account.isActive === false) return 'Akun nonaktif.';
  return account.mappingError || (account.postingEnabled !== true ? 'Kode perkiraan belum siap digunakan.' : '');
}

function AccountPicker({ label, branchId, type, value, accounts, disabled, onChange }: {
  label: string; branchId: string; type: CashAccount['accountType']; value?: string | null;
  accounts: CashAccount[]; disabled: boolean; onChange: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const id = useId();
  const current = accounts.find(account => account.id === value);
  const issue = current ? accountIssue(current, branchId, type) : value ? 'Akun tersimpan tidak tersedia. Pilih akun pengganti.' : '';
  const options = accounts.filter(account => account.accountType === type
    && (type === 'cash' ? account.branchId === branchId : !account.branchId || account.branchId === branchId)
    && [account.code, account.name, account.ledgerAccountCode, account.ledgerAccountName].join(' ').toLocaleLowerCase('id').includes(search.trim().toLocaleLowerCase('id')));

  useEffect(() => {
    if (!open) return;
    searchInput.current?.focus();
    const dismiss = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  const choose = (next: string | null) => {
    onChange(next); setOpen(false); setSearch(''); trigger.current?.focus();
  };
  return <div className="branch-cash-picker" ref={container} onKeyDown={event => {
    if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
  }}>
    <div className={`branch-cash-control ${open ? 'is-open' : ''} ${issue ? 'has-error' : ''}`}>
      <button ref={trigger} type="button" className="branch-cash-trigger" disabled={disabled} aria-label={label} aria-expanded={open} aria-controls={open ? id : undefined} aria-describedby={`${id}-description`} onClick={() => { setOpen(!open); setSearch(''); }}>
        <span>{current ? <><strong>{current.name}</strong><small>{current.code ? `[${current.code}]` : 'Kode kas belum diisi'}</small></>
          : <span className="branch-cash-placeholder">{value ? 'Akun tersimpan tidak tersedia' : `Cari/pilih ${type === 'cash' ? 'kas tunai' : 'rekening transfer'}...`}</span>}</span>
        <Search size={17} aria-hidden="true" />
      </button>
      {value && <button type="button" className="branch-cash-clear" aria-label={`Kosongkan ${label.toLowerCase()}`} disabled={disabled} onClick={() => choose(null)}><X size={16} aria-hidden="true" /></button>}
    </div>
    <div id={`${id}-description`} className={`branch-cash-description ${issue || !value ? 'is-warning' : ''}`}>
      {issue || !value ? <AlertCircle size={13} aria-hidden="true" /> : <Link2 size={13} aria-hidden="true" />}
      <span>{issue || (!value ? 'Belum dipilih' : `Akun perkiraan: ${current?.ledgerAccountCode ? `[${current.ledgerAccountCode}] ` : ''}${current?.ledgerAccountName || 'Belum dikaitkan'}`)}</span>
    </div>
    {open && <div id={id} className="branch-cash-options">
      <input ref={searchInput} aria-label={`Cari ${label.toLowerCase()}`} placeholder="Cari kode atau nama akun..." value={search} onChange={event => setSearch(event.target.value)} />
      <div className="branch-cash-results">
        {options.map(account => { const problem = accountIssue(account, branchId, type); return <button key={account.id} type="button" disabled={disabled || !!problem} onClick={() => choose(account.id)}>
          <strong>{account.name}</strong><small>{problem || [account.code, account.ledgerAccountCode, account.ledgerAccountName].filter(Boolean).join(' · ')}</small>
        </button>; })}
        {!options.length && <p role="status">{search ? 'Akun tidak ditemukan.' : `Belum ada ${type === 'cash' ? 'kas tunai' : 'rekening bank'} untuk cabang ini.`}</p>}
      </div>
    </div>}
  </div>;
}

export default function BranchCashMappingSettings({ branches }: { branches: Branch[] }) {
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [draft, setDraft] = useState<Mapping[]>([]);
  const [saved, setSaved] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError('');
    Promise.all([api.get<CashAccount[]>('cash-accounts'), api.get<Mapping[]>('branch-account-settings')]).then(([cash, mappings]) => {
      if (!active) return;
      if (!cash.success || !mappings.success) { setLoadError((!cash.success ? cash.message : mappings.message) || 'Gagal memuat pemetaan kas cabang.'); return; }
      setAccounts(cash.data || []); setDraft(mappings.data || []); setSaved(mappings.data || []);
    }).catch(() => { if (active) setLoadError('Gagal memuat pemetaan kas cabang.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);

  const rows = [...branches].sort((a, b) => Number(a.isActive === false) - Number(b.isActive === false));
  const changes = rows.flatMap(branch => {
    const current = draft.find(mapping => mapping.branchId === branch.id);
    const previous = saved.find(mapping => mapping.branchId === branch.id);
    const patch: Partial<Record<MappingField, string | null>> = {};
    for (const field of mappingFields) if ((current?.[field] || null) !== (previous?.[field] || null)) patch[field] = current?.[field] || null;
    return Object.keys(patch).length ? [{ branch, patch }] : [];
  });
  const missing = rows.filter(branch => branch.isActive !== false).reduce((count, branch) => {
    const mapping = draft.find(item => item.branchId === branch.id);
    return count + Number(!mapping?.cashAccountId) + Number(!mapping?.bankAccountId);
  }, 0);
  const setAccount = (branchId: string, field: MappingField, value: string | null) => {
    setDraft(previous => previous.some(item => item.branchId === branchId)
      ? previous.map(item => item.branchId === branchId ? { ...item, [field]: value } : item)
      : [...previous, { branchId, [field]: value }]);
    setNotice(''); setSaveError('');
  };
  const save = async () => {
    if (loading || saving || loadError || !changes.length) return;
    setSaving(true); setNotice(''); setSaveError('');
    let completed = 0;
    try {
      for (const { branch, patch } of changes) {
        const result = await api.update('branch-account-settings', branch.id, patch);
        if (!result.success) throw new Error(`${branch.name}: ${result.message || 'Gagal menyimpan pemetaan.'}`);
        completed++;
        // A retry sends only branches that have not yet been saved successfully.
        setSaved(previous => previous.some(item => item.branchId === branch.id)
          ? previous.map(item => item.branchId === branch.id ? { ...item, ...patch } : item)
          : [...previous, { branchId: branch.id, ...patch }]);
      }
      setNotice('Pemetaan kas cabang berhasil disimpan. Default baru berlaku untuk pembayaran berikutnya.');
    } catch (error) {
      setSaveError(`${completed ? `${completed} cabang sudah tersimpan. ` : ''}${error instanceof Error ? error.message : 'Gagal menyimpan pemetaan.'} Perubahan yang belum tersimpan dapat dicoba kembali.`);
    } finally { setSaving(false); }
  };
  const picker = (branch: Branch, field: MappingField, label: string) => <AccountPicker
    label={`${label} ${branch.name}`} branchId={branch.id} type={field === 'cashAccountId' ? 'cash' : 'bank'}
    value={draft.find(item => item.branchId === branch.id)?.[field]} accounts={accounts} disabled={loading || saving || !!loadError}
    onChange={value => setAccount(branch.id, field, value)} />;

  return <div className="branch-cash-settings">
    <header className="branch-cash-heading"><Landmark size={21} aria-hidden="true" /><div><h2>Kas default per cabang</h2><p>Akun penerimaan otomatis untuk pembayaran tunai dan transfer.</p></div></header>
    {loading ? <p className="branch-cash-state" role="status"><LoaderCircle size={18} className="animate-spin" />Memuat kas dan rekening cabang...</p>
      : loadError ? <div className="branch-cash-error" role="alert"><p>{loadError}</p><button type="button" onClick={() => setReload(value => value + 1)}><RefreshCw size={16} />Muat ulang</button></div>
      : <>
        {!rows.length && <p className="branch-cash-state">Belum ada cabang yang dapat diatur.</p>}
        {!!rows.length && <table className="branch-cash-table" aria-label="Pemetaan kas cabang"><thead><tr><th scope="col">Cabang</th><th scope="col"><Banknote size={15} /> Kas default tunai</th><th scope="col"><Landmark size={15} /> Kas default transfer</th></tr></thead><tbody>
          {rows.map(branch => <tr key={branch.id}>
            <th scope="row"><strong>{branch.name}</strong><small>{branch.isActive === false ? 'Cabang nonaktif' : 'Default pembayaran'}</small></th>
            <td><span className="branch-cash-mobile-label">Kas default tunai</span>{picker(branch, 'cashAccountId', 'Kas default tunai')}</td>
            <td><span className="branch-cash-mobile-label">Kas default transfer</span>{picker(branch, 'bankAccountId', 'Kas default transfer')}</td>
          </tr>)}
        </tbody></table>}
        {!!rows.length && <details className="branch-cash-additional"><summary>Tujuan setoran tunai</summary><p>Rekening tujuan setoran dapat berbeda dari rekening penerimaan transfer.</p>
          {rows.map(branch => <div key={branch.id} className="branch-cash-deposit"><strong>{branch.name}</strong>{picker(branch, 'depositDestinationAccountId', 'Tujuan setoran')}</div>)}
        </details>}
        <footer className="branch-cash-footer"><div aria-live="polite"><strong>{rows.length} cabang{changes.length ? ` · ${changes.length} cabang diubah` : ''}</strong><small>{missing ? `${missing} pilihan default belum diisi` : 'Pilihan default sudah terisi'}</small></div>
          <div className="branch-cash-actions"><button type="button" disabled={saving || !changes.length} onClick={() => { setDraft(saved); setSaveError(''); setNotice(''); }}>Batal perubahan</button><button type="button" className="branch-cash-save" disabled={saving || !changes.length} onClick={save}><Save size={16} />{saving ? 'Menyimpan...' : 'Simpan pemetaan'}</button></div>
        </footer>
        <p className="branch-cash-footnote">Perubahan default berlaku untuk pembayaran berikutnya. Saldo dan riwayat pembayaran tetap pada akun asal.</p>
      </>}
    {saveError && <p className="branch-cash-error" role="alert">{saveError}</p>}
    {notice && <p className="branch-cash-notice" role="status">{notice}</p>}
  </div>;
}
