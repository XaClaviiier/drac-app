import type { LegacyWOStatus, WorkOrder, WorkOrderTimelineStage, WOStatus, WOStatusLog } from '../types';

export type TimelineStageKey = WorkOrderTimelineStage | 'lost';

export const TIMELINE_STAGE_MARKER = 'WO_TIMELINE_STAGE';

export function timelineStageReason(stage: WorkOrderTimelineStage, note = '') {
  return `[${TIMELINE_STAGE_MARKER}:${stage}]${note.trim() ? ` ${note.trim()}` : ''}`;
}

export function timelineStageFromReason(reason = ''): WorkOrderTimelineStage | null {
  const match = reason.match(/\[WO_TIMELINE_STAGE:(diagnosis|approval|parts|working)\]/i);
  return (match?.[1]?.toLowerCase() as WorkOrderTimelineStage | undefined) || null;
}

export function timelineStageFromWorkOrder(wo: WorkOrder): TimelineStageKey {
  if (wo.status === 'Closed') return 'lost';
  if (wo.status === 'Selesai') return 'working';
  const latestOperationalEvent = [...(wo.statusLog || [])].reverse().find(log => (
    Boolean(timelineStageFromReason(log.reason || ''))
    || log.to === 'Proses'
    || log.to === 'Closed'
    || log.to === 'Batal'
  ));
  const markedStage = timelineStageFromReason(latestOperationalEvent?.reason || '');
  if (markedStage) return markedStage;
  if (latestOperationalEvent?.to === 'Closed' || latestOperationalEvent?.to === 'Batal') return 'lost';
  if (latestOperationalEvent?.to === 'Proses') return 'working';
  if (wo.status === 'Proses') return 'working';
  if (/part|spare|stok|komponen/i.test(wo.pendingReason || '')) return 'parts';
  return 'diagnosis';
}

export function appendTimelineStageLog(
  wo: WorkOrder,
  stage: WorkOrderTimelineStage,
  at: string,
  actor: { id?: string; name?: string },
  note = '',
): WOStatusLog[] {
  return [
    ...(wo.statusLog || []),
    {
      from: wo.status as WOStatus | LegacyWOStatus,
      to: wo.status as WOStatus | LegacyWOStatus,
      at,
      byUserId: actor.id || '-',
      byUserName: actor.name || 'System',
      reason: timelineStageReason(stage, note),
    },
  ];
}
