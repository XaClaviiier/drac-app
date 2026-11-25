import type { WorkOrder } from '../types';
import type { TimelineStageKey } from './workOrderTimeline';

export type OperatingHours = { days: number[]; start: string; end: string; breakStart?: string; breakEnd?: string; holidays?: string[] };
export type HistoryStage = TimelineStageKey | 'done';
export type DailySegment = { key: TimelineStageKey; start: Date; end: Date; duration: number; active: boolean };
export const WORKSHOP_HOURS: OperatingHours = { days: [0, 1, 2, 3, 4, 5, 6], start: '08:00', end: '17:30' };
const DAY = 86400000;
const WITA = 8 * 3600000;
export const witaDate = (date: Date) => new Date(date.getTime() + WITA).toISOString().slice(0, 10);
export const witaMinute = (date: Date) => { const d = new Date(date.getTime() + WITA); return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60; };
const at = (day: string, time = '00:00') => new Date(`${day}T${time.slice(0, 5)}:00+08:00`);
function timestamp(value?: string) {
  if (!value) return NaN;
  const normalized = value.replace(' ', 'T');
  return new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(normalized) ? normalized : `${normalized}+08:00`).getTime();
}
const coreStage = (status: string): HistoryStage | null => status === 'Proses' ? 'working' : status === 'Register' ? 'diagnosis' : ['Closed', 'Batal'].includes(status) ? 'lost' : ['Selesai', 'Invoiced', 'Dibayar'].includes(status) ? 'done' : null;
const activeStage = (stage: HistoryStage) => stage !== 'lost' && stage !== 'done';

export function overtimeSessions(wo: WorkOrder, now: Date) {
  const sessions: Array<{ start: number; end: number }> = [];
  let start: number | null = null;
  let limit = 0;
  const close = (end: number) => { if (start !== null) sessions.push({ start, end: Math.max(start, Math.min(end, limit)) }); start = null; };
  for (const log of [...(wo.statusLog || [])].sort((a, b) => timestamp(a.at) - timestamp(b.at))) {
    const time = timestamp(log.at);
    if (!Number.isFinite(time) || time > now.getTime()) continue;
    if (start !== null && time >= limit) close(limit);
    if (log.reason?.includes('[WO_OVERTIME:start]') && start === null) {
      start = time;
      limit = at(witaDate(new Date(time)), '08:00').getTime();
      if (limit <= time) limit += DAY;
    } else if (log.reason?.includes('[WO_OVERTIME:stop]') || (log.from !== log.to && log.to !== 'Proses') || /\[WO_TIMELINE_STAGE:(parts|approval|diagnosis)\]/.test(log.reason || '')) close(time);
  }
  const active = start !== null && now.getTime() < limit && wo.status === 'Proses';
  close(now.getTime());
  return { sessions, active };
}

export function operatingMilliseconds(start: number, end: number, schedule: OperatingHours) {
  let result = 0;
  for (let day = at(witaDate(new Date(start))).getTime(); day < end; day += DAY) {
    const key = witaDate(new Date(day));
    if (!schedule.days.includes(new Date(day + WITA).getUTCDay()) || schedule.holidays?.includes(key)) continue;
    const left = Math.max(start, at(key, schedule.start).getTime());
    const right = Math.min(end, at(key, schedule.end).getTime());
    if (right <= left) continue;
    result += right - left;
    if (schedule.breakStart && schedule.breakEnd) result -= Math.max(0, Math.min(right, at(key, schedule.breakEnd).getTime()) - Math.max(left, at(key, schedule.breakStart).getTime()));
  }
  return result;
}

/** Replay all visits, including reopening after Lost Sales or completion. Never change the WO date. */
export function workOrderDay(wo: WorkOrder, selectedDate: string, now: Date, schedule: OperatingHours = WORKSHOP_HOURS) {
  const dayStart = at(selectedDate).getTime();
  const dayEnd = dayStart + DAY;
  const cutoff = Math.min(dayEnd, now.getTime());
  const start = at(wo.date.slice(0, 10), wo.transactionTime || '08:00').getTime();
  const transactionDay = wo.date.slice(0, 10);
  const createdAt = timestamp(wo.createdAt);
  // Input historis dibuat hari ini tetap menjadi kunjungan pada tanggal transaksi.
  // Audit Register/Proses/Selesai yang tercatat saat input tidak boleh membuatnya
  // muncul di papan hari ini.
  const isBackdatedEntry = Number.isFinite(createdAt) && witaDate(new Date(createdAt)) !== transactionDay;
  const events: Array<{ time: number; stage: HistoryStage }> = [];
  let approximate = false;
  let originalEndUnknown = false;
  let resumedVisit = false;
  const logs = (wo.statusLog || []).map(log => ({ log, time: timestamp(log.at) }))
    .filter(({ time }) => Number.isFinite(time) && time >= start)
    .sort((a, b) => a.time - b.time);
  for (const { log, time } of logs) {
    const marker = log.reason?.match(/\[WO_TIMELINE_STAGE:(diagnosis|working|parts|approval)\]/i)?.[1]?.toLowerCase() as HistoryStage | undefined;
    const next = marker || (log.from !== log.to ? coreStage(log.to) : null);
    if (!next) continue;
    if (isBackdatedEntry && witaDate(new Date(time)) !== transactionDay && !resumedVisit) {
      // Older returns reopened the same WO. An explicit reopening starts a real visit.
      const previous = coreStage(log.from);
      if (log.from === log.to || !previous || activeStage(previous) || !activeStage(next)) continue;
      const last = events[events.length - 1];
      if (last?.stage !== previous) {
        events.push({ time: last?.time ?? start, stage: previous });
        originalEndUnknown = true;
      }
      resumedVisit = true;
    }
    events.push({ time, stage: next });
  }
  // Older records may have no status audit. Use the recorded work start/last update,
  // never project today's final status backwards over an audited earlier visit.
  const finalStage = coreStage(wo.status) || 'diagnosis';
  const updated = finalStage === 'lost' && wo.continuedToWoId ? NaN : timestamp(wo.updatedAt);
  const updatedOnTransactionDay = Number.isFinite(updated) && updated >= start && witaDate(new Date(updated)) === transactionDay;
  if (!events.length) {
    approximate = true;
    const workStart = timestamp(wo.workStartedAt);
    const workStartedOnTransactionDay = Number.isFinite(workStart)
      && witaDate(new Date(workStart)) === transactionDay;
    if (Number.isFinite(workStart) && workStart >= start && (!isBackdatedEntry || workStartedOnTransactionDay)) {
      events.push({ time: workStart, stage: 'working' });
    }
    if (finalStage === 'done' || finalStage === 'lost') {
      const lastKnownTime = events[events.length - 1]?.time ?? start;
      if (!updatedOnTransactionDay) originalEndUnknown = true;
      events.push({ time: Math.max(lastKnownTime, updatedOnTransactionDay ? updated : start), stage: finalStage });
    } else if (!events.length && finalStage !== 'diagnosis') events.push({ time: start, stage: finalStage });
  }
  const last = events[events.length - 1];
  if ((finalStage === 'done' || finalStage === 'lost') && last?.stage !== finalStage) {
    events.push({
      time: Math.max(last?.time ?? start, updatedOnTransactionDay ? updated : start),
      stage: finalStage,
    });
    approximate = true;
  } else if (finalStage === 'working' && last && !activeStage(last.stage)) {
    const restart = timestamp(wo.workStartedAt);
    if (Number.isFinite(restart) && restart > last.time) { events.push({ time: restart, stage: 'working' }); approximate = true; }
  }
  const continued = timestamp(wo.continuedAt);
  const transferred = wo.continuedToWoId && finalStage !== 'lost';
  if (transferred && Number.isFinite(continued)) events.push({ time: continued, stage: 'done' });
  events.sort((a, b) => a.time - b.time);
  let stage: HistoryStage = 'diagnosis';
  let cursor = start;
  let visible = start >= dayStart && start < dayEnd && start <= cutoff;
  let visitStart = start;
  let visitEnd = start;
  let workingMs = 0;
  let overtimeMs = 0;
  let presenceMs = 0;
  const overtime = overtimeSessions(wo, new Date(cutoff));
  const segments: DailySegment[] = [];
  const append = (end: number, ongoing: boolean) => {
    if (end <= cursor || !activeStage(stage)) return;
    const left = Math.max(cursor, dayStart), right = Math.min(end, cutoff);
    if (right > left) {
      visible = true;
      const windows = [{ start: at(selectedDate, schedule.start).getTime(), end: at(selectedDate, schedule.end).getTime() }, ...overtime.sessions];
      for (const window of windows) {
        const from = Math.max(left, window.start), to = Math.min(right, window.end);
        if (to > from) segments.push({ key: stage as TimelineStageKey, start: new Date(from), end: new Date(to), duration: to - from, active: ongoing && to === now.getTime() && selectedDate === witaDate(now) });
      }
    }
    visitEnd = end;
    if (schedule) {
      const duration = operatingMilliseconds(cursor, end, schedule);
      presenceMs += duration;
      if (stage === 'working') workingMs += duration;
    }
    if (stage === 'working') for (const session of overtime.sessions) {
      const from = Math.max(cursor, session.start), to = Math.min(end, session.end);
      if (to > from) overtimeMs += to - from - operatingMilliseconds(from, to, schedule);
    }
  };
  for (const event of events) {
    if (event.time > cutoff || event.time >= dayEnd) break;
    if (event.stage === stage) continue; // progress heartbeat is not a new visit
    append(event.time, false);
    if (!activeStage(stage) && activeStage(event.stage)) {
      visitStart = event.time;
      workingMs = 0;
      overtimeMs = 0;
      presenceMs = 0;
    }
    if (event.time >= dayStart && event.time < dayEnd) {
      visible = true;
      if (event.stage === 'lost') segments.push({ key: 'lost', start: new Date(event.time), end: new Date(Math.min(event.time + 600000, cutoff)), duration: 0, active: false });
    }
    stage = event.stage;
    cursor = event.time;
    visitEnd = event.time;
  }
  append(cutoff, true);
  if (transferred && !Number.isFinite(continued)) visible = false;
  if (cutoff < start || selectedDate > witaDate(now)) visible = false;
  const visitDay = Math.max(1, Math.round((at(witaDate(new Date(Math.max(visitStart, visitEnd - 1)))).getTime() - at(witaDate(new Date(visitStart))).getTime()) / DAY) + 1);
  approximate ||= originalEndUnknown && visitStart === start;
  const durationUnknown = visitStart === start && approximate && (isBackdatedEntry || originalEndUnknown) && workingMs === 0 && overtimeMs === 0;
  return { visible, stage, segments, visitDay, visitStart: new Date(visitStart), workingMs, overtimeMs, overtimeActive: overtime.active, presenceMs, ageDays: Math.max(0, Math.floor((dayStart - at(wo.date.slice(0, 10)).getTime()) / DAY)), approximate, durationUnknown };
}
