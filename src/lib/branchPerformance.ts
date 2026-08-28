export type PerformanceStatus = 'green' | 'amber' | 'red';
export type BranchTargetKey = 'PERINTIS' | 'CAKALANG' | 'MAMUJU';
export type BranchMonthlyTargets = Record<BranchTargetKey, number>;

type BranchInput = {
  id: string;
  code?: string;
  name: string;
  isActive?: boolean;
};

type InvoiceInput = {
  branchId: string;
  date: string;
  total: number;
  payment: number;
};

export type BranchPerformanceRow = {
  branchId: string;
  branchName: string;
  branchLabel: string;
  target: number;
  sales: number;
  received: number;
  receivable: number;
  invoiceCount: number;
  achievementPercent: number;
  remainingTarget: number;
  dailyTarget: number;
  paceTarget: number;
  paceDifference: number;
  projectedSales: number;
  status: PerformanceStatus;
};

export type BranchPerformanceSummary = {
  period: {
    from: string;
    to: string;
    daysInMonth: number;
    elapsedDays: number;
  };
  rows: BranchPerformanceRow[];
  total: Omit<BranchPerformanceRow, 'branchId' | 'branchName' | 'branchLabel'>;
};

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const normalizedBranchKey = (branch: BranchInput): BranchTargetKey | undefined => {
  const value = `${branch.name} ${branch.code || ''}`.toUpperCase();
  if (value.includes('PERINTIS')) return 'PERINTIS';
  if (value.includes('CAKALANG')) return 'CAKALANG';
  if (value.includes('MAMUJU')) return 'MAMUJU';
  return undefined;
};

const statusForPace = (sales: number, paceTarget: number): PerformanceStatus => {
  if (paceTarget <= 0 || sales >= paceTarget) return 'green';
  if (sales >= paceTarget * 0.85) return 'amber';
  return 'red';
};

const roundPercent = (value: number, total: number) => total > 0 ? Math.round((value / total) * 1000) / 10 : 0;

export function buildBranchPerformanceSummary({
  branches,
  invoices,
  targets,
  now = new Date(),
}: {
  branches: BranchInput[];
  invoices: InvoiceInput[];
  targets: BranchMonthlyTargets;
  now?: Date;
}): BranchPerformanceSummary {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const elapsedDays = Math.max(1, Math.min(now.getDate(), daysInMonth));
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const to = dateKey(now);

  const rows = branches
    .filter(branch => branch.isActive !== false)
    .map(branch => ({ branch, key: normalizedBranchKey(branch) }))
    .filter((entry): entry is { branch: BranchInput; key: BranchTargetKey } => Boolean(entry.key))
    .sort((left, right) => ['PERINTIS', 'CAKALANG', 'MAMUJU'].indexOf(left.key) - ['PERINTIS', 'CAKALANG', 'MAMUJU'].indexOf(right.key))
    .map(({ branch, key }): BranchPerformanceRow => {
      const branchInvoices = invoices.filter(invoice => invoice.branchId === branch.id && invoice.date >= from && invoice.date <= to);
      const target = Math.max(0, Number(targets[key] || 0));
      const sales = branchInvoices.reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total || 0)), 0);
      const received = branchInvoices.reduce((sum, invoice) => sum + Math.max(0, Number(invoice.payment || 0)), 0);
      const receivable = branchInvoices.reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total || 0) - Number(invoice.payment || 0)), 0);
      const dailyTarget = Math.round(target / daysInMonth);
      const paceTarget = Math.round((target * elapsedDays) / daysInMonth);
      const projectedSales = Math.round((sales / elapsedDays) * daysInMonth);
      return {
        branchId: branch.id,
        branchName: branch.name,
        branchLabel: key.charAt(0) + key.slice(1).toLowerCase(),
        target,
        sales,
        received,
        receivable,
        invoiceCount: branchInvoices.length,
        achievementPercent: roundPercent(sales, target),
        remainingTarget: Math.max(0, target - sales),
        dailyTarget,
        paceTarget,
        paceDifference: sales - paceTarget,
        projectedSales,
        status: statusForPace(sales, paceTarget),
      };
    });

  const target = rows.reduce((sum, row) => sum + row.target, 0);
  const sales = rows.reduce((sum, row) => sum + row.sales, 0);
  const received = rows.reduce((sum, row) => sum + row.received, 0);
  const receivable = rows.reduce((sum, row) => sum + row.receivable, 0);
  const paceTarget = rows.reduce((sum, row) => sum + row.paceTarget, 0);

  return {
    period: { from, to, daysInMonth, elapsedDays },
    rows,
    total: {
      target,
      sales,
      received,
      receivable,
      invoiceCount: rows.reduce((sum, row) => sum + row.invoiceCount, 0),
      achievementPercent: roundPercent(sales, target),
      remainingTarget: Math.max(0, target - sales),
      dailyTarget: Math.round(target / daysInMonth),
      paceTarget,
      paceDifference: sales - paceTarget,
      projectedSales: rows.reduce((sum, row) => sum + row.projectedSales, 0),
      status: statusForPace(sales, paceTarget),
    },
  };
}
