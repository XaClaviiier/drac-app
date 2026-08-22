import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
const source='C:/Users/axlfo/Downloads/lembar_penghitungan_stok_dokteracmobil_260816162032 gudang perintis 31 juli 26.xlsx';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(source));
const ws=wb.worksheets.getItem('Lembar Penghitungan Stok');
const values=ws.getRange('A1:O238').values;
const rows=[]; const categories=[];
for(let i=0;i<values.length;i++){
 const r=values[i]||[]; const category=String(r[1]??'').trim(); const code=String(r[2]??'').trim(); const name=String(r[4]??'').trim(); const qty=Number(r[7]); const unit=String(r[9]??'').trim();
 if(category && !code && !name && !/DOKTER|Lembar|Per Tgl|Cabang|ACCURATE|Tercetak|Halaman/i.test(category)) categories.push(category);
 if(code && name && Number.isFinite(qty) && !/Kode Barang/i.test(code)) rows.push({row:i+1,code,name,qty,unit,category:categories.at(-1)||''});
}
const byCode=new Map(); for(const r of rows)byCode.set(r.code.toUpperCase(),[...(byCode.get(r.code.toUpperCase())||[]),r]);
const duplicates=[...byCode.entries()].filter(([,a])=>a.length>1);
const badUnits=rows.filter(r=>!r.unit); const zero=rows.filter(r=>r.qty===0); const negative=rows.filter(r=>r.qty<0); const nonInteger=rows.filter(r=>!Number.isInteger(r.qty));
console.log(JSON.stringify({rows:rows.length,totalQty:rows.reduce((s,r)=>s+r.qty,0),categories:[...new Set(categories)],categoryCount:new Set(categories).size,duplicates:duplicates.map(([code,a])=>({code,rows:a.map(x=>x.row),names:a.map(x=>x.name)})),zero:zero.length,negative:negative.length,nonInteger:nonInteger.length,badUnits:badUnits.length,minQty:Math.min(...rows.map(r=>r.qty)),maxQty:Math.max(...rows.map(r=>r.qty)),topQty:[...rows].sort((a,b)=>b.qty-a.qty).slice(0,10),first:rows.slice(0,3),last:rows.slice(-3)},null,2));
