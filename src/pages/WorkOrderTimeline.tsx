import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, Banknote, CalendarDays, Check, CheckCircle2, ChevronRight,
  FileText, Package, Plus, RefreshCw, Settings2, Stethoscope, UserRound, Wrench, XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { SalesInvoice, WorkOrder, WOStatus } from '../types';
import { localDateKey } from '../lib/date';

type StageKey = 'diagnosis' | 'approval' | 'parts' | 'working' | 'done' | 'lost';
type Segment = { key: StageKey; label: string; start: Date; end: Date; duration: number };

const STAGES: Record<StageKey, { label: string; short: string; bar: string; soft: string; text: string; icon: typeof Wrench }> = {
  diagnosis: { label: 'Diagnosa', short: 'Diagnosa', bar: 'bg-orange-500', soft: 'border-orange-300 bg-orange-50', text: 'text-orange-700', icon: Stethoscope },
  approval: { label: 'Tunggu Persetujuan', short: 'Persetujuan', bar: 'bg-amber-400', soft: 'border-amber-300 bg-amber-50', text: 'text-amber-700', icon: UserRound },
  parts: { label: 'Tunggu Parts', short: 'Parts', bar: 'bg-violet-500', soft: 'border-violet-300 bg-violet-50', text: 'text-violet-700', icon: Package },
  working: { label: 'Dikerjakan', short: 'Dikerjakan', bar: 'bg-blue-600', soft: 'border-blue-400 bg-blue-50', text: 'text-blue-700', icon: Wrench },
  done: { label: 'Selesai', short: 'Selesai', bar: 'bg-green-600', soft: 'border-green-400 bg-green-50', text: 'text-green-700', icon: CheckCircle2 },
  lost: { label: 'Lost Sales / Batal', short: 'Lost Sales', bar: 'bg-red-600', soft: 'border-red-300 bg-red-50', text: 'text-red-700', icon: XCircle },
};

const AXIS_START_HOUR = 8;
const AXIS_END_HOUR = 19;

function parseDateTime(value: string | undefined, fallbackDate: string, fallbackHour = AXIS_START_HOUR) {
  const fallback = new Date(`${fallbackDate}T${String(fallbackHour).padStart(2, '0')}:00:00`);
  if (!value) return fallback;
  const parsed = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function durationLabel(milliseconds: number) {
  const minutes = Math.max(0, Math.round(milliseconds / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}j${rest ? ` ${rest}m` : ''}`;
}

function stageForStatus(status: WOStatus, reason = ''): StageKey {
  if (status === 'Pengecekan') return 'diagnosis';
  if (status === 'Pending') return /part|spare|stok|komponen/i.test(reason) ? 'parts' : 'approval';
  if (status === 'Proses') return 'working';
  if (status === 'Closed') return 'lost';
  return 'done';
}

function buildSegments(wo: WorkOrder, invoice: SalesInvoice | undefined, now: Date): Segment[] {
  const logs = [...(wo.statusLog || [])].sort((a, b) => parseDateTime(a.at, wo.date).getTime() - parseDateTime(b.at, wo.date).getTime());
  let status: WOStatus = 'Pengecekan';
  let reason = '';
  let cursor = parseDateTime(wo.createdAt, wo.date);
  const segments: Segment[] = [];
  const add = (until: Date) => {
    const end = until.getTime() <= cursor.getTime() ? new Date(cursor.getTime() + 60000) : until;
    const key = stageForStatus(status, reason);
    segments.push({ key, label: STAGES[key].label, start: cursor, end, duration: end.getTime() - cursor.getTime() });
    cursor = until;
  };
  logs.forEach(log => {
    const at = parseDateTime(log.at, wo.date);
    if (at.getTime() >= cursor.getTime()) add(at);
    status = log.to;
    reason = log.reason || (log.to === 'Pending' ? wo.pendingReason || '' : '');
  });

  const selectedDayEnd = new Date(`${wo.date}T${AXIS_END_HOUR}:00:00`);
  let endpoint = now;
  if (wo.date !== localDateKey(now)) endpoint = selectedDayEnd;
  if (wo.status === 'Invoiced' && invoice?.createdAt) endpoint = parseDateTime(invoice.createdAt, invoice.date, AXIS_END_HOUR);
  if (wo.status === 'Closed') endpoint = parseDateTime(wo.updatedAt, wo.date, AXIS_END_HOUR);
  if (endpoint.getTime() <= cursor.getTime()) endpoint = new Date(cursor.getTime() + 5 * 60000);
  add(endpoint);
  return segments;
}

function selectedDateLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${value}T00:00:00`));
}

export default function WorkOrderTimeline() {
  const navigate = useNavigate();
  const {
    data, currentBranchId, currentUser, hasPermission, isLoading, refreshData, changeWorkOrderStatus,
  } = useApp();
  const [date, setDate] = useState(localDateKey());
  const [selectedId, setSelectedId] = useState('');
  const [stageFilter, setStageFilter] = useState<StageKey | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  const [showLost, setShowLost] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30000);
    const reload = window.setInterval(() => { void refreshData(); }, 120000);
    return () => { window.clearInterval(timer); window.clearInterval(reload); };
  }, []);

  const branch = currentBranchId === 'ALL' ? null : data.branches.find(item => item.id === currentBranchId);
  const invoicesByWo = useMemo(() => new Map(data.invoices.filter(item => item.woId).map(item => [item.woId!, item])), [data.invoices]);
  const dayRows = useMemo(() => data.workOrders.filter(wo => (
    wo.date === date
    && (currentBranchId === 'ALL' || wo.branchId === currentBranchId)
    && (showCompleted || (wo.status !== 'Selesai' && wo.status !== 'Invoiced'))
    && (showLost || wo.status !== 'Closed')
  )), [data.workOrders, date, currentBranchId, showCompleted, showLost]);

  const rowsWithSegments = useMemo(() => dayRows.map(wo => ({
    wo,
    invoice: invoicesByWo.get(wo.id),
    segments: buildSegments(wo, invoicesByWo.get(wo.id), clock),
  })), [dayRows, invoicesByWo, clock]);

  const currentStage = (wo: WorkOrder) => stageForStatus(wo.status, wo.pendingReason || wo.cancelReason || '');
  const selectedStage = selected ? currentStage(selected) : null;
  const stageCounts = useMemo(() => rowsWithSegments.reduce((result, row) => {
    const key = currentStage(row.wo);
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {} as Partial<Record<StageKey, number>>), [rowsWithSegments]);
  const visibleRows = stageFilter ? rowsWithSegments.filter(row => currentStage(row.wo) === stageFilter) : rowsWithSegments;

  useEffect(() => {
    if (selectedId && !visibleRows.some(row => row.wo.id === selectedId)) setSelectedId('');
  }, [selectedId, visibleRows]);

  const selectedRow = visibleRows.find(row => row.wo.id === selectedId) || visibleRows[0];
  const selected = selectedRow?.wo;
  const selectedInvoice = selectedRow?.invoice;
  const selectedReadOnly = Boolean(selectedInvoice || selected?.invoiceId || selected?.status === 'Invoiced' || selected?.status === 'Closed');
  const selectedStages = useMemo(() => {
    if (!selectedRow) return [];
    const totals = new Map<StageKey, { duration: number; start: Date; end: Date }>();
    selectedRow.segments.forEach(segment => {
      const previous = totals.get(segment.key);
      totals.set(segment.key, previous
        ? { duration: previous.duration + segment.duration, start: previous.start, end: segment.end }
        : { duration: segment.duration, start: segment.start, end: segment.end });
    });
    return Array.from(totals.entries()).map(([key, value]) => ({ key, ...value }));
  }, [selectedRow]);

  const axisStart = new Date(`${date}T${String(AXIS_START_HOUR).padStart(2, '0')}:00:00`);
  const axisEnd = new Date(`${date}T${AXIS_END_HOUR}:00:00`);
  const position = (value: Date) => ((value.getTime() - axisStart.getTime()) / (axisEnd.getTime() - axisStart.getTime())) * 100;
  const nowPosition = position(clock);
  const showNowLine = date === localDateKey(clock) && nowPosition >= 0 && nowPosition <= 100;
  const invoicedCount = rowsWithSegments.filter(row => !!row.invoice).length;
  const paidCount = rowsWithSegments.filter(row => row.invoice?.status === 'Lunas').length;

  const moveStatus = async (next: WOStatus, reason?: string) => {
    if (!selected || actionBusy) return;
    setActionBusy(true);
    const result = await changeWorkOrderStatus(selected.id, next, reason);
    setActionBusy(false);
    if (!result.ok) return window.alert(result.message || 'Status WO gagal diubah.');
    await refreshData();
  };
  const setWaiting = (kind: 'approval' | 'parts') => {
    const label = kind === 'parts' ? 'Menunggu parts' : 'Menunggu persetujuan pelanggan';
    const detail = window.prompt(`${label}. Tambahkan keterangan (opsional):`, '');
    if (detail === null) return;
    void moveStatus('Pending', `${label}${detail.trim() ? `: ${detail.trim()}` : ''}`);
  };
  const setLostSales = () => {
    const reason = window.prompt('Alasan Lost Sales / batal:');
    if (!reason?.trim()) return;
    void moveStatus('Closed', reason.trim());
  };

  const currentStageCards: StageKey[] = ['diagnosis', 'approval', 'parts', 'working', 'done'];
  const timelineHours = Array.from({ length: AXIS_END_HOUR - AXIS_START_HOUR + 1 }, (_, index) => AXIS_START_HOUR + index);
  const totalSelectedDuration = selectedRow?.segments.reduce((sum, segment) => sum + segment.duration, 0) || 0;

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-medium text-gray-500">
            <span>SERVIS ORDER</span><ChevronRight className="h-3.5 w-3.5"/><span className="text-blue-700">WO Timeline</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-950">WO Timeline Control Board</h1>
          <p className="text-sm text-gray-500">Pemantauan proses servis dan durasi setiap tahap secara real-time.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {hasPermission('wo:create') && <button type="button" onClick={() => navigate('/workorders?new=1')} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"><Plus className="h-4 w-4"/>New WO</button>}
          <span className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-50 px-3 text-sm font-semibold text-emerald-700"><FileText className="h-4 w-4"/>Faktur {invoicedCount}/{rowsWithSegments.length}</span>
          <span className="inline-flex h-10 items-center gap-2 rounded-lg bg-rose-50 px-3 text-sm font-semibold text-rose-700"><Banknote className="h-4 w-4"/>Lunas {paidCount}/{invoicedCount}</span>
          <button type="button" onClick={() => void refreshData()} className="inline-flex h-10 items-center gap-2 rounded-lg border bg-white px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"><RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}/>Refresh</button>
          <label className="inline-flex h-10 items-center gap-2 rounded-lg border bg-white px-3 text-sm font-medium text-gray-700"><CalendarDays className="h-4 w-4"/><input type="date" value={date} max={localDateKey()} onChange={event => { setDate(event.target.value); setSelectedId(''); }} className="bg-transparent outline-none"/></label>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {currentStageCards.map((key, index) => {
          const config = STAGES[key];
          const Icon = config.icon;
          const active = stageFilter === key;
          return <div key={key} className="contents">
            <button type="button" onClick={() => setStageFilter(active ? null : key)} className={`flex min-w-[170px] flex-1 items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${config.soft} ${active ? 'ring-2 ring-blue-500 ring-offset-1' : 'hover:-translate-y-0.5 hover:shadow-sm'}`}>
              <Icon className={`h-6 w-6 ${config.text}`}/><span className="min-w-0"><b className={`block truncate text-sm ${config.text}`}>{config.label}</b><small className="text-gray-500">{stageCounts[key] || 0} WO</small></span>
            </button>
            {index < currentStageCards.length - 1 && <ChevronRight className="h-5 w-5 flex-shrink-0 text-gray-400"/>}
          </div>;
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {(Object.keys(STAGES) as StageKey[]).map(key => <span key={key} className="inline-flex items-center gap-1.5 text-gray-600"><i className={`h-3 w-3 rounded-sm ${STAGES[key].bar}`}/>{STAGES[key].label}</span>)}
        </div>
        <div className="relative">
          <button type="button" onClick={() => setShowSettings(current => !current)} className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 font-semibold text-gray-600"><Settings2 className="h-4 w-4"/>Pengaturan Tampilan</button>
          {showSettings && <div className="absolute right-0 z-30 mt-2 w-56 rounded-xl border bg-white p-3 shadow-xl">
            <label className="flex items-center justify-between gap-3 py-2 text-sm"><span>Tampilkan WO selesai</span><input type="checkbox" checked={showCompleted} onChange={event => setShowCompleted(event.target.checked)}/></label>
            <label className="flex items-center justify-between gap-3 py-2 text-sm"><span>Tampilkan Lost Sales</span><input type="checkbox" checked={showLost} onChange={event => setShowLost(event.target.checked)}/></label>
          </div>}
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <div className="min-w-[1240px]">
            <div className="grid grid-cols-[270px_minmax(760px,1fr)_190px] border-b bg-gray-50 text-xs font-bold text-gray-800">
              <div className="px-4 py-3">WO / Kendaraan / Teknisi</div>
              <div className="relative grid" style={{ gridTemplateColumns: `repeat(${timelineHours.length - 1}, minmax(0, 1fr))` }}>
                {timelineHours.slice(0, -1).map(hour => <span key={hour} className="border-l px-1 py-3 text-center">{String(hour).padStart(2, '0')}:00</span>)}
                {showNowLine && <span className="absolute bottom-0 top-0 z-20 w-px bg-red-500" style={{ left: `${nowPosition}%` }}><i className="absolute -top-0.5 -translate-x-1/2 whitespace-nowrap rounded bg-red-50 px-1 text-[9px] font-semibold not-italic text-red-600">Sekarang</i></span>}
              </div>
              <div className="px-3 py-3 text-center">Administrasi</div>
            </div>
            {visibleRows.map(({ wo, invoice, segments }) => {
              const selectedRowActive = selected?.id === wo.id;
              return <button key={wo.id} type="button" onClick={() => setSelectedId(wo.id)} className={`grid w-full grid-cols-[270px_minmax(760px,1fr)_190px] border-b text-left last:border-b-0 ${selectedRowActive ? 'bg-blue-50/70 shadow-[inset_4px_0_0_#2563eb]' : 'hover:bg-gray-50'}`}>
                <div className="px-4 py-3">
                  <b className="block text-sm text-gray-900">{wo.woNumber}</b>
                  <span className="block truncate text-xs text-gray-600">{wo.plateNumber} · {wo.vehicleInfo}</span>
                  <span className="block truncate text-xs text-gray-500">Teknisi: {wo.technicianName || wo.createdByName || '-'}</span>
                </div>
                <div className="relative my-2 overflow-hidden rounded bg-[linear-gradient(to_right,rgba(226,232,240,.9)_1px,transparent_1px)]" style={{ backgroundSize: `${100 / (timelineHours.length - 1)}% 100%` }}>
                  {segments.map((segment, index) => {
                    const rawLeft = position(segment.start);
                    const rawRight = position(segment.end);
                    if (rawRight < 0 || rawLeft > 100) return null;
                    const left = Math.max(0, Math.min(100, rawLeft));
                    const right = Math.max(0, Math.min(100, rawRight));
                    return <span key={`${segment.key}-${index}`} title={`${segment.label}: ${durationLabel(segment.duration)}`} className={`absolute top-1/2 flex h-8 -translate-y-1/2 items-center justify-center overflow-hidden rounded px-1 text-[10px] font-bold text-white shadow-sm ${STAGES[segment.key].bar}`} style={{ left: `${left}%`, width: `${Math.max(2.2, right - left)}%` }}>{durationLabel(segment.duration)}</span>;
                  })}
                  {showNowLine && (
                    <span className="absolute bottom-0 top-0 z-20 w-px bg-red-500" style={{ left: `${nowPosition}%` }}/>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-1 px-2 py-3 text-[10px]">
                  <span className={`rounded-md border px-2 py-1 font-semibold ${invoice ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 bg-gray-50 text-gray-400'}`}>{invoice ? invoice.invoiceNumber : 'Belum Faktur'}</span>
                  {invoice && <span className={`rounded-md border px-2 py-1 font-semibold ${invoice.status === 'Lunas' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-600'}`}>{invoice.status}</span>}
                </div>
              </button>;
            })}
            {!visibleRows.length && <div className="p-14 text-center text-sm text-gray-400">Tidak ada WO pada {selectedDateLabel(date)}{stageFilter ? ` dengan status ${STAGES[stageFilter].label}` : ''}.</div>}
          </div>
        </div>
      </section>

      {selected && selectedRow && <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 xl:grid-cols-[1.05fr_.8fr_2fr]">
          <div className="border-l-4 border-blue-600 pl-4">
            <div className="flex items-center gap-2"><h2 className="text-lg font-bold">{selected.woNumber}</h2><span className={`rounded-md px-2 py-1 text-[10px] font-bold ${STAGES[currentStage(selected)].soft} ${STAGES[currentStage(selected)].text}`}>{STAGES[currentStage(selected)].label}</span></div>
            <dl className="mt-3 grid grid-cols-[90px_1fr] gap-y-2 text-sm"><dt className="text-gray-500">Pelanggan</dt><dd className="font-semibold">{selected.customerName}</dd><dt className="text-gray-500">No. Polisi</dt><dd className="font-semibold">{selected.plateNumber}</dd><dt className="text-gray-500">Kendaraan</dt><dd>{selected.vehicleInfo}</dd><dt className="text-gray-500">Teknisi</dt><dd>{selected.technicianName || selected.createdByName || '-'}</dd></dl>
          </div>
          <div className="border-l border-gray-200 pl-4">
            <p className="text-xs font-semibold uppercase text-gray-400">Status Sekarang</p><b className={`mt-1 inline-flex rounded-lg px-3 py-1.5 ${STAGES[currentStage(selected)].soft} ${STAGES[currentStage(selected)].text}`}>{STAGES[currentStage(selected)].label}</b>
            <dl className="mt-3 grid grid-cols-[90px_1fr] gap-y-2 text-sm"><dt className="text-gray-500">Jam Mulai</dt><dd>{selectedRow.segments[0]?.start.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</dd><dt className="text-gray-500">Total Durasi</dt><dd className="font-bold">{durationLabel(totalSelectedDuration)}</dd><dt className="text-gray-500">Cabang</dt><dd>{data.branches.find(item => item.id === selected.branchId)?.name || '-'}</dd></dl>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-gray-400">Rincian Durasi Tahapan</p>
            <div className="flex gap-2 overflow-x-auto pb-2">{selectedStages.map(stage => { const config = STAGES[stage.key]; const Icon = config.icon; return <div key={stage.key} className={`min-w-[135px] flex-1 rounded-xl border p-3 text-center ${config.soft}`}><div className={`flex items-center justify-center gap-1 text-xs font-semibold ${config.text}`}><Icon className="h-4 w-4"/>{config.short}</div><b className="mt-2 block text-xl text-gray-900">{durationLabel(stage.duration)}</b><small className="text-[10px] text-gray-500">{stage.start.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}–{stage.end.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</small></div>; })}</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2 border-t pt-3">
          <button
            type="button"
            onClick={() => navigate(`/workorders?${selectedReadOnly ? 'view' : 'edit'}=${encodeURIComponent(selected.id)}`)}
            className="rounded-lg border px-4 py-2 text-sm font-semibold text-gray-600"
          >{selectedReadOnly ? 'Lihat WO' : 'Buka WO'}</button>
          {hasPermission('wo:edit') && selected.status === 'Pengecekan' && <>
            <button disabled={actionBusy} onClick={() => setWaiting('approval')} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white">Tunggu Persetujuan</button>
            <button disabled={actionBusy} onClick={() => void moveStatus('Proses')} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Setuju · Dikerjakan</button>
            <button disabled={actionBusy} onClick={setLostSales} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white">Lost Sales</button>
          </>}
          {hasPermission('wo:edit') && selected.status === 'Pending' && <>
            <button disabled={actionBusy} onClick={() => void moveStatus('Proses')} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
              {selectedStage === 'parts' ? 'Parts Tersedia · Dikerjakan' : 'Setuju · Dikerjakan'}
            </button>
            <button disabled={actionBusy} onClick={setLostSales} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white">Lost Sales</button>
          </>}
          {hasPermission('wo:edit') && selected.status === 'Proses' && <>
            <button disabled={actionBusy} onClick={() => setWaiting('parts')} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white">Tunggu Parts</button>
            <button disabled={actionBusy} onClick={() => void moveStatus('Selesai')} className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white"><Check className="mr-1 inline h-4 w-4"/>Selesai</button>
          </>}
          {hasPermission('invoice:create') && selected.status === 'Selesai' && !selectedInvoice && <button onClick={() => navigate(`/invoices?woId=${encodeURIComponent(selected.id)}`)} className="rounded-lg bg-blue-700 px-5 py-2 text-sm font-semibold text-white"><FileText className="mr-1 inline h-4 w-4"/>Buat Faktur</button>}
          {hasPermission('payment:create') && selectedInvoice && selectedInvoice.status !== 'Lunas' && <button onClick={() => navigate(`/customer-payments?invoiceId=${encodeURIComponent(selectedInvoice.id)}`)} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white"><Banknote className="mr-1 inline h-4 w-4"/>Pembayaran</button>}
          {selectedInvoice?.status === 'Lunas' && <span className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-4 py-2 text-sm font-bold text-green-700"><CheckCircle2 className="h-4 w-4"/>Lunas</span>}
        </div>
      </section>}

      <p className="flex items-center gap-2 text-xs text-gray-400"><Activity className="h-3.5 w-3.5"/>Data {branch?.name || 'semua cabang'} · pembaruan otomatis setiap 2 menit · operator {currentUser?.name || '-'}</p>
    </div>
  );
}
