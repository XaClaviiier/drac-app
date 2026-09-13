import { useEffect, useMemo, useState } from 'react';
import { BookOpen, RefreshCw, Printer } from 'lucide-react';
import { api } from '../lib/apiClient';

type Account = { id: string; code: string; name: string; isActive: boolean };
type LedgerRow = { journalId: string; date: string; number: string; description: string; memo?: string; branchName?: string; debit: number; credit: number; balance: number };
type LedgerData = { openingBalance: number; closingBalance: number; rows: LedgerRow[] };

const money = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
const today = new Date().toISOString().slice(0, 10);
const firstDay = `${today.slice(0, 8)}01`;

export default function GeneralLedger() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState(firstDay);
  const [to, setTo] = useState(today);
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [data, setData] = useState<LedgerData | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const loadAccounts = async () => {
    const [coa, branch] = await Promise.all([api.get<Account[]>('chart-of-accounts'), api.get<any[]>('branches')]);
    if (!coa.success) throw new Error(coa.message || 'Akun gagal dimuat');
    setAccounts((coa.data || []).filter(a => a.isActive));
    if (branch.success) setBranches((branch.data || []).map(b => ({ id: b.id, name: b.name })));
  };
  const loadLedger = async () => {
    if (!accountId) { setData(null); return; }
    setBusy(true); setNotice('');
    try {
      const query = new URLSearchParams({ accountId, from, to });
      if (branchId) query.set('branchId', branchId);
      const response = await api.get<LedgerData>(`general-ledger?${query}`);
      if (!response.success) throw new Error(response.message || 'Buku besar gagal dimuat');
      setData(response.data || null);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Buku besar gagal dimuat'); }
    finally { setBusy(false); }
  };
  useEffect(() => { void loadAccounts().catch(e => setNotice(e.message)); }, []);
  useEffect(() => { if (accountId) void loadLedger(); }, [accountId]);
  const selected = useMemo(() => accounts.find(a => a.id === accountId), [accounts, accountId]);

  return <div className="p-4 md:p-6 space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-violet-700"><BookOpen size={22}/><span className="text-sm font-semibold">BUKU BESAR</span></div><h1 className="text-2xl font-bold">Histori Akun</h1><p className="text-sm text-gray-500">Mutasi debit, kredit, dan saldo berjalan dari jurnal yang sudah diposting.</p></div><div className="flex gap-2"><button className="rounded-lg border px-3 py-2" onClick={() => void loadLedger()} disabled={busy}><RefreshCw size={16}/></button><button className="rounded-lg border px-3 py-2" onClick={() => window.print()}><Printer size={16}/></button></div></header>
    {notice && <div role="status" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{notice}</div>}
    <section className="grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-4">
      <label className="text-sm md:col-span-2">Akun Perkiraan<select aria-label="Akun Perkiraan" className="mt-1 w-full rounded-lg border p-2.5" value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">Pilih akun</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>
      <label className="text-sm">Dari<input aria-label="Dari tanggal" type="date" className="mt-1 w-full rounded-lg border p-2.5" value={from} onChange={e => setFrom(e.target.value)}/></label>
      <label className="text-sm">Sampai<input aria-label="Sampai tanggal" type="date" className="mt-1 w-full rounded-lg border p-2.5" value={to} onChange={e => setTo(e.target.value)}/></label>
      <label className="text-sm">Cabang<select aria-label="Cabang" className="mt-1 w-full rounded-lg border p-2.5" value={branchId} onChange={e => setBranchId(e.target.value)}><option value="">Semua cabang</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <div className="flex items-end"><button className="w-full rounded-lg bg-violet-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50" onClick={() => void loadLedger()} disabled={busy || !accountId}>Tampilkan</button></div>
    </section>
    {!accountId ? <div className="rounded-xl border border-dashed p-10 text-center text-gray-500">Pilih akun untuk melihat histori buku besar.</div> : data && <section className="overflow-hidden rounded-xl border bg-white"><div className="flex flex-wrap justify-between gap-3 border-b p-4"><div><b>{selected?.code} · {selected?.name}</b><div className="text-sm text-gray-500">{from} s/d {to}</div></div><div className="text-right text-sm"><div>Saldo awal <b>{money(data.openingBalance)}</b></div><div>Saldo akhir <b>{money(data.closingBalance)}</b></div></div></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-left"><tr><th className="p-3">Tanggal</th><th className="p-3">No. Jurnal</th><th className="p-3">Keterangan</th><th className="p-3 text-right">Debit</th><th className="p-3 text-right">Kredit</th><th className="p-3 text-right">Saldo</th></tr></thead><tbody>{data.rows.map(row => <tr key={`${row.journalId}-${row.number}`} className="border-t"><td className="p-3">{row.date}</td><td className="p-3">{row.number}</td><td className="p-3">{row.description}{row.memo && <div className="text-xs text-gray-500">{row.memo}</div>}</td><td className="p-3 text-right">{row.debit ? money(row.debit) : '—'}</td><td className="p-3 text-right">{row.credit ? money(row.credit) : '—'}</td><td className="p-3 text-right font-semibold">{money(row.balance)}</td></tr>)}{!data.rows.length && <tr><td colSpan={6} className="p-8 text-center text-gray-500">Belum ada jurnal pada periode ini.</td></tr>}</tbody></table></div></section>}
  </div>;
}
