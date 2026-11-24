import { alignRailTable } from '../lib/alignRailTable';
import DocumentTabBar from '../components/DocumentTabBar';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, ChevronDown, FileText, Info, Lightbulb, List, Pencil, Plus, RefreshCw, Search, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/apiClient';
import { localDateKey } from '../lib/date';
import { childTabClass, ui } from '../components/ui/interfaceStandards';
import ItemSearchOption from '../components/ItemSearchOption';
import IndonesianDateInput from '../components/IndonesianDateInput';
import AccurateFormActionRail from '../components/AccurateFormActionRail';
import AccurateNotificationDialog from '../components/AccurateNotificationDialog';
import './OpeningStockImport.css';
import './ItemUsages.css';
import { InventoryDocumentTable, InventoryListToolbar, matchesInventoryPeriod, useInventoryColumns, useInventoryPeriod } from '../components/InventoryList';

type UsageLine = {
  itemId: string; code: string; itemName: string; unit: string; quantity: number;
  lineNotes: string; stockBefore?: number | null; stock?: number;
};
type UsageDocument = {
  id: string; usageNumber: string; date: string; branchId: string; branchName: string;
  warehouseId: string; warehouseName: string; purpose: string; responsibleName: string;
  expenseAccountId: string; expenseAccountName: string; status: 'Draft' | 'Posted' | 'Cancelled';
  revision: number; createdByName: string; createdAt: string;
  postedAt?: string; cancelledAt?: string; cancellationReason?: string; rows: UsageLine[];
};
type UsageForm = Pick<UsageDocument, 'id' | 'date' | 'warehouseId' | 'purpose' | 'responsibleName' | 'expenseAccountId' | 'revision' | 'rows'>;
type ExpenseAccount = { id: string; code: string; name: string };
type Preview = { stock: number };
const statusLabel = (status: UsageDocument['status']) => ({ Draft: 'Draft', Posted: 'Diposting', Cancelled: 'Dibatalkan' })[status];
const number = (value: number) => value.toLocaleString('id-ID', { maximumFractionDigits: 4 });
const usageLabels = {usageNumber: 'Nomor #', date: 'Tanggal', branchName: 'Cabang', purpose: 'Keperluan', status: 'Status'};
const usageWidths = {usageNumber: 190, date: 120, branchName: 170, purpose: 280, status: 120};
const displayDate = (date: string) => date.split('-').reverse().join('/');

export default function ItemUsages() {
  const { data, currentBranchId, currentUser, hasPermission, refreshData } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requestedDocument = params.get('view');
  const warehouses = data.warehouses.filter(w => w.isActive && !w.isSystem && (currentBranchId === 'ALL' || w.branchId === currentBranchId));
  const defaultWarehouseId = (warehouses.find(w => w.isDefault) || warehouses[0])?.id || '';
  const emptyForm = (): UsageForm => ({ id: '', date: localDateKey(), warehouseId: defaultWarehouseId, purpose: '', responsibleName: currentUser?.name || '', expenseAccountId: defaultAccount.current, revision: 0, rows: [] });
  const defaultAccount = useRef('');
  const [form, setForm] = useState<UsageForm>(emptyForm);
  const [documents, setDocuments] = useState<UsageDocument[]>([]);
  const [detailTabs, setDetailTabs] = useState<UsageDocument[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<UsageDocument | null>(null);
  const [view, setView] = useState<'list' | 'entry' | 'detail'>('list');
  const [entryOpen, setEntryOpen] = useState(true);
  const [formTab, setFormTab] = useState<'items' | 'info'>('items');
  const [itemSearch, setItemSearch] = useState('');
  const [search, setSearch] = useState('');
  const period = useInventoryPeriod();
  const layout = useInventoryColumns('usage-list:' + (currentUser?.id || 'guest'), usageLabels, usageWidths);
  const [status, setStatus] = useState('');
  const [accounts, setAccounts] = useState<ExpenseAccount[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const pendingCreate = useRef<{ fingerprint: string; key: string } | null>(null);
  const [rowDialog, setRowDialog] = useState<{ index: number; row: UsageLine; readOnly: boolean } | null>(null);
  const [rowTab, setRowTab] = useState<'items' | 'info' | 'image'>('items');
  const [rowError, setRowError] = useState('');
  const [confirmation, setConfirmation] = useState<'post' | 'cancel' | 'delete' | 'new' | 'close' | null>(null);
  const [reason, setReason] = useState('');
  const readOnly = view === 'detail';
  const document = readOnly ? selectedDocument : null;
  const shown = document || form;
  const currentWarehouse = data.warehouses.find(w => w.id === shown.warehouseId);
  const formWarehouse = data.warehouses.find(w => w.id === form.warehouseId);
  const optionsWarehouseId = readOnly ? document?.warehouseId || '' : form.warehouseId;
  const editingBranch = form.id ? data.warehouses.find(w => w.id === form.warehouseId)?.branchId : undefined;
  const formWarehouses = warehouses.filter(w => !editingBranch || w.branchId === editingBranch);
  const branchMismatch = currentBranchId !== 'ALL' && !!formWarehouse && formWarehouse.branchId !== currentBranchId;
  const canSave = hasPermission(form.id ? 'item_usage:edit' : 'item_usage:create');
  const accountLabel = accounts.find(a => a.id === shown.expenseAccountId);
  const selectedAccountName = document?.expenseAccountName || (accountLabel ? `[${accountLabel.code}] ${accountLabel.name}` : '') || (shown.expenseAccountId ? 'Akun biaya tersimpan' : '');
  const filtered = documents.filter(doc => matchesInventoryPeriod(doc.date, period.from, period.to) && (!status || doc.status === status)
    && `${doc.usageNumber} ${doc.purpose} ${doc.responsibleName} ${doc.branchName} ${doc.warehouseName}`.toLocaleLowerCase('id-ID').includes(search.trim().toLocaleLowerCase('id-ID')));
  const suggestions = itemSearch.trim() ? data.items.filter(item => item.isActive && item.type === 'Persediaan'
    && itemSearch.toLocaleLowerCase('id-ID').trim().split(/\s+/).every(term => `${item.code} ${item.name}`.toLocaleLowerCase('id-ID').includes(term))).slice(0, 15) : [];

  async function loadDocuments() {
    const requestId = ++listRequest.current;
    setLoading(true);
    const response = await api.get<UsageDocument[]>(`item-usages?branchId=${encodeURIComponent(currentBranchId)}`);
    if (requestId !== listRequest.current) return;
    setLoading(false);
    if (response.success) setDocuments(response.data || []);
    else setMessage(response.message || 'Daftar pemakaian gagal dimuat.');
  }
  useEffect(() => { void loadDocuments(); return () => { listRequest.current++; }; }, [currentBranchId]);
  useEffect(() => {
    let active = true;
    if (!optionsWarehouseId) return () => { active = false; };
    void api.get<{ accounts: ExpenseAccount[]; defaultExpenseAccountId: string; defaultExpenseAccountName?: string }>(`item-usages?options=1&warehouseId=${encodeURIComponent(optionsWarehouseId)}`).then(response => {
      if (!active) return;
      if (!response.success || !response.data) { setMessage(response.message || 'Akun biaya gagal dimuat.'); return; }
      setAccounts(response.data.accounts);
      const defaultId = response.data.accounts.some(a => a.id === response.data?.defaultExpenseAccountId) ? response.data.defaultExpenseAccountId : '';
      defaultAccount.current = defaultId;
      setForm(previous => previous.id ? previous : { ...previous, expenseAccountId: defaultId });
    });
    return () => { active = false; };
  }, [optionsWarehouseId, readOnly]);
  useEffect(() => {
    setForm(previous => previous.id || previous.rows.length ? previous : { ...previous, warehouseId: defaultWarehouseId });
  }, [currentBranchId, defaultWarehouseId]);

  async function openDocument(id: string) {
    const requestId = ++detailRequest.current;
    const response = await api.get<UsageDocument>(`item-usages/${encodeURIComponent(id)}`);
    if (requestId !== detailRequest.current) return;
    if (!response.success || !response.data) { setMessage(response.message || 'Pemakaian tidak ditemukan.'); return; }
    const doc = response.data;
    setDetailTabs(previous => [...previous.filter(tab => tab.id !== doc.id), doc]);
    setSelectedDocument(doc); setView('detail'); setFormTab('items'); setItemSearch(''); setRowDialog(null);
  }
  useEffect(() => { if (requestedDocument) void openDocument(requestedDocument); }, [requestedDocument]);

  async function preview(itemId: string, warehouseId = form.warehouseId, date = form.date): Promise<Preview> {
    const query = new URLSearchParams({ preview: '1', itemId, warehouseId, date });
    const response = await api.get<Preview>(`item-usages?${query}`);
    if (!response.success || !response.data) throw new Error(response.message || 'Stok barang gagal dimuat.');
    return { stock: response.data.stock };
  }
  const rowIds = form.rows.map(row => row.itemId).join('|');
  useEffect(() => {
    if (view !== 'entry' || !form.rows.length || !form.warehouseId || !form.date) return;
    let active = true;
    void Promise.all(form.rows.map(async row => ({ itemId: row.itemId, ...await preview(row.itemId) }))).then(previews => {
      if (!active) return;
      const values = new Map(previews.map(stock => [stock.itemId, stock]));
      setForm(previous => ({ ...previous, rows: previous.rows.map(row => ({ ...row, ...values.get(row.itemId)! })) }));
    }).catch(error => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [form.warehouseId, form.date, rowIds, view]);

  function freshEntry() {
    detailRequest.current++;
    setForm(emptyForm()); setView('entry'); setEntryOpen(true); setFormTab('items'); setSelectedDocument(null);
    setRowDialog(null); setItemSearch(''); setMessage(''); pendingCreate.current = null;
    if (requestedDocument) setParams({}, { replace: true });
  }
  function requestNew() { if (form.rows.length || form.purpose) setConfirmation('new'); else freshEntry(); }
  function editDraft() {
    if (!selectedDocument || selectedDocument.status !== 'Draft') return;
    setForm({ ...selectedDocument, rows: selectedDocument.rows.map(row => ({ ...row })) });
    setView('entry'); setEntryOpen(true); setFormTab('items'); setMessage('');
  }
  async function editRow(row: UsageLine, index: number, readonly: boolean) {
    if (busyRef.current) return;
    setRowError(''); setRowTab('items');
    if (readonly) { setRowDialog({ index, row: { ...row }, readOnly: true }); return; }
    if (!form.warehouseId || !form.date) { setMessage('Pilih tanggal dan gudang terlebih dahulu.'); return; }
    busyRef.current = true; setBusy(true);
    try { setRowDialog({ index, row: { ...row, ...await preview(row.itemId) }, readOnly: false }); setItemSearch(''); }
    catch (error: any) { setMessage(error.message); }
    finally { busyRef.current = false; setBusy(false); }
  }
  function saveRow() {
    if (!rowDialog || rowDialog.readOnly) { setRowDialog(null); return; }
    const row = rowDialog.row;
    if (!Number.isSafeInteger(row.quantity) || row.quantity < 1 || row.quantity > 2147483647) { setRowError('Jumlah dipakai harus bilangan bulat minimal 1.'); return; }
    if (form.rows.some((entry, index) => index !== rowDialog.index && entry.itemId === row.itemId)) { setRowError('Barang sudah ada dalam rincian.'); return; }
    setForm(previous => ({ ...previous, rows: rowDialog.index === previous.rows.length ? [...previous.rows, row] : previous.rows.map((entry, index) => index === rowDialog.index ? row : entry) }));
    setRowDialog(null);
  }

  async function saveDraft(postImmediately = false) {
    if (busyRef.current) return;
    if (branchMismatch) { setMessage('Pilih cabang formulir ini sebelum menyimpan pemakaian.'); return; }
    if (!form.date || !form.warehouseId || !form.rows.length || !form.purpose.trim() || !form.responsibleName.trim()) {
      setMessage('Isi tanggal, gudang, barang, keperluan, dan penanggung jawab.');
      if (!form.purpose.trim() || !form.responsibleName.trim()) setFormTab('info');
      return;
    }
    setMessage(''); busyRef.current = true; setBusy(true);
    try {
      const payload = { date: form.date, warehouseId: form.warehouseId, purpose: form.purpose, responsibleName: form.responsibleName,
        rows: form.rows.map(({ itemId, quantity, lineNotes }) => ({ itemId, quantity, lineNotes })) };
      const fingerprint = JSON.stringify({ ...payload, postImmediately });
      if (!pendingCreate.current || pendingCreate.current.fingerprint !== fingerprint) pendingCreate.current = { fingerprint, key: crypto.randomUUID() };
      const response = form.id
        ? await api.update('item-usages', form.id, { ...payload, revision: form.revision, action: 'save' })
        : await api.create('item-usages', { ...payload, action: postImmediately ? 'post' : 'draft', requestKey: pendingCreate.current.key });
      if (!response.success) throw new Error(response.message || 'Pemakaian gagal disimpan.');
      const result = response.data as UsageDocument;
      setForm(previous => ({ ...previous, id: result.id, revision: result.revision })); pendingCreate.current = null;
      await openDocument(result.id); await loadDocuments();
      if (result.status === 'Posted') await refreshData();
      setForm(emptyForm()); setMessage(response.message || 'Pemakaian berhasil disimpan.');
    } catch (error: any) { setMessage(error.message); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function processDocument(action: 'post' | 'cancel' | 'delete') {
    if (!selectedDocument || busyRef.current) return;
    busyRef.current = true; setBusy(true); setMessage('');
    try {
      const response = action === 'delete'
        ? await api.removeWithBody('item-usages', selectedDocument.id, { revision: selectedDocument.revision })
        : await api.update('item-usages', selectedDocument.id, { action, revision: selectedDocument.revision, reason });
      if (!response.success) throw new Error(response.message || 'Pemakaian gagal diproses.');
      if (action === 'delete') {
        setDetailTabs(tabs => tabs.filter(tab => tab.id !== selectedDocument.id)); setSelectedDocument(null); setView('list');
        if (form.id === selectedDocument.id) setForm(emptyForm());
        if (requestedDocument) setParams({}, { replace: true });
      } else { await openDocument(selectedDocument.id); await refreshData(); }
      await loadDocuments(); setMessage(response.message || 'Pemakaian berhasil diproses.'); setConfirmation(null); setReason('');
    } catch (error: any) { setMessage(error.message); setConfirmation(null); }
    finally { busyRef.current = false; setBusy(false); }
  }

  return <div className={view === 'list' ? 'app-module-page inventory-list-page' : 'app-module-page adjustment-workspace usage-workspace'}>
    <DocumentTabBar label="Tab Pemakaian Barang" activeKey={view === 'detail' ? selectedDocument?.id || 'detail' : view}>
      <button type="button" disabled={busy} aria-current={view === 'list' ? 'page' : undefined} title="Daftar Pemakaian Barang" className={`${ui.childListTab} ${view === 'list' ? 'app-child-list-tab--active' : ''}`} onClick={() => setView('list')}><List size={22}/></button>
      {entryOpen && <div className={childTabClass(view === 'entry')}><button aria-current={view === 'entry' ? 'page' : undefined} type="button" disabled={busy} onClick={() => { setView('entry'); setRowDialog(null); }}>{form.id ? documents.find(doc => doc.id === form.id)?.usageNumber || 'Edit Draft' : 'Data Baru'}</button><button type="button" disabled={busy} title="Tutup Data Baru" onClick={() => form.rows.length || form.purpose ? setConfirmation('close') : (setEntryOpen(false), setView('list'))}><X size={16}/></button></div>}
      {detailTabs.map(tab => <div key={tab.id} className={childTabClass(view === 'detail' && selectedDocument?.id === tab.id)}><button aria-current={view === 'detail' && selectedDocument?.id === tab.id ? 'page' : undefined} type="button" disabled={busy} onClick={() => void openDocument(tab.id)}>{tab.usageNumber}</button><button type="button" disabled={busy} title="Tutup tab dokumen" onClick={() => { setDetailTabs(tabs => tabs.filter(doc => doc.id !== tab.id)); if (selectedDocument?.id === tab.id) setView('list'); }}><X size={16}/></button></div>)}
      <div className="adjustment-tab-tools"><button type="button" className="adjustment-help" title="Panduan Pemakaian Barang" onClick={() => navigate('/help?article=pemakaian-barang')}><Lightbulb size={18}/></button></div>
    </DocumentTabBar>
    <div className="app-module-panel app-fill-stack">
      {message && <div role="status" className="adjustment-message">{message}<button type="button" className="ml-auto" aria-label="Tutup pesan" onClick={() => setMessage('')}><X size={15}/></button></div>}
      {view === 'list' ? <section className="app-fill-stack">
        <InventoryListToolbar name="Pemakaian Barang" {...period} search={search} onSearch={setSearch} placeholder="Cari nomor atau keperluan…" count={filtered.length}
          filterCount={[status, search.trim()].filter(Boolean).length} clearFilters={() => { setStatus(''); setSearch(''); }}
          filters={<label>Status<select aria-label="Status pemakaian" value={status} onChange={e => setStatus(e.target.value)}><option value="">Semua Status</option><option value="Draft">Draft</option><option value="Posted">Diposting</option><option value="Cancelled">Dibatalkan</option></select></label>} columns={layout.menu}
          actions={<><button className="stock-movement-tool-button" title="Pemakaian Baru" disabled={busy || !hasPermission('item_usage:create')} onClick={requestNew}><Plus size={20}/></button>
            <button className="stock-movement-tool-button" title="Muat ulang pemakaian" disabled={loading || busy} onClick={() => void loadDocuments()}><RefreshCw size={18}/></button></>}/>
        <InventoryDocumentTable rows={filtered} layout={layout} filterKey={JSON.stringify([currentBranchId, period.from, period.to, status, search])}
          empty={loading ? 'Memuat pemakaian…' : 'Tidak ada pemakaian barang sesuai filter.'} open={doc => { if (!busy) void openDocument(doc.id); }}
          value={(doc, column) => column === 'status' ? statusLabel(doc.status) : doc[column]} render={(doc, column) => {
            if (column === 'usageNumber') return <button className="adjustment-document-link" disabled={busy}>{doc.usageNumber}</button>;
            if (column === 'date') return displayDate(doc.date);
            if (column === 'status') return <span className={`usage-status usage-status-${doc.status.toLowerCase()}`}>{statusLabel(doc.status)}</span>;
            return doc[column];
          }}/>
      </section> : <section className="adjustment-form">
        <div className="adjustment-form-main">
          <div className="usage-form-header"><div className="usage-header-fields"><label>Tanggal <IndonesianDateInput value={shown.date} disabled={readOnly || busy} onChange={date => setForm(previous => ({ ...previous, date }))}/></label><label>Gudang {readOnly ? <input aria-label="Gudang" readOnly value={document?.warehouseName || currentWarehouse?.name || ''}/> : <select aria-label="Gudang pemakaian" disabled={busy} value={form.warehouseId} onChange={e => setForm(previous => ({ ...previous, warehouseId: e.target.value }))}><option value="">Pilih gudang...</option>{formWarehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select>}</label><span className="usage-branch">Cabang: <strong>{document?.branchName || currentWarehouse?.branchName || data.branches.find(branch => branch.id === currentWarehouse?.branchId)?.name || '—'}</strong></span></div><div className="usage-number-wrap"><label>No. Pemakaian #<input aria-label="Nomor pemakaian" readOnly value={document?.usageNumber || documents.find(doc => doc.id === form.id)?.usageNumber || 'Otomatis'}/></label><span className={`usage-status usage-status-${document?.status.toLowerCase() || 'draft'}`}>{statusLabel(document?.status || 'Draft')}</span></div></div>
          {branchMismatch && !readOnly && <div className="adjustment-message">Formulir ini milik {formWarehouse?.branchName}. Pilih cabang tersebut untuk melanjutkan.</div>}
          <div className="adjustment-body-wrap"><nav className="adjustment-side-tabs" aria-label="Bagian pemakaian"><button type="button" title="Rincian Barang" className={formTab === 'items' ? 'active' : ''} onClick={() => setFormTab('items')}><FileText size={19}/></button><button type="button" title="Info lainnya" className={formTab === 'info' ? 'active' : ''} onClick={() => setFormTab('info')}><Info size={19}/></button></nav><div className="adjustment-body">
            {formTab === 'items' ? <><div className="adjustment-items-toolbar"><div className="adjustment-item-search"><label className="adjustment-search"><input aria-label="Cari barang pemakaian" disabled={busy} placeholder={readOnly ? 'Cari rincian barang...' : 'Cari/Pilih Barang...'} value={itemSearch} onChange={e => setItemSearch(e.target.value)}/><Search size={18}/></label>{!readOnly && !!suggestions.length && <div className="adjustment-suggestions">{suggestions.map(item => <button type="button" key={item.id} disabled={busy} onClick={() => {
              const index = form.rows.findIndex(row => row.itemId === item.id);
              if (index >= 0) void editRow(form.rows[index], index, false);
              else void editRow({ itemId: item.id, code: item.code, itemName: item.name, unit: item.unit, quantity: 1, lineNotes: '' }, form.rows.length, false);
            }}><ItemSearchOption name={item.name} code={item.code}/></button>)}</div>}</div><button type="button" className="adjustment-outline" onClick={() => setFormTab('info')}>Info lainnya <ChevronDown size={12}/></button><h2>{shown.rows.length ? `${shown.rows.length} Barang` : 'Rincian Barang'} <span>*</span></h2></div>
              <div className="app-table-scroll adjustment-table-scroll adjustment-items-table usage-items-table app-rail-table" ref={alignRailTable}><table><colgroup><col style={{ width: '20%' }}/><col style={{ width: '52%' }}/><col style={{ width: '16%' }}/><col style={{ width: '12%' }}/></colgroup><thead><tr><th>Kode #</th><th>Nama Barang</th><th>Dipakai</th><th>Satuan</th></tr></thead><tbody>{shown.rows.map((row, index) => (!readOnly || `${row.code} ${row.itemName}`.toLowerCase().includes(itemSearch.toLowerCase())) && <tr className="adjustment-clickable" key={row.itemId} onClick={() => void editRow(row, index, readOnly)}><td><button type="button" disabled={busy}>{row.code}</button></td><td title={row.itemName}>{row.itemName}</td><td className="usage-number">{number(row.quantity)}</td><td>{row.unit}</td></tr>)}</tbody></table>{!shown.rows.length && <div className="adjustment-empty">Pilih barang yang dipakai</div>}</div></> : <div className="adjustment-info">
              <h2><Info size={20}/> Info lainnya</h2>
              <label>Keperluan *<textarea aria-label="Keperluan pemakaian" readOnly={readOnly} disabled={busy} rows={3} maxLength={1000} placeholder="Contoh: Pembersihan peralatan cabang" value={shown.purpose} onChange={e => setForm(previous => ({ ...previous, purpose: e.target.value }))}/></label>
              <label>Penanggung Jawab *<input aria-label="Penanggung jawab" readOnly={readOnly} disabled={busy} maxLength={120} value={shown.responsibleName} onChange={e => setForm(previous => ({ ...previous, responsibleName: e.target.value }))}/></label>
              <div className="usage-account-field"><span>Akun Biaya Pemakaian</span><div><input readOnly aria-label="Akun biaya pemakaian" value={selectedAccountName || 'Belum diatur untuk cabang ini'} /></div><small>Mengikuti pemetaan akun pada cabang gudang.</small></div>
              {document && <><label>Dibuat oleh<input readOnly value={document.createdByName}/></label>{document.postedAt && <label>Diposting pada<input readOnly value={document.postedAt}/></label>}{document.cancellationReason && <label>Alasan pembatalan<textarea readOnly rows={3} value={document.cancellationReason}/></label>}</>}
            </div>}
          </div></div>
          <div className="usage-footer"><div className="usage-document-actions">{!readOnly ? <><button type="button" className="adjustment-outline" disabled={busy || !canSave || branchMismatch} onClick={() => void saveDraft()}>Simpan Draft</button>{!form.id && hasPermission('item_usage:post') && <button type="button" className="adjustment-primary" disabled={busy || !canSave || branchMismatch} onClick={() => void saveDraft(true)}><Check size={16}/> Simpan &amp; Posting</button>}</> : <>{document?.status === 'Draft' && <>{hasPermission('item_usage:edit') && <button type="button" className="adjustment-outline" disabled={busy} onClick={editDraft}><Pencil size={15}/> Ubah Draft</button>}{hasPermission('item_usage:post') && <button type="button" className="adjustment-primary" disabled={busy} onClick={() => setConfirmation('post')}><Check size={16}/> Posting</button>}</>}{document?.status === 'Posted' && hasPermission('item_usage:cancel') && <button type="button" className="adjustment-outline usage-cancel" disabled={busy} onClick={() => { setReason(''); setConfirmation('cancel'); }}>Batalkan Pemakaian</button>}</>}</div><span className="usage-row-count">{shown.rows.length} jenis barang</span></div>
        </div>
        <div className="adjustment-rail"><AccurateFormActionRail save={{ disabled: readOnly || busy || !canSave || branchMismatch, onClick: () => void saveDraft(), title: 'Simpan Draft' }} print={{ disabled: !readOnly, onClick: () => window.print() }} remove={document?.status === 'Draft' && hasPermission('item_usage:delete') ? { disabled: busy, onClick: () => setConfirmation('delete'), title: 'Hapus Draft' } : undefined}/></div>
      </section>}
    </div>
    {rowDialog && <div className="adjustment-modal-overlay" onKeyDown={e => { if (e.key === 'Escape') setRowDialog(null); }}><section className="adjustment-modal usage-modal" role="dialog" aria-modal="true" aria-labelledby="usage-row-title"><header><h2 id="usage-row-title"><Pencil size={16}/> Rincian Pemakaian Barang</h2><button type="button" aria-label="Tutup rincian barang" onClick={() => setRowDialog(null)}><X size={18}/></button></header><div className="adjustment-modal-content"><div className="adjustment-modal-tabs" role="tablist" aria-label="Rincian pemakaian">{(['items', 'info', 'image'] as const).map((tab, index) => <button type="button" role="tab" aria-selected={rowTab === tab} className={rowTab === tab ? 'active' : ''} key={tab} onClick={() => setRowTab(tab)}>{['Rincian Barang', 'Info Lainnya', 'Gambar'][index]}</button>)}</div>
      {rowTab === 'items' && <><label>Kode #<button type="button" className="adjustment-item-link" disabled={!hasPermission('item:view')} onClick={() => navigate(`/items?view=${encodeURIComponent(rowDialog.row.itemId)}`)}>{rowDialog.row.code}</button></label><label>Nama Barang<input readOnly value={rowDialog.row.itemName}/></label><label>Jumlah Dipakai <span>*</span><div className="adjustment-modal-quantity"><input aria-label="Jumlah dipakai" autoFocus={!rowDialog.readOnly} readOnly={rowDialog.readOnly} type="number" min="1" max="2147483647" step="1" value={rowDialog.row.quantity || ''} onChange={e => { setRowError(''); setRowDialog({ ...rowDialog, row: { ...rowDialog.row, quantity: Number(e.target.value) } }); }} onKeyDown={e => { if (e.key === 'Enter') saveRow(); }}/><input aria-label="Satuan" readOnly value={rowDialog.row.unit}/></div></label><label>Gudang<input readOnly value={document?.warehouseName || currentWarehouse?.name || ''}/></label>
      {rowDialog.readOnly && rowDialog.row.stockBefore != null ? <div className="usage-stock-preview"><span>Stok sebelum <strong>{number(rowDialog.row.stockBefore)} {rowDialog.row.unit}</strong></span><span>Dipakai <strong>{number(rowDialog.row.quantity)} {rowDialog.row.unit}</strong></span><span>Stok sesudah <strong>{number(rowDialog.row.stockBefore - rowDialog.row.quantity)} {rowDialog.row.unit}</strong></span></div> : !rowDialog.readOnly && <div className="usage-stock-preview"><span>Stok saat ini <strong>{number(rowDialog.row.stock || 0)} {rowDialog.row.unit}</strong></span><span>Dipakai <strong>{number(rowDialog.row.quantity)} {rowDialog.row.unit}</strong></span><span>Sisa <strong className={(rowDialog.row.stock || 0) < rowDialog.row.quantity ? 'usage-stock-short' : ''}>{number((rowDialog.row.stock || 0) - rowDialog.row.quantity)} {rowDialog.row.unit}</strong></span></div>}
      {!rowDialog.readOnly && (rowDialog.row.stock || 0) < rowDialog.row.quantity && <p className="usage-row-note">Stok belum cukup untuk posting. Pemakaian dapat disimpan sebagai Draft.</p>}
      </>}
      {rowTab === 'info' && <label>Keterangan<textarea aria-label="Keterangan barang" readOnly={rowDialog.readOnly} maxLength={500} rows={4} value={rowDialog.row.lineNotes} onChange={e => setRowDialog({ ...rowDialog, row: { ...rowDialog.row, lineNotes: e.target.value } })}/></label>}
      {rowTab === 'image' && <p className="adjustment-empty-image">Gambar barang belum tersedia.</p>}
      {rowError && <p role="alert" className="adjustment-message">{rowError}</p>}
    </div><footer>{!rowDialog.readOnly && rowDialog.index < form.rows.length && <button type="button" className="adjustment-outline usage-cancel" onClick={() => { setForm(previous => ({ ...previous, rows: previous.rows.filter((_, index) => index !== rowDialog.index) })); setRowDialog(null); }}>Hapus detail barang</button>}<button type="button" className="adjustment-primary" onClick={saveRow}>{rowDialog.readOnly ? 'Tutup' : 'Lanjut'}</button></footer></section></div>}
    <AccurateNotificationDialog open={confirmation !== null} title={confirmation === 'post' ? 'Posting Pemakaian Barang' : confirmation === 'cancel' ? 'Batalkan Pemakaian Barang' : confirmation === 'delete' ? 'Hapus Draft Pemakaian' : 'Tutup Perubahan Formulir'} busy={busy} cancelLabel="Kembali" confirmLabel={confirmation === 'post' ? 'Posting' : confirmation === 'cancel' ? 'Batalkan Pemakaian' : confirmation === 'delete' ? 'Hapus Draft' : 'Lanjut'} destructive={confirmation !== 'post'} inputLabel={confirmation === 'cancel' ? 'Alasan pembatalan' : undefined} inputValue={reason} onInputChange={setReason} confirmDisabled={confirmation === 'cancel' && !reason.trim()} onClose={() => setConfirmation(null)} onConfirm={() => {
      if (confirmation === 'post' || confirmation === 'cancel' || confirmation === 'delete') void processDocument(confirmation);
      else { const action = confirmation; freshEntry(); if (action === 'close') { setEntryOpen(false); setView('list'); } setConfirmation(null); }
    }}>{confirmation === 'post' ? `Posting ${selectedDocument?.usageNumber}? Stok gudang dan biaya pemakaian akan dicatat.` : confirmation === 'cancel' ? `Batalkan ${selectedDocument?.usageNumber}? Stok dikembalikan dan jurnal biaya dibalik.` : confirmation === 'delete' ? `Hapus Draft ${selectedDocument?.usageNumber}?` : 'Perubahan formulir yang belum disimpan akan dibuang.'}</AccurateNotificationDialog>
  </div>;
}
