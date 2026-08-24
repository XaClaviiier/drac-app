import type { SalesInvoice, WorkOrder } from '../types';

export type WorkOrderAttentionKind = 'register' | 'process' | 'invoice' | 'payment';

export type WorkOrderAttentionItem = {
  kind: WorkOrderAttentionKind;
  workOrder: WorkOrder;
  invoice?: SalesInvoice;
  label: string;
  description: string;
};

export const WORK_ORDER_ATTENTION_LABELS: Record<WorkOrderAttentionKind, string> = {
  register: 'Register Mengambang',
  process: 'Dikerjakan Terlambat',
  invoice: 'Selesai Belum Faktur',
  payment: 'Faktur Belum Lunas',
};

export function buildWorkOrderAttentionItems(
  workOrders: WorkOrder[],
  invoices: SalesInvoice[],
  today: string,
): WorkOrderAttentionItem[] {
  const invoiceById = new Map(invoices.map(invoice => [invoice.id, invoice]));
  const invoiceByWorkOrder = new Map(
    invoices.filter(invoice => invoice.woId).map(invoice => [invoice.woId as string, invoice]),
  );

  return workOrders.flatMap((workOrder): WorkOrderAttentionItem[] => {
    if (workOrder.continuedToWoId || workOrder.status === 'Closed') return [];

    if (workOrder.status === 'Register' && workOrder.date < today) {
      return [{
        kind: 'register',
        workOrder,
        label: WORK_ORDER_ATTENTION_LABELS.register,
        description: 'Belum diputuskan menjadi Dikerjakan atau Lost Sales sampai lewat hari transaksi.',
      }];
    }

    if (workOrder.status === 'Proses' && workOrder.date < today) {
      return [{
        kind: 'process',
        workOrder,
        label: WORK_ORDER_ATTENTION_LABELS.process,
        description: 'Pekerjaan masih berstatus Dikerjakan setelah melewati hari transaksi.',
      }];
    }

    const invoice = (workOrder.invoiceId ? invoiceById.get(workOrder.invoiceId) : undefined)
      || invoiceByWorkOrder.get(workOrder.id);

    if (workOrder.status === 'Selesai' && !invoice) {
      return [{
        kind: 'invoice',
        workOrder,
        label: WORK_ORDER_ATTENTION_LABELS.invoice,
        description: 'Pekerjaan sudah selesai tetapi belum dibuatkan faktur penjualan.',
      }];
    }

    if (invoice && invoice.payment < invoice.total) {
      return [{
        kind: 'payment',
        workOrder,
        invoice,
        label: WORK_ORDER_ATTENTION_LABELS.payment,
        description: `Sisa tagihan Rp ${Math.max(invoice.total - invoice.payment, 0).toLocaleString('id-ID')}.`,
      }];
    }

    return [];
  }).sort((left, right) => left.workOrder.date.localeCompare(right.workOrder.date));
}

export function countWorkOrderAttentionByKind(items: WorkOrderAttentionItem[]) {
  return items.reduce<Record<WorkOrderAttentionKind, number>>(
    (counts, item) => ({ ...counts, [item.kind]: counts[item.kind] + 1 }),
    { register: 0, process: 0, invoice: 0, payment: 0 },
  );
}
