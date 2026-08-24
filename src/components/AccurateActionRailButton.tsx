import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

type AccurateActionRailTone='primary'|'document'|'success'|'danger';

const toneClass:Record<AccurateActionRailTone,string>={
 primary:'border-[#06457f] bg-[#07579f] text-white hover:bg-[#064b8b]',
 document:'border-[#1680e5] bg-[#abd3f7] text-[#00518b] hover:bg-[#9bcaf4]',
 success:'border-[#21a642] bg-[#8be4a0] text-[#08752a] hover:bg-[#7cdb92]',
 danger:'border-[#ff6b72] bg-[#ffb8bc] text-[#f12d59] hover:bg-[#ffa8ad]',
};

export default function AccurateActionRailButton({title,icon,tone='document',disabled=false,showChevron=true,type='button',form,onClick}:{title:string;icon:ReactNode;tone?:AccurateActionRailTone;disabled?:boolean;showChevron?:boolean;type?:ButtonHTMLAttributes<HTMLButtonElement>['type'];form?:string;onClick?:()=>void}){
 return <button type={type} form={form} title={title} disabled={disabled} onClick={onClick} className={`grid h-14 w-[72px] ${showChevron?'grid-cols-[1fr_20px]':'grid-cols-1'} overflow-hidden rounded-md border shadow-md transition-colors disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none ${toneClass[tone]}`}><span className="flex h-full items-center justify-center">{icon}</span>{showChevron&&<span className="flex h-full items-center justify-center border-l border-black/10 bg-black/5"><ChevronDown className="h-4 w-4"/></span>}</button>;
}
