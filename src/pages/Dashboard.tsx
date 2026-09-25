import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Activity, ArrowRight, Banknote, CalendarDays, Info, Landmark, RefreshCw, RotateCcw, Target, TrendingUp, Wallet } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/apiClient';
import { useMinuteClock } from '../hooks/useMinuteClock';
import { buildWorkOrderAttentionItems, countWorkOrderAttentionByKind } from '../lib/workOrderAttention';
import { buildDashboardMetrics, dashboardDays, getDashboardRange, getDashboardComparisonRange, isDashboardRangeValid, type DashboardPeriod, type DashboardComparison, type DashboardRange } from '../lib/dashboardMetrics';
import type { BranchMonthlyTargets } from '../lib/branchPerformance';
import { SummaryCard, ActionCard, SectionTitle, SalesChart, BranchTable, Unavailable, SalesChange, money, compact, shortDate, rangeLabel, panelClass } from '../components/DashboardPanels';

type Payment = { id: string; date: string; amount: number; paymentMethod: string; branchId: string };
type Account = { id: string; name: string; accountType: string; branchId?: string; balance: number; isActive: boolean };
type Deposit = { branchId: string; unsubmitted: number };
type Finance = { payments: Payment[] | null; accounts: Account[] | null; deposits: Deposit[] | null; targets: BranchMonthlyTargets | null; errors: string[] };
const emptyFinance: Finance = { payments: null, accounts: null, deposits: null, targets: null, errors: [] };
const periods: Array<{ value: DashboardPeriod; label: string }> = [
  { value: 'today', label: 'Hari ini' }, { value: 'yesterday', label: 'Kemarin' }, { value: 'last7', label: '7 hari' },
  { value: 'thisMonth', label: 'Bulan ini' }, { value: 'lastMonth', label: 'Bulan lalu' }, { value: 'custom', label: 'Pilih tanggal' },
];
const fieldClass = 'h-10 min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

export default function Dashboard() {
  const { data, currentUser, currentBranchId, setCurrentBranchId, hasPermission, hasLoadedData, isLoading, dataLoadError, dataUpdatedAt, refreshData } = useApp();
  const clock = useMinuteClock();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar', year: 'numeric', month: '2-digit', day: '2-digit' }).format(clock);
  const [searchParams, setSearchParams] = useSearchParams();
  const period = periods.find(item => item.value === searchParams.get('period'))?.value || 'thisMonth';
  const comparison: DashboardComparison = searchParams.get('compare') === 'none' ? 'none' : searchParams.get('compare') === 'lastYear' ? 'lastYear' : 'previous';
  const requestedRange = { from: searchParams.get('from') || `${today.slice(0, 7)}-01`, to: searchParams.get('to') || today };
  const proposedRange = getDashboardRange(period, today, requestedRange);
  const invalidRange = !isDashboardRangeValid(proposedRange, today);
  const range = invalidRange ? getDashboardRange('thisMonth', today, requestedRange) : proposedRange;
  const comparisonRange = getDashboardComparisonRange(range, comparison, invalidRange ? 'thisMonth' : period);
  const [draft, setDraft] = useState(requestedRange);
  const [rangeError, setRangeError] = useState('');
  const [finance, setFinance] = useState<Finance>(emptyFinance);
  const [financeLoading, setFinanceLoading] = useState(false);
  const requestId = useRef(0);
  const privileged = Boolean(currentUser?.isOwner || currentUser?.roleName?.toLowerCase() === 'administrator');
  const canViewFinancial = privileged || hasPermission('report:view');
  const canUseInvoiceData = privileged || hasPermission('invoice:view') || hasPermission('payment:view');
  const canViewPayments = hasPermission('payment:view');
  const canViewWorkOrders = hasPermission('wo:view');
  const canViewBranchPerformance = canViewFinancial && canUseInvoiceData;
  const dataReady = hasLoadedData && Boolean(dataUpdatedAt) && !dataLoadError;
  const invoicesReady = dataReady && canUseInvoiceData;
  const pending = !hasLoadedData || (isLoading && !dataUpdatedAt);
  const currentMonth = range.from === `${today.slice(0, 7)}-01` && range.to === today;

  const loadFinance = useCallback(async () => {
    const id = ++requestId.current;
    if (!canViewFinancial) { setFinance(emptyFinance); setFinanceLoading(false); return; }
    setFinanceLoading(true);
    const [payments, accounts, deposits, targets] = await Promise.all([
      canViewPayments ? api.get('customer-payments') : Promise.resolve(null),
      api.get('cash-accounts'), api.get('branch-deposits'),
      canUseInvoiceData ? api.get('branch-targets') : Promise.resolve(null),
    ]);
    if (id !== requestId.current) return;
    const validPayments = payments?.success && Array.isArray(payments.data);
    const validAccounts = accounts.success && Array.isArray(accounts.data);
    const validDeposits = deposits.success && Array.isArray(deposits.data?.summary);
    const validTargets = targets?.success && targets.data && ['PERINTIS', 'CAKALANG', 'MAMUJU'].every(key => targets.data[key] !== null && Number.isFinite(Number(targets.data[key])) && Number(targets.data[key]) >= 0);
    setFinance({
      payments: validPayments ? payments.data : null, accounts: validAccounts ? accounts.data : null,
      deposits: validDeposits ? deposits.data.summary : null, targets: validTargets ? targets.data : null,
      errors: [canViewPayments && !validPayments ? 'pembayaran pelanggan' : '', !validAccounts ? 'saldo rekening' : '', !validDeposits ? 'setoran cabang' : '', canUseInvoiceData && !validTargets ? 'target cabang' : ''].filter(Boolean),
    });
    setFinanceLoading(false);
  }, [currentUser?.id, canViewFinancial, canViewPayments, canUseInvoiceData]);
  useEffect(() => { void loadFinance(); return () => { requestId.current += 1; }; }, [loadFinance]);
  useEffect(() => { setDraft({ from: range.from, to: range.to }); }, [range.from, range.to]);

  const metrics = useMemo(() => buildDashboardMetrics({
    branches: data.branches, invoices: data.invoices, workOrders: data.workOrders,
    payments: canViewPayments ? finance.payments || [] : [], targets: finance.targets, branchId: currentBranchId, range, comparisonRange, today,
  }), [data.branches, data.invoices, data.workOrders, finance.payments, finance.targets, canViewPayments, currentBranchId, range.from, range.to, comparisonRange?.from, comparisonRange?.to, today]);
  const branchIds = new Set(metrics.rows.map(row => row.branchId));
  const visibleWOs = data.workOrders.filter(row => branchIds.has(row.branchId) && row.date.slice(0, 10) <= today);
  const visibleInvoices = data.invoices.filter(row => branchIds.has(row.branchId) && row.date.slice(0, 10) <= today);
  const attentionItems = buildWorkOrderAttentionItems(visibleWOs, visibleInvoices, today, clock);
  const attentionCounts = countWorkOrderAttentionByKind(attentionItems);
  const agedInvoices = visibleInvoices.filter(row => Number(row.total) > Number(row.payment) && Number(row.age) >= 8);
  const agedBalance = agedInvoices.reduce((sum, row) => sum + Math.max(0, Number(row.total) - Number(row.payment)), 0);
  const unsubmitted = finance.deposits?.filter(row => branchIds.has(row.branchId)).reduce((sum, row) => sum + Number(row.unsubmitted || 0), 0) ?? null;
  // Rekening pusat hanya dihitung pada Semua Cabang, bukan di setiap cabang.
  const accounts = finance.accounts?.filter(row => row.isActive && (row.branchId ? branchIds.has(row.branchId) : currentBranchId === 'ALL'));
  const cashAccounts = accounts?.filter(row => row.accountType === 'cash');
  const bankAccounts = accounts?.filter(row => row.accountType !== 'cash');
  const branchName = currentBranchId === 'ALL' ? 'Semua Cabang' : data.branches.find(row => row.id === currentBranchId)?.name.replace(/^CABANG\s+/i, '') || 'Cabang';
  const unavailable = pending ? 'Memuat…' : 'Belum tersedia';
  const refreshing = isLoading || financeLoading;
  const link = (path: string, params: Record<string, string> = {}, usePeriod = true) => `${path}?${new URLSearchParams({ source: 'dashboard', ...(usePeriod ? { from: range.from, to: range.to } : {}), ...params })}`;
  const invoiceLink = hasPermission('invoice:view') ? link('/invoices') : undefined;
  const receivableLink = hasPermission('invoice:view') ? link('/invoices', { to: today, status: 'Belum Lunas' }, false) : undefined;
  const updateFilters = (nextPeriod: DashboardPeriod, nextComparison = comparison, dates: DashboardRange = range) => {
    const next = new URLSearchParams(searchParams);
    next.set('period', nextPeriod); next.set('compare', nextComparison);
    if (nextPeriod === 'custom') { next.set('from', dates.from); next.set('to', dates.to); }
    else { next.delete('from'); next.delete('to'); }
    setSearchParams(next, { replace: true }); setRangeError('');
  };
  const applyCustom = () => {
    if (!isDashboardRangeValid(draft, today)) { setRangeError('Pilih tanggal yang valid, maksimal 366 hari, dengan tanggal akhir tidak melewati hari ini.'); return; }
    updateFilters('custom', comparison, draft);
  };
  const updatedLabel = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar' }) + ' WITA' : 'Belum diperbarui';

  return <div className="mx-auto w-full max-w-[1600px] space-y-4 pb-6" data-dashboard-management>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-700"><Activity className="h-3.5 w-3.5" />Ringkasan manajemen</div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Dashboard <span className="font-normal text-slate-400">/</span> <span className="font-semibold">{branchName}</span></h1>
        <p className="mt-1 text-sm text-slate-500">Hasil usaha, posisi uang, dan prioritas tindak lanjut.</p></div>
      <div className="flex items-center gap-3"><span className="text-right text-xs text-slate-500">Transaksi diperbarui<br /><span className="font-medium text-slate-700">{updatedLabel}</span></span>
        <button type="button" aria-label="Perbarui dashboard" disabled={refreshing} onClick={() => { void Promise.all([refreshData(), loadFinance()]); }} className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:border-blue-400 hover:text-blue-700 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /></button></div>
    </header>
    <section className={`${panelClass} p-4`} aria-label="Filter dashboard">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="Periode dashboard">{periods.map(item => <button key={item.value} type="button" aria-pressed={period === item.value} onClick={() => updateFilters(item.value)} className={`min-h-9 rounded-md px-3 text-xs font-medium transition-colors sm:text-sm ${period === item.value ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:bg-white/70'}`}>{item.label}</button>)}</div>
        <div className="flex w-full items-center gap-2 sm:w-auto"><label htmlFor="dashboard-comparison" className="sr-only text-xs font-medium text-slate-500 sm:not-sr-only">Bandingkan</label><select id="dashboard-comparison" value={comparison} onChange={event => updateFilters(period, event.target.value as DashboardComparison)} className={`${fieldClass} flex-1 sm:flex-none`}><option value="previous">Periode sebelumnya</option><option value="lastYear">Periode sama tahun lalu</option><option value="none">Tanpa pembanding</option></select><button type="button" aria-label="Reset filter dashboard" onClick={() => updateFilters('thisMonth', 'previous')} className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><RotateCcw className="h-4 w-4" /></button></div>
      </div>
      {period === 'custom' && <form onSubmit={event => { event.preventDefault(); applyCustom(); }} className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3"><label className="grid min-w-0 gap-1 text-xs font-medium text-slate-600">Dari tanggal<input type="date" aria-label="Tanggal awal dashboard" value={draft.from} max={draft.to || today} onChange={event => setDraft(value => ({ ...value, from: event.target.value }))} className={fieldClass} required /></label><label className="grid min-w-0 gap-1 text-xs font-medium text-slate-600">Sampai tanggal<input type="date" aria-label="Tanggal akhir dashboard" value={draft.to} min={draft.from} max={today} onChange={event => setDraft(value => ({ ...value, to: event.target.value }))} className={fieldClass} required /></label><button className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700" type="submit">Terapkan</button></form>}
      {(rangeError || invalidRange) && <p role="alert" className="mt-2 text-xs text-red-700">{rangeError || 'Rentang tanggal tidak valid. Ringkasan menampilkan bulan ini sampai filter diperbaiki.'}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500"><span className="inline-flex items-center gap-1.5 font-medium text-slate-700"><CalendarDays className="h-3.5 w-3.5" />{rangeLabel(range)} <span className="font-normal text-slate-400">· {dashboardDays(range)} hari</span></span>{comparisonRange && <span>Pembanding: {rangeLabel(comparisonRange)} · {dashboardDays(comparisonRange)} hari</span>}</div>
    </section>
    {(dataLoadError || finance.errors.length > 0) && <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><Info className="mt-0.5 h-4 w-4 flex-shrink-0" /><span>{dataLoadError ? 'Data transaksi belum berhasil diperbarui. ' : ''}{finance.errors.length > 0 ? `Data ${finance.errors.join(', ')} belum tersedia. ` : ''}Gunakan tombol perbarui untuk mencoba lagi.</span></div>}
    {canViewFinancial && <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Angka utama">
      <SummaryCard label="Omzet" icon={<TrendingUp className="h-4 w-4" />} value={invoicesReady ? money(metrics.sales) : unavailable} shortValue={invoicesReady ? compact(metrics.sales) : undefined} scope="Periode terpilih" to={invoiceLink} accent>
        {invoicesReady && <><p>{metrics.invoiceCount} faktur · rata-rata {compact(metrics.averageInvoice)}</p><SalesChange value={metrics.sales} previous={metrics.previousSales} /></>}
      </SummaryCard>
      <SummaryCard label="Target tercapai" icon={<Target className="h-4 w-4" />} value={invoicesReady && metrics.achievementPercent !== null ? `${metrics.achievementPercent.toLocaleString('id-ID')}%` : pending || financeLoading ? 'Memuat…' : currentMonth ? 'Belum tersedia' : '—'} scope="Target bulan berjalan">
        {invoicesReady && metrics.target !== null ? <><div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Pencapaian target omzet" aria-valuenow={Math.min(100, metrics.achievementPercent || 0)} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, metrics.achievementPercent || 0)}%` }} /></div><p>Dari target {compact(metrics.target)}</p></> : <p>{currentMonth ? 'Target seluruh cabang pilihan harus tersedia.' : 'Pilih Bulan ini untuk melihat target.'}</p>}
      </SummaryCard>
      <SummaryCard label="Pembayaran diterima" icon={<Banknote className="h-4 w-4" />} value={dataReady && canViewPayments && finance.payments !== null ? money(metrics.receipts) : !canViewPayments ? 'Akses terbatas' : financeLoading ? 'Memuat…' : unavailable} shortValue={dataReady && canViewPayments && finance.payments !== null ? compact(metrics.receipts) : undefined} scope="Tanggal pembayaran" to={canViewPayments ? link('/customer-payments') : undefined}>
        {dataReady && canViewPayments && finance.payments !== null ? <><p>Tunai {compact(metrics.cash)}</p><p>Non-tunai {compact(metrics.nonCash)}</p></> : <p>{canViewPayments ? 'Penerimaan pelanggan dalam periode pilihan.' : 'Memerlukan akses pembayaran pelanggan.'}</p>}
      </SummaryCard>
      <SummaryCard label="Total piutang" icon={<Wallet className="h-4 w-4" />} value={invoicesReady ? money(metrics.receivable) : unavailable} shortValue={invoicesReady ? compact(metrics.receivable) : undefined} scope="Saldo saat ini · semua periode" to={receivableLink}>
        {invoicesReady && <><p>{metrics.receivableCount} faktur belum lunas</p><p className={agedBalance > 0 ? 'font-medium text-amber-700' : ''}>{compact(agedBalance)} berumur &gt;7 hari</p></>}
      </SummaryCard>
    </section>}
    <section className={`${panelClass} p-4 sm:p-5`} aria-label="Prioritas tindakan">
      <SectionTitle title="Perlu tindakan" subtitle="Kondisi saat ini · termasuk pekerjaan dan tagihan dari periode sebelumnya" aside={<span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">{shortDate(today)}</span>} />
      <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-5">
        {canViewWorkOrders && <>
          <ActionCard label="Register mengambang" value={dataReady ? `${attentionCounts.register} WO` : unavailable} note="Tentukan tindak lanjut" warning={dataReady && attentionCounts.register > 0} available={dataReady} to={link('/workorders', { attentionKind: 'register' }, false)} />
          <ActionCard label="Pekerjaan terlambat" value={dataReady ? `${attentionCounts.process} WO` : unavailable} note="Periksa proses dan estimasi" warning={dataReady && attentionCounts.process > 0} available={dataReady} to={link('/workorders', { attentionKind: 'process' }, false)} />
          {canUseInvoiceData && <ActionCard label="Selesai belum faktur" value={invoicesReady ? `${attentionCounts.invoice} WO` : unavailable} note="Perlu penyelesaian penagihan" warning={invoicesReady && attentionCounts.invoice > 0} available={invoicesReady} to={link('/workorders', { attentionKind: 'invoice' }, false)} />}
        </>}
        {canViewBranchPerformance && <ActionCard label="Belum lunas >7 hari" value={invoicesReady ? `${agedInvoices.length} faktur` : unavailable} note={invoicesReady ? money(agedBalance) : 'Saldo saat ini'} warning={invoicesReady && agedInvoices.length > 0} available={invoicesReady} to={hasPermission('invoice:view') ? link('/invoices', { to: today, status: 'Belum Lunas', minAge: '8' }, false) : undefined} />}
        {canViewFinancial && <ActionCard label="Tunai belum disetor" value={dataReady && unsubmitted !== null ? compact(unsubmitted) : financeLoading ? 'Memuat…' : unavailable} note="Saldo saat ini · semua periode" warning={dataReady && unsubmitted !== null && unsubmitted > 0} available={dataReady && unsubmitted !== null} to="/branch-deposits" />}
      </div>
    </section>
    {canViewBranchPerformance && <section className={panelClass} id="dashboard-branches">
      <div className="p-4 sm:p-5"><SectionTitle title={currentBranchId === 'ALL' ? 'Performa cabang' : `Performa ${branchName}`} subtitle={`Realisasi berdasarkan tanggal faktur · ${rangeLabel(range)}`} aside={<span className="text-xs font-medium text-slate-500">{metrics.rows.length} cabang</span>} /></div>
      {!invoicesReady ? <Unavailable loading={pending} /> : <>
        {!currentMonth && <p className="mx-4 mb-4 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600"><Info className="h-4 w-4 flex-shrink-0" />Target dan estimasi ditampilkan untuk bulan berjalan. Target historis belum tersedia.</p>}
        <BranchTable metrics={metrics} onBranch={setCurrentBranchId} />
        {currentMonth && <p className="border-t border-slate-100 px-5 py-3 text-[11px] leading-relaxed text-slate-500">Estimasi memakai rata-rata omzet per hari kalender, bukan pendapatan yang sudah pasti. Tanda — berarti target belum tersedia atau belum ditetapkan.</p>}
      </>}
    </section>}
    <div className={`grid gap-4 ${canViewBranchPerformance && canViewWorkOrders ? 'xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]' : ''}`}>
      {canViewBranchPerformance && <section className={`${panelClass} p-4 sm:p-5`}>
        <SectionTitle title="Tren omzet" subtitle={`${metrics.trendUnit === 'week' ? 'Per kelompok 7 hari' : 'Harian'} · berdasarkan tanggal faktur`} aside={invoiceLink && <Link to={invoiceLink} className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-blue-700">Lihat faktur<ArrowRight className="h-3.5 w-3.5" /></Link>} />
        {invoicesReady ? <SalesChart metrics={metrics} range={range} comparisonRange={comparisonRange} canOpenInvoices={hasPermission('invoice:view')} /> : <Unavailable loading={pending} />}
      </section>}
      {canViewWorkOrders && <section className={`${panelClass} p-4 sm:p-5`}>
        <SectionTitle title="Alur order kerja" subtitle="WO yang dibuat dalam periode pilihan" aside={<Activity className="h-4 w-4 text-blue-600" />} />
        {!dataReady ? <Unavailable loading={pending} /> : <div className="mt-4">
          <Link to={link('/workorders')} className="mb-3 flex items-baseline justify-between text-sm text-slate-600 hover:text-blue-700"><span>Total WO masuk</span><b className="text-2xl text-slate-900">{metrics.workOrders.total}</b></Link>
          <div className="space-y-1">{[{ label: 'Register', status: 'Register', count: metrics.workOrders.register }, { label: 'Dikerjakan', status: 'Proses', count: metrics.workOrders.process }, { label: 'Selesai', status: 'Selesai', count: metrics.workOrders.completed }, { label: 'Lost Sales', status: 'Closed', count: metrics.workOrders.closed }].map(row => <Link key={row.status} to={link('/workorders', { status: row.status })} className="flex items-center justify-between rounded-lg px-2 py-2.5 text-sm text-slate-600 hover:bg-slate-50"><span>{row.label}</span><span className="flex items-center gap-3 font-semibold tabular-nums text-slate-800">{row.count}<ArrowRight className="h-3.5 w-3.5 text-slate-400" /></span></Link>)}</div>
          {canUseInvoiceData && <div className="mt-3 border-t border-slate-100 pt-4"><div className="flex justify-between text-xs text-slate-500"><span>WO menjadi faktur</span><strong className="text-slate-700">{metrics.workOrders.conversionPercent.toLocaleString('id-ID')}%</strong></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, metrics.workOrders.conversionPercent)}%` }} /></div><p className="mt-2 text-xs text-slate-500">{metrics.workOrders.invoiced} dari {metrics.workOrders.total} WO sudah difakturkan.</p></div>}
        </div>}
      </section>}
    </div>
    {canViewFinancial && <section className={`${panelClass} p-4 sm:p-5`}>
      <SectionTitle title="Posisi uang saat ini" subtitle="Saldo berjalan seluruh periode · tidak berubah mengikuti filter tanggal" aside={<Landmark className="h-4 w-4 text-slate-400" />} />
      <div className="mt-4 grid gap-3 sm:grid-cols-3">{[
        { label: 'Saldo kas', value: dataReady && cashAccounts ? money(cashAccounts.reduce((sum, row) => sum + Number(row.balance || 0), 0)) : unavailable, note: cashAccounts ? `${cashAccounts.length} rekening kas aktif` : 'Data rekening belum tersedia', to: '/cash-accounts' },
        { label: 'Saldo bank & QRIS', value: dataReady && bankAccounts ? money(bankAccounts.reduce((sum, row) => sum + Number(row.balance || 0), 0)) : unavailable, note: bankAccounts ? `${bankAccounts.length} rekening aktif` : 'Data rekening belum tersedia', to: '/bank-accounts' },
        { label: 'Tunai belum disetor', value: dataReady && unsubmitted !== null ? money(unsubmitted) : unavailable, note: 'Bagian dari kas · tidak dijumlahkan lagi', to: '/branch-deposits' },
      ].map(row => <Link key={row.label} to={row.to} className="rounded-lg bg-slate-50 p-4 transition-colors hover:bg-blue-50"><p className="text-xs font-medium text-slate-600">{row.label}</p><p className="mt-2 break-words text-lg font-bold tabular-nums text-slate-900">{row.value}</p><p className="mt-1 text-[11px] text-slate-500">{row.note}</p></Link>)}</div>
      {currentBranchId !== 'ALL' && <p className="mt-3 text-xs text-slate-500">Rekening tanpa penetapan cabang hanya ditampilkan pada Semua Cabang.</p>}
    </section>}
    {hasPermission('report:view') && <div className="flex flex-wrap gap-4 text-xs font-medium text-blue-700"><Link to="/reports">Buka laporan lengkap →</Link><Link to="/reports/inventory?availability=ATTENTION">Periksa stok kosong / minus →</Link></div>}
    <details className="text-xs text-slate-500"><summary className="w-fit cursor-pointer font-medium text-slate-600">Cara membaca angka Dashboard</summary><ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed"><li>Omzet mengikuti tanggal faktur. Pembayaran mengikuti tanggal penerimaan, termasuk pelunasan faktur periode sebelumnya.</li><li>Piutang, tindakan tertunda, dan saldo rekening menunjukkan kondisi saat ini. Pilihan tanggal tidak menyembunyikan kewajiban dari periode lama.</li><li>Belum lunas &gt;7 hari adalah umur faktur untuk tindak lanjut, bukan tanggal jatuh tempo kontraktual.</li><li>Target dan estimasi hanya tersedia untuk bulan berjalan. Perbandingan menampilkan rentang tanggal dan jumlah hari sebenarnya.</li></ul></details>
  </div>;
}
