import { useEffect } from 'react';

/**
 * Aturan baku kanvas dokumen Accurate pada desktop.
 *
 * Saat Data Baru/Edit terbuka, scroll halaman luar dikunci dan dikembalikan
 * ke posisi atas. Komponen form boleh menyediakan scroll internalnya sendiri.
 * Daftar kembali normal segera setelah dokumen ditutup atau layar menjadi HP.
 */
export function useAccurateDocumentCanvas(open: boolean) {
  useEffect(() => {
    const page = document.querySelector<HTMLElement>('main.app-page-scroll');
    if (!page) return;

    const desktop = window.matchMedia('(min-width: 1024px)');
    const syncDocumentScroll = () => {
      const shouldLock = open && desktop.matches;
      page.classList.toggle('app-page-scroll--document-locked', shouldLock);
      if (shouldLock) page.scrollTop = 0;
    };

    syncDocumentScroll();
    desktop.addEventListener('change', syncDocumentScroll);
    return () => {
      desktop.removeEventListener('change', syncDocumentScroll);
      page.classList.remove('app-page-scroll--document-locked');
    };
  }, [open]);
}
