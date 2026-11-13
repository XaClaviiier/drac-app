import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Banknote, Check, Landmark, LoaderCircle, RefreshCw, Save, Search, X } from 'lucide-react';
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
const mappingFields = ['cashAccountId', 'bankAccountId'] as const;
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
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 264 });
  const container = useRef<HTMLDivElement>(null);
  const control = useRef<HTMLDivElement>(null);
  const dropdown = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const id = useId();
  const current = accounts.find(account => account.id === value);
  const issue = current ? accountIssue(current, branchId, type) : value ? 'Akun tersimpan tidak tersedia. Pilih akun pengganti.' : '';
  const options = accounts.filter(account => account.accountType === type
    && (type === 'cash' ? account.branchId === branchId : !account.branchId || account.branchId === branchId)
    && [account.code, account.name, account.ledgerAccountCode, account.ledgerAccountName].join(' ').toLocaleLowerCase('id').includes(search.trim().toLocaleLowerCase('id')));

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!container.current?.contains(target) && !dropdown.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = control.current;
      const menu = dropdown.current;
      if (!anchor || !menu) return;
      const rect = anchor.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop || 0;
      const viewportLeft = viewport?.offsetLeft || 0;
      const viewportWidth = viewport?.width || window.innerWidth;
      const viewportBottom = viewportTop + (viewport?.height || window.innerHeight);
      const below = Math.max(0, viewportBottom - rect.bottom - 8);
      const above = Math.max(0, rect.top - viewportTop - 8);
      const flip = below < Math.min(264, menu.scrollHeight) && above > below;
      const maxHeight = Math.min(264, flip ? above : below);
      const width = Math.min(rect.width, viewportWidth - 16);
      const next = {
        top: flip ? rect.top - Math.min(menu.scrollHeight, maxHeight) - 4 : rect.bottom + 4,
        left: Math.max(viewportLeft + 8, Math.min(rect.left, viewportLeft + viewportWidth - width - 8)),
        width, maxHeight,
      };
      setPosition(previous => Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
    };
    place();
    const observer = new ResizeObserver(place);
    if (control.current) observer.observe(control.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
    };
  }, [open, search, options.length]);

  useEffect(() => {
    if (open && activeIndex >= 0) dropdown.current?.querySelector(`[data-option-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);
  const choose = (next: string | null) => {
    onChange(next); searchInput.current?.focus(); setOpen(false); setSearch(''); setActiveIndex(-1);
  };
  const descriptionIds = [current ? `${id}-selection` : '', issue ? `${id}-description` : ''].filter(Boolean).join(' ') || undefined;
  return <div className="branch-cash-picker" ref={container} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); setSearch(''); setActiveIndex(-1); }
  }} onBlur={event => {
    const next = event.relatedTarget as Node | null;
    if (!container.current?.contains(next) && !dropdown.current?.contains(next)) setOpen(false);
  }}>
    <div ref={control} className={`branch-cash-control ${open ? 'is-open' : ''} ${issue ? 'has-error' : ''}`}>
      {value && <div className="branch-cash-selection">
        <span id={`${id}-selection`}>{current ? `${current.code ? `[${current.code}] ` : ''}${current.name}` : 'Akun tersimpan tidak tersedia'}</span>
        <button type="button" className="branch-cash-clear" aria-label={`Kosongkan ${label.toLowerCase()}`} disabled={disabled} onClick={() => choose(null)}><X size={14} aria-hidden="true" /></button>
      </div>}
      <div className="branch-cash-search">
        <input ref={searchInput} className="app-field-unstyled" role="combobox" autoComplete="off" aria-autocomplete="list" aria-label={label} aria-expanded={open} aria-controls={open ? id : undefined} aria-describedby={descriptionIds} aria-activedescendant={open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
          disabled={disabled} placeholder="Cari/Pilih..." value={search}
          onFocus={() => { setOpen(true); setActiveIndex(-1); }} onClick={() => setOpen(true)}
          onChange={event => { setSearch(event.target.value); setOpen(true); setActiveIndex(-1); }}
          onKeyDown={event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault(); setOpen(true);
              const available = options.flatMap((account, index) => accountIssue(account, branchId, type) ? [] : [index]);
              const currentIndex = available.indexOf(activeIndex);
              const nextIndex = event.key === 'ArrowDown' ? (currentIndex + 1) % available.length : currentIndex < 0 ? available.length - 1 : (currentIndex - 1 + available.length) % available.length;
              setActiveIndex(available[nextIndex] ?? -1);
            } else if (event.key === 'Enter' && open && activeIndex >= 0) {
              event.preventDefault();
              const account = options[activeIndex];
              if (account && !accountIssue(account, branchId, type)) choose(account.id);
            }
          }} />
        <button type="button" className="branch-cash-search-button" disabled={disabled} aria-label={`Buka pilihan ${label.toLowerCase()}`} onClick={() => { searchInput.current?.focus(); setOpen(true); }}><Search size={17} aria-hidden="true" /></button>
      </div>
    </div>
    {issue && <div id={`${id}-description`} className="branch-cash-description is-warning"><AlertCircle size={13} aria-hidden="true" /><span>{issue}</span></div>}
    {open && createPortal(<div ref={dropdown} id={id} role="listbox" aria-label={`Pilihan ${label.toLowerCase()}`} className="branch-cash-options" style={position}>
      {options.map((account, index) => { const problem = accountIssue(account, branchId, type); return <button key={account.id} id={`${id}-option-${index}`} data-option-index={index} type="button" role="option" aria-selected={account.id === value} disabled={disabled || !!problem} className={index === activeIndex ? 'is-highlighted' : ''}
        onMouseDown={event => event.preventDefault()} onClick={() => choose(account.id)}>
        <span className="branch-cash-option-check" aria-hidden="true">{account.id === value && <Check size={14} />}</span>
        <span><strong>{account.name}</strong><small>{account.code}{problem ? ` · ${problem}` : ` · Akun perkiraan: ${account.ledgerAccountCode ? `[${account.ledgerAccountCode}] ` : ''}${account.ledgerAccountName || 'Belum dikaitkan'}`}</small></span>
      </button>; })}
      {!options.length && <p role="status">{search ? 'Akun tidak ditemukan.' : `Belum ada ${type === 'cash' ? 'kas tunai' : 'rekening bank'} untuk cabang ini.`}</p>}
    </div>, document.body)}
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
      setNotice('Pemetaan kas cabang berhasil disimpan.');
    } catch (error) {
      setSaveError(`${completed ? `${completed} cabang sudah tersimpan. ` : ''}${error instanceof Error ? error.message : 'Gagal menyimpan pemetaan.'} Perubahan yang belum tersimpan dapat dicoba kembali.`);
    } finally { setSaving(false); }
  };
  const picker = (branch: Branch, field: MappingField, label: string) => <AccountPicker
    label={`${label} ${branch.name}`} branchId={branch.id} type={field === 'cashAccountId' ? 'cash' : 'bank'}
    value={draft.find(item => item.branchId === branch.id)?.[field]} accounts={accounts} disabled={loading || saving || !!loadError}
    onChange={value => setAccount(branch.id, field, value)} />;

  return <div className="branch-cash-settings">
    <header className="branch-cash-heading"><Landmark size={21} aria-hidden="true" /><h2>Kas default per cabang</h2></header>
    {loading ? <p className="branch-cash-state" role="status"><LoaderCircle size={18} className="animate-spin" />Memuat kas dan rekening cabang...</p>
      : loadError ? <div className="branch-cash-error" role="alert"><p>{loadError}</p><button type="button" onClick={() => setReload(value => value + 1)}><RefreshCw size={16} />Muat ulang</button></div>
      : <>
        {!rows.length && <p className="branch-cash-state">Belum ada cabang yang dapat diatur.</p>}
        {!!rows.length && <table className="branch-cash-table" aria-label="Pemetaan kas cabang"><thead><tr><th scope="col">Cabang</th><th scope="col"><Banknote size={15} /> Kas default tunai</th><th scope="col"><Landmark size={15} /> Kas default transfer</th></tr></thead><tbody>
          {rows.map(branch => <tr key={branch.id}>
            <th scope="row"><strong>{branch.name}</strong>{branch.isActive === false && <small>Cabang nonaktif</small>}</th>
            <td><span className="branch-cash-mobile-label">Kas default tunai</span>{picker(branch, 'cashAccountId', 'Kas default tunai')}</td>
            <td><span className="branch-cash-mobile-label">Kas default transfer</span>{picker(branch, 'bankAccountId', 'Kas default transfer')}</td>
          </tr>)}
        </tbody></table>}
        <footer className="branch-cash-footer"><div aria-live="polite"><strong>{rows.length} cabang{changes.length ? ` · ${changes.length} cabang diubah` : ''}</strong><small>{missing ? `${missing} pilihan default belum diisi` : 'Pilihan default sudah terisi'}</small></div>
          <div className="branch-cash-actions"><button type="button" disabled={saving || !changes.length} onClick={() => { setDraft(saved); setSaveError(''); setNotice(''); }}>Batal perubahan</button><button type="button" className="branch-cash-save" disabled={saving || !changes.length} onClick={save}><Save size={16} />{saving ? 'Menyimpan...' : 'Simpan pemetaan'}</button></div>
        </footer>
      </>}
    {saveError && <p className="branch-cash-error" role="alert">{saveError}</p>}
    {notice && <p className="branch-cash-notice" role="status">{notice}</p>}
  </div>;
}
