import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, Banknote, Check, CheckCircle2, ChevronRight, CircleAlert, Clock3,
  FileText, Package, RefreshCw, Settings2, Stethoscope, UserRound, Wrench, XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { SalesInvoice, WorkOrder, WorkOrderTimelineStage } from '../types';
import { localDateKey } from '../lib/date';
import IndonesianDateInput from '../components/IndonesianDateInput';
import { workOrderStatusLabel } from '../lib/workOrderStatus';
import ActiveFilterResetButton from '../components/ActiveFilterResetButton';
import {
  timelineStageFromReason, timelineStageFromWorkOrder, type TimelineStageKey,
} from '../lib/workOrderTimeline';

type BoardStageKey = TimelineStageKey | 'done';
type Segment = { key: TimelineStageKey; start: Date; end: Date; duration: number; active: boolean };
type TimelineRow = { wo: WorkOrder; invoice?: SalesInvoice; stage: BoardStageKey; segments: Segment[] };

const STAGES: Record<TimelineStageKey, {
  label: string; short: string; color: string; bar: string; soft: string; text: string; icon: typeof Wrench; warningMinutes?: number;
}> = {
  diagnosis: { label: 'Diagnosa', short: 'Diagnosa', color: '#f97316', bar: 'bg-orange-500', soft: 'border-orange-200 bg-orange-50', text: 'text-orange-700', icon: Stethoscope, warningMinutes: 45 },
  approval: { label: 'Tunggu Persetujuan', short: 'Tunggu Setuju', color: '#eab308', bar: 'bg-yellow-500', soft: 'border-yellow-200 bg-yellow-50', text: 'text-yellow-800', icon: UserRound, warningMinutes: 60 },
  parts: { label: 'Tunggu Parts', short: 'Tunggu Parts', color: '#8b5cf6', bar: 'bg-violet-500', soft: 'border-violet-200 bg-violet-50', text: 'text-violet-700', icon: Package, warningMinutes: 120 },
  working: { label: 'Dikerjakan', short: 'Dikerjakan', color: '#2563eb', bar: 'bg-blue-600', soft: 'border-blue-200 bg-blue-50', text: 'text-blue-700', icon: Wrench },
  lost: { label: workOrderStatusLabel('Closed'), short: workOrderStatusLabel('Closed'), color: '#dc2626', bar: 'bg-red-600', soft: 'border-red-200 bg-red-50', text: 'text-red-700', icon: XCircle },
};

const AXIS_START_MINUTE = 8 * 60;
const DEFAULT_AXIS_END_MINUTE = 17 * 60 + 30;
const HALF_HOUR = 30;

function parseDateTime(value: string | undefined, fallbackDate: string, fallbackTime = '08:00') {
  const fallback = new Date(`${fallbackDate}T${fallbackTime}:00`);
  if (!value) return fallback;
  const parsed = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function durationLabel(milliseconds: number) {
  const minutes = Math.max(1, Math.round(milliseconds / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}j${rest ? ` ${rest}m` : ''}`;
}

function minuteOfDay(value: Date) {
  return value.getHours() * 60 + value.getMinutes() + value.getSeconds() / 60;
}

function buildSegments(wo: WorkOrder, now: Date): Segment[] {
  const fallbackTime = wo.transactionTime || '08:00';
  const startedAt = parseDateTime(wo.createdAt, wo.date, fallbackTime);
  const logs = [...(wo.statusLog || [])]
    .map(log => ({ ...log, parsedAt: parseDateTime(log.at, wo.date, fallbackTime) }))
    .filter(log => log.parsedAt.getTime() >= startedAt.getTime())
    .sort((a, b) => a.parsedAt.getTime() - b.parsedAt.getTime());
  let stage: TimelineStageKey = 'diagnosis';
  let cursor = startedAt;
  const segments: Segment[] = [];
  const pushSegment = (end: Date, key = stage, active = false) => {
    if (end.getTime() <= cursor.getTime()) return;
    segments.push({ key, start: cursor, end, duration: end.getTime() - cursor.getTime(), active });
    cursor = end;
  };

  for (const log of logs) {
    const markedStage = timelineStageFromReason(log.reason || '');
    const nextStage: TimelineStageKey | null = markedStage
      || (log.to === 'Proses' ? 'working' : null)
      || (log.to === 'Closed' || log.to === 'Batal' ? 'lost' : null);
    const isComplete = log.to === 'Selesai' || log.to === 'Dibayar' || log.to === 'Invoiced';
    if (!nextStage && !isComplete) continue;
    if (log.parsedAt.getTime() > cursor.getTime()) pushSegment(log.parsedAt);
    if (isComplete) return segments;
    stage = nextStage || stage;
    cursor = log.parsedAt;
    if (stage === 'lost') {
      pushSegment(new Date(cursor.getTime() + 10 * 60000), 'lost');
      return segments;
    }
  }

  if (wo.status === 'Selesai') {
    if (!segments.length) {
      const recordedEnd = parseDateTime(wo.updatedAt, wo.date, fallbackTime);
      const visibleEnd = recordedEnd.getTime() > cursor.getTime()
        ? recordedEnd
        : new Date(cursor.getTime() + 30 * 60000);
      pushSegment(visibleEnd, 'working');
    }
    return segments;
  }
  if (wo.status === 'Closed') {
    const closedAt = parseDateTime(wo.updatedAt, wo.date, fallbackTime);
    if (closedAt.getTime() > cursor.getTime()) pushSegment(closedAt);
    pushSegment(new Date(cursor.getTime() + 10 * 60000), 'lost');
    return segments;
  }
  const endpoint = wo.date === localDateKey(now) ? now : new Date(`${wo.date}T17:30:00`);
  if (endpoint.getTime() > cursor.getTime()) pushSegment(endpoint, timelineStageFromWorkOrder(wo), true);
  return segments;
}

function selectedDateLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
    .format(new Date(`${value}T00:00:00`));
}

function formatClock(value: Date) {
  return value.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
}

export default function WorkOrderTimeline() {
  const navigate = useNavigate();
  const {
    data, currentBranchId, currentUser, hasPermission, isLoading, refreshData,
    changeWorkOrderStatus, changeWorkOrderTimelineStage,
  } = useApp();
  const [date, setDate] = useState(localDateKey());
  const [selectedId, setSelectedId] = useState('');
  const [stageFilter, setStageFilter] = useState<BoardStageKey | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  const [showLost, setShowLost] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 15000);
    const reload = window.setInterval(() => { void refreshData(); }, 120000);
    return () => { window.clearInterval(timer); window.clearInterval(reload); };
  }, [refreshData]);

  const invoicesByWo = useMemo(() => new Map(
    data.invoices.filter(invoice => invoice.woId).map(invoice => [invoice.woId!, invoice]),
  ), [data.invoices]);
  const rows = useMemo<TimelineRow[]>(() => data.workOrders
    .filter(wo => wo.date === date && (currentBranchId === 'ALL' || wo.branchId === currentBranchId))
    .map<TimelineRow>(wo => ({
      wo,
      invoice: invoicesByWo.get(wo.id),
      stage: wo.status === 'Selesai' ? 'done' : timelineStageFromWorkOrder(wo),
      segments: buildSegments(wo, clock),
    }))
    .filter(row => (showCompleted || row.stage !== 'done') && (showLost || row.stage !== 'lost'))
    .sort((a, b) => {
      const priority: Record<BoardStageKey, number> = { working: 0, parts: 1, approval: 2, diagnosis: 3, done: 4, lost: 5 };
      return priority[a.stage] - priority[b.stage]
        || parseDateTime(a.wo.createdAt, a.wo.date, a.wo.transactionTime).getTime() - parseDateTime(b.wo.createdAt, b.wo.date, b.wo.transactionTime).getTime();
    }), [data.workOrders, date, currentBranchId, invoicesByWo, clock, showCompleted, showLost]);

  const counts = useMemo(() => rows.reduce((result, row) => {
    result[row.stage] = (result[row.stage] || 0) + 1;
    return result;
  }, {} as Partial<Record<BoardStageKey, number>>), [rows]);
  const visibleRows = stageFilter ? rows.filter(row => row.stage === stageFilter) : rows;
  const selectedRow = visibleRows.find(row => row.wo.id === selectedId);
  const selected = selectedRow?.wo;

  useEffect(() => {
    if (selectedId && !visibleRows.some(row => row.wo.id === selectedId)) setSelectedId('');
  }, [selectedId, visibleRows]);

  const latestObservedMinute = useMemo(() => {
    let latest = DEFAULT_AXIS_END_MINUTE;
    visibleRows.forEach(row => row.segments.forEach(segment => { latest = Math.max(latest, minuteOfDay(segment.end)); }));
    if (date === localDateKey(clock)) latest = Math.max(latest, minuteOfDay(clock));
    return Math.ceil(latest / HALF_HOUR) * HALF_HOUR;
  }, [visibleRows, date, clock]);
  const axisEndMinute = Math.max(DEFAULT_AXIS_END_MINUTE, latestObservedMinute);
  const axisSpan = axisEndMinute - AXIS_START_MINUTE;
  const timelineWidth = Math.max(760, Math.round(axisSpan * 1.45));
  const position = (value: Date) => ((minuteOfDay(value) - AXIS_START_MINUTE) / axisSpan) * 100;
  const nowPosition = position(clock);
  const showNowLine = date === localDateKey(clock) && nowPosition >= 0 && nowPosition <= 100;
  const axisLabels = useMemo(() => {
    const labels: number[] = [];
    for (let minute = AXIS_START_MINUTE; minute <= axisEndMinute; minute += 60) labels.push(minute);
    if (labels[labels.length - 1] !== axisEndMinute) labels.push(axisEndMinute);
    return labels;
  }, [axisEndMinute]);

  const setCoreStatus = async (next: 'Proses' | 'Selesai' | 'Closed', reason?: string) => {
    if (!selected || actionBusy) return;
    setActionBusy(true);
    const result = await changeWorkOrderStatus(selected.id, next, reason);
    setActionBusy(false);
    if (!result.ok) window.alert(result.message || 'Status WO gagal diubah.');
  };
  const setStage = async (next: WorkOrderTimelineStage, promptLabel?: string) => {
    if (!selected || actionBusy) return;
    let note = '';
    if (promptLabel) {
      const entered = window.prompt(`${promptLabel}. Keterangan (opsional):`, selected.pendingReason || '');
      if (entered === null) return;
      note = entered.trim();
    }
    setActionBusy(true);
    const result = next === 'working' && selected.status === 'Register'
      ? await changeWorkOrderStatus(selected.id, 'Proses')
      : await changeWorkOrderTimelineStage(selected.id, next, note);
    setActionBusy(false);
    if (!result.ok) window.alert(result.message || 'Tahap WO gagal diubah.');
  };
  const setLostSales = () => {
    const reason = window.prompt('Alasan Lost Sales:')?.trim();
    if (reason) void setCoreStatus('Closed', reason);
  };

  const branchName = currentBranchId === 'ALL'
    ? 'Semua Cabang'
    : data.branches.find(branch => branch.id === currentBranchId)?.name || '-';
  const activeCount = rows.filter(row => !['done', 'lost'].includes(row.stage)).length;
  const selectedStage = selectedRow?.stage;
  const selectedInvoice = selectedRow?.invoice;
  const selectedPaid = selectedInvoice?.status === 'Lunas';

  const renderAction = (label: string, onClick: () => void, tone: 'neutral' | 'warning' | 'primary' | 'danger' | 'success', Icon: typeof Wrench) => {
    const colors = {
      neutral: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
      warning: 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100',
      primary: 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700',
      danger: 'border-red-200 bg-white text-red-700 hover:bg-red-50',
      success: 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700',
    };
    return <button type="button" disabled={actionBusy} onClick={onClick} className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition disabled:cursor-wait disabled:opacity-60 ${colors[tone]}`}><Icon className="h-3.5 w-3.5"/>{label}</button>;
  };

  return (
    <div className="min-w-0 space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            <span>Servis Order</span><ChevronRight className="h-3 w-3"/><span className="text-blue-700">WO Timeline</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-gray-950 sm:text-2xl">WO Timeline Control Board</h1>
          <p className="mt-0.5 text-xs text-gray-500">{branchName} · {selectedDateLabel(date)}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold text-gray-600"><b className="text-blue-700">{activeCount}</b> Aktif · <b className="text-emerald-700">{counts.done || 0}</b> Selesai · <b className="text-red-700">{counts.lost || 0}</b> Lost Sales</span>
          <IndonesianDateInput value={date} max={localDateKey()} onChange={value => { setDate(value); setSelectedId(''); }} className="h-9 w-40 text-xs"/>
          <button type="button" onClick={() => void refreshData()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-white px-3 text-xs font-bold text-gray-600 hover:bg-gray-50"><RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`}/>Refresh</button>
          <div className="relative">
            <button type="button" aria-label="Pengaturan tampilan" onClick={() => setShowSettings(value => !value)} className="grid h-9 w-9 place-items-center rounded-lg border bg-white text-gray-600 hover:bg-gray-50"><Settings2 className="h-4 w-4"/></button>
            {showSettings && <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border bg-white p-3 text-sm shadow-xl">
              <label className="flex items-center justify-between gap-3 py-2"><span>Tampilkan WO selesai</span><input type="checkbox" checked={showCompleted} onChange={event => setShowCompleted(event.target.checked)}/></label>
              <label className="flex items-center justify-between gap-3 py-2"><span>Tampilkan Lost Sales</span><input type="checkbox" checked={showLost} onChange={event => setShowLost(event.target.checked)}/></label>
            </div>}
          </div>
        </div>
      </header>

      {selected && selectedRow && <section className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`grid h-10 w-10 flex-none place-items-center rounded-lg border ${selectedStage === 'done' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : STAGES[selectedStage as TimelineStageKey].soft + ' ' + STAGES[selectedStage as TimelineStageKey].text}`}>
            {selectedStage === 'done' ? <CheckCircle2 className="h-5 w-5"/> : (() => { const Icon = STAGES[selectedStage as TimelineStageKey].icon; return <Icon className="h-5 w-5"/>; })()}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><b className="truncate text-sm text-gray-950">{selected.plateNumber}</b><span className="text-xs text-gray-400">{selected.woNumber}</span></div>
            <p className="truncate text-xs text-gray-500">{selected.vehicleInfo || '-'} · {selected.customerName} · {selected.technicianName || 'Teknisi belum dipilih'}</p>
          </div>
          <span className={`hidden rounded-md border px-2 py-1 text-[10px] font-bold uppercase sm:inline-flex ${selectedStage === 'done' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : STAGES[selectedStage as TimelineStageKey].soft + ' ' + STAGES[selectedStage as TimelineStageKey].text}`}>{selectedStage === 'done' ? 'Selesai' : STAGES[selectedStage as TimelineStageKey].label}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {hasPermission('wo:edit') && selectedStage === 'diagnosis' && <>
            {renderAction('Tunggu Persetujuan', () => void setStage('approval', 'Menunggu persetujuan pelanggan'), 'warning', UserRound)}
            {renderAction('Tunggu Parts', () => void setStage('parts', 'Menunggu parts'), 'neutral', Package)}
            {renderAction('Dikerjakan', () => void setStage('working'), 'primary', Wrench)}
            {renderAction('Lost Sales', setLostSales, 'danger', XCircle)}
          </>}
          {hasPermission('wo:edit') && selectedStage === 'approval' && <>
            {renderAction('Kembali Diagnosa', () => void setStage('diagnosis'), 'neutral', Stethoscope)}
            {renderAction('Tunggu Parts', () => void setStage('parts', 'Menunggu parts'), 'neutral', Package)}
            {renderAction('Disetujui · Dikerjakan', () => void setStage('working'), 'primary', Wrench)}
            {renderAction('Lost Sales', setLostSales, 'danger', XCircle)}
          </>}
          {hasPermission('wo:edit') && selectedStage === 'parts' && <>
            {selected.status === 'Register' && renderAction('Tunggu Persetujuan', () => void setStage('approval', 'Menunggu persetujuan pelanggan'), 'warning', UserRound)}
            {renderAction('Parts Tersedia · Dikerjakan', () => void setStage('working'), 'primary', Wrench)}
            {selected.status === 'Proses' && renderAction('Selesai', () => void setCoreStatus('Selesai'), 'success', Check)}
            {renderAction('Lost Sales', setLostSales, 'danger', XCircle)}
          </>}
          {hasPermission('wo:edit') && selectedStage === 'working' && selected.status === 'Proses' && <>
            {renderAction('Tunggu Parts', () => void setStage('parts', 'Menunggu parts'), 'neutral', Package)}
            {renderAction('Selesai', () => void setCoreStatus('Selesai'), 'success', Check)}
          </>}
          {hasPermission('invoice:create') && selectedStage === 'done' && !selectedInvoice && (selected.total > 0
            ? renderAction('Buat Faktur', () => navigate(`/invoices?woId=${encodeURIComponent(selected.id)}`), 'primary', FileText)
            : <span className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-500">Lengkapi layanan &amp; harga</span>)}
          {hasPermission('payment:create') && selectedInvoice && !selectedPaid && renderAction('Pembayaran', () => navigate(`/customer-payments?invoiceId=${encodeURIComponent(selectedInvoice.id)}`), 'success', Banknote)}
          {selectedPaid && <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-50 px-3 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4"/>Lunas</span>}
          <button type="button" onClick={() => navigate(`/workorders?${selectedInvoice || selected.status === 'Closed' ? 'view' : 'edit'}=${encodeURIComponent(selected.id)}`)} className="h-9 rounded-lg border px-3 text-xs font-bold text-gray-600 hover:bg-gray-50">Detail WO</button>
        </div>
      </section>}

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b bg-gray-50/80 px-3 py-2">
          <label className={`inline-flex h-8 min-w-[190px] items-center gap-2 rounded-lg border px-2.5 text-xs font-semibold ${stageFilter ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-gray-200 bg-white text-gray-600'}`}>
            <span className={`h-2 w-2 rounded-full ${stageFilter ? 'bg-blue-600' : 'bg-gray-300'}`}/>
            <select value={stageFilter || ''} onChange={event => { setStageFilter((event.target.value || null) as BoardStageKey | null); setSelectedId(''); }} className="min-w-0 flex-1 bg-transparent outline-none">
              <option value="">Semua status ({rows.length})</option>
              {(Object.keys(STAGES) as TimelineStageKey[]).map(key => <option key={key} value={key}>{STAGES[key].label} ({counts[key] || 0})</option>)}
              <option value="done">Selesai ({counts.done || 0})</option>
            </select>
          </label>
          <ActiveFilterResetButton active={Boolean(stageFilter)} onReset={() => { setStageFilter(null); setSelectedId(''); }} className="h-8 w-8"/>
          <div className="ml-auto hidden flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-500 md:flex">
            {(Object.keys(STAGES) as TimelineStageKey[]).map(key => <span key={key} className="inline-flex items-center gap-1"><i className={`h-2 w-2 rounded-sm ${STAGES[key].bar}`}/>{STAGES[key].label}</span>)}
          </div>
        </div>
        <div className="overflow-x-auto">
          <div style={{ minWidth: `${260 + timelineWidth + 112}px` }}>
            <div className="grid border-b bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500" style={{ gridTemplateColumns: `260px ${timelineWidth}px 112px` }}>
              <div className="flex items-end px-3 py-2.5">Kendaraan / Customer</div>
              <div className="relative h-11 border-x border-slate-200">
                {axisLabels.map(minute => <span key={minute} className="absolute bottom-0 top-0 border-l border-slate-200" style={{ left: `${((minute - AXIS_START_MINUTE) / axisSpan) * 100}%` }}><i className="absolute left-1 top-2 whitespace-nowrap not-italic">{String(Math.floor(minute / 60)).padStart(2, '0')}:{String(minute % 60).padStart(2, '0')}</i></span>)}
                {showNowLine && <span className="absolute bottom-0 top-0 z-20 w-px bg-red-500" style={{ left: `${nowPosition}%` }}><i className="absolute bottom-1 -translate-x-1/2 whitespace-nowrap rounded bg-red-50 px-1 text-[9px] font-bold not-italic text-red-600">Sekarang {formatClock(clock)}</i></span>}
              </div>
              <div className="flex items-end justify-center px-2 py-2.5">Selesai · INV · Rp</div>
            </div>
            {visibleRows.map(row => {
              const { wo, invoice, segments, stage } = row;
              const isSelected = selectedId === wo.id;
              const isDone = stage === 'done';
              const currentConfig = isDone ? null : STAGES[stage as TimelineStageKey];
              const activeSegment = [...segments].reverse().find(segment => segment.active);
              const warning = activeSegment && currentConfig?.warningMinutes && activeSegment.duration > currentConfig.warningMinutes * 60000;
              return <button key={wo.id} type="button" onClick={() => setSelectedId(wo.id)} className={`grid w-full border-b text-left last:border-b-0 ${isSelected ? 'bg-blue-50/70 shadow-[inset_3px_0_0_#2563eb]' : 'hover:bg-slate-50/80'}`} style={{ gridTemplateColumns: `260px ${timelineWidth}px 112px` }}>
                <div className="min-w-0 px-3 py-2.5" title={`${wo.woNumber} · ${wo.vehicleInfo} · Teknisi: ${wo.technicianName || '-'}`}>
                  <div className="flex items-center gap-2"><b className="min-w-0 flex-1 truncate text-sm text-gray-950">{wo.plateNumber}</b>{warning && <span title="Durasi tahap aktif melewati batas perhatian" className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-700"><CircleAlert className="h-3 w-3"/>{durationLabel(activeSegment.duration)}</span>}</div>
                  <p className="truncate text-[11px] text-gray-500">{wo.vehicleInfo || '-'} · {wo.customerName}</p>
                  <p className={`mt-0.5 truncate text-[9px] font-bold uppercase ${isDone ? 'text-emerald-700' : currentConfig?.text}`}>{isDone ? 'Selesai' : currentConfig?.label}</p>
                </div>
                <div className="relative my-2 min-h-[48px] overflow-hidden border-x border-slate-100 bg-[linear-gradient(to_right,rgba(226,232,240,.75)_1px,transparent_1px)]" style={{ backgroundSize: `${(HALF_HOUR / axisSpan) * 100}% 100%` }}>
                  {segments.map((segment, index) => {
                    const rawLeft = position(segment.start);
                    const rawRight = position(segment.end);
                    if (rawRight < 0 || rawLeft > 100) return null;
                    const left = Math.max(0, Math.min(100, rawLeft));
                    const right = Math.max(0, Math.min(100, rawRight));
                    const width = Math.max(0.8, right - left);
                    return <span key={`${segment.key}-${index}`} title={`${STAGES[segment.key].label}: ${durationLabel(segment.duration)} (${formatClock(segment.start)}–${formatClock(segment.end)})`} className="absolute top-1/2 z-10 flex h-7 -translate-y-1/2 items-center justify-center overflow-hidden px-1 text-[9px] font-bold text-white shadow-sm first:rounded-l-md last:rounded-r-md" style={{ left: `${left}%`, width: `${width}%`, backgroundColor: STAGES[segment.key].color }}>
                      {width >= 4.2 ? durationLabel(segment.duration) : ''}{segment.active && <i className="absolute right-0 h-2 w-2 animate-pulse rounded-full border border-white bg-white/90"/>}
                    </span>;
                  })}
                  <>{showNowLine && <span className="absolute bottom-0 top-0 z-20 w-px bg-red-500" style={{ left: `${nowPosition}%` }}/>}</>
                </div>
                <div className="flex items-center justify-center gap-1.5 px-2">
                  <span title={isDone || invoice ? 'Pekerjaan selesai' : 'Pekerjaan belum selesai'} className={`grid h-6 w-6 place-items-center rounded-full border text-[10px] font-black ${isDone || invoice ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-300'}`}>✓</span>
                  <span title={invoice ? `Faktur ${invoice.invoiceNumber}` : 'Belum ada faktur'} className={`grid h-6 min-w-8 place-items-center rounded-md border px-1 text-[9px] font-black ${invoice ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 bg-gray-50 text-gray-300'}`}>INV</span>
                  <span title={invoice?.status === 'Lunas' ? 'Pembayaran lunas' : 'Pembayaran belum lunas'} className={`grid h-6 w-7 place-items-center rounded-md border text-[10px] font-black ${invoice?.status === 'Lunas' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-300'}`}>Rp</span>
                </div>
              </button>;
            })}
            {!visibleRows.length && <div className="p-14 text-center text-sm text-gray-400">Tidak ada WO pada {selectedDateLabel(date)}{stageFilter ? ' untuk status yang dipilih' : ''}.</div>}
          </div>
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-400">
        <span className="inline-flex items-center gap-1.5"><Activity className="h-3.5 w-3.5"/>Pembaruan otomatis setiap 2 menit · operator {currentUser?.name || '-'}</span>
        <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5"/>Rentang awal 08:00–17:30 · otomatis memanjang mengikuti aktivitas</span>
      </footer>
    </div>
  );
}
