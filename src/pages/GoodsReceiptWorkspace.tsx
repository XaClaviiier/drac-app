import { memo, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { Outlet, useMatch, useNavigate, useOutletContext } from 'react-router-dom';
import { X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { localDateKey } from '../lib/date';
import type { GoodsReceiptItem } from '../types';
import AccurateNotificationDialog from '../components/AccurateNotificationDialog';
import { ui } from '../components/ui/interfaceStandards';
import GoodsReceiptPage from './GoodsReceipt';

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
  closeDraft: () => void;
  clearDraft: () => void;
};

export const useReceiptSession = () => useOutletContext<ReceiptSession>();

export default function GoodsReceiptWorkspace() {
  const { currentUser, currentBranchId } = useApp();
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

  const draftTab = isList && canCreate && draft && <div className={ui.childTab}>
    <button type="button" onClick={() => navigate('/receipts/new')} title="Lanjutkan penerimaan">{generateReceiptNumber(currentBranchId, draft.date)}</button>
    <button type="button" onClick={closeDraft} aria-label="Tutup penerimaan baru"><X className="h-4 w-4"/></button>
  </div>;
  return <>
    {hasPermission('receipt:view') && <ReceiptList visible={isList} draftTab={draftTab}/>}
    <Outlet context={{ form: draft ?? blank, setForm, closeDraft, clearDraft } satisfies ReceiptSession}/>
    {confirmClose && createPortal(<AccurateNotificationDialog open title="Buang draf penerimaan?" destructive
      confirmLabel="Buang perubahan" cancelLabel="Lanjut mengisi" onConfirm={discard}
      onClose={() => { setConfirmClose(false); if (isList) navigate('/receipts/new'); }}>
      Isian penerimaan ini akan dihapus dari draf cabang ini.
    </AccurateNotificationDialog>, document.body)}
  </>;
}
