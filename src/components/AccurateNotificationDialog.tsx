import { useEffect, type ReactNode } from 'react';
import { AlertTriangle, X } from 'lucide-react';

type AccurateNotificationDialogProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export default function AccurateNotificationDialog({
  open,
  title,
  children,
  confirmLabel = 'OK',
  cancelLabel,
  destructive = false,
  busy = false,
  onConfirm,
  onClose,
}: AccurateNotificationDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [busy, onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="accurate-notification-title">
      <div className="w-full max-w-xl overflow-hidden rounded-md bg-white shadow-2xl">
        <header className="flex min-h-14 items-center justify-between bg-[#0d3264] px-4 py-3 text-white sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <h3 id="accurate-notification-title" className="truncate text-base font-semibold">{title}</h3>
          </div>
          <button type="button" disabled={busy} onClick={onClose} className="rounded p-1 hover:bg-white/10 disabled:cursor-wait disabled:opacity-50" aria-label="Tutup">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid gap-4 px-5 py-5 sm:grid-cols-[84px_minmax(0,1fr)] sm:gap-5 sm:px-6">
          <div className="flex items-start justify-center">
            <AlertTriangle className="h-16 w-16 fill-red-500 text-[#0d3264] stroke-[1.8]" />
          </div>
          <div className="min-w-0 self-center text-[15px] leading-6 text-gray-800 sm:text-base">
            {children}
          </div>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-4 sm:px-6">
          <div>
            {cancelLabel && (
              <button type="button" disabled={busy} onClick={onClose} className="rounded border border-gray-300 bg-white px-5 py-2.5 font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-50">
                {cancelLabel}
              </button>
            )}
          </div>
          <button
            type="button"
            autoFocus
            disabled={busy}
            onClick={onConfirm}
            className={`min-w-24 rounded px-6 py-2.5 font-semibold text-white disabled:cursor-wait disabled:opacity-60 ${destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-[#1f4fa3] hover:bg-blue-800'}`}
          >
            {busy ? 'Memproses…' : confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
