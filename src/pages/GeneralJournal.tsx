import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpDown, X } from 'lucide-react';
import { api } from '../lib/apiClient';
import { useApp } from '../context/AppContext';
import { AccountingListToolbar, AccountingModuleTabs } from '../components/AccountingListHeader';
import JournalListFilters, { type JournalBranch } from '../components/JournalListFilters';
import JournalEntryEditor, { journalMoney, type JournalAccount, type JournalDetail } from '../components/JournalEntryEditor';
import { DEFAULT_JOURNAL_COLUMNS, JOURNAL_COLUMNS, journalCell, journalCsv, journalDateBounds, journalSourceType, visibleJournals, type DateSelection, type JournalRow } from '../lib/journalList';

const COLUMN_STORAGE = 'cerdik-journal-columns-v1';
function initialColumns(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(COLUMN_STORAGE) || 'null');
    if (Array.isArray(saved)) {
      const valid = JOURNAL_COLUMNS.filter(column => saved.includes(column));
      if (valid.length) return valid;
    }
  } catch { /* Use defaults when browser storage is unavailable. */ }
  return [...DEFAULT_JOURNAL_COLUMNS];
}

export default function GeneralJournal() {
  const navigate = useNavigate();
  const { hasPermission, currentBranchId } = useApp();
  const [accounts, setAccounts] = useState<JournalAccount[]>([]);
  const [branches, setBranches] = useState<JournalBranch[]>([]);
  const [rows, setRows] = useState<JournalRow[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [view, setView] = useState<'list' | 'draft' | 'detail'>('list');
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftDirty, setDraftDirty] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const [detail, setDetail] = useState<JournalDetail | null>(null);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<DateSelection | null>(null);
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [branchFilters, setBranchFilters] = useState<string[]>([]);
  const [columns, setColumns] = useState(initialColumns);
  const [sort, setSort] = useState({ column: 'Tanggal', asc: false });
  const requestSequence = useRef(0);
  const detailSequence = useRef(0);
  const canCreate = hasPermission('report:view');
  const branchNames = useMemo(() => new Map(branches.map(branch => [branch.id, branch.name])), [branches]);

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setBusy(true);
    try {
      const bounds = journalDateBounds(dateFilter);
      const params = new URLSearchParams({ from: bounds.from, to: bounds.to, limit: '200' });
      typeFilters.forEach(type => params.append('sourceType[]', journalSourceType(type)));
      branchFilters.forEach(id => params.append('branchId[]', id));
      const response = await api.get<JournalRow[]>('journal-entries?' + params.toString());
      if (!response.success) throw new Error(response.message || 'Jurnal gagal dimuat.');
      if (sequence === requestSequence.current) setRows(response.data || []);
    } catch (error) {
      if (sequence === requestSequence.current) { setRows([]); setNotice(error instanceof Error ? error.message : 'Jurnal gagal dimuat.'); }
    } finally { if (sequence === requestSequence.current) setBusy(false); }
  }, [dateFilter, typeFilters, branchFilters]);

  useEffect(() => { void load(); return () => { requestSequence.current++; }; }, [load]);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([api.get<JournalAccount[]>('chart-of-accounts'), api.get<JournalBranch[]>('branches')]).then(([a, b]) => {
      if (cancelled) return;
      if (a.success) setAccounts((a.data || []).filter(account => account.isActive));
      if (b.success) setBranches(b.data || []);
    }).catch(error => { if (!cancelled) setNotice(error instanceof Error ? error.message : 'Daftar akun/cabang gagal dimuat.'); });
    return () => { cancelled = true; detailSequence.current++; };
  }, []);
  useEffect(() => {
    if (!draftDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draftDirty]);
  const discardDraft = () => !draftDirty || window.confirm('Perubahan jurnal belum disimpan. Batalkan perubahan dan lanjutkan?');
  const openDetail = async (id: string) => {
    if (editorBusy) return;
    if (draftOpen && !discardDraft()) return;
    const sequence = ++detailSequence.current;
    setDetailBusy(true);
    try {
      const response = await api.get<JournalDetail>('journal-entries/' + encodeURIComponent(id));
      if (!response.success || !response.data) throw new Error(response.message || 'Detail jurnal gagal dimuat.');
      if (sequence !== detailSequence.current) return;
      setDraftOpen(false); setDraftDirty(false); setDetail(response.data); setView('detail'); setNotice('');
      window.history.replaceState({}, '', '/general-journal?journalId=' + encodeURIComponent(id));
    } catch (error) {
      if (sequence === detailSequence.current) setNotice(error instanceof Error ? error.message : 'Detail jurnal gagal dimuat.');
    } finally { if (sequence === detailSequence.current) setDetailBusy(false); }
  };
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('journalId');
    if (id) void openDetail(id);
  }, []);
  const closeEditor = () => {
    if (editorBusy) return;
    if (draftOpen && !discardDraft()) return;
    setDraftOpen(false); setDraftDirty(false); setDetail(null); setView('list');
    window.history.replaceState({}, '', '/general-journal');
  };
  const create = () => {
    setDetail(null); setDraftOpen(true); setView('draft'); setNotice('');
    window.history.replaceState({}, '', '/general-journal');
  };
  const shown = useMemo(() => visibleJournals(rows, { types: typeFilters, branches: branchFilters, search }, sort, branchNames), [rows, typeFilters, branchFilters, search, sort, branchNames]);
  const changeColumns = (values: string[]) => {
    setColumns(values);
    try { localStorage.setItem(COLUMN_STORAGE, JSON.stringify(values)); } catch { /* Keep current choices for this session. */ }
  };
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([journalCsv(shown, columns, branchNames)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'jurnal-umum.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const editor = detail ? { label: detail.number, active: view === 'detail', onSelect: () => setView('detail'), onClose: closeEditor, closeDisabled: detailBusy }
    : draftOpen ? { label: (draftDirty ? '* ' : '') + 'Data Baru', active: view === 'draft', onSelect: () => setView('draft'), onClose: closeEditor, closeDisabled: editorBusy } : undefined;

  return <div className="app-module-page app-accounting-page gj-preview">
    <AccountingModuleTabs listActive={view === 'list'} listLabel="Daftar jurnal" onList={() => setView('list')} editor={editor} onHelp={() => setNotice('Gunakan + untuk menambah jurnal. Filter tanggal dan tipe transaksi berada di atas; Cabang dapat ditambahkan lewat tombol filter. Klik baris untuk melihat rincian.')} />
    <div className="app-module-panel app-fill-stack">
      {notice && <div role="status" className="app-module-notice">{notice}<button type="button" aria-label="Tutup pesan" onClick={() => setNotice('')}><X size={14} /></button></div>}
      <div className={view === 'list' ? 'app-fill-stack' : 'hidden'}>
        <JournalListFilters dateFilter={dateFilter} onDateChange={value => { setNotice(''); setDateFilter(value); }} types={typeFilters} onTypesChange={setTypeFilters} branches={branches} selectedBranches={branchFilters} onBranchesChange={setBranchFilters} onError={setNotice} />
        <AccountingListToolbar noun="jurnal" busy={busy || detailBusy || editorBusy} createDisabled={!canCreate} onCreate={create} onRefresh={() => { setNotice(''); void load(); }} onExport={exportCsv} columns={columns} columnOptions={JOURNAL_COLUMNS} onColumnsChange={changeColumns} query={query} onQueryChange={value => { setQuery(value); if (!value) setSearch(''); }} onSearch={() => setSearch(query)} count={shown.length} />
        {rows.length === 200 && <div className="app-list-limit" role="status">Maksimal 200 jurnal per pemuatan. Persempit tanggal, tipe transaksi, atau cabang untuk menampilkan jurnal lainnya.</div>}
        <div className="app-table-shell app-table-scroll app-table-scroll--fill" data-accounting-list aria-busy={busy || detailBusy}>
          <h1 className="app-print-title">Jurnal Umum</h1>
          <table className="app-data-table app-accounting-table app-journal-table">
            <thead><tr>{columns.map(column => <th key={column} data-column={column} className={column === 'Total' ? 'amount' : ''} aria-sort={sort.column === column ? sort.asc ? 'ascending' : 'descending' : 'none'}>
              <button type="button" onClick={() => setSort(value => ({ column, asc: value.column === column ? !value.asc : true }))}>{column}<ArrowUpDown size={11} /></button>
            </th>)}</tr></thead>
            <tbody>
              {shown.map(row => <tr key={row.id} tabIndex={0} onClick={() => { if (!detailBusy) void openDetail(row.id); }} onKeyDown={event => { if (event.key === 'Enter' && !detailBusy) void openDetail(row.id); }}>
                {columns.map(column => <td key={column} className={column === 'Total' ? 'amount' : ''} title={String(journalCell(row, column, branchNames))}>{column === 'Total' ? journalMoney(Number(row.total)) : journalCell(row, column, branchNames) || '—'}</td>)}
              </tr>)}
              {!shown.length && <tr><td className="app-data-empty" colSpan={columns.length}>{busy ? 'Memuat jurnal...' : 'Belum ada jurnal sesuai filter.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {draftOpen && <div className={view === 'draft' ? 'app-fill-stack' : 'hidden'}><JournalEntryEditor accounts={accounts} branches={branches} initialBranchId={currentBranchId === 'ALL' ? '' : currentBranchId} canCreate={canCreate} onDirtyChange={setDraftDirty} onBusyChange={setEditorBusy} onNotice={setNotice} onNavigate={navigate} onSaved={message => { setDraftDirty(false); setDraftOpen(false); setView('list'); setNotice(message); void load(); }} /></div>}
      {detail && view === 'detail' && <JournalEntryEditor key={detail.id} detail={detail} accounts={accounts} branches={branches} initialBranchId="" canCreate={false} onDirtyChange={setDraftDirty} onBusyChange={setEditorBusy} onNotice={setNotice} onNavigate={navigate} onSaved={() => {}} />}
    </div>
  </div>;
}
