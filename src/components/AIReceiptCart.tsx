import type { Branch, Item, Warehouse } from '../types';
import { buildReceiptLines, validateReceiptShipping, type AIReceiptDraft } from '../lib/aiGoodsReceipt';
import { MAX_RECEIPT_SHIPPING_COST, receiptDeliveryOptions, receiptShippingCostLabel } from '../lib/goodsReceiptSharing';

interface Props {
  draft: AIReceiptDraft;
  master: Item[];
  branch?: Branch;
  warehouse?: Warehouse;
  busy: boolean;
  canCreate: boolean;
  error: string;
  onChange: (draft: AIReceiptDraft) => void;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onCancel: () => void;
  onSave: () => void;
}

export default function AIReceiptCart(props: Props) {
  const { draft, master, branch, warehouse, busy, canCreate, error } = props;
  const reviewing = draft.stage === 'confirm';
  let validation = '';
  try { buildReceiptLines(draft, master); validateReceiptShipping(draft); } catch (e) { validation = (e as Error).message; }
  const ready = !validation && Boolean(branch && warehouse) && canCreate;
  const choices = draft.selection?.itemIds.map(id => master.find(item => item.id === id && item.isActive && item.type === 'Persediaan')).filter((item): item is Item => Boolean(item)) || [];
  const change = (next: AIReceiptDraft) => props.onChange({ ...next, stage: 'items' });
  const button = 'rounded-lg border border-slate-500 px-3 py-2 text-sm font-semibold disabled:opacity-40';

  return <section aria-label="Keranjang Penerimaan Barang" className="rounded-xl border-2 border-cyan-500 bg-slate-800 p-4 text-sm text-slate-100">
    <h3 className="font-bold text-cyan-300">{reviewing ? 'Konfirmasi Penerimaan Barang' : 'Daftar Penerimaan Barang'}</h3>
    <p className="mt-1 text-xs text-slate-300">{reviewing ? 'Periksa semua barang dan lokasi. Konfirmasi akan menyimpan satu penerimaan dan menambah stok.' : 'Belum disimpan. Tambahkan barang lain atau pilih Simpan jika sudah lengkap.'}</p>
    <fieldset disabled={busy} className="mt-3 space-y-3 disabled:opacity-60">
      {draft.items.map(line => {
        const item = master.find(item => item.id === line.itemId);
        return <div key={line.itemId} className="rounded-lg border border-slate-600 bg-slate-900 p-3">
          <div className="font-semibold">{item?.name || 'Barang tidak tersedia'}</div>
          <div className="font-mono text-xs text-cyan-200">{item?.code || '—'}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {reviewing ? <span>Qty: <b>{line.qty} {item?.unit}</b></span> : <>
              <label className="flex items-center gap-2">Qty <input aria-label={`Qty ${item?.name || line.itemId}`} type="number" min="1" max="2147483647" step="1" value={line.qty || ''}
                onChange={event => change({ ...draft, items: draft.items.map(row => row.itemId === line.itemId ? { ...row, qty: Number(event.target.value) } : row) })}
                className="w-24 rounded border border-slate-500 bg-slate-800 px-2 py-1 text-white" /></label><span>{item?.unit}</span>
              <button type="button" aria-label={`Hapus ${item?.name || line.itemId}`} className="ml-auto text-xs text-rose-300" onClick={() => change({ ...draft, items: draft.items.filter(row => row.itemId !== line.itemId) })}>Hapus</button>
            </>}
          </div>
        </div>;
      })}
      {!draft.items.length && <p className="text-slate-300">Belum ada barang dipilih.</p>}
      {draft.selection && <div className="space-y-2 rounded-lg border border-cyan-600 p-3">
        <p>Pilih barang untuk “{draft.selection.query}” · Qty {draft.selection.qty}</p>
        <div className="max-h-64 space-y-2 overflow-y-auto">{choices.map(item => <button type="button" key={item.id} onClick={() => props.onSelect(item.id)} className="block w-full rounded border border-slate-500 bg-slate-900 p-2 text-left hover:border-cyan-300">
          <span className="block font-mono text-xs text-cyan-300">{item.code}</span><span>{item.name}</span>
        </button>)}</div>
        {!choices.length && <p>Barang tidak lagi tersedia. Cari ulang nama atau kode barang.</p>}
      </div>}
      {draft.awaitingItem && <div className="rounded-lg bg-cyan-950 p-3 text-cyan-100">
        <p>Ketik nama atau kode barang berikutnya beserta qty di chat. Contoh: kompresor Avanza 2bh.</p>
        <button type="button" className="mt-2 text-xs underline" onClick={() => change({ ...draft, awaitingItem: false, selection: undefined })}>Batal tambah barang</button>
      </div>}
      {reviewing ? <div className="space-y-1"><p>Cabang: <b>{branch?.name || 'Belum tersedia'}</b></p><p>Gudang: <b>{warehouse?.name || 'Belum tersedia'}</b></p><p>Pengiriman via: <b>{draft.deliveryMethod}</b></p><p>Biaya kirim: <b>{receiptShippingCostLabel(draft.shippingCost)}</b></p></div> : <div className="space-y-3">
        <fieldset><legend className="mb-2">Pengiriman via *</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{receiptDeliveryOptions.map(method => <label key={method} className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-3 ${draft.deliveryMethod === method ? 'border-cyan-300 bg-cyan-950 text-cyan-100' : 'border-slate-500 bg-slate-900'}`}><input type="radio" name={`receipt-delivery-${draft.id}`} value={method} checked={draft.deliveryMethod === method} onChange={() => change({ ...draft, deliveryMethod: method })} className="accent-cyan-400" />{method}</label>)}</div></fieldset>
        <label className="block max-w-xs">Biaya kirim (Rp)<input aria-label="Biaya kirim penerimaan" type="number" inputMode="numeric" min="0" max={MAX_RECEIPT_SHIPPING_COST} step="1" value={draft.shippingCost ?? ''} onChange={event => change({ ...draft, shippingCost: event.target.value === '' ? null : Number(event.target.value) })} className="mt-1 block w-full rounded border border-slate-500 bg-slate-900 px-3 py-2 text-right text-base" /><span className="mt-1 block text-xs text-slate-300">Isi 0 jika tanpa biaya.</span></label>
      </div>}
      {validation && !draft.awaitingItem && <p role="status" className="text-amber-300">{validation}</p>}
      {!branch ? <p className="text-amber-300">Pilih cabang aktif melalui pilihan cabang di bagian atas.</p>
        : !warehouse ? <p className="text-amber-300">Gudang default untuk cabang aktif belum tersedia. Atur gudang default di Master Gudang.</p> : null}
      {!canCreate && <p className="text-amber-300">Anda tidak memiliki izin membuat Penerimaan Barang.</p>}
      {error && <p role="alert" className="text-rose-300">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} onClick={props.onCancel}>Batal Penerimaan</button>
        {reviewing ? <>
          <button type="button" className={button} onClick={() => change(draft)}>Kembali</button>
          <button type="button" disabled={!ready} className={`${button} bg-cyan-500 text-slate-950`} onClick={props.onSave}>{busy ? 'Menyimpan…' : 'Konfirmasi & Simpan'}</button>
        </> : <>
          <button type="button" className={button} disabled={!canCreate} onClick={props.onAdd}>Tambah Barang</button>
          <button type="button" disabled={!ready} className={`${button} bg-cyan-500 text-slate-950`} onClick={() => props.onChange({ ...draft, stage: 'confirm' })}>Simpan</button>
        </>}
      </div>
    </fieldset>
  </section>;
}
