import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Banknote, Edit, Landmark, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/apiClient';
import { useApp } from '../context/AppContext';

type Account = { id:string; code:string; name:string; accountType:'cash'|'bank'; branchId?:string; branchName?:string; ledgerAccountId?:string; ledgerAccountName?:string; bankName?:string; accountNumber?:string; accountHolder?:string; isActive:boolean; balance:number; inTransit:number; unsubmitted:number };
type Coa = { id:string; code:string; name:string; accountType:string; isActive:boolean };

export default function CashAccounts({ mode }:{ mode:'cash'|'bank' }) {
  const { data,currentBranchId,hasPermission }=useApp();
  const nav=useNavigate();
  const [rows,setRows]=useState<Account[]>([]),[coa,setCoa]=useState<Coa[]>([]),[loading,setLoading]=useState(false);
  const [show,setShow]=useState(false),[editing,setEditing]=useState<Account|null>(null);
  const makeBlank=()=>({code:'',name:'',accountType:mode,branchId:currentBranchId==='ALL'?'':currentBranchId,ledgerAccountId:'',bankName:'',accountNumber:'',accountHolder:'',isCompanyWide:false,isActive:true});
  const [form,setForm]=useState<any>(makeBlank());
  const load=async()=>{setLoading(true);const[a,c]=await Promise.all([api.get('cash-accounts'),api.get('chart-of-accounts')]);if(a.success)setRows(a.data||[]);else alert(a.message);if(c.success)setCoa(c.data||[]);setLoading(false)};
  useEffect(()=>{void load()},[mode]);
  const visible=useMemo(()=>rows.filter(r=>r.accountType===mode&&(currentBranchId==='ALL'||!r.branchId||r.branchId===currentBranchId)),[rows,mode,currentBranchId]);
  const open=(a?:Account)=>{setEditing(a||null);setForm(a?{...a,isCompanyWide:!a.branchId}:makeBlank());setShow(true)};
  const save=async(e:React.FormEvent)=>{e.preventDefault();const result=editing?await api.update('cash-accounts',editing.id,form):await api.create('cash-accounts',form);if(!result.success)return alert(result.message);setShow(false);await load()};
  const remove=async(a:Account)=>{if(!confirm(`Hapus ${a.name}?`))return;const result=await api.remove('cash-accounts',a.id);if(!result.success)return alert(result.message);await load()};
  return <div className="space-y-3">
    <div className="flex justify-end gap-2"><button onClick={()=>void load()} className="rounded-lg border p-2.5 text-blue-700"><RefreshCw className={`h-5 w-5 ${loading?'animate-spin':''}`}/></button>{hasPermission('settings:edit')&&<button onClick={()=>open()} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white"><Plus className="h-4 w-4"/>{mode==='cash'?'Kas Tunai Baru':'Bank / Transfer Baru'}</button>}</div>
    <div className="grid gap-3 md:grid-cols-3">{visible.map(a=><article key={a.id} className={`rounded-xl border bg-white p-4 ${!a.isActive?'opacity-50':''}`}>
      <div className="flex items-start justify-between"><div className="flex gap-3">{a.accountType==='cash'?<Banknote className="text-green-600"/>:<Landmark className="text-blue-600"/>}<div><b>{a.name}</b><small className="block text-gray-500">{a.code} · {a.accountType==='cash'?'TUNAI':'BANK / TRANSFER'} {a.branchName&&`· ${a.branchName}`}</small><small className="text-violet-600">{a.ledgerAccountName||'Belum terkait akun perkiraan'}</small></div></div><div><button onClick={()=>open(a)} className="p-1.5 text-blue-600"><Edit className="h-4 w-4"/></button><button onClick={()=>void remove(a)} className="p-1.5 text-red-600"><Trash2 className="h-4 w-4"/></button></div></div>
      {a.accountNumber&&<p className="mt-2 text-sm text-gray-600">{a.bankName} · {a.accountNumber} · {a.accountHolder}</p>}<p className="mt-3 text-xs text-gray-500">Saldo buku</p><p className="text-2xl font-bold">Rp {a.balance.toLocaleString('id-ID')}</p>
      {a.accountType==='cash'&&<><div className="mt-2 grid grid-cols-2 text-xs"><span>Belum disetor<br/><b className="text-red-600">Rp {a.unsubmitted.toLocaleString('id-ID')}</b></span><span>Dalam perjalanan<br/><b className="text-amber-600">Rp {a.inTransit.toLocaleString('id-ID')}</b></span></div><button onClick={()=>nav('/branch-deposits')} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 py-2 text-sm font-semibold text-blue-700"><ArrowLeftRight className="h-4 w-4"/>Buat Setoran</button></>}
    </article>)}</div>
    {!visible.length&&<div className="rounded-xl border bg-white p-12 text-center text-gray-400">Belum ada akun</div>}
    {show&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form onSubmit={save} className="w-full max-w-lg rounded-xl bg-white"><header className="flex justify-between border-b p-4"><b>{editing?'Edit':'Tambah'} {mode==='cash'?'Kas Tunai':'Bank / Transfer'}</b><button type="button" onClick={()=>setShow(false)}><X/></button></header><div className="grid gap-3 p-5 sm:grid-cols-2">
      <label className="text-sm">Kode (otomatis jika kosong)<input value={form.code} onChange={e=>setForm({...form,code:e.target.value.toUpperCase()})} className="mt-1 w-full rounded-lg border p-2.5"/></label>
      <label className="text-sm">Nama Akun<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5"/></label>
      <label className="text-sm">Jenis<select value={form.accountType} onChange={e=>setForm({...form,accountType:e.target.value,ledgerAccountId:'',isCompanyWide:e.target.value==='cash'?false:form.isCompanyWide})} className="mt-1 w-full rounded-lg border p-2.5"><option value="cash">Tunai</option><option value="bank">Bank / Transfer</option></select></label>
      <label className="text-sm">Cabang<select disabled={form.isCompanyWide} required={!form.isCompanyWide} value={form.branchId||''} onChange={e=>setForm({...form,branchId:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5 disabled:bg-gray-100"><option value="">Pilih Cabang</option>{data.branches.map(b=><option value={b.id} key={b.id}>{b.name}</option>)}</select></label>
      {form.accountType==='bank'&&<label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={form.isCompanyWide} onChange={e=>setForm({...form,isCompanyWide:e.target.checked,branchId:e.target.checked?'':form.branchId})}/>Akun pusat / digunakan semua cabang</label>}
      <label className="text-sm sm:col-span-2">Kode Perkiraan<select required value={form.ledgerAccountId||''} onChange={e=>setForm({...form,ledgerAccountId:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5"><option value="">Pilih kode perkiraan</option>{coa.filter(x=>x.isActive&&x.accountType==='Asset').map(x=><option value={x.id} key={x.id}>{x.code} · {x.name}</option>)}</select></label>
      {form.accountType==='bank'&&<><label className="text-sm">Nama Bank<input value={form.bankName||''} onChange={e=>setForm({...form,bankName:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5"/></label><label className="text-sm">Nomor Rekening<input value={form.accountNumber||''} onChange={e=>setForm({...form,accountNumber:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5"/></label><label className="text-sm sm:col-span-2">Atas Nama<input value={form.accountHolder||''} onChange={e=>setForm({...form,accountHolder:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5"/></label></>}
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={e=>setForm({...form,isActive:e.target.checked})}/>Aktif</label>
    </div><footer className="flex justify-end gap-2 border-t p-4"><button type="button" onClick={()=>setShow(false)} className="rounded border px-4 py-2">Batal</button><button className="rounded bg-blue-600 px-4 py-2 text-white">Simpan</button></footer></form></div>}
  </div>;
}
