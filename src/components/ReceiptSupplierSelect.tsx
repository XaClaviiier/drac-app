import { useState } from 'react';
import { Check, LoaderCircle, LockKeyhole } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { GoodsReceipt, Supplier } from '../types';

export default function ReceiptSupplierSelect({ receipt, suppliers, canEdit, linked }: {
  receipt: GoodsReceipt;
  suppliers: Supplier[];
  canEdit: boolean;
  linked: boolean;
}) {
  const { assignGoodsReceiptSupplier, refreshData } = useApp();
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const invoiced = linked || receipt.status === 'Sebagian' || receipt.status === 'Difakturkan'
    || receipt.items.some(item => item.qtyInvoiced > 0);
  if (receipt.sourceType === 'Transfer Gudang') return <span className="text-xs text-slate-400">Transfer gudang</span>;
  if (!canEdit || invoiced || receipt.status === 'Batal') return <span
    title={invoiced ? 'Supplier terkunci karena penerimaan sudah difakturkan' : undefined}
    className="flex items-center gap-1.5 text-xs text-slate-600">
    {invoiced && <LockKeyhole className="h-3.5 w-3.5 shrink-0"/>}
    {receipt.supplierName || 'Belum ditentukan'}
  </span>;
  const assign = async (supplierId: string) => {
    if (saving || supplierId === (receipt.supplierId || '')) return;
    setSaving(true); setError(''); setFeedback('');
    try {
      await assignGoodsReceiptSupplier(receipt.id, supplierId, receipt.supplierId || '');
      setFeedback('Tersimpan');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Gagal menyimpan supplier');
      await refreshData();
    } finally { setSaving(false); }
  };
  return <div className="min-w-48" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    <div className="flex items-center gap-1.5">
      <select aria-label={`Supplier ${receipt.receiptNumber}`} value={receipt.supplierId || ''}
        disabled={saving} onChange={event => void assign(event.target.value)}
        className={`h-9 w-full min-w-0 rounded border bg-white px-2 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-60 ${receipt.supplierId ? 'border-slate-300 text-slate-800' : 'border-amber-300 text-amber-800'}`}>
        <option value="">Belum ditentukan</option>
        {receipt.supplierId && !suppliers.some(supplier => supplier.id === receipt.supplierId) &&
          <option value={receipt.supplierId} disabled>{receipt.supplierName || receipt.supplierId} (nonaktif)</option>}
        {suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>[{supplier.code}] {supplier.name}</option>)}
      </select>
      {saving && <LoaderCircle aria-label="Menyimpan supplier" className="h-4 w-4 shrink-0 animate-spin text-blue-600"/>}
      {!saving && feedback && <Check aria-label={feedback} className="h-4 w-4 shrink-0 text-green-600"/>}
    </div>
    <span role="status" className="sr-only">{saving ? 'Menyimpan supplier' : feedback}</span>
    {error && <p role="alert" className="mt-1 max-w-64 text-xs text-red-600">{error}</p>}
  </div>;
}
