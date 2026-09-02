import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, Banknote, CalendarDays, CircleDollarSign,
  Clock3, FileText, Landmark, PackageSearch, RefreshCw,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/apiClient';
import MobileDashboard from '../components/MobileDashboard';
import { buildWorkOrderAttentionItems, countWorkOrderAttentionByKind } from '../lib/workOrderAttention';
import {
  buildBranchPerformanceSummary,
  type BranchMonthlyTargets,
  type BranchPerformanceSummary,
  type BranchPerformanceRow,
} from '../lib/branchPerformance';
import { useMinuteClock } from '../hooks/useMinuteClock';

type CustomerPayment = { id: string; date: string; amount: number; paymentMethod: string; branchId: string; invoiceNumber: string; customerName: string };
type CashAccount = { id: string; name: string; accountType: 'cash' | 'bank' | 'qris'; branchId?: string; balance: number; unsubmitted: number; isActive: boolean };
type DepositSummary = { branchId: string; branchName: string; cashReceived: number; deposited: number; unsubmitted: number };
type MonthMetric = { key: string; label: string; from: string; to: string; sales: number; invoices: number; cashIn: number; cashOut: number; net: number };

const rupiah = (value: number) => `Rp ${Math.round(Number(value || 0)).toLocaleString('id-ID')}`;
const compactMoney = (value: number) => {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `Rp ${(value / 1_000_000_000).toFixed(1)} M`;
  if (absolute >= 1_000_000) return `Rp ${(value / 1_000_000).toFixed(1)} jt`;
  if (absolute >= 1_000) return `Rp ${(value / 1_000).toFixed(0)} rb`;
  return rupiah(value);
};
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const addDays = (date: Date, amount: number) => { const next = new Date(date); next.setDate(next.getDate() + amount); return next; };
const monthStartKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
const monthEndKey = (date: Date) => dateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0));
const percent = (value: number, total: number) => total > 0 ? Math.round((value / total) * 100) : 0;
const isBranchMonthlyTargets = (value: unknown): value is BranchMonthlyTargets => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return ['PERINTIS', 'CAKALANG', 'MAMUJU'].every(key => Number.isFinite(Number(candidate[key])) && Number(candidate[key]) >= 0);
};

export default function Dashboard() {
  const attentionNow = useMinuteClock();
  const { data, currentBranchId, currentUser, hasPermission, refreshData } = useApp();
  const canViewFinancial = Boolean(currentUser?.isOwner || currentUser?.roleName === 'Administrator' || hasPermission('report:view'));
  const canUseInvoiceData = Boolean(currentUser?.isOwner || currentUser?.roleName === 'Administrator' || hasPermission('invoice:view') || hasPermission('payment:view'));
  const canViewBranchPerformance = canViewFinancial && canUseInvoiceData;
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [depositSummary, setDepositSummary] = useState<DepositSummary[]>([]);
  const [branchTargets, setBranchTargets] = useState<BranchMonthlyTargets | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [salesTrendMode, setSalesTrendMode] = useState<'week' | 'months'>('months');

  const loadFinance = async () => {
    if (!canViewFinancial) return;
    setRefreshing(true);
    const [paymentResult, accountResult, depositResult, targetResult] = await Promise.all([
      api.get('customer-payments'), api.get('cash-accounts'), api.get('branch-deposits'), api.get('branch-targets'),
    ]);
    if (paymentResult.success) setPayments(paymentResult.data || []);
    if (accountResult.success) setAccounts(accountResult.data || []);
    if (depositResult.success) setDepositSummary(depositResult.data?.summary || []);
    if (targetResult.success && isBranchMonthlyTargets(targetResult.data)) {
      setBranchTargets({
        PERINTIS: Number(targetResult.data.PERINTIS),
        CAKALANG: Number(targetResult.data.CAKALANG),
        MAMUJU: Number(targetResult.data.MAMUJU),
      });
    } else {
      setBranchTargets(null);
    }
    setRefreshing(false);
  };

  useEffect(() => { void loadFinance(); }, [canViewFinancial]);

  const branchName = currentBranchId === 'ALL'
    ? 'Semua Cabang'
    : data.branches.find(branch => branch.id === currentBranchId)?.name || 'Cabang';
  const matchesBranch = (branchId?: string) => currentBranchId === 'ALL' || branchId === currentBranchId;
  const visibleWOs = data.workOrders.filter(wo => matchesBranch(wo.branchId));
  const visibleInvoices = data.invoices.filter(invoice => matchesBranch(invoice.branchId));
  const visiblePayments = payments.filter(payment => matchesBranch(payment.branchId));
  const visibleAccounts = accounts.filter(account => account.isActive && (matchesBranch(account.branchId) || !account.branchId));
  const visibleDeposits = depositSummary.filter(summary => matchesBranch(summary.branchId));

  const today = attentionNow;
  const todayKey = dateKey(today);
  const tenDaysAgo = dateKey(addDays(today, -9));
  const receivables = visibleInvoices.reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total) - Number(invoice.payment)), 0);
  const cashBalance = visibleAccounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const unsubmitted = visibleDeposits.reduce((sum, row) => sum + Number(row.unsubmitted || 0), 0);
  const currentMonthStart = monthStartKey(today);
  const currentMonthEnd = monthEndKey(today);
  const previousMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const previousMonthStart = monthStartKey(previousMonth);
  const previousMonthEnd = monthEndKey(previousMonth);
  const currentMonthInvoices = visibleInvoices.filter(invoice => invoice.date >= currentMonthStart && invoice.date <= currentMonthEnd);
  const currentMonthWOs = visibleWOs.filter(wo => wo.date >= currentMonthStart && wo.date <= currentMonthEnd);
  const currentMonthSales = currentMonthInvoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  const currentMonthPaid = currentMonthInvoices.reduce((sum, invoice) => sum + Math.min(Number(invoice.total || 0), Number(invoice.payment || 0)), 0);
  const currentMonthUnpaid = currentMonthInvoices.reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total || 0) - Number(invoice.payment || 0)), 0);
  const currentMonthNotDue = currentMonthInvoices.filter(invoice => invoice.status === 'Belum Lunas' && Number(invoice.age || 0) <= 7).reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total || 0) - Number(invoice.payment || 0)), 0);
  const currentMonthOverdue = currentMonthInvoices.filter(invoice => invoice.status === 'Belum Lunas' && Number(invoice.age || 0) > 7).reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total || 0) - Number(invoice.payment || 0)), 0);
  const currentMonthPayments = visiblePayments.filter(payment => payment.date >= currentMonthStart && payment.date <= currentMonthEnd);
  const currentMonthCash = currentMonthPayments.filter(payment => payment.paymentMethod.toLowerCase().includes('tunai')).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const currentMonthNonCash = currentMonthPayments.filter(payment => !payment.paymentMethod.toLowerCase().includes('tunai')).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const invoicedMonthWOs = currentMonthWOs.filter(wo => wo.invoiceId || visibleInvoices.some(invoice => invoice.woId === wo.id || invoice.woNumber === wo.woNumber));
  const completedMonthWOs = currentMonthWOs.filter(wo => wo.status === 'Selesai').length;
  const activeMonthWOs = currentMonthWOs.filter(wo => wo.status === 'Register' || wo.status === 'Proses').length;
  const awaitingInvoiceMonthWOs = currentMonthWOs.filter(wo => wo.status === 'Selesai' && !(wo.invoiceId || visibleInvoices.some(invoice => invoice.woId === wo.id || invoice.woNumber === wo.woNumber))).length;
  const monthConversion = percent(invoicedMonthWOs.length, currentMonthWOs.length);
  const daysInCurrentMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const elapsedMonthDays = Math.max(1, Math.min(today.getDate(), daysInCurrentMonth));
  const averageDailySales = currentMonthSales / elapsedMonthDays;
  const projectedMonthSales = Math.round(averageDailySales * daysInCurrentMonth);
  const executiveBranchPerformance = branchTargets
    ? buildBranchPerformanceSummary({ branches: data.branches, invoices: data.invoices, targets: branchTargets, now: today })
    : null;

  const monthlyMetrics = useMemo<MonthMetric[]>(() => Array.from({ length: 6 }, (_, index) => {
    const month = new Date(today.getFullYear(), today.getMonth() + index - 5, 1);
    const from = monthStartKey(month);
    const to = monthEndKey(month);
    const monthInvoices = visibleInvoices.filter(invoice => invoice.date >= from && invoice.date <= to);
    const cashIn = visiblePayments.filter(payment => payment.date >= from && payment.date <= to).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const cashOut = data.purchaseInvoices.filter(invoice => matchesBranch(invoice.branchId)).flatMap(invoice => invoice.payments || []).filter(payment => payment.date >= from && payment.date <= to).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    return {
      key: from.slice(0, 7), label: month.toLocaleDateString('id-ID', { month: 'short' }), from, to,
      sales: monthInvoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0),
      invoices: monthInvoices.length, cashIn, cashOut, net: cashIn - cashOut,
    };
  }), [data.invoices, data.purchaseInvoices, payments, currentBranchId]);

  const weeklySales = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = addDays(today, index - 6);
    const key = dateKey(date);
    const dayInvoices = visibleInvoices.filter(invoice => invoice.date === key);
    return { key, label: index === 5 ? 'Kemarin' : index === 6 ? 'Hari ini' : date.toLocaleDateString('id-ID', { weekday: 'short' }), value: dayInvoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0), count: dayInvoices.length };
  }), [data.invoices, currentBranchId]);

  const currentExpenseRows = data.purchaseInvoices.filter(invoice => matchesBranch(invoice.branchId)).map(invoice => ({
    label: invoice.supplierName || 'Lainnya',
    amount: (invoice.payments || []).filter(payment => payment.date >= currentMonthStart && payment.date <= currentMonthEnd).reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
  })).filter(row => row.amount > 0);
  const expensesBySupplier = Array.from(currentExpenseRows.reduce((rows, row) => rows.set(row.label, (rows.get(row.label) || 0) + row.amount), new Map<string, number>()))
    .map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount);
  const currentExpenseTotal = expensesBySupplier.reduce((sum, row) => sum + row.amount, 0);
  const previousExpenseTotal = data.purchaseInvoices.filter(invoice => matchesBranch(invoice.branchId)).flatMap(invoice => invoice.payments || []).filter(payment => payment.date >= previousMonthStart && payment.date <= previousMonthEnd).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const expenseChange = previousExpenseTotal > 0 ? Math.round(((currentExpenseTotal - previousExpenseTotal) / previousExpenseTotal) * 100) : currentExpenseTotal > 0 ? 100 : 0;

  const attentionItems = buildWorkOrderAttentionItems(visibleWOs, visibleInvoices, todayKey, attentionNow);
  const attentionCounts = countWorkOrderAttentionByKind(attentionItems);
  const activeWarehouseIds = new Set(data.warehouses
    .filter(warehouse => warehouse.isActive && matchesBranch(warehouse.branchId))
    .map(warehouse => warehouse.id));
  const inventoryItems = data.items.filter(item => item.isActive && item.type === 'Persediaan' && item.verificationStatus !== 'Merged');
  const inventoryStockTotals = data.warehouseStocks.reduce((totals, stock) => {
    if (!activeWarehouseIds.has(stock.warehouseId)) return totals;
    totals.set(stock.itemId, (totals.get(stock.itemId) || 0) + Number(stock.quantity || 0));
    return totals;
  }, new Map<string, number>());
  const inventoryQuantity = (itemId: string) => inventoryStockTotals.get(itemId) || 0;
  const negativeStockCount = inventoryItems.filter(item => inventoryQuantity(item.id) < 0).length;
  const emptyStockCount = inventoryItems.filter(item => inventoryQuantity(item.id) === 0).length;
  const pendingVerificationCount = inventoryItems.filter(item => item.verificationStatus === 'Pending').length;

  const overdueInvoices = visibleInvoices.filter(invoice => invoice.status === 'Belum Lunas' && Number(invoice.age || 0) > 7);

  const branchPerformance = data.branches.filter(branch => branch.isActive && (currentBranchId === 'ALL' || branch.id === currentBranchId)).map(branch => {
    const branchWOs = data.workOrders.filter(wo => wo.branchId === branch.id && wo.date >= tenDaysAgo && wo.date <= todayKey);
    const branchInvoices = data.invoices.filter(invoice => invoice.branchId === branch.id);
    const branchConverted = branchWOs.filter(wo => wo.invoiceId || branchInvoices.some(invoice => invoice.woId === wo.id || invoice.woNumber === wo.woNumber)).length;
    const branchCash = payments.filter(payment => payment.branchId === branch.id && payment.date >= tenDaysAgo && payment.date <= todayKey).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const branchReceivable = branchInvoices.reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total) - Number(invoice.payment)), 0);
    return { ...branch, wo: branchWOs.length, converted: branchConverted, rate: percent(branchConverted, branchWOs.length), cash: branchCash, receivable: branchReceivable };
  });

  const refreshDashboard = async () => {
    setRefreshing(true);
    await Promise.all([refreshData(), loadFinance()]);
    setRefreshing(false);
  };

  return <>
    <MobileDashboard branchPerformance={executiveBranchPerformance} canViewBranchPerformance={canViewBranchPerformance} attentionNow={attentionNow} />
    <div className="hidden space-y-3 pb-5 lg:block">
      <section className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Ringkasan Manajemen</p>
          <h1 className="text-xl font-bold text-slate-900">{branchName}</h1>
          <p className="text-xs text-slate-500">Data operasional dan finansial diperbarui dari transaksi nyata.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-white px-3 py-2 text-xs text-slate-500 shadow-sm ring-1 ring-slate-200"><CalendarDays className="mr-1.5 inline h-4 w-4" />{new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
          <button onClick={() => void refreshDashboard()} title="Refresh dashboard" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-blue-600 hover:bg-blue-50"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /></button>
        </div>
      </section>

      {canViewFinancial && <BranchOperationalCard
        branchName={branchName}
        period={today.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
        sales={currentMonthSales}
        workOrders={currentMonthWOs.length}
        completedWorkOrders={completedMonthWOs}
        activeWorkOrders={activeMonthWOs}
        invoices={currentMonthInvoices.length}
        awaitingInvoices={awaitingInvoiceMonthWOs}
        conversion={monthConversion}
        cash={currentMonthCash}
        nonCash={currentMonthNonCash}
        unpaid={currentMonthUnpaid}
        unsubmitted={unsubmitted}
        dailyAverage={averageDailySales}
        projection={projectedMonthSales}
      />}

      {canViewBranchPerformance && executiveBranchPerformance && <ExecutiveBranchPerformance summary={executiveBranchPerformance} />}
      {canViewBranchPerformance && !executiveBranchPerformance && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">Target cabang belum dapat dimuat. Gunakan Refresh setelah koneksi server tersedia.</div>}

      {canViewFinancial && <>
        <section className="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(420px,1fr)]">
          <DashboardPanel title="Arus Kas" subtitle="6 bulan terakhir · berdasarkan pembayaran aktual" onRefresh={() => void refreshDashboard()} refreshing={refreshing}>
            <CashFlowMonthChart rows={monthlyMetrics} />
            <div className="mt-3 flex justify-center gap-4 text-[11px] text-slate-500">
              <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-400" />Kas masuk</span>
              <span className="flex items-center gap-1"><i className="h-0.5 w-4 bg-sky-500" />Arus bersih</span>
            </div>
          </DashboardPanel>

          <DashboardPanel title="Penjualan" subtitle={`${today.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} · bulan berjalan`} onRefresh={() => void refreshDashboard()} refreshing={refreshing}>
            <div className="grid grid-cols-3 gap-3 border-b border-slate-100 pb-3">
              <SalesSummaryLink to="/invoices" label="Pendapatan" value={currentMonthSales} tone="slate" />
              <SalesSummaryLink to="/invoices?status=Lunas" label="Faktur Lunas" value={currentMonthPaid} tone="emerald" />
              <SalesSummaryLink to="/invoices?status=Belum%20Lunas" label="Belum Lunas" value={currentMonthUnpaid} tone="amber" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <SalesBarLink to="/invoices?status=Belum%20Lunas" label="Belum jatuh tempo" value={currentMonthNotDue} total={Math.max(1, currentMonthUnpaid)} tone="amber" />
              <SalesBarLink to="/invoices?status=Belum%20Lunas" label="Lewat jatuh tempo" value={currentMonthOverdue} total={Math.max(1, currentMonthUnpaid)} tone="red" />
            </div>
            <p className="mt-3 text-[10px] text-slate-400">Jatuh tempo memakai aturan tindak lanjut 7 hari karena faktur penjualan belum memiliki tanggal jatuh tempo tersendiri.</p>
          </DashboardPanel>
        </section>

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(420px,1fr)]">
          <DashboardPanel title="Tren Penjualan" subtitle={salesTrendMode === 'week' ? '7 hari terakhir' : '6 bulan terakhir'} onRefresh={() => void refreshDashboard()} refreshing={refreshing} action={<div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-[11px]"><button type="button" onClick={() => setSalesTrendMode('week')} className={`rounded-md px-2.5 py-1 ${salesTrendMode === 'week' ? 'bg-white font-semibold text-blue-700 shadow-sm' : 'text-slate-500'}`}>7 Hari</button><button type="button" onClick={() => setSalesTrendMode('months')} className={`rounded-md px-2.5 py-1 ${salesTrendMode === 'months' ? 'bg-white font-semibold text-blue-700 shadow-sm' : 'text-slate-500'}`}>6 Bulan</button></div>}>
            <SalesTrendChart rows={salesTrendMode === 'week' ? weeklySales : monthlyMetrics.map(row => ({ key: row.key, label: row.label, value: row.sales, count: row.invoices }))} />
          </DashboardPanel>

          <DashboardPanel title="Beban Perusahaan" subtitle={`${today.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })} · pembayaran supplier`} onRefresh={() => void refreshDashboard()} refreshing={refreshing}>
            <div className="flex items-center gap-5">
              <ExpenseRing value={currentExpenseTotal} change={expenseChange} />
              <div className="min-w-0 flex-1">
                <div className="flex items-end justify-between border-b border-slate-200 pb-2"><span className="font-semibold text-slate-700">Beban</span><b className="text-xl text-slate-900">{rupiah(currentExpenseTotal)}</b></div>
                <div className="mt-2 space-y-2">{expensesBySupplier.slice(0, 4).map(row => <div key={row.label} className="flex items-center justify-between gap-3 text-xs"><span className="truncate text-slate-600">{row.label}</span><b className="flex-shrink-0 text-slate-800">{rupiah(row.amount)}</b></div>)}{expensesBySupplier.length === 0 && <p className="py-3 text-xs text-slate-400">Belum ada pembayaran supplier pada periode ini.</p>}</div>
              </div>
            </div>
            <Link to="/purchase-invoices" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">Lihat transaksi beban <ArrowRight className="h-3.5 w-3.5" /></Link>
          </DashboardPanel>
        </section>
      </>}

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div><h2 className="font-bold text-slate-900">Performa Cabang · 10 Hari</h2><p className="text-xs text-slate-500">WO, konversi, dan kas masuk 10 hari; piutang menunjukkan saldo berjalan.</p></div>{currentBranchId === 'ALL' && <span className="text-xs text-slate-400">{branchPerformance.length} cabang</span>}</div>
          <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-2.5">Cabang</th><th className="px-3 py-2.5 text-center">WO</th><th className="px-3 py-2.5 text-center">Invoice</th><th className="px-3 py-2.5">Konversi</th>{canViewFinancial && <><th className="px-3 py-2.5 text-right">Kas Masuk</th><th className="px-4 py-2.5 text-right">Piutang</th></>}</tr></thead><tbody className="divide-y divide-slate-100">{branchPerformance.map(branch => <tr key={branch.id} className="hover:bg-slate-50"><td className="px-4 py-3"><b className="text-slate-800">{branch.name.replace('CABANG ', '')}</b><small className="block text-slate-400">{branch.code}</small></td><td className="px-3 text-center font-semibold">{branch.wo}</td><td className="px-3 text-center font-semibold text-emerald-700">{branch.converted}</td><td className="px-3"><div className="flex items-center gap-2"><div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-500" style={{ width: `${branch.rate}%` }} /></div><span className="text-xs font-semibold">{branch.rate}%</span></div></td>{canViewFinancial && <><td className="px-3 text-right font-semibold text-emerald-700">{compactMoney(branch.cash)}</td><td className="px-4 text-right font-semibold text-amber-700">{compactMoney(branch.receivable)}</td></>}</tr>)}</tbody></table>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between"><div><h2 className="font-bold text-slate-900">Perlu Perhatian</h2><p className="text-xs text-slate-500">Prioritas tindak lanjut hari ini.</p></div><AlertTriangle className="h-5 w-5 text-amber-500" /></div>
          <div className="space-y-2">
            <AttentionRow to="/workorders?attention=1" tone="red" icon={AlertTriangle} title={`${attentionItems.length} pekerjaan butuh tindakan`} detail={`${attentionCounts.register} register · ${attentionCounts.process} terlambat · ${attentionCounts.invoice} belum faktur · ${attentionCounts.payment} belum lunas`} />
            <AttentionRow to="/workorders?attention=1" tone="amber" icon={Clock3} title={`${attentionCounts.register} register mengambang`} detail="Belum diputuskan menjadi Dikerjakan atau Lost Sales." />
            {canViewFinancial && <AttentionRow to="/invoices" tone="red" icon={FileText} title={`${overdueInvoices.length} faktur menunggak lebih dari 7 hari`} detail={`Total piutang ${rupiah(receivables)}`} />}
            {canViewFinancial && <AttentionRow to="/branch-deposits" tone="blue" icon={Banknote} title={`${rupiah(unsubmitted)} tunai belum disetor`} detail="Periksa setoran tunai masing-masing cabang." />}
            <AttentionRow to="/inventory-report" tone={negativeStockCount > 0 ? 'red' : 'amber'} icon={PackageSearch} title={`${negativeStockCount} stok negatif · ${emptyStockCount} stok kosong`} detail={`${pendingVerificationCount} barang masih menunggu verifikasi.`} />
          </div>
        </div>
      </section>

      {canViewFinancial && <section className="grid grid-cols-3 gap-3">
        <FinanceStrip icon={Landmark} label="Saldo Kas & Bank" value={rupiah(cashBalance)} note={`${visibleAccounts.length} akun aktif`} tone="blue" to="/cash-accounts" />
        <FinanceStrip icon={Banknote} label="Tunai Belum Disetor" value={rupiah(unsubmitted)} note="Tidak termasuk transfer internal" tone="amber" to="/branch-deposits" />
        <FinanceStrip icon={CircleDollarSign} label="Pembayaran Hari Ini" value={rupiah(visiblePayments.filter(payment => payment.date === todayKey).reduce((sum, payment) => sum + Number(payment.amount || 0), 0))} note={`${visiblePayments.filter(payment => payment.date === todayKey).length} transaksi`} tone="emerald" to="/customer-payments" />
      </section>}
    </div>
  </>;
}

function ExecutiveBranchPerformance({ summary }: { summary: BranchPerformanceSummary }) {
  const statusStyles: Record<BranchPerformanceRow['status'], string> = {
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-red-200 bg-red-50 text-red-700',
  };
  const statusLabels: Record<BranchPerformanceRow['status'], string> = {
    green: 'Sesuai pace', amber: 'Perlu dorongan', red: 'Tertinggal',
  };

  return <section className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">Target vs Realisasi</p>
        <h2 className="text-lg font-bold text-slate-900">Performa Omzet Tiga Cabang</h2>
        <p className="text-xs text-slate-500">Bulan berjalan sampai hari ke-{summary.period.elapsedDays} dari {summary.period.daysInMonth} hari.</p>
      </div>
      <div className="grid grid-cols-3 gap-4 text-right text-xs">
        <div><span className="block text-slate-400">Realisasi</span><b className="text-slate-900">{rupiah(summary.total.sales)}</b></div>
        <div><span className="block text-slate-400">Target</span><b className="text-blue-700">{rupiah(summary.total.target)}</b></div>
        <div><span className="block text-slate-400">Proyeksi</span><b className="text-violet-700">{rupiah(summary.total.projectedSales)}</b></div>
      </div>
    </header>

    {summary.rows.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">Cabang Perintis, Cakalang, dan Mamuju belum tersedia pada akses ini.</div> : <div className="overflow-x-auto">
      <table className="w-full min-w-[1180px] text-sm">
        <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500"><tr>
          <th className="px-4 py-2.5">Cabang</th><th className="px-3 py-2.5 text-right">Realisasi</th><th className="px-3 py-2.5 text-right">Target</th><th className="px-3 py-2.5">Pencapaian</th><th className="px-3 py-2.5 text-right">Pace Hari Ini</th><th className="px-3 py-2.5 text-right">Selisih Pace</th><th className="px-3 py-2.5 text-right">Proyeksi</th><th className="px-3 py-2.5 text-center">Faktur</th><th className="px-3 py-2.5 text-right">Diterima</th><th className="px-4 py-2.5 text-right">Piutang</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-100">{summary.rows.map(row => <tr key={row.branchId} className="hover:bg-blue-50/30">
          <td className="px-4 py-3"><b className="block text-slate-900">{row.branchLabel}</b><span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusStyles[row.status]}`}>{statusLabels[row.status]}</span></td>
          <td className="px-3 text-right font-bold text-slate-900">{compactMoney(row.sales)}</td>
          <td className="px-3 text-right text-slate-600">{compactMoney(row.target)}</td>
          <td className="px-3"><div className="flex items-center gap-2"><div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${row.status === 'green' ? 'bg-emerald-500' : row.status === 'amber' ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, row.achievementPercent)}%` }} /></div><b className="text-xs text-slate-700">{row.achievementPercent}%</b></div><small className="text-[10px] text-slate-400">Sisa {compactMoney(row.remainingTarget)}</small></td>
          <td className="px-3 text-right text-slate-600">{compactMoney(row.paceTarget)}</td>
          <td className={`px-3 text-right font-semibold ${row.paceDifference >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{row.paceDifference >= 0 ? '+' : '-'}{compactMoney(Math.abs(row.paceDifference)).replace('Rp ', '')}</td>
          <td className="px-3 text-right font-semibold text-violet-700">{compactMoney(row.projectedSales)}</td>
          <td className="px-3 text-center font-semibold">{row.invoiceCount}</td>
          <td className="px-3 text-right font-semibold text-emerald-700">{compactMoney(row.received)}</td>
          <td className="px-4 text-right font-semibold text-amber-700">{compactMoney(row.receivable)}</td>
        </tr>)}</tbody>
        <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold"><tr><td className="px-4 py-3">TOTAL</td><td className="px-3 text-right">{compactMoney(summary.total.sales)}</td><td className="px-3 text-right">{compactMoney(summary.total.target)}</td><td className="px-3">{summary.total.achievementPercent}%</td><td className="px-3 text-right">{compactMoney(summary.total.paceTarget)}</td><td className={`px-3 text-right ${summary.total.paceDifference >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{summary.total.paceDifference >= 0 ? '+' : '-'}{compactMoney(Math.abs(summary.total.paceDifference)).replace('Rp ', '')}</td><td className="px-3 text-right text-violet-700">{compactMoney(summary.total.projectedSales)}</td><td className="px-3 text-center">{summary.total.invoiceCount}</td><td className="px-3 text-right text-emerald-700">{compactMoney(summary.total.received)}</td><td className="px-4 text-right text-amber-700">{compactMoney(summary.total.receivable)}</td></tr></tfoot>
      </table>
    </div>}
  </section>;
}

function BranchOperationalCard({ branchName, period, sales, workOrders, completedWorkOrders, activeWorkOrders, invoices, awaitingInvoices, conversion, cash, nonCash, unpaid, unsubmitted, dailyAverage, projection }: {
  branchName: string; period: string; sales: number; workOrders: number; completedWorkOrders: number; activeWorkOrders: number; invoices: number; awaitingInvoices: number; conversion: number; cash: number; nonCash: number; unpaid: number; unsubmitted: number; dailyAverage: number; projection: number;
}) {
  return <section className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
    <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
      <div><p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">Ringkasan Operasional Cabang</p><h2 className="text-lg font-bold text-slate-900">{branchName}</h2></div>
      <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">{period}</span>
    </header>
    <div className="grid xl:grid-cols-[minmax(260px,0.9fr)_minmax(480px,1.6fr)_minmax(280px,0.9fr)]">
      <Link to="/invoices" className="group border-b border-slate-200 p-5 hover:bg-blue-50/30 xl:border-b-0 xl:border-r">
        <span className="text-sm text-slate-500">Penjualan bulan berjalan</span>
        <strong className="mt-1 block text-3xl text-slate-950 group-hover:text-blue-700">{rupiah(sales)}</strong>
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-600">Lihat daftar faktur <ArrowRight className="h-3.5 w-3.5" /></span>
      </Link>

      <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 sm:grid-cols-4 sm:divide-y-0">
        <OperationalMetric to="/workorders" label="Order Kerja" value={`${workOrders} WO`} note={`${completedWorkOrders} selesai · ${activeWorkOrders} aktif`} />
        <OperationalMetric to="/invoices" label="Faktur" value={`${invoices} Faktur`} note={`${awaitingInvoices} WO belum faktur`} warning={awaitingInvoices > 0} />
        <OperationalMetric to="/customer-payments" label="Tunai diterima" value={compactMoney(cash)} note="Pembayaran tunai" />
        <OperationalMetric to="/customer-payments" label="Transfer / non-tunai" value={compactMoney(nonCash)} note="Transfer, QRIS, lainnya" />
      </div>

      <div className="border-t border-slate-200 p-5 xl:border-l xl:border-t-0">
        <div className="flex items-end justify-between"><div><span className="text-xs text-slate-500">Proyeksi omzet</span><strong className="block text-xl text-blue-700">{rupiah(projection)}</strong></div><span className="rounded bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{conversion}%</span></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, conversion)}%` }} /></div>
        <div className="mt-2 flex justify-between text-[11px] text-slate-500"><span>WO → Faktur</span><span>Rata-rata {compactMoney(dailyAverage)}/hari</span></div>
      </div>
    </div>
    <footer className="grid border-t border-slate-200 bg-slate-50 sm:grid-cols-2">
      <Link to="/invoices?status=Belum%20Lunas" className="flex items-center justify-between gap-3 px-5 py-2.5 text-xs hover:bg-amber-50"><span className="text-slate-500">Belum dibayar</span><b className={unpaid > 0 ? 'text-amber-700' : 'text-emerald-700'}>{rupiah(unpaid)}</b></Link>
      <Link to="/branch-deposits" className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-2.5 text-xs hover:bg-red-50 sm:border-l sm:border-t-0"><span className="text-slate-500">Tunai belum disetor</span><b className={unsubmitted > 0 ? 'text-red-600' : 'text-emerald-700'}>{rupiah(unsubmitted)}</b></Link>
    </footer>
  </section>;
}

function OperationalMetric({ to, label, value, note, warning = false }: { to: string; label: string; value: string; note: string; warning?: boolean }) {
  return <Link to={to} className="group min-w-0 p-4 hover:bg-blue-50/30"><span className="block truncate text-xs text-slate-500">{label}</span><b className="mt-1 block truncate text-lg text-slate-900 group-hover:text-blue-700">{value}</b><small className={warning ? 'block truncate text-[10px] font-semibold text-amber-600' : 'block truncate text-[10px] text-slate-400'}>{note}</small></Link>;
}

function DashboardPanel({ title, subtitle, onRefresh, refreshing, action, children }: { title: string; subtitle: string; onRefresh: () => void; refreshing: boolean; action?: React.ReactNode; children: React.ReactNode }) {
  return <article className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
    <header className="flex min-h-12 items-center justify-between border-b border-slate-200 px-4 py-2.5">
      <div><h2 className="font-bold text-slate-800">{title}</h2><p className="text-[11px] text-slate-400">{subtitle}</p></div>
      <div className="flex items-center gap-2">{action}<button type="button" onClick={onRefresh} title={`Refresh ${title}`} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-blue-600"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /></button></div>
    </header>
    <div className="p-4">{children}</div>
  </article>;
}

function CashFlowMonthChart({ rows }: { rows: MonthMetric[] }) {
  const max = Math.max(1, ...rows.flatMap(row => [row.cashIn, Math.abs(row.net)]));
  const netY = (value: number) => 80 - (value / max) * 55;
  const points = rows.map((row, index) => `${50 + index * 100},${netY(row.net)}`).join(' ');
  return <div className="relative h-48">
    <div className="pointer-events-none absolute inset-x-0 top-2 h-36"><div className="absolute inset-x-0 top-0 border-t border-slate-100" /><div className="absolute inset-x-0 top-1/2 border-t border-slate-100" /><div className="absolute inset-x-0 bottom-0 border-t border-slate-200" /></div>
    <div className="absolute inset-x-0 bottom-5 top-2 flex items-end">{rows.map(row => <div key={row.key} className="flex h-full flex-1 items-end justify-center"><div title={`${row.label}: kas masuk ${rupiah(row.cashIn)}`} className="w-8 max-w-[45%] rounded-t-sm bg-emerald-300 transition hover:bg-emerald-400" style={{ height: `${Math.max(row.cashIn > 0 ? 3 : 0, (row.cashIn / max) * 100)}%` }} /></div>)}</div>
    <svg className="pointer-events-none absolute inset-x-0 top-2 h-36 w-full" viewBox="0 0 600 160" preserveAspectRatio="none" aria-label="Garis arus kas bersih"><line x1="0" y1="80" x2="600" y2="80" stroke="#bae6fd" strokeDasharray="4 4" /><polyline points={points} fill="none" stroke="#0ea5e9" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />{rows.map((row, index) => <circle key={row.key} cx={50 + index * 100} cy={netY(row.net)} r="5" fill="#0ea5e9"><title>{`${row.label}: arus bersih ${rupiah(row.net)}`}</title></circle>)}</svg>
    <div className="absolute inset-x-0 bottom-0 flex">{rows.map(row => <span key={row.key} className="flex-1 text-center text-[11px] text-slate-500">{row.label}</span>)}</div>
  </div>;
}

function SalesTrendChart({ rows }: { rows: { key: string; label: string; value: number; count: number }[] }) {
  const max = Math.max(1, ...rows.map(row => row.value));
  const gap = rows.length > 1 ? 540 / (rows.length - 1) : 0;
  const points = rows.map((row, index) => `${30 + index * gap},${140 - (row.value / max) * 105}`).join(' ');
  return <div className="h-48">
    <svg viewBox="0 0 600 180" className="h-full w-full" role="img" aria-label="Tren nilai penjualan">
      <line x1="30" y1="35" x2="570" y2="35" stroke="#e2e8f0" /><line x1="30" y1="87" x2="570" y2="87" stroke="#e2e8f0" /><line x1="30" y1="140" x2="570" y2="140" stroke="#cbd5e1" />
      <polyline points={points} fill="none" stroke="#60a5fa" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {rows.map((row, index) => <g key={row.key}><circle cx={30 + index * gap} cy={140 - (row.value / max) * 105} r="5" fill="#60a5fa"><title>{`${row.label}: ${row.count} faktur · ${rupiah(row.value)}`}</title></circle><text x={30 + index * gap} y="165" textAnchor="middle" fontSize="11" fill="#64748b">{row.label}</text></g>)}
    </svg>
  </div>;
}

function ExpenseRing({ value, change }: { value: number; change: number }) {
  const safe = Math.min(100, Math.abs(change));
  const color = change > 0 ? '#f97316' : '#10b981';
  return <div className="text-center"><div className="relative h-28 w-28 flex-shrink-0 rounded-full" style={{ background: `conic-gradient(${color} ${safe * 3.6}deg,#e5e7eb 0deg)` }}><div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-white"><b className={change > 0 ? 'text-orange-600' : 'text-emerald-600'}>{change > 0 ? '+' : ''}{change}%</b><span className="text-[9px] text-slate-400">vs bulan lalu</span></div></div><span className="mt-1 block text-[10px] text-slate-400">{value > 0 ? 'Pembayaran supplier' : 'Belum ada beban'}</span></div>;
}

const salesTextTones = { slate: 'text-slate-900', emerald: 'text-emerald-600', amber: 'text-amber-600' };
function SalesSummaryLink({ to, label, value, tone }: { to: string; label: string; value: number; tone: keyof typeof salesTextTones }) {
  return <Link to={to} className="min-w-0 hover:opacity-75"><span className="block truncate text-[11px] text-slate-500">{label}</span><b className={`block truncate text-lg ${salesTextTones[tone]}`}>{compactMoney(value)}</b></Link>;
}

const salesBarTones = { amber: 'bg-amber-400', red: 'bg-red-500' };
function SalesBarLink({ to, label, value, total, tone }: { to: string; label: string; value: number; total: number; tone: keyof typeof salesBarTones }) {
  return <Link to={to} className="group"><div className="mb-1 flex justify-between gap-2 text-[11px]"><span className="truncate text-slate-500">{label}</span><b className={tone === 'red' ? 'text-red-600' : 'text-amber-600'}>{compactMoney(value)}</b></div><div className="h-2 overflow-hidden bg-slate-100"><div className={`h-full transition group-hover:opacity-80 ${salesBarTones[tone]}`} style={{ width: `${percent(value, total)}%` }} /></div></Link>;
}

const attentionTones = { amber: 'bg-amber-50 text-amber-600', red: 'bg-red-50 text-red-600', blue: 'bg-blue-50 text-blue-600', emerald: 'bg-emerald-50 text-emerald-600' };
function AttentionRow({ to, title, detail, icon: Icon, tone }: { to: string; title: string; detail: string; icon: any; tone: keyof typeof attentionTones }) {
  return <Link to={to} className="group flex items-start gap-3 rounded-lg border border-slate-100 p-2.5 hover:border-blue-200 hover:bg-blue-50/30"><span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${attentionTones[tone]}`}><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><b className="block text-xs text-slate-800">{title}</b><small className="block truncate text-[11px] text-slate-500">{detail}</small></span><ArrowRight className="mt-2 h-3.5 w-3.5 text-slate-300 group-hover:text-blue-500" /></Link>;
}

const stripTones = { blue: 'text-blue-600 bg-blue-50', amber: 'text-amber-600 bg-amber-50', emerald: 'text-emerald-600 bg-emerald-50' };
function FinanceStrip({ label, value, note, icon: Icon, tone, to }: { label: string; value: string; note: string; icon: any; tone: keyof typeof stripTones; to: string }) {
  return <Link to={to} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm hover:border-blue-200"><span className={`flex h-9 w-9 items-center justify-center rounded-lg ${stripTones[tone]}`}><Icon className="h-4 w-4" /></span><span><small className="block text-slate-500">{label}</small><b className="block text-slate-900">{value}</b><small className="text-[10px] text-slate-400">{note}</small></span></Link>;
}
