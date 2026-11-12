import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, MessageCircle, Share2, X } from 'lucide-react';

export default function ReceiptShareButton({ text, className = '' }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sharing, setSharing] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (open && text && !dialog.current?.open) dialog.current?.showModal();
    if ((!open || !text) && dialog.current?.open) dialog.current.close();
  }, [open, text]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setMessage('Teks disalin. Tempelkan pada grup tujuan.'); }
    catch { content.current?.focus(); content.current?.select(); setMessage('Pilih Salin pada teks, lalu tempelkan pada grup tujuan.'); }
  };
  const share = async () => {
    if (!navigator.share || sharing) return;
    setSharing(true); setMessage('');
    try { await navigator.share({ title: 'Penerimaan Barang', text }); }
    catch (error) {
      if ((error as Error).name !== 'AbortError') setMessage('Menu Bagikan tidak tersedia. Gunakan WhatsApp atau Salin teks.');
    } finally { setSharing(false); }
  };
  if (!text) return null;
  return <>
    <button type="button" onClick={() => { setMessage(''); setOpen(true); }} className={`inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 ${className}`}><Share2 className="h-4 w-4" />Bagikan ke grup</button>
    {createPortal(<dialog ref={dialog} onClose={() => setOpen(false)} onCancel={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }} aria-labelledby={titleId} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border-0 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-black/60">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><h2 id={titleId} className="font-semibold">Bagikan Penerimaan Barang</h2><button type="button" aria-label="Tutup Bagikan" onClick={() => dialog.current?.close()} className="rounded p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></header>
      <div className="space-y-4 p-5">
        <p className="text-sm text-slate-600">Pilih grup tujuan di WhatsApp sebelum mengirim pesan.</p>
        <textarea ref={content} readOnly aria-label="Teks penerimaan untuk dibagikan" value={text} rows={15} className="w-full resize-y rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm leading-relaxed" />
        <p role="status" className="text-sm text-slate-600">{message}</p>
        <div className="flex flex-wrap gap-2">
          <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white"><MessageCircle className="h-4 w-4" />WhatsApp</a>
          {typeof navigator.share === 'function' && <button type="button" disabled={sharing} onClick={() => void share()} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm disabled:opacity-50"><Share2 className="h-4 w-4" />Bagikan</button>}
          <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm"><Copy className="h-4 w-4" />Salin teks</button>
        </div>
      </div>
    </dialog>, document.body)}
  </>;
}
