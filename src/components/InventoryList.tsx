import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Filter, GripVertical, Search, SlidersHorizontal } from 'lucide-react';
import ActiveFilterResetButton from './ActiveFilterResetButton';
import IndonesianDateInput from './IndonesianDateInput';
import { useConfigurableTable, type TableSort } from './ConfigurableTable';
import '../pages/InventoryReports.css';
import '../pages/StockMovementReport.css';
import './InventoryList.css';

export function matchesInventoryPeriod(date: string, from: string, to: string) {
  return !from || (date >= from && date <= (to || from));
}

export function useInventoryPeriod(initialFrom = '', initialTo = '') {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const onFrom = (date: string) => {
    setFrom(date);
    if (!date || to < date) setTo('');
  };
  return {from, to, onFrom, onTo: setTo};
}

type DateFields = { from: string; to: string; onFrom: (date: string) => void; onTo: (date: string) => void };
type ToolbarProps = (DateFields | { [K in keyof DateFields]?: never }) & {
  name: string;
  searchHint?: string;
  search: string;
  onSearch: (search: string) => void;
  placeholder: string;
  count: number | string;
  primaryFilters?: ReactNode;
  filters: ReactNode;
  filterCount: number;
  clearFilters: () => void;
  actions: ReactNode;
  tools?: ReactNode;
  columns: ReactNode;
  applyLabel?: string;
  onApply?: () => void;
  applyDisabled?: boolean;
};

export function InventoryListToolbar(props: ToolbarProps) {
  const [menu, setMenu] = useState<'filter' | 'columns' | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const region = (menu === 'filter' ? filterRef : columnsRef).current;
    const outside = (event: Event) => { if (!region?.contains(event.target as Node)) setMenu(null); };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(null);
        region?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [menu]);
  const clear = () => { props.clearFilters(); setMenu(null); };
  return <div className="inventory-list-toolbar stock-movement-header-shell">
    <div className="stock-movement-parameter-row">
      {props.from !== undefined && <div className="stock-movement-date-range">
        <IndonesianDateInput clearable ariaLabel={`Tanggal awal ${props.name}`} className="inventory-report-date" value={props.from} onChange={props.onFrom}/>
        <span>s/d</span>
        <IndonesianDateInput clearable ariaLabel={`Tanggal akhir ${props.name}`} className="inventory-report-date" value={props.to} min={props.from || undefined} disabled={!props.from} onChange={props.onTo}/>
      </div>}
      {props.primaryFilters}
      <div className="inventory-list-filter-tools">
        <div ref={filterRef} className="inventory-list-menu-anchor">
          <button type="button" className="stock-movement-filter-button" aria-expanded={menu === 'filter'} onClick={() => setMenu(menu === 'filter' ? null : 'filter')}>
            <Filter size={16}/> Filter {props.filterCount > 0 && <span className="stock-movement-filter-badge">{props.filterCount}</span>}
          </button>
          {menu === 'filter' && <div className="stock-movement-advanced-filters inventory-report-filters" role="region" aria-label={`Filter ${props.name}`}>
            <div className="stock-movement-filter-heading"><b>Filter {props.name}</b><button type="button" onClick={clear}>Bersihkan</button></div>
            {props.filters}
            <button type="button" className="stock-movement-run-button" disabled={props.applyDisabled} onClick={() => { props.onApply?.(); setMenu(null); filterRef.current?.querySelector('button')?.focus(); }}>{props.applyLabel || 'Tampilkan daftar'}</button>
          </div>}
        </div>
        <ActiveFilterResetButton active={props.filterCount > 0} onReset={clear}/>
      </div>
    </div>
    <div className="stock-movement-action-row">
      <div className="stock-movement-action-left">{props.actions}</div>
      <div className="stock-movement-table-tools">
        {props.tools}
        <div ref={columnsRef} className="stock-movement-column-settings">
          <button type="button" className="stock-movement-tool-button" aria-label={`Atur kolom ${props.name}`} title="Atur kolom yang ditampilkan" aria-expanded={menu === 'columns'} onClick={() => setMenu(menu === 'columns' ? null : 'columns')}><SlidersHorizontal size={18}/></button>
          {menu === 'columns' && <div className="stock-movement-column-menu">{props.columns}</div>}
        </div>
        <div className="inventory-list-search-tools">
          <label className="stock-movement-quick-search"><Search size={17}/><input aria-label={`Cari ${props.name}`} title={props.searchHint} placeholder={props.placeholder} value={props.search} onChange={event => props.onSearch(event.target.value)}/></label>
        <output className="stock-movement-record-count" aria-label="Jumlah hasil">{props.count.toLocaleString('id-ID')}</output>
        </div>
      </div>
    </div>
  </div>;
}

export function InventoryColumnHeader<K extends string>({column, label, sort, onSort, onMove, onResize, onResetWidth, className}: {
  column: K; label: string; sort: TableSort<K>; onSort?: (key: K) => void; onMove: (source: K, target: K) => void;
  onResize?: (event: MouseEvent, key: K) => void; onResetWidth?: (key: K) => void; className?: string;
}) {
  const direction = sort?.key === column ? sort.direction : null;
  return <th className={className} scope="col" aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : undefined}
    draggable onDragStart={event => event.dataTransfer.setData('text/x-inventory-column', column)}
    onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const source = event.dataTransfer.getData('text/x-inventory-column'); if (source) onMove(source as K, column); }}>
    {onSort ? <button type="button" className="stock-movement-header-button" onClick={() => onSort(column)} title={`Urutkan berdasarkan ${label}`}>
      {label}{direction === 'asc' ? <ArrowUp size={13}/> : <ArrowDown size={13} className={direction ? '' : 'stock-movement-sort-hint'}/>}
    </button> : label}
    <GripVertical size={13} className="stock-movement-drag-hint" aria-hidden="true"/>
    {onResize && <span role="separator" aria-label={`Ubah lebar ${label}`} className="inventory-column-resize" onMouseDown={event => onResize(event, column)} onDoubleClick={() => onResetWidth?.(column)}/>}
  </th>;
}

export function useInventoryColumns<K extends string>(storageKey: string, labels: Record<K, string>, widths: Record<K, number>, defaultSort: TableSort<NoInfer<K>> = null) {
  const keys = Object.keys(labels) as K[];
  const layout = useConfigurableTable({ storageKey, defaultOrder: keys, defaultWidths: widths, sortableKeys: keys, defaultSort, inventoryLayout: true });
  const [saved, setSaved] = useState<{key: string; hidden: K[]}>({key: '', hidden: []});
  useEffect(() => {
    let hidden: K[] = [];
    try {
      const value: unknown = JSON.parse(localStorage.getItem(storageKey + ':hidden') || '[]');
      if (Array.isArray(value)) hidden = keys.filter(key => value.includes(key));
    } catch { /* Use the default columns when preferences cannot be read. */ }
    setSaved({key: storageKey, hidden: hidden.length === keys.length ? [] : hidden});
  }, [storageKey]);
  const hidden = saved.key === storageKey ? saved.hidden : [];
  const visible = layout.order.filter(key => !hidden.includes(key));
  const saveHidden = (next: K[]) => {
    setSaved({key: storageKey, hidden: next});
    try { localStorage.setItem(storageKey + ':hidden', JSON.stringify(next)); } catch { /* Keep the in-session preference. */ }
  };
  const menu = <>{layout.order.map(key => <label key={key}><input type="checkbox" checked={!hidden.includes(key)} disabled={visible.length === 1 && visible[0] === key}
    onChange={event => saveHidden(event.target.checked ? hidden.filter(column => column !== key) : [...hidden, key])}/>{labels[key]}</label>)}
    <button type="button" onClick={() => { layout.resetLayout(); saveHidden([]); }}>Kembalikan default</button></>;
  return {...layout, visible, menu, labels};
}

export function useInventoryPage<T>(rows: T[], filterKey: string) {
  const [selection, setSelection] = useState({key: filterKey, page: 1});
  if (selection.key !== filterKey) setSelection({key: filterKey, page: 1});
  const pages = Math.max(1, Math.ceil(rows.length / 100));
  const page = Math.min(selection.key === filterKey ? selection.page : 1, pages);
  const start = (page - 1) * 100;
  const navigation = <div className="stock-movement-pagination inventory-list-pagination">
    <span>{rows.length ? `${start + 1}–${Math.min(start + 100, rows.length)} dari ${rows.length} baris` : '0 baris'}</span>
    <div className="inventory-report-actions"><button type="button" aria-label="Halaman sebelumnya" disabled={page === 1} onClick={() => setSelection({key: filterKey, page: page - 1})}><ChevronLeft size={18}/></button>
      <span>Halaman {page} / {pages}</span><button type="button" aria-label="Halaman berikutnya" disabled={page === pages} onClick={() => setSelection({key: filterKey, page: page + 1})}><ChevronRight size={18}/></button></div>
  </div>;
  return {visibleRows: rows.slice(start, start + 100), navigation};
}

export function InventoryDocumentTable<T extends {id: string}, K extends string>({rows, layout, value, render, empty, filterKey, open, unsortable, printing}: {
  rows: T[]; layout: ReturnType<typeof useInventoryColumns<K>>; value: (row: T, key: K) => string; render: (row: T, key: K) => ReactNode;
  empty: string; filterKey: string; open?: (row: T) => void; unsortable?: NoInfer<K>; printing?: boolean;
}) {
  const {sort, visible, widths} = layout;
  const sorted = sort && sort.key !== unsortable ? [...rows].sort((a, b) => value(a, sort.key).localeCompare(value(b, sort.key), 'id-ID', {numeric: true, sensitivity: 'base'}) * (sort.direction === 'asc' ? 1 : -1)) : rows;
  const {visibleRows, navigation} = useInventoryPage(sorted, JSON.stringify([filterKey, sort]));
  return <><div className="app-table-scroll app-table-scroll--fill inventory-report-table stock-movement-paper inventory-document-table">
    <table style={{minWidth: visible.reduce((sum, key) => sum + widths[key], 0)}}>
      <colgroup>{visible.map(key => <col key={key} style={{width: widths[key]}}/>)}</colgroup>
      <thead><tr>{visible.map(key => <InventoryColumnHeader key={key} column={key} label={layout.labels[key]} sort={sort}
        onSort={key !== unsortable ? layout.toggleSort : undefined} onMove={layout.moveColumn} onResize={layout.beginResize} onResetWidth={layout.resetWidth}/>)}</tr></thead>
      <tbody>{(printing ? sorted : visibleRows).map(row => <tr key={row.id} className={open ? 'cursor-pointer' : undefined} tabIndex={open ? 0 : undefined}
        onKeyDown={event => { if (open && event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); open(row); } }}
        onClick={open ? () => open(row) : undefined}>{visible.map(key => <td key={key}>{render(row, key)}</td>)}</tr>)}</tbody>
    </table>{!rows.length && <p className="inventory-report-empty">{empty}</p>}
  </div>{navigation}</>;
}
