import type { LegacyWOStatus, WOStatus } from '../types';

export type DisplayWorkOrderStatus = WOStatus | LegacyWOStatus | string;

export const workOrderStatusLabel = (status: DisplayWorkOrderStatus): string => {
  if (status === 'Open' || status === 'Terbuka') return 'Register';
  if (status === 'Closed' || status === 'Batal') return 'Lost Sales';
  if (status === 'Proses') return 'Dikerjakan';
  if (status === 'Pengecekan' || status === 'Pending') return 'Register';
  if (status === 'Invoiced' || status === 'Dibayar') return 'Selesai';
  return status;
};

export const workOrderStatusTone = (status: DisplayWorkOrderStatus): string => {
  if (status === 'Open' || status === 'Terbuka') return 'bg-slate-100 text-slate-800';
  if (status === 'Closed' || status === 'Batal') return 'bg-rose-100 text-rose-800';
  if (status === 'Proses') return 'bg-blue-100 text-blue-800';
  if (status === 'Selesai' || status === 'Invoiced' || status === 'Dibayar') return 'bg-emerald-100 text-emerald-800';
  return 'bg-slate-100 text-slate-800';
};

export const isLostSalesStatus = (status: DisplayWorkOrderStatus): boolean =>
  status === 'Closed' || status === 'Batal';
