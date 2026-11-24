import { useEffect,useMemo,useRef,useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle,Edit,FileText,List,Plus,RefreshCw,Search,X } from 'lucide-react';
import { api } from '../lib/apiClient';
import { useApp } from '../context/AppContext';
import { localDateKey } from '../lib/date';
import IndonesianDateInput from '../components/IndonesianDateInput';
import DocumentTabBar from '../components/DocumentTabBar';
import { ui } from '../components/ui/interfaceStandards';
import AccurateFormActionRail from '../components/AccurateFormActionRail';
import AccurateDocumentSideTabs from '../components/AccurateDocumentSideTabs';
import './WarehouseTransfersWorkspace.css';
import { InventoryDocumentTable, InventoryListToolbar, matchesInventoryPeriod, useInventoryColumns, useInventoryPeriod } from '../components/InventoryList';
import { transferWorkspacePrefix,readTransferWorkspace,writeTransferWorkspace } from '../lib/transferWorkspaceSession';

type Process='Kirim Barang'|'Terima Barang';
type TransferItem={itemId:string;itemCode:string;itemName:string;categoryName:string;unit:string;qtySent:number;qtyReceived:number};
type Correction={reason:string;userName:string;createdAt:string;snapshot:{before:{item_id:string;item_name:string;qty_sent:number}[];after:{item_id:string;item_name:string;qty_sent:number}[]}};
type Transfer={revision?:number;notes?:string;corrections?:Correction[];id:string;transferNumber:string;date:string;sourceWarehouseId:string;sourceWarehouseName:string;sourceBranchId:string;sourceBranchName:string;destinationWarehouseId:string;destinationBranchId:string;destinationWarehouseName:string;destinationBranchName:string;status:string;cancellationReason?:string|null;items:TransferItem[]};
type WarehouseOption={id:string;name:string;branchName:string};
type SendItem={itemId:string;itemCode:string;itemName:string;categoryName:string;unit:string;qty:number};

type TransferForm={date:string;sourceWarehouseId:string;destinationWarehouseId:string;sentById:string;deliveryMethod:string;notes:string;items:SendItem[]};
type Editor = {
  process: Process; formTab: 'items' | 'info'; form: TransferForm; selectedTransfer: Transfer | null;
  receiveQty: Record<string, number>; correcting: boolean; correctionReason: string; search: string;
};
type TabSession = { active: string; tabs: Editor[] };
type TransferWorkspaceSnapshot = {
  session?: TabSession; listSearch: string; listDate: string; listDateTo?: string; listStatus?: string;
} & Partial<Editor> & {entryOpen?: boolean; view?: 'list' | 'entry'};

const tabId = (editor: Editor) => editor.selectedTransfer ? 'doc:' + editor.selectedTransfer.id : 'new';
const remainingQty = (line: TransferItem) => Math.max(0, line.qtySent - line.qtyReceived);

function createEditor(userId: string, warehouseId: string, transfer: Transfer | null = null): Editor {
  return {
    selectedTransfer: transfer, process: transfer ? 'Terima Barang' : 'Kirim Barang', formTab: 'items',
    correcting: false, correctionReason: '', search: '',
    receiveQty: Object.fromEntries((transfer?.items ?? []).map(line => [line.itemId, remainingQty(line)])),
    form: { date: transfer?.date ?? localDateKey(), sourceWarehouseId: transfer?.sourceWarehouseId ?? warehouseId,
      destinationWarehouseId: transfer?.destinationWarehouseId ?? '', sentById: userId, deliveryMethod: 'Diantar Langsung',
      notes: transfer?.notes ?? '', items: [] },
  };
}

function restoreTabs(saved: TransferWorkspaceSnapshot | null): TabSession {
  if (saved?.session) return saved.session;
  if (!saved?.entryOpen || !saved.form) return {active:'list', tabs:[]};
  const original = createEditor(saved.form.sentById, saved.form.sourceWarehouseId, saved.selectedTransfer);
  const editor: Editor = {...original, form:saved.form, process:saved.process ?? original.process,
    formTab:saved.formTab ?? 'items', receiveQty:saved.receiveQty ?? original.receiveQty, search:saved.search ?? '',
    correcting:saved.correcting ?? false, correctionReason:saved.correctionReason ?? ''};
  return {active: saved.view === 'entry' ? tabId(editor) : 'list', tabs:[editor]};
}

function hasChanges(editor: Editor, userId: string) {
  const {form, selectedTransfer: transfer} = editor;
  if (editor.correcting) return true;
  if (form.sentById !== userId || form.deliveryMethod !== 'Diantar Langsung') return true;
  if (transfer) return form.notes !== (transfer.notes ?? '') || transfer.items.some(line => editor.receiveQty[line.itemId] !== remainingQty(line));
  return Boolean(form.items.length || form.destinationWarehouseId || form.notes || form.date !== localDateKey());
}

// Keep the original revision while a correction is being edited so the server can detect conflicts.
function reconcileTransfer(editor: Editor, fresh: Transfer): Editor {
  const previous = editor.selectedTransfer;
  if (editor.correcting || !previous) return editor;
  const qty = Object.fromEntries(fresh.items.map(line => {
    const before = previous.items.find(item => item.itemId === line.itemId);
    const entered = editor.receiveQty[line.itemId];
    return [line.itemId, before && entered !== undefined && entered !== remainingQty(before)
      ? Math.min(Math.max(0, entered), remainingQty(line)) : remainingQty(line)];
  }));
  return {...editor, selectedTransfer:fresh, receiveQty:qty, form:{...editor.form, date:fresh.date,
    sourceWarehouseId:fresh.sourceWarehouseId, destinationWarehouseId:fresh.destinationWarehouseId,
    notes:editor.form.notes === (previous.notes ?? '') ? fresh.notes ?? '' : editor.form.notes}};
}
const transferLabels = {transferNumber: 'Nomor #', date: 'Tanggal', process: 'Tipe Proses', sourceWarehouseName: 'Dari', destinationWarehouseName: 'Tujuan', status: 'Status', actions: 'Aksi'};
const transferWidths = {transferNumber: 180, date: 110, process: 125, sourceWarehouseName: 170, destinationWarehouseName: 170, status: 135, actions: 145};
const statusLabel=(status:string)=>status==='Draft'?'Draf':status;
const statusClass=(status:string)=>status==='Dibatalkan'?'transfer-status-cancelled':status==='Diterima'?'transfer-status-done':status==='Draft'?'transfer-status-draft':'transfer-status-active';

export default function WarehouseTransfersWorkspace(){
 const{currentUser,currentBranchId}=useApp();
 const workspaceKey=transferWorkspacePrefix+JSON.stringify([currentUser?.id||'guest',currentBranchId]);
 return <WarehouseTransferSession key={workspaceKey} workspaceKey={workspaceKey}/>;
}
function WarehouseTransferSession({workspaceKey}:{workspaceKey:string}){
 const{data,currentBranchId,currentUser,refreshData,hasPermission}=useApp();
 const navigate=useNavigate();
 const [searchParams,setSearchParams]=useSearchParams();
 const requestedTransfer=searchParams.get('view');
 const [transfersLoaded,setTransfersLoaded]=useState(false);
 const[restored]=useState(()=>readTransferWorkspace<TransferWorkspaceSnapshot>(workspaceKey));
 const [session,setSession]=useState<TabSession>(()=>restoreTabs(restored));
 const activeBranchId=(currentBranchId==='ALL'?currentUser?.branchId:currentBranchId)||'';
 const userId=currentUser?.id||'';
 const sourceWarehouses=data.warehouses.filter(w=>w.isActive&&!w.isSystem&&(currentBranchId==='ALL'||w.branchId===activeBranchId));
 const activeWarehouse=sourceWarehouses.find(warehouse=>warehouse.isDefault)||sourceWarehouses[0];
 const[transfers,setTransfers]=useState<Transfer[]>([]),[warehouseOptions,setWarehouseOptions]=useState<WarehouseOption[]>([]);
 const[listSearch,setListSearch]=useState(restored?.listSearch||'');
 const period = useInventoryPeriod(restored?.listDate, restored?.listDateTo);
 const {from: listDate, to: listDateTo} = period;
 const [listStatus, setListStatus] = useState(restored?.listStatus || '');
 const layout = useInventoryColumns('transfer-list:' + (currentUser?.id || 'guest'), transferLabels, transferWidths);
 const[showPicker,setShowPicker]=useState(false),[showTake,setShowTake]=useState(false),[selectedItem,setSelectedItem]=useState<SendItem|TransferItem|null>(null),[detailItemId,setDetailItemId]=useState(''),[quantityItem,setQuantityItem]=useState<(typeof data.items[number])|null>(null),[quantityReadonly,setQuantityReadonly]=useState(false),[quantityTab,setQuantityTab]=useState<'detail'|'info'|'image'>('detail'),[quantity,setQuantity]=useState('1'),[message,setMessage]=useState('');
 const editor=session.tabs.find(tab=>tabId(tab)===session.active);
 const {process,formTab,form,selectedTransfer,receiveQty,correcting,correctionReason,search}=editor ?? createEditor(userId,activeWarehouse?.id||'');
 const view=editor?'entry':'list';
 const changeEditor=(update:(previous:Editor)=>Editor)=>setSession(current=>({...current,
   tabs:current.tabs.map(tab=>tabId(tab)===session.active?update(tab):tab)}));
 const setForm=(next:TransferForm|((previous:TransferForm)=>TransferForm))=>changeEditor(tab=>({...tab,form:typeof next==='function'?next(tab.form):next}));
 const setFormTab=(formTab:Editor['formTab'])=>changeEditor(tab=>({...tab,formTab}));
 const setProcess=(process:Process)=>changeEditor(tab=>({...tab,process}));
 const setCorrectionReason=(correctionReason:string)=>changeEditor(tab=>({...tab,correctionReason}));
 const setReceiveQty=(receiveQty:Editor['receiveQty'])=>changeEditor(tab=>({...tab,receiveQty}));
 const setSearch=(search:string)=>changeEditor(tab=>({...tab,search}));
 const [busy,setBusy]=useState(false);
 const [moreOpen, setMoreOpen] = useState(false);
 const printContent = useRef<HTMLElement>(null);
 const pendingMutation=useRef(false);
 const runMutation=async(action:()=>Promise<void>)=>{
   if(pendingMutation.current)return;
   pendingMutation.current=true;setBusy(true);
   try{await action()}catch{setMessage('Tidak dapat memastikan hasil penyimpanan. Muat ulang daftar sebelum mencoba kembali.')}
   finally{pendingMutation.current=false;setBusy(false)}
 };
 useEffect(()=>{writeTransferWorkspace(workspaceKey,{session,listSearch,listDate,listDateTo,listStatus} satisfies TransferWorkspaceSnapshot)},[workspaceKey,session,listSearch,listDate,listDateTo,listStatus]);
 const role=data.roles.find(value=>value.id===currentUser?.roleId);
 const canCorrect=!!currentUser?.isOwner||((role?.code.toUpperCase()==='ADM'||role?.name.toLowerCase()==='administrator')&&(currentUser?.permissions||role?.permissions||[]).includes('item:edit'));
 const beginCorrection=()=>{if(!selectedTransfer||!canCorrect||selectedTransfer.status!=='Diterima')return;changeEditor(tab=>({...tab,correcting:true,correctionReason:'',process:'Kirim Barang',form:{...tab.form,items:selectedTransfer.items.map(item=>({...item,qty:Number(item.qtySent)}))}}))};
 const saveCorrection=async()=>{
   if(!selectedTransfer)return;
   if(!correctionReason.trim()||!form.items.length)return alert('Isi alasan koreksi dan minimal satu barang.');
   if(selectedTransfer.id==='LOCAL-DUMMY-TRANSFER')return alert('Data dummy hanya untuk melihat tampilan. Gunakan transfer tersimpan untuk menguji stok.');
   const result=await api.update('warehouse-transfers',selectedTransfer.id,{action:'correct',revision:selectedTransfer.revision,
     reason:correctionReason.trim(),items:form.items.map(item=>({itemId:item.itemId,qty:item.qty}))});
   if(!result.success)return alert(result.message||'Koreksi gagal');
   resetDocument(selectedTransfer);
   setMessage('Koreksi transfer disimpan; stok kedua gudang dan riwayat diperbarui.');
   await Promise.all([load(),refreshData()]);
 };
 const latestLoad=useRef(0);
 const load=async()=>{
   const request=++latestLoad.current;
   const result=await api.get<{transfers:Transfer[];warehouses:WarehouseOption[]}>('warehouse-transfers');
   if(request!==latestLoad.current)return [];
   if(!result.success){setMessage(result.message||'Daftar transfer gagal dimuat.');return []}
   const rows=result.data?.transfers||[];
   const byId=new Map(rows.map(row=>[row.id,row]));
   setTransfers(rows);setWarehouseOptions(result.data?.warehouses||[]);setTransfersLoaded(true);
   setSession(current=>{
     const tabs=current.tabs.flatMap(tab=>{
       if(!tab.selectedTransfer)return [tab];
       const fresh=byId.get(tab.selectedTransfer.id);
       if(fresh)return [reconcileTransfer(tab,fresh)];
       return import.meta.env.DEV && !rows.length && tab.selectedTransfer.id==='LOCAL-DUMMY-TRANSFER' ? [tab] : [];
     });
     return {tabs,active:tabs.some(tab=>tabId(tab)===current.active)?current.active:'list'};
   });
   return rows;
 };
 useEffect(()=>{void load()},[]);
 useEffect(()=>{
   const warehouseId=activeWarehouse?.id||'';
   setSession(current=>{
     const draft=current.tabs.find(tab=>!tab.selectedTransfer);
     if(!draft || draft.form.sourceWarehouseId===warehouseId)return current;
     return {...current,tabs:current.tabs.map(tab=>tab===draft?{...tab,form:{...tab.form,sourceWarehouseId:warehouseId}}:tab)};
   });
 },[activeWarehouse?.id]);
 const stock=(warehouseId:string,itemId:string)=>data.warehouseStocks.find(item=>item.warehouseId===warehouseId&&item.itemId===itemId)?.quantity||0;
 const candidates=useMemo(()=>{const q=search.trim().toLowerCase();return data.items.filter(item=>item.type==='Persediaan'&&item.isActive&&(!q||item.code.toLowerCase().includes(q)||item.name.toLowerCase().includes(q)||(item.barcode||'').toLowerCase().includes(q))).slice(0,25)},[data.items,search]);
 const localDummyTransfer=useMemo<Transfer|null>(()=>{if(!import.meta.env.DEV||transfers.length)return null;const source=activeWarehouse||{id:'LOCAL-DUMMY-SOURCE',name:'GUDANG CAKALANG',branchId:activeBranchId||'LOCAL-DUMMY-BRANCH'};const destination=data.warehouses.find(warehouse=>warehouse.isActive&&!warehouse.isSystem&&warehouse.id!==source.id&&/PERINTIS/i.test(warehouse.name))||data.warehouses.find(warehouse=>warehouse.isActive&&!warehouse.isSystem&&warehouse.id!==source.id&&(currentBranchId==='ALL'||warehouse.branchId===activeBranchId))||{id:'LOCAL-DUMMY-DESTINATION',name:'GUDANG PERINTIS',branchId:'LOCAL-DUMMY-DESTINATION-BRANCH'};const item=data.items.find(value=>value.type==='Persediaan'&&value.isActive)||{id:'LOCAL-DUMMY-ITEM',code:'DUMMY-001',name:'Barang Demo',categoryName:'Demo',unit:'PCS'};const sourceBranch=data.branches.find(branch=>branch.id===source.branchId);const destinationBranch=data.branches.find(branch=>branch.id===destination.branchId);return{id:'LOCAL-DUMMY-TRANSFER',transferNumber:'DUMMY-TRF-001',date:localDateKey(),sourceWarehouseId:source.id,sourceWarehouseName:source.name,sourceBranchId:source.branchId,sourceBranchName:sourceBranch?.name||'CABANG CAKALANG',destinationWarehouseId:destination.id,destinationWarehouseName:destination.name,destinationBranchId:destination.branchId,destinationBranchName:destinationBranch?.name||'CABANG PERINTIS',status:'Diterima',items:[{itemId:item.id,itemCode:item.code,itemName:item.name,categoryName:item.categoryName,unit:item.unit,qtySent:2,qtyReceived:2}]};},[activeBranchId,activeWarehouse,currentBranchId,data.branches,data.items,data.warehouses,transfers.length]);
 const displayTransfers=localDummyTransfer?[localDummyTransfer,...transfers]:transfers;
 const pending=transfers.filter(item=>['Dalam Perjalanan','Diterima Sebagian'].includes(item.status)&&item.destinationBranchId===activeBranchId);
 const filtered=displayTransfers.filter(item=>matchesInventoryPeriod(item.date, listDate, listDateTo) && (!listStatus || item.status === listStatus)&&`${item.transferNumber} ${item.sourceWarehouseName} ${item.destinationWarehouseName} ${item.status}`.toLowerCase().includes(listSearch.trim().toLowerCase()));
 const clearPopups=()=>{
   setMoreOpen(false);
   setShowPicker(false);setShowTake(false);setSelectedItem(null);setQuantityItem(null);setDetailItemId('');
 };
 const activate=(id:string)=>{clearPopups();setSession(current=>({...current,active:id}))};
 const openEditor=(next:Editor)=>{
   const id=tabId(next);
   clearPopups();
   setSession(current=>({active:id,tabs:current.tabs.some(tab=>tabId(tab)===id)?current.tabs:[...current.tabs,next]}));
 };
 const newTransfer=()=>openEditor(createEditor(userId,activeWarehouse?.id||''));
 const chooseTransfer=(transfer:Transfer)=>openEditor(createEditor(userId,transfer.sourceWarehouseId,transfer));
 const resetDocument=(transfer:Transfer)=>changeEditor(()=>createEditor(userId,transfer.sourceWarehouseId,transfer));
 const closeTab=(tab:Editor)=>{
   const id=tabId(tab);
   if(hasChanges(tab,userId) && !window.confirm('Buang isian yang belum disimpan pada '+(tab.selectedTransfer?.transferNumber||'Data Baru')+'?'))return;
   if(id===session.active)clearPopups();
   setSession(current=>{
     const index=current.tabs.findIndex(value=>tabId(value)===id);
     const tabs=current.tabs.filter(value=>tabId(value)!==id);
     const adjacent=tabs[Math.min(index,tabs.length-1)];
     return {tabs,active:current.active===id?(adjacent?tabId(adjacent):'list'):current.active};
   });
 };
 useEffect(()=>{
  if(!requestedTransfer||!transfersLoaded||busy)return;
  const transfer=transfers.find(row=>row.id===requestedTransfer||row.transferNumber===requestedTransfer);
  if(transfer){chooseTransfer(transfer);setMessage('');}
  else{activate('list');setMessage('Transfer sumber tidak ditemukan atau sudah tidak dapat diakses.');}
  setSearchParams(params=>{const next=new URLSearchParams(params);next.delete('view');return next;},{replace:true});
 },[requestedTransfer,transfersLoaded,transfers,setSearchParams,busy]);
 const addItem=(item:typeof data.items[number])=>{if(form.items.some(row=>row.itemId===item.id)){setShowPicker(false);setSearch('');return}setQuantityItem(item);setDetailItemId('');setQuantityReadonly(false);setQuantityTab('detail');setQuantity('1');setShowPicker(false)};
 const openItemDetail=(item:SendItem|TransferItem)=>{const master=data.items.find(value=>value.id===item.itemId);if(!master){setSelectedItem(item);return}setSelectedItem(null);setQuantityItem(master);setDetailItemId(item.itemId);setQuantityReadonly(process!=='Kirim Barang');setQuantityTab('detail');setQuantity('qty' in item?String(item.qty):String(item.qtySent))};
 const confirmQuantity=()=>{if(!quantityItem||quantityReadonly)return;const qty=Number(quantity);if(!Number.isSafeInteger(qty)||qty<1){alert('Jumlah harus bilangan bulat minimal 1.');return}setForm(current=>({...current,items:detailItemId?current.items.map(item=>item.itemId===detailItemId?{...item,qty}:item):[...current.items,{itemId:quantityItem.id,itemCode:quantityItem.code,itemName:quantityItem.name,categoryName:quantityItem.categoryName,unit:quantityItem.unit,qty}]}));setQuantityItem(null);setSearch('')};
 const removeDetailItem=()=>{if(!detailItemId||process!=='Kirim Barang')return;setForm(current=>({...current,items:current.items.filter(item=>item.itemId!==detailItemId)}));setDetailItemId('');setQuantityItem(null);};
 const send=async(action:'draft'|'send')=>{if(!form.sourceWarehouseId||!form.destinationWarehouseId||!form.items.length)return alert('Lengkapi gudang dan rincian barang.');const sender=data.users.find(item=>item.id===form.sentById);const result=await api.create('warehouse-transfers',{...form,action,sentByName:sender?.name||currentUser?.name});if(!result.success)return alert(result.message||'Transfer gagal');setMessage(`${result.data?.transferNumber||'Transfer'} berhasil disimpan.`);const savedId=String(result.data?.id||'');const savedDoc:Transfer={id:savedId,transferNumber:result.data?.transferNumber||'Transfer tersimpan',date:form.date,sourceWarehouseId:form.sourceWarehouseId,sourceWarehouseName:activeWarehouse?.name||'',sourceBranchId:activeBranchId,sourceBranchName:'',destinationWarehouseId:form.destinationWarehouseId,destinationWarehouseName:warehouseOptions.find(w=>w.id===form.destinationWarehouseId)?.name||'',destinationBranchId:'',destinationBranchName:'',status:action==='draft'?'Draft':'Dalam Perjalanan',items:form.items.map(item=>({...item,qtySent:item.qty,qtyReceived:0}))};
   setSession(current=>({active:'doc:'+savedId,tabs:current.tabs.filter(tab=>tab.selectedTransfer?.id!==savedId).map(tab=>tabId(tab)==='new'?createEditor(userId,savedDoc.sourceWarehouseId,savedDoc):tab)}));
   await Promise.all([load(),refreshData()])};
 const receive=async()=>{if(!selectedTransfer)return;const receiver=data.users.find(item=>item.id===(form.sentById||currentUser?.id));const items=selectedTransfer.items.filter(item=>(receiveQty[item.itemId]||0)>0).map(item=>({itemId:item.itemId,qtyReceived:receiveQty[item.itemId]}));const result=await api.update('warehouse-transfers',selectedTransfer.id,{action:'receive',receivedById:receiver?.id||currentUser?.id,receivedByName:receiver?.name||currentUser?.name,items});if(!result.success)return alert(result.message||'Penerimaan gagal');setReceiveQty({});setMessage('Transfer berhasil diterima.');const [updated]=await Promise.all([load(),refreshData()]);const saved=updated.find(item=>item.id===selectedTransfer.id);if(saved)resetDocument(saved)};
 const sendDraft=async(transfer:Transfer)=>{if(!confirm(`Kirim transfer ${transfer.transferNumber}? Stok gudang asal akan berkurang.`))return;const result=await api.update('warehouse-transfers',transfer.id,{action:'send',sentById:currentUser?.id});if(!result.success)return alert(result.message||'Draft gagal dikirim');setMessage(`${transfer.transferNumber} berhasil dikirim.`);await Promise.all([load(),refreshData()])};
 const cancel=async(transfer:Transfer)=>{const reason=prompt(`Alasan pembatalan ${transfer.transferNumber}:`)?.trim();if(!reason)return;const result=await api.update('warehouse-transfers',transfer.id,{action:'cancel',reason});if(!result.success)return alert(result.message||'Transfer gagal dibatalkan');setMessage(`${transfer.transferNumber} dibatalkan.`);await Promise.all([load(),refreshData()])};
 const remove=async(transfer:Transfer)=>{if(!confirm(`Hapus Draft ${transfer.transferNumber}?`))return;const result=await api.remove('warehouse-transfers',transfer.id);if(!result.success)return alert(result.message||'Draft gagal dihapus');setMessage(`${transfer.transferNumber} dihapus.`);await load()};
 const newShipment = !selectedTransfer && process === 'Kirim Barang' && hasPermission('item:create');
 const inBranch = (id: string) => currentBranchId === 'ALL'
   ? Boolean(currentUser?.isOwner || currentUser?.branchId === id || currentUser?.branchIds?.includes(id))
   : currentBranchId === id;
 const draftAtSource = selectedTransfer?.status === 'Draft' && inBranch(selectedTransfer.sourceBranchId);
 const inTransit = selectedTransfer && ['Dalam Perjalanan', 'Diterima Sebagian'].includes(selectedTransfer.status);
 const canReceive = Boolean(inTransit && inBranch(selectedTransfer.destinationBranchId) && hasPermission('item:edit'));
 const canCancel = inTransit && inBranch(selectedTransfer.sourceBranchId) && hasPermission('item:edit');
 const canDelete = draftAtSource && hasPermission('item:delete');
 const canPrint = !correcting && Boolean(selectedTransfer || form.items.length);
 const primaryTitle = correcting ? 'Simpan Koreksi' : newShipment ? 'Simpan Draft' : canReceive ? 'Terima Barang' : 'Simpan';
 const canSave = correcting ? canCorrect && Boolean(correctionReason.trim()) && form.items.length > 0
   : newShipment || (canReceive && Object.values(receiveQty).some(qty => qty > 0));
 const saveDocument = () => {
   if (!canSave) return;
   void runMutation(correcting ? saveCorrection : newShipment ? () => send('draft') : receive);
 };
 const moreActions: {label: string; action: () => void}[] = [];
 if (newShipment) moreActions.push({label: 'Kirim Barang', action: () => void runMutation(() => send('send'))});
 if (selectedTransfer) {
   if (draftAtSource && hasPermission('item:edit')) moreActions.push({label: 'Kirim Barang', action: () => void runMutation(() => sendDraft(selectedTransfer))});
   if (correcting) moreActions.push({label: 'Batal Koreksi', action: () => resetDocument(transfers.find(row => row.id === selectedTransfer.id) ?? selectedTransfer)});
   else if (canCorrect && selectedTransfer.status === 'Diterima') moreActions.push({label: 'Edit Transfer', action: () => {setFormTab('items'); beginCorrection()}});
   if (canCancel) moreActions.push({label: 'Batalkan Transfer', action: () => void runMutation(() => cancel(selectedTransfer))});
 }
 const deleteDraft = () => { if (canDelete && selectedTransfer) void runMutation(() => remove(selectedTransfer)); };
 const printDocument = () => {
   if (!canPrint || !printContent.current) return;
   const popup = window.open('', '_blank');
   if (!popup) return setMessage('Izinkan pop-up untuk mencetak transfer.');
   popup.document.title = selectedTransfer?.transferNumber || 'Draf Transfer Antar Gudang';
   const style = popup.document.createElement('style');
   style.textContent = 'body{font:14px system-ui;color:#17283a;margin:24px}table{border-collapse:collapse;width:100%}th,td{padding:6px;border:1px solid #aaa;text-align:left}tr{break-inside:avoid}p{white-space:pre-wrap}';
   popup.document.head.append(style);
   popup.document.body.append(popup.document.importNode(printContent.current, true));
   popup.focus();
   popup.print();
 };
 const users=data.users.filter(user=>user.isActive&&(user.branchId===activeBranchId||user.branchIds?.includes(activeBranchId)||user.isOwner));
 return <div className={view === 'list' ? 'app-module-page inventory-list-page' : 'app-module-page'} aria-busy={busy}>
  <DocumentTabBar label="Tab Transfer Antar Gudang" activeKey={session.active}>
    <button type="button" aria-label="Daftar Transfer Gudang" title="Daftar Transfer Gudang" disabled={busy}
      aria-current={view==='list'?'page':undefined} className={`${ui.childListTab} !sticky left-0 !z-10`} onClick={()=>activate('list')}><List size={20}/></button>
    {session.tabs.map(tab=>{
      const id=tabId(tab), label=tab.selectedTransfer?.transferNumber||'Data Baru';
      return <div key={id} className={session.active===id?ui.childTabActive:ui.childTab}>
        <button type="button" disabled={busy} title={label} aria-current={session.active===id?'page':undefined} onClick={()=>activate(id)}>{label}</button>
        <button type="button" disabled={busy} aria-label={`Tutup ${label}`} onClick={()=>closeTab(tab)}><X size={16}/></button>
      </div>;
    })}
  </DocumentTabBar>
  {message&&<div role="status" className="transfer-message">{message}<button className="ml-auto" onClick={()=>setMessage('')} aria-label="Tutup pesan"><X size={16}/></button></div>}
  <section className={view==='list'?'app-fill-stack':'hidden'} inert={busy}>
    <InventoryListToolbar name="Transfer Gudang" {...period} search={listSearch} onSearch={setListSearch} placeholder="Cari nomor, gudang, atau status…" count={filtered.length}
      filterCount={[listStatus, listSearch.trim()].filter(Boolean).length} clearFilters={() => { setListStatus(''); setListSearch(''); }}
      filters={<label>Status<select value={listStatus} onChange={event => setListStatus(event.target.value)}><option value="">Semua status</option>{['Draft', 'Dalam Perjalanan', 'Diterima Sebagian', 'Diterima', 'Dibatalkan'].map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>}
      actions={<><button className="stock-movement-tool-button" aria-label="Tambah Transfer Gudang" onClick={newTransfer}><Plus/></button><button className="stock-movement-tool-button" title="Muat ulang daftar" onClick={() => void load()}><RefreshCw size={18}/></button></>} columns={layout.menu}/>
    <InventoryDocumentTable rows={filtered} layout={layout} filterKey={JSON.stringify([listDate, listDateTo, listSearch, listStatus])}
      empty="Belum ada Transfer Gudang sesuai filter." unsortable="actions"
      value={(transfer, column) => column === 'process' ? 'Kirim Barang' : column === 'actions' ? '' : transfer[column]}
      render={(transfer, column) => {
        if (column === 'transferNumber') return <><button className="transfer-link" onClick={() => chooseTransfer(transfer)}>{transfer.transferNumber}</button>{transfer.cancellationReason && <small className="block text-red-600">{transfer.cancellationReason}</small>}</>;
        if (column === 'date') return transfer.date.split('-').reverse().join('/');
        if (column === 'process') return 'Kirim Barang';
        if (column === 'status') return <span className={`transfer-status ${statusClass(transfer.status)}`}>{statusLabel(transfer.status)}</span>;
        if (column === 'actions') return <div className="transfer-actions">{transfer.status==='Draft'&&<><button className="transfer-action transfer-action-primary" onClick={()=>void runMutation(()=>sendDraft(transfer))}>Kirim</button><button className="transfer-action transfer-action-danger" onClick={()=>void runMutation(()=>remove(transfer))}>Hapus</button></>}{pending.includes(transfer)&&<button className="transfer-action transfer-action-success" onClick={()=>chooseTransfer(transfer)}>Terima</button>}{!['Draft','Dibatalkan','Diterima'].includes(transfer.status)&&transfer.sourceBranchId===activeBranchId&&<button className="transfer-action transfer-action-danger" onClick={()=>void runMutation(()=>cancel(transfer))}>Batalkan</button>}</div>;
        return transfer[column];
      }}/>
  </section>
  {view==='entry'&&<div className="app-module-panel !block !p-0" inert={busy || (!!selectedTransfer && !transfersLoaded)}><main className="transfer-form" data-tab={formTab}>
   <div className="hidden lg:block">
     <AccurateFormActionRail className="absolute right-4 top-3 z-20" ariaLabel="Aksi transfer gudang"
       save={{title: primaryTitle, disabled: busy || !canSave, onClick: saveDocument}}
       print={{title: "Cetak / simpan sebagai", disabled: !canPrint, onClick: printDocument}}
       more={{title: "Lain-lain", disabled: busy || !moreActions.length, onClick: () => setMoreOpen(!moreOpen)}}
       remove={{title: "Hapus Draft", disabled: busy || !canDelete, onClick: deleteDraft}}/>
   </div>
   <nav aria-label="Aksi transfer gudang" className="transfer-mobile-actions lg:hidden">
     <button disabled={busy || !canSave} onClick={saveDocument}>{primaryTitle}</button>
     <button disabled={!canPrint} onClick={printDocument}>Cetak</button>
     <button aria-label="Pilihan lainnya" aria-expanded={moreOpen} disabled={busy || !(moreActions.length || canDelete)} onClick={()=>setMoreOpen(!moreOpen)}>•••</button>
   </nav>
   {moreOpen && <>
     <button className="fixed inset-0 z-40 cursor-default" aria-label="Tutup menu aksi" onClick={()=>setMoreOpen(false)}/>
     <div className="transfer-more-menu" onKeyDown={event=>{if(event.key==="Escape")setMoreOpen(false)}}>
       {moreActions.map(({label,action})=><button key={label} onClick={()=>{setMoreOpen(false);action()}}>{label}</button>)}
       {canDelete && <button className="lg:hidden" onClick={()=>{setMoreOpen(false);deleteDraft()}}>Hapus Draft</button>}
     </div>
   </>}
   <div hidden><article ref={printContent}>
     <h1>Transfer Antar Gudang</h1><p>{selectedTransfer?.transferNumber || "Data Baru"} · {form.date.split("-").reverse().join("/")} · {statusLabel(selectedTransfer?.status || "Draft")}</p>
     <p>Dari: {selectedTransfer?.sourceWarehouseName || activeWarehouse?.name}<br/>Tujuan: {selectedTransfer?.destinationWarehouseName || warehouseOptions.find(row=>row.id===form.destinationWarehouseId)?.name || "—"}</p>
     {form.notes && <p>{form.notes}</p>}
     <table><thead><tr><th>Kode</th><th>Nama Barang</th><th>{selectedTransfer ? "Qty Kirim" : "Kuantitas"}</th>{selectedTransfer && <th>Qty Diterima</th>}<th>Satuan</th></tr></thead>
       <tbody>{(selectedTransfer?.items ?? form.items).map(item=><tr key={item.itemId}><td>{item.itemCode}</td><td>{item.itemName}</td><td>{"qtySent" in item ? item.qtySent : item.qty}</td>{"qtyReceived" in item && <td>{item.qtyReceived}</td>}<td>{item.unit}</td></tr>)}</tbody>
     </table>
   </article></div>
   <header className="transfer-form-header"><div className="transfer-header-grid"><Field label="Proses"><select disabled={!!selectedTransfer} value={process} onChange={event=>{setProcess(event.target.value as Process)}}><option>Kirim Barang</option><option>Terima Barang</option></select></Field><Field label="No. Pemindahan #">{selectedTransfer?<div className="transfer-number-field" title={selectedTransfer.transferNumber}>{selectedTransfer.transferNumber}</div>:process==='Terima Barang'?<select value="" onChange={event=>{const transfer=pending.find(item=>item.id===event.target.value);if(transfer)chooseTransfer(transfer)}}><option value="">Pilih nomor transfer...</option>{pending.map(transfer=><option key={transfer.id} value={transfer.id}>{transfer.transferNumber} · {transfer.date}</option>)}</select>:<div className="transfer-number-field">Otomatis</div>}</Field><Field label="Gudang Aktif *"><div className="transfer-active-warehouse">{selectedTransfer?selectedTransfer.sourceWarehouseName||'-':activeWarehouse?.name||'Belum ada gudang aktif'}</div></Field><Field label="Tanggal *"><IndonesianDateInput disabled={!!selectedTransfer} value={form.date} onChange={date=>{if(!selectedTransfer)setForm({...form,date})}} className="h-9 w-full"/></Field><Field label="Gudang Tujuan *">{selectedTransfer?<div className="transfer-active-warehouse">{selectedTransfer.destinationWarehouseName}</div>:<select value={form.destinationWarehouseId} disabled={process==='Terima Barang'} onChange={event=>setForm({...form,destinationWarehouseId:event.target.value})}><option value="">Cari/Pilih...</option>{warehouseOptions.filter(warehouse=>warehouse.id!==form.sourceWarehouseId).map(warehouse=><option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select>}</Field></div></header><section className="transfer-document-shell"><AccurateDocumentSideTabs active={formTab==='info'?'info':'details'} onChange={tab=>setFormTab(tab==='info'?'info':'items')} ariaLabel="Bagian Transfer Gudang" visibleTabs={['details','info']}/>{formTab==='info'&&<section className="transfer-info-panel"><Field label="Keterangan"><textarea readOnly={!!selectedTransfer} rows={5} value={form.notes} onChange={event=>setForm({...form,notes:event.target.value})} placeholder="Tambahkan keterangan transfer..."/></Field></section>}<section className="transfer-panel">{selectedTransfer?.status==='Diterima'&&<div className="transfer-correction-panel">{correcting?<><strong>Koreksi {selectedTransfer.transferNumber}</strong><p>Nomor, tanggal, dan gudang tetap. Jumlah kirim dan terima akan diperbarui bersama stok kedua gudang.</p><label>Alasan koreksi *<textarea aria-label="Alasan koreksi" maxLength={255} value={correctionReason} onChange={event=>setCorrectionReason(event.target.value)}/></label></>:<><span>Transfer sudah diterima seluruhnya.</span></>}{selectedTransfer.id==='LOCAL-DUMMY-TRANSFER'&&<p>Data dummy: perubahan stok tidak dapat disimpan.</p>}</div>}{process==='Kirim Barang'&&<div className="transfer-item-toolbar"><div className="transfer-item-search" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setShowPicker(false)}}><Search size={17}/><input aria-label="Cari atau pilih barang" value={search} onFocus={()=>setShowPicker(true)} onChange={event=>{setSearch(event.target.value);setShowPicker(true)}} onKeyDown={event=>{if(event.key==='Escape')setShowPicker(false);if(event.key==='Enter'&&candidates[0]){event.preventDefault();addItem(candidates[0])}}} placeholder="Cari kode, nama, atau UPC/Barcode..."/><button type="button" className="transfer-item-search-button" onClick={()=>setShowPicker(current=>!current)} aria-label="Buka pilihan barang"><Search size={17}/></button>{showPicker&&<div className="transfer-picker-dropdown">{candidates.map(item=><div key={item.id} className="transfer-picker-option"><button type="button" className="transfer-picker-code" onMouseDown={event=>event.preventDefault()} onClick={()=>addItem(item)}>{item.code}</button><button type="button" className="transfer-picker-name" onMouseDown={event=>event.preventDefault()} onClick={()=>addItem(item)}><span>{item.name}</span>{item.barcode&&<small>UPC/Barcode: {item.barcode}</small>}<small>Stok {stock(form.sourceWarehouseId,item.id)} {item.unit}</small></button></div>)}{!candidates.length&&<p className="transfer-empty">Barang atau jasa tidak ditemukan.</p>}</div>}</div><h2><Search size={19}/>Rincian Barang <b>*</b></h2></div>}<div className="transfer-items"><table><thead><tr><th>Nama Barang</th><th>Kode</th><th>{process==='Terima Barang'?'Qty Kirim':'Kuantitas'}</th>{process==='Terima Barang'&&<><th>Sudah</th><th>Qty Diterima</th></>}<th>Satuan</th><th>Kategori</th><th/></tr></thead><tbody>{process==='Kirim Barang'?form.items.map(item=><tr key={item.itemId} onClick={()=>openItemDetail(item)} className="transfer-item-row"><td>{item.itemName}</td><td>{item.itemCode}</td><td className="transfer-item-quantity">{item.qty}</td><td>{item.unit}</td><td>{item.categoryName}</td><td><button onClick={event=>{event.stopPropagation();setForm({...form,items:form.items.filter(row=>row.itemId!==item.itemId)})}}><X size={16}/></button></td></tr>):selectedTransfer?.items.map(item=><tr key={item.itemId} onClick={()=>openItemDetail(item)} className="transfer-item-row"><td>{item.itemName}</td><td>{item.itemCode}</td><td>{item.qtySent}</td><td>{item.qtyReceived}</td><td>{item.qtyReceived>=item.qtySent?<span className="transfer-received-complete">Selesai</span>:<input disabled={!canReceive} onClick={event=>event.stopPropagation()} type="number" min="0" max={item.qtySent-item.qtyReceived} value={receiveQty[item.itemId]||0} onChange={event=>setReceiveQty({...receiveQty,[item.itemId]:Number(event.target.value)})}/>}</td><td>{item.unit}</td><td>{item.categoryName}</td><td/></tr>)}</tbody></table>{((process==='Kirim Barang'&&!form.items.length)||(process==='Terima Barang'&&!selectedTransfer))&&<p className="transfer-empty">Belum ada data. {process==='Terima Barang'&&<button className="transfer-link" onClick={()=>setShowTake(true)}>Pilih pengiriman</button>}</p>}</div><div className="transfer-fields transfer-fields-bottom"><Field label={process==='Kirim Barang'?'Dikirim Oleh':'Diterima Oleh'}><select value={form.sentById} onChange={event=>setForm({...form,sentById:event.target.value})}>{users.map(user=><option key={user.id} value={user.id}>{user.name}</option>)}</select></Field><Field label="Cara Pengiriman"><select value={form.deliveryMethod} onChange={event=>setForm({...form,deliveryMethod:event.target.value})}>{['Diantar Langsung','Grab','Gojek','Ekspedisi','Diambil Sendiri','Lainnya'].map(item=><option key={item}>{item}</option>)}</select></Field><Field label="Keterangan (opsional)"><input value={form.notes} onChange={event=>setForm({...form,notes:event.target.value})}/></Field></div>{!!selectedTransfer?.corrections?.length&&<section className="transfer-correction-panel"><h3>Riwayat Koreksi</h3>{selectedTransfer.corrections.map((entry,index)=><details key={index}><summary>{entry.createdAt} · {entry.userName} — {entry.reason}</summary><table><thead><tr><th>Barang</th><th>Sebelum</th><th>Sesudah</th></tr></thead><tbody>{Array.from(new Set([...entry.snapshot.before,...entry.snapshot.after].map(item=>item.item_id))).map(id=>{const before=entry.snapshot.before.find(item=>item.item_id===id);const after=entry.snapshot.after.find(item=>item.item_id===id);return <tr key={id}><td>{after?.item_name||before?.item_name}</td><td>{before?.qty_sent||0}</td><td>{after?.qty_sent||0}</td></tr>})}</tbody></table></details>)}</section>}</section></section></main></div>}
  {quantityItem&&<div className="transfer-modal-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)setQuantityItem(null)}}><div className="transfer-invoice-item-modal" role="dialog" aria-modal="true" aria-label="Rincian Barang"><header className="transfer-invoice-item-modal-header"><div><Edit size={16}/><h3>Rincian Barang</h3></div><button type="button" aria-label="Tutup jumlah barang" onClick={()=>setQuantityItem(null)}><X size={18}/></button></header><nav className="transfer-invoice-item-tabs"><button type="button" className={quantityTab==='detail'?'active':''} onClick={()=>setQuantityTab('detail')}>Rincian Barang</button><button type="button" className={quantityTab==='info'?'active':''} onClick={()=>setQuantityTab('info')}>Info lainnya</button><button type="button" className={quantityTab==='image'?'active':''} onClick={()=>setQuantityTab('image')}>Gambar</button></nav><div className="transfer-invoice-item-modal-body">{quantityTab==='detail'&&<div className="transfer-invoice-item-detail"><div className="transfer-invoice-item-code-row"><span>Kode #</span><button type="button" className="transfer-invoice-item-code-link" onClick={()=>navigate('/items?view='+encodeURIComponent(quantityItem.id))}>{quantityItem.code}</button></div><label><span>Nama Barang</span><input value={quantityItem.name} readOnly/></label><label><span>UPC/Barcode</span><input value={quantityItem.barcode||''} readOnly placeholder="Belum ada UPC/Barcode"/></label><label><span>Kuantitas</span><div className="transfer-invoice-quantity"><input autoFocus readOnly={quantityReadonly} type="number" min="1" value={quantity} onChange={event=>setQuantity(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')confirmQuantity()}}/><span>{quantityItem.unit}</span><Search size={16}/></div></label><label><span>Gudang <b>*</b></span><div className="transfer-invoice-warehouse"><div>{selectedTransfer?.sourceWarehouseName||sourceWarehouses.find(warehouse=>warehouse.id===form.sourceWarehouseId)?.name||'Pilih gudang...'}</div><span>Stok : <b className={stock(form.sourceWarehouseId,quantityItem.id)>0?'positive':'negative'}>{stock(form.sourceWarehouseId,quantityItem.id)}</b></span></div></label>{!quantityReadonly&&!correcting&&Number(quantity)>stock(form.sourceWarehouseId,quantityItem.id)&&<div className="transfer-invoice-stock-warning"><AlertTriangle size={16}/><span>Stok akan menjadi <strong>{stock(form.sourceWarehouseId,quantityItem.id)-Math.floor(Number(quantity)||0)} {quantityItem.unit}</strong>. Barang tetap dapat disimpan.</span></div>}</div>}{quantityTab==='info'&&<div className="transfer-invoice-item-info"><div><span>Kategori</span><strong>{quantityItem.categoryName||'-'}</strong></div><div><span>Satuan</span><strong>{quantityItem.unit||'-'}</strong></div><div><span>Keterangan</span><p>{quantityItem.description||'Belum ada keterangan barang.'}</p></div></div>}{quantityTab==='image'&&<div className="transfer-invoice-item-image"><FileText size={34}/><p>Belum ada gambar barang.</p></div>}</div><footer className="transfer-invoice-item-modal-footer">{detailItemId&&process==='Kirim Barang'&&<button type="button" className="transfer-delete-detail" onClick={removeDetailItem}>HAPUS detail barang</button>}<span className="transfer-invoice-item-modal-footer-actions">{quantityReadonly?<button type="button" onClick={()=>{setDetailItemId('');setQuantityItem(null)}}>Tutup</button>:<><button type="button" onClick={()=>setQuantityItem(null)}>Batal</button><button type="button" onClick={confirmQuantity}>Lanjut</button></>}</span></footer></div></div>} {selectedItem&&<div className="transfer-modal-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)setSelectedItem(null)}}><section className="transfer-modal transfer-item-detail-modal"><header><b>Rincian Barang</b><button type="button" aria-label="Tutup rincian barang" onClick={()=>setSelectedItem(null)}><X/></button></header><div className="transfer-item-detail-grid"><span>Kode Barang</span><button type="button" className="transfer-detail-code" onClick={()=>navigate('/items?view='+encodeURIComponent(selectedItem.itemId))}>{selectedItem.itemCode}</button><span>Nama Barang</span><div>{selectedItem.itemName}</div><span>UPC/Barcode</span><div>{data.items.find(item=>item.id===selectedItem.itemId)?.barcode||'—'}</div><span>Kategori</span><div>{selectedItem.categoryName||'-'}</div><span>Kuantitas</span><div>{'qty' in selectedItem?selectedItem.qty:selectedItem.qtySent+' '+selectedItem.unit}</div><span>Satuan</span><div>{selectedItem.unit}</div><span>Stok Gudang</span><div>{stock(form.sourceWarehouseId,selectedItem.itemId)} {selectedItem.unit}</div></div><footer><button type="button" onClick={()=>setSelectedItem(null)}>Tutup</button></footer></section></div>}  {showTake&&<div className="transfer-modal-overlay"><section className="transfer-modal"><header><b>Pilih Pengiriman Barang</b><button onClick={()=>setShowTake(false)}><X/></button></header><div className="transfer-modal-list">{pending.length?pending.map(transfer=><button key={transfer.id} onClick={()=>chooseTransfer(transfer)}><span><b>{transfer.transferNumber}</b><small>{transfer.date} · {transfer.sourceBranchName} → {transfer.destinationBranchName}</small></span><span>{transfer.items.reduce((sum,item)=>sum+item.qtySent-item.qtyReceived,0)} barang</span></button>):<p className="transfer-empty">Tidak ada pengiriman yang menunggu diterima.</p>}</div></section></div>}
 </div>;
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="transfer-field"><span>{label}</span>{children}</label>}
