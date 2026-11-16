import type { GoodsReceipt, Permission, StockMovement, WorkOrder } from '../types';

type SourceLookups = {
  goodsReceipts: Pick<GoodsReceipt, 'id' | 'receiptNumber'>[];
  workOrders: Pick<WorkOrder, 'id' | 'woNumber'>[];
};

export function stockMovementSource(movement: StockMovement, data: SourceLookups): { path: string; permission: Permission } | null {
  const id = movement.referenceId?.trim();
  const number = movement.referenceNumber?.trim();
  const reference = id || number;
  if (!reference) return null;

  // Pembalik/koreksi tetap menunjuk dokumen asal melalui referenceType/referenceId.
  switch (movement.referenceType) {
    case 'warehouse_transfer':
      return { path: `/warehouse-transfers?view=${encodeURIComponent(reference)}`, permission: 'item:view' };
    case 'stock_opname':
      return { path: `/reports/stock-count-sheet?view=${encodeURIComponent(reference)}`, permission: 'stock_opname:view' };
    case 'stock_adjustment':
      return { path: `/opening-stock?view=${encodeURIComponent(reference)}`, permission: 'item:edit' };
    case 'item_usage':
      return { path: `/item-usages?view=${encodeURIComponent(reference)}`, permission: 'item_usage:view' };
    case 'sales_invoice':
      return { path: `/invoices?view=${encodeURIComponent(reference)}`, permission: 'invoice:view' };
    case 'goods_receipt': {
      const receiptId = id || data.goodsReceipts.find(receipt => receipt.receiptNumber === number)?.id;
      return receiptId ? { path: `/receipts/view/${encodeURIComponent(receiptId)}`, permission: 'receipt:view' } : null;
    }
    case 'work_order': {
      const workOrderId = id || data.workOrders.find(workOrder => workOrder.woNumber === number)?.id;
      return workOrderId ? { path: `/workorders?view=${encodeURIComponent(workOrderId)}`, permission: 'wo:view' } : null;
    }
    default:
      return null;
  }
}
