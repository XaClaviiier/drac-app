import { useLayoutEffect, useRef, type ReactNode } from 'react';

export default function DocumentTabBar({ label, activeKey, children }: { label: string; activeKey: string; children: ReactNode }) {
  const bar = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const strip = bar.current;
    const selection = strip?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!strip || !selection) return;
    const tab = selection.closest('.app-child-tab') ?? selection;
    const bounds = tab.getBoundingClientRect();
    const viewport = strip.getBoundingClientRect();
    const listWidth = strip.querySelector('.app-child-list-tab')?.getBoundingClientRect().width ?? 0;
    const left = viewport.left + listWidth;
    if (selection.matches('.app-child-list-tab')) strip.scrollLeft = 0;
    else if (bounds.left < left) strip.scrollLeft += bounds.left - left;
    else if (bounds.right > viewport.right) strip.scrollLeft += bounds.right - viewport.right;
  }, [activeKey]);
  return <div ref={bar} aria-label={label} className="app-child-bar app-document-tab-bar inventory-list-tabs overflow-x-auto [scrollbar-width:none]">{children}</div>;
}
