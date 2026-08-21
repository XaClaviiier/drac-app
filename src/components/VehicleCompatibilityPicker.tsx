import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { ItemVehicleCompatibility } from '../types';

export type VehicleCatalogGenerationOption = { id:string;name:string;isActive:boolean;engineCcs:number[] };
export type VehicleCatalogModelOption = { id:string;name:string;isActive:boolean;generations:VehicleCatalogGenerationOption[] };
export type VehicleCatalogBrandOption = { id:string;name:string;isActive:boolean;models:VehicleCatalogModelOption[] };

const engineTypes:NonNullable<ItemVehicleCompatibility['engineType']>[]=['Bensin','Diesel','Hybrid','Listrik'];

const compatibilityKey=(row:ItemVehicleCompatibility)=>[row.brandId,row.modelId||'',row.generationId||'',row.engineCc||'',row.engineType||''].join('|');

export const formatVehicleCompatibility=(row:ItemVehicleCompatibility)=>[
 row.brandName||'Semua Merek',
 row.modelName||'Semua Tipe',
 row.generationName||'Semua Generasi',
 row.engineCc?`${row.engineCc.toLocaleString('id-ID')} CC`:'Semua CC',
 row.engineType||'Semua Mesin',
].join(' — ');

type Props={
 catalog:VehicleCatalogBrandOption[];
 value:ItemVehicleCompatibility[];
 onChange:(value:ItemVehicleCompatibility[])=>void;
};

export default function VehicleCompatibilityPicker({catalog,value,onChange}:Props){
 const activeBrands=useMemo(()=>catalog.filter(row=>row.isActive),[catalog]);
 const[brandId,setBrandId]=useState('');
 const[modelId,setModelId]=useState('');
 const[generationId,setGenerationId]=useState('');
 const[selectedCcs,setSelectedCcs]=useState<number[]>([]);
 const[selectedEngineTypes,setSelectedEngineTypes]=useState<NonNullable<ItemVehicleCompatibility['engineType']>[]>([]);
 const brand=activeBrands.find(row=>row.id===brandId);
 const models=(brand?.models||[]).filter(row=>row.isActive);
 const model=models.find(row=>row.id===modelId);
 const generations=(model?.generations||[]).filter(row=>row.isActive);
 const generation=generations.find(row=>row.id===generationId);
 const availableCcs=generation?.engineCcs||[];
 const toggleCc=(cc:number)=>setSelectedCcs(current=>current.includes(cc)?current.filter(row=>row!==cc):[...current,cc]);
 const toggleEngineType=(engineType:NonNullable<ItemVehicleCompatibility['engineType']>)=>setSelectedEngineTypes(current=>current.includes(engineType)?current.filter(row=>row!==engineType):[...current,engineType]);
 const addCompatibility=()=>{
  if(!brand)return;
  const ccs:(number|null)[]=selectedCcs.length?selectedCcs:[null];
  const types:(NonNullable<ItemVehicleCompatibility['engineType']>|null)[]=selectedEngineTypes.length?selectedEngineTypes:[null];
  const additions=ccs.flatMap(engineCc=>types.map(engineType=>({brandId:brand.id,brandName:brand.name,modelId:model?.id,modelName:model?.name,generationId:generation?.id,generationName:generation?.name,engineCc,engineType})));
  const known=new Set(value.map(compatibilityKey));
  onChange([...value,...additions.filter(row=>!known.has(compatibilityKey(row)))]);
  setSelectedCcs([]);setSelectedEngineTypes([]);
 };
 return <div className="space-y-3">
  <div className="grid gap-2 sm:grid-cols-3">
   <label className="text-xs font-medium text-slate-600">Merek<select value={brandId} onChange={event=>{setBrandId(event.target.value);setModelId('');setGenerationId('');setSelectedCcs([])}} className="mt-1 h-11 w-full rounded border border-slate-300 bg-white px-2 text-sm sm:h-9"><option value="">Pilih merek</option>{activeBrands.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
   <label className="text-xs font-medium text-slate-600">Tipe / Model<select value={modelId} disabled={!brand||!models.length} onChange={event=>{setModelId(event.target.value);setGenerationId('');setSelectedCcs([])}} className="mt-1 h-11 w-full rounded border border-slate-300 bg-white px-2 text-sm disabled:bg-slate-100 sm:h-9"><option value="">Semua tipe</option>{models.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
   <label className="text-xs font-medium text-slate-600">Generasi<select value={generationId} disabled={!model||!generations.length} onChange={event=>{setGenerationId(event.target.value);setSelectedCcs([])}} className="mt-1 h-11 w-full rounded border border-slate-300 bg-white px-2 text-sm disabled:bg-slate-100 sm:h-9"><option value="">Semua generasi</option>{generations.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
  </div>
  <fieldset><legend className="mb-1 text-xs font-medium text-slate-600">Kapasitas Mesin</legend><div className="flex flex-wrap gap-1.5"><button type="button" onClick={()=>setSelectedCcs([])} className={`rounded border px-2.5 py-1.5 text-xs ${!selectedCcs.length?'border-blue-500 bg-blue-50 text-blue-700':'border-slate-300 bg-white'}`}>Semua CC</button>{availableCcs.map(cc=><label key={cc} className={`flex cursor-pointer items-center gap-1 rounded border px-2.5 py-1.5 text-xs ${selectedCcs.includes(cc)?'border-blue-500 bg-blue-50 text-blue-700':'border-slate-300 bg-white'}`}><input type="checkbox" checked={selectedCcs.includes(cc)} onChange={()=>toggleCc(cc)} className="h-3.5 w-3.5"/>{cc}</label>)}</div>{generation&&!availableCcs.length&&<p className="mt-1 text-xs text-amber-700">CC belum tersedia pada master generasi; pilihan akan disimpan sebagai Semua CC.</p>}</fieldset>
  <fieldset><legend className="mb-1 text-xs font-medium text-slate-600">Jenis Mesin</legend><div className="flex flex-wrap gap-1.5"><button type="button" onClick={()=>setSelectedEngineTypes([])} className={`rounded border px-2.5 py-1.5 text-xs ${!selectedEngineTypes.length?'border-blue-500 bg-blue-50 text-blue-700':'border-slate-300 bg-white'}`}>Semua Mesin</button>{engineTypes.map(engineType=><label key={engineType} className={`flex cursor-pointer items-center gap-1 rounded border px-2.5 py-1.5 text-xs ${selectedEngineTypes.includes(engineType)?'border-blue-500 bg-blue-50 text-blue-700':'border-slate-300 bg-white'}`}><input type="checkbox" checked={selectedEngineTypes.includes(engineType)} onChange={()=>toggleEngineType(engineType)} className="h-3.5 w-3.5"/>{engineType}</label>)}</div></fieldset>
  <button type="button" disabled={!brand} onClick={addCompatibility} className="inline-flex h-9 items-center gap-2 rounded bg-emerald-600 px-4 text-sm font-semibold text-white disabled:bg-slate-300"><Plus className="h-4 w-4"/>Tambahkan Kecocokan</button>
  <div className="space-y-1.5">{value.map((row,index)=><div key={`${compatibilityKey(row)}:${index}`} className="flex items-start justify-between gap-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900"><span>{formatVehicleCompatibility(row)}</span><button type="button" onClick={()=>onChange(value.filter((_,rowIndex)=>rowIndex!==index))} title="Hapus kecocokan" className="shrink-0 text-slate-500 hover:text-red-600"><X className="h-4 w-4"/></button></div>)}{!value.length&&<p className="rounded border border-dashed border-slate-300 px-3 py-3 text-center text-xs text-slate-500">Belum ada kecocokan. Pilih Universal jika barang berlaku untuk semua mobil.</p>}</div>
 </div>;
}
