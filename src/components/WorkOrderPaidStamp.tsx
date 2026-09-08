import type { SalesInvoice, WorkOrder } from '../types';
import { timelineFinancialSummary } from '../lib/workOrderTimeline';

export default function WorkOrderPaidStamp({ wo, invoices }: { wo: WorkOrder; invoices: SalesInvoice[] }) {
  if (wo.status !== 'Selesai') return null;
  // Use only the authorized invoice snapshot, never the operational WO status.
  const invoice = invoices.find(candidate => candidate.branchId === wo.branchId
    && (wo.invoiceId ? candidate.id === wo.invoiceId : candidate.woId === wo.id));
  if (!timelineFinancialSummary(wo, invoice).isPaid) return null;
  return <span className="mt-0.5 inline-block rounded border border-emerald-600 px-1 text-[9px] font-extrabold leading-tight tracking-wider text-emerald-700">LUNAS</span>;
}