import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Edit, Search, X } from 'lucide-react';

type ComplaintMultiSelectProps = {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  onEditOptions?: () => void;
  disabled?: boolean;
};

const parseValues = (value: string) => value
  .split(',')
  .map(entry => entry.trim())
  .filter(Boolean);

export default function ComplaintMultiSelect({
  value,
  options,
  onChange,
  onEditOptions,
  disabled = false,
}: ComplaintMultiSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = useMemo(() => parseValues(value), [value]);
  const normalizedSelected = useMemo(
    () => new Set(selected.map(entry => entry.toLocaleLowerCase('id-ID'))),
    [selected],
  );
  const filteredOptions = options.filter(option => (
    !query.trim() || option.toLocaleLowerCase('id-ID').includes(query.trim().toLocaleLowerCase('id-ID'))
  ));

  useEffect(() => {
    const closeFromOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeFromOutside);
    return () => document.removeEventListener('pointerdown', closeFromOutside);
  }, []);

  const commit = (entries: string[]) => onChange(entries.join(', '));
  const addValue = (rawValue: string) => {
    const nextValue = rawValue.trim().replace(/^,+|,+$/g, '').trim();
    if (!nextValue) return;
    if (!normalizedSelected.has(nextValue.toLocaleLowerCase('id-ID'))) {
      commit([...selected, nextValue]);
    }
    setQuery('');
    setOpen(true);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };
  const removeValue = (entry: string) => commit(selected.filter(candidate => candidate !== entry));
  const toggleOption = (option: string) => {
    if (normalizedSelected.has(option.toLocaleLowerCase('id-ID'))) removeValue(option);
    else addValue(option);
  };

  return (
    <div
      ref={rootRef}
      className="relative min-w-0 flex-1"
      tabIndex={-1}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <div
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`app-combobox-field flex w-full items-center gap-1 bg-white px-1.5 py-1 text-sm outline-none transition-colors ${
          open ? 'border-blue-500 ring-1 ring-blue-200' : 'border-gray-300'
        } ${disabled ? 'cursor-not-allowed bg-gray-100 text-gray-400' : ''}`}
        onClick={() => {
          if (disabled) return;
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {selected.map(entry => (
            <span key={entry} className="inline-flex h-7 max-w-full items-center gap-1 border border-gray-200 bg-gray-100 px-2 text-xs text-gray-700">
              <span className="truncate">{entry}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={event => { event.stopPropagation(); removeValue(entry); }}
                  className="text-gray-400 hover:text-red-600"
                  aria-label={`Hapus keluhan ${entry}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          <input
            ref={inputRef}
            value={query}
            disabled={disabled}
            onFocus={() => setOpen(true)}
            onChange={event => { setQuery(event.target.value); setOpen(true); }}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (query.trim()) addValue(query);
              } else if (event.key === 'Backspace' && !query && selected.length > 0) {
                removeValue(selected[selected.length - 1]);
              } else if (event.key === 'Escape') {
                setOpen(false);
              }
            }}
            placeholder={selected.length ? 'Cari atau ketik keluhan...' : 'Cari atau ketik keluhan...'}
            className="app-field-unstyled h-7 min-w-[180px] flex-1 border-0 bg-transparent px-1 text-sm outline-none placeholder:text-gray-400 disabled:cursor-not-allowed"
            aria-label="Cari atau ketik keluhan"
          />
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={event => { event.stopPropagation(); setOpen(current => !current); }}
          className="grid h-7 w-8 flex-shrink-0 place-items-center text-gray-700 disabled:text-gray-300"
          aria-label="Buka pilihan keluhan"
        >
          <Search className="h-4 w-4" />
        </button>
      </div>

      {open && !disabled && (
        <div className="absolute inset-x-0 top-full z-[65] border border-t-0 border-blue-300 bg-white shadow-xl" role="listbox" aria-label="Pilihan keluhan">
          <div className="max-h-52 overflow-y-auto py-1">
            {filteredOptions.map(option => {
              const checked = normalizedSelected.has(option.toLocaleLowerCase('id-ID'));
              return (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  onClick={() => toggleOption(option)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50"
                >
                  <span className={`grid h-4 w-4 place-items-center border ${checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white'}`}>
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  {option}
                </button>
              );
            })}
            {query.trim() && !options.some(option => option.toLocaleLowerCase('id-ID') === query.trim().toLocaleLowerCase('id-ID')) && (
              <button type="button" onClick={() => addValue(query)} className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2 text-left text-sm font-medium text-blue-700 hover:bg-blue-50">
                <span className="text-lg leading-none">+</span> Tambahkan “{query.trim()}”
              </button>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
            <span>Ketik bebas lalu tekan Enter</span>
            {onEditOptions && (
              <button type="button" onClick={() => { setOpen(false); onEditOptions(); }} className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline">
                <Edit className="h-3 w-3" /> Edit daftar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
