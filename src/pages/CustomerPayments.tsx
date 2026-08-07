import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Banknote, CalendarDays, Landmark, Plus, RefreshCw, Search, Trash2, WalletCards, X } from "lucide-react";
import { api } from "../lib/apiClient";
import { useApp } from "../context/AppContext";

type PaymentRow = { id:string; paymentNumber:string; invoiceId:string; invoiceNumber:string; date:string; customerName:string; customerId:string; vehicleInfo:string; invoiceTotal:number; invoicePaid:number; amount:number; balanceAfter:number; paymentStatus:"Lunas"|"Cicilan"; paymentMethod:string; accountId?:string; accountName?:string; branchId:string; createdByName?:string };
type CashAccount = { id:string; name:string; accountType:"cash"|"bank"; branchId?:string };
type DepositSummary = { branchId:string; unsubmitted:number };
type Period = "today"|"this_month"|"last_month"|"custom"|"all";

const rupiah=(value:number)=>`Rp ${Number(value||0).toLocaleString("id-ID")}`;
const localDate=(date=new Date())=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
const displayDate=(value:string)=>value?new Intl.DateTimeFormat("id-ID",{day:"2-digit",month:"short",year:"numeric"}).format(new Date(`${value}T00:00:00`)):"-";

export default function CustomerPayments(){
  const [searchParams,setSearchParams]=useSearchParams();
  const {data,currentBranchId,hasPermission,refreshData}=useApp();
  const [rows,setRows]=useState<PaymentRow[]>([]),[accounts,setAccounts]=useState<CashAccount[]>([]),[depositSummary,setDepositSummary]=useState<DepositSummary[]>([]);
  const [loading,setLoading]=useState(false),[search,setSearch]=useState(""),[showForm,setShowForm]=useState(false),[invoiceSearch,setInvoiceSearch]=useState("");
  const [period,setPeriod]=useState<Period>("this_month"),[dateFrom,setDateFrom]=useState(""),[dateTo,setDateTo]=useState("");
  const [methodFilter,setMethodFilter]=useState("ALL"),[accountFilter,setAccountFilter]=useState("ALL"),[userFilter,setUserFilter]=useState("ALL"),[statusFilter,setStatusFilter]=useState("ALL");
  const today=localDate();
  const emptyForm={invoiceId:"",date:today,amount:0,paymentMethod:"Tunai",accountId:"",notes:""};
  const [form,setForm]=useState(emptyForm);

  const load=async()=>{setLoading(true);const[p,a,d]=await Promise.all([api.get("customer-payments"),api.get("cash-accounts"),api.get("branch-deposits")]);
    if(p.success)setRows(p.data||[]);else window.alert(p.message);if(a.success)setAccounts(a.data||[]);if(d.success)setDepositSummary(d.data?.summary||[]);setLoading(false)};
  useEffect(()=>{void load()},[]);

  const unpaid=data.invoices.filter(i=>i.total>i.payment&&(currentBranchId==="ALL"||i.branchId===currentBranchId));
  const invoice=data.invoices.find(i=>i.id===form.invoiceId),outstanding=invoice?Math.max(0,invoice.total-invoice.payment):0;
  const invoiceChoices=useMemo(()=>{const q=invoiceSearch.trim().toLowerCase();return unpaid.filter(i=>{const customer=data.customers.find(c=>c.id===i.customerRefId||c.id===i.customerId||c.name===i.customerName);return `${i.invoiceNumber} ${i.customerName} ${customer?.phone||""} ${i.vehicleInfo}`.toLowerCase().includes(q)}).slice(0,60)},[unpaid,invoiceSearch,data.customers]);
  const expectedAccountType=form.paymentMethod==="Tunai"?"cash":"bank";
  const availableAccounts=accounts.filter(a=>a.accountType===expectedAccountType&&(!a.branchId||a.branchId===invoice?.branchId));

  useEffect(()=>{
    const invoiceId=searchParams.get("invoiceId");
    if(!invoiceId)return;
    const selected=data.invoices.find(item=>item.id===invoiceId);
    if(!selected||selected.total<=selected.payment)return;
    setInvoiceSearch("");
    setForm({invoiceId:selected.id,date:today,amount:Math.max(0,selected.total-selected.payment),paymentMethod:"Tunai",accountId:"",notes:""});
    setShowForm(true);
    setSearchParams({}, {replace:true});
  },[searchParams,data.invoices,today,setSearchParams]);

  const periodRange=useMemo(()=>{const now=new Date();if(period==="all")return ["",""];if(period==="today")return [today,today];if(period==="custom")return [dateFrom,dateTo];
    const base=period==="last_month"?new Date(now.getFullYear(),now.getMonth()-1,1):new Date(now.getFullYear(),now.getMonth(),1);
    return [localDate(base),localDate(new Date(base.getFullYear(),base.getMonth()+1,0))]},[period,dateFrom,dateTo,today]);
  const filtered=useMemo(()=>rows.filter(r=>(currentBranchId==="ALL"||r.branchId===currentBranchId)&&(!periodRange[0]||r.date>=periodRange[0])&&(!periodRange[1]||r.date<=periodRange[1])&&(methodFilter==="ALL"||r.paymentMethod===methodFilter)&&(accountFilter==="ALL"||r.accountId===accountFilter)&&(userFilter==="ALL"||(r.createdByName||"-")===userFilter)&&(statusFilter==="ALL"||r.paymentStatus===statusFilter)&&`${r.paymentNumber} ${r.invoiceNumber} ${r.customerName} ${r.customerId} ${r.vehicleInfo} ${r.accountName||""}`.toLowerCase().includes(search.toLowerCase())),[rows,currentBranchId,periodRange,methodFilter,accountFilter,userFilter,statusFilter,search]);
  const inputUsers=useMemo(()=>Array.from(new Set(rows.map(r=>r.createdByName||"-").filter(Boolean))).sort(),[rows]);
  const visibleAccounts=useMemo(()=>accounts.filter(a=>!a.branchId||currentBranchId==="ALL"||a.branchId===currentBranchId),[accounts,currentBranchId]);
  const totalReceived=filtered.reduce((sum,r)=>sum+r.amount,0),cashReceived=filtered.filter(r=>r.paymentMethod==="Tunai").reduce((sum,r)=>sum+r.amount,0),digitalReceived=totalReceived-cashReceived;
  const unsubmitted=depositSummary.filter(s=>currentBranchId==="ALL"||s.branchId===currentBranchId).reduce((sum,s)=>sum+Number(s.unsubmitted||0),0);

  const save=async(e:React.FormEvent)=>{e.preventDefault();if(!invoice||form.amount<=0||form.amount>outstanding)return window.alert("Periksa faktur dan nominal pembayaran.");const r=await api.create("customer-payments",form);if(!r.success)return window.alert(r.message);await refreshData();await load();setShowForm(false);setInvoiceSearch("");setForm(emptyForm)};
  const remove=async(row:PaymentRow)=>{const reason=window.prompt(`Alasan menghapus ${row.paymentNumber}:`);if(reason===null)return;if(!reason.trim())return window.alert("Alasan penghapusan wajib diisi.");if(!window.confirm(`Hapus ${row.paymentNumber}? Faktur akan kembali terutang sebesar pembayaran ini.`))return;const result=await api.removeWithReason("customer-payments",row.id,reason.trim());if(!result.success)return window.alert(result.message);await refreshData();await load()};
  const openForm=()=>{setForm(emptyForm);setInvoiceSearch("");setShowForm(true)};

  return <div className="space-y-3">
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <Summary icon={Banknote} label="Total Diterima" value={rupiah(totalReceived)} tone="blue"/>
      <Summary icon={WalletCards} label="Tunai" value={rupiah(cashReceived)} tone="green"/>
      <Summary icon={Landmark} label="Transfer" value={rupiah(digitalReceived)} tone="violet"/>
      <Summary icon={CalendarDays} label="Tunai Belum Disetor" value={rupiah(unsubmitted)} tone="amber"/>
    </div>

    <div className="flex flex-wrap items-center gap-2 border-b border-blue-200 pb-2">
      <div className="relative min-w-[240px] flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari pembayaran, faktur, pelanggan, plat..." className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm"/></div>
      <select value={period} onChange={e=>setPeriod(e.target.value as Period)} className="rounded-lg border px-3 py-2 text-sm"><option value="today">Hari Ini</option><option value="this_month">Bulan Ini</option><option value="last_month">Bulan Lalu</option><option value="custom">Pilih Tanggal</option><option value="all">Semua Tanggal</option></select>
      {period==="custom"&&<><input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className="rounded-lg border px-2 py-2 text-sm"/><input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} className="rounded-lg border px-2 py-2 text-sm"/></>}
      <select value={methodFilter} onChange={e=>setMethodFilter(e.target.value)} className="rounded-lg border px-3 py-2 text-sm"><option value="ALL">Semua Metode</option><option>Tunai</option><option>Transfer</option></select>
      <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="rounded-lg border px-3 py-2 text-sm"><option value="ALL">Semua Status</option><option>Lunas</option><option>Cicilan</option></select>
      <select value={accountFilter} onChange={e=>setAccountFilter(e.target.value)} className="max-w-[190px] rounded-lg border px-3 py-2 text-sm"><option value="ALL">Semua Akun</option>{visibleAccounts.map(a=><option value={a.id} key={a.id}>{a.name}</option>)}</select>
      <select value={userFilter} onChange={e=>setUserFilter(e.target.value)} className="max-w-[170px] rounded-lg border px-3 py-2 text-sm"><option value="ALL">Semua Input</option>{inputUsers.map(name=><option key={name}>{name}</option>)}</select>
      <button onClick={()=>void load()} title="Muat ulang" className="rounded-lg border p-2 text-blue-700"><RefreshCw className={`h-5 w-5 ${loading?"animate-spin":""}`}/></button>
      {hasPermission("payment:create")&&<button onClick={openForm} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4"/>Pembayaran Baru</button>}
    </div>

    <div className="hidden overflow-x-auto rounded-xl border bg-white md:block"><table className="w-full text-sm"><thead className="bg-blue-900 text-white"><tr>{["Tanggal","No. Pembayaran","Faktur","Pelanggan","Diterima","Saldo Setelah","Masuk Ke","Input","Aksi"].map(x=><th key={x} className="whitespace-nowrap px-3 py-2.5 text-left text-xs uppercase">{x}</th>)}</tr></thead><tbody className="divide-y">{filtered.map(r=><tr key={r.id} className="hover:bg-blue-50/40"><td className="whitespace-nowrap px-3 py-2.5">{displayDate(r.date)}</td><td className="whitespace-nowrap px-3 font-semibold text-blue-700">{r.paymentNumber}</td><td className="px-3">{r.invoiceNumber}</td><td className="px-3"><b>{r.customerName}</b><small className="block max-w-[240px] truncate text-gray-500">{r.vehicleInfo}</small></td><td className="whitespace-nowrap px-3 font-bold text-green-700">{rupiah(r.amount)}</td><td className="whitespace-nowrap px-3"><b className={r.balanceAfter>0?"text-amber-700":"text-green-700"}>{rupiah(r.balanceAfter)}</b><small className="block text-gray-500">{r.paymentStatus}</small></td><td className="px-3"><b>{r.accountName||"-"}</b><small className="block text-gray-500">{r.paymentMethod}</small></td><td className="px-3">{r.createdByName||"-"}</td><td className="px-3">{hasPermission("payment:delete")&&<button onClick={()=>void remove(r)} title="Hapus pembayaran" className="rounded p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4"/></button>}</td></tr>)}{!filtered.length&&<tr><td colSpan={9} className="p-12 text-center text-gray-400">Belum ada pembayaran pada filter ini</td></tr>}</tbody></table></div>
    <div className="space-y-2 md:hidden">{filtered.map(r=><article key={r.id} className="rounded-xl border bg-white p-3 shadow-sm"><div className="flex justify-between gap-2"><div><b className="text-blue-700">{r.paymentNumber}</b><p className="text-xs text-gray-500">{displayDate(r.date)} · {r.invoiceNumber}</p></div><b className="text-green-700">{rupiah(r.amount)}</b></div><div className="mt-2 border-t pt-2"><b>{r.customerName}</b><p className="truncate text-xs text-gray-500">{r.vehicleInfo}</p></div><div className="mt-2 grid grid-cols-2 text-xs"><span>Masuk ke<br/><b>{r.accountName||"-"}</b> · {r.paymentMethod}</span><span className="text-right">Saldo faktur<br/><b className={r.balanceAfter>0?"text-amber-700":"text-green-700"}>{rupiah(r.balanceAfter)}</b></span></div>{hasPermission("payment:delete")&&<button onClick={()=>void remove(r)} className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-red-200 py-2 text-xs font-semibold text-red-600"><Trash2 className="h-3.5 w-3.5"/>Hapus Pembayaran</button>}</article>)}{!filtered.length&&<div className="rounded-xl border bg-white p-10 text-center text-gray-400">Belum ada pembayaran</div>}</div>

    {showForm&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3"><form onSubmit={save} className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white"><header className="sticky top-0 z-10 flex justify-between border-b bg-white p-4"><b className="flex items-center gap-2"><Banknote/>Pembayaran Pelanggan</b><button type="button" onClick={()=>setShowForm(false)}><X/></button></header><div className="space-y-4 p-5">
      <label className="block text-sm">Cari Faktur<input value={invoiceSearch} onChange={e=>setInvoiceSearch(e.target.value)} placeholder="Nomor faktur, pelanggan, HP, atau kendaraan" className="mt-1 w-full rounded-lg border p-2.5"/></label>
      <label className="block text-sm">Faktur<select required value={form.invoiceId} onChange={e=>{const selected=data.invoices.find(x=>x.id===e.target.value);setForm({...form,invoiceId:e.target.value,amount:selected?selected.total-selected.payment:0,accountId:""})}} className="mt-1 w-full rounded-lg border p-2.5"><option value="">Pilih faktur ({invoiceChoices.length})</option>{invoiceChoices.map(i=><option key={i.id} value={i.id}>{i.invoiceNumber} · {i.customerName} · {rupiah(i.total-i.payment)}</option>)}</select></label>
      {invoice&&<div className="grid grid-cols-3 rounded-lg bg-blue-50 p-3 text-sm"><span>Total<br/><b>{rupiah(invoice.total)}</b></span><span>Dibayar<br/><b>{rupiah(invoice.payment)}</b></span><span>Sisa<br/><b className="text-red-600">{rupiah(outstanding)}</b></span></div>}
      <div className="grid grid-cols-2 gap-3"><label className="text-sm">Tanggal<input type="date" min={invoice?.date} max={today} value={form.date} onChange={e=>setForm({...form,date:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5"/></label><label className="text-sm">Metode<select value={form.paymentMethod} onChange={e=>setForm({...form,paymentMethod:e.target.value,accountId:""})} className="mt-1 w-full rounded-lg border p-2.5"><option>Tunai</option><option>Transfer</option></select></label></div>
      <label className="block text-sm">Diterima ke<select value={form.accountId} onChange={e=>setForm({...form,accountId:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5"><option value="">Otomatis sesuai pengaturan cabang</option>{availableAccounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><small className="text-gray-500">Pilihan akun otomatis mengikuti metode pembayaran.</small></label>
      <label className="block text-sm">Nominal<input type="number" min="1" max={outstanding} value={form.amount||""} onChange={e=>setForm({...form,amount:Number(e.target.value)})} className="mt-1 w-full rounded-lg border p-2.5 text-lg font-bold"/></label>
      <label className="block text-sm">Catatan (opsional)<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5"/></label>
    </div><footer className="sticky bottom-0 flex justify-end gap-2 border-t bg-white p-4"><button type="button" onClick={()=>setShowForm(false)} className="rounded-lg border px-4 py-2">Batal</button><button className="rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white">Simpan Pembayaran</button></footer></form></div>}
  </div>
}

function Summary({icon:Icon,label,value,tone}:{icon:typeof Banknote;label:string;value:string;tone:"blue"|"green"|"violet"|"amber"}){const colors={blue:"bg-blue-50 text-blue-700",green:"bg-emerald-50 text-emerald-700",violet:"bg-violet-50 text-violet-700",amber:"bg-amber-50 text-amber-700"};return <div className="flex items-center gap-3 rounded-xl border bg-white p-3"><span className={`rounded-lg p-2 ${colors[tone]}`}><Icon className="h-5 w-5"/></span><div className="min-w-0"><p className="truncate text-xs text-gray-500">{label}</p><b className="block truncate text-base">{value}</b></div></div>}
