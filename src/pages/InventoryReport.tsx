import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, Printer, RefreshCw, Search } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/apiClient';
import { downloadReportCsv, inventoryBalanceCsv, matchesStockAvailability, reportMoney, reportNumber, stockAvailability, type InventoryBalancesReport } from '../lib/inventoryReports';
import './InventoryReports.css';

export default function InventoryReport() {
  const { currentBranchId, dataUpdatedAt } = useApp();
  const [params, setParams] = useSearchParams();
  const availability = params.get('availability') || 'ALL';
  const warehouseId = params.get('warehouseId') || '';
  const [search, setSearch] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState<{ branchId: string; report: InventoryBalancesReport } | null>(null);
  const report = loaded?.branchId === currentBranchId ? loaded.report : null;
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setLoaded(null);
    void api.get<InventoryBalancesReport>(`inventory-reports/balances?branchId=${encodeURIComponent(currentBranchId)}`).then(response => {
      if (!active) return;
      if (response.success && response.data) setLoaded({ branchId: currentBranchId, report: response.data });
      else setError(response.message || 'Laporan persediaan gagal dimuat.');
      setLoading(false);
    });
    return () => { active = false; };
  }, [currentBranchId, dataUpdatedAt, refresh]);
  useEffect(() => {
    if (report && warehouseId && !report.warehouses.some(warehouse => warehouse.id === warehouseId)) {
      setParams(previous => { const next = new URLSearchParams(previous); next.delete('warehouseId'); return next; }, { replace: true });
    }
  }, [report, warehouseId, setParams]);
  const changeFilter = (key: string, value: string) => setParams(previous => {
    const next = new URLSearchParams(previous); if (value) next.set(key, value); else next.delete(key); return next;
  }, { replace: true });
  const rows = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('id-ID');
    return (report?.rows || []).filter(row => (!warehouseId || row.warehouseId === warehouseId)
      && matchesStockAvailability(row.quantity, availability)
      && `${row.code} ${row.name} ${row.categoryName} ${row.branchName} ${row.warehouseName}`.toLocaleLowerCase('id-ID').includes(keyword));
  }, [report, warehouseId, availability, search]);
  const canViewCosts = Boolean(report?.canViewCosts);
  const itemCount = new Set(rows.map(row => row.itemId)).size;
  const warehouseCount = new Set(rows.map(row => row.warehouseId)).size;
  const filterLabel = stockAvailability.find(([value]) => value === availability)?.[1] || 'Semua Stok';
  return <div className="inventory-report app-fill-stack">
    <header className="inventory-report-header">
      <div><h1>Stok per Gudang</h1><p>Saldo saat ini untuk setiap barang dan gudang · {filterLabel}</p></div>
      <div className="inventory-report-actions print:hidden">
        <Link className="inventory-report-button" to="/reports">Daftar Laporan</Link>
        <button onClick={() => setRefresh(value => value + 1)} disabled={loading} aria-label="Perbarui laporan"><RefreshCw size={17}/></button>
        <button onClick={() => window.print()} disabled={!rows.length}><Printer size={17}/>Cetak</button>
        <button onClick={() => downloadReportCsv('stok-per-gudang.csv', inventoryBalanceCsv(rows, canViewCosts))} disabled={!rows.length}><Download size={17}/>CSV</button>
      </div>
    </header>
    {error && <div role="alert" className="inventory-report-error">{error}</div>}
    <div className="inventory-report-summary">
      <ReportCard label="Barang" value={String(itemCount)} note={`${warehouseCount} gudang · ${rows.length} baris`}/>
      <ReportCard label="Stok Kosong" value={String(rows.filter(row => row.quantity === 0).length)} note="barang / gudang"/>
      <ReportCard label="Stok Minus" value={String(rows.filter(row => row.quantity < 0).length)} note="barang / gudang"/>
      {canViewCosts && <ReportCard label="Nilai Stok (Average)" value={reportMoney(rows.reduce((total, row) => total + (row.inventoryValue || 0), 0))} note="sesuai baris yang ditampilkan"/>}
    </div>
    <div className="inventory-report-filters print:hidden">
      <label className="inventory-report-search"><Search size={17}/><input aria-label="Cari barang atau gudang" placeholder="Cari kode, nama barang, kategori, gudang…" value={search} onChange={event => setSearch(event.target.value)}/></label>
      <label>Gudang<select aria-label="Filter gudang" value={warehouseId} onChange={event => changeFilter('warehouseId', event.target.value)}><option value="">Semua Gudang</option>{report?.warehouses.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.branchName} · {warehouse.name}</option>)}</select></label>
      <label>Ketersediaan<select aria-label="Filter ketersediaan stok" value={availability} onChange={event => changeFilter('availability', event.target.value)}>{stockAvailability.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    <div className="inventory-report-table app-table-scroll" aria-busy={loading}>
      <table><thead><tr><th>Kode</th><th>Barang</th><th>Cabang</th><th>Gudang</th><th className="numeric">Stok</th><th>Satuan</th>{canViewCosts && <><th className="numeric">HPP Average</th><th className="numeric">Nilai Stok</th></>}</tr></thead>
        <tbody>{rows.map(row => <tr key={`${row.warehouseId}:${row.itemId}`}><td>{row.code}</td><td><Link to={`/reports/stock-card?itemId=${encodeURIComponent(row.itemId)}&warehouseId=${encodeURIComponent(row.warehouseId)}`} title="Lihat kartu stok">{row.name}</Link></td><td>{row.branchName}</td><td>{row.warehouseName}</td><td className={`numeric ${row.quantity < 0 ? 'text-red-700 font-semibold' : ''}`}>{reportNumber(row.quantity)}</td><td>{row.unit}</td>{canViewCosts && <><td className="numeric">{reportMoney(row.averageCost || 0, 4)}</td><td className="numeric">{reportMoney(row.inventoryValue || 0)}</td></>}</tr>)}</tbody>
      </table>
      {!rows.length && <p className="inventory-report-empty">{loading ? 'Memuat laporan…' : error ? 'Laporan belum tersedia.' : 'Tidak ada barang sesuai filter.'}</p>}
    </div>
  </div>;
}

export function ReportCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="inventory-report-card"><p>{label}</p><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}
