import type { GoodsReceiptItem } from '../types';

export type GoodsReceiptAcknowledgement = {
  receiptNumber: string;
  date: string;
  status: string;
  branchName: string;
  warehouseName: string;
  receivedBy: string;
  sourceName: string;
  deliveryMethod: string;
  doNumber: string;
  notes: string;
  items: GoodsReceiptItem[];
};

const dateLabel=(value:string)=>{
  const [year,month,day]=value.split('-');
  return year&&month&&day?`${day}/${month}/${year}`:value;
};

const escapeHtml=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;',
}[char]||char));

const fileName=(number:string)=>`Tanda-Terima-${number.replace(/[^a-z0-9-]+/gi,'-')}.png`;

const wrapText=(context:CanvasRenderingContext2D,text:string,maxWidth:number)=>{
  const paragraphs=(text||'-').split(/\r?\n/);const lines:string[]=[];
  for(const paragraph of paragraphs){
    const words=paragraph.split(/\s+/).filter(Boolean);let current='';
    if(!words.length){lines.push('');continue}
    for(const word of words){const candidate=current?`${current} ${word}`:word;if(context.measureText(candidate).width<=maxWidth||!current)current=candidate;else{lines.push(current);current=word}}
    if(current)lines.push(current);
  }
  return lines;
};

export function renderGoodsReceiptImage(payload:GoodsReceiptAcknowledgement){
  const width=1080,pad=64,contentWidth=width-pad*2;
  const measure=document.createElement('canvas').getContext('2d');
  if(!measure)throw new Error('Perangkat tidak mendukung pembuatan gambar.');
  measure.font='30px Arial';
  const itemLines=payload.items.map(item=>wrapText(measure,item.itemName,610));
  measure.font='27px Arial';
  const noteLines=wrapText(measure,payload.notes||'-',contentWidth-40);
  const rowsHeight=itemLines.reduce((sum,lines)=>sum+Math.max(82,lines.length*36+40),0);
  const height=690+rowsHeight+Math.max(80,noteLines.length*34+50)+190;
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d');if(!context)throw new Error('Gagal menyiapkan gambar tanda terima.');
  context.fillStyle='#ffffff';context.fillRect(0,0,width,height);
  context.fillStyle='#123665';context.fillRect(0,0,width,190);
  context.fillStyle='#ffffff';context.textAlign='center';context.font='700 34px Arial';context.fillText('DOKTER AC MOBIL',width/2,48);
  context.font='700 48px Arial';context.fillText('TANDA TERIMA BARANG',width/2,105);
  context.font='25px Arial';context.fillText(payload.branchName||'Management System',width/2,148);
  context.fillStyle='#dbeafe';context.fillRect(width/2-90,158,180,5);

  let y=226;context.textAlign='left';
  const meta=(label:string,value:string,x:number,rowY:number)=>{context.fillStyle='#64748b';context.font='24px Arial';context.fillText(label,x,rowY);context.fillStyle='#0f172a';context.font='700 27px Arial';context.fillText(value||'-',x,rowY+31)};
  meta('Nomor',payload.receiptNumber,pad,y);meta('Tanggal',dateLabel(payload.date),560,y);y+=78;
  meta('Gudang',payload.warehouseName,pad,y);meta('Diterima oleh',payload.receivedBy,560,y);y+=78;
  meta('Sumber / Supplier',payload.sourceName,pad,y);meta('Pengiriman',payload.deliveryMethod,560,y);y+=78;
  meta('No. Surat Jalan',payload.doNumber||'-',pad,y);meta('Status',payload.status,560,y);y+=70;

  const itemCount=payload.items.length,totalQty=payload.items.reduce((sum,item)=>sum+Number(item.qty||0),0);
  context.fillStyle='#eff6ff';context.fillRect(pad,y,contentWidth,58);context.fillStyle='#1e3a8a';context.font='700 26px Arial';context.fillText(`${itemCount} item · ${totalQty} unit`,pad+20,y+37);y+=78;
  context.fillStyle='#60778e';context.fillRect(pad,y,contentWidth,56);context.fillStyle='#fff';context.font='700 24px Arial';
  context.fillText('No.',pad+18,y+36);context.fillText('Kode / Nama Barang',pad+90,y+36);context.textAlign='right';context.fillText('Jumlah',width-pad-20,y+36);context.textAlign='left';y+=56;
  payload.items.forEach((item,index)=>{
    const lines=itemLines[index],rowHeight=Math.max(82,lines.length*36+40);
    if(index%2) {context.fillStyle='#f8fafc';context.fillRect(pad,y,contentWidth,rowHeight)}
    context.fillStyle='#334155';context.font='25px Arial';context.fillText(String(index+1),pad+22,y+34);
    context.fillStyle='#0284c7';context.font='700 23px monospace';context.fillText(item.itemCode||'-',pad+90,y+31);
    context.fillStyle='#0f172a';context.font='29px Arial';lines.forEach((line,lineIndex)=>context.fillText(line,pad+90,y+67+lineIndex*36));
    context.textAlign='right';context.font='700 29px Arial';context.fillText(`${item.qty} ${item.unit}`,width-pad-20,y+48);context.textAlign='left';
    context.strokeStyle='#cbd5e1';context.beginPath();context.moveTo(pad,y+rowHeight);context.lineTo(width-pad,y+rowHeight);context.stroke();y+=rowHeight;
  });
  y+=26;context.fillStyle='#64748b';context.font='24px Arial';context.fillText('Keterangan',pad,y);y+=18;
  const noteHeight=Math.max(80,noteLines.length*34+50);context.fillStyle='#f8fafc';context.fillRect(pad,y,contentWidth,noteHeight);context.fillStyle='#334155';context.font='27px Arial';noteLines.forEach((line,index)=>context.fillText(line,pad+20,y+32+index*34));y+=noteHeight+38;
  context.fillStyle='#64748b';context.font='23px Arial';context.textAlign='center';context.fillText('Diserahkan oleh',270,y);context.fillText('Diterima oleh',810,y);
  context.strokeStyle='#94a3b8';context.beginPath();context.moveTo(130,y+95);context.lineTo(410,y+95);context.moveTo(670,y+95);context.lineTo(950,y+95);context.stroke();
  context.fillStyle='#0f172a';context.font='700 24px Arial';context.fillText('(                                      )',270,y+126);context.fillText(`( ${payload.receivedBy||'                                      '} )`,810,y+126);
  context.fillStyle='#94a3b8';context.font='20px Arial';context.fillText('Dokumen dibuat dari sistem DOKTER AC MOBIL',width/2,height-28);
  return canvas;
}

export function canvasToPngBlob(canvas:HTMLCanvasElement){
  return new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Gagal membuat file gambar.')),'image/png'));
}

export function downloadGoodsReceiptImage(blob:Blob,receiptNumber:string){
  const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=fileName(receiptNumber);document.body.appendChild(anchor);anchor.click();anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export async function shareGoodsReceiptImage(blob:Blob,payload:GoodsReceiptAcknowledgement){
  const imageFile=new File([blob],fileName(payload.receiptNumber),{type:'image/png'});
  const shareData={title:`Tanda Terima ${payload.receiptNumber}`,text:`Tanda terima barang ${payload.receiptNumber} · ${dateLabel(payload.date)} · ${payload.warehouseName}`,files:[imageFile]};
  if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[imageFile]}))){await navigator.share(shareData);return true}
  return false;
}

export function buildGoodsReceiptPrintHtml(payload:GoodsReceiptAcknowledgement){
  const rows=payload.items.map((item,index)=>`<tr><td>${index+1}</td><td><b>${escapeHtml(item.itemCode)}</b><br>${escapeHtml(item.itemName)}</td><td class="qty">${escapeHtml(item.qty)} ${escapeHtml(item.unit)}</td></tr>`).join('');
  const totalQty=payload.items.reduce((sum,item)=>sum+Number(item.qty||0),0);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(payload.receiptNumber)}</title><style>@page{size:80mm auto;margin:3mm}*{box-sizing:border-box}body{width:72mm;margin:0 auto;color:#111;font-family:Arial,sans-serif;font-size:10px}.head{text-align:center;border-bottom:1px dashed #111;padding-bottom:7px}.head h1{font-size:16px;margin:3px 0}.head b{font-size:12px}.meta{padding:7px 0;border-bottom:1px dashed #111}.line{display:grid;grid-template-columns:25mm 1fr;gap:2mm;margin:3px 0}.line span:first-child{color:#555}table{width:100%;border-collapse:collapse;margin-top:7px}th,td{padding:4px 2px;border-bottom:1px dashed #999;text-align:left;vertical-align:top}th:first-child,td:first-child{width:7mm}.qty{width:18mm;text-align:right;white-space:nowrap}.summary{font-weight:bold;text-align:right;padding:6px 0}.notes{min-height:12mm;border-top:1px dashed #111;padding:6px 0}.sign{display:grid;grid-template-columns:1fr 1fr;gap:7mm;text-align:center;margin-top:8px}.space{height:20mm;border-bottom:1px solid #111}.foot{text-align:center;color:#555;font-size:8px;margin-top:8px}@media print{body{width:72mm}}</style></head><body><div class="head"><b>DOKTER AC MOBIL</b><h1>TANDA TERIMA BARANG</h1><div>${escapeHtml(payload.branchName)}</div></div><div class="meta"><div class="line"><span>Nomor</span><b>${escapeHtml(payload.receiptNumber)}</b></div><div class="line"><span>Tanggal</span><b>${escapeHtml(dateLabel(payload.date))}</b></div><div class="line"><span>Gudang</span><b>${escapeHtml(payload.warehouseName)}</b></div><div class="line"><span>Diterima oleh</span><b>${escapeHtml(payload.receivedBy)}</b></div><div class="line"><span>Sumber/Supplier</span><b>${escapeHtml(payload.sourceName)}</b></div><div class="line"><span>Pengiriman</span><b>${escapeHtml(payload.deliveryMethod)}</b></div><div class="line"><span>No. Surat Jalan</span><b>${escapeHtml(payload.doNumber||'-')}</b></div></div><table><thead><tr><th>No</th><th>Barang</th><th class="qty">Jumlah</th></tr></thead><tbody>${rows}</tbody></table><div class="summary">${payload.items.length} item · ${totalQty} unit</div><div class="notes"><b>Keterangan:</b><br>${escapeHtml(payload.notes||'-')}</div><div class="sign"><div>Diserahkan<div class="space"></div>(................)</div><div>Diterima<div class="space"></div>(${escapeHtml(payload.receivedBy||'................')})</div></div><div class="foot">Dicetak ${escapeHtml(new Date().toLocaleString('id-ID'))}<br>DOKTER AC MOBIL Management System</div><script>window.onload=()=>{window.focus();window.print()}<\/script></body></html>`;
}
