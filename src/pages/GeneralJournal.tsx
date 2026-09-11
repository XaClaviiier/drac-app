import { useEffect, useState } from 'react';
import { api } from '../lib/apiClient';
import { useApp } from '../context/AppContext';

type Line = { accountId: string; debit: string; credit: string };
type Account = { id: string; code: string; name: string; parentId?: string; isActive: boolean };
type Journal = { id: string; branch_id: string; date: string; description: string; source_type: string; source_id: string | null; lines: { line_number: number; account_code: string; account_name: string; debit: string; credit: string }[] };
const blank = (): Line => ({ accountId: '', debit: '0', credit: '0' });
const cents = (value: string) => /^\d{1,13}(\.\d{1,2})?$/.test(value) ? BigInt(value.split('.')[0]) * 100n + BigInt((value.split('.')[1] || '').padEnd(2, '0')) : null;
const decimal = (value: bigint) => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
export default function GeneralJournal() {
  const { data, currentBranchId, hasPermission } = useApp();
  const [rows, setRows] = useState<Journal[]>([]), [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [show, setShow] = useState(false);
  const [branchId, setBranchId] = useState(currentBranchId === 'ALL' ? '' : currentBranchId);
  const [date, setDate] = useState(''), [description, setDescription] = useState(''), [lines, setLines] = useState<Line[]>([blank(), blank()]);
  const load = async () => {
    try {
      const [j, a] = await Promise.all([api.get('general-journals'), api.get('chart-of-accounts')]);
      if (!j.success || !a.success) throw new Error(j.message || a.message || 'Gagal memuat jurnal');
      setRows(j.data || []); setAccounts(a.data || []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Gagal memuat jurnal'); }
  };
  useEffect(() => { void load(); }, []);
  const change = (index: number, field: keyof Line, value: string) => setLines(lines.map((line, i) => i === index ? { ...line, [field]: value } : line));
  const values = lines.map(line => [cents(line.debit), cents(line.credit)]);
  const valid = values.every(([d, c]) => d !== null && c !== null && (d > 0n) !== (c > 0n));
  const debit = values.reduce((sum, [d]) => sum + (d || 0n), 0n), credit = values.reduce((sum, [, c]) => sum + (c || 0n), 0n);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (!valid || debit !== credit || debit === 0n) return setError('Isi satu sisi per baris; debit dan kredit harus seimbang.');
    if (!confirm('Posting jurnal permanen? Edit, hapus dan reversal belum tersedia.')) return;
    setBusy(true);
    try {
      const result = await api.create('general-journals', { branchId, date, description, lines });
      if (!result.success) throw new Error(result.message || 'Gagal menyimpan jurnal');
      setShow(false); setLines([blank(), blank()]); setDescription(''); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Gagal menyimpan jurnal'); }
    finally { setBusy(false); }
  };
  const leaves = accounts.filter(a => a.isActive && !accounts.some(child => child.parentId === a.id));
  return <div className="space-y-4">
    <header className="flex flex-wrap justify-between gap-2"><h1 className="text-xl font-bold">Jurnal Umum</h1><div className="flex gap-2"><button className="rounded border px-3 py-2" onClick={() => void load()}>Muat ulang</button>{hasPermission('settings:edit') && <button className="rounded bg-blue-600 px-3 py-2 text-white" onClick={() => setShow(!show)}>Jurnal manual baru</button>}</div></header>
    <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">Belum termasuk saldo awal dan transaksi legacy. Daftar maksimal 500 jurnal terbaru cabang yang dapat diakses, bukan laporan saldo lengkap. Posting otomatis hanya faktur jasa master tanpa biaya; barang/HPP dan pajak belum didukung. Pembayaran legacy memerlukan rekonsiliasi akuntan sebelum migrasi yang belum tersedia.</p>
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-700">{error}</p>}
    {show && <form onSubmit={save} className="space-y-3 rounded border bg-white p-4">
      <p className="text-sm text-amber-700">Jurnal tersimpan permanen. Tidak mengubah saldo operasional faktur atau stok. Jangan gunakan jurnal manual untuk mengaku telah memigrasikan piutang legacy.</p>
      <div className="grid gap-3 sm:grid-cols-2"><label>Cabang<select required className="block w-full rounded border p-2" value={branchId} onChange={e => setBranchId(e.target.value)}><option value="">Pilih cabang</option>{data.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>Tanggal<input type="date" required className="block w-full rounded border p-2" value={date} onChange={e => setDate(e.target.value)} /></label></div>
      <label className="block">Keterangan<input required maxLength={255} className="block w-full rounded border p-2" value={description} onChange={e => setDescription(e.target.value)} /></label>
      {lines.map((line, i) => <fieldset key={i} className="grid gap-2 rounded border p-3 sm:grid-cols-4"><legend>Baris {i + 1}</legend><label>Akun<select required className="block w-full rounded border p-2" value={line.accountId} onChange={e => change(i, 'accountId', e.target.value)}><option value="">Pilih akun</option>{leaves.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>{(['debit', 'credit'] as const).map(field => <label key={field}>{field === 'debit' ? 'Debit' : 'Kredit'}<input inputMode="decimal" required pattern="[0-9]{1,13}(\.[0-9]{1,2})?" className="block w-full rounded border p-2" value={line[field]} onChange={e => change(i, field, e.target.value)} /></label>)}<button type="button" disabled={lines.length <= 2 || busy} onClick={() => setLines(lines.filter((_, index) => index !== i))}>Hapus baris</button></fieldset>)}
      <p>Debit {decimal(debit)} · Kredit {decimal(credit)} · {valid && debit === credit ? 'Seimbang' : 'Belum seimbang'}</p>
      <div className="flex gap-3"><button type="button" disabled={lines.length >= 100 || busy} className="rounded border px-3 py-2" onClick={() => setLines([...lines, blank()])}>Tambah baris</button><button disabled={busy || !valid || debit !== credit || debit === 0n} className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50">{busy ? 'Menyimpan…' : 'Posting jurnal'}</button></div>
    </form>}
    {rows.filter(row => currentBranchId === 'ALL' || row.branch_id === currentBranchId).map(row => <details key={row.id} className="rounded border bg-white p-3"><summary className="cursor-pointer">{row.date} · {row.description} · {row.source_type} · {data.branches.find(b => b.id === row.branch_id)?.name || row.branch_id}</summary><small className="break-all">ID: {row.id}{row.source_id && ` · Sumber: ${row.source_id}`}</small><div className="overflow-x-auto"><table className="mt-2 w-full text-sm"><thead><tr><th className="text-left">Akun</th><th className="text-right">Debit</th><th className="text-right">Kredit</th></tr></thead><tbody>{row.lines.map(line => <tr key={line.line_number}><td>{line.account_code} · {line.account_name}</td><td className="text-right">{line.debit}</td><td className="text-right">{line.credit}</td></tr>)}</tbody></table></div></details>)}
    {!rows.length && <p>Belum ada jurnal.</p>}
  </div>;
}
