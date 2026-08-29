import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { ItemVehicleCompatibility } from '../types';

export type VehicleCatalogGenerationOption = { id:string;name:string;isActive:boolean;engineCcs:number[];yearFrom?:number|null;yearTo?:number|null };
export type VehicleCatalogModelOption = { id:string;name:string;isActive:boolean;generations:VehicleCatalogGenerationOption[] };
export type VehicleCatalogBrandOption = { id:string;name:string;isActive:boolean;models:VehicleCatalogModelOption[] };

const engineTypes:NonNullable<ItemVehicleCompatibility['engineType']>[]=['Bensin','Diesel','Hybrid','Listrik'];
const transmissions:NonNullable<ItemVehicleCompatibility['transmission']>[]=['MT','AT','CVT','DCT'];
const hvacTypes:NonNullable<ItemVehicleCompatibility['hvacType']>[]=['Manual','Digital','Dual Zone'];
const statuses:NonNullable<ItemVehicleCompatibility['fitmentStatus']>[]=['Pending','Verified','Rejected'];
const compatibilityKey=(row:ItemVehicleCompatibility)=>[row.brandId,row.modelId||'',row.generationId||'',row.yearFrom||'',row.yearTo||'',row.engineCc||'',row.engineType||'',row.engineCode||'',row.variant||'',row.transmission||'',row.hvacType||'',row.fitmentStatus||''].join('|');

export const formatVehicleCompatibility=(row:ItemVehicleCompatibility)=>[
 row.brandName||'Semua Merek',row.modelName||'Semua Model',row.generationName||'Semua Generasi',
 row.yearFrom||row.yearTo?`${row.yearFrom||'…'}–${row.yearTo||'…'}`:null,
 row.engineCc?`${row.engineCc.toLocaleString('id-ID')} CC`:'Semua CC',row.engineType||'Semua Mesin',
 row.engineCode||null,row.variant?`Varian ${row.variant}`:null,row.transmission||null,row.hvacType?`AC ${row.hvacType}`:null,
 row.fitmentStatus==='Verified'?'Terverifikasi':row.fitmentStatus==='Rejected'?'Tidak Cocok':'Perlu Verifikasi',
].filter(Boolean).join(' — ');

type Props={catalog:VehicleCatalogBrandOption[];value:ItemVehicleCompatibility[];onChange:(value:ItemVehicleCompatibility[])=>void;canVerifyFitment?:boolean;};
export default function VehicleCompatibilityPicker({catalog,value,onChange,canVerifyFitment=false}:Props){
 const activeBrands=useMemo(()=>catalog.filter(row=>row.isActive),[catalog]);
 const allowedStatuses=canVerifyFitment?statuses:['Pending'];
 const[brandId,setBrandId]=useState('');const[modelId,setModelId]=useState('');const[generationId,setGenerationId]=useState('');
 const[selectedCcs,setSelectedCcs]=useState<number[]>([]);const[selectedEngineTypes,setSelectedEngineTypes]=useState<NonNullable<ItemVehicleCompatibility['engineType']>[]>([]);
 const[yearFrom,setYearFrom]=useState('');const[yearTo,setYearTo]=useState('');const[engineCode,setEngineCode]=useState('');const[variant,setVariant]=useState('');
 const[transmission,setTransmission]=useState('');const[hvacType,setHvacType]=useState('');const[fitmentStatus,setFitmentStatus]=useState<NonNullable<ItemVehicleCompatibility['fitmentStatus']>>('Pending');
 const[source,setSource]=useState('');const[notes,setNotes]=useState('');
 const brand=activeBrands.find(row=>row.id===brandId);const models=(brand?.models||[]).filter(row=>row.isActive);const model=models.find(row=>row.id===modelId);
 const generations=(model?.generations||[]).filter(row=>row.isActive);const generation=generations.find(row=>row.id===generationId);const availableCcs=generation?.engineCcs||[];
 const toggleCc=(cc:number)=>setSelectedCcs(current=>current.includes(cc)?current.filter(row=>row!==cc):[...current,cc]);
 const toggleEngineType=(type:NonNullable<ItemVehicleCompatibility['engineType']>)=>setSelectedEngineTypes(current=>current.includes(type)?current.filter(row=>row!==type):[...current,type]);
 const resetGenerationDerivedState=()=>{setGenerationId('');setSelectedCcs([]);setYearFrom('');setYearTo('');};
 const selectGeneration=(id:string)=>{setGenerationId(id);setSelectedCcs([]);const next=generations.find(row=>row.id===id);setYearFrom(next?.yearFrom?String(next.yearFrom):'');setYearTo(next?.yearTo?String(next.yearTo):'');};
 const addCompatibility=()=>{
  if(!brand)return;const ccs:(number|null)[]=selectedCcs.length?selectedCcs:[null];const types:(NonNullable<ItemVehicleCompatibility['engineType']>|null)[]=selectedEngineTypes.length?selectedEngineTypes:[null];
  const additions=ccs.flatMap(engineCc=>types.map(engineType=>({brandId:brand.id,brandName:brand.name,modelId:model?.id,modelName:model?.name,generationId:generation?.id,generationName:generation?.name,yearFrom:Number(yearFrom)||null,yearTo:Number(yearTo)||null,engineCc,engineType,engineCode:engineCode.trim()||null,variant:variant.trim()||null,transmission:(transmission||null) as ItemVehicleCompatibility['transmission'],hvacType:(hvacType||null) as ItemVehicleCompatibility['hvacType'],fitmentStatus,source:source.trim()||null,notes:notes.trim()||null})));
  const known=new Set(value.map(compatibilityKey));onChange([...value,...additions.filter(row=>!known.has(compatibilityKey(row)))]);
  setSelectedCcs([]);setSelectedEngineTypes([]);setEngineCode('');setVariant('');setTransmission('');setHvacType('');setSource('');setNotes('');
 };
 return <div className="space-y-4">
  <div className="grid gap-3 sm:grid-cols-3">
   <label className="text-xs font-medium text-slate-600">Merek<select value={brandId} onChange={e=>{setBrandId(e.target.value);setModelId('');resetGenerationDerivedState();}} className="mt-1 h-10 w-full rounded border px-2"><option value="">Pilih merek</option>{activeBrands.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
   <label className="text-xs font-medium text-slate-600">Tipe / Model Mobil<select value={modelId} disabled={!brand} onChange={e=>{setModelId(e.target.value);resetGenerationDerivedState();}} className="mt-1 h-10 w-full rounded border px-2 disabled:bg-slate-100"><option value="">Semua model</option>{models.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
   <label className="text-xs font-medium text-slate-600">Generasi / Kode Bodi<select value={generationId} disabled={!model} onChange={e=>selectGeneration(e.target.value)} className="mt-1 h-10 w-full rounded border px-2 disabled:bg-slate-100"><option value="">Semua generasi</option>{generations.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
  </div>
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
   <label className="text-xs font-medium text-slate-600">Tahun Mulai<input type="number" value={yearFrom} onChange={e=>setYearFrom(e.target.value)} className="mt-1 h-10 w-full rounded border px-3"/></label>
   <label className="text-xs font-medium text-slate-600">Tahun Akhir<input type="number" value={yearTo} onChange={e=>setYearTo(e.target.value)} className="mt-1 h-10 w-full rounded border px-3"/></label>
   <label className="text-xs font-medium text-slate-600">Kode Mesin<input value={engineCode} onChange={e=>setEngineCode(e.target.value.toUpperCase())} placeholder="Contoh L15A" className="mt-1 h-10 w-full rounded border px-3"/></label>
   <label className="text-xs font-medium text-slate-600">Varian<input value={variant} onChange={e=>setVariant(e.target.value.toUpperCase())} placeholder="A, S, RS atau semua" className="mt-1 h-10 w-full rounded border px-3"/></label>
  </div>
  <fieldset><legend className="mb-1 text-xs font-medium text-slate-600">Kapasitas Mesin</legend><div className="flex flex-wrap gap-2"><button type="button" onClick={()=>setSelectedCcs([])} className={`rounded border px-3 py-1.5 text-xs ${!selectedCcs.length?'border-blue-500 bg-blue-50 text-blue-700':''}`}>Semua CC</button>{availableCcs.map(cc=><label key={cc} className="flex items-center gap-1 rounded border px-3 py-1.5 text-xs"><input type="checkbox" checked={selectedCcs.includes(cc)} onChange={()=>toggleCc(cc)}/>{cc}</label>)}</div></fieldset>
  <fieldset><legend className="mb-1 text-xs font-medium text-slate-600">Jenis Mesin</legend><div className="flex flex-wrap gap-2"><button type="button" onClick={()=>setSelectedEngineTypes([])} className={`rounded border px-3 py-1.5 text-xs ${!selectedEngineTypes.length?'border-blue-500 bg-blue-50 text-blue-700':''}`}>Semua Mesin</button>{engineTypes.map(type=><label key={type} className="flex items-center gap-1 rounded border px-3 py-1.5 text-xs"><input type="checkbox" checked={selectedEngineTypes.includes(type)} onChange={()=>toggleEngineType(type)}/>{type}</label>)}</div></fieldset>
  <div className="grid gap-3 sm:grid-cols-3">
   <label className="text-xs font-medium text-slate-600">Transmisi<select value={transmission} onChange={e=>setTransmission(e.target.value)} className="mt-1 h-10 w-full rounded border px-2"><option value="">Semua</option>{transmissions.map(row=><option key={row}>{row}</option>)}</select></label>
   <label className="text-xs font-medium text-slate-600">Sistem AC<select value={hvacType} onChange={e=>setHvacType(e.target.value)} className="mt-1 h-10 w-full rounded border px-2"><option value="">Semua</option>{hvacTypes.map(row=><option key={row}>{row}</option>)}</select></label>
   <label className="text-xs font-medium text-slate-600">Status Verifikasi<select value={fitmentStatus} onChange={e=>setFitmentStatus(e.target.value as NonNullable<ItemVehicleCompatibility['fitmentStatus']>)} className="mt-1 h-10 w-full rounded border px-2">{allowedStatuses.map(row=><option key={row} value={row}>{row==='Verified'?'Terverifikasi':row==='Rejected'?'Tidak Cocok':'Perlu Verifikasi'}</option>)}</select></label>
  </div>
  <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-slate-600">Sumber Data<input value={source} onChange={e=>setSource(e.target.value)} placeholder="OEM, supplier, atau hasil pemasangan" className="mt-1 h-10 w-full rounded border px-3"/></label><label className="text-xs font-medium text-slate-600">Catatan<input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Soket, dudukan, arah putaran…" className="mt-1 h-10 w-full rounded border px-3"/></label></div>
  <button type="button" disabled={!brand} onClick={addCompatibility} className="inline-flex h-10 items-center gap-2 rounded bg-emerald-600 px-4 text-sm font-semibold text-white disabled:bg-slate-300"><Plus className="h-4 w-4"/>Tambahkan Kecocokan</button>
  <div className="space-y-2">{value.map((row,index)=><div key={`${compatibilityKey(row)}:${index}`} className={`flex items-start justify-between gap-2 rounded border px-3 py-2 text-xs ${row.fitmentStatus==='Rejected'?'border-red-200 bg-red-50 text-red-900':row.fitmentStatus==='Verified'?'border-emerald-200 bg-emerald-50 text-emerald-900':'border-amber-200 bg-amber-50 text-amber-900'}`}><div><p>{formatVehicleCompatibility(row)}</p>{row.source&&<p className="mt-1 opacity-75">Sumber: {row.source}</p>}{row.notes&&<p className="opacity-75">{row.notes}</p>}</div>{(canVerifyFitment||row.fitmentStatus==='Pending')&&<button type="button" onClick={()=>onChange(value.filter((_,i)=>i!==index))} title="Hapus kecocokan"><X className="h-4 w-4"/></button>}</div>)}{!value.length&&<p className="rounded border border-dashed px-3 py-4 text-center text-xs text-slate-500">Belum ada kecocokan kendaraan.</p>}</div>
 </div>;
}
