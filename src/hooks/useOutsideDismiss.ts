import { useEffect } from 'react';

export function useOutsideDismiss(selectors: string[], onOutside: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && selectors.some(selector => target.closest(selector))) return;
      onOutside();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [enabled, onOutside, selectors]);
}
