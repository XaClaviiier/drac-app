import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, RefreshCw, Search } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/apiClient';
import IndonesianDateInput from '../components/IndonesianDateInput';

type Movement={id:string;journalId:string;date:string;branchId?:string;number:string;description:string;memo?:string;account:string;kind:'Masuk'|'Keluar'|'Transfer';debit:number;credit:number};
type Report={rows:Movement[];openingBalance:number;closingBalance:number;unsubmitted:number;warnings:string[]};
const money=(v:number)=>`Rp ${Number(v||0).toLocaleString('id-ID')}`;
const localDate=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const csv=(v:unknown)=>`"${String(v??'').replace(/"/g,'""')}"`;

export default function CashBankReport(){
  const {currentBranchId}=useApp();const now=new Date();
  const [report,setReport]=useState<Report|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const [from,setFrom]=useState(localDate(new Date(now.getFullYear(),now.getMonth(),1))),[to,setTo]=useState(localDate(now)),[kind,setKind]=useState('ALL'),[search,setSearch]=useState('');
  const requestId=useRef(0);
  const load=useCallback(async()=>{
    const request=++requestId.current;setLoading(true);setError('');setReport(null);
    if(!from||!to||from>to){setError('Pilih rentang tanggal yang valid.');setLoading(false);return;}
    const query=new URLSearchParams({from,to,branchId:currentBranchId});
    const result=await api.get<Report>(`cash-bank-report?${query}`);
    if(request!==requestId.current)return;
    if(result.success&&result.data)setReport(result.data);else setError(result.message||'Laporan gagal dimuat.');
    setLoading(false);
  },[from,to,currentBranchId]);
  useEffect(()=>{void load();return()=>{requestId.current++}},[load]);
  const movements=useMemo(()=> (report?.rows||[]).filter(r=>(kind==='ALL'||r.kind===kind)&&`${r.number} ${r.description} ${r.memo||''} ${r.account}`.toLowerCase().includes(search.toLowerCase())),[report,kind,search]);
  const cashIn=movements.reduce((s,r)=>s+r.debit,0),cashOut=movements.reduce((s,r)=>s+r.credit,0),ready=report!==null&&!report.warnings.length;
  const exportCsv=()=>{
    const h=['Tanggal','Nomor Jurnal','Jenis','Keterangan','Akun','Debit / Masuk','Kredit / Keluar'];
    const b=movements.map(r=>[r.date,r.number,r.kind,r.description,r.account,r.debit,r.credit].map(csv).join(','));
    const blob=new Blob(['\uFEFF'+[h.map(csv).join(','),...b].join('\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`laporan_kas_bank_${from}_${to}.csv`;a.click();URL.revokeObjectURL(url);
  };
  return <div className="app-fill-stack space-y-3 pb-4">
    <div className="flex justify-end gap-2"><button aria-label="Muat ulang laporan" onClick={()=>void load()} disabled={loading} className="h-9 rounded-lg border px-3 text-blue-700"><RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`}/></button><button onClick={exportCsv} disabled={loading||!ready||!movements.length} className="inline-flex h-9 items-center gap-2 rounded-lg border border-green-300 px-3 text-sm font-semibold text-green-700 disabled:opacity-40"><Download className="h-4 w-4"/>Export CSV</button></div>
    {error&&<p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {!!report?.warnings.length&&<div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><b>Saldo belum lengkap. Periksa pengaitan akun kas/bank.</b>{report.warnings.map(w=><p key={w}>{w}</p>)}</div>}
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4"><Card label="Saldo Awal" value={ready?money(report.openingBalance):'—'} note={`sebelum ${from}`}/><Card label="Kas Masuk / Debit" value={ready?money(cashIn):'—'} note="baris jurnal yang ditampilkan"/><Card label="Kas Keluar / Kredit" value={ready?money(cashOut):'—'} note="baris jurnal yang ditampilkan"/><Card label="Saldo Akhir Kas & Bank" value={ready?money(report.closingBalance):'—'} note={`sampai ${to} · seluruh jenis transaksi`}/></div>
    <p className="text-xs text-gray-500">Saldo awal dan akhir mengikuti periode dan cabang. Setoran terverifikasi tampil sebagai dua baris transfer; setoran yang masih dikirim belum mengubah saldo buku.</p>
    <div className="flex flex-wrap gap-2 border-b border-blue-200 pb-2"><label className="relative min-w-64 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"/><input aria-label="Cari mutasi kas bank" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari nomor jurnal, keterangan, akun..." className="h-9 w-full rounded-lg border pl-9 pr-3 text-sm"/></label><select aria-label="Jenis mutasi" value={kind} onChange={e=>setKind(e.target.value)} className="h-9 rounded-lg border px-3 text-sm"><option value="ALL">Semua Transaksi</option><option>Masuk</option><option>Keluar</option><option>Transfer</option></select><div className="w-36 shrink-0"><IndonesianDateInput ariaLabel="Tanggal awal laporan" value={from} onChange={setFrom} className="h-9 text-sm"/></div><div className="w-36 shrink-0"><IndonesianDateInput ariaLabel="Tanggal akhir laporan" value={to} onChange={setTo} className="h-9 text-sm"/></div></div>
    <div className="app-fill-stack overflow-hidden rounded-xl border bg-white"><div className="app-table-scroll app-table-scroll--fill max-h-[calc(100vh-370px)] overflow-auto"><table className="w-full min-w-[1050px] text-sm"><thead className="sticky top-0 bg-blue-900 text-left text-xs uppercase text-white"><tr>{['Tanggal / Nomor Jurnal','Jenis','Keterangan','Akun','Debit / Masuk','Kredit / Keluar'].map(x=><th key={x} className="px-3 py-2.5">{x}</th>)}</tr></thead><tbody className="divide-y">{movements.map(r=><tr key={r.id} className="hover:bg-blue-50/40"><td className="px-3 py-2"><b className="text-blue-700">{r.number}</b><small className="block text-gray-500">{r.date}</small></td><td className="px-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${r.kind==='Masuk'?'bg-green-100 text-green-700':r.kind==='Keluar'?'bg-red-100 text-red-700':'bg-blue-100 text-blue-700'}`}>{r.kind}</span></td><td className="px-3">{r.description}{r.memo&&r.memo!==r.description&&<small className="block text-gray-500">{r.memo}</small>}</td><td className="px-3">{r.account}</td><td className="px-3 text-right font-semibold text-green-700">{r.debit?money(r.debit):'-'}</td><td className="px-3 text-right font-semibold text-red-600">{r.credit?money(r.credit):'-'}</td></tr>)}</tbody></table></div>{!movements.length&&<div className="p-12 text-center text-gray-400">{loading?'Memuat jurnal...':error?'Laporan belum tersedia.':'Tidak ada mutasi sesuai filter.'}</div>}<div className="flex justify-end gap-5 border-t bg-gray-50 px-4 py-2 text-sm"><span>Debit <b className="text-green-700">{money(cashIn)}</b></span><span>Kredit <b className="text-red-600">{money(cashOut)}</b></span><span>Bersih <b>{money(cashIn-cashOut)}</b></span></div></div>
  </div>;
}
function Card({label,value,note}:{label:string;value:string;note:string}){return <div className="rounded-xl border bg-white p-3 shadow-sm"><p className="text-xs text-gray-500">{label}</p><p className="truncate text-lg font-bold text-gray-900">{value}</p><p className="text-[11px] text-gray-400">{note}</p></div>}
