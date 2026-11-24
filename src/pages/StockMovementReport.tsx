import DocumentTabBar from '../components/DocumentTabBar';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Download, List, Printer, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { InventoryColumnHeader, InventoryListToolbar } from '../components/InventoryList';
import { api } from '../lib/apiClient';
import { downloadReportCsv, movementLabels, reportDate, reportNumber, type InventoryReportOptions } from '../lib/inventoryReports';
import { stockMovementSource } from '../lib/stockMovementSource';
import {
  filterWarehouseMovements, movementDirections, movementKinds, movementSorts,
  warehouseMovementCsv, warehouseMovementPrintHtml, type WarehouseMovementsReport,
} from '../lib/stockMovementReport';
import './InventoryReports.css';
import './StockMovementReport.css';

const pageSize = 100;
type MovementColumnKey = 'code' | 'item' | 'document' | 'date' | 'description' | 'warehouse' | 'incoming' | 'outgoing' | 'verification';
type ColumnSort = { key: MovementColumnKey; direction: 'asc' | 'desc' } | null;
const defaultMovementColumns: MovementColumnKey[] = ['code', 'item', 'document', 'date', 'description', 'warehouse', 'incoming', 'outgoing', 'verification'];
const movementColumnLabels: Record<MovementColumnKey, string> = {
  code: 'Kode Barang', item: 'Nama Barang', document: 'Nomor Dokumen', date: 'Tanggal',
  description: 'Deskripsi', warehouse: 'Gudang', incoming: 'Masuk', outgoing: 'Keluar', verification: 'Verifikasi',
};

export default function StockMovementReport() {
  const { currentBranchId, dataUpdatedAt, data, hasPermission } = useApp();
  const [params, setParams] = useSearchParams();
  const dateFrom = params.get('dateFrom') || '';
  const dateTo = params.get('dateTo') || '';
  const effectiveDateTo = dateTo || dateFrom;
  const warehouseId = params.get('warehouseId') || '';
  const search = params.get('search') || '';
  const direction = movementDirections.find(([value]) => value === params.get('direction'))?.[0] || 'ALL';
  const type = movementKinds.find(([value]) => value === params.get('type'))?.[0] || 'ALL';
  const verification = ['ALL', 'PENDING', 'VERIFIED'].includes(params.get('verification') || '') ? params.get('verification') || 'ALL' : 'ALL';
  const sort = movementSorts.find(([value]) => value === params.get('sort'))?.[0] || 'date';
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [optionsError, setOptionsError] = useState('');
  const [page, setPage] = useState(1);
  const [optionsResult, setOptionsResult] = useState<{ branchId: string; data: InventoryReportOptions } | null>(null);
  const [result, setResult] = useState<{ key: string; data: WarehouseMovementsReport } | null>(null);
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const [columnSort, setColumnSort] = useState<ColumnSort>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [columns, setColumns] = useState<MovementColumnKey[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('drac_stock_movement_columns') || 'null');
      return Array.isArray(saved) && saved.length === defaultMovementColumns.length
        && saved.every((key: unknown) => defaultMovementColumns.includes(key as MovementColumnKey))
        ? saved as MovementColumnKey[] : defaultMovementColumns;
    } catch { return defaultMovementColumns; }
  });
  const [visibleColumns, setVisibleColumns] = useState<MovementColumnKey[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('drac_stock_movement_visible_columns') || 'null');
      return Array.isArray(saved) && saved.length > 0 && saved.every((key: unknown) => defaultMovementColumns.includes(key as MovementColumnKey))
        ? defaultMovementColumns.filter(key => saved.includes(key)) : defaultMovementColumns;
    } catch { return defaultMovementColumns; }
  });
  const options = optionsResult?.branchId === currentBranchId ? optionsResult.data : null;
  const validPeriod = Boolean(dateFrom && effectiveDateTo && dateFrom <= effectiveDateTo);
  const canLoad = Boolean(options && validPeriod && (!warehouseId || options.warehouses.some(row => row.id === warehouseId)));
  const query = new URLSearchParams({ branchId: currentBranchId, warehouseId, dateFrom, dateTo: effectiveDateTo }).toString();
  const report = canLoad && submittedQuery === query && result?.key === query ? result.data : null;
  const buildQuery = (from: string, to: string, selectedWarehouseId = warehouseId) => new URLSearchParams({
    branchId: currentBranchId,
    warehouseId: selectedWarehouseId,
    dateFrom: from,
    dateTo: to || from,
  }).toString();
  const syncReportForParams = (next: URLSearchParams) => {
    const nextDateFrom = next.get('dateFrom') || '';
    const nextDateTo = next.get('dateTo') || nextDateFrom;
    if (nextDateFrom && nextDateTo && nextDateFrom <= nextDateTo) {
      setSubmittedQuery(buildQuery(nextDateFrom, nextDateTo, next.get('warehouseId') || ''));
      setPage(1);
    } else {
      setSubmittedQuery(null);
    }
  };
  const changeFilter = (key: string, value: string) => {
    // A second filter can change before the router finishes rendering the first.
    // Preserve the latest URL so quick changes do not restore an older filter.
    const next = new URLSearchParams(window.location.search);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
    syncReportForParams(next);
  };
  const changeDateFrom = (value: string) => {
    const currentTo = dateTo && dateTo >= value ? dateTo : '';
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value) next.set('dateFrom', value); else next.delete('dateFrom');
      if (value && currentTo) next.set('dateTo', currentTo); else next.delete('dateTo');
      return next;
    }, { replace: true });
    if (value) {
      setSubmittedQuery(buildQuery(value, currentTo || value));
      setPage(1);
    } else setSubmittedQuery(null);
  };
  const changeDateTo = (value: string) => {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value) next.set('dateTo', value); else next.delete('dateTo');
      return next;
    }, { replace: true });
    if (dateFrom) {
      // Date sampai is an active report parameter: choosing it immediately
      // reloads the same report, just like pressing Refresh.
      setSubmittedQuery(buildQuery(dateFrom, value || dateFrom));
      setPage(1);
      setRefresh(current => current + 1);
    }
  };

  useEffect(() => {
    let active = true;
    setOptionsResult(null); setOptionsError('');
    void api.get<InventoryReportOptions>(`inventory-reports/options?branchId=${encodeURIComponent(currentBranchId)}`).then(response => {
      if (!active) return;
      if (response.success && response.data) setOptionsResult({ branchId: currentBranchId, data: response.data });
      else setOptionsError(response.message || 'Daftar gudang gagal dimuat.');
    });
    return () => { active = false; };
  }, [currentBranchId, dataUpdatedAt]);

  useEffect(() => {
    if (options && warehouseId && !options.warehouses.some(row => row.id === warehouseId)) {
      setParams(previous => { const next = new URLSearchParams(previous); next.delete('warehouseId'); return next; }, { replace: true });
    }
  }, [options, warehouseId, setParams]);

  useEffect(() => {
    let active = true;
    setResult(null); setError('');
    if (!submittedQuery || submittedQuery !== query || !canLoad) { setLoading(false); return () => { active = false; }; }
    setLoading(true);
    void api.get<WarehouseMovementsReport>(`inventory-reports/movements?${query}`).then(response => {
      if (!active) return;
      if (response.success && response.data) setResult({ key: query, data: response.data });
      else setError(response.message || 'Laporan mutasi gagal dimuat.');
      setLoading(false);
    });
    return () => { active = false; };
  }, [query, canLoad, refresh, dataUpdatedAt, submittedQuery]);

  useEffect(() => { localStorage.setItem('drac_stock_movement_columns', JSON.stringify(columns)); }, [columns]);
  useEffect(() => { localStorage.setItem('drac_stock_movement_visible_columns', JSON.stringify(visibleColumns)); }, [visibleColumns]);
  const displayedColumns = columns.filter(key => visibleColumns.includes(key));
  const rows = useMemo(() => {
    const filtered = filterWarehouseMovements(report?.rows || [], { search, direction, type, sort })
      .filter(row => verification === 'ALL' || (verification === 'VERIFIED' ? Boolean(row.verifiedAt) : !row.verifiedAt));
    if (!columnSort) return filtered;
    const value = (row: WarehouseMovementsReport['rows'][number], key: MovementColumnKey): string | number => {
      if (key === 'code') return row.itemCode;
      if (key === 'item') return `${row.itemName} ${row.itemCode}`;
      if (key === 'document') return row.referenceNumber || row.id;
      if (key === 'date') return row.occurredAt || row.createdAt;
      if (key === 'description') return row.notes || movementLabels[row.movementType] || row.movementType;
      if (key === 'warehouse') return `${row.warehouseName} ${row.branchName}`;
      if (key === 'verification') return row.verifiedAt ? 1 : 0;
      return key === 'incoming' ? row.incoming : row.outgoing;
    };
    return [...filtered].sort((a, b) => {
      const left = value(a, columnSort.key); const right = value(b, columnSort.key);
      const compared = typeof left === 'number' && typeof right === 'number'
        ? left - right : String(left).localeCompare(String(right), 'id-ID', { numeric: true, sensitivity: 'base' });
      return columnSort.direction === 'asc' ? compared : -compared;
    });
  }, [report, search, direction, type, sort, verification, columnSort]);
  useEffect(() => { setPage(1); }, [query, search, direction, type, sort, verification, report]);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const busy = loading || (!options && !optionsError);
  const warehouseLabel = warehouseId ? options?.warehouses.find(row => row.id === warehouseId)?.name || '—' : 'Semua Gudang';
  const branchLabel = currentBranchId === 'ALL' ? 'Semua Cabang' : data.branches.find(row => row.id === currentBranchId)?.name || '';
  const filterLabel = [movementDirections.find(([value]) => value === direction)?.[1], movementKinds.find(([value]) => value === type)?.[1],
    `Urutan: ${movementSorts.find(([value]) => value === sort)?.[1]}`, verification !== 'ALL' ? (verification === 'VERIFIED' ? 'Sudah Diverifikasi' : 'Belum Diverifikasi') : '', search.trim() ? `Pencarian: ${search.trim()}` : ''].filter(Boolean).join(' · ');
  const heading = { company: data.settings.company.name || 'DOKTER AC MOBIL', dateFrom, dateTo: effectiveDateTo, warehouse: `${warehouseLabel}${branchLabel ? ` · ${branchLabel}` : ''}`, filters: filterLabel };
  const printReport = () => {
    if (!report || !rows.length) return;
    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    if (!printWindow) { setError('Izinkan jendela cetak pada browser, lalu coba lagi.'); return; }
    printWindow.document.write(warehouseMovementPrintHtml(rows, heading));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };
  const runReport = () => {
    if (!canLoad) return;
    setSubmittedQuery(query);
    setPage(1);
  };
  const refreshReport = () => {
    if (!canLoad) return;
    setSubmittedQuery(query);
    setPage(1);
    setRefresh(value => value + 1);
  };
  const activeFilterCount = [warehouseId, direction !== 'ALL', type !== 'ALL', sort !== 'date', verification !== 'ALL', Boolean(search.trim())].filter(Boolean).length;
  const clearAdditionalFilters = () => {
    const next = new URLSearchParams(window.location.search);
    ['warehouseId', 'direction', 'type', 'sort', 'verification', 'search'].forEach(key => next.delete(key));
    setParams(next, { replace: true });
    syncReportForParams(next);
  };
  const sortColumn = (key: MovementColumnKey) => setColumnSort(current => current?.key === key
    ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' });
  const moveColumn = (source: MovementColumnKey, target: MovementColumnKey) => {
    if (!defaultMovementColumns.includes(source) || source === target) return;
    setColumns(current => {
      const next = [...current]; const from = next.indexOf(source); const to = next.indexOf(target);
      next.splice(from, 1); next.splice(to, 0, source); return next;
    });
  };
  const verifyMovement = async (row: WarehouseMovementsReport['rows'][number]) => {
    if (verifyingId) return;
    setVerifyingId(row.id);
    try {
      const response = await api.update('stock-movement-verifications', row.id, {});
      if (!response.success) { setError(response.message || 'Mutasi gagal diverifikasi.'); return; }
      const verifiedAt = response.data?.verifiedAt || new Date().toISOString();
      const verifiedBy = response.data?.verifiedBy || null;
      setResult(current => current ? { ...current, data: { ...current.data, rows: current.data.rows.map(item => item.id === row.id ? { ...item, verifiedAt, verifiedBy } : item) } } : current);
    } finally { setVerifyingId(null); }
  };
  const renderCell = (row: WarehouseMovementsReport['rows'][number], key: MovementColumnKey) => {
    const source = stockMovementSource(row, data); const number = row.referenceNumber || row.id;
    const label = movementLabels[row.movementType] || row.movementType;
    if (key === 'code') return <td className="stock-movement-code">{row.itemCode}</td>;
    if (key === 'item') return <td className="stock-movement-item">{row.itemName}<small>{row.unit}</small></td>;
    if (key === 'document') return <td className="stock-movement-document">{source && hasPermission(source.permission) ? <Link to={source.path}>{number}</Link> : number}</td>;
    if (key === 'date') return <td className="stock-movement-date">{reportDate(row.occurredAt || row.createdAt)}</td>;
    if (key === 'description') return <td className="stock-movement-description">{row.notes || label}{row.notes && <small>{label}</small>}</td>;
    if (key === 'warehouse') return <td className="stock-movement-warehouse">{row.warehouseName}<small>{row.branchName}</small></td>;
    if (key === 'verification') return <td className="stock-movement-verification">{row.verifiedAt ? <span className="stock-movement-verified" title={`Diverifikasi ${row.verifiedBy || ''} · ${row.verifiedAt}`}><Check size={15}/> V</span> : report && options?.canVerifyMovements ? <button type="button" className="stock-movement-verify-button" disabled={verifyingId === row.id || Boolean(verifyingId)} title="Tandai mutasi sebagai sudah diverifikasi" onClick={event => { event.stopPropagation(); void verifyMovement(row); }}>{verifyingId === row.id ? 'Menyimpan…' : 'Verifikasi'}</button> : <span className="stock-movement-unverified">—</span>}</td>;
    return <td className={`numeric ${row[key === 'incoming' ? 'incoming' : 'outgoing'] ? `stock-movement-${key === 'incoming' ? 'in' : 'out'}` : ''}`}>{reportNumber(row[key === 'incoming' ? 'incoming' : 'outgoing'])}</td>;
  };

  return <div className="app-module-page inventory-list-page inventory-report stock-movement-report">
    <DocumentTabBar label="Tab Mutasi Gudang" activeKey="list"><button type="button" aria-current="page" className="app-child-list-tab" aria-label="Daftar mutasi gudang" title="Daftar mutasi gudang"><List size={19}/></button></DocumentTabBar>
    <div className="app-fill-stack">
      <InventoryListToolbar name="Mutasi Gudang" from={dateFrom} to={dateTo} onFrom={changeDateFrom} onTo={changeDateTo}
        search={search} onSearch={value => changeFilter('search', value)} placeholder="Cari nomor, barang, keterangan…" count={busy ? '—' : rows.length}
        filterCount={activeFilterCount} clearFilters={clearAdditionalFilters} applyLabel="Tampilkan Laporan" onApply={runReport} applyDisabled={!canLoad || busy}
        filters={<><label>Gudang<select aria-label="Gudang mutasi" value={warehouseId} onChange={event => changeFilter('warehouseId', event.target.value)}><option value="">Semua Gudang</option>{options?.warehouses.map(row => <option key={row.id} value={row.id}>{row.branchName} · {row.name}</option>)}</select></label>
        <label>Arah<select aria-label="Arah mutasi" value={direction} onChange={event => changeFilter('direction', event.target.value)}>{movementDirections.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Jenis transaksi<select aria-label="Jenis transaksi mutasi" value={type} onChange={event => changeFilter('type', event.target.value)}>{movementKinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Urutkan<select aria-label="Urutan mutasi" value={sort} onChange={event => changeFilter('sort', event.target.value)}>{movementSorts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Verifikasi<select aria-label="Status verifikasi mutasi" value={verification} onChange={event => changeFilter('verification', event.target.value)}><option value="ALL">Semua Status</option><option value="PENDING">Belum Diverifikasi</option><option value="VERIFIED">Sudah Diverifikasi</option></select></label></>}
        actions={<button type="button" className="stock-movement-tool-button" aria-label="Perbarui laporan mutasi" title="Perbarui laporan mutasi" onClick={refreshReport} disabled={busy || !canLoad}><RefreshCw size={18}/></button>}
        tools={<><button type="button" className="stock-movement-tool-button" aria-label="Cetak mutasi" title="Cetak mutasi" onClick={printReport} disabled={!report || !rows.length}><Printer size={18}/></button>
        <button type="button" className="stock-movement-tool-button" aria-label="Unduh CSV mutasi" title="Unduh CSV mutasi" onClick={() => downloadReportCsv(`mutasi-gudang-${dateFrom}-${effectiveDateTo}.csv`, warehouseMovementCsv(rows, heading))} disabled={!report || !rows.length}><Download size={18}/></button></>} columns={<>{defaultMovementColumns.map(key => <label key={key}><input type="checkbox" checked={visibleColumns.includes(key)} disabled={visibleColumns.length === 1 && visibleColumns.includes(key)} onChange={event => setVisibleColumns(current => event.target.checked ? [...current, key] : current.filter(column => column !== key))}/><span>{movementColumnLabels[key]}</span></label>)}</>}/>
      {(error || optionsError || ((dateFrom || dateTo) && !validPeriod)) && <div role="alert" className="inventory-report-error">{optionsError || error || 'Isi periode yang valid. Tanggal awal harus sebelum atau sama dengan tanggal akhir.'}</div>}
      <section className="inventory-report-table stock-movement-paper app-table-scroll app-table-scroll--fill inventory-list-report-table" aria-busy={busy}>
        <table><thead><tr>{displayedColumns.map(key => <InventoryColumnHeader key={key} column={key} label={movementColumnLabels[key]} sort={columnSort} onSort={sortColumn} onMove={moveColumn} className={key === 'incoming' || key === 'outgoing' ? 'numeric' : ''}/>)}</tr></thead>
          <tbody>{visibleRows.map(row => <tr key={`${row.id}:${row.warehouseId}`}>{displayedColumns.map(key => <Fragment key={key}>{renderCell(row, key)}</Fragment>)}</tr>)}</tbody>
        </table>
        {!rows.length && <p className="inventory-report-empty">{busy ? 'Memuat seluruh mutasi dalam periode ini…' : report ? 'Tidak ada mutasi sesuai periode dan filter yang dipilih.' : 'Pilih parameter lalu klik “Tampilkan Laporan” untuk menjalankan analisa.'}</p>}
      </section>
      <div className="stock-movement-pagination inventory-list-pagination">
        <div>
          <span>{rows.length ? `${reportNumber((currentPage - 1) * pageSize + 1)}–${reportNumber(Math.min(currentPage * pageSize, rows.length))} dari ${reportNumber(rows.length)} baris` : '0 baris'}</span>
          <span className="stock-movement-summary" role="status"> · {busy ? 'Memuat mutasi…' : report ? `${reportNumber(new Set(rows.map(row => row.itemId)).size)} barang · ${reportNumber(new Set(rows.map(row => row.warehouseId)).size)} gudang` : 'Laporan belum tersedia.'}</span>
          <small>Cetak dan CSV mencakup seluruh hasil filter.</small>
        </div>
        <div className="inventory-report-actions"><button type="button" aria-label="Halaman sebelumnya" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18}/></button><span>Halaman {currentPage} / {pageCount}</span><button type="button" aria-label="Halaman berikutnya" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18}/></button></div>
      </div>
    </div>
  </div>;
}
