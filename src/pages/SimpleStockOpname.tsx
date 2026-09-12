import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, CircleEllipsis, FileText, Info, List, Paperclip, Plus, Printer, RefreshCw, Save, Search, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/apiClient';
import { localDateKey } from '../lib/date';
import {ConfigurableTableHeaderCell, useConfigurableTable} from '../components/ConfigurableTable';
import IndonesianDateInput from '../components/IndonesianDateInput';
import './OpeningStockImport.css';
import './SimpleStockOpname.css';

type Row = { itemId:string;code:string;name:string;unit:string;categoryName:string;systemQuantity:number;movementIn?:number;movementOut?:number;editVersion:string;finalQuantity:number|null;count:string };
type Document = {id:string;orderNumber:string;endDate:string;warehouseId:string;warehouseName:string;assignedUserName:string;notes:string;revision:number;entryMode:string;createdAt:string;lastUpdatedAt?:string;rows?:Row[];result?:{status?:string;adjustmentId?:string;adjustmentNumber?:string;notes?:string}};
type Adjustment = {adjustmentNumber:string;rows:{itemCode:string;itemName:string;quantity:number;unit:string}[]};
type Column='name'|'code'|'systemQuantity'|'count'|'variance'|'unit';
const columns:Column[]=['name','code','systemQuantity','count','variance','unit'];
const labels:Record<Column,string>={name:'Nama Barang',code:'Kode Barang',systemQuantity:'Stok Sistem',count:'Hitung Fisik',variance:'Selisih',unit:'Satuan'};
const widths:Record<Column,number>={name:360,code:180,systemQuantity:130,count:140,variance:120,unit:85};
const key = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), n=>n.toString(16).padStart(2,'0')).join('');
const countValue = (text:string):number|null => text===''?null:/^\d+$/.test(text)&&Number(text)<=2147483647?Number(text):NaN;
const normalize = (rows:Row[]) => rows.map(row=>({...row,count:row.finalQuantity===null||row.finalQuantity===undefined?'':String(row.finalQuantity)}));
const html = (value:unknown) => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

export default function SimpleStockOpname({legacy}:{legacy:ReactNode}) {
  const {data,currentUser,currentBranchId,hasPermission,refreshData}=useApp();
  const canSave=hasPermission('stock_opname:count');
  const canApply=canSave&&hasPermission('stock_opname:post');
  const canCreate=canSave&&hasPermission('stock_opname:create');
  const [legacyOpen,setLegacyOpen]=useState(false);
  const [documents,setDocuments]=useState<Document[]>([]);
  const [document,setDocument]=useState<Document|null>(null);
  const [tab,setTab]=useState(false),[list,setList]=useState(true),[info,setInfo]=useState(false);
  const [rows,setRows]=useState<Row[]>([]),[date,setDate]=useState(localDateKey()),[warehouse,setWarehouse]=useState(''),[notes,setNotes]=useState('');
  const [requestKey,setRequestKey]=useState(key),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [search,setSearch]=useState(''),[filter,setFilter]=useState('all'),[listSearch,setListSearch]=useState(''),[listDate,setListDate]=useState('');
  const [importOpen,setImportOpen]=useState(false),[linked,setLinked]=useState<Adjustment|null>(null);
  const [catalog,setCatalog]=useState<Row[]>([]),[addSearch,setAddSearch]=useState(''),[addOpen,setAddOpen]=useState(false),[tableSearchOpen,setTableSearchOpen]=useState(false);
  const [selectedCategories,setSelectedCategories]=useState<string[]>([]);
  const [categoryOpen,setCategoryOpen]=useState(false),[scope,setScope]=useState('activity'),[categorySearch,setCategorySearch]=useState('');
  const table=useConfigurableTable<Column>({storageKey:`opname-table-v1:${currentUser?.id||'guest'}`,defaultOrder:columns,defaultWidths:widths,sortableKeys:columns});
  const orderedColumns=table.isDesktop?table.order:columns;
  const applied=document?.result?.status==='Posted';
  const [saveMenuOpen,setSaveMenuOpen]=useState(false);
  const saveMenuRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(!saveMenuOpen)return;const close=(event:PointerEvent)=>{if(!saveMenuRef.current?.contains(event.target as Node))setSaveMenuOpen(false);};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setSaveMenuOpen(false);};window.addEventListener('pointerdown',close);window.addEventListener('keydown',escape);return()=>{window.removeEventListener('pointerdown',close);window.removeEventListener('keydown',escape);};},[saveMenuOpen]);
  const lock=useRef(false),file=useRef<HTMLInputElement>(null);
  const warehouses=data.warehouses.filter(w=>w.isActive&&!w.isSystem&&(currentBranchId==='ALL'||w.branchId===currentBranchId));
  const loadList=async()=>{const result=await api.get<Document[]>('stock-opnames');if(!result.success)throw new Error(result.message);setDocuments(result.data||[]);};
  useEffect(()=>{void loadList().catch(e=>setMessage(e.message));},[]);
  useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  const run=async(work:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setMessage('');try{await work();}catch(e){setMessage(e instanceof Error?e.message:'Proses gagal.');}finally{lock.current=false;setBusy(false);}};
  const discard=()=>!dirty||window.confirm('Perubahan belum disimpan. Tutup tanpa menyimpan?');
  const clear=()=>{setDocument(null);setRows([]);setCatalog([]);setAddSearch('');setAddOpen(false);setTableSearchOpen(false);setDate(localDateKey());setWarehouse('');setNotes('');setDirty(false);setSearch('');setFilter('all');setRequestKey(key());setInfo(false);setImportOpen(false);setMessage('');setCategoryOpen(false);setSaveMenuOpen(false);};
  const newDocument=()=>{if(!discard())return;clear();setTab(true);setList(false);};
  const close=()=>{if(!discard())return;clear();setTab(false);setList(true);};
  const open=async(id:string)=>{
    const result=await api.get<Document>(`stock-opnames/${encodeURIComponent(id)}`);
    if(!result.success||!result.data)throw new Error(result.message||'Opname tidak ditemukan');
    const doc=result.data;
    const available=await api.get<{rows:Row[]}>(`stock-opnames?preview=1&warehouseId=${encodeURIComponent(doc.warehouseId)}&date=${doc.endDate}`);
    if(!available.success||!available.data)throw new Error(available.message||'Daftar barang gagal dimuat');
    setCatalog(normalize(available.data.rows));setAddSearch('');setAddOpen(false);setTableSearchOpen(false);
    setDocument(doc);setRows(normalize(doc.rows||[]));setWarehouse(doc.warehouseId);setDate(doc.endDate);setNotes(doc.notes||'');setDirty(false);setTab(true);setList(false);setInfo(false);setSearch('');setFilter('all');
  };
  const preview=async(nextWarehouse:string,nextDate:string,preserve=false)=>{
    if(!nextWarehouse){setRows([]);setCatalog([]);return;}
    const result=await api.get<{rows:Row[]}>(`stock-opnames?preview=1&warehouseId=${encodeURIComponent(nextWarehouse)}&date=${nextDate}`);
    if(!result.success||!result.data)throw new Error(result.message||'Stok gagal dimuat');
    const fresh=normalize(result.data.rows);setCatalog(fresh);
    setRows(preserve?rows.map(row=>({...fresh.find(item=>item.itemId===row.itemId)??row,count:row.count})):[]);
    setAddSearch('');setAddOpen(false);
  };
  const changeHeader=(nextWarehouse:string,nextDate:string)=>void run(async()=>{
    if(dirty&&!window.confirm('Ganti tanggal atau gudang dan kosongkan hasil hitung yang belum disimpan?'))return;
    await preview(nextWarehouse,nextDate);setWarehouse(nextWarehouse);setDate(nextDate);setDirty(!!document);
  });
  const reload=()=>void run(async()=>{
    if(!window.confirm('Muat ulang stok acuan? Hasil hitung yang diketik tetap dipertahankan untuk diperiksa kembali.'))return;
    if(document&&applied){
      const result=await api.get<Document>(`stock-opnames/${document.id}`);if(!result.success||!result.data)throw new Error(result.message);
      if(result.data.revision!==document.revision)throw new Error('Dokumen telah diubah pengguna lain. Tutup lalu buka ulang dokumen.');
      const available=await api.get<{rows:Row[]}>(`stock-opnames?preview=1&warehouseId=${encodeURIComponent(warehouse)}&date=${date}`);
      if(!available.success||!available.data)throw new Error(available.message);
      const fresh=result.data.rows||[],pool=normalize(available.data.rows);setCatalog(pool);
      setRows(rows.map(row=>{const stored=fresh.find(x=>x.itemId===row.itemId);return stored?{...row,editVersion:stored.editVersion}:{...pool.find(x=>x.itemId===row.itemId)??row,count:row.count};}));
    }else await preview(warehouse,date,true);
    setMessage('Stok dimuat ulang. Periksa hasil hitung sebelum klik Simpan.');
  });
  const candidates=catalog.filter(item=>!rows.some(row=>row.itemId===item.itemId)&&`${item.code} ${item.name}`.toLowerCase().includes(addSearch.toLowerCase())).slice(0,30);
  const addItem=(item:Row)=>{if(busy||!canSave)return;setRows(current=>current.some(row=>row.itemId===item.itemId)?current:[...current,{...item,count:''}]);setDirty(true);setAddSearch('');setAddOpen(false);setSearch('');setFilter('all');};
  const save=(mode:'draft'|'apply'='apply')=>void run(async()=>{
    setSaveMenuOpen(false);
    if(!canSave||(!document&&!canCreate)||(mode==='apply'&&!canApply))return;
    if(!warehouse||(mode==='apply'&&!rows.some(row=>row.count!=='')))throw new Error('Pilih gudang dan isi hasil hitung minimal satu barang.');
    const payload={action:'save-simple',mode,date,warehouseId:warehouse,notes,requestKey,revision:document?.revision,
      rows:rows.map(row=>{const value=countValue(row.count);if(Number.isNaN(value))throw new Error(`Hitung fisik ${row.code} harus bilangan bulat 0–2.147.483.647.`);return{itemId:row.itemId,systemQuantity:row.systemQuantity,editVersion:row.editVersion,finalQuantity:value};})};
    const response=document?await api.update('stock-opnames',document.id,payload):await api.create('stock-opnames',payload);
    if(!response.success)throw new Error(response.message);
    setDirty(false);
    const savedId=(response.data as {id:string}).id;
    await open(savedId);await loadList();
    setMessage(response.message||'Opname disimpan.');
    void refreshData().catch(()=>setMessage('Opname tersimpan. Muat ulang aplikasi untuk memperbarui stok di menu lain.'));
  });
  const remove=()=>void run(async()=>{
    if(!document||!hasPermission('stock_opname:delete'))return;
    if(!window.confirm(`Hapus ${document.orderNumber} beserta penyesuaian terkait? Dampak opname pada stok akan dikembalikan.`))return;
    const result=await api.removeWithBody('stock-opnames',document.id,{target:'simple',revision:document.revision});
    if(!result.success)throw new Error(result.message);clear();setTab(false);setList(true);await loadList();setMessage(result.message||'Opname dihapus.');void refreshData().catch(()=>{});
  });
  const showAdjustment=()=>void run(async()=>{
    const id=document?.result?.adjustmentId;if(!id)return;
    const result=await api.get<Adjustment>(`stock-adjustments/${id}`);if(!result.success||!result.data)throw new Error(result.message);setLinked(result.data);
  });
  const template=()=>void run(async()=>{
    const {Workbook}=await import('exceljs');const book=new Workbook();const sheet=book.addWorksheet('Opname');
    sheet.columns=[{header:'Kode Barang',key:'code',width:25},{header:'Nama Barang',key:'name',width:55},{header:'Hitung Fisik',key:'count',width:18}];
    (rows.length?rows:catalog).forEach(row=>sheet.addRow({code:row.code,name:row.name,count:row.count===''?null:countValue(row.count)}));
    sheet.getRow(1).font={bold:true};const buffer=await book.xlsx.writeBuffer();
    const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const anchor=window.document.createElement('a');anchor.href=url;anchor.download='Template Stok Opname.xlsx';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setImportOpen(false);
  });
  const importFile=(selected:File)=>void run(async()=>{
    if(selected.size>10*1024*1024)throw new Error('Ukuran file maksimal 10 MB.');
    const {default:readExcel}=await import('read-excel-file');const sheet=await readExcel(selected);
    const header=(sheet[0]||[]).map(value=>String(value??'').trim().toLowerCase());
    const codeIndex=header.indexOf('kode barang'),countIndex=header.indexOf('hitung fisik');
    if(codeIndex<0||countIndex<0)throw new Error('Gunakan kolom Kode Barang dan Hitung Fisik sesuai template.');
    const available=[...rows,...catalog.filter(item=>!rows.some(row=>row.itemId===item.itemId))];
    const counts=new Map<string,string>();const codes=new Set(available.map(row=>row.code.toUpperCase()));
    for(const [index,cells] of sheet.slice(1).entries()){
      if(cells.every(cell=>cell===null||cell===''))continue;
      const code=String(cells[codeIndex]??'').trim().toUpperCase(),value=String(cells[countIndex]??'').trim();
      if(!codes.has(code))throw new Error(`Baris ${index+2}: kode ${code||'(kosong)'} tidak ada di lembar opname.`);
      if(counts.has(code))throw new Error(`Kode ${code} muncul lebih dari sekali.`);
      if(Number.isNaN(countValue(value)))throw new Error(`Baris ${index+2}: Hitung Fisik harus bilangan bulat tidak negatif.`);
      counts.set(code,value);
    }
    if(!counts.size)throw new Error('Tidak ada baris barang dalam file.');
    setRows(available.filter(row=>rows.some(old=>old.itemId===row.itemId)||counts.has(row.code.toUpperCase())).map(row=>counts.has(row.code.toUpperCase())?{...row,count:counts.get(row.code.toUpperCase())!}:row));setDirty(true);setImportOpen(false);setSearch('');setFilter('all');setMessage(`${counts.size} barang dimuat. Periksa selisih, lalu klik Simpan.`);
  });
  const visible=rows.filter(row=>{
    if(!`${row.name} ${row.code}`.toLowerCase().includes(search.toLowerCase()))return false;
    const count=countValue(row.count),variance=count===null?null:count-row.systemQuantity;
    return filter==='all'||(filter==='blank'?count===null:filter==='match'?variance===0:variance!==null&&variance!==0);
  });
  if(table.sort){const {key:sortKey,direction}=table.sort;const value=(row:Row):string|number|null=>sortKey==='count'?countValue(row.count):sortKey==='variance'?(row.count===''?null:Number(row.count)-row.systemQuantity):row[sortKey];visible.sort((a,b)=>{const x=value(a),y=value(b);if(x===null)return y===null?0:1;if(y===null)return -1;const cmp=typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),'id',{numeric:true});return (direction==='asc'?cmp:-cmp)||a.itemId.localeCompare(b.itemId);});}
  const categoryRows=catalog.filter(row=>scope==='all'||row.systemQuantity!==0||(scope==='activity'&&((row.movementIn||0)!==0||(row.movementOut||0)!==0)));
  const categories=[...new Set(catalog.map(row=>row.categoryName))].filter(name=>name.toLowerCase().includes(categorySearch.toLowerCase()));
  const selectedCategoryAvailable=catalog.filter(row=>selectedCategories.includes(row.categoryName)&&!rows.some(old=>old.itemId===row.itemId));
  const selectedCategoryRows=categoryRows.filter(row=>selectedCategories.includes(row.categoryName)&&!rows.some(old=>old.itemId===row.itemId));
  const takeCategories=()=>{if(!selectedCategoryRows.length)return;setRows(current=>[...current,...selectedCategoryRows.filter(row=>!current.some(old=>old.itemId===row.itemId)).map(row=>({...row,count:''}))]);setDirty(true);setCategoryOpen(false);setSearch('');setFilter('all');setMessage(`${selectedCategoryRows.length} barang dari ${selectedCategories.length} kategori ditambahkan.`);};
  const checked=rows.filter(row=>row.count!=='').length;
  const differences=rows.filter(row=>row.count!==''&&countValue(row.count)!==row.systemQuantity).length;
  const print=()=>{
    const popup=window.open('','_blank','width=1100,height=800');if(!popup){setMessage('Izinkan jendela cetak pada browser.');return;}
    const selectedWarehouse=data.warehouses.find(w=>w.id===warehouse)?.name||warehouse;
    popup.document.write(`<!doctype html><html><head><title>${html(document?.orderNumber||'Lembar Stok Opname')}</title><style>@page{size:A4 landscape;margin:12mm}body{font:12px Arial}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:6px;text-align:left}thead{display:table-header-group}tr{break-inside:avoid}</style></head><body><h2>DOKTER AC MOBIL — Stok Opname</h2><p>${html(document?.orderNumber||'Belum disimpan')} · ${html(date)} · ${html(selectedWarehouse)}</p><p>${html(notes)}</p><table><thead><tr><th>Nama Barang</th><th>Kode</th><th>Stok Sistem</th><th>Hitung Fisik</th><th>Selisih</th><th>Satuan</th></tr></thead><tbody>${visible.map(row=>`<tr><td>${html(row.name)}</td><td>${html(row.code)}</td><td>${row.systemQuantity}</td><td>${html(row.count)}</td><td>${row.count===''?'':html(Number(row.count)-row.systemQuantity)}</td><td>${html(row.unit)}</td></tr>`).join('')}</tbody></table></body></html>`);popup.document.close();popup.focus();popup.print();
  };
  if(legacyOpen)return <><button className="adjustment-outline mb-3" onClick={()=>setLegacyOpen(false)}>Kembali ke Stok Opname</button>{legacy}</>;
  return <div className="adjustment-workspace opname-workspace" aria-busy={busy}>
    <div className="opname-tabs"><button aria-label="Daftar Stok Opname" className={list?'active-list':''} onClick={()=>setList(true)}><List size={23}/></button>{tab&&<div className={`opname-tab ${list?'':'selected'}`}><button onClick={()=>setList(false)}>{document?.orderNumber||'Data Baru'}{dirty?' *':''}</button><button aria-label="Tutup Data Baru" disabled={busy} onClick={close}><X size={17}/></button></div>}</div>
    {message&&<div role="status" className="adjustment-message">{message}<button className="ml-auto" onClick={()=>setMessage('')} aria-label="Tutup pesan"><X size={16}/></button></div>}
    {list?<div className="adjustment-list">
      <div className="opname-list-tools"><label>Tanggal: <IndonesianDateInput value={listDate} onChange={setListDate}/></label><button className="adjustment-icon" title="Hapus filter tanggal" onClick={()=>setListDate('')}><X size={16}/></button><button className="adjustment-outline ml-auto" disabled={busy} onClick={()=>{if(discard())setLegacyOpen(true);}}>Dokumen Lama</button></div>
      <div className="opname-list-tools"><button className="opname-add" aria-label="Tambah Stok Opname" disabled={!canCreate||busy} onClick={newDocument}><Plus/></button><button className="adjustment-icon" title="Muat ulang daftar" disabled={busy} onClick={()=>void run(loadList)}><RefreshCw size={19}/></button><div className="opname-search ml-auto"><input aria-label="Cari opname" placeholder="Cari nomor, gudang, keterangan…" value={listSearch} onChange={e=>setListSearch(e.target.value)}/><Search size={18}/></div></div>
      <div className="adjustment-table-scroll opname-list-table"><table><thead><tr><th>Nomor #</th><th>Tanggal</th><th>Gudang</th><th>Keterangan</th><th>Penyesuaian</th></tr></thead><tbody>{documents.filter(doc=>doc.entryMode==='simple'&&(!listDate||doc.endDate===listDate)&&`${doc.orderNumber} ${doc.warehouseName} ${doc.notes}`.toLowerCase().includes(listSearch.toLowerCase())).map(doc=><tr key={doc.id}><td><button disabled={busy} className="opname-link" onClick={()=>{if(discard())void run(()=>open(doc.id));}}>{doc.orderNumber}</button></td><td>{doc.endDate}</td><td>{doc.warehouseName}</td><td>{doc.notes||'—'}</td><td>{doc.result?.status==='Draft'?'Draf':doc.result?.adjustmentNumber||'Tanpa selisih'}</td></tr>)}</tbody></table>{!documents.some(doc=>doc.entryMode==='simple')&&<div className="adjustment-empty">Belum ada Stok Opname. Klik + untuk mulai menghitung.</div>}</div>
    </div>:<div className="opname-form">
      <main><div className="opname-header"><label><span>Tanggal Opname <b>*</b></span><IndonesianDateInput value={date} max={localDateKey()} disabled={applied||busy} onChange={value=>changeHeader(warehouse,value)}/></label><label><span>No. Opname #</span><input value={document?.orderNumber||'Otomatis'} readOnly/></label><label><span>Gudang <b>*</b></span><select aria-label="Gudang" value={warehouse} disabled={applied||busy} onChange={e=>changeHeader(e.target.value,date)}><option value="">Pilih Gudang</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label><label><span>Penyesuaian</span>{document?.result?.adjustmentId?<button className="opname-link" disabled={busy} onClick={showAdjustment}>{document.result.adjustmentNumber}</button>:<span className="opname-muted">{document?.result?.status==='Draft'?'Draf · stok belum berubah':document?'Tanpa selisih':'Otomatis jika ada selisih'}</span>}</label></div>
      <div className="adjustment-body-wrap"><nav className="adjustment-side-tabs"><button title="Rincian Barang" className={!info?'active':''} onClick={()=>setInfo(false)}><FileText size={18}/></button><button title="Info Lainnya" className={info?'active':''} onClick={()=>setInfo(true)}><Info size={18}/></button></nav><section className={`adjustment-body opname-body ${info?'opname-body-info':''}`}>
        {info?<div className="opname-info">
          <header className="opname-info-heading"><div><Info size={21}/><h2>Info Lainnya</h2></div><span className={`opname-status ${applied?'applied':''}`}>{document?(applied?'Sudah Diterapkan':'Draf'):'Belum disimpan'}</span></header>
          <label className="opname-info-notes"><span>Keterangan</span><textarea aria-label="Keterangan opname" rows={3} value={notes} maxLength={255} disabled={busy||!canSave} placeholder="Tambahkan catatan pemeriksaan atau alasan selisih stok…" onChange={e=>{setNotes(e.target.value);setDirty(true);}}/></label>
          <div className="opname-recap-heading">Rekap Penghitungan</div><dl className="opname-info-summary"><div><dd>{rows.length}</dd><dt>Barang</dt></div><div><dd>{checked}</dd><dt>Dihitung</dt></div><div className="matched"><dd>{rows.filter(row=>row.count!==''&&countValue(row.count)===row.systemQuantity).length}</dd><dt>Cocok</dt></div><div className="variance"><dd>{rows.filter(row=>row.count!==''&&!Number.isNaN(countValue(row.count))&&countValue(row.count)!==row.systemQuantity).length}</dd><dt>Berselisih</dt></div><div><dd>{rows.length-checked}</dd><dt>Belum dihitung</dt></div></dl>
          {rows.some(row=>Number.isNaN(countValue(row.count)))&&<p className="opname-info-warning">{rows.filter(row=>Number.isNaN(countValue(row.count))).length} hitungan perlu diperbaiki sebelum disimpan.</p>}
          <div className="opname-info-metadata"><dl><div><dt>Pemeriksa</dt><dd>{document?.assignedUserName||currentUser?.name||currentUser?.username||'Pengguna saat ini'}</dd></div><div><dt>Penyesuaian</dt><dd>{document?.result?.adjustmentId?<button className="opname-link" disabled={busy} onClick={showAdjustment}>{document.result.adjustmentNumber} ↗</button>:applied?'Tanpa selisih':'Belum diterapkan'}</dd></div></dl><dl><div><dt>Dibuat</dt><dd>{document?.createdAt||'—'}</dd></div><div><dt>Terakhir diperbarui</dt><dd>{document?.lastUpdatedAt||document?.createdAt||'—'}</dd></div></dl></div>
          <footer className="opname-info-footer"><span>{dirty?'Ada perubahan belum disimpan':document?'Perubahan sudah tersimpan':'Dokumen baru'}</span>{document&&<span>Revisi {document.revision}</span>}</footer>
        </div>:<>
        <div className="opname-toolbar opname-entry-toolbar">
          <div className="opname-add-search">
            <div className="opname-search"><input aria-label="Cari atau pilih barang" placeholder="Cari/Pilih Barang & Jasa…" value={addSearch} disabled={!warehouse||busy||!canSave} onFocus={()=>setAddOpen(true)} onChange={e=>{setAddSearch(e.target.value);setAddOpen(true);}} onKeyDown={e=>{if(e.key==='Escape')setAddOpen(false);if(e.key==='Enter'&&candidates.length===1){e.preventDefault();addItem(candidates[0]);}}}/><button aria-label="Pilih barang untuk ditambahkan" disabled={!warehouse||busy||!canSave} onClick={()=>setAddOpen(!addOpen)}><Search size={18}/></button></div>
            {addOpen&&warehouse&&<div className="adjustment-suggestions">{candidates.map(item=><button key={item.itemId} onClick={()=>addItem(item)}><strong>{item.code}</strong><span>{item.name}</span></button>)}{!candidates.length&&<div className="adjustment-empty">{catalog.length===rows.length?'Semua barang sudah ada di tabel.':'Barang tidak ditemukan.'}</div>}</div>}
          </div>
          <div className="adjustment-dropdown"><button className="adjustment-outline" disabled={!catalog.length||busy||!canSave} onClick={()=>{setImportOpen(!importOpen);setAddOpen(false);}}>Ambil <ChevronDown size={14}/></button>{importOpen&&<div className="adjustment-menu"><button onClick={()=>{setSelectedCategories([]);setCategorySearch('');setCategoryOpen(true);setImportOpen(false);}}>Per Kategori</button><button onClick={()=>{setRows(current=>[...current,...catalog.filter(item=>!current.some(row=>row.itemId===item.itemId))]);setDirty(true);setImportOpen(false);setSearch('');setFilter('all');}}>Semua Barang</button><button onClick={()=>file.current?.click()}>Impor dari Excel</button><button onClick={template}>Unduh Template Excel</button></div>}</div>
          <button className="adjustment-icon" title="Muat ulang stok acuan" disabled={busy||!warehouse} onClick={reload}><RefreshCw size={17}/></button>
          <div className="opname-table-search-tools"><button className="adjustment-icon" aria-label="Cari barang di tabel" aria-expanded={tableSearchOpen} title="Cari barang di tabel" onClick={()=>{setTableSearchOpen(!tableSearchOpen);setSearch('');setAddOpen(false);}}><Search size={18}/></button><h2>Rincian Barang <b>*</b></h2></div>
        </div>
        {(tableSearchOpen||rows.length>0)&&<div className="opname-table-filters">{tableSearchOpen&&<div className="opname-search"><input autoFocus placeholder="Cari barang di tabel…" aria-label="Pencarian Barang" value={search} onChange={e=>setSearch(e.target.value)}/><button aria-label="Tutup pencarian tabel" onClick={()=>{setSearch('');setTableSearchOpen(false);}}><X size={16}/></button></div>}<span>{rows.length} Barang</span><button className="adjustment-outline" onClick={table.resetLayout}>Reset Kolom</button><select aria-label="Filter hasil hitung" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Semua Barang</option><option value="blank">Belum Dihitung</option><option value="match">Cocok</option><option value="difference">Berselisih</option></select></div>}
        <input ref={file} type="file" hidden accept=".xlsx" onChange={e=>{const selected=e.target.files?.[0];e.target.value='';if(selected)void importFile(selected);}}/>
        <div className="adjustment-table-scroll opname-items"><table style={table.isDesktop?{minWidth:orderedColumns.reduce((sum,col)=>sum+table.widths[col],0)}:undefined}><colgroup>{orderedColumns.map(col=><col key={col} style={{width:table.isDesktop?table.widths[col]:widths[col]}}/>)}</colgroup><thead><tr>{orderedColumns.map(col=><ConfigurableTableHeaderCell key={col} columnKey={col} label={labels[col]} sortable movable={table.isDesktop} sort={table.sort} onMove={table.moveColumn} onSort={table.toggleSort} onResize={table.beginResize} onResetWidth={table.resetWidth}/>)}</tr></thead><tbody>{visible.map(row=>{const value=countValue(row.count),variance=value===null?null:value-row.systemQuantity;
          const cells:Record<Column,ReactNode>={name:row.name,code:row.code,systemQuantity:row.systemQuantity,unit:row.unit,count:<input aria-label={`Hitung ${row.code}`} inputMode="numeric" placeholder="—" value={row.count} disabled={busy||!canSave} className={Number.isNaN(value)?'invalid':''} onChange={e=>{setRows(current=>current.map(item=>item.itemId===row.itemId?{...item,count:e.target.value}:item));setDirty(true);}}/>,variance:variance===null?'—':Number.isNaN(variance)?'Tidak valid':variance>0?`+${variance}`:variance===0?'0 · Cocok':variance};
          return <tr key={row.itemId}>{orderedColumns.map(col=><td key={col} title={col==='name'?row.name:undefined} className={`${col==='systemQuantity'||col==='variance'?'opname-numeric':''} ${col==='variance'&&variance!==null?(variance<0?'opname-negative':variance>0?'opname-positive':'opname-match'):''}`}>{cells[col]}</td>)}</tr>;})}</tbody></table>{!visible.length&&<div className="adjustment-empty">{!warehouse?'Pilih gudang untuk menampilkan barang.':busy?'Memuat barang…':!rows.length?'Belum ada data. Tambahkan barang melalui kolom di sebelah kiri.':'Tidak ada barang yang sesuai.'}</div>}</div>
        <footer className="opname-summary"><span>{checked} dihitung · {checked-differences} cocok · {differences} berselisih</span><span>Kosong = belum diperiksa · 0 = barang habis</span></footer></>}
      </section></div></main>
      <aside className="opname-rail"><div className="opname-save-split" ref={saveMenuRef}><button className="save" aria-label="Simpan" title="Simpan dan terapkan hasil opname" disabled={busy||!canApply||(!document&&!canCreate)||!checked||(!dirty&&applied)} onClick={()=>save('apply')}><Save/><span>Simpan</span></button><button className="opname-save-arrow" aria-label="Pilihan simpan" aria-haspopup="menu" aria-expanded={saveMenuOpen} disabled={busy||applied||!canSave||(!document&&!canCreate)} onClick={()=>setSaveMenuOpen(!saveMenuOpen)}><ChevronDown size={15}/></button>{saveMenuOpen&&<div className="opname-save-menu" role="menu"><button role="menuitem" disabled={!warehouse||(!dirty&&!!document)} onClick={()=>save('draft')}>Simpan Draf</button></div>}</div><button title="Cetak" aria-label="Cetak" disabled={!rows.length||busy} onClick={print}><Printer/></button><button title="Lampiran belum diaktifkan" aria-label="Lampiran" disabled><Paperclip/></button><button title="Menu lainnya belum diaktifkan" aria-label="Menu lainnya" disabled><CircleEllipsis/></button>{document&&<button className="delete" title="Hapus Opname" aria-label="Hapus Opname" disabled={busy||!hasPermission('stock_opname:delete')} onClick={remove}><Trash2/></button>}</aside>
    </div>}
    {categoryOpen&&<div className="adjustment-modal-overlay"><section className="adjustment-modal"><header><h2>Ambil Per Kategori</h2><button aria-label="Tutup kategori" onClick={()=>setCategoryOpen(false)}><X size={18}/></button></header><div className="opname-category"><label>Cakupan barang<select aria-label="Cakupan barang" value={scope} onChange={e=>setScope(e.target.value)}><option value="activity">Stok ≠ 0 atau ada mutasi bulan ini</option><option value="stock">Stok ≠ 0</option><option value="all">Semua barang kategori</option></select></label><p>Gudang terpilih · Mutasi {date.slice(0,7)}-01 s.d. {date}. Hitung fisik tetap kosong.</p><input aria-label="Cari kategori" placeholder="Cari kategori…" value={categorySearch} onChange={e=>setCategorySearch(e.target.value)}/><div className="opname-category-list">{categories.map(name=>{const total=catalog.filter(row=>row.categoryName===name).length;const added=catalog.filter(row=>row.categoryName===name&&rows.some(old=>old.itemId===row.itemId)).length;const count=categoryRows.filter(row=>row.categoryName===name&&!rows.some(old=>old.itemId===row.itemId)).length;return <label className="opname-category-choice" key={name}><input type="checkbox" aria-label={name} checked={selectedCategories.includes(name)} onChange={e=>setSelectedCategories(current=>e.target.checked?[...current,name]:current.filter(category=>category!==name))}/><span>{name}<small className="opname-category-detail">{total} barang total{added>0?` · ${added} sudah di tabel`:""}{total-added-count>0?` · ${total-added-count} di luar cakupan`:""}</small></span><small>{count} barang baru</small></label>;})}{!categories.length&&<p>Kategori tidak ditemukan.</p>}</div>{selectedCategories.length>0&&selectedCategoryAvailable.length>selectedCategoryRows.length&&<div className="opname-category-hint" role="status"><p>{selectedCategoryAvailable.length-selectedCategoryRows.length} barang dari kategori terpilih tidak masuk cakupan stok/mutasi. Pilih semua barang kategori untuk menyertakannya.</p><button type="button" className="adjustment-outline" onClick={()=>setScope("all")}>Pakai semua barang kategori</button></div>}{selectedCategories.length>0&&!selectedCategoryAvailable.length&&<p role="status">Semua barang dari kategori terpilih sudah ada di tabel.</p>}<footer className="opname-category-footer"><span>{selectedCategories.length} kategori dipilih · {selectedCategoryRows.length} barang baru</span><button className="adjustment-outline" disabled={!selectedCategoryRows.length} onClick={takeCategories}>Tambahkan Barang</button></footer></div></section></div>}
    {linked&&<div className="adjustment-modal-overlay"><section className="adjustment-modal"><header><h2>Penyesuaian {linked.adjustmentNumber}</h2><button aria-label="Tutup penyesuaian" onClick={()=>setLinked(null)}><X size={18}/></button></header><div className="opname-linked"><p>Perubahan dilakukan melalui opname asal.</p><table><thead><tr><th>Barang</th><th>Selisih</th></tr></thead><tbody>{linked.rows.map((row,index)=><tr key={index}><td>{row.itemCode}<br/>{row.itemName}</td><td>{row.quantity>0?'+':''}{row.quantity} {row.unit}</td></tr>)}</tbody></table></div></section></div>}
  </div>;
}
