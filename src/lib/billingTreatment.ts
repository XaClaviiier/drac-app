import type { BillingTreatment } from '../types';

export const isGoodwill = (document?: { billingTreatment?: BillingTreatment } | null) => document?.billingTreatment === 'goodwill';

export function validBillingTotal(total: number, treatment?: BillingTreatment) {
  return Number.isFinite(total) && (treatment === 'goodwill' ? total === 0 : total > 0);
}

export function invoiceStatusLabel(invoice: { billingTreatment?: BillingTreatment; status: string }) {
  return isGoodwill(invoice) ? 'Gratis / Goodwill' : invoice.status;
}
