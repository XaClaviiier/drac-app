import { useEffect, useState } from 'react';
import type { DragEvent, MouseEvent as ReactMouseEvent } from 'react';

export type TableSort<K extends string> = { key: K; direction: 'asc' | 'desc' } | null;

type StoredTableLayout<K extends string> = {
  order?: K[];
  widths?: Partial<Record<K, number>>;
  sort?: TableSort<K>;
};

export function useConfigurableTable<K extends string>({
  storageKey,
  defaultOrder,
  defaultWidths,
  sortableKeys,
  fixedRightKeys = [],
}: {
  storageKey: string;
  defaultOrder: K[];
  defaultWidths: Record<K, number>;
  sortableKeys: K[];
  fixedRightKeys?: K[];
}) {
  const [order, setOrder] = useState<K[]>(defaultOrder);
  const [widths, setWidths] = useState<Record<K, number>>(defaultWidths);
  const [sort, setSort] = useState<TableSort<K>>(null);
  const [isDesktop, setIsDesktop] = useState(() => typeof window === 'undefined' || window.matchMedia('(min-width: 1024px)').matches);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const normalizeOrder = (candidate: K[]) => {
    const allowed = new Set(defaultOrder);
    const fixed = new Set(fixedRightKeys);
    const unique = Array.from(new Set(candidate.filter(key => allowed.has(key) && !fixed.has(key))));
    defaultOrder.forEach(key => {
      if (!fixed.has(key) && !unique.includes(key)) unique.push(key);
    });
    return [...unique, ...fixedRightKeys.filter(key => allowed.has(key))];
  };

  const persist = (nextOrder: K[], nextWidths: Record<K, number>, nextSort: TableSort<K>) => {
    localStorage.setItem(storageKey, JSON.stringify({ order: nextOrder, widths: nextWidths, sort: nextSort }));
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) {
        setOrder(defaultOrder);
        setWidths(defaultWidths);
        setSort(null);
        return;
      }
      const parsed = JSON.parse(saved) as StoredTableLayout<K>;
      const nextOrder = normalizeOrder(Array.isArray(parsed.order) ? parsed.order : defaultOrder);
      const nextWidths = { ...defaultWidths, ...(parsed.widths || {}) };
      const nextSort = parsed.sort && sortableKeys.includes(parsed.sort.key) ? parsed.sort : null;
      setOrder(nextOrder);
      setWidths(nextWidths);
      setSort(nextSort);
    } catch {
      setOrder(defaultOrder);
      setWidths(defaultWidths);
      setSort(null);
    }
    // Konfigurasi modul berupa konstanta; storageKey adalah pemicu migrasi antar pengguna.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const moveColumn = (source: K, target: K) => {
    if (source === target || fixedRightKeys.includes(source) || fixedRightKeys.includes(target)) return;
    setOrder(current => {
      const next = current.filter(key => key !== source);
      next.splice(next.indexOf(target), 0, source);
      const normalized = normalizeOrder(next);
      persist(normalized, widths, sort);
      return normalized;
    });
  };

  const toggleSort = (key: K) => {
    if (!sortableKeys.includes(key)) return;
    setSort(current => {
      const next: TableSort<K> = !current || current.key !== key
        ? { key, direction: 'asc' }
        : current.direction === 'asc'
          ? { key, direction: 'desc' }
          : null;
      persist(order, widths, next);
      return next;
    });
  };

  const beginResize = (event: ReactMouseEvent, key: K) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = widths[key] || defaultWidths[key];
    let finalWidth = startWidth;
    const onMove = (moveEvent: MouseEvent) => {
      finalWidth = Math.max(72, Math.min(640, startWidth + moveEvent.clientX - startX));
      setWidths(current => ({ ...current, [key]: finalWidth }));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const next = { ...widths, [key]: finalWidth };
      setWidths(next);
      persist(order, next, sort);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const resetWidth = (key: K) => {
    const next = { ...widths, [key]: defaultWidths[key] };
    setWidths(next);
    persist(order, next, sort);
  };

  const resetLayout = () => {
    setOrder(defaultOrder);
    setWidths(defaultWidths);
    setSort(null);
    persist(defaultOrder, defaultWidths, null);
  };

  return { order, widths, sort, isDesktop, moveColumn, toggleSort, beginResize, resetWidth, resetLayout };
}

export function ConfigurableTableHeaderCell<K extends string>({
  columnKey,
  label,
  sortable,
  movable,
  sort,
  align = 'left',
  stickyRight = false,
  onMove,
  onSort,
  onResize,
  onResetWidth,
}: {
  columnKey: K;
  label: string;
  sortable: boolean;
  movable: boolean;
  sort: TableSort<K>;
  align?: 'left' | 'center' | 'right';
  stickyRight?: boolean;
  onMove: (source: K, target: K) => void;
  onSort: (key: K) => void;
  onResize: (event: ReactMouseEvent, key: K) => void;
  onResetWidth: (key: K) => void;
}) {
  const direction = sort?.key === columnKey ? sort.direction : null;
  const alignment = align === 'right' ? 'justify-end text-right' : align === 'center' ? 'justify-center text-center' : 'justify-start text-left';
  return (
    <th
      draggable={movable}
      onDragStart={(event: DragEvent<HTMLTableCellElement>) => event.dataTransfer.setData('text/x-drac-column', columnKey)}
      onDragOver={(event) => { if (movable) event.preventDefault(); }}
      onDrop={(event) => {
        event.preventDefault();
        const source = event.dataTransfer.getData('text/x-drac-column') as K;
        if (source) onMove(source, columnKey);
      }}
      aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : undefined}
      className={`group relative select-none px-3 font-semibold ${stickyRight ? 'sticky right-0 z-20 bg-blue-800' : ''}`}
      title={movable ? 'Tarik untuk memindahkan kolom' : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        disabled={!sortable}
        className={`flex w-full items-center gap-1 ${alignment} ${sortable ? 'cursor-pointer' : 'cursor-default'}`}
        title={sortable ? 'Klik untuk mengurutkan: naik, turun, lalu kembali default' : undefined}
      >
        <span className="truncate">{label}</span>
        {sortable && <span className={`text-[9px] ${direction ? 'text-white' : 'text-blue-200'}`}>{direction === 'asc' ? '▲' : direction === 'desc' ? '▼' : '↕'}</span>}
      </button>
      {!stickyRight && (
        <span
          role="separator"
          aria-label={`Ubah lebar ${label}`}
          onMouseDown={(event) => onResize(event, columnKey)}
          onDoubleClick={() => onResetWidth(columnKey)}
          className="absolute inset-y-0 right-0 w-1 cursor-col-resize border-r border-blue-500/70 opacity-40 hover:bg-blue-300 group-hover:opacity-100"
          title="Tarik untuk mengubah lebar · klik dua kali untuk reset"
        />
      )}
    </th>
  );
}
