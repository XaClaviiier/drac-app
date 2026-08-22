export default function ActiveWarehouseHeader({name}:{name:string}){
 return <div className="receipt-active-warehouse ml-auto flex min-w-0 max-w-[120px] items-center gap-1.5 px-2 text-xs text-slate-700 sm:mr-3 sm:max-w-none sm:text-sm"><span className="hidden whitespace-nowrap font-medium sm:inline">Gudang Aktif <span className="text-emerald-600">●</span> :</span><strong className="truncate" title={name||'-'}>{name||'-'}</strong></div>;
}
