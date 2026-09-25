export type DashboardPeriod = 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth' | 'custom';
export type DashboardComparison = 'none' | 'previous' | 'lastYear';
export type DashboardRange = { from: string; to: string };
export type DashboardTargets = Partial<Record<'PERINTIS' | 'CAKALANG' | 'MAMUJU', number>>;

export type DashboardBranchInput = { id: string; name: string; code?: string; isActive?: boolean };
export type DashboardInvoiceInput = {
  id?: string; branchId: string; date: string; total: number; payment: number;
  woId?: string; woNumber?: string; status?: string;
};
export type DashboardWorkOrderInput = {
  id: string; branchId: string; date: string; status: string; woNumber?: string; invoiceId?: string;
};
export type DashboardPaymentInput = {
  branchId: string; date: string; amount: number; paymentMethod: string; status?: string;
};

export type DashboardBranchRow = {
  branchId: string;
  branchName: string;
  branchLabel: string;
  sales: number;
  invoiceCount: number;
  received: number;
  receivable: number;
  target: number | null;
  achievementPercent: number | null;
  projectedSales: number | null;
  paceTarget: number | null;
  paceDifference: number | null;
};

export type DashboardTrendRow = {
  key: string;
  label: string;
  from: string | null;
  to: string | null;
  previousFrom: string | null;
  previousTo: string | null;
  sales: number;
  previousSales: number | null;
};

export type DashboardMetricsInput = {
  /** Supply only branches the signed-in user is allowed to view. */
  branches: readonly DashboardBranchInput[];
  invoices: readonly DashboardInvoiceInput[];
  workOrders: readonly DashboardWorkOrderInput[];
  payments: readonly DashboardPaymentInput[];
  targets: DashboardTargets | null;
  branchId: string;
  range: DashboardRange;
  comparisonRange: DashboardRange | null;
  today: string;
};

export type DashboardMetrics = {
  sales: number;
  invoiceCount: number;
  averageInvoice: number;
  previousSales: number | null;
  receipts: number;
  cash: number;
  nonCash: number;
  receivable: number;
  receivableCount: number;
  target: number | null;
  achievementPercent: number | null;
  projectedSales: number | null;
  paceTarget: number | null;
  paceDifference: number | null;
  targetsComplete: boolean;
  rows: DashboardBranchRow[];
  workOrders: {
    total: number; register: number; process: number; completed: number; closed: number;
    active: number; invoiced: number; awaitingInvoice: number; conversionPercent: number;
  };
  trend: DashboardTrendRow[];
  trendUnit: 'day' | 'week';
};

const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 366;

function calendarDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

const keyOf = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (key: string, days: number) => keyOf(new Date(calendarDate(key)!.getTime() + days * DAY_MS));
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
const monthDayKey = (year: number, month: number, day: number) => `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

function shiftMonth(key: string, amount: number): string {
  const date = calendarDate(key)!;
  const shifted = new Date(date);
  shifted.setUTCDate(1);
  shifted.setUTCMonth(shifted.getUTCMonth() + amount);
  return monthDayKey(shifted.getUTCFullYear(), shifted.getUTCMonth(), Math.min(date.getUTCDate(), daysInMonth(shifted.getUTCFullYear(), shifted.getUTCMonth())));
}

export function dashboardDays(range: DashboardRange): number {
  const from = calendarDate(range.from);
  const to = calendarDate(range.to);
  return from && to && to >= from ? Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1 : 0;
}

export function isDashboardRangeValid(range: DashboardRange, today: string): boolean {
  const days = dashboardDays(range);
  return Boolean(calendarDate(today)) && days > 0 && days <= MAX_RANGE_DAYS && range.to <= today;
}

export function getDashboardRange(period: DashboardPeriod, today: string, custom: DashboardRange): DashboardRange {
  const date = calendarDate(today);
  if (!date) throw new RangeError('Tanggal hari ini tidak valid.');
  switch (period) {
    case 'today': return { from: today, to: today };
    case 'yesterday': return { from: addDays(today, -1), to: addDays(today, -1) };
    case 'last7': return { from: addDays(today, -6), to: today };
    case 'thisMonth': return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'lastMonth': {
      const to = addDays(`${today.slice(0, 7)}-01`, -1);
      return { from: `${to.slice(0, 7)}-01`, to };
    }
    case 'custom': return { ...custom };
  }
}

export function getDashboardComparisonRange(range: DashboardRange, comparison: DashboardComparison, period: DashboardPeriod): DashboardRange | null {
  const days = dashboardDays(range);
  if (comparison === 'none' || days < 1 || days > MAX_RANGE_DAYS) return null;
  if (comparison === 'lastYear') return { from: shiftMonth(range.from, -12), to: shiftMonth(range.to, -12) };
  if (period === 'thisMonth') return { from: shiftMonth(range.from, -1), to: shiftMonth(range.to, -1) };
  if (period === 'lastMonth') {
    const to = addDays(range.from, -1);
    return { from: `${to.slice(0, 7)}-01`, to };
  }
  return { from: addDays(range.from, -days), to: addDays(range.from, -1) };
}

const amount = (value: number) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const within = (date: string, range: DashboardRange) => date >= range.from && date <= range.to;
const sum = <T,>(rows: readonly T[], value: (row: T) => number) => rows.reduce((total, row) => total + value(row), 0);
const percent = (value: number, total: number) => total > 0 ? Math.round(value / total * 1000) / 10 : 0;
const receivableOf = (invoice: DashboardInvoiceInput) => Math.max(0, amount(invoice.total) - amount(invoice.payment));
const validTransaction = (row: { date: string; status?: string }, today: string) => Boolean(calendarDate(row.date)) && row.date <= today && !['draft', 'cancelled', 'canceled', 'batal', 'dibatalkan', 'void'].includes((row.status || '').trim().toLowerCase());

function targetKey(branch: DashboardBranchInput): keyof DashboardTargets | null {
  const words = `${branch.name} ${branch.code || ''}`.toUpperCase().split(/[^A-Z]+/);
  const matches = (['PERINTIS', 'CAKALANG', 'MAMUJU'] as const).filter(key => words.includes(key));
  return matches.length === 1 ? matches[0] : null;
}

function shortDate(key: string): string {
  return calendarDate(key)!.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function buildTrend(invoices: readonly DashboardInvoiceInput[], range: DashboardRange, comparisonRange: DashboardRange | null): { trend: DashboardTrendRow[]; trendUnit: 'day' | 'week' } {
  const currentDays = dashboardDays(range);
  const previousDays = comparisonRange ? dashboardDays(comparisonRange) : 0;
  const longestDays = Math.max(currentDays, previousDays);
  const step = longestDays <= 31 ? 1 : 7;
  const dailySales = new Map<string, number>();
  for (const invoice of invoices) dailySales.set(invoice.date, (dailySales.get(invoice.date) || 0) + amount(invoice.total));
  const bucket = (period: DashboardRange | null, offset: number) => {
    if (!period || offset >= dashboardDays(period)) return null;
    const from = addDays(period.from, offset);
    const to = addDays(from, Math.min(step, dashboardDays({ from, to: period.to })) - 1);
    let sales = 0;
    for (let index = 0; index < dashboardDays({ from, to }); index++) sales += dailySales.get(addDays(from, index)) || 0;
    return { from, to, sales };
  };
  const trend = Array.from({ length: Math.ceil(longestDays / step) }, (_, index): DashboardTrendRow => {
    const current = bucket(range, index * step);
    const previous = bucket(comparisonRange, index * step);
    const label = current ? current.from === current.to ? shortDate(current.from) : `${shortDate(current.from)}–${shortDate(current.to)}` : `Pembanding ${index + 1}`;
    return {
      key: current?.from || `previous-${previous!.from}`,
      label,
      from: current?.from || null,
      to: current?.to || null,
      previousFrom: previous?.from || null,
      previousTo: previous?.to || null,
      sales: current?.sales || 0,
      previousSales: previous?.sales ?? null,
    };
  });
  return { trend, trendUnit: step === 1 ? 'day' : 'week' };
}

export function buildDashboardMetrics(input: DashboardMetricsInput): DashboardMetrics {
  const { range, comparisonRange, today, targets } = input;
  // Shifting a 366-day custom range by one calendar year can include a leap
  // day, yielding 367 comparator days. Preserve its exact calendar endpoints.
  const comparisonDays = comparisonRange ? dashboardDays(comparisonRange) : 0;
  const validComparison = !comparisonRange || (comparisonDays > 0 && comparisonDays <= MAX_RANGE_DAYS + 1 && comparisonRange.to <= today);
  if (!isDashboardRangeValid(range, today) || !validComparison) {
    throw new RangeError('Periode dashboard harus valid, maksimal 366 hari, dan tidak melewati hari ini.');
  }
  const branches = input.branches.filter(branch => branch.isActive !== false && (input.branchId === 'ALL' || branch.id === input.branchId));
  const branchIds = new Set(branches.map(branch => branch.id));
  const invoices = input.invoices.filter(invoice => branchIds.has(invoice.branchId) && validTransaction(invoice, today));
  const payments = input.payments.filter(payment => branchIds.has(payment.branchId) && validTransaction(payment, today) && within(payment.date, range));
  const periodInvoices = invoices.filter(invoice => within(invoice.date, range));
  const workOrders = input.workOrders.filter(wo => branchIds.has(wo.branchId) && calendarDate(wo.date) && wo.date <= today && within(wo.date, range));
  const todayDate = calendarDate(today)!;
  const isCurrentMonth = range.from === `${today.slice(0, 7)}-01` && range.to === today;
  const monthDays = daysInMonth(todayDate.getUTCFullYear(), todayDate.getUTCMonth());
  const elapsedDays = todayDate.getUTCDate();
  const invoicesByBranch = new Map<string, DashboardInvoiceInput[]>();
  const paymentsByBranch = new Map<string, DashboardPaymentInput[]>();
  const invoicedIds = new Set<string>();
  const invoicedNumbers = new Set<string>();
  const invoiceIds = new Set<string>();
  const scopedKey = (branchId: string, id: string) => JSON.stringify([branchId, id]);
  for (const invoice of invoices) {
    const list = invoicesByBranch.get(invoice.branchId) || [];
    list.push(invoice);
    invoicesByBranch.set(invoice.branchId, list);
    if (invoice.woId) invoicedIds.add(scopedKey(invoice.branchId, invoice.woId));
    if (invoice.woNumber) invoicedNumbers.add(scopedKey(invoice.branchId, invoice.woNumber));
    if (invoice.id) invoiceIds.add(scopedKey(invoice.branchId, invoice.id));
  }
  for (const payment of payments) {
    const list = paymentsByBranch.get(payment.branchId) || [];
    list.push(payment);
    paymentsByBranch.set(payment.branchId, list);
  }
  const rows = branches.map((branch): DashboardBranchRow => {
    const all = invoicesByBranch.get(branch.id) || [];
    const period = all.filter(invoice => within(invoice.date, range));
    const sales = sum(period, invoice => amount(invoice.total));
    const key = targetKey(branch);
    const configuredTarget = key && targets ? amount(targets[key] || 0) : 0;
    const target = isCurrentMonth && configuredTarget > 0 ? configuredTarget : null;
    const paceTarget = target === null ? null : Math.round(target * elapsedDays / monthDays);
    return {
      branchId: branch.id,
      branchName: branch.name,
      branchLabel: branch.name.replace(/^CABANG\s+/i, ''),
      sales,
      invoiceCount: period.length,
      received: sum(paymentsByBranch.get(branch.id) || [], payment => amount(payment.amount)),
      receivable: sum(all, receivableOf),
      target,
      achievementPercent: target === null ? null : percent(sales, target),
      projectedSales: isCurrentMonth ? Math.round(sales / elapsedDays * monthDays) : null,
      paceTarget,
      paceDifference: paceTarget === null ? null : sales - paceTarget,
    };
  });
  const sales = sum(periodInvoices, invoice => amount(invoice.total));
  const targetsComplete = rows.length > 0 && rows.every(row => row.target !== null);
  const target = targetsComplete ? sum(rows, row => row.target!) : null;
  const paceTarget = targetsComplete ? sum(rows, row => row.paceTarget!) : null;
  const hasInvoice = (wo: DashboardWorkOrderInput) => invoicedIds.has(scopedKey(wo.branchId, wo.id))
    || Boolean(wo.woNumber && invoicedNumbers.has(scopedKey(wo.branchId, wo.woNumber)))
    || Boolean(wo.invoiceId && invoiceIds.has(scopedKey(wo.branchId, wo.invoiceId)));
  const register = workOrders.filter(wo => wo.status === 'Register').length;
  const process = workOrders.filter(wo => wo.status === 'Proses').length;
  const cash = sum(payments.filter(payment => ['tunai', 'cash'].includes(payment.paymentMethod.trim().toLowerCase())), payment => amount(payment.amount));
  const receipts = sum(payments, payment => amount(payment.amount));
  return {
    sales,
    invoiceCount: periodInvoices.length,
    averageInvoice: periodInvoices.length > 0 ? sales / periodInvoices.length : 0,
    previousSales: comparisonRange ? sum(invoices.filter(invoice => within(invoice.date, comparisonRange)), invoice => amount(invoice.total)) : null,
    receipts,
    cash,
    nonCash: receipts - cash,
    receivable: sum(invoices, receivableOf),
    receivableCount: invoices.filter(invoice => receivableOf(invoice) > 0).length,
    target,
    achievementPercent: target === null ? null : percent(sales, target),
    projectedSales: isCurrentMonth ? Math.round(sales / elapsedDays * monthDays) : null,
    paceTarget,
    paceDifference: paceTarget === null ? null : sales - paceTarget,
    targetsComplete,
    rows,
    workOrders: {
      total: workOrders.length,
      register,
      process,
      completed: workOrders.filter(wo => wo.status === 'Selesai').length,
      closed: workOrders.filter(wo => wo.status === 'Closed').length,
      active: register + process,
      invoiced: workOrders.filter(hasInvoice).length,
      awaitingInvoice: workOrders.filter(wo => wo.status === 'Selesai' && !hasInvoice(wo)).length,
      conversionPercent: percent(workOrders.filter(hasInvoice).length, workOrders.length),
    },
    ...buildTrend(invoices, range, comparisonRange),
  };
}
