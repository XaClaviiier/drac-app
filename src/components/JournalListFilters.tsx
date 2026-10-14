import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, Filter, X } from 'lucide-react';
import { useOutsideDismiss } from '../hooks/useOutsideDismiss';
import { blankDateSelection, journalDateBounds, journalDateLabel, JOURNAL_TYPES, type DateSelection } from '../lib/journalList';
import { ui } from './ui/interfaceStandards';

export type JournalBranch = { id: string; name: string };

export default function JournalListFilters({ dateFilter, onDateChange, types, onTypesChange, branches, selectedBranches, onBranchesChange, onError }: {
  dateFilter: DateSelection | null;
  onDateChange: (value: DateSelection | null) => void;
  types: string[];
  onTypesChange: (value: string[]) => void;
  branches: JournalBranch[];
  selectedBranches: string[];
  onBranchesChange: (value: string[]) => void;
  onError: (message: string) => void;
}) {
  const [menu, setMenu] = useState<'date' | 'type' | 'optional' | 'branch' | ''>('');
  const [draft, setDraft] = useState(blankDateSelection);
  const [typeSearch, setTypeSearch] = useState('');
  const [branchSearch, setBranchSearch] = useState('');
  const [branchEnabled, setBranchEnabled] = useState(false);
  const [dateWidth, setDateWidth] = useState(360);
  const datePicker = useRef<HTMLDivElement>(null);
  const optionsPicker = useRef<HTMLDivElement>(null);
  useOutsideDismiss(['[data-journal-filter]'], () => setMenu(''), !!menu);
  useLayoutEffect(() => {
    if (menu !== 'date') return;
    const resize = () => {
      const left = datePicker.current?.getBoundingClientRect().left;
      const right = optionsPicker.current?.getBoundingClientRect().right;
      if (left != null && right != null) setDateWidth(Math.min(Math.max(280, right - left), window.innerWidth - left - 12));
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (datePicker.current?.parentElement) observer.observe(datePicker.current.parentElement);
    return () => observer.disconnect();
  }, [menu, branchEnabled]);
  const toggle = (next: typeof menu) => setMenu(current => current === next ? '' : next);
  const toggleValue = (values: string[], value: string) => values.includes(value) ? values.filter(item => item !== value) : [...values, value];
  const branchOptions = [{ id: '', name: 'Tanpa cabang / umum' }, ...branches];
  const removeBranch = () => { setBranchEnabled(false); onBranchesChange([]); setMenu(''); };

  return <div className={ui.moduleFilters} aria-label="Filter daftar jurnal">
    <div className="app-filter-picker" data-journal-filter ref={datePicker}>
      <span>Tanggal:</span>
      <button type="button" className="app-filter-picker-button" aria-label="Filter tanggal" aria-expanded={menu === 'date'} onClick={() => { if (menu !== 'date') setDraft(dateFilter ? { ...dateFilter } : blankDateSelection()); toggle('date'); }}>
        <span className="app-filter-value">{journalDateLabel(dateFilter)}</span><ChevronDown size={12} />
      </button>
      {menu === 'date' && <div className="app-date-filter-menu" style={{ left: 0, width: dateWidth }} role="group" aria-label="Pilihan tanggal">
        <button type="button" className="app-date-filter-clear" onClick={() => { setDraft(blankDateSelection()); onDateChange(null); setMenu(''); }}><X size={14} />Kosongkan Pilihan</button>
        <label className="app-date-option"><input type="radio" name="journal-date-mode" checked={draft.mode === 'from'} onChange={() => setDraft(value => ({ ...value, mode: 'from' }))} />Dari tanggal</label>
        {draft.mode === 'from' && <>
          <div className="app-date-input-wrap"><input aria-label="Dari tanggal" type="date" value={draft.from} onChange={event => setDraft(value => ({ ...value, from: event.target.value }))} /></div>
          <label className="app-date-option app-date-checkbox"><input type="checkbox" checked={draft.untilEnabled} onChange={event => setDraft(value => ({ ...value, untilEnabled: event.target.checked }))} />Hingga tanggal</label>
          {draft.untilEnabled && <div className="app-date-input-wrap"><input aria-label="Hingga tanggal" type="date" value={draft.to} onChange={event => setDraft(value => ({ ...value, to: event.target.value }))} /></div>}
        </>}
        <label className="app-date-option"><input type="radio" name="journal-date-mode" checked={draft.mode === 'relative'} onChange={() => setDraft(value => ({ ...value, mode: 'relative' }))} />Dalam durasi waktu terakhir</label>
        {draft.mode === 'relative' && <div className="app-relative-row">
          <input aria-label="Jumlah durasi" type="number" min="1" max="10000" step="1" value={draft.duration} onChange={event => setDraft(value => ({ ...value, duration: event.target.value }))} />
          {(['Hari', 'Minggu', 'Bulan'] as const).map(unit => <label key={unit}><input type="radio" name="journal-date-unit" checked={draft.unit === unit} onChange={() => setDraft(value => ({ ...value, unit }))} />{unit}</label>)}
        </div>}
        <button type="button" className="app-date-update" onClick={() => { try { journalDateBounds(draft); onDateChange({ ...draft }); setMenu(''); } catch (error) { onError(error instanceof Error ? error.message : 'Tanggal tidak valid.'); } }}>Update</button>
      </div>}
    </div>
    <div className="app-filter-picker" data-journal-filter>
      <span>Tipe Transaksi:</span>
      <button type="button" className="app-filter-picker-button" aria-label="Filter tipe transaksi" aria-expanded={menu === 'type'} onClick={() => toggle('type')}>
        <span className="app-filter-value">{types.length === 1 ? types[0] : types.length ? types.length + ' dipilih' : 'Semua'}</span><ChevronDown size={12} />
      </button>
      {menu === 'type' && <div className="app-transaction-filter-menu" role="group" aria-label="Pilihan tipe transaksi">
        <input className="app-transaction-filter-search" aria-label="Cari tipe transaksi" placeholder="Cari/Pilih..." value={typeSearch} onChange={event => setTypeSearch(event.target.value)} />
        <div className="app-transaction-filter-options">
          <label className="app-transaction-filter-option"><input type="checkbox" checked={!types.length} onChange={() => onTypesChange([])} />Semua</label>
          {JOURNAL_TYPES.filter(type => type.toLowerCase().includes(typeSearch.toLowerCase())).map(type => <label className="app-transaction-filter-option" key={type}><input type="checkbox" checked={types.includes(type)} onChange={() => onTypesChange(toggleValue(types, type))} />{type}</label>)}
        </div>
      </div>}
    </div>
    {branchEnabled && <div className="app-filter-picker app-filter-optional-picker" data-journal-filter>
      <span>Cabang:</span>
      <button type="button" className="app-filter-picker-button" aria-label="Filter cabang" aria-expanded={menu === 'branch'} onClick={() => toggle('branch')}>
        <span className="app-filter-value">{selectedBranches.length === 1 ? branchOptions.find(branch => branch.id === selectedBranches[0])?.name || selectedBranches[0] : selectedBranches.length ? selectedBranches.length + ' dipilih' : 'Semua'}</span><ChevronDown size={12} />
      </button>
      <button type="button" className="app-filter-clear-chip" aria-label="Hapus filter cabang" onClick={removeBranch}><X size={14} /></button>
      {menu === 'branch' && <div className="app-transaction-filter-menu" role="group" aria-label="Pilihan cabang">
        <input className="app-transaction-filter-search" aria-label="Cari cabang" placeholder="Cari/Pilih..." value={branchSearch} onChange={event => setBranchSearch(event.target.value)} />
        <div className="app-transaction-filter-options">
          <label className="app-transaction-filter-option"><input type="checkbox" checked={!selectedBranches.length} onChange={() => onBranchesChange([])} />Semua</label>
          {branchOptions.filter(branch => branch.name.toLowerCase().includes(branchSearch.toLowerCase())).map(branch => <label className="app-transaction-filter-option" key={branch.id}><input type="checkbox" checked={selectedBranches.includes(branch.id)} onChange={() => onBranchesChange(toggleValue(selectedBranches, branch.id))} />{branch.name}</label>)}
        </div>
      </div>}
    </div>}
    <div className="app-filter-anchor" data-journal-filter ref={optionsPicker}>
      <button type="button" className={ui.toolbarButton} aria-label="Filter opsional" aria-expanded={menu === 'optional'} onClick={() => toggle('optional')}><Filter size={17} /><ChevronDown size={12} /></button>
      {menu === 'optional' && <div className="app-optional-filter-menu"><label className="app-optional-filter-option"><input type="checkbox" checked={branchEnabled} onChange={event => { setBranchEnabled(event.target.checked); if (!event.target.checked) onBranchesChange([]); }} />Cabang</label></div>}
    </div>
  </div>;
}
