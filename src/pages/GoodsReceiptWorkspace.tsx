import { memo, useCallback, useEffect, useLayoutEffect, useRef, type ReactNode, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { Navigate, Outlet, useMatch, useNavigate, useOutletContext } from 'react-router-dom';
import { List, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { localDateKey } from '../lib/date';
import type { GoodsReceiptItem } from '../types';
import AccurateNotificationDialog from '../components/AccurateNotificationDialog';
import { ui } from '../components/ui/interfaceStandards';
import GoodsReceiptPage from './GoodsReceipt';
import DocumentTabBar from '../components/DocumentTabBar';
import GoodsReceiptDetail from './GoodsReceiptDetail';

const ReceiptList = memo(GoodsReceiptPage);

type ReceiptForm = {
  date: string; doNumber: string; warehouseId: string; supplierId: string; deliveryMethod: string;
  deliveryOther: string; shippingNotes: string; shippingCost: number | null; notes: string; receivedById: string; items: GoodsReceiptItem[];
};

function restoreDraft(key: string, blank: ReceiptForm): ReceiptForm | null {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (!saved || !Array.isArray(saved.items)) return null;
    const form = { ...blank, ...saved };
    if (form.deliveryMethod === 'Diantar Supplier') form.deliveryMethod = 'Supplier';
    return form;
  } catch { return null; }
}

type ReceiptSession = {
  form: ReceiptForm;
  setForm: Dispatch<SetStateAction<ReceiptForm>>;
  renderTabs: (tools?: ReactNode, busy?: boolean) => ReactNode;
  clearDraft: () => void;
};

export const useReceiptSession = () => useOutletContext<ReceiptSession>();

export default function GoodsReceiptWorkspace() {
  const { currentUser, currentBranchId, data } = useApp();
  const previousBranch = useRef(currentBranchId);
  const detailRoute = useMatch('/receipts/view/:id');
  const branchChanged = previousBranch.current !== currentBranchId;
  useLayoutEffect(() => { previousBranch.current = currentBranchId; }, [currentBranchId]);
  if (branchChanged && detailRoute && currentBranchId !== 'ALL' &&
    data.goodsReceipts.find(receipt => receipt.id === detailRoute.params.id)?.branchId !== currentBranchId) {
    return <Navigate to="/receipts" replace/>;
  }
  const storageKey = `goods-receipt-draft:${currentUser?.id || currentUser?.username || 'user'}:${currentBranchId}`;
  return <ReceiptWorkspaceSession key={storageKey} storageKey={storageKey}/>;
}

function ReceiptWorkspaceSession({ storageKey }: { storageKey: string }) {
  const { data, currentUser, currentBranchId, hasPermission, generateReceiptNumber } = useApp();
  const isList = Boolean(useMatch('/receipts'));
  const isNew = Boolean(useMatch('/receipts/new'));
  const navigate = useNavigate();
  const canCreate = currentBranchId !== 'ALL' && hasPermission('receipt:create');
  const warehouses = data.warehouses.filter(row => row.branchId === currentBranchId && row.isActive && !row.isSystem);
  const defaultWarehouseId = (warehouses.find(row => row.isDefault) || warehouses[0])?.id || '';
  const today = localDateKey();
  const blank = useMemo<ReceiptForm>(() => ({
    date: today, doNumber: '', warehouseId: defaultWarehouseId, supplierId: '', deliveryMethod: '',
    deliveryOther: '', shippingNotes: '', shippingCost: null, notes: '', receivedById: currentUser?.id || '', items: [],
  }), [today, defaultWarehouseId, currentUser?.id]);
  const [draft, setDraft] = useState(() => canCreate ? restoreDraft(storageKey, blank) : null);
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    if (canCreate && isNew) setDraft(current => current ?? blank);
  }, [canCreate, isNew, blank]);

  useEffect(() => {
    if (!draft || !canCreate) return;
    try { localStorage.setItem(storageKey, JSON.stringify(draft)); } catch { /* Keep the draft in this workspace. */ }
  }, [draft, canCreate, storageKey]);

  const setForm: ReceiptSession['setForm'] = update => setDraft(current =>
    typeof update === 'function' ? update(current ?? blank) : update
  );
  const clearDraft = () => {
    try { localStorage.removeItem(storageKey); } catch { /* The in-memory draft can still be closed. */ }
    setDraft(null);
    setConfirmClose(false);
  };
  const discard = () => {
    clearDraft();
    if (isNew) navigate('/receipts', { replace: true });
  };
  const closeDraft = () => {
    const edited = draft && (draft.items.length > 0 || draft.date !== blank.date ||
      draft.receivedById !== blank.receivedById || draft.warehouseId !== blank.warehouseId ||
      draft.notes || draft.deliveryMethod || draft.deliveryOther || draft.shippingCost !== null ||
      draft.doNumber || draft.supplierId || draft.shippingNotes);
    if (edited) setConfirmClose(true);
    else discard();
  };

  const canView = hasPermission('receipt:view');
  const detailRoute = useMatch('/receipts/view/:id');
  const tabStorageKey = `receipt-document-tabs:${storageKey}`;
  const [documentIds, setDocumentIds] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(tabStorageKey) || '[]');
      return Array.isArray(saved) ? [...new Set(saved.filter((id): id is string => typeof id === 'string'))] : [];
    } catch { return []; }
  });
  const receiptsById = useMemo(() => new Map(data.goodsReceipts.map(receipt => [receipt.id, receipt])), [data.goodsReceipts]);
  const activeId = canView && detailRoute?.params.id && receiptsById.has(detailRoute.params.id) ? detailRoute.params.id : '';
  const [visited, setVisited] = useState<string[]>([]);
  useLayoutEffect(() => {
    if (!activeId) return;
    setDocumentIds(ids => ids.includes(activeId) ? ids : [...ids, activeId]);
    setVisited(ids => ids.includes(activeId) ? ids : [...ids, activeId]);
  }, [activeId]);
  useEffect(() => {
    try { sessionStorage.setItem(tabStorageKey, JSON.stringify(documentIds)); } catch { /* Tabs still work in this workspace. */ }
  }, [documentIds, tabStorageKey]);

  const closeGuards = useRef(new Map<string, () => boolean>());
  const registerCloseGuard = useCallback((id: string, guard: () => boolean) => {
    closeGuards.current.set(id, guard);
    return () => { closeGuards.current.delete(id); };
  }, []);
  const openDocument = (id: string, replace = false) => navigate(`/receipts/view/${encodeURIComponent(id)}`, { replace });
  const closeDocument = (id: string, deleted = false) => {
    if (!deleted && closeGuards.current.get(id)?.() === false) return;
    const remaining = documentIds.filter(value => value !== id && receiptsById.has(value));
    setDocumentIds(ids => ids.filter(value => value !== id));
    setVisited(ids => ids.filter(value => value !== id));
    if (detailRoute?.params.id !== id) return;
    const adjacent = remaining[Math.min(documentIds.indexOf(id), remaining.length - 1)];
    if (adjacent) openDocument(adjacent, true);
    else navigate(canCreate && draft ? '/receipts/new' : '/receipts', { replace: true });
  };
  const renderTabs: ReceiptSession['renderTabs'] = (tools, busy = false) => <DocumentTabBar label="Tab Penerimaan Barang" activeKey={isNew ? 'new' : activeId || 'list'}>
    {canView && <button type="button" className={`${ui.childListTab} !sticky left-0 !z-10`} title="Daftar Penerimaan" aria-label="Kembali ke daftar penerimaan"
      aria-current={isList ? 'page' : undefined} disabled={busy} onClick={() => navigate('/receipts')}><List size={20}/></button>}
    {canCreate && (draft || isNew) && <div className={isNew ? ui.childTabActive : ui.childTab}>
      <button type="button" title="Lanjutkan penerimaan" aria-current={isNew ? 'page' : undefined} disabled={busy}
        onClick={() => navigate('/receipts/new')}>{generateReceiptNumber(currentBranchId, draft?.date ?? blank.date)}</button>
      <button type="button" disabled={busy} onClick={closeDraft} aria-label="Tutup penerimaan baru"><X size={16}/></button>
    </div>}
    {canView && documentIds.map(id => {
      const receipt = receiptsById.get(id);
      if (!receipt) return null;
      const label = (receipt.sourceType === 'Transfer Gudang' && receipt.transferNumber) || receipt.receiptNumber;
      return <div key={id} className={id === activeId ? ui.childTabActive : ui.childTab}>
        <button type="button" title={label} disabled={busy} aria-current={id === activeId ? 'page' : undefined} onClick={() => openDocument(id)}>{label}</button>
        <button type="button" disabled={busy} aria-label={`Tutup ${label}`} onClick={() => closeDocument(id)}><X size={16}/></button>
      </div>;
    })}
    {tools}
  </DocumentTabBar>;
  return <>
    {canView && <ReceiptList visible={isList} tabs={isList ? renderTabs() : undefined}/>}
    {canView && visited.map(id => {
      const receipt = receiptsById.get(id);
      return receipt && <GoodsReceiptDetail key={id} receipt={receipt} active={id === activeId}
        renderTabs={id === activeId ? renderTabs : undefined} registerCloseGuard={registerCloseGuard} onDeleted={() => closeDocument(id, true)}/>;
    })}
    {canView && detailRoute && !activeId && <div className={ui.modulePage}>{renderTabs()}<div className={ui.modulePanel}>
      <p className="p-6 text-center">Penerimaan tidak ditemukan di cabang ini.</p>
    </div></div>}
    <Outlet context={{ form: draft ?? blank, setForm, renderTabs, clearDraft } satisfies ReceiptSession}/>
    {confirmClose && createPortal(<AccurateNotificationDialog open title="Buang draf penerimaan?" destructive
      confirmLabel="Buang perubahan" cancelLabel="Lanjut mengisi" onConfirm={discard}
      onClose={() => { setConfirmClose(false); if (!isNew) navigate('/receipts/new'); }}>
      Isian penerimaan ini akan dihapus dari draf cabang ini.
    </AccurateNotificationDialog>, document.body)}
  </>;
}
