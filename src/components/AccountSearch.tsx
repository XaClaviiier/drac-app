import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';

export type AccountSearchOption = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  accountType?: string;
  detailType?: string;
};

const accountGroups: Record<string, string> = {
  Asset: 'Aset (umum)', Liability: 'Liabilitas (umum)', Equity: 'Modal (umum)',
  Revenue: 'Pendapatan (umum)', Expense: 'Beban (umum)',
};
const typeLabel = (account: AccountSearchOption) => account.detailType?.trim()
  || accountGroups[account.accountType || ''] || account.accountType || 'Tipe belum diisi';

export default function AccountSearch({ accounts, disabled = false, onSelect }: {
  accounts: AccountSearchOption[];
  disabled?: boolean;
  onSelect: (account: AccountSearchOption) => void;
}) {
  const listId = useId();
  const fieldRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 280 });
  const expanded = open && !disabled;
  const matches = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase('id-ID').split(/\s+/).filter(Boolean);
    return accounts.filter(account => account.isActive && terms.every(term =>
      `${account.name} ${account.code} ${typeLabel(account)}`.toLocaleLowerCase('id-ID').includes(term)));
  }, [accounts, query]);

  // A portal keeps the dropdown clear of the document's scrolling table/panel.
  useLayoutEffect(() => {
    if (!expanded) return;
    const place = () => {
      const rect = fieldRef.current?.getBoundingClientRect();
      if (!rect || !rect.width || rect.bottom <= 0 || rect.top >= window.innerHeight) {
        setOpen(false);
        return;
      }
      const below = Math.max(0, window.innerHeight - rect.bottom - 12);
      const above = Math.max(0, rect.top - 12);
      const upward = below < 160 && above > below;
      const height = Math.min(280, upward ? above : below);
      const width = Math.min(rect.width, window.innerWidth - 16);
      setPosition({
        top: upward ? rect.top - 4 : rect.bottom + 4,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        width, maxHeight: height,
      });
      if (listRef.current) listRef.current.style.transform = upward ? 'translateY(-100%)' : '';
    };
    const onScroll = (event: Event) => {
      if (!listRef.current?.contains(event.target as Node)) place();
    };
    const observer = new ResizeObserver(place);
    if (fieldRef.current) observer.observe(fieldRef.current);
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!fieldRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [expanded]);

  useEffect(() => {
    if (!expanded || activeIndex < 0) return;
    const list = listRef.current;
    const option = document.getElementById(`${listId}-${activeIndex}`);
    if (!list || !option) return;
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
    }
  }, [expanded, activeIndex, listId]);

  const select = (account: AccountSearchOption) => {
    if (disabled || !account.isActive) return;
    onSelect(account);
    setQuery('');
    setActiveIndex(-1);
    inputRef.current?.focus();
    setOpen(false);
  };

  return <div className="app-account-search" ref={fieldRef}
    onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)
        && !listRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}>
    <input ref={inputRef} role="combobox" aria-label="Cari akun perkiraan"
      aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={expanded}
      aria-controls={expanded ? listId : undefined}
      aria-activedescendant={expanded && matches[activeIndex] ? `${listId}-${activeIndex}` : undefined}
      autoComplete="off" placeholder="Cari/Pilih Akun Perkiraan..." value={query} disabled={disabled}
      onFocus={() => { setOpen(true); setActiveIndex(-1); }}
      onClick={() => setOpen(true)}
      onChange={event => { setQuery(event.target.value); setActiveIndex(-1); setOpen(true); if (listRef.current) listRef.current.scrollTop = 0; }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          setOpen(true);
          setActiveIndex(index => !expanded || index < 0
            ? event.key === 'ArrowDown' ? 0 : matches.length - 1
            : Math.max(0, Math.min(matches.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
        } else if (expanded && (event.key === 'Home' || event.key === 'End')) {
          event.preventDefault();
          setActiveIndex(event.key === 'Home' ? 0 : matches.length - 1);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          const match = matches[activeIndex >= 0 ? activeIndex : query.trim() ? 0 : -1];
          if (expanded && match) select(match);
          else setOpen(true);
        } else if (event.key === 'Escape') {
          if (expanded) { event.preventDefault(); event.stopPropagation(); }
          setOpen(false);
        } else if (event.key === 'Tab') setOpen(false);
      }} />
    <button type="button" className="app-account-search-toggle" aria-label="Buka daftar akun perkiraan"
      aria-expanded={expanded} aria-controls={expanded ? listId : undefined} disabled={disabled}
      onClick={() => { inputRef.current?.focus(); setOpen(true); setActiveIndex(-1); }}><Search size={20} /></button>
    {expanded && createPortal(<div ref={listRef} id={listId} role="listbox" aria-label="Daftar akun perkiraan"
      className="app-account-search-options" style={position}>
      {matches.map((account, index) => <div key={account.id} id={`${listId}-${index}`} role="option"
        aria-selected={index === activeIndex} className="app-account-search-option"
        onMouseMove={() => setActiveIndex(index)} onMouseDown={event => event.preventDefault()}
        onClick={() => select(account)}>
        <span className="app-account-search-name">{account.name}</span>
        <span className="app-account-search-meta"><span>{account.code}</span><em>{typeLabel(account)}</em></span>
      </div>)}
      {!matches.length && <div className="app-account-search-empty" role="status">
        {query.trim() ? 'Tidak ada akun yang cocok. Coba nama, kode, atau tipe akun lain.' : 'Belum ada akun aktif yang tersedia.'}
      </div>}
    </div>, document.body)}
  </div>;
}
