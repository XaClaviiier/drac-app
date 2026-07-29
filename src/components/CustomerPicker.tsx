import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Search, Plus, User, Phone, Check, X, MapPin } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Customer } from '../types';

interface CustomerPickerProps {
  value: string;
  onChange: (customerId: string) => void;
  onNewCustomerCreated?: (customer: Customer) => void;
}

/**
 * Tunggu customer dengan id tertentu muncul di data, lalu callback.
 * Dipakai setelah addCustomer agar onChange dipanggil setelah state update.
 */
function useWaitForCustomer(targetId: string | null, onFound: (c: Customer) => void) {
  const { data } = useApp();
  useEffect(() => {
    if (!targetId) return;
    const found = data.customers.find(c => c.id === targetId);
    if (found) onFound(found);
  }, [data.customers, targetId, onFound]);
}

export default function CustomerPicker({ value, onChange, onNewCustomerCreated }: CustomerPickerProps) {
  const { data, addCustomer, generateCustomerCode, resolveBranchId } = useApp();
  const [inputText, setInputText] = useState('');
  const [open, setOpen] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', address: '' });
  const [pendingSelectId, setPendingSelectId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Setelah addCustomer, tunggu data.customers terupdate lalu panggil onChange
  useWaitForCustomer(pendingSelectId, useCallback((found: Customer) => {
    onChange(found.id);
    setInputText(found.name);
    if (onNewCustomerCreated) onNewCustomerCreated(found);
    setPendingSelectId(null);
  }, [onChange, onNewCustomerCreated]));

  const selectedCustomer = data.customers.find((c) => c.id === value);

  // Sinkronisasi input text dengan pelanggan yang dipilih
  useEffect(() => {
    if (selectedCustomer && !open) {
      setInputText(selectedCustomer.name);
    }
  }, [selectedCustomer, open]);

  // Tutup dropdown saat klik luar
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowNewForm(false);
        // Kalau ada pelanggan terpilih, kembalikan teks ke namanya
        if (selectedCustomer) setInputText(selectedCustomer.name);
        else setInputText('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [selectedCustomer]);

  const filtered = useMemo(() => {
    const q = inputText.trim().toLowerCase();
    if (!q) return data.customers.slice(0, 15);
    return data.customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.customerCode.toLowerCase().includes(q)
    ).slice(0, 15);
  }, [data.customers, inputText]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.toUpperCase();
    setInputText(v);
    setOpen(true);
    setShowNewForm(false);
    // Reset pilihan jika user mulai mengetik lagi
    if (value) onChange('');
  };

  const handleSelect = useCallback((customer: Customer) => {
    onChange(customer.id);
    setInputText(customer.name);
    setOpen(false);
    setShowNewForm(false);
  }, [onChange]);

  const handleFocus = () => {
    setOpen(true);
    if (selectedCustomer) setInputText(''); // kosongkan agar bisa cari ulang
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      if (selectedCustomer) setInputText(selectedCustomer.name);
    }
    if (e.key === 'Enter' && filtered.length === 1) {
      e.preventDefault();
      handleSelect(filtered[0]);
    }
  };

  const handleCreateNew = async () => {
    const name = newCustomer.name.trim().toUpperCase();
    const phone = newCustomer.phone.trim();
    if (!name || !phone) {
      window.alert('Nama dan nomor HP wajib diisi.');
      return;
    }
    const newId = Date.now().toString();
    const today = new Date().toISOString().split('T')[0];

    // Set nama di input dulu agar terlihat ada yang dipilih
    setInputText(name);
    setShowNewForm(false);
    setOpen(false);
    setNewCustomer({ name: '', phone: '', address: '' });

    // Panggil addCustomer — setelah selesai, useWaitForCustomer
    // akan mendeteksi customer baru di data dan otomatis memanggil onChange
    await addCustomer({
      id: newId,
      name,
      phone,
      address: newCustomer.address.trim(),
      email: '',
      createdAt: today,
      branchId: resolveBranchId(),
    });

    // Tandai id yang perlu di-select setelah data terupdate
    setPendingSelectId(newId);
  };

  const showSaveNew =
    inputText.trim().length >= 2 &&
    !data.customers.some(
      (c) => c.name.toLowerCase() === inputText.trim().toLowerCase()
    );

  return (
    <div className="relative" ref={wrapperRef}>
      {/* Input utama */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder="Ketik nama, HP, atau kode pelanggan..."
          autoComplete="off"
          className={`w-full pl-9 pr-10 py-2.5 border rounded-lg outline-none transition-colors text-sm ${
            selectedCustomer
              ? 'border-blue-400 bg-blue-50 font-medium text-blue-900'
              : 'border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
          }`}
        />
        {selectedCustomer && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              setInputText('');
              setOpen(true);
              setTimeout(() => inputRef.current?.focus(), 50);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-blue-200 text-blue-500"
            title="Ganti pelanggan"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Badge pelanggan terpilih */}
      {selectedCustomer && !open && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-600 px-1">
          <span className="font-mono text-blue-600 font-semibold">{selectedCustomer.customerCode}</span>
          <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{selectedCustomer.phone}</span>
          {selectedCustomer.address && (
            <span className="flex items-center gap-1 truncate max-w-xs">
              <MapPin className="w-3 h-3 flex-shrink-0" />{selectedCustomer.address}
            </span>
          )}
        </div>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
          {!showNewForm ? (
            <>
              {/* Daftar hasil pencarian */}
              <div className="max-h-60 overflow-y-auto">
                {filtered.length === 0 ? (
                  <div className="py-6 text-center text-sm text-gray-500">
                    <User className="w-8 h-8 mx-auto mb-1.5 text-gray-300" />
                    Tidak ditemukan data yang cocok
                  </div>
                ) : (
                  filtered.map((customer) => {
                    const vehs = data.vehicles.filter(v =>
                      v.customerRefId === customer.id ||
                      (!v.customerRefId && v.customerId === customer.customerCode)
                    );
                    return (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => handleSelect(customer)}
                        className={`w-full px-4 py-2.5 flex items-center gap-3 hover:bg-blue-50 transition-colors text-left border-b border-gray-100 last:border-0 ${
                          value === customer.id ? 'bg-blue-50' : ''
                        }`}
                      >
                        <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                          {customer.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900 truncate">{customer.name}</span>
                            <span className="font-mono text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded flex-shrink-0">
                              {customer.customerCode}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                            <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{customer.phone}</span>
                            {vehs.length > 0 && (
                              <span className="text-orange-600">{vehs.length} kendaraan</span>
                            )}
                          </div>
                        </div>
                        {value === customer.id && <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Tombol simpan sebagai data baru */}
              {showSaveNew && (
                <button
                  type="button"
                  onClick={() => {
                    setShowNewForm(true);
                    setNewCustomer({ name: inputText.trim().toUpperCase(), phone: '', address: '' });
                  }}
                  className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm flex items-center justify-center gap-2 border-t border-gray-200 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Simpan &ldquo;{inputText.trim()}&rdquo; sebagai data baru?
                </button>
              )}

              {/* Tombol tambah jika tidak ada input */}
              {!showSaveNew && (
                <button
                  type="button"
                  onClick={() => { setShowNewForm(true); setNewCustomer({ name: '', phone: '', address: '' }); }}
                  className="w-full px-4 py-3 bg-green-50 hover:bg-green-100 text-green-700 font-medium text-sm flex items-center justify-center gap-2 border-t border-gray-200 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Tambah Pelanggan Baru
                </button>
              )}
            </>
          ) : (
            /* Form pelanggan baru */
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-gray-900 text-sm">Pelanggan Baru</h4>
                  <p className="text-xs text-gray-500">Isi data dasar. Lengkapi nanti di menu Pelanggan.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowNewForm(false)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              {/* Auto ID */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-center justify-between text-xs">
                <span className="text-blue-700 font-medium">ID Pelanggan (Auto)</span>
                <span className="font-bold text-blue-700 font-mono">{generateCustomerCode()}</span>
              </div>

              <input
                autoFocus
                type="text"
                placeholder="Nama Pelanggan *"
                value={newCustomer.name}
                onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none uppercase font-medium"
              />
              <input
                type="tel"
                placeholder="No. Telepon / HP *"
                value={newCustomer.phone}
                onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
              <input
                type="text"
                placeholder="Alamat (opsional)"
                value={newCustomer.address}
                onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowNewForm(false)}
                  className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleCreateNew}
                  disabled={!newCustomer.name.trim() || !newCustomer.phone.trim()}
                  className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  Simpan &amp; Pilih
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
