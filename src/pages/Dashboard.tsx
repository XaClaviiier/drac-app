import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Banknote,
  CalendarDays, CheckCircle2, CircleDollarSign, Clock3, FileText,
  Gauge, Landmark, RefreshCw, TrendingUp, WalletCards, Wrench,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/apiClient';
import MobileDashboard from '../components/MobileDashboard';

type CustomerPayment = { id: string; date: string; amount: number; paymentMethod: string; branchId: string; invoiceNumber: string; customerName: string };
type CashAccount = { id: string; name: string; accountType: 'cash' | 'bank' | 'qris'; branchId?: string; balance: number; unsubmitted: number; isActive: boolean };
type DepositSummary = { branchId: string; branchName: string; cashReceived: number; deposited: number; unsubmitted: number };
type TrendDay = { date: string; label: string; cashIn: number; cashOut: number; wo: number; converted: number };

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
const percent = (value: number, total: number) => total > 0 ? Math.round((value / total) * 100) : 0;

export default function Dashboard() {
  const { data, currentBranchId, currentUser, hasPermission, refreshData } = useApp();
  const canViewFinancial = Boolean(currentUser?.isOwner || currentUser?.roleName === 'Administrator' || hasPermission('report:view'));
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [depositSummary, setDepositSummary] = useState<DepositSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadFinance = async () => {
    if (!canViewFinancial) return;
    setRefreshing(true);
    const [paymentResult, accountResult, depositResult] = await Promise.all([
      api.get('customer-payments'), api.get('cash-accounts'), api.get('branch-deposits'),
    ]);
    if (paymentResult.success) setPayments(paymentResult.data || []);
    if (accountResult.success) setAccounts(accountResult.data || []);
    if (depositResult.success) setDepositSummary(depositResult.data?.summary || []);
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

  const today = new Date();
  const todayKey = dateKey(today);
  const tenDaysAgo = dateKey(addDays(today, -9));
  const previousStart = dateKey(addDays(today, -19));
  const previousEnd = dateKey(addDays(today, -10));

  const trends = useMemo<TrendDay[]>(() => Array.from({ length: 10 }, (_, index) => {
    const date = addDays(today, index - 9);
    const key = dateKey(date);
    const dayWOs = visibleWOs.filter(wo => wo.date === key);
    const converted = dayWOs.filter(wo => wo.invoiceId || data.invoices.some(invoice => invoice.woId === wo.id || invoice.woNumber === wo.woNumber)).length;
    const cashIn = visiblePayments.filter(payment => payment.date === key).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const cashOut = data.purchaseInvoices.filter(invoice => matchesBranch(invoice.branchId)).flatMap(invoice => invoice.payments || []).filter(payment => payment.date === key).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    return { date: key, label: `${date.getDate()}/${date.getMonth() + 1}`, cashIn, cashOut, wo: dayWOs.length, converted };
  }), [data.workOrders, data.invoices, data.purchaseInvoices, payments, currentBranchId]);

  const tenDayWOs = visibleWOs.filter(wo => wo.date >= tenDaysAgo && wo.date <= todayKey);
  const convertedWOs = tenDayWOs.filter(wo => wo.invoiceId || visibleInvoices.some(invoice => invoice.woId === wo.id || invoice.woNumber === wo.woNumber));
  const salesRate = percent(convertedWOs.length, tenDayWOs.length);
  const cashIn10 = trends.reduce((sum, item) => sum + item.cashIn, 0);
  const cashOut10 = trends.reduce((sum, item) => sum + item.cashOut, 0);
  const netCash10 = cashIn10 - cashOut10;
  const previousCashIn = visiblePayments.filter(payment => payment.date >= previousStart && payment.date <= previousEnd).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const cashGrowth = previousCashIn > 0 ? Math.round(((cashIn10 - previousCashIn) / previousCashIn) * 100) : cashIn10 > 0 ? 100 : 0;
  const receivables = visibleInvoices.reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total) - Number(invoice.payment)), 0);
  const cashBalance = visibleAccounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const unsubmitted = visibleDeposits.reduce((sum, row) => sum + Number(row.unsubmitted || 0), 0);

  const statusCounts = {
    diagnosis: visibleWOs.filter(wo => wo.status === 'Pengecekan').length,
    pending: visibleWOs.filter(wo => wo.status === 'Pending').length,
    process: visibleWOs.filter(wo => wo.status === 'Proses').length,
    completed: visibleWOs.filter(wo => ['Selesai', 'Invoiced'].includes(wo.status)).length,
  };
  const stalePending = visibleWOs.filter(wo => wo.status === 'Pending' && wo.date < dateKey(addDays(today, -7)));
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
    <MobileDashboard />
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

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {canViewFinancial ? <>
          <KpiCard label="Kas Masuk · 10 Hari" value={compactMoney(cashIn10)} note={`${cashGrowth >= 0 ? '+' : ''}${cashGrowth}% dibanding 10 hari sebelumnya`} icon={ArrowDownRight} tone="emerald" />
          <KpiCard label="Arus Kas Bersih" value={compactMoney(netCash10)} note={`Keluar ${compactMoney(cashOut10)}`} icon={netCash10 >= 0 ? TrendingUp : ArrowUpRight} tone={netCash10 >= 0 ? 'blue' : 'red'} />
          <KpiCard label="Keberhasilan Sales" value={`${salesRate}%`} note={`${convertedWOs.length} dari ${tenDayWOs.length} WO menjadi invoice`} icon={Gauge} tone={salesRate >= 70 ? 'emerald' : salesRate >= 50 ? 'amber' : 'red'} />
          <KpiCard label="Piutang Pelanggan" value={compactMoney(receivables)} note={`${visibleInvoices.filter(invoice => invoice.status === 'Belum Lunas').length} faktur belum lunas`} icon={WalletCards} tone="amber" />
        </> : <>
          <KpiCard label="Diagnosa" value={String(statusCounts.diagnosis)} note="Menunggu hasil diagnosa" icon={Wrench} tone="amber" />
          <KpiCard label="Pending" value={String(statusCounts.pending)} note="Menunggu persetujuan" icon={Clock3} tone="red" />
          <KpiCard label="Dikerjakan" value={String(statusCounts.process)} note="Sedang dalam proses" icon={Gauge} tone="blue" />
          <KpiCard label="Selesai" value={String(statusCounts.completed)} note="Total pekerjaan selesai" icon={CheckCircle2} tone="emerald" />
        </>}
      </section>

      {canViewFinancial && <section className="grid gap-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-start justify-between">
            <div><h2 className="font-bold text-slate-900">Arus Kas 10 Hari Terakhir</h2><p className="text-xs text-slate-500">Pembayaran pelanggan dibanding pembayaran pembelian.</p></div>
            <div className="flex gap-3 text-xs"><span className="flex items-center gap-1 text-emerald-700"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />Masuk</span><span className="flex items-center gap-1 text-red-600"><i className="h-2.5 w-2.5 rounded-sm bg-red-400" />Keluar</span></div>
          </div>
          <CashFlowChart rows={trends} />
          <div className="mt-3 grid grid-cols-3 divide-x divide-slate-200 rounded-lg bg-slate-50 py-2 text-center">
            <div><p className="text-[11px] text-slate-500">Kas masuk</p><b className="text-sm text-emerald-700">{rupiah(cashIn10)}</b></div>
            <div><p className="text-[11px] text-slate-500">Kas keluar</p><b className="text-sm text-red-600">{rupiah(cashOut10)}</b></div>
            <div><p className="text-[11px] text-slate-500">Arus bersih</p><b className={`text-sm ${netCash10 >= 0 ? 'text-blue-700' : 'text-red-700'}`}>{rupiah(netCash10)}</b></div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3"><h2 className="font-bold text-slate-900">Konversi Sales</h2><p className="text-xs text-slate-500">Keberhasilan WO menjadi invoice dalam 10 hari.</p></div>
          <div className="flex items-center gap-5">
            <ProgressRing value={salesRate} />
            <div className="min-w-0 flex-1 space-y-2">
              <FunnelRow label="WO Masuk" value={tenDayWOs.length} total={tenDayWOs.length} tone="bg-blue-500" />
              <FunnelRow label="Disetujui" value={tenDayWOs.filter(wo => ['Proses', 'Selesai', 'Invoiced'].includes(wo.status)).length} total={tenDayWOs.length} tone="bg-cyan-500" />
              <FunnelRow label="Menjadi Invoice" value={convertedWOs.length} total={tenDayWOs.length} tone="bg-emerald-500" />
              <FunnelRow label="Lunas" value={convertedWOs.filter(wo => visibleInvoices.some(invoice => (invoice.woId === wo.id || invoice.woNumber === wo.woNumber) && invoice.status === 'Lunas')).length} total={tenDayWOs.length} tone="bg-violet-500" />
            </div>
          </div>
          <p className={`mt-4 rounded-lg px-3 py-2 text-xs ${salesRate >= 70 ? 'bg-emerald-50 text-emerald-700' : salesRate >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{salesRate >= 70 ? 'Konversi baik. Pertahankan kecepatan follow-up estimasi.' : salesRate >= 50 ? 'Konversi cukup. Periksa WO pending yang belum disetujui.' : 'Konversi rendah. Prioritaskan follow-up pelanggan dan evaluasi estimasi.'}</p>
        </div>
      </section>}

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div><h2 className="font-bold text-slate-900">Performa Cabang · 10 Hari</h2><p className="text-xs text-slate-500">Konversi dan penerimaan per cabang.</p></div>{currentBranchId === 'ALL' && <span className="text-xs text-slate-400">{branchPerformance.length} cabang</span>}</div>
          <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-2.5">Cabang</th><th className="px-3 py-2.5 text-center">WO</th><th className="px-3 py-2.5 text-center">Invoice</th><th className="px-3 py-2.5">Konversi</th>{canViewFinancial && <><th className="px-3 py-2.5 text-right">Kas Masuk</th><th className="px-4 py-2.5 text-right">Piutang</th></>}</tr></thead><tbody className="divide-y divide-slate-100">{branchPerformance.map(branch => <tr key={branch.id} className="hover:bg-slate-50"><td className="px-4 py-3"><b className="text-slate-800">{branch.name.replace('CABANG ', '')}</b><small className="block text-slate-400">{branch.code}</small></td><td className="px-3 text-center font-semibold">{branch.wo}</td><td className="px-3 text-center font-semibold text-emerald-700">{branch.converted}</td><td className="px-3"><div className="flex items-center gap-2"><div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-500" style={{ width: `${branch.rate}%` }} /></div><span className="text-xs font-semibold">{branch.rate}%</span></div></td>{canViewFinancial && <><td className="px-3 text-right font-semibold text-emerald-700">{compactMoney(branch.cash)}</td><td className="px-4 text-right font-semibold text-amber-700">{compactMoney(branch.receivable)}</td></>}</tr>)}</tbody></table>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between"><div><h2 className="font-bold text-slate-900">Perlu Perhatian</h2><p className="text-xs text-slate-500">Prioritas tindak lanjut hari ini.</p></div><AlertTriangle className="h-5 w-5 text-amber-500" /></div>
          <div className="space-y-2">
            <AttentionRow to="/workorders" tone="amber" icon={Clock3} title={`${stalePending.length} WO pending lebih dari 7 hari`} detail="Hubungi pelanggan atau tutup WO yang tidak dilanjutkan." />
            {canViewFinancial && <AttentionRow to="/invoices" tone="red" icon={FileText} title={`${overdueInvoices.length} faktur menunggak lebih dari 7 hari`} detail={`Total piutang ${rupiah(receivables)}`} />}
            {canViewFinancial && <AttentionRow to="/branch-deposits" tone="blue" icon={Banknote} title={`${rupiah(unsubmitted)} tunai belum disetor`} detail="Periksa setoran tunai masing-masing cabang." />}
            <AttentionRow to="/workorders" tone="emerald" icon={Wrench} title={`${statusCounts.process} kendaraan sedang dikerjakan`} detail={`${statusCounts.diagnosis} diagnosa dan ${statusCounts.pending} menunggu persetujuan.`} />
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

function CashFlowChart({ rows }: { rows: TrendDay[] }) {
  const max = Math.max(1, ...rows.flatMap(row => [row.cashIn, row.cashOut]));
  return <div className="flex h-44 items-end gap-2 border-b border-slate-200 px-1 pt-4">{rows.map(row => <div key={row.date} className="flex h-full min-w-0 flex-1 flex-col justify-end"><div className="flex flex-1 items-end justify-center gap-1"><div title={`Masuk ${rupiah(row.cashIn)}`} className="w-2.5 rounded-t bg-emerald-500 transition-all hover:bg-emerald-600" style={{ height: `${Math.max(row.cashIn ? 4 : 0, (row.cashIn / max) * 100)}%` }} /><div title={`Keluar ${rupiah(row.cashOut)}`} className="w-2.5 rounded-t bg-red-400 transition-all hover:bg-red-500" style={{ height: `${Math.max(row.cashOut ? 4 : 0, (row.cashOut / max) * 100)}%` }} /></div><span className="mt-1.5 text-center text-[10px] text-slate-500">{row.label}</span></div>)}</div>;
}

function ProgressRing({ value }: { value: number }) {
  const safe = Math.max(0, Math.min(100, value));
  return <div className="relative h-28 w-28 flex-shrink-0 rounded-full" style={{ background: `conic-gradient(#10b981 ${safe * 3.6}deg,#e2e8f0 0deg)` }}><div className="absolute inset-2.5 flex flex-col items-center justify-center rounded-full bg-white"><b className="text-2xl text-slate-900">{safe}%</b><span className="text-[10px] text-slate-500">berhasil</span></div></div>;
}

function FunnelRow({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  return <div><div className="mb-1 flex justify-between text-xs"><span className="text-slate-600">{label}</span><b>{value}</b></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${tone}`} style={{ width: `${percent(value, total)}%` }} /></div></div>;
}

const kpiTones = {
  emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100', blue: 'bg-blue-50 text-blue-600 ring-blue-100',
  amber: 'bg-amber-50 text-amber-600 ring-amber-100', red: 'bg-red-50 text-red-600 ring-red-100',
};
function KpiCard({ label, value, note, icon: Icon, tone }: { label: string; value: string; note: string; icon: any; tone: keyof typeof kpiTones }) {
  return <article className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ring-1 ${kpiTones[tone]}`}><Icon className="h-5 w-5" /></span><div className="min-w-0"><p className="truncate text-xs font-medium text-slate-500">{label}</p><p className="truncate text-xl font-bold text-slate-900">{value}</p><p className="truncate text-[11px] text-slate-400">{note}</p></div></article>;
}

const attentionTones = { amber: 'bg-amber-50 text-amber-600', red: 'bg-red-50 text-red-600', blue: 'bg-blue-50 text-blue-600', emerald: 'bg-emerald-50 text-emerald-600' };
function AttentionRow({ to, title, detail, icon: Icon, tone }: { to: string; title: string; detail: string; icon: any; tone: keyof typeof attentionTones }) {
  return <Link to={to} className="group flex items-start gap-3 rounded-lg border border-slate-100 p-2.5 hover:border-blue-200 hover:bg-blue-50/30"><span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${attentionTones[tone]}`}><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><b className="block text-xs text-slate-800">{title}</b><small className="block truncate text-[11px] text-slate-500">{detail}</small></span><ArrowRight className="mt-2 h-3.5 w-3.5 text-slate-300 group-hover:text-blue-500" /></Link>;
}

const stripTones = { blue: 'text-blue-600 bg-blue-50', amber: 'text-amber-600 bg-amber-50', emerald: 'text-emerald-600 bg-emerald-50' };
function FinanceStrip({ label, value, note, icon: Icon, tone, to }: { label: string; value: string; note: string; icon: any; tone: keyof typeof stripTones; to: string }) {
  return <Link to={to} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm hover:border-blue-200"><span className={`flex h-9 w-9 items-center justify-center rounded-lg ${stripTones[tone]}`}><Icon className="h-4 w-4" /></span><span><small className="block text-slate-500">{label}</small><b className="block text-slate-900">{value}</b><small className="text-[10px] text-slate-400">{note}</small></span></Link>;
}
