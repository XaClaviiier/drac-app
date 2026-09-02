import { useEffect, useMemo, useRef, useState } from 'react';
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
  timelineFinancialSummary, timelineStageFromReason, timelineStageFromWorkOrder, type TimelineStageKey,
} from '../lib/workOrderTimeline';
import { buildWorkOrderAttentionItems, countWorkOrderAttentionByKind } from '../lib/workOrderAttention';

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
const MOBILE_IDENTITY_WIDTH = 144;
const MOBILE_FINANCIAL_WIDTH = 124;

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

function formatRupiah(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
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
  const [mobileView, setMobileView] = useState<'focus' | 'full'>('focus');
  const mobileTimelineRef = useRef<HTMLDivElement>(null);

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
  const operationalAttentionItems = useMemo(() => buildWorkOrderAttentionItems(
    data.workOrders.filter(wo => wo.date === date && (currentBranchId === 'ALL' || wo.branchId === currentBranchId)),
    data.invoices,
    localDateKey(clock),
    clock,
  ), [data.workOrders, data.invoices, date, currentBranchId, clock]);
  const closingCounts = useMemo(
    () => countWorkOrderAttentionByKind(operationalAttentionItems),
    [operationalAttentionItems],
  );
  const attentionByWorkOrder = useMemo(
    () => new Map(operationalAttentionItems.map(item => [item.workOrder.id, item])),
    [operationalAttentionItems],
  );
  const criticalAttentionCount = operationalAttentionItems.filter(item => item.severity === 'critical').length;
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
  const mobileTimelineWidth = Math.max(960, Math.round(axisSpan * 2.1));
  const position = (value: Date) => ((minuteOfDay(value) - AXIS_START_MINUTE) / axisSpan) * 100;
  const nowPosition = position(clock);
  const showNowLine = date === localDateKey(clock) && nowPosition >= 0 && nowPosition <= 100;
  const axisLabels = useMemo(() => {
    const labels: number[] = [];
    for (let minute = AXIS_START_MINUTE; minute <= axisEndMinute; minute += 60) labels.push(minute);
    if (labels[labels.length - 1] !== axisEndMinute) labels.push(axisEndMinute);
    return labels;
  }, [axisEndMinute]);

  const scrollMobileToNow = (behavior: ScrollBehavior = 'smooth') => {
    const scroller = mobileTimelineRef.current;
    if (!scroller) return;
    const mobileIdentityWidth = MOBILE_IDENTITY_WIDTH;
    const mobileFinancialWidth = MOBILE_FINANCIAL_WIDTH;
    const availableTimelineWidth = Math.max(80, scroller.clientWidth - mobileIdentityWidth - mobileFinancialWidth);
    const currentPosition = Math.max(0, Math.min(100, ((minuteOfDay(new Date()) - AXIS_START_MINUTE) / axisSpan) * 100));
    const absoluteNow = mobileIdentityWidth + (currentPosition / 100) * mobileTimelineWidth;
    const target = absoluteNow - mobileIdentityWidth - availableTimelineWidth / 2;
    scroller.scrollTo({ left: Math.max(0, target), behavior });
  };

  useEffect(() => {
    if (mobileView !== 'focus' || date !== localDateKey()) return;
    const timer = window.setTimeout(() => scrollMobileToNow('auto'), 80);
    return () => window.clearTimeout(timer);
  }, [date, mobileView, axisEndMinute]);

  const showCurrentTime = () => {
    setMobileView('focus');
    const today = localDateKey();
    if (date !== today) {
      setDate(today);
      setSelectedId('');
      return;
    }
    window.setTimeout(() => scrollMobileToNow(), 0);
  };

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
  const confirmProgress = async () => {
    if (!selected || actionBusy) return;
    const note = window.prompt('Catatan progress wajib diisi:', '')?.trim();
    if (!note) {
      window.alert('Catatan progress wajib diisi.');
      return;
    }
    setActionBusy(true);
    const result = await changeWorkOrderTimelineStage(selected.id, 'working', note);
    setActionBusy(false);
    if (!result.ok) window.alert(result.message || 'Konfirmasi progress gagal disimpan.');
  };
  const completeSelectedWorkOrder = () => {
    if (!selected || actionBusy) return;
    const confirmed = window.confirm([
      'Selesaikan pekerjaan ini?',
      '',
      'Pastikan sebelum melanjutkan:',
      '✓ Layanan dan barang sudah final',
      '✓ Hasil pengukuran dan catatan sudah lengkap',
      '✓ Pemeriksaan akhir sudah dilakukan',
      '✓ Kendaraan siap diserahkan',
    ].join('\n'));
    if (confirmed) void setCoreStatus('Selesai');
  };

  const branchName = currentBranchId === 'ALL'
    ? 'Semua Cabang'
    : data.branches.find(branch => branch.id === currentBranchId)?.name || '-';
  const activeCount = rows.filter(row => !['done', 'lost'].includes(row.stage)).length;
  const selectedStage = selectedRow?.stage;
  const selectedInvoice = selectedRow?.invoice;
  const selectedHasLinkedInvoice = Boolean(selected?.invoiceId || selectedInvoice);
  const selectedPaid = selected ? timelineFinancialSummary(selected, selectedInvoice).isPaid : false;

  const renderAction = (label: string, onClick: () => void, tone: 'neutral' | 'warning' | 'primary' | 'danger' | 'success', Icon: typeof Wrench) => {
    const colors = {
      neutral: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
      warning: 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100',
      primary: 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700',
      danger: 'border-red-200 bg-white text-red-700 hover:bg-red-50',
      success: 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700',
    };
    return <button type="button" disabled={actionBusy} onClick={onClick} className={`inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition disabled:cursor-wait disabled:opacity-60 sm:h-9 sm:flex-none sm:px-3 ${colors[tone]}`}><Icon className="h-3.5 w-3.5 flex-none"/><span className="truncate">{label}</span></button>;
  };

  const renderFinancialSummary = (row: TimelineRow, compact = false) => {
    const financial = timelineFinancialSummary(row.wo, row.invoice);
    return <div className={`flex min-w-0 flex-col justify-center ${compact ? 'px-1 py-1' : 'px-2 py-1.5'}`}>
      <span className="text-[8px] font-bold uppercase tracking-wide text-slate-400">{financial.amountLabel}</span>
      <b className={`truncate text-slate-900 ${compact ? 'text-[10px]' : 'text-xs'}`}>{formatRupiah(financial.amount)}</b>
      {financial.isPaid
        ? <span className={`mt-0.5 w-fit -rotate-2 rounded border-2 border-emerald-600 bg-emerald-50 font-black tracking-[0.12em] text-emerald-700 ${compact ? 'px-1 py-0.5 text-[7px]' : 'px-1.5 py-0.5 text-[8px]'}`}>LUNAS</span>
        : financial.detailsRestricted
          ? <span className="mt-0.5 text-[8px] font-semibold text-slate-500">Sudah difakturkan · detail terbatas</span>
          : financial.invoiceNumber
          ? <span className="mt-0.5 truncate text-[8px] font-semibold text-blue-700" title={`Faktur ${financial.invoiceNumber}`}>{financial.invoiceNumber} · Sisa {formatRupiah(financial.outstanding || 0)}</span>
          : <span className="mt-0.5 text-[8px] text-slate-400">Belum ditagih</span>}
    </div>;
  };

  const renderSegments = (segments: Segment[], minimumLabelWidth = 4.2) => segments.map((segment, index) => {
    const rawLeft = position(segment.start);
    const rawRight = position(segment.end);
    if (rawRight < 0 || rawLeft > 100) return null;
    const left = Math.max(0, Math.min(100, rawLeft));
    const right = Math.max(0, Math.min(100, rawRight));
    const width = Math.max(0.8, right - left);
    return <span key={`${segment.key}-${index}`} title={`${STAGES[segment.key].label}: ${durationLabel(segment.duration)} (${formatClock(segment.start)}–${formatClock(segment.end)})`} className="absolute top-1/2 z-10 flex h-7 -translate-y-1/2 items-center justify-center overflow-hidden px-1 text-[9px] font-bold text-white shadow-sm first:rounded-l-md last:rounded-r-md" style={{ left: `${left}%`, width: `${width}%`, backgroundColor: STAGES[segment.key].color }}>
      {width >= minimumLabelWidth ? durationLabel(segment.duration) : ''}{segment.active && <i className="absolute right-0 h-2 w-2 animate-pulse rounded-full border border-white bg-white/90"/>}
    </span>;
  });

  const renderFocusBoard = (mobile: boolean) => {
    const identityWidth = mobile ? MOBILE_IDENTITY_WIDTH : 260;
    const indicatorWidth = mobile ? MOBILE_FINANCIAL_WIDTH : 168;
    const boardTimelineWidth = mobile ? mobileTimelineWidth : timelineWidth;
    const gridColumns = `${identityWidth}px ${boardTimelineWidth}px ${indicatorWidth}px`;
    const stickyIdentity = mobile ? 'sticky left-0 z-30 border-r border-slate-200' : '';
    const stickyIndicator = mobile ? 'sticky right-0 z-30 border-l border-slate-200' : '';
    return <div ref={mobile ? mobileTimelineRef : undefined} className="overflow-x-auto overscroll-x-contain">
      <div style={{ minWidth: `${identityWidth + boardTimelineWidth + indicatorWidth}px` }}>
        <div className="grid border-b bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500" style={{ gridTemplateColumns: gridColumns }}>
          <div className={`flex items-end bg-slate-50 px-3 py-2.5 ${stickyIdentity}`}>{mobile ? 'Kendaraan' : 'Kendaraan / Customer'}</div>
          <div className="relative h-11 border-x border-slate-200">
            {axisLabels.map(minute => <span key={minute} className="absolute bottom-0 top-0 border-l border-slate-200" style={{ left: `${((minute - AXIS_START_MINUTE) / axisSpan) * 100}%` }}><i className="absolute left-1 top-2 whitespace-nowrap not-italic">{String(Math.floor(minute / 60)).padStart(2, '0')}:{String(minute % 60).padStart(2, '0')}</i></span>)}
            {showNowLine && <span className="absolute bottom-0 top-0 z-20 w-px bg-red-500" style={{ left: `${nowPosition}%` }}><i className="absolute bottom-1 -translate-x-1/2 whitespace-nowrap rounded bg-red-50 px-1 text-[9px] font-bold not-italic text-red-600">Sekarang {formatClock(clock)}</i></span>}
          </div>
          <div className={`flex items-end justify-center bg-slate-50 px-1 py-2.5 ${stickyIndicator}`}>{mobile ? 'Total' : 'Total · Invoice'}</div>
        </div>
        {visibleRows.map(row => {
          const { wo, segments, stage } = row;
          const isSelected = selectedId === wo.id;
          const isDone = stage === 'done';
          const currentConfig = isDone ? null : STAGES[stage as TimelineStageKey];
          const activeSegment = [...segments].reverse().find(segment => segment.active);
          const warning = activeSegment && currentConfig?.warningMinutes && activeSegment.duration > currentConfig.warningMinutes * 60000;
          const attention = attentionByWorkOrder.get(wo.id);
          const stickyBackground = isSelected ? 'bg-blue-50' : 'bg-white group-hover:bg-slate-50';
          return <button key={wo.id} type="button" onClick={() => setSelectedId(wo.id)} className={`group grid w-full border-b text-left last:border-b-0 ${isSelected ? 'bg-blue-50/70 shadow-[inset_3px_0_0_#2563eb]' : 'hover:bg-slate-50/80'}`} style={{ gridTemplateColumns: gridColumns }}>
            <div className={`min-w-0 px-3 py-2.5 ${stickyIdentity} ${stickyBackground}`} title={`${wo.woNumber} · ${wo.vehicleInfo} · Teknisi: ${wo.technicianName || '-'}`}>
              <div className="flex items-center gap-1"><b className={`min-w-0 flex-1 truncate text-gray-950 ${mobile ? 'text-xs' : 'text-sm'}`}>{wo.plateNumber}</b><span className={`inline-flex flex-none rounded border px-1 py-0.5 text-[7px] font-bold uppercase ${isDone ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : currentConfig?.soft + ' ' + currentConfig?.text}`}>{isDone ? 'Selesai' : currentConfig?.short}</span>{attention ? <span title={`${attention.label}: ${attention.description}`} className={`inline-flex flex-none items-center gap-0.5 text-[9px] font-bold ${attention.severity === 'critical' ? 'text-red-700' : 'text-amber-700'}`}><CircleAlert className="h-3 w-3"/>{mobile ? '' : attention.elapsedMinutes ? durationLabel(attention.elapsedMinutes * 60000) : '!'}</span> : warning && <span title="Durasi tahap aktif melewati batas perhatian" className="inline-flex flex-none items-center gap-0.5 text-[9px] font-bold text-amber-700"><CircleAlert className="h-3 w-3"/>{mobile ? '' : durationLabel(activeSegment.duration)}</span>}</div>
              <p className={`truncate text-gray-500 ${mobile ? 'text-[9px]' : 'text-[11px]'}`}>{wo.vehicleInfo || '-'} · {wo.customerName}</p>
            </div>
            <div className="relative my-2 min-h-[48px] overflow-hidden border-x border-slate-100 bg-[linear-gradient(to_right,rgba(226,232,240,.75)_1px,transparent_1px)]" style={{ backgroundSize: `${(HALF_HOUR / axisSpan) * 100}% 100%` }}>
              {renderSegments(segments, mobile ? 2.8 : 4.2)}
              <>{showNowLine && <span className="absolute bottom-0 top-0 z-20 w-px bg-red-500" style={{ left: `${nowPosition}%` }}/>}</>
            </div>
            <div className={`bg-white group-hover:bg-slate-50 ${stickyIndicator} ${isSelected ? '!bg-blue-50' : ''}`}>{renderFinancialSummary(row, mobile)}</div>
          </button>;
        })}
        {!visibleRows.length && <div className="p-14 text-center text-sm text-gray-400">Tidak ada WO pada {selectedDateLabel(date)}{stageFilter ? ' untuk status yang dipilih' : ''}.</div>}
      </div>
    </div>;
  };

  const renderMobileFullDay = () => <div className="divide-y divide-slate-100">
    {visibleRows.map(row => {
      const { wo, segments, stage } = row;
      const isDone = stage === 'done';
      const isSelected = selectedId === wo.id;
      const currentConfig = isDone ? null : STAGES[stage as TimelineStageKey];
      const activeSegment = [...segments].reverse().find(segment => segment.active);
      const warning = activeSegment && currentConfig?.warningMinutes && activeSegment.duration > currentConfig.warningMinutes * 60000;
      const attention = attentionByWorkOrder.get(wo.id);
      return <button key={wo.id} type="button" onClick={() => setSelectedId(wo.id)} className={`w-full px-3 py-3 text-left ${isSelected ? 'bg-blue-50 shadow-[inset_3px_0_0_#2563eb]' : 'bg-white'}`}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5"><b className="truncate text-sm text-gray-950">{wo.plateNumber}</b>{attention ? <span title={`${attention.label}: ${attention.description}`} className={`inline-flex items-center gap-0.5 text-[9px] font-bold ${attention.severity === 'critical' ? 'text-red-700' : 'text-amber-700'}`}><CircleAlert className="h-3 w-3"/>{attention.elapsedMinutes ? durationLabel(attention.elapsedMinutes * 60000) : 'Periksa'}</span> : warning && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-700"><CircleAlert className="h-3 w-3"/>{durationLabel(activeSegment.duration)}</span>}</div>
            <p className="truncate text-[10px] text-gray-500">{wo.vehicleInfo || '-'} · {wo.customerName}</p>
          </div>
          <span className={`rounded-md border px-1.5 py-1 text-[8px] font-bold uppercase ${isDone ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : currentConfig?.soft + ' ' + currentConfig?.text}`}>{isDone ? 'Selesai' : currentConfig?.short}</span>
          {renderFinancialSummary(row, true)}
        </div>
        <div className="relative mt-5 h-9 rounded-md border border-slate-100 bg-[linear-gradient(to_right,rgba(226,232,240,.9)_1px,transparent_1px)]" style={{ backgroundSize: `${(60 / axisSpan) * 100}% 100%` }}>
          <span className="absolute -top-4 left-0 text-[8px] font-semibold text-gray-400">08:00</span>
          <span className="absolute -top-4 text-[8px] font-semibold text-gray-400" style={{ left: `${((12 * 60 - AXIS_START_MINUTE) / axisSpan) * 100}%` }}>12:00</span>
          <span className="absolute -top-4 text-[8px] font-semibold text-gray-400" style={{ left: `${((16 * 60 - AXIS_START_MINUTE) / axisSpan) * 100}%` }}>16:00</span>
          <span className="absolute -right-0 -top-4 text-[8px] font-semibold text-gray-400">{String(Math.floor(axisEndMinute / 60)).padStart(2, '0')}:{String(axisEndMinute % 60).padStart(2, '0')}</span>
          {renderSegments(segments, 12)}
          <>{showNowLine && <span className="absolute bottom-0 top-0 z-20 w-px bg-red-500" style={{ left: `${nowPosition}%` }}/>}</>
        </div>
      </button>;
    })}
    {!visibleRows.length && <div className="p-10 text-center text-sm text-gray-400">Tidak ada WO pada {selectedDateLabel(date)}.</div>}
  </div>;

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
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          <span className="w-full rounded-lg border bg-white px-3 py-2 text-xs font-semibold text-gray-600 sm:w-auto"><b className="text-blue-700">{activeCount}</b> Aktif · <b className="text-emerald-700">{counts.done || 0}</b> Selesai · <b className="text-red-700">{counts.lost || 0}</b> Lost Sales</span>
          <IndonesianDateInput value={date} max={localDateKey()} onChange={value => { setDate(value); setSelectedId(''); }} className="h-10 min-w-[10rem] flex-1 text-xs sm:h-9 sm:w-40 sm:flex-none"/>
          <button type="button" aria-label="Refresh" onClick={() => void refreshData()} className="inline-flex h-10 w-10 items-center justify-center gap-1.5 rounded-lg border bg-white text-xs font-bold text-gray-600 hover:bg-gray-50 sm:h-9 sm:w-auto sm:px-3"><RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`}/><span className="hidden sm:inline">Refresh</span></button>
          <div className="relative">
            <button type="button" aria-label="Pengaturan tampilan" onClick={() => setShowSettings(value => !value)} className="grid h-10 w-10 place-items-center rounded-lg border bg-white text-gray-600 hover:bg-gray-50 sm:h-9 sm:w-9"><Settings2 className="h-4 w-4"/></button>
            {showSettings && <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border bg-white p-3 text-sm shadow-xl">
              <label className="flex items-center justify-between gap-3 py-2"><span>Tampilkan WO selesai</span><input type="checkbox" checked={showCompleted} onChange={event => setShowCompleted(event.target.checked)}/></label>
              <label className="flex items-center justify-between gap-3 py-2"><span>Tampilkan Lost Sales</span><input type="checkbox" checked={showLost} onChange={event => setShowLost(event.target.checked)}/></label>
            </div>}
          </div>
        </div>
      </header>

      {operationalAttentionItems.length > 0 && <section className={`rounded-xl border p-3 shadow-sm ${criticalAttentionCount > 0 ? 'border-red-200 bg-red-50/70' : 'border-amber-200 bg-amber-50/70'}`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2"><CircleAlert className={`h-5 w-5 ${criticalAttentionCount > 0 ? 'text-red-600' : 'text-amber-600'}`}/><div><h2 className="text-sm font-bold text-gray-900">Penutupan Operasional</h2><p className="text-[11px] text-gray-600">{operationalAttentionItems.length} WO perlu tindakan · {criticalAttentionCount} kritis</p></div></div>
          <button type="button" onClick={() => navigate('/workorders?attention=1')} className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-xs font-bold text-gray-700 hover:bg-gray-50">Periksa Semua</button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-center text-[10px] sm:flex sm:text-left">
          <span className="rounded-lg border border-amber-200 bg-white px-2 py-1.5"><b className="text-amber-700">{closingCounts.register}</b> Register Mengambang</span>
          <span className="rounded-lg border border-orange-200 bg-white px-2 py-1.5"><b className="text-orange-700">{closingCounts.process}</b> Dikerjakan Terlambat</span>
          <span className="rounded-lg border border-blue-200 bg-white px-2 py-1.5"><b className="text-blue-700">{closingCounts.invoice}</b> Belum Difakturkan</span>
          <span className="rounded-lg border border-rose-200 bg-white px-2 py-1.5"><b className="text-rose-700">{closingCounts.payment}</b> Belum Lunas</span>
        </div>
      </section>}

      {selected && selectedRow && <section className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`grid h-10 w-10 flex-none place-items-center rounded-lg border ${selectedStage === 'done' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : STAGES[selectedStage as TimelineStageKey].soft + ' ' + STAGES[selectedStage as TimelineStageKey].text}`}>
            {selectedStage === 'done' ? <CheckCircle2 className="h-5 w-5"/> : (() => { const Icon = STAGES[selectedStage as TimelineStageKey].icon; return <Icon className="h-5 w-5"/>; })()}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><b className="truncate text-sm text-gray-950">{selected.plateNumber}</b><span className="text-xs text-gray-400">{selected.woNumber}</span></div>
            <p className="truncate text-xs text-gray-500">{selected.vehicleInfo || '-'} · {selected.customerName} · {selected.technicianName || 'Teknisi belum dipilih'}</p>
          </div>
          <span className={`inline-flex rounded-md border px-2 py-1 text-[9px] font-bold uppercase sm:text-[10px] ${selectedStage === 'done' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : STAGES[selectedStage as TimelineStageKey].soft + ' ' + STAGES[selectedStage as TimelineStageKey].text}`}>{selectedStage === 'done' ? 'Selesai' : STAGES[selectedStage as TimelineStageKey].label}</span>
        </div>
        <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap lg:justify-end">
          {hasPermission('wo:edit') && selectedStage === 'diagnosis' && <>
            {renderAction('Dikerjakan', () => void setStage('working'), 'primary', Wrench)}
            {renderAction('Lost Sales', setLostSales, 'danger', XCircle)}
          </>}
          {hasPermission('wo:edit') && selectedStage === 'approval' && <>
            {renderAction('Disetujui · Dikerjakan', () => void setStage('working'), 'primary', Wrench)}
            {renderAction('Lost Sales', setLostSales, 'danger', XCircle)}
          </>}
          {hasPermission('wo:edit') && selectedStage === 'parts' && <>
            {renderAction('Parts Tersedia · Dikerjakan', () => void setStage('working'), 'primary', Wrench)}
            {renderAction('Lost Sales', setLostSales, 'danger', XCircle)}
          </>}
          {hasPermission('wo:edit') && selectedStage === 'working' && selected.status === 'Proses' && <>
            {renderAction('Konfirmasi Progress', () => void confirmProgress(), 'primary', Activity)}
            {renderAction('Tunggu Persetujuan', () => void setStage('approval', 'Menunggu persetujuan pelanggan'), 'warning', UserRound)}
            {renderAction('Tunggu Parts', () => void setStage('parts', 'Menunggu parts'), 'neutral', Package)}
            {renderAction('Selesai', () => void completeSelectedWorkOrder(), 'success', Check)}
          </>}
          {hasPermission('invoice:create') && selectedStage === 'done' && !selectedHasLinkedInvoice && (selected.total > 0
            ? renderAction('Buat Faktur', () => navigate(`/invoices?woId=${encodeURIComponent(selected.id)}`), 'primary', FileText)
            : <span className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-500">Lengkapi layanan &amp; harga</span>)}
          {selectedHasLinkedInvoice && !selectedInvoice && <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">Sudah difakturkan · detail terbatas</span>}
          {hasPermission('payment:create') && selectedInvoice && !selectedPaid && renderAction('Pembayaran', () => navigate(`/customer-payments?invoiceId=${encodeURIComponent(selectedInvoice.id)}`), 'success', Banknote)}
          {selectedPaid && <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-50 px-3 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4"/>Lunas</span>}
          <button type="button" onClick={() => navigate(`/workorders?${selectedHasLinkedInvoice || selected.status === 'Closed' ? 'view' : 'edit'}=${encodeURIComponent(selected.id)}`)} className="col-span-2 h-10 rounded-lg border px-3 text-xs font-bold text-gray-600 hover:bg-gray-50 sm:h-9">Detail WO</button>
        </div>
      </section>}

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b bg-gray-50/80 px-3 py-2">
          <label className={`inline-flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 text-xs font-semibold md:h-8 md:min-w-[190px] md:flex-none ${stageFilter ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-gray-200 bg-white text-gray-600'}`}>
            <span className={`h-2 w-2 rounded-full ${stageFilter ? 'bg-blue-600' : 'bg-gray-300'}`}/>
            <select value={stageFilter || ''} onChange={event => { setStageFilter((event.target.value || null) as BoardStageKey | null); setSelectedId(''); }} className="min-w-0 flex-1 bg-transparent outline-none">
              <option value="">Semua status ({rows.length})</option>
              {(Object.keys(STAGES) as TimelineStageKey[]).map(key => <option key={key} value={key}>{STAGES[key].label} ({counts[key] || 0})</option>)}
              <option value="done">Selesai ({counts.done || 0})</option>
            </select>
          </label>
          <ActiveFilterResetButton active={Boolean(stageFilter)} onReset={() => { setStageFilter(null); setSelectedId(''); }} className="h-9 w-9 md:h-8 md:w-8"/>
          <div className="flex items-center gap-1 md:hidden">
            <button type="button" onClick={showCurrentTime} className={`inline-flex h-9 items-center gap-1 rounded-lg border px-2 text-[10px] font-bold ${mobileView === 'focus' ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-600'}`}><Clock3 className="h-3.5 w-3.5"/>Sekarang</button>
            <button type="button" onClick={() => setMobileView('full')} className={`inline-flex h-9 items-center gap-1 rounded-lg border px-2 text-[10px] font-bold ${mobileView === 'full' ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-600'}`}><Activity className="h-3.5 w-3.5"/>Hari Penuh</button>
          </div>
          <div className="ml-auto hidden flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-500 md:flex">
            {(Object.keys(STAGES) as TimelineStageKey[]).map(key => <span key={key} className="inline-flex items-center gap-1"><i className={`h-2 w-2 rounded-sm ${STAGES[key].bar}`}/>{STAGES[key].label}</span>)}
          </div>
        </div>
        <div className="md:hidden">{mobileView === 'full' ? renderMobileFullDay() : renderFocusBoard(true)}</div>
        <div className="hidden md:block">{renderFocusBoard(false)}</div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-400">
        <span className="inline-flex items-center gap-1.5"><Activity className="h-3.5 w-3.5"/>Pembaruan otomatis setiap 2 menit · operator {currentUser?.name || '-'}</span>
        <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5"/>Rentang awal 08:00–17:30 · otomatis memanjang mengikuti aktivitas</span>
      </footer>
    </div>
  );
}
