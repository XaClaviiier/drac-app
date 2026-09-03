import type { WorkOrder, WOStatus } from '../types';

export function applyDemoWorkOrderEstimateClock(
  workOrder: WorkOrder,
  previousStatus?: WOStatus,
  now = new Date(),
): WorkOrder {
  const isStartingWork = workOrder.status === 'Proses' && previousStatus !== 'Proses';
  const durationMinutes = Number(workOrder.estimatedDurationMinutes);
  if (!isStartingWork) {
    return workOrder;
  }
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 1440) {
    throw new Error('Estimasi lama pekerjaan wajib diisi antara 15 menit sampai 24 jam.');
  }

  const existingStart = workOrder.workStartedAt ? new Date(workOrder.workStartedAt).getTime() : Number.NaN;
  const existingCompletion = workOrder.estimatedCompletionAt ? new Date(workOrder.estimatedCompletionAt).getTime() : Number.NaN;
  if (
    Number.isFinite(existingStart)
    && Number.isFinite(existingCompletion)
    && Math.abs((existingCompletion - existingStart) - durationMinutes * 60_000) < 1_000
  ) {
    return workOrder;
  }

  const startedAt = now.toISOString();
  return {
    ...workOrder,
    workStartedAt: startedAt,
    estimatedCompletionAt: new Date(now.getTime() + durationMinutes * 60_000).toISOString(),
  };
}
