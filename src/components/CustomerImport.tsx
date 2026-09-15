import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/apiClient';
import { downloadImportCsv, guessCustomerMapping, importFields, mapCustomerRows, readCustomerFile } from '../lib/customerImport';
import type { ImportMapping, ImportPreview, ImportRow, ImportTable } from '../lib/customerImport';

const labels = { name: 'Nama', phone: 'Telepon / Handphone', businessPhone: 'Telepon bisnis', category: 'Kategori', accurateId: 'ID Accurate', email: 'Email', address: 'Alamat', contact: 'Kontak', description: 'Deskripsi sumber' };
const statuses: Record<string, string> = { new: 'Baru', existing: 'Existing (skip)', duplicate: 'Duplikat', conflict: 'Konflik', invalid: 'Invalid', created: 'Berhasil' };
type Props = { branches: { id: string; name: string }[]; defaultBranchId: string; onClose: () => void; onComplete: () => Promise<void>; embedded?: boolean };

export default function CustomerImport({ branches, defaultBranchId, onClose, onComplete, embedded = false }: Props) {
  const [table, setTable] = useState<ImportTable>();
  const [mapping, setMapping] = useState<ImportMapping>();
  const [source, setSource] = useState('');
  const [branchId, setBranchId] = useState(defaultBranchId);
  const [preview, setPreview] = useState<ImportPreview>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState('all');
  const [attempt, setAttempt] = useState<{ runId: string; rows: ImportRow[]; digest: string; branchId: string; source: string }>();
  const [uncertain, setUncertain] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const guard = useRef(false);
  useEffect(() => {
    if (!busy && !uncertain) return;
    const stop = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', stop); return () => window.removeEventListener('beforeunload', stop);
  }, [busy, uncertain]);
  const invalidate = () => { setPreview(undefined); setAttempt(undefined); setConfirmed(false); setPage(0); setError(''); };
  const load = async (file?: File) => {
    if (!file || guard.current) return;
    guard.current = true; invalidate(); setTable(undefined); setMapping(undefined); setBusy('Membaca file…');
    try { const next = await readCustomerFile(file); setTable(next); setMapping(guessCustomerMapping(next.headers)); setSource(file.name); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(''); guard.current = false; }
  };
  const inspect = async () => {
    if (!table || !mapping || guard.current) return;
    guard.current = true; setBusy('Memvalidasi seluruh baris di server…'); setError(''); setPreview(undefined); setConfirmed(false);
    try {
      const rows = mapCustomerRows(table, mapping);
      const response = await api.create('customers/import-preview', { rows, branchId, source }, { signal: AbortSignal.timeout(120_000) });
      if (!response.success || !response.data) throw new Error(response.message || 'Preview gagal.');
      setPreview(response.data); setPage(0);
      setAttempt({ rows, branchId, source, digest: response.data.digest, runId: crypto.randomUUID() });
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(''); guard.current = false; }
  };
  const execute = async () => {
    if (!attempt || guard.current) return;
    guard.current = true; setBusy('Mengimpor dan memverifikasi baca ulang…'); setError('');
    try {
      const response = await api.create('customers/import', attempt, { signal: AbortSignal.timeout(120_000) });
      if (!response.success && (response.error === 'IMPORT_REJECTED' || [401, 403, 413].includes(response.httpStatus || 0))) {
        setUncertain(false); setAttempt(undefined); setPreview(undefined); setConfirmed(false);
        setError(response.message || 'Import ditolak. Jalankan preview ulang.'); return;
      }
      if (!response.success || !response.data?.verified) {
        // Network failure has an unknown outcome. Keep the exact payload/run ID for replay.
        setUncertain(true); throw new Error((response.message || 'Import belum terverifikasi.') + ' Coba ulang aman memakai ID import yang sama.');
      }
      setPreview(response.data); setUncertain(false); setConfirmed(false);
      const failedRows = response.data.rows.filter((row: ImportRow) => row.status !== 'created');
      if (failedRows.length) {
        const text = ['LAPORAN GAGAL IMPORT CUSTOMER', `Berhasil: ${response.data.counts.created}`, `Gagal: ${failedRows.length}`, '', ...failedRows.map((row: ImportRow) => `Baris ${row.rowNumber} | ${row.name} | ${row.phone || 'tanpa nomor'} | ${statuses[row.status] || row.status} | ${row.reason || 'Tidak diimpor'}`)].join('\n');
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'laporan-gagal-import-customer.txt'; link.click(); URL.revokeObjectURL(url);
      }
      try { await onComplete(); } catch { setError('Import terverifikasi, tetapi penyegaran daftar gagal. Muat ulang daftar.'); }
    } catch (e) { setUncertain(true); setError((e as Error).message); }
    finally { setBusy(''); guard.current = false; }
  };
  const report = () => {
    if (!preview) return;
    const reportRows = preview.rows.filter(row => filter === 'all' || row.status === filter);
    const fields = ['rowNumber','name','cleanName','phone','businessPhone','normalizedPhone','category','categories','accurateId','contact','email','address','description','status','reason','customerId','duplicateOf'] as const;
    downloadImportCsv(`laporan-import-customer-${filter === 'all' ? 'semua' : filter}.csv`, [['runId', 'source', 'branchId', 'executionState', 'executionError', ...fields], ...reportRows.map(row => [attempt?.runId, source, branchId, preview.verified ? 'verified' : uncertain ? 'unverified' : 'preview_only', uncertain ? error : '', ...fields.map(field => uncertain && row.status === 'new' && field === 'status' ? 'unverified' : row[field])])]);
  };
  const visible = preview?.rows.filter(row => filter === 'all' || row.status === filter) || [];
  const locked = Boolean(busy || uncertain || preview?.verified);
  const button = 'rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium disabled:opacity-40';
  const content = <div className={`${embedded ? 'mx-auto max-w-6xl' : 'mx-auto my-2 max-h-[calc(100vh-1rem)] max-w-6xl overflow-y-auto sm:my-6 sm:max-h-[calc(100vh-3rem)]'} space-y-4 rounded-xl bg-white p-4 sm:p-6`}>
      <div className="flex items-center justify-between gap-3"><h1 id="import-title" className="text-2xl font-medium text-gray-900">Unggah dan Impor File</h1><button className={button} onClick={onClose} disabled={Boolean(busy || uncertain)}>Tutup</button></div>
      <p className="text-sm text-gray-600">Customer berlaku global untuk semua cabang. Kategori Accurate tetap kategori. Existing di-skip; konflik dan nomor tidak valid perlu diperbaiki pada salinan file lalu dipreview ulang.</p>
      <div className="space-y-3 rounded border border-gray-200 bg-gray-50 p-4">
        <label className="block text-sm font-medium text-gray-800">Unggah file Excel pelanggan <span className="font-normal text-gray-500">(.xls, .xlsx, atau CSV; maks. 8 MB / 5.000 baris)</span><input aria-label="File customer" type="file" accept=".csv,.xls,.xlsx" disabled={locked} onChange={event => void load(event.target.files?.[0])} className="mt-2 block h-11 w-full max-w-xl cursor-pointer rounded border border-blue-500 bg-white p-2 text-sm text-gray-700 shadow-sm file:mr-3 file:rounded file:border-0 file:bg-blue-700 file:px-4 file:py-1.5 file:text-sm file:font-semibold file:text-white" /></label>
        <button type="button" className="text-sm text-blue-700 underline underline-offset-2 hover:text-blue-900" onClick={() => downloadImportCsv('template-customer.csv', [['name','phone','customer_category','accurate_id','email','address','business_phone','contact','description'], ['PELANGGAN CONTOH','081234567890','Umum','','','','','','']])}>Unduh template Excel</button>
        {!embedded && <label className="text-sm">Cabang pertama input<select aria-label="Cabang pertama input" value={branchId} disabled={locked} onChange={event => { setBranchId(event.target.value); invalidate(); }} className="ml-2 rounded border p-2"><option value="">Pilih cabang</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>}
      </div>
      {table && mapping && <><p className="text-sm">{source} · {table.rows.length} baris sumber. Periksa pemetaan kolom berikut. Nama dan telepon wajib dipetakan.</p>
        {table.rows.length % 1000 === 0 && <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">Jumlah baris tepat kelipatan 1.000. Periksa batas ekspor Accurate; file ini belum membuktikan seluruh master sudah tercakup.</p>}
        <details open={!preview}><summary className="cursor-pointer text-sm font-medium text-blue-700">Pemetaan kolom</summary><div className="mt-3 grid gap-3 sm:grid-cols-3">{Object.keys(importFields).map(key => {
          const field = key as keyof ImportMapping;
          return <label key={field} className="text-sm">{labels[field]}<select aria-label={`Kolom ${labels[field]}`} value={mapping[field]} disabled={locked} onChange={event => { setMapping({ ...mapping, [field]: event.target.value }); invalidate(); }} className="mt-1 block w-full rounded border p-2"><option value="">Tidak dipetakan</option>{table.headers.filter(Boolean).map(h => <option key={h} value={h}>{h}</option>)}</select></label>;
        })}</div></details><button className={`${button} bg-blue-50 text-blue-700`} disabled={locked || !branchId} onClick={() => void inspect()}>Preview tanpa menyimpan</button></>}
      {busy && <div role="status" className="text-sm text-blue-700"><progress aria-label="Proses import customer" className="mr-2 w-28" />{busy} Seluruh baris diproses dalam satu transaksi.</div>}
      {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {preview && <>
        <div className="flex flex-wrap gap-2">{Object.entries(preview.counts).map(([status, count]) => <span key={status} className="rounded bg-gray-100 px-3 py-1 text-sm">{statuses[status]}: {count}</span>)}</div>
        {preview.verified && <p role="status" className="rounded bg-green-50 p-3 text-green-800">Selesai. Berhasil: {preview.counts.created} customer. Gagal/tidak diimpor: {preview.rows.filter(row => row.status !== 'created').length} baris (existing dianggap duplikat dan dilewati). File TXT gagal import otomatis diunduh.</p>}
        <div className="flex flex-wrap gap-3"><label className="text-sm">Status <select aria-label="Filter status import" value={filter} onChange={event => { setFilter(event.target.value); setPage(0); }} className="rounded border p-2"><option value="all">Semua</option>{Object.entries(statuses).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label><button className={button} onClick={report}>Unduh laporan {filter === 'all' ? 'semua baris' : statuses[filter].toLowerCase()}</button></div>
        <div className="max-h-96 overflow-auto rounded border"><table className="w-full min-w-[1000px] text-left text-xs"><thead className="sticky top-0 bg-gray-100"><tr>{['Baris','Nama asli → bersih','Telepon asli / bisnis → normal','Kategori / ID sumber','Status / alasan'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{visible.slice(page * 50, (page + 1) * 50).map(row => <tr key={row.rowNumber} className="border-t align-top"><td className="p-2">{row.rowNumber}</td><td className="max-w-xs whitespace-pre-wrap break-words p-2">{row.name}<br /><strong>{row.cleanName}</strong></td><td className="p-2">{row.phone || '—'} / {row.businessPhone || '—'}<br /><strong>{row.normalizedPhone || '—'}</strong></td><td className="p-2">{row.categories.join(', ') || '—'}<br />{row.accurateId}</td><td className="max-w-xs p-2"><strong>{statuses[row.status]}</strong><br />{row.reason}</td></tr>)}</tbody></table></div>
        <div className="flex items-center gap-3 text-sm"><button className={button} disabled={page === 0} onClick={() => setPage(page - 1)}>Sebelumnya</button><span>{visible.length ? page * 50 + 1 : 0}–{Math.min((page + 1) * 50, visible.length)} dari {visible.length}</span><button className={button} disabled={(page + 1) * 50 >= visible.length} onClick={() => setPage(page + 1)}>Berikutnya</button></div>
        {!preview.verified && preview.counts.new === 0 && <p role="alert" className="border-t border-red-200 bg-red-50 p-3 text-sm text-red-800">Tidak ada customer baru yang dapat diimpor. {preview.counts.existing} data sudah ada dan dilewati; {preview.counts.conflict + preview.counts.invalid + preview.counts.duplicate} baris perlu diperiksa atau diperbaiki.</p>}
        {!preview.verified && preview.counts.new > 0 && <div className="space-y-3 border-t pt-3"><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={Boolean(busy || uncertain)} onChange={event => setConfirmed(event.target.checked)} />Saya sudah meninjau preview dan akan membuat hanya {preview.counts.new} customer baru. Existing, konflik, duplikat dan invalid tidak diimpor sebagai customer baru.</label><button className={`${button} bg-blue-600 text-white`} disabled={Boolean(busy) || (!uncertain && (!confirmed || !preview.counts.new))} onClick={() => void execute()}>{uncertain ? 'Coba ulang aman / verifikasi hasil' : `Import ${preview.counts.new} customer baru`}</button></div>}
      </>}
    </div>;
  return embedded ? content : <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/50 p-2 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="import-title">{content}</div>;
}
