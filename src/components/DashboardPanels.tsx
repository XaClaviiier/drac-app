import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, ChevronRight, Clock3, FileText, Minus } from 'lucide-react';
import type { buildDashboardMetrics, DashboardRange } from '../lib/dashboardMetrics';

type Metrics = ReturnType<typeof buildDashboardMetrics>;
export const panelClass = 'min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm';
export const money = (value: number) => `Rp ${Math.round(value).toLocaleString('id-ID')}`;
export const compact = (value: number) => {
  const divisor = Math.abs(value) >= 1e9 ? 1e9 : Math.abs(value) >= 1e6 ? 1e6 : Math.abs(value) >= 1e3 ? 1e3 : 1;
  return `Rp ${(value / divisor).toLocaleString('id-ID', { maximumFractionDigits: divisor === 1 ? 0 : 1 })}${divisor === 1e9 ? '\u00a0M' : divisor === 1e6 ? '\u00a0jt' : divisor === 1e3 ? '\u00a0rb' : ''}`;
};
export const shortDate = (key: string) => new Date(`${key}T12:00:00+08:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Makassar' });
export const rangeLabel = (range: DashboardRange) => range.from === range.to ? shortDate(range.from) : `${shortDate(range.from)} – ${shortDate(range.to)}`;

export function SummaryCard({ label, value, shortValue, scope, icon, to, accent, children }: { label: string; value: string; shortValue?: string; scope: string; icon: ReactNode; to?: string; accent?: boolean; children: ReactNode }) {
  const content = <><div className="flex items-start justify-between gap-2"><span className="text-sm font-medium text-slate-600">{label}</span><span className={accent ? 'text-blue-600' : 'text-slate-400'}>{icon}</span></div><p className={`mt-3 break-words font-bold leading-tight tracking-tight tabular-nums ${shortValue ? 'text-xl sm:text-2xl' : 'text-lg sm:text-2xl'} ${accent ? 'text-blue-700' : 'text-slate-900'}`} title={value}>{shortValue ? <><span className="sm:hidden">{shortValue}</span><span className="hidden sm:inline">{value}</span></> : value}</p><p className="mt-2 text-[11px] text-slate-500">{scope}</p><div className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">{children}</div>{to && <ArrowRight className="absolute bottom-4 right-4 h-3.5 w-3.5 text-slate-300 group-hover:text-blue-600" />}</>;
  const className = `${panelClass} group relative p-3 sm:p-4 ${to ? 'transition-colors hover:border-blue-300' : ''} ${accent ? 'border-t-2 border-t-blue-600' : ''}`;
  return to ? <Link to={to} className={className}>{content}</Link> : <div className={className}>{content}</div>;
}
export function SalesChange({ value, previous }: { value: number; previous: number | null }) {
  if (previous === null) return null;
  if (previous <= 0) return <p>Periode pembanding {money(previous)} · perubahan % tidak tersedia</p>;
  const change = ((value - previous) / previous) * 100;
  const Icon = change < 0 ? ArrowDownRight : change > 0 ? ArrowUpRight : Minus;
  return <p className={`flex items-center gap-1 ${change < 0 ? 'text-amber-700' : change > 0 ? 'text-emerald-700' : 'text-slate-500'}`}><Icon className="h-3.5 w-3.5 flex-shrink-0" /><span>{Math.abs(change).toLocaleString('id-ID', { maximumFractionDigits: 1 })}% {change < 0 ? 'turun' : change > 0 ? 'naik' : 'tetap'} dari pembanding</span></p>;
}
export function SectionTitle({ title, subtitle, aside }: { title: string; subtitle: string; aside?: ReactNode }) {
  return <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h2 className="text-base font-bold text-slate-900">{title}</h2><p className="mt-1 text-xs leading-relaxed text-slate-500">{subtitle}</p></div>{aside}</div>;
}
export function ActionCard({ label, value, note, warning, available, to }: { label: string; value: string; note: string; warning: boolean; available: boolean; to?: string }) {
  const content = <><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-slate-600">{label}</span>{warning ? <Clock3 className="h-3.5 w-3.5 flex-shrink-0 text-amber-600" /> : available ? <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" /> : <Minus className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />}</div><p className={`mt-2 text-lg font-bold tabular-nums ${warning ? 'text-amber-800' : 'text-slate-800'}`}>{value}</p><p className="mt-1 text-[11px] leading-relaxed text-slate-500">{note}</p></>;
  const className = `rounded-lg border p-3 ${warning ? 'border-amber-200 bg-amber-50/60' : 'border-slate-100 bg-slate-50/60'} ${to ? 'transition-colors hover:border-blue-300' : ''}`;
  return to ? <Link className={className} to={to}>{content}</Link> : <div className={className}>{content}</div>;
}
function TargetProgress({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-slate-400">—</span>;
  return <div><b className="text-xs tabular-nums text-slate-700">{value.toLocaleString('id-ID')}%</b><div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div></div>;
}
export function Unavailable({ loading }: { loading: boolean }) { return <p role="status" className="px-4 py-12 text-center text-sm text-slate-500">{loading ? 'Memuat ringkasan…' : 'Data belum tersedia. Silakan perbarui Dashboard.'}</p>; }

export function BranchTable({ metrics, onBranch }: { metrics: Metrics; onBranch: (id: string) => void }) {
  return <>
    <div className="hidden overflow-x-auto md:block"><table className="w-full text-sm">
      <thead className="border-y border-slate-200 bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-5 py-3 font-medium">Cabang</th><th className="px-4 py-3 text-right font-medium">Omzet</th><th className="px-4 py-3 text-right font-medium">Target bulan ini</th><th className="min-w-28 px-4 py-3 font-medium">Tercapai</th><th className="px-4 py-3 text-right font-medium">Selisih target s.d. hari ini</th><th className="px-5 py-3 text-right font-medium">Estimasi akhir bulan</th></tr></thead>
      <tbody className="divide-y divide-slate-100">{metrics.rows.map(row => <tr key={row.branchId} className="hover:bg-slate-50/70">
        <td className="px-5 py-4"><button type="button" onClick={() => onBranch(row.branchId)} className="inline-flex items-center gap-1 font-semibold text-slate-800 hover:text-blue-700" aria-label={`Lihat dashboard ${row.branchLabel}`}>{row.branchLabel}<ChevronRight className="h-3.5 w-3.5 text-slate-400" /></button><p className="mt-1 text-xs text-slate-500">{row.invoiceCount} faktur</p></td>
        <td className="whitespace-nowrap px-4 py-4 text-right font-semibold tabular-nums">{money(row.sales)}</td>
        <td className="whitespace-nowrap px-4 py-4 text-right tabular-nums text-slate-500">{row.target === null ? '—' : compact(row.target)}</td>
        <td className="px-4 py-4"><TargetProgress value={row.achievementPercent} /></td>
        <td className={`whitespace-nowrap px-4 py-4 text-right tabular-nums ${row.paceDifference !== null && row.paceDifference < 0 ? 'text-amber-700' : 'text-slate-600'}`}>{row.paceDifference === null ? '—' : `${row.paceDifference > 0 ? '+' : ''}${compact(row.paceDifference)}`}</td>
        <td className="whitespace-nowrap px-5 py-4 text-right font-medium tabular-nums text-slate-700">{row.projectedSales === null ? '—' : compact(row.projectedSales)}</td>
      </tr>)}</tbody>
      {metrics.rows.length > 1 && <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold"><tr><td className="px-5 py-3">Total</td><td className="px-4 py-3 text-right tabular-nums">{money(metrics.sales)}</td><td className="px-4 py-3 text-right tabular-nums">{metrics.target === null ? '—' : compact(metrics.target)}</td><td className="px-4 py-3">{metrics.achievementPercent === null ? '—' : `${metrics.achievementPercent.toLocaleString('id-ID')}%`}</td><td className="px-4 py-3 text-right tabular-nums">{metrics.paceDifference === null ? '—' : compact(metrics.paceDifference)}</td><td className="px-5 py-3 text-right tabular-nums">{metrics.projectedSales === null ? '—' : compact(metrics.projectedSales)}</td></tr></tfoot>}
    </table></div>
    <div className="divide-y divide-slate-100 md:hidden">{metrics.rows.map(row => <div key={row.branchId} className="px-4 py-4">
      <div className="flex items-start justify-between gap-2"><button type="button" onClick={() => onBranch(row.branchId)} className="flex min-h-10 items-center gap-1 text-sm font-semibold text-slate-800">{row.branchLabel}<ChevronRight className="h-3.5 w-3.5" /></button><div className="text-right"><p className="text-sm font-bold tabular-nums">{money(row.sales)}</p><p className="mt-1 text-xs text-slate-500">{row.invoiceCount} faktur</p></div></div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><span className="text-slate-500">Target</span><p className="mt-1 font-medium">{row.target === null ? '—' : compact(row.target)}</p></div><div><span className="text-slate-500">Tercapai</span><p className="mt-1 font-medium">{row.achievementPercent === null ? '—' : `${row.achievementPercent.toLocaleString('id-ID')}%`}</p></div><div><span className="text-slate-500">Estimasi</span><p className="mt-1 font-medium">{row.projectedSales === null ? '—' : compact(row.projectedSales)}</p></div></div>
      {row.paceDifference !== null && row.paceDifference < 0 && <p className="mt-3 text-xs text-amber-700">Kurang {compact(Math.abs(row.paceDifference))} dari target sampai hari ini.</p>}
    </div>)}</div>
    {metrics.rows.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Belum ada cabang aktif yang dapat ditampilkan.</p>}
  </>;
}

export function SalesChart({ metrics, range, comparisonRange, canOpenInvoices }: { metrics: Metrics; range: DashboardRange; comparisonRange: DashboardRange | null; canOpenInvoices: boolean }) {
  const rows = metrics.trend;
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(680);
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(200, entries[0].contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const maximum = Math.max(1, ...rows.flatMap(row => [row.sales, row.previousSales || 0]));
  const height = 180, left = 48, right = 14, top = 15;
  const x = (index: number) => left + (rows.length < 2 ? (width - left - right) / 2 : index * (width - left - right) / (rows.length - 1));
  const y = (value: number) => top + height - (value / maximum) * height;
  const actual = rows.map((row, index) => ({ row, index })).filter(({ row }) => row.from);
  const previous = rows.map((row, index) => ({ row, index })).filter(({ row }) => row.previousFrom);
  const path = actual.map(({ row, index }, position) => `${position ? 'L' : 'M'}${x(index)},${y(row.sales)}`).join(' ');
  const comparisonPath = previous.map(({ row, index }, position) => `${position ? 'L' : 'M'}${x(index)},${y(row.previousSales || 0)}`).join(' ');
  const linkFor = (from: string, to: string) => `/invoices?${new URLSearchParams({ source: 'dashboard', from, to })}`;
  const tickEvery = Math.max(1, Math.ceil(rows.length / (width < 450 ? 3 : 6)));
  return <div className="mt-4" ref={container}>
    <div className="mb-3 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-slate-500"><span className="inline-flex items-center gap-2"><span className="h-0.5 w-5 bg-blue-600" />{rangeLabel(range)}</span>{comparisonRange && <span className="inline-flex items-center gap-2"><span className="w-5 border-t-2 border-dashed border-slate-400" />{rangeLabel(comparisonRange)}</span>}</div>
    {metrics.sales === 0 && (!comparisonRange || metrics.previousSales === 0) ? <div className="flex min-h-52 flex-col items-center justify-center text-center"><FileText className="mb-3 h-7 w-7 text-slate-300" /><p className="text-sm font-medium text-slate-600">Belum ada faktur pada periode ini</p><p className="mt-1 text-xs text-slate-500">Coba pilih cabang atau rentang tanggal lain.</p></div> : <svg viewBox={`0 0 ${width} 235`} className="w-full overflow-visible" role="img" aria-label={`Tren omzet ${rangeLabel(range)}, total ${money(metrics.sales)}`}>
      <title>Tren omzet dan periode pembanding</title>
      {[0, 0.5, 1].map(fraction => <g key={fraction}><line x1={left} x2={width - right} y1={y(maximum * fraction)} y2={y(maximum * fraction)} stroke="#e2e8f0" strokeDasharray="3 4" /><text x={left - 8} y={y(maximum * fraction) + 4} textAnchor="end" fill="#64748b" fontSize="11">{compact(maximum * fraction).replace('Rp ', '')}</text></g>)}
      {comparisonRange && <path d={comparisonPath} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="5 5" />}
      {actual.length > 0 && <path d={`${path} L${x(actual[actual.length - 1].index)},${y(0)} L${x(actual[0].index)},${y(0)} Z`} fill="#2563eb" fillOpacity="0.06" />}
      <path d={path} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {rows.map((row, index) => <g key={row.key}>{row.from && <circle cx={x(index)} cy={y(row.sales)} r={rows.length <= 31 ? 3 : 2} fill="#2563eb"><title>{shortDate(row.from)}: {money(row.sales)}</title></circle>}{((index % tickEvery === 0 && index < rows.length - Math.ceil(tickEvery / 2)) || index === rows.length - 1) && <text x={x(index)} y="221" textAnchor={index === 0 ? 'start' : index === rows.length - 1 ? 'end' : 'middle'} fill="#64748b" fontSize="11">{row.label}</text>}</g>)}
    </svg>}
    <details className="mt-3 border-t border-slate-100 pt-3 text-xs"><summary className="cursor-pointer font-medium text-slate-600">Lihat rincian angka</summary><div className="mt-3 max-h-64 overflow-auto"><table className="w-full text-left"><thead className="sticky top-0 bg-white text-slate-500"><tr><th className="py-2 font-medium">Tanggal</th><th className="py-2 text-right font-medium">Omzet</th>{comparisonRange && <th className="py-2 text-right font-medium">Pembanding</th>}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map(row => <tr key={row.key}><td className="py-2 text-slate-600">{row.from && row.to ? rangeLabel({ from: row.from, to: row.to }) : '—'}</td><td className="py-2 text-right tabular-nums">{canOpenInvoices && row.from && row.to ? <Link className="font-medium text-blue-700 hover:underline" to={linkFor(row.from, row.to)}>{money(row.sales)}</Link> : row.from ? money(row.sales) : '—'}</td>{comparisonRange && <td className="py-2 pl-2 text-right tabular-nums text-slate-500">{row.previousFrom && row.previousTo ? <><span className="block text-[10px]">{rangeLabel({ from: row.previousFrom, to: row.previousTo })}</span>{canOpenInvoices ? <Link className="hover:text-blue-700 hover:underline" to={linkFor(row.previousFrom, row.previousTo)}>{money(row.previousSales || 0)}</Link> : money(row.previousSales || 0)}</> : '—'}</td>}</tr>)}</tbody></table></div></details>
  </div>;
}
