import { useEffect } from 'react';

export function useOutsideDismiss(selectors: string[], onOutside: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && selectors.some(selector => target.closest(selector))) return;
      onOutside();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOutside();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, onOutside, selectors]);
}
