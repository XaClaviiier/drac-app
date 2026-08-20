import { useEffect, useMemo, useState } from 'react';
import { Minus, Pencil, Plus, Printer, RefreshCw, Search, SlidersHorizontal, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/apiClient';
import { localDateKey } from '../lib/date';

type ReportRow = { id:string; code:string; name:string; unit:string; categoryId:string; categoryName:string; brand:string; quantity:number };
type ReportResponse = { date:string; warehouse:{id:string;code:string;name:string}; branch:{id:string;name:string}; rows:ReportRow[] };
type FilterColumn = 'categoryName' | 'brand' | 'code' | 'name' | 'quantity';
type FilterOperator = 'is' | 'isNot' | 'contains' | 'notContains' | 'gt' | 'gte' | 'lt' | 'lte';
type ReportFilter = { id:string; column:FilterColumn; operator:FilterOperator; value:string };

const columnLabels: Record<FilterColumn,string> = { categoryName:'Kategori Barang', brand:'Merek Barang', code:'Kode Barang', name:'Nama Barang', quantity:'Kuantitas' };
const operatorLabels: Record<FilterOperator,string> = { is:'Adalah', isNot:'Bukan', contains:'Mengandung', notContains:'Tidak Mengandung', gt:'Lebih Besar Dari', gte:'Lebih Besar atau Sama Dengan', lt:'Lebih Kecil Dari', lte:'Lebih Kecil atau Sama Dengan' };
const textOperators: FilterOperator[] = ['is','isNot','contains','notContains'];
const numberOperators: FilterOperator[] = ['is','isNot','gt','gte','lt','lte'];

const dateLabel = (value:string) => new Date(`${value}T00:00:00`).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'});
const escapeHtml = (value:unknown) => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');

export default function StockCountSheetReport(){
  const {data,currentBranchId}=useApp();
  const [showParameters,setShowParameters]=useState(true);
  const [parameterTab,setParameterTab]=useState<'general'|'columns'>('general');
  const [date,setDate]=useState(localDateKey());
  const [branchId,setBranchId]=useState(currentBranchId);
  const [warehouseId,setWarehouseId]=useState('');
  const [filters,setFilters]=useState<ReportFilter[]>([]);
  const [selectedFilterId,setSelectedFilterId]=useState('');
  const [showFilter,setShowFilter]=useState(false);
  const [filterDraft,setFilterDraft]=useState<Omit<ReportFilter,'id'>>({column:'categoryName',operator:'is',value:''});
  const [report,setReport]=useState<ReportResponse|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [zoom,setZoom]=useState(1);

  const branches=useMemo(()=>data.branches.filter(branch=>branch.isActive),[data.branches]);
  const warehouses=useMemo(()=>data.warehouses.filter(warehouse=>warehouse.isActive&&!warehouse.isSystem&&(branchId==='ALL'||warehouse.branchId===branchId)),[data.warehouses,branchId]);
  const brands=useMemo(()=>[...new Set(data.items.map(item=>item.brand).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'id')),[data.items]);
  useEffect(()=>{if(warehouseId&&!warehouses.some(warehouse=>warehouse.id===warehouseId))setWarehouseId('');},[warehouseId,warehouses]);

  const matchesFilter=(row:ReportRow,filter:ReportFilter)=>{
    const raw=filter.column==='quantity'?row.quantity:row[filter.column];
    if(filter.column==='quantity'){
      const left=Number(raw),right=Number(filter.value);
      if(filter.operator==='is')return left===right;if(filter.operator==='isNot')return left!==right;
      if(filter.operator==='gt')return left>right;if(filter.operator==='gte')return left>=right;
      if(filter.operator==='lt')return left<right;if(filter.operator==='lte')return left<=right;
      return true;
    }
    const left=String(raw||'').trim().toLocaleLowerCase('id'),right=filter.value.trim().toLocaleLowerCase('id');
    if(filter.operator==='is')return left===right;if(filter.operator==='isNot')return left!==right;
    if(filter.operator==='contains')return left.includes(right);if(filter.operator==='notContains')return !left.includes(right);
    return true;
  };
  const visibleRows=useMemo(()=>report?.rows.filter(row=>filters.every(filter=>matchesFilter(row,filter)))||[],[report,filters]);
  const groupedRows=useMemo(()=>{
    const groups=new Map<string,ReportRow[]>();
    visibleRows.forEach(row=>{const key=row.categoryName||'Tanpa Kategori';groups.set(key,[...(groups.get(key)||[]),row]);});
    return [...groups.entries()].sort(([a],[b])=>a.localeCompare(b,'id',{sensitivity:'base'}));
  },[visibleRows]);

  const filterDescription=(filter:ReportFilter)=>`${columnLabels[filter.column]} ${operatorLabels[filter.operator].toLowerCase()} ${filter.value}`;
  const openNewFilter=()=>{setSelectedFilterId('');setFilterDraft({column:'categoryName',operator:'is',value:''});setShowFilter(true);};
  const openEditFilter=()=>{const current=filters.find(filter=>filter.id===selectedFilterId);if(!current)return;setFilterDraft({column:current.column,operator:current.operator,value:current.value});setShowFilter(true);};
  const saveFilter=()=>{
    if(!filterDraft.value.trim())return;
    if(selectedFilterId)setFilters(current=>current.map(filter=>filter.id===selectedFilterId?{...filterDraft,id:selectedFilterId}:filter));
    else setFilters(current=>[...current,{...filterDraft,id:`FLT-${Date.now()}`}]);
    setShowFilter(false);
  };
  const removeFilter=()=>{setFilters(current=>current.filter(filter=>filter.id!==selectedFilterId));setSelectedFilterId('');};

  const loadReport=async()=>{
    if(!warehouseId){setError('Gudang wajib dipilih.');setParameterTab('general');return;}
    setLoading(true);setError('');
    try{
      const query=new URLSearchParams({date,warehouseId,branchId});
      const response=await api.get<ReportResponse>(`stock-count-report?${query.toString()}`);
      if(!response.success||!response.data)throw new Error(response.message||'Laporan gagal dimuat');
      setReport(response.data);setShowParameters(false);
    }catch(reason:any){setError(reason?.message||'Laporan gagal dimuat');}
    finally{setLoading(false);}
  };

  const branchLabel=branchId==='ALL'?'[Semua Cabang]':branches.find(branch=>branch.id===branchId)?.name||'-';
  const filterLabel=filters.length?filters.map(filter=>filterDescription(filter)).join('; '):'Tanpa filter kolom';
  const printReport=()=>{
    if(!report)return;
    const popup=window.open('','_blank','width=1000,height=800');
    if(!popup)return window.alert('Popup diblokir browser. Izinkan popup untuk mencetak.');
    const body=groupedRows.map(([category,rows])=>`<tr class="group"><td colspan="6">${escapeHtml(category)}</td></tr>${rows.map(row=>`<tr><td>${escapeHtml(row.code)}</td><td>${escapeHtml(row.name)}</td><td class="num">${row.quantity.toLocaleString('id-ID')}</td><td>${escapeHtml(row.unit)}</td><td class="count"><span></span></td><td class="count"><span></span></td></tr>`).join('')}`).join('');
    popup.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Lembar Penghitungan Stok</title><style>@page{size:A4 portrait;margin:14mm 13mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0}.report-head{text-align:center;margin:8mm 0 9mm}.company{font-family:monospace;letter-spacing:1px;font-size:14px}.report-head h1{color:#a00039;font-size:25px;margin:7px 0 3px}.date{font-family:monospace;font-size:15px}.meta{text-align:right;font-size:9px;font-style:italic;margin:8px 0 20px}table{width:100%;border-collapse:collapse;font-size:10px}thead{display:table-header-group}tr{break-inside:avoid}th{text-align:left;color:#06396b;border-bottom:1px solid #111;padding:5px 7px}.num{text-align:right}.group td{font-weight:bold;padding:8px 0 4px}.count{width:15%;padding:5px 7px}.count span{display:block;border-bottom:1px solid #111;height:15px}td{padding:4px 7px;vertical-align:top}.code{width:19%}.name{width:35%}.qty{width:10%}.unit{width:10%}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><div class="report-head"><div class="company">DOKTER AC MOBIL</div><h1>Lembar Penghitungan Stok</h1><div class="date">Per Tgl. ${escapeHtml(dateLabel(report.date))}</div></div><div class="meta">Cabang : ${escapeHtml(branchLabel)}, Gudang : ${escapeHtml(report.warehouse.name)}, Filter berdasarkan : ${escapeHtml(filterLabel)}</div><table><thead><tr><th class="code">Kode Barang</th><th class="name">Nama Barang</th><th class="qty num">Kuantitas</th><th class="unit">Satuan</th><th>Hitung #1</th><th>Hitung #2</th></tr></thead><tbody>${body||'<tr><td colspan="6">Tidak ada barang sesuai filter.</td></tr>'}</tbody></table><script>window.onload=()=>{window.focus();window.print()}<\/script></body></html>`);popup.document.close();
  };

  const valueOptions=filterDraft.column==='categoryName'?data.itemCategories.map(category=>category.name):filterDraft.column==='brand'?brands:[];
  const operators=filterDraft.column==='quantity'?numberOperators:textOperators;
  return <div className="-m-4 min-h-[calc(100vh-80px)] bg-[#686868] sm:-m-6">
    <div className="flex items-center justify-center gap-4 border-b bg-[#f2f2f2] px-4 py-3">
      <button onClick={()=>setShowParameters(true)} title="Parameter Laporan" className="border border-dotted border-slate-500 bg-white p-2 text-slate-900"><SlidersHorizontal className="h-5 w-5"/></button>
      <button onClick={()=>void loadReport()} disabled={!report||loading} title="Refresh" className="p-2 disabled:opacity-40"><RefreshCw className="h-5 w-5"/></button>
      <button onClick={printReport} disabled={!report} title="Cetak" className="p-2 disabled:opacity-40"><Printer className="h-5 w-5"/></button>
      <button onClick={()=>setZoom(value=>Math.min(1.35,value+.1))} title="Perbesar" className="p-2"><ZoomIn className="h-5 w-5"/></button>
      <button onClick={()=>setZoom(value=>Math.max(.65,value-.1))} title="Perkecil" className="p-2"><ZoomOut className="h-5 w-5"/></button>
    </div>
    <div className="overflow-auto p-4 sm:p-8">
      <article style={{transform:`scale(${zoom})`,transformOrigin:'top center'}} className="mx-auto min-h-[1120px] w-[794px] bg-white px-11 py-14 shadow-2xl">
        <header className="mb-8 text-center"><p className="font-mono tracking-widest text-slate-800">DOKTER AC MOBIL</p><h1 className="mt-2 text-3xl font-bold text-[#a00039]">Lembar Penghitungan Stok</h1><p className="mt-1 font-mono text-lg">Per Tgl. {report?dateLabel(report.date):dateLabel(date)}</p></header>
        {report?<><p className="mb-7 text-right text-xs italic">Cabang : {branchLabel}, Gudang : {report.warehouse.name}, Filter berdasarkan : {filterLabel}</p><table className="w-full table-fixed text-sm"><thead><tr className="text-[#06396b]"><th className="w-[18%] border-b border-black px-2 py-2 text-left">Kode Barang</th><th className="w-[34%] border-b border-black px-2 py-2 text-left">Nama Barang</th><th className="w-[10%] border-b border-black px-2 py-2 text-right">Kuantitas</th><th className="w-[10%] border-b border-black px-2 py-2 text-left">Satuan</th><th className="w-[14%] border-b border-black px-2 py-2 text-left">Hitung #1</th><th className="w-[14%] border-b border-black px-2 py-2 text-left">Hitung #2</th></tr></thead><tbody>{groupedRows.map(([category,rows])=><FragmentGroup key={category} category={category} rows={rows}/>)}</tbody></table>{!visibleRows.length&&<div className="py-20 text-center text-slate-400">Tidak ada barang sesuai filter.</div>}</>:<div className="py-40 text-center text-slate-400">Atur parameter laporan untuk menampilkan lembar penghitungan stok.</div>}
      </article>
    </div>

    {showParameters&&<div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-3"><div className="w-full max-w-4xl overflow-hidden rounded-lg bg-white shadow-2xl">
      <header className="flex items-center justify-between bg-[#0c3262] px-5 py-4 text-white"><h2 className="text-xl font-semibold">Parameter Laporan</h2><button onClick={()=>setShowParameters(false)}><X className="h-6 w-6"/></button></header>
      <div className="px-4 pt-4"><div className="flex border-b"><button onClick={()=>setParameterTab('general')} className={`px-6 py-3 text-xl ${parameterTab==='general'?'border-b-4 border-red-500 text-red-600':'text-slate-500'}`}>Umum</button><button onClick={()=>setParameterTab('columns')} className={`px-6 py-3 text-xl ${parameterTab==='columns'?'border-b-4 border-red-500 text-red-600':'text-slate-500'}`}>Kolom</button></div></div>
      {parameterTab==='general'?<div className="min-h-[420px] p-7"><h3 className="border-b pb-2 text-3xl text-slate-700">Tanggal</h3><div className="grid grid-cols-[minmax(180px,1fr)_minmax(280px,390px)] items-center gap-5 py-7 text-xl"><label>Per Tanggal <span className="text-red-500">*</span></label><input type="date" max={localDateKey()} value={date} onChange={event=>setDate(event.target.value)} className="rounded border border-slate-300 px-3 py-3"/></div><h3 className="border-b pb-2 text-3xl text-slate-700">Parameter Tambahan</h3><div className="grid grid-cols-[minmax(180px,1fr)_minmax(280px,590px)] items-center gap-5 py-7 text-xl"><label>Gudang <span className="text-red-500">*</span></label><select value={warehouseId} onChange={event=>setWarehouseId(event.target.value)} className="rounded border border-slate-300 px-3 py-3"><option value="">Cari/Pilih Gudang...</option>{warehouses.map(warehouse=><option key={warehouse.id} value={warehouse.id}>{warehouse.code} - {warehouse.name}</option>)}</select><label>Cabang <span className="text-red-500">*</span></label><select value={branchId} onChange={event=>setBranchId(event.target.value)} className="rounded border border-slate-300 px-3 py-3"><option value="ALL">[Semua Cabang]</option>{branches.map(branch=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div></div>:<div className="min-h-[420px] p-6"><h3 className="border-b pb-2 text-3xl text-slate-700">Parameter Kolom</h3><div className="mt-6 h-52 overflow-auto border border-slate-400 bg-white">{filters.map(filter=><button type="button" key={filter.id} onClick={()=>setSelectedFilterId(filter.id)} className={`block w-full px-3 py-2 text-left text-lg ${selectedFilterId===filter.id?'bg-blue-100 text-blue-900':''}`}>{filterDescription(filter)}</button>)}</div><div className="mt-2 flex gap-2"><button onClick={openNewFilter} className="rounded bg-[#52b510] p-3 text-white"><Plus className="h-7 w-7"/></button><button onClick={openEditFilter} disabled={!selectedFilterId} className="rounded bg-slate-200 p-3 text-slate-600 disabled:opacity-40"><Pencil className="h-6 w-6"/></button><button onClick={removeFilter} disabled={!selectedFilterId} className="rounded bg-slate-200 p-3 text-slate-600 disabled:opacity-40"><Minus className="h-6 w-6"/></button></div></div>}
      {error&&<p className="mx-7 mb-2 rounded bg-red-50 px-4 py-2 text-red-700">{error}</p>}<footer className="flex justify-end border-t px-5 py-4"><button onClick={()=>void loadReport()} disabled={loading} className="rounded bg-[#154da0] px-8 py-3 text-xl font-semibold text-white disabled:opacity-50">{loading?'Memuat...':'Tampilkan'}</button></footer>
    </div></div>}

    {showFilter&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3"><div className="flex min-h-[540px] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl"><header className="flex items-center justify-between bg-[#0c3262] px-5 py-4 text-white"><h2 className="text-xl font-semibold">Penyaringan Data</h2><button onClick={()=>setShowFilter(false)}><X className="h-6 w-6"/></button></header><div className="grid grid-cols-[130px_1fr] items-center gap-4 p-5 text-xl"><label>Kolom</label><select value={filterDraft.column} onChange={event=>{const column=event.target.value as FilterColumn;setFilterDraft({column,operator:'is',value:''});}} className="rounded border px-3 py-3">{(Object.keys(columnLabels) as FilterColumn[]).map(column=><option key={column} value={column}>{columnLabels[column]}</option>)}</select><label>Operator</label><select value={filterDraft.operator} onChange={event=>setFilterDraft({...filterDraft,operator:event.target.value as FilterOperator})} className="rounded border px-3 py-3">{operators.map(operator=><option key={operator} value={operator}>{operatorLabels[operator]}</option>)}</select><label>Nilai</label><div className="relative">{valueOptions.length?<select value={filterDraft.value} onChange={event=>setFilterDraft({...filterDraft,value:event.target.value})} className="w-full rounded border px-3 py-3"><option value="">Cari/Pilih...</option>{valueOptions.map(value=><option key={value} value={value}>{value}</option>)}</select>:<><input type={filterDraft.column==='quantity'?'number':'text'} value={filterDraft.value} onChange={event=>setFilterDraft({...filterDraft,value:event.target.value})} placeholder="Cari/Pilih..." className="w-full rounded border px-3 py-3 pr-11"/><Search className="absolute right-3 top-3.5 h-6 w-6"/></>}</div></div><footer className="mt-auto flex justify-end p-4"><button onClick={saveFilter} disabled={!filterDraft.value.trim()} className="rounded bg-[#55b510] px-8 py-3 text-xl font-semibold text-white disabled:opacity-40">Simpan</button></footer></div></div>}
  </div>;
}

function FragmentGroup({category,rows}:{category:string;rows:ReportRow[]}){
  return <><tr><td colSpan={6} className="px-2 pb-1 pt-4 font-bold">{category}</td></tr>{rows.map(row=><tr key={row.id} className="break-inside-avoid align-top"><td className="px-2 py-1 font-mono text-xs">{row.code}</td><td className="px-2 py-1">{row.name}</td><td className="px-2 py-1 text-right">{row.quantity.toLocaleString('id-ID')}</td><td className="px-2 py-1">{row.unit}</td><td className="px-2 py-1"><span className="block h-5 border-b border-black"/></td><td className="px-2 py-1"><span className="block h-5 border-b border-black"/></td></tr>)}</>;
}
