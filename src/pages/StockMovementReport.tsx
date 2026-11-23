import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, Printer, RefreshCw, Search } from 'lucide-react';
import { useApp } from '../context/AppContext';
import IndonesianDateInput from '../components/IndonesianDateInput';
import { api } from '../lib/apiClient';
import { localDateKey } from '../lib/date';
import { downloadReportCsv, movementLabels, reportDate, reportNumber, type InventoryReportOptions } from '../lib/inventoryReports';
import { stockMovementSource } from '../lib/stockMovementSource';
import {
  filterWarehouseMovements, movementDirections, movementKinds, movementSorts,
  warehouseMovementCsv, warehouseMovementPrintHtml, type WarehouseMovementsReport,
} from '../lib/stockMovementReport';
import './InventoryReports.css';
import './StockMovementReport.css';

const pageSize = 100;

export default function StockMovementReport() {
  const { currentBranchId, dataUpdatedAt, data, hasPermission } = useApp();
  const [params, setParams] = useSearchParams();
  const [defaultToday] = useState(localDateKey);
  const dateFrom = params.get('dateFrom') ?? defaultToday.slice(0, 8) + '01';
  const dateTo = params.get('dateTo') ?? defaultToday;
  const warehouseId = params.get('warehouseId') || '';
  const search = params.get('search') || '';
  const direction = movementDirections.find(([value]) => value === params.get('direction'))?.[0] || 'ALL';
  const type = movementKinds.find(([value]) => value === params.get('type'))?.[0] || 'ALL';
  const sort = movementSorts.find(([value]) => value === params.get('sort'))?.[0] || 'date';
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [optionsError, setOptionsError] = useState('');
  const [page, setPage] = useState(1);
  const [optionsResult, setOptionsResult] = useState<{ branchId: string; data: InventoryReportOptions } | null>(null);
  const [result, setResult] = useState<{ key: string; data: WarehouseMovementsReport } | null>(null);
  const options = optionsResult?.branchId === currentBranchId ? optionsResult.data : null;
  const validPeriod = Boolean(dateFrom && dateTo && dateFrom <= dateTo);
  const canLoad = Boolean(options && validPeriod && (!warehouseId || options.warehouses.some(row => row.id === warehouseId)));
  const query = new URLSearchParams({ branchId: currentBranchId, warehouseId, dateFrom, dateTo }).toString();
  const report = canLoad && result?.key === query ? result.data : null;
  const changeFilter = (key: string, value: string) => {
    // A second filter can change before the router finishes rendering the first.
    // Preserve the latest URL so quick changes do not restore an older filter.
    const next = new URLSearchParams(window.location.search);
    next.set(key, value);
    setParams(next, { replace: true });
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
  }, [currentBranchId, dataUpdatedAt, refresh]);

  useEffect(() => {
    if (options && warehouseId && !options.warehouses.some(row => row.id === warehouseId)) {
      setParams(previous => { const next = new URLSearchParams(previous); next.delete('warehouseId'); return next; }, { replace: true });
    }
  }, [options, warehouseId, setParams]);

  useEffect(() => {
    let active = true;
    setResult(null); setError(''); setLoading(canLoad);
    if (canLoad) void api.get<WarehouseMovementsReport>(`inventory-reports/movements?${query}`).then(response => {
      if (!active) return;
      if (response.success && response.data) setResult({ key: query, data: response.data });
      else setError(response.message || 'Laporan mutasi gagal dimuat.');
      setLoading(false);
    });
    return () => { active = false; };
  }, [query, canLoad, refresh, dataUpdatedAt]);

  const rows = useMemo(() => filterWarehouseMovements(report?.rows || [], { search, direction, type, sort }), [report, search, direction, type, sort]);
  useEffect(() => { setPage(1); }, [query, search, direction, type, sort, report]);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const busy = loading || (!options && !optionsError);
  const warehouseLabel = warehouseId ? options?.warehouses.find(row => row.id === warehouseId)?.name || '—' : 'Semua Gudang';
  const branchLabel = currentBranchId === 'ALL' ? 'Semua Cabang' : data.branches.find(row => row.id === currentBranchId)?.name || '';
  const filterLabel = [movementDirections.find(([value]) => value === direction)?.[1], movementKinds.find(([value]) => value === type)?.[1],
    `Urutan: ${movementSorts.find(([value]) => value === sort)?.[1]}`, search.trim() ? `Pencarian: ${search.trim()}` : ''].filter(Boolean).join(' · ');
  const heading = { company: data.settings.company.name || 'DOKTER AC MOBIL', dateFrom, dateTo, warehouse: `${warehouseLabel}${branchLabel ? ` · ${branchLabel}` : ''}`, filters: filterLabel };
  const printReport = () => {
    if (!report || !rows.length) return;
    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    if (!printWindow) { setError('Izinkan jendela cetak pada browser, lalu coba lagi.'); return; }
    printWindow.document.write(warehouseMovementPrintHtml(rows, heading));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return <div className="inventory-report stock-movement-report app-fill-stack">
    <div className="stock-movement-toolbar">
      <p>Seluruh barang yang masuk dan keluar pada periode terpilih.</p>
      <div className="inventory-report-actions">
        <Link className="inventory-report-button" to="/reports">Daftar Laporan</Link>
        <button type="button" aria-label="Perbarui mutasi" onClick={() => setRefresh(value => value + 1)} disabled={busy}><RefreshCw size={17}/></button>
        <button type="button" onClick={printReport} disabled={!report || !rows.length}><Printer size={17}/>Cetak</button>
        <button type="button" onClick={() => downloadReportCsv(`mutasi-per-gudang-${dateFrom}-${dateTo}.csv`, warehouseMovementCsv(rows, heading))} disabled={!report || !rows.length}><Download size={17}/>CSV</button>
      </div>
    </div>
    <div className="inventory-report-filters">
      <label>Dari<IndonesianDateInput ariaLabel="Tanggal awal mutasi" className="inventory-report-date" value={dateFrom} onChange={value => changeFilter('dateFrom', value)}/></label>
      <label>Sampai<IndonesianDateInput ariaLabel="Tanggal akhir mutasi" className="inventory-report-date" value={dateTo} onChange={value => changeFilter('dateTo', value)}/></label>
      <label>Gudang<select aria-label="Gudang mutasi" value={warehouseId} onChange={event => changeFilter('warehouseId', event.target.value)}><option value="">Semua Gudang</option>{options?.warehouses.map(row => <option key={row.id} value={row.id}>{row.branchName} · {row.name}</option>)}</select></label>
      <label>Arah<select aria-label="Arah mutasi" value={direction} onChange={event => changeFilter('direction', event.target.value)}>{movementDirections.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Jenis transaksi<select aria-label="Jenis transaksi mutasi" value={type} onChange={event => changeFilter('type', event.target.value)}>{movementKinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Urutkan<select aria-label="Urutan mutasi" value={sort} onChange={event => changeFilter('sort', event.target.value)}>{movementSorts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="inventory-report-search"><Search size={17}/><input aria-label="Cari mutasi" placeholder="Cari kode, barang, nomor dokumen, deskripsi…" value={search} onChange={event => changeFilter('search', event.target.value)}/></label>
    </div>
    {(error || optionsError || !validPeriod) && <div role="alert" className="inventory-report-error">{optionsError || error || 'Isi periode yang valid. Tanggal awal harus sebelum atau sama dengan tanggal akhir.'}</div>}
    <div className="stock-movement-summary" role="status">{busy ? 'Memuat mutasi…' : report ? `${reportNumber(rows.length)} baris mutasi · ${reportNumber(new Set(rows.map(row => row.itemId)).size)} barang · ${reportNumber(new Set(rows.map(row => row.warehouseId)).size)} gudang` : 'Laporan belum tersedia.'}</div>
    <section className="inventory-report-table stock-movement-paper app-table-scroll" aria-busy={busy}>
      <header className="stock-movement-heading"><p>{heading.company}</p><h1>Mutasi per Gudang</h1><p>Dari {reportDate(dateFrom)} s/d {reportDate(dateTo)}</p><div className="stock-movement-meta"><span><b>Gudang:</b> {heading.warehouse}</span><span>{filterLabel}</span></div></header>
      <table><thead><tr><th>Kode Barang</th><th>Nama Barang</th><th>Nomor Dokumen</th><th>Tanggal</th><th>Deskripsi</th><th>Gudang</th><th className="numeric">Masuk</th><th className="numeric">Keluar</th></tr></thead>
        <tbody>{visibleRows.map(row => {
          const source = stockMovementSource(row, data);
          const number = row.referenceNumber || row.id;
          const label = movementLabels[row.movementType] || row.movementType;
          return <tr key={`${row.id}:${row.warehouseId}`}>
            <td className="stock-movement-code">{row.itemCode}</td>
            <td className="stock-movement-item">{row.itemName}<small>{row.unit}</small></td>
            <td className="stock-movement-document">{source && hasPermission(source.permission) ? <Link to={source.path}>{number}</Link> : number}</td>
            <td className="stock-movement-date">{reportDate(row.occurredAt || row.createdAt)}</td>
            <td className="stock-movement-description">{row.notes || label}{row.notes && <small>{label}</small>}</td>
            <td className="stock-movement-warehouse">{row.warehouseName}<small>{row.branchName}</small></td>
            <td className={`numeric ${row.incoming ? 'stock-movement-in' : ''}`}>{reportNumber(row.incoming)}</td>
            <td className={`numeric ${row.outgoing ? 'stock-movement-out' : ''}`}>{reportNumber(row.outgoing)}</td>
          </tr>;
        })}</tbody>
      </table>
      {!rows.length && <p className="inventory-report-empty">{busy ? 'Memuat seluruh mutasi dalam periode ini…' : report ? 'Tidak ada mutasi sesuai periode dan filter yang dipilih.' : 'Laporan belum tersedia. Periksa periode atau perbarui laporan.'}</p>}
    </section>
    <div className="stock-movement-pagination">
      <span>{rows.length ? `${reportNumber((currentPage - 1) * pageSize + 1)}–${reportNumber(Math.min(currentPage * pageSize, rows.length))} dari ${reportNumber(rows.length)} baris` : '0 baris'}<small>Cetak dan CSV mencakup seluruh hasil filter.</small></span>
      <div className="inventory-report-actions"><button type="button" aria-label="Halaman sebelumnya" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18}/></button><span>Halaman {currentPage} / {pageCount}</span><button type="button" aria-label="Halaman berikutnya" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18}/></button></div>
    </div>
  </div>;
}
