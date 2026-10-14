import { useState } from 'react';
import { ChevronDown, Download, Lightbulb, List, Plus, Printer, RefreshCw, Search, Settings, Upload, X } from 'lucide-react';
import { useOutsideDismiss } from '../hooks/useOutsideDismiss';
import { childTabClass, ui } from './ui/interfaceStandards';

type EditorTab = { label: string; active: boolean; onSelect: () => void; onClose: () => void; closeDisabled?: boolean };

export function AccountingModuleTabs({ listActive, listLabel, onList, editor, onHelp }: {
  listActive: boolean;
  listLabel: string;
  onList: () => void;
  editor?: EditorTab;
  onHelp: () => void;
}) {
  return <div className={ui.childBar}>
    <button type="button" className={`${ui.childListTab} ${listActive ? 'app-child-list-tab--active' : ''}`} aria-label={listLabel} onClick={onList}><List size={23} /></button>
    {editor && <div className={childTabClass(editor.active)}>
      <button type="button" onClick={editor.onSelect}>{editor.label}</button>
      <button type="button" aria-label={`Tutup ${editor.label.replace(/^\* /, '')}`} disabled={editor.closeDisabled} onClick={editor.onClose}><X size={15} /></button>
    </div>}
    <button type="button" className={ui.helpButton} title="Petunjuk" aria-label="Petunjuk" onClick={onHelp}><Lightbulb size={19} /></button>
  </div>;
}

export function AccountingListToolbar({ noun, busy, createDisabled, onCreate, onRefresh, onExport, columns, columnOptions, onColumnsChange, query, onQueryChange, onSearch, count }: {
  noun: string;
  busy: boolean;
  createDisabled?: boolean;
  onCreate: () => void;
  onRefresh: () => void;
  onExport: () => void;
  columns: string[];
  columnOptions: readonly string[];
  onColumnsChange: (columns: string[]) => void;
  query: string;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
  count: number;
}) {
  const [columnsOpen, setColumnsOpen] = useState(false);
  useOutsideDismiss(['[data-accounting-columns]'], () => setColumnsOpen(false), columnsOpen);
  return <div className={ui.toolbar}>
    <button type="button" className={ui.toolbarPrimary} aria-label={`Tambah ${noun}`} title="Tambah" disabled={busy || createDisabled} onClick={onCreate}><Plus size={26} /></button>
    <button type="button" className={ui.toolbarButton} aria-label="Muat ulang" title="Muat ulang" disabled={busy} onClick={onRefresh}><RefreshCw size={17} /></button>
    <div className={ui.toolbarRight}>
      <button type="button" className={ui.toolbarButton} aria-label={`Impor ${noun}`} title={`Impor ${noun} belum tersedia`} disabled><Download size={16} /><ChevronDown size={11} /></button>
      <button type="button" className={ui.toolbarButton} aria-label={`Ekspor ${noun}`} title="Ekspor CSV daftar tampil" onClick={onExport}><Upload size={16} /><ChevronDown size={11} /></button>
      <button type="button" className={ui.toolbarButton} aria-label="Cetak" title={`Cetak daftar ${noun}`} onClick={() => window.print()}><Printer size={16} /></button>
      <div className="app-menu-anchor" data-accounting-columns>
        <button type="button" className={ui.toolbarButton} aria-label="Pengaturan kolom" aria-expanded={columnsOpen} onClick={() => setColumnsOpen(value => !value)}><Settings size={16} /><ChevronDown size={11} /></button>
        {columnsOpen && <div className={ui.columnMenu}>
          {columnOptions.map(column => <label key={column}><input type="checkbox" checked={columns.includes(column)} disabled={columns.length === 1 && columns.includes(column)} onChange={event => onColumnsChange(event.target.checked ? columnOptions.filter(option => option === column || columns.includes(option)) : columns.filter(option => option !== column))} />{column}</label>)}
        </div>}
      </div>
      <form className={ui.listSearch} onSubmit={event => { event.preventDefault(); onSearch(); }}>
        <input aria-label={`Cari ${noun}`} placeholder="Ketik dan [Enter]" value={query} onChange={event => onQueryChange(event.target.value)} />
        <button type="submit" aria-label="Cari"><Search size={18} /></button>
      </form>
      <span className={ui.dataCount} aria-label="Jumlah data tampil">{count}</span>
    </div>
  </div>;
}
