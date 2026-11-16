import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, Printer, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/apiClient';
import { localDateKey } from '../lib/date';
import { stockMovementSource } from '../lib/stockMovementSource';
import { downloadReportCsv, movementLabels, reportDate, reportNumber, type InventoryReportOptions, type StockCardReportData } from '../lib/inventoryReports';
import IndonesianDateInput from '../components/IndonesianDateInput';
import { ReportCard } from './InventoryReport';
import './InventoryReports.css';

export default function StockCardReport() {
  const { currentBranchId, dataUpdatedAt, data, hasPermission } = useApp();
  const [params, setParams] = useSearchParams();
  const [dateFrom, setDateFrom] = useState(() => localDateKey().slice(0, 8) + '01');
  const [dateTo, setDateTo] = useState(localDateKey);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [optionsError, setOptionsError] = useState('');
  const [error, setError] = useState('');
  const [optionsResult, setOptionsResult] = useState<{ branch: string; data: InventoryReportOptions } | null>(null);
  const [result, setResult] = useState<{ key: string; data: StockCardReportData } | null>(null);
  const options = optionsResult?.branch === currentBranchId ? optionsResult.data : null;
  const itemId = params.get('itemId') || '';
  const warehouseId = params.get('warehouseId') || '';
  const validPeriod = Boolean(dateFrom && dateTo && dateFrom <= dateTo);
  const canLoad = Boolean(options && options.items.some(item => item.id === itemId) && options.warehouses.some(warehouse => warehouse.id === warehouseId) && validPeriod);
  const query = new URLSearchParams({ branchId: currentBranchId, itemId, warehouseId, dateFrom, dateTo }).toString();
  const report = result?.key === query && canLoad ? result.data : null;
  const changeFilter = (key: string, value: string) => setParams(previous => {
    const next = new URLSearchParams(previous); if (value) next.set(key, value); else next.delete(key); return next;
  }, { replace: true });

  useEffect(() => {
    let active = true;
    setOptionsResult(null); setOptionsError('');
    void api.get<InventoryReportOptions>(`inventory-reports/options?branchId=${encodeURIComponent(currentBranchId)}`).then(response => {
      if (!active) return;
      if (response.success && response.data) setOptionsResult({ branch: currentBranchId, data: response.data });
      else setOptionsError(response.message || 'Pilihan laporan gagal dimuat.');
    });
    return () => { active = false; };
  }, [currentBranchId, dataUpdatedAt, refresh]);
  useEffect(() => {
    if (!options) return;
    if (!options.warehouses.some(warehouse => warehouse.id === warehouseId)) {
      const first = options.warehouses.length === 1 ? options.warehouses[0].id : '';
      if (warehouseId !== first) setParams(previous => { const next = new URLSearchParams(previous); if (first) next.set('warehouseId', first); else next.delete('warehouseId'); return next; }, { replace: true });
    }
  }, [options, warehouseId, setParams]);
  useEffect(() => {
    let active = true;
    setResult(null); setError(''); setLoading(canLoad);
    if (canLoad) void api.get<StockCardReportData>(`inventory-reports/stock-card?${query}`).then(response => {
      if (!active) return;
      if (response.success && response.data) setResult({ key: query, data: response.data });
      else setError(response.message || 'Kartu stok gagal dimuat.');
      setLoading(false);
    });
    return () => { active = false; };
  }, [query, canLoad, refresh, dataUpdatedAt]);

  const exportCsv = () => {
    if (!report) return;
    downloadReportCsv(`kartu-stok-${report.item.code}.csv`, [
      ['Barang', report.item.code, report.item.name], ['Cabang', report.warehouse.branchName], ['Gudang', report.warehouse.name],
      ['Periode', reportDate(report.dateFrom), reportDate(report.dateTo)], ['Satuan', report.item.unit], [],
      ['Tanggal', 'Nomor Sumber', 'Transaksi', 'Keterangan', 'Masuk', 'Keluar', 'Saldo'],
      [reportDate(report.dateFrom), '', 'Saldo Awal', '', '', '', report.opening],
      ...report.rows.map(row => [reportDate(row.occurredAt || row.createdAt), row.referenceNumber || row.id, movementLabels[row.movementType] || row.movementType, row.notes, row.incoming || 0, row.outgoing || 0, row.balance || 0]),
      [reportDate(report.dateTo), '', 'Saldo Akhir', '', report.incoming, report.outgoing, report.closing],
    ]);
  };
  return <div className="inventory-report app-fill-stack">
    <header className="inventory-report-header"><div><h1>Kartu Stok</h1><p>{report ? `${report.item.code} · ${report.item.name} · ${report.warehouse.name}` : 'Pilih barang, gudang, dan periode untuk melihat mutasi.'}</p>{report && <p>{reportDate(report.dateFrom)} – {reportDate(report.dateTo)} · Satuan: {report.item.unit}</p>}</div>
      <div className="inventory-report-actions print:hidden"><Link className="inventory-report-button" to="/reports">Daftar Laporan</Link><button aria-label="Perbarui kartu stok" onClick={() => setRefresh(value => value + 1)} disabled={loading}><RefreshCw size={17}/></button><button onClick={() => window.print()} disabled={!report}><Printer size={17}/>Cetak</button><button onClick={exportCsv} disabled={!report}><Download size={17}/>CSV</button></div>
    </header>
    <div className="inventory-report-filters print:hidden">
      <label>Barang<select aria-label="Barang kartu stok" value={itemId} onChange={event => changeFilter('itemId', event.target.value)}><option value="">Pilih Barang</option>{options?.items.map(item => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
      <label>Gudang<select aria-label="Gudang kartu stok" value={warehouseId} onChange={event => changeFilter('warehouseId', event.target.value)}><option value="">Pilih Gudang</option>{options?.warehouses.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.branchName} · {warehouse.name}</option>)}</select></label>
      <label>Dari<IndonesianDateInput ariaLabel="Tanggal awal kartu stok" className="inventory-report-date" value={dateFrom} onChange={setDateFrom}/></label>
      <label>Sampai<IndonesianDateInput ariaLabel="Tanggal akhir kartu stok" className="inventory-report-date" value={dateTo} onChange={setDateTo}/></label>
    </div>
    {(error || optionsError || !validPeriod) && <div role="alert" className="inventory-report-error">{optionsError || error || 'Tanggal awal harus sebelum atau sama dengan tanggal akhir.'}</div>}
    <div className="inventory-report-summary"><ReportCard label="Saldo Awal" value={report ? reportNumber(report.opening) : '—'}/><ReportCard label="Masuk" value={report ? reportNumber(report.incoming) : '—'}/><ReportCard label="Keluar" value={report ? reportNumber(report.outgoing) : '—'}/><ReportCard label="Saldo Akhir" value={report ? reportNumber(report.closing) : '—'}/></div>
    <div className="inventory-report-table app-table-scroll" aria-busy={loading}>
      <table><thead><tr><th>Tanggal</th><th>Nomor Sumber</th><th>Transaksi</th><th>Keterangan</th><th className="numeric">Masuk</th><th className="numeric">Keluar</th><th className="numeric">Saldo</th></tr></thead>
        <tbody>{report && <tr className="opening-row"><td>{reportDate(report.dateFrom)}</td><td colSpan={5}>Saldo Awal</td><td className="numeric">{reportNumber(report.opening)}</td></tr>}
          {report?.rows.map(row => {
            const source = stockMovementSource(row, data);
            return <tr key={row.id}><td>{reportDate(row.occurredAt || row.createdAt)}</td><td>{source && hasPermission(source.permission) ? <Link to={source.path}>{row.referenceNumber || row.id}</Link> : row.referenceNumber || row.id}</td><td>{movementLabels[row.movementType] || row.movementType}</td><td>{row.notes || '—'}</td><td className="numeric">{row.incoming ? reportNumber(row.incoming) : '—'}</td><td className="numeric">{row.outgoing ? reportNumber(row.outgoing) : '—'}</td><td className="numeric">{reportNumber(row.balance || 0)}</td></tr>;
          })}</tbody>
        {report && <tfoot><tr><td>{reportDate(report.dateTo)}</td><td colSpan={3}>Saldo Akhir</td><td className="numeric">{reportNumber(report.incoming)}</td><td className="numeric">{reportNumber(report.outgoing)}</td><td className="numeric">{reportNumber(report.closing)}</td></tr></tfoot>}
      </table>
      {!report?.rows.length && <p className="inventory-report-empty">{loading ? 'Memuat kartu stok…' : report ? 'Tidak ada mutasi dalam periode ini.' : 'Pilih barang dan gudang untuk menampilkan kartu stok.'}</p>}
    </div>
  </div>;
}
