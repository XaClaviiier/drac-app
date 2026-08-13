import { useEffect, useMemo, useState } from 'react';
import { Camera, CheckCircle2, FileText, KeyRound, Search, Send, ShieldCheck, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/apiClient';
import type { Customer, Item, Vehicle } from '../types';

type Line = { item: Item; qty: number; price: number };
type AccountMap = { branchId: string; bankAccountId: string };
const today = () => new Date().toISOString().slice(0,10);
const normalize = (v:string) => v.toUpperCase().replace(/[^A-Z0-9]/g,'');
const parseMoney = (value:unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const digits = String(value ?? '').replace(/[^0-9-]/g, '');
  return digits ? Number(digits) : 0;
};

export default function HistoricalQuickEntry(){
  const { data, currentBranchId, setCurrentBranchId, currentUser, refreshData } = useApp();
  const allowedBranches = data.branches.filter(b => b.isActive && (currentUser?.isOwner || currentUser?.permissions?.includes('branch:all') || currentUser?.branchIds?.includes(b.id) || currentUser?.branchId===b.id));
  const [mode,setMode]=useState<'text'|'form'>('text');
  const [branchId,setBranchId]=useState(currentBranchId==='ALL' ? (allowedBranches[0]?.id||'') : currentBranchId);
  const [date,setDate]=useState(today()); const [customer,setCustomer]=useState<Customer|null>(null); const [vehicle,setVehicle]=useState<Vehicle|null>(null);
  const [customerQuery,setCustomerQuery]=useState(''); const [vehicleQuery,setVehicleQuery]=useState(''); const [itemQuery,setItemQuery]=useState('');
  const [lines,setLines]=useState<Line[]>([]); const [description,setDescription]=useState('Transaksi historis'); const [receiptTotal,setReceiptTotal]=useState(0);
  const [text,setText]=useState('Tanggal: 2/1/26\nPelanggan: ALEXANDER\nKendaraan: DD1234AB\nItem: JSA-001 x1 @200000');
  const [accountMaps,setAccountMaps]=useState<AccountMap[]>([]); const [saving,setSaving]=useState(false); const [message,setMessage]=useState('');
  const [readingReceipt,setReadingReceipt]=useState(false);
  const [receiptStatus,setReceiptStatus]=useState('');
  const [groqKey,setGroqKey]=useState(''); const [groqModel,setGroqModel]=useState('qwen/qwen3.6-27b'); const [savingKey,setSavingKey]=useState(false); const [aiConfigured,setAiConfigured]=useState(false);
  useEffect(()=>{ api.get<AccountMap[]>('branch-account-settings').then(r=>setAccountMaps(r.data||[])); },[]);
  useEffect(()=>{ api.getReceiptAISettings().then(r=>{if(r.success&&r.data){setAiConfigured(!!r.data.configured);setGroqModel(r.data.model||'qwen/qwen3.6-27b');}}); },[]);
  useEffect(()=>{ if(branchId) setCurrentBranchId(branchId); },[branchId]);
  const vehicles = useMemo(()=>customer ? data.vehicles.filter(v=>v.customerRefId===customer.id) : data.vehicles,[data.vehicles,customer]);
  const customerResults = customerQuery.length<2?[]:data.customers.filter(c=>`${c.customerCode} ${c.name} ${c.phone}`.toLowerCase().includes(customerQuery.toLowerCase())).slice(0,8);
  const vehicleResults = vehicleQuery.length<2?[]:vehicles.filter(v=>normalize(`${v.plateNumber}${v.brand}${v.model}`).includes(normalize(vehicleQuery))).slice(0,8);
  const itemResults = itemQuery.length<2?[]:data.items.filter(i=>i.isActive && normalize(`${i.code}${i.barcode||''}${i.name}`).includes(normalize(itemQuery))).slice(0,10);
  const total=lines.reduce((s,l)=>s+l.qty*l.price,0); const paymentTotal=receiptTotal||total; const difference=paymentTotal-total; const mapped=accountMaps.some(m=>m.branchId===branchId&&m.bankAccountId);
  const chooseCustomer=(c:Customer)=>{setCustomer(c);setCustomerQuery(`${c.name} • ${c.phone}`);setVehicle(null);setVehicleQuery('');};
  const chooseVehicle=(v:Vehicle)=>{setVehicle(v);setVehicleQuery(`${v.plateNumber} • ${v.brand} ${v.model}`);};
  const addItem=(i:Item)=>{setLines(x=>x.some(l=>l.item.id===i.id)?x:x.concat({item:i,qty:1,price:i.sellingPrice}));setItemQuery('');};
  const parseDate=(raw:string)=>{const p=raw.trim().split(/[\/\-]/).map(Number);if(!p[0])return '';const now=new Date();const y=p[2]?(p[2]<100?2000+p[2]:p[2]):now.getFullYear();const m=p[1]||now.getMonth()+1;return `${y}-${String(m).padStart(2,'0')}-${String(p[0]).padStart(2,'0')}`;};
  const findCustomer=(name:string,phone='')=>{
    const normalizedPhone=normalize(phone);
    return (normalizedPhone&&data.customers.find(c=>normalize(c.phone||'')===normalizedPhone))
      ||data.customers.find(c=>normalize(c.name)===normalize(name))
      ||data.customers.find(c=>normalize(c.name).includes(normalize(name)));
  };
  const findVehicle=(plate:string)=>data.vehicles.find(v=>normalize(v.plateNumber)===normalize(plate))
    ||data.vehicles.find(v=>normalize(v.plateNumber).includes(normalize(plate)));
  const parseItem=(raw:string):Line|null=>{
    const value=raw.trim(); if(!value)return null;
    let name=value,qty=1,price:number|undefined;
    const standard=value.match(/^(.+?)(?:\s+x([\d.,]+))?(?:\s+@([\d.,]+))?$/i);
    if(standard){name=standard[1].trim();qty=Number((standard[2]||'1').replace(',','.'));if(standard[3])price=Number(standard[3].replace(/\D/g,''));}
    if(price===undefined){const receipt=value.match(/^(.+?)\s+([\d.,]+)$/);if(receipt){name=receipt[1].trim();price=Number(receipt[2].replace(/\D/g,''));}}
    const key=normalize(name);
    const item=data.items.find(i=>normalize(i.code)===key)||data.items.find(i=>normalize(i.name)===key)||data.items.find(i=>normalize(i.name).includes(key)||key.includes(normalize(i.name)));
    return item?{item,qty,price:price??item.sellingPrice}:null;
  };
  const parseText=()=>{
    const rows=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    let foundCustomer:Customer|undefined, foundVehicle:Vehicle|undefined;
    const parsed:Line[]=[];
    const pipes=text.split('|').map(x=>x.trim()).filter(Boolean);

    // Format cepat: tanggal | nama | HP | plat | merek | tipe | warna | keluhan | layanan harga; layanan harga | total
    if(pipes.length>=4&&/^\d{1,2}(?:[\/-]\d{1,2})?(?:[\/-]\d{2,4})?$/.test(pipes[0])){
      const d=parseDate(pipes[0]); if(d)setDate(d);
      const customerName=pipes[1]||'', phone=pipes[2]||'', plate=pipes[3]||'';
      setCustomerQuery(`${customerName}${phone?` • ${phone}`:''}`);
      setVehicleQuery(plate);
      foundCustomer=findCustomer(customerName,phone);
      foundVehicle=findVehicle(plate);
      if(pipes[7])setDescription(pipes[7].replace(/\s+/g,' ').trim());
      if(pipes[8])pipes[8].split(';').map(parseItem).filter((x):x is Line=>!!x).forEach(x=>parsed.push(x));
    }

    // Format alternatif: Tanggal: ..., Pelanggan: ..., Item: ...
    for(const row of rows){
      const [label,...rest]=row.split(':'); const value=rest.join(':').trim();
      if(!value)continue;
      if(/tanggal/i.test(label)){const d=parseDate(value);if(d)setDate(d);}
      else if(/pelanggan/i.test(label)){foundCustomer=findCustomer(value);setCustomerQuery(value);}
      else if(/kendaraan|plat|nopol/i.test(label)){foundVehicle=findVehicle(value);setVehicleQuery(value);}
      else if(/item|layanan|barang/i.test(label)){value.split(';').map(parseItem).filter((x):x is Line=>!!x).forEach(x=>parsed.push(x));}
      else if(/keluhan|keterangan/i.test(label))setDescription(value);
    }
    if(foundVehicle&&!foundCustomer)foundCustomer=data.customers.find(c=>c.id===foundVehicle!.customerRefId);
    if(foundCustomer)chooseCustomer(foundCustomer);
    if(foundVehicle){setVehicle(foundVehicle);setVehicleQuery(`${foundVehicle.plateNumber} • ${foundVehicle.brand} ${foundVehicle.model}`);}
    setLines(parsed); setReceiptTotal(parsed.reduce((sum,line)=>sum+line.qty*line.price,0));
    const missing=[!foundCustomer&&'pelanggan',!foundVehicle&&'kendaraan',!parsed.length&&'barang/jasa'].filter(Boolean).join(', ');
    setMessage(!missing?'Teks berhasil dibaca. Periksa ringkasan lalu simpan.':`Data terbaca, tetapi master ${missing} belum cocok. Cari/pilih data tersebut secara manual.`);
  };
  const imageToDataUrl=(file:File)=>new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('File foto tidak dapat dibaca.'));
    reader.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error('Format gambar tidak dapat diproses.'));
      img.onload=()=>{
        const maxSide=1800; const scale=Math.min(1,maxSide/Math.max(img.width,img.height));
        const canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.round(img.width*scale)); canvas.height=Math.max(1,Math.round(img.height*scale));
        const ctx=canvas.getContext('2d'); if(!ctx)return reject(new Error('Gagal menyiapkan gambar.'));
        ctx.drawImage(img,0,0,canvas.width,canvas.height); resolve(canvas.toDataURL('image/jpeg',0.82));
      };
      img.src=String(reader.result);
    };
    reader.readAsDataURL(file);
  });
  const readReceipt=async(file?:File)=>{
    if(!file)return;
    if(!/^image\/(jpeg|png|webp)$/.test(file.type)){setReceiptStatus('Gagal: pilih foto JPG, PNG, atau WebP.');return;}
    setReadingReceipt(true); setReceiptStatus(`Menyiapkan ${file.name}...`); setMessage('');
    try {
    const image=await imageToDataUrl(file);
    setReceiptStatus('Mengirim dan membaca foto nota...');
    const response=await api.readReceipt(image);
    if(!response.success||!response.data){const error=response.message||'Nota gagal dibaca.';setReceiptStatus(`Gagal: ${error}`);setMessage(error);return;}
    const r:any=response.data;
    const d=parseDate(r.date||''); if(d)setDate(d);
    const matchedCustomer=findCustomer(r.customerName||'',r.phone||'');
    const matchedVehicle=findVehicle(r.plate||'');
    setCustomerQuery([r.customerName,r.phone].filter(Boolean).join(' • '));
    setVehicleQuery(r.plate||'');
    if(matchedCustomer)chooseCustomer(matchedCustomer); else setCustomer(null);
    if(matchedVehicle){setVehicle(matchedVehicle);setVehicleQuery(`${matchedVehicle.plateNumber} • ${matchedVehicle.brand} ${matchedVehicle.model}`);}else setVehicle(null);
    setDescription(r.complaint||'Transaksi historis');
    const receiptLines=(Array.isArray(r.items)?r.items:[]).map((x:any)=>parseItem(`${x.name||''} x${Number(x.qty)||1} @${parseMoney(x.price)}`)).filter((x:any):x is Line=>!!x);
    const ocrTotal=parseMoney(r.total);
    const detailedTotal=receiptLines.reduce((sum,line)=>sum+line.qty*line.price,0);
    if(ocrTotal>0&&receiptLines.length&&detailedTotal!==ocrTotal){
      const zeroIndex=receiptLines.findIndex(line=>line.price<=0);
      const index=zeroIndex>=0?zeroIndex:0;
      const remainder=ocrTotal-detailedTotal;
      if(remainder>0)receiptLines[index]={...receiptLines[index],price:receiptLines[index].price+(remainder/receiptLines[index].qty)};
    }
    setLines(receiptLines); setReceiptTotal(ocrTotal||receiptLines.reduce((sum,line)=>sum+line.qty*line.price,0));
    const missing=[!matchedCustomer&&'pelanggan',!matchedVehicle&&'kendaraan',!receiptLines.length&&'barang/jasa'].filter(Boolean).join(', ');
    const resultMessage=`${response.message||'Nota berhasil dibaca.'}${missing?` Master ${missing} belum cocok; pilih secara manual.`:''}`;
    setReceiptStatus(resultMessage); setMessage(resultMessage);
    } catch(error:any) {
      const errorMessage=error?.message||'Terjadi kesalahan saat memproses foto.';
      setReceiptStatus(`Gagal: ${errorMessage}`); setMessage(errorMessage);
    } finally { setReadingReceipt(false); }
  };
  const saveGroqKey=async()=>{
    const clean=groqKey.trim();
    if(!clean.startsWith('gsk_')||clean.length<30)return setMessage('Groq Key tidak valid. Key harus diawali gsk_ dan disalin lengkap.');
    setSavingKey(true); const r=await api.updateReceiptAISettings(clean,groqModel); setSavingKey(false);
    if(!r.success)return setMessage(r.message||'Gagal menyimpan Groq Key.');
    setGroqKey(''); setAiConfigured(true); setMessage('Groq Key berhasil disimpan dan siap digunakan untuk membaca nota.');
  };
  const save=async()=>{if(!branchId||!customer||!vehicle||!lines.length||total<=0)return setMessage('Lengkapi cabang, pelanggan, kendaraan, dan item dengan total lebih dari Rp0.');if(Math.abs(difference)>0.01)return setMessage('Total rincian harus sama dengan Total Nota/Pembayaran. Koreksi harga item atau total nota terlebih dahulu.');setSaving(true);setMessage('');const r=await api.create('historical-entries',{branchId,date,customerId:customer.id,vehicleId:vehicle.id,description,paymentTotal,items:lines.map(l=>({itemId:l.item.id,qty:l.qty,price:l.price}))});setSaving(false);if(!r.success)return setMessage(r.message||'Gagal menyimpan.');setMessage(`${r.message}: ${r.data?.woNumber} • ${r.data?.invoiceNumber} • ${r.data?.paymentNumber}`);setLines([]);setReceiptTotal(0);await refreshData();};
  const Picker=({results,onPick}:{results:any[],onPick:(x:any)=>void})=>results.length?<div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-lg border bg-white shadow-xl">{results.map(x=><button key={x.id} type="button" onClick={()=>onPick(x)} className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-blue-50">{x.name||x.plateNumber} <span className="text-gray-500">{x.phone||`${x.brand} ${x.model}`}</span></button>)}</div>:null;
  return <div className="mx-auto max-w-7xl p-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h1 className="text-xl font-bold">Input Cepat Historis</h1><p className="text-sm text-gray-500">WO → Faktur lunas → Pembayaran transfer, tanpa mengurangi stok.</p></div><div className="flex gap-2"><button onClick={()=>setMode('text')} className={`rounded-lg px-4 py-2 ${mode==='text'?'bg-blue-600 text-white':'border bg-white'}`}>Ketik Cepat</button><button onClick={()=>setMode('form')} className={`rounded-lg px-4 py-2 ${mode==='form'?'bg-blue-600 text-white':'border bg-white'}`}>Form Cepat</button></div></div>
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="mb-4 grid gap-3 md:grid-cols-3"><label className="text-sm">Cabang<select value={branchId} onChange={e=>setBranchId(e.target.value)} className="mt-1 w-full rounded-lg border p-2">{allowedBranches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label className="text-sm">Tanggal transaksi<input type="date" max={today()} value={date} onChange={e=>setDate(e.target.value)} className="mt-1 w-full rounded-lg border p-2"/></label><div className={`rounded-lg border p-3 text-sm ${mapped?'border-green-200 bg-green-50 text-green-700':'border-red-200 bg-red-50 text-red-700'}`}><ShieldCheck className="mr-1 inline h-4 w-4"/>{mapped?'Transfer ke rekening bank cabang':'Rekening bank cabang belum dipetakan'}</div></div>
      {currentUser?.isOwner&&<div className="mb-4 rounded-xl border border-violet-200 bg-violet-50 p-3"><div className="mb-2 flex items-center justify-between gap-2"><div><div className="flex items-center gap-2 font-semibold text-violet-900"><KeyRound className="h-4 w-4"/>Groq Key Khusus Input Cepat</div><p className="text-xs text-violet-700">{aiConfigured?'Key OCR nota sudah aktif dan terpisah dari key utama Asisten AI.':'Belum ada key khusus OCR nota. Key ini tidak memengaruhi Asisten AI.'}</p></div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${aiConfigured?'bg-green-100 text-green-700':'bg-amber-100 text-amber-700'}`}>{aiConfigured?'Aktif':'Belum aktif'}</span></div><div className="flex flex-col gap-2 sm:flex-row"><input type="password" autoComplete="new-password" value={groqKey} onChange={e=>setGroqKey(e.target.value)} placeholder="Tempel Groq Key khusus Input Cepat: gsk_..." className="min-w-0 flex-1 rounded-lg border border-violet-200 bg-white px-3 py-2 font-mono text-sm"/><button type="button" disabled={savingKey||!groqKey.trim()} onClick={()=>void saveGroqKey()} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{savingKey?'Menyimpan...':aiConfigured?'Ganti Key OCR':'Simpan Key OCR'}</button></div><p className="mt-1.5 text-xs text-slate-500">Disimpan terenkripsi pada konfigurasi terpisah. Mengganti key ini tidak mengubah key utama sistem.</p></div>}
      {mode==='text'&&<div className="mb-4 rounded-xl bg-slate-900 p-3 text-white"><div className="mb-2 flex items-center justify-between gap-2"><div className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4"/>Format tanpa AI/token</div><label className={`cursor-pointer rounded-lg border border-cyan-400 px-3 py-1.5 text-sm font-semibold text-cyan-300 hover:bg-cyan-950 ${readingReceipt?'pointer-events-none opacity-50':''}`}><Camera className={`mr-1.5 inline h-4 w-4 ${readingReceipt?'animate-pulse':''}`}/>{readingReceipt?'Membaca Nota...':'Upload Foto Nota'}<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={e=>{const file=e.target.files?.[0];e.currentTarget.value='';void readReceipt(file);}}/></label></div>{receiptStatus&&<div className={`mb-2 rounded-lg border px-3 py-2 text-sm ${receiptStatus.startsWith('Gagal')?'border-red-400 bg-red-950/50 text-red-200':readingReceipt?'border-amber-400 bg-amber-950/40 text-amber-200':'border-emerald-400 bg-emerald-950/40 text-emerald-200'}`}>{readingReceipt&&<span className="mr-2 inline-block animate-spin">◌</span>}{receiptStatus}</div>}<textarea value={text} onChange={e=>setText(e.target.value)} rows={6} className="w-full rounded-lg border border-slate-600 bg-slate-800 p-3 font-mono text-sm"/><button onClick={parseText} className="mt-2 rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950"><Send className="mr-2 inline h-4 w-4"/>Baca Data</button></div>}
      <div className="grid gap-3 md:grid-cols-2"><div className="relative"><label className="text-sm">Cari pelanggan</label><input value={customerQuery} onChange={e=>{setCustomerQuery(e.target.value);setCustomer(null)}} placeholder="Nama, kode, atau nomor HP" className="mt-1 w-full rounded-lg border p-2"/><Picker results={customerResults} onPick={chooseCustomer}/></div><div className="relative"><label className="text-sm">Cari kendaraan</label><input value={vehicleQuery} onChange={e=>{setVehicleQuery(e.target.value);setVehicle(null)}} placeholder="Nomor plat, merek, atau tipe" className="mt-1 w-full rounded-lg border p-2"/><Picker results={vehicleResults} onPick={chooseVehicle}/></div></div>
      <label className="mt-3 block text-sm">Keterangan<input value={description} onChange={e=>setDescription(e.target.value)} className="mt-1 w-full rounded-lg border p-2"/></label>
      <div className="relative mt-3"><label className="text-sm">Cari barang / jasa</label><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-gray-400"/><input value={itemQuery} onChange={e=>setItemQuery(e.target.value)} placeholder="Kode, barcode, atau nama" className="mt-1 w-full rounded-lg border py-2 pl-9 pr-3"/></div><Picker results={itemResults} onPick={addItem}/></div>
      <div className="mt-3 overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="bg-slate-100"><tr><th className="p-2 text-left">Barang/Jasa</th><th>Qty</th><th>Harga historis</th><th>Subtotal</th><th/></tr></thead><tbody>{lines.map((l,i)=><tr key={l.item.id} className="border-t"><td className="p-2 font-medium">{l.item.code} — {l.item.name}</td><td><input type="number" min="1" value={l.qty} onChange={e=>setLines(x=>x.map((v,n)=>n===i?{...v,qty:Number(e.target.value)}:v))} className="w-20 rounded border p-1"/></td><td><input type="number" min="0" value={l.price} onChange={e=>setLines(x=>x.map((v,n)=>n===i?{...v,price:Number(e.target.value)}:v))} className="w-32 rounded border p-1"/></td><td className="whitespace-nowrap p-2 font-semibold">Rp {(l.qty*l.price).toLocaleString('id-ID')}</td><td><button onClick={()=>setLines(x=>x.filter((_,n)=>n!==i))} className="p-2 text-red-500"><Trash2 className="h-4 w-4"/></button></td></tr>)}</tbody></table>{!lines.length&&<div className="p-8 text-center text-sm text-gray-400">Belum ada barang atau jasa.</div>}</div>
      <div className="mt-3 grid gap-3 rounded-lg border bg-slate-50 p-3 sm:grid-cols-3"><div><span className="text-xs text-slate-500">Total rincian item</span><div className="font-semibold">Rp {total.toLocaleString('id-ID')}</div></div><label className="text-xs text-slate-500">Total Nota/Pembayaran (Rp)<input type="number" min="0" value={paymentTotal||''} onChange={e=>setReceiptTotal(Math.max(0,Number(e.target.value)||0))} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-base font-bold text-green-700"/></label><div><span className="text-xs text-slate-500">Selisih</span><div className={`font-bold ${Math.abs(difference)<0.01?'text-green-600':'text-red-600'}`}>Rp {difference.toLocaleString('id-ID')}</div><p className="text-xs text-slate-500">Harus Rp0 sebelum disimpan.</p></div></div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div>{message&&<span className="text-sm font-medium text-blue-700">{message}</span>}<p className="text-xs text-amber-700">Barang tetap tercatat di faktur, tetapi stok gudang tidak berubah.</p></div><div className="flex items-center gap-4"><strong>Total pembayaran Rp {paymentTotal.toLocaleString('id-ID')}</strong><button disabled={saving||!mapped||paymentTotal<=0||Math.abs(difference)>0.01} onClick={save} className="rounded-lg bg-green-600 px-5 py-2.5 font-semibold text-white disabled:opacity-40"><CheckCircle2 className="mr-2 inline h-4 w-4"/>{saving?'Menyimpan...':'Simpan Lengkap'}</button></div></div>
    </div>
  </div>;
}
