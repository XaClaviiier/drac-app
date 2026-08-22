import { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';

type Props = {
 value:string;
 onChange:(value:string)=>void;
 disabled?:boolean;
 required?:boolean;
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

export default function IndonesianDateInput({value,onChange,disabled=false,required=false,className=''}:Props){
 const[display,setDisplay]=useState(()=>toDisplay(value));
 useEffect(()=>setDisplay(toDisplay(value)),[value]);
 const commit=()=>{const parsed=toStorage(display);if(parsed)onChange(parsed);else setDisplay(toDisplay(value))};
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
   aria-label="Tanggal (DD/MM/YYYY)"
   className="h-full w-full rounded border border-slate-300 bg-white px-3 pr-10 disabled:bg-slate-100 disabled:text-slate-600"
  />
  <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600"/>
  {!disabled&&<input
   type="date"
   value={value}
   onChange={event=>onChange(event.target.value)}
   aria-label="Buka kalender"
   className="absolute inset-y-0 right-0 w-10 cursor-pointer opacity-0"
  />}
 </span>;
}
