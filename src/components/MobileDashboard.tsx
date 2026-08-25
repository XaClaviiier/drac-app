import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Banknote, Bell, Bot, Boxes, Building2, Car, ChevronDown, CirclePlus, FileText, Grid2X2, Home, LogOut, PackagePlus, Settings, Users, Wrench, X, FolderTree, ReceiptText, Shield } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { buildWorkOrderAttentionItems, countWorkOrderAttentionByKind } from '../lib/workOrderAttention';

export default function MobileDashboard(){
  const {data,currentUser,currentBranchId,setCurrentBranchId,hasPermission,logout}=useApp();
  const navigate=useNavigate(); const [branchesOpen,setBranchesOpen]=useState(false); const [userOpen,setUserOpen]=useState(false); const [notificationOpen,setNotificationOpen]=useState(false); const [moreOpen,setMoreOpen]=useState(false); const [addOpen,setAddOpen]=useState(false);
  const isAll=currentBranchId==='ALL'; const activeBranch=data.branches.find(b=>b.id===currentBranchId);
  // /all-data hanya mengirim cabang yang memang boleh diakses user aktif.
  // Jangan filter ulang memakai localStorage/sesi lama karena perubahan akses
  // oleh Owner harus langsung terlihat tanpa menunggu sesi baru.
  const accessibleBranches=data.branches.filter(b=>b.isActive);
  const hasAssignedBranch=Boolean(accessibleBranches.length);
  const filter=<T extends {branchId:string}>(items:T[])=>items.filter(i=>isAll||i.branchId===currentBranchId);
  const dateNow=new Date(); const today=`${dateNow.getFullYear()}-${String(dateNow.getMonth()+1).padStart(2,'0')}-${String(dateNow.getDate()).padStart(2,'0')}`; const invoices=filter(data.invoices); const workOrders=filter(data.workOrders);
  const notificationWorkOrders=data.workOrders.filter(workOrder=>isAll?accessibleBranches.some(branch=>branch.id===workOrder.branchId):workOrder.branchId===currentBranchId);
  const attentionItems=buildWorkOrderAttentionItems(notificationWorkOrders,data.invoices,today); const attentionCounts=countWorkOrderAttentionByKind(attentionItems);
  const openAttention=()=>{setNotificationOpen(false);navigate('/workorders?attention=1')};
  const todayInvoices=invoices.filter(i=>i.date===today);
  const orderNew=workOrders.filter(w=>w.status==='Register').length; const orderProcess=workOrders.filter(w=>w.status==='Proses').length; const orderDone=workOrders.filter(w=>w.status==='Selesai').length;
  const lowStock=data.items.filter(i=>i.type==='Persediaan'&&i.stock<=0).length;
  const menus=[
    ['Order','Buat & Kelola',Wrench,'/workorders','from-orange-400 to-orange-600','wo:view'],
    ['Faktur','Invoice & Bayar',FileText,'/invoices','from-emerald-400 to-green-600','invoice:view'],
    ['Terima Barang','Penerimaan & Riwayat',PackagePlus,'/receipts','from-green-400 to-emerald-600','receipt:view'],
    ['Pelanggan','Data Pelanggan',Users,'/customers','from-violet-400 to-purple-600','customer:view'],
    ['Kendaraan','Data Kendaraan',Car,'/vehicles','from-blue-400 to-indigo-600','vehicle:view'],
    ['Barang','Data Barang',Boxes,'/items','from-cyan-400 to-teal-600','item:view'],
    ['Lainnya','Menu Lengkap',Grid2X2,'#more','from-slate-400 to-slate-600','dashboard:view'],
  ] as const;
  const more=[
    ['Kategori',FolderTree,'/categories','item:view'],['Pembayaran',Banknote,'/customer-payments','payment:view'],
    ['Faktur Pembelian',ReceiptText,'/purchase-invoices','purchase:view'],['Pengguna & Akses',Shield,'/users','user:view'],['Pengaturan',Settings,'/settings','settings:view'],
  ] as const;
  return <div className="min-h-screen bg-[#031a35] pb-24 text-white lg:hidden">
    <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_8%,rgba(14,165,233,.18),transparent_35%),radial-gradient(circle_at_90%_65%,rgba(37,99,235,.15),transparent_40%)]"/>
    <div className="relative mx-auto max-w-md px-4 pb-6 pt-[max(18px,env(safe-area-inset-top))]">
      <header className="relative z-20 flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-lg shadow-cyan-500/20"><Wrench className="h-7 w-7"/></div>
        <div className="min-w-0 flex-1"><h1 className="truncate text-lg font-extrabold">DOKTER AC MOBIL</h1><button onClick={()=>setBranchesOpen(!branchesOpen)} className="mt-0.5 flex max-w-full items-center gap-1.5 text-sm text-sky-300"><span className="truncate">{!hasAssignedBranch?'Cabang belum diberikan':isAll?'Semua Cabang':activeBranch?.name.replace('CABANG ','') || 'Pilih Cabang'}</span><ChevronDown className="h-4 w-4"/></button></div>
        <button type="button" onClick={()=>{setNotificationOpen(value=>!value);setUserOpen(false);setBranchesOpen(false)}} className="relative rounded-xl p-2 text-slate-200 hover:bg-white/10" aria-label={`Notifikasi, ${attentionItems.length} perlu tindakan`}><Bell/>{attentionItems.length>0&&<span className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{attentionItems.length>99?'99+':attentionItems.length}</span>}</button>
        <button onClick={()=>{setUserOpen(v=>!v);setNotificationOpen(false);setBranchesOpen(false)}} className="relative flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-purple-700 font-bold">{currentUser?.name?.[0]}<span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#031a35] bg-emerald-400"/></button>
        {notificationOpen&&<div className="absolute right-0 top-14 z-30 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-[#0b294a] text-left shadow-2xl"><div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div><p className="font-bold text-white">Perlu Tindakan</p><p className="text-xs text-slate-300">{attentionItems.length} pekerjaan perlu ditangani</p></div><Bell className="h-5 w-5 text-sky-300"/></div>{attentionItems.length===0?<p className="px-4 py-8 text-center text-sm text-slate-300">Tidak ada pekerjaan tertunda.</p>:<div className="divide-y divide-white/10"><NotificationRow label="Register Mengambang" count={attentionCounts.register} onClick={openAttention}/><NotificationRow label="Dikerjakan Terlambat" count={attentionCounts.process} onClick={openAttention}/><NotificationRow label="Selesai Belum Faktur" count={attentionCounts.invoice} onClick={openAttention}/><NotificationRow label="Faktur Belum Lunas" count={attentionCounts.payment} onClick={openAttention}/></div>}<button type="button" onClick={openAttention} className="w-full border-t border-white/10 px-4 py-3 text-sm font-bold text-sky-300 hover:bg-white/10">Buka semua tindakan</button></div>}
        {userOpen&&<div className="absolute right-0 top-14 w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#0b294a] text-left shadow-2xl">
          <div className="border-b border-white/10 p-4"><p className="truncate font-bold text-white">{currentUser?.name}</p><p className="mt-0.5 text-sm text-slate-300">{currentUser?.roleName}</p><p className="mt-2 flex items-center gap-1.5 text-xs text-sky-300"><Building2 className="h-3.5 w-3.5"/>{isAll?'Semua Cabang':activeBranch?.name}</p></div>
          <button onClick={()=>{setUserOpen(false);navigate('/settings')}} className="flex w-full items-center gap-3 px-4 py-3 text-sm text-slate-100 hover:bg-white/10"><Settings className="h-4 w-4 text-sky-300"/>Pengaturan Akun</button>
          <button onClick={()=>{setUserOpen(false);logout()}} className="flex w-full items-center gap-3 border-t border-white/10 px-4 py-3 text-sm font-semibold text-red-300 hover:bg-red-500/10"><LogOut className="h-4 w-4"/>Keluar</button>
        </div>}
      </header>
      {(userOpen||notificationOpen)&&<button aria-label="Tutup menu" onClick={()=>{setUserOpen(false);setNotificationOpen(false)}} className="fixed inset-0 z-10 cursor-default"/>}
      {branchesOpen&&<div className="mt-3 rounded-2xl border border-white/10 bg-[#0b294a] p-2 shadow-xl">{hasPermission('all_branches')&&<button onClick={()=>{setCurrentBranchId('ALL');setBranchesOpen(false)}} className={`w-full rounded-xl px-3 py-2 text-left text-sm ${isAll?'bg-sky-500 font-semibold':'text-slate-200'}`}>Semua Cabang</button>}{accessibleBranches.map(b=><button key={b.id} onClick={()=>{setCurrentBranchId(b.id);setBranchesOpen(false)}} className={`mt-1 w-full rounded-xl px-3 py-2 text-left text-sm ${currentBranchId===b.id?'bg-sky-500 font-semibold':'text-slate-200'}`}>{b.name}</button>)}</div>}
      <section className="mt-5 grid grid-cols-4 divide-x divide-white/10 rounded-3xl border border-white/10 bg-white/[.07] p-3">
        {[[orderNew,'Order Baru'],[orderProcess,'Dalam Proses'],[orderDone,'Selesai'],[todayInvoices.length,'Faktur Hari Ini']].map(([v,l])=><div key={String(l)} className="px-1 text-center"><p className="text-lg font-bold">{v}</p><p className="mt-1 text-[10px] leading-tight text-slate-300">{l}</p></div>)}
      </section>
      <section className="mt-4 grid grid-cols-3 gap-3">{menus.filter(m=>hasPermission(m[5] as any)).map(([label,sub,Icon,path,color])=><button key={label} onClick={()=>path==='#more'?setMoreOpen(true):navigate(path)} className={`relative flex min-h-36 flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/[.07] p-2 active:scale-95 ${label==='Lainnya'?'col-start-2':''}`}><div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${color} shadow-lg`}><Icon className="h-7 w-7"/></div>{label==='Order'&&orderNew>0&&<Badge value={orderNew}/>} {label==='Barang'&&lowStock>0&&<Badge value={lowStock}/>}<p className="mt-3 text-sm font-bold">{label}</p><p className="text-[10px] text-slate-400">{sub}</p></button>)}</section>
    </div>
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md items-end justify-around rounded-t-3xl border border-white/10 bg-[#092542]/95 px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl"><Bottom icon={Home} label="Beranda" active onClick={()=>navigate('/')}/><Bottom icon={Activity} label="Timeline" onClick={()=>navigate('/workorders/timeline')}/><button onClick={()=>setAddOpen(true)} className="-mt-7 flex flex-col items-center"><span className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-[#031a35] bg-gradient-to-br from-cyan-400 to-blue-600 shadow-xl"><CirclePlus className="h-8 w-8"/></span><span className="text-[10px] text-slate-300">Tambah</span></button><Bottom icon={Bot} label="Asisten AI" onClick={()=>navigate('/ai')}/><Bottom icon={Settings} label="Akun" onClick={()=>navigate('/settings')}/></nav>
    {(moreOpen||addOpen)&&<div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={()=>{setMoreOpen(false);setAddOpen(false)}}><div className="w-full rounded-t-3xl bg-[#0b294a] p-5" onClick={e=>e.stopPropagation()}><div className="mb-4 flex items-center justify-between"><h3 className="font-bold">{moreOpen?'Menu Lainnya':'Tambah Data'}</h3><button onClick={()=>{setMoreOpen(false);setAddOpen(false)}}><X/></button></div><div className="grid grid-cols-2 gap-3">{(moreOpen?more:[['Buat WO',Wrench,'/workorders','wo:create'],['Buat Faktur',FileText,'/invoices','invoice:create'],['Terima Pembayaran',Banknote,'/customer-payments','payment:create'],['Tambah Pelanggan',Users,'/customers','customer:create'],['Tambah Kendaraan',Car,'/vehicles','vehicle:create'],['Terima Barang',PackagePlus,'/receipts','receipt:create']] as const).filter(m=>hasPermission(m[3] as any)).map(([label,Icon,path])=><button key={label} onClick={()=>{if(addOpen&&isAll){setMoreOpen(false);setAddOpen(false);setBranchesOpen(true);alert('Pilih cabang terlebih dahulu.');return}navigate(path);setMoreOpen(false);setAddOpen(false)}} className="flex items-center gap-3 rounded-2xl bg-white/10 p-4 text-left text-sm font-semibold"><Icon className="h-5 w-5 text-sky-300"/>{label}</button>)}</div></div></div>}
  </div>
}
function Badge({value}:{value:number}){return <span className="absolute right-3 top-3 min-w-5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold">{value>99?'99+':value}</span>}
function NotificationRow({label,count,onClick}:{label:string;count:number;onClick:()=>void}){return <button type="button" onClick={onClick} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm text-slate-100 hover:bg-white/10"><span>{label}</span><strong className={count>0?'text-amber-300':'text-slate-500'}>{count}</strong></button>}
function Bottom({icon:Icon,label,active,onClick}:{icon:any;label:string;active?:boolean;onClick:()=>void}){return <button onClick={onClick} className={`flex w-14 flex-col items-center gap-1 py-1 text-[10px] ${active?'text-sky-400':'text-slate-400'}`}><Icon className="h-5 w-5"/>{label}</button>}
