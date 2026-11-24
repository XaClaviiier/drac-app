import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import type { GoodsReceipt } from '../types';
import { buildGoodsReceiptPrintHtml, canvasToPngBlob, downloadGoodsReceiptImage, renderGoodsReceiptImage, shareGoodsReceiptImage } from '../lib/goodsReceiptAcknowledgement';
import { validReceiptShippingCost, buildGoodsReceiptShareText, receiptDeliveryLabel } from '../lib/goodsReceiptSharing';
import ReceiptShareButton from '../components/ReceiptShareButton';
import { receiptDescription, receiptManualNotes } from '../lib/goodsReceiptPresentation';
import AccurateFormActionRail from '../components/AccurateFormActionRail';
import { ReceiptDocumentForm } from './GoodsReceiptEntry';
import type { ReceiptSession } from './GoodsReceiptWorkspace';

type DetailProps = {
 receipt: GoodsReceipt;
 active: boolean;
 renderTabs?: (tools?: ReactNode, busy?: boolean) => ReactNode;
 registerCloseGuard: (id: string, guard: () => boolean) => () => void;
 onDeleted: () => void;
};

export default function GoodsReceiptDetail({receipt, active, renderTabs, registerCloseGuard, onDeleted}: DetailProps){
 const navigate=useNavigate();
 const{data,hasPermission,updateGoodsReceipt,deleteGoodsReceipt,receiveGoods}=useApp();
 const [editing, setEditing] = useState(false);
 const [saving, setSaving] = useState(false);
 const [menu, setMenu] = useState<'document' | 'more' | null>(null);
 const [exporting, setExporting] = useState<'image'|'share'|''>('');
 const canEdit = hasPermission('receipt:edit') && ['Draft','Diterima','Batal'].includes(receipt.status) && !receipt.items.some(line => line.qtyInvoiced > 0);
 const [form,setForm] = useState<ReceiptSession['form']>(()=>toForm(receipt));
 useLayoutEffect(() => registerCloseGuard(receipt.id, () => {
   if (saving) return false;
   if (!editing || JSON.stringify(form) === JSON.stringify(toForm(receipt))) return true;
   return window.confirm('Buang perubahan yang belum disimpan pada ' + receipt.receiptNumber + '?');
 }), [registerCloseGuard, receipt, editing, form, saving]);
 useEffect(()=>{if(!editing)setForm(toForm(receipt))},[receipt,editing]);
 const save = async () => {
   if (saving || !canEdit) return;
   if (!form.warehouseId || !form.receivedById) return alert('Gudang dan petugas penerima wajib dipilih.');
   if (!form.items.length) return alert('Tambahkan minimal satu barang.');
   if (!form.deliveryMethod) return alert('Pilih pengiriman.');
   if (form.deliveryMethod === 'Lainnya' && !form.deliveryOther.trim()) return alert('Tuliskan cara pengiriman lainnya.');
   const keepUnrecordedCost = receipt.shippingCost == null && form.shippingCost === null;
   if (!keepUnrecordedCost && !validReceiptShippingCost(form.shippingCost)) return alert('Isi biaya kirim dalam Rupiah bulat, minimal 0 dan maksimal 999.999.999.999.');
   const receiver = data.users.find(user => user.id === form.receivedById);
   setSaving(true);
   try {
     await updateGoodsReceipt(receipt.id, { ...receipt, ...form, receivedBy: receiver?.name || receipt.receivedBy });
     setEditing(false);
   } catch (error) {
     alert(error instanceof Error ? error.message : 'Gagal memperbarui penerimaan.');
   } finally {
     setSaving(false);
   }
 };
 const remove=async()=>{if(!confirm(`Hapus penerimaan ${receipt.receiptNumber}? Stok terkait akan dikoreksi otomatis.`))return;try{await deleteGoodsReceipt(receipt.id);onDeleted()}catch(error:any){alert(error?.message||'Penerimaan tidak dapat dihapus.')}};
 const accept=async()=>{if(!confirm(`Terima barang ${receipt.receiptNumber}? Stok akan ditambahkan.`))return;try{await receiveGoods(receipt.id)}catch(error:any){alert(error?.message||'Gagal menerima barang.')}};
 const canIssueAcknowledgement=receipt.status!=='Draft'&&receipt.status!=='Batal';
 const acknowledgement={receiptNumber:receipt.receiptNumber,date:receipt.date,status:receipt.status,branchName:data.branches.find(row=>row.id===receipt.branchId)?.name||receipt.branchId,warehouseName:data.warehouses.find(row=>row.id===receipt.warehouseId)?.name||'-',receivedBy:receipt.receivedBy||'-',sourceName:receipt.sourceType==='Transfer Gudang'?(receipt.transferNumber||'Transfer Gudang'):(receipt.supplierName||'Supplier / pengantar'),deliveryMethod:receiptDeliveryLabel(receipt.deliveryMethod,receipt.deliveryOther),shippingCost:receipt.shippingCost,doNumber:receipt.doNumber||'',notes:receiptDescription(receipt),items:receipt.items};
 const saveReceiptImage=async()=>{setMenu(null);setExporting('image');try{const blob=await canvasToPngBlob(renderGoodsReceiptImage(acknowledgement));downloadGoodsReceiptImage(blob,receipt.receiptNumber)}catch(error:any){alert(error?.message||'Gagal menyimpan gambar tanda terima.')}finally{setExporting('')}};
 const shareReceipt=async()=>{setMenu(null);setExporting('share');try{const blob=await canvasToPngBlob(renderGoodsReceiptImage(acknowledgement));const shared=await shareGoodsReceiptImage(blob,acknowledgement);if(!shared){downloadGoodsReceiptImage(blob,receipt.receiptNumber);alert('Menu berbagi gambar tidak tersedia di perangkat ini. Gambar sudah disimpan dan dapat dikirim lewat WhatsApp.')}}catch(error:any){if(error?.name!=='AbortError')alert(error?.message||'Gagal membagikan tanda terima.')}finally{setExporting('')}};
 const printBluetooth=()=>{setMenu(null);const popup=window.open('','_blank','width=420,height=760');if(!popup)return alert('Izinkan pop-up untuk membuka menu print Bluetooth.');popup.document.write(buildGoodsReceiptPrintHtml(acknowledgement));popup.document.close()};
 const closeMenu = () => setMenu(null);
 const primaryAction = () => { closeMenu(); if (editing) void save(); else if (canEdit) setEditing(true); };
 const cancel = () => { setForm(toForm(receipt)); setEditing(false); closeMenu(); };
 const showDocuments = () => setMenu(current => current === 'document' ? null : 'document');
 const showMore = () => setMenu(current => current === 'more' ? null : 'more');
 const canReceive = !editing && receipt.status === 'Draft' && hasPermission('receipt:edit');
 const canInvoice = !editing && receipt.status === 'Diterima' && receipt.sourceType !== 'Transfer Gudang' && hasPermission('purchase:view');
 const canDelete = !editing && hasPermission('receipt:delete');
 const moreDisabled = saving || !(editing || canReceive || canInvoice || canDelete);
 const documentDisabled = editing || !canIssueAcknowledgement || Boolean(exporting);
 const menuButton = 'block w-full rounded px-3 py-2 text-left text-sm hover:bg-blue-50';
 const desktopActions = <AccurateFormActionRail className="absolute right-4 top-3 z-20"
   save={{title: editing ? 'Simpan perubahan' : 'Edit Penerimaan', disabled: saving || !canEdit, onClick: primaryAction, icon: editing ? undefined : <Pencil size={24}/>}}
   print={{title: 'Simpan, bagikan, atau print tanda terima', disabled: documentDisabled, onClick: showDocuments}}
   more={{disabled: moreDisabled, onClick: showMore}} remove={{disabled: saving || !canDelete, onClick: remove}}/>;
 const mobileActions = <>
   {menu && <>
     <button type="button" aria-label="Tutup menu aksi" onClick={closeMenu} className="fixed inset-0 z-30 cursor-default"/>
     <div className={'fixed bottom-[calc(140px+env(safe-area-inset-bottom))] right-3 z-40 w-60 rounded border bg-white p-1 shadow-xl lg:absolute lg:bottom-auto lg:right-[92px] ' + (menu === 'document' ? 'lg:top-[68px]' : 'lg:top-[202px]')}>
       {menu === 'document' && !documentDisabled && <>
         <ReceiptShareButton text={buildGoodsReceiptShareText(receipt,{warehouseName:acknowledgement.warehouseName})} className="w-full"/>
         <button className={menuButton} onClick={saveReceiptImage}>Simpan Gambar</button>
         <button className={menuButton} onClick={shareReceipt}>Bagikan Gambar</button>
         <button className={menuButton} onClick={printBluetooth}>Print Bluetooth 80 mm</button>
       </>}
       {menu === 'more' && <>
         {editing && <button className={menuButton} onClick={cancel}>Batalkan edit</button>}
         {canReceive && <button className={menuButton} onClick={()=>{closeMenu();void accept()}}>Terima Barang</button>}
         {canInvoice && <button className={menuButton} onClick={()=>{closeMenu();navigate('/purchase-invoices')}}>Faktur Pembelian</button>}
         {canDelete && <button className={menuButton+' text-red-700'} onClick={()=>{closeMenu();void remove()}}>Hapus penerimaan</button>}
       </>}
     </div>
   </>}
   <nav aria-label="Aksi penerimaan barang" className="goods-receipt-mobile-actions fixed inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-20 mx-auto grid max-w-md grid-cols-[1fr_auto_auto] gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-2xl lg:hidden">
     <button disabled={saving || !canEdit} onClick={primaryAction} className="h-12 rounded-xl bg-[#0874c9] px-4 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Menyimpan...' : editing ? 'Simpan' : 'Edit'}</button>
     <button disabled={documentDisabled} onClick={showDocuments} className="h-12 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-700 disabled:opacity-50">Dokumen</button>
     <button aria-label="Pilihan lainnya" disabled={moreDisabled} onClick={showMore} className="h-12 w-12 rounded-xl border border-emerald-200 bg-emerald-50 text-lg font-bold text-emerald-700 disabled:opacity-50">•••</button>
   </nav>
 </>;
 return <ReceiptDocumentForm active={active} key={editing ? 'edit' : 'view'} mode={editing && canEdit ? 'edit' : 'view'} receipt={receipt}
     receiptNumber={receipt.receiptNumber} branchId={receipt.branchId} form={form} setForm={setForm}
     saving={saving} renderTabs={renderTabs ?? (() => null)} desktopActions={desktopActions} mobileActions={mobileActions}/>;
}

function toForm(receipt:GoodsReceipt){return{date:receipt.date,doNumber:receipt.doNumber||'',warehouseId:receipt.warehouseId||'',supplierId:receipt.supplierId||'',deliveryMethod:receipt.deliveryMethod==='Diantar Supplier'?'Supplier':receipt.deliveryMethod||'',shippingCost:receipt.shippingCost??null,deliveryOther:receipt.deliveryOther||'',shippingNotes:receipt.shippingNotes||'',notes:receiptManualNotes(receipt.notes),receivedById:receipt.receivedById||'',items:receipt.items.map(item=>({...item}))}}
