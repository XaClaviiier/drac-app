import { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';

type Props = {
 value:string;
 onChange:(value:string)=>void;
 disabled?:boolean;
 required?:boolean;
 min?:string;
 max?:string;
 title?:string;
 ariaLabel?:string;
 className?:string;
};

const toDisplay=(value:string)=>{
 const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
 return match?`${match[3]}/${match[2]}/${match[1]}`:value;
};

const toStorage=(value:string)=>{
 const match=/^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(value.trim());
 if(!match)return '';
 const day=Number(match[1]),month=Number(match[2]),year=Number(match[3]);
 const date=new Date(year,month-1,day);
 if(date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day)return '';
 return `${match[3]}-${match[2]}-${match[1]}`;
};

export default function IndonesianDateInput({value,onChange,disabled=false,required=false,min,max,title,ariaLabel='Tanggal (DD/MM/YYYY)',className=''}:Props){
 const[display,setDisplay]=useState(()=>toDisplay(value));
 const pickerRef=useRef<HTMLInputElement>(null);
 useEffect(()=>setDisplay(toDisplay(value)),[value]);
 const commit=()=>{const parsed=toStorage(display);if(parsed)onChange(parsed);else setDisplay(toDisplay(value))};
 const openPicker=()=>{
  const picker=pickerRef.current;
  if(!picker)return;
  // showPicker harus dipanggil langsung dari klik pengguna. Overlay input transparan
  // tidak konsisten di Chrome lama dan dapat menampilkan kursor tangan tanpa membuka kalender.
  if(typeof picker.showPicker==='function')picker.showPicker();
  else{picker.focus();picker.click()}
 };
 return <span className={`relative block w-full ${className}`}>
  <input
   type="text"
   inputMode="numeric"
   disabled={disabled}
   required={required}
   value={display}
   onChange={event=>setDisplay(event.target.value)}
   onBlur={commit}
   onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();commit()}}}
   placeholder="DD/MM/YYYY"
   aria-label={ariaLabel}
   title={title}
   className="h-full w-full rounded border border-slate-300 bg-white px-3 pr-10 disabled:bg-slate-100 disabled:text-slate-600"
  />
  {!disabled&&<input
   ref={pickerRef}
   type="date"
   value={value}
   min={min}
   max={max}
   onChange={event=>onChange(event.target.value)}
   aria-label="Buka kalender"
   tabIndex={-1}
   className="pointer-events-none absolute bottom-0 right-0 h-px w-px opacity-0"
  />}
  <button
   type="button"
   disabled={disabled}
   onClick={openPicker}
   aria-label="Buka kalender"
   title="Pilih tanggal"
   className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
  ><CalendarDays className="h-4 w-4"/></button>
 </span>;
}
