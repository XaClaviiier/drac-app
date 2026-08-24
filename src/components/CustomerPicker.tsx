import { useState, useMemo, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { Search, Plus, User, Check, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Customer, Vehicle } from '../types';
import { localDateKey } from '../lib/date';

interface CustomerPickerProps {
  value: string;
  onChange: (customerId: string) => void;
  onVehicleSelect?: (vehicleId: string) => void;
  onNewCustomerCreated?: (customer: Customer) => void;
  disabled?: boolean;
  selectedAction?: ReactNode;
}

const formatPlateNumber = (value?: string) => {
  const normalized = String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!normalized) return '';
  const match = normalized.match(/^([A-Z]{1,2})(\d{1,4})([A-Z]{0,3})$/);
  if (!match) return String(value || '').trim().toUpperCase();
  return [match[1], match[2], match[3]].filter(Boolean).join(' ');
};

const getVehicleLabel = (vehicle: Vehicle) => {
  const brand = (vehicle.vehicleBrandName || vehicle.brand || '').trim();
  const model = (vehicle.model || '').trim();
  if (!brand) return model;
  if (!model || model.toLowerCase().startsWith(brand.toLowerCase())) return model || brand;
  return `${brand} ${model}`;
};

const getSelectedCustomerLabel = (customer: Customer) =>
  [customer.name.trim(), customer.phone.trim()].filter(Boolean).join(' - ');

export default function CustomerPicker({ value, onChange, onVehicleSelect, onNewCustomerCreated, disabled = false, selectedAction }: CustomerPickerProps) {
  const { data, addCustomer, generateCustomerCode, resolveBranchId } = useApp();
  const [inputText, setInputText] = useState('');
  const [open, setOpen] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', address: '' });
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedCustomer = data.customers.find((c) => c.id === value);

  // Sinkronisasi input text dengan pelanggan yang dipilih
  useEffect(() => {
    if (selectedCustomer && !open) {
      setInputText(getSelectedCustomerLabel(selectedCustomer));
    }
  }, [selectedCustomer, open]);

  // Tutup dropdown saat klik luar
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowNewForm(false);
        // Kalau ada pelanggan terpilih, kembalikan teks ke namanya
        if (selectedCustomer) setInputText(getSelectedCustomerLabel(selectedCustomer));
        else setInputText('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [selectedCustomer]);

  const filtered = useMemo(() => {
    const q = inputText.trim().toLowerCase();
    return data.customers.flatMap((customer) => {
      const vehicles = data.vehicles.filter((vehicle) =>
        vehicle.customerRefId === customer.id ||
        (!vehicle.customerRefId && vehicle.customerId === customer.customerCode)
      );
      const rows: Array<{ customer: Customer; vehicle: Vehicle | null }> = vehicles.length
        ? vehicles.map((vehicle) => ({ customer, vehicle }))
        : [{ customer, vehicle: null }];
      if (!q) return rows;
      return rows.filter(({ customer: rowCustomer, vehicle }) =>
        rowCustomer.name.toLowerCase().includes(q) ||
        rowCustomer.phone.toLowerCase().includes(q) ||
        rowCustomer.customerCode.toLowerCase().includes(q) ||
        vehicle?.plateNumber.toLowerCase().includes(q)
      );
    }).slice(0, 20);
  }, [data.customers, data.vehicles, inputText]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const v = e.target.value.toUpperCase();
    setInputText(v);
    setOpen(true);
    setShowNewForm(false);
    // Reset pilihan jika user mulai mengetik lagi
    if (value) onChange('');
  };

  const handleSelect = useCallback((customer: Customer, vehicle: Vehicle | null = null) => {
    onChange(customer.id);
    if (vehicle) onVehicleSelect?.(vehicle.id);
    setInputText(getSelectedCustomerLabel(customer));
    setOpen(false);
    setShowNewForm(false);
  }, [onChange, onVehicleSelect]);

  const handleFocus = () => {
    if (disabled) return;
    setOpen(true);
    if (selectedCustomer) setInputText(''); // kosongkan agar bisa cari ulang
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      if (selectedCustomer) setInputText(getSelectedCustomerLabel(selectedCustomer));
    }
    if (e.key === 'Enter' && filtered.length === 1) {
      e.preventDefault();
      handleSelect(filtered[0].customer, filtered[0].vehicle);
    }
  };

  const handleCreateNew = async (event?: React.MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    event?.stopPropagation();
    const name = newCustomer.name.trim().toUpperCase();
    const phone = newCustomer.phone.trim();
    if (!name || !phone) {
      window.alert('Nama dan nomor HP wajib diisi.');
      return;
    }
    const normalizedPhone = phone.replace(/\D/g, '');
    const duplicatePhone = data.customers.find(
      (customer) => customer.phone.replace(/\D/g, '') === normalizedPhone
    );
    if (duplicatePhone) {
      window.alert(`Nomor HP tersebut sudah terdaftar atas nama ${duplicatePhone.name} (${duplicatePhone.customerCode}).`);
      return;
    }
    const newId = Date.now().toString();
    const today = localDateKey();

    try {
      const created = await addCustomer({
        id: newId,
        name,
        phone,
        address: newCustomer.address.trim(),
        email: '',
        createdAt: today,
        branchId: resolveBranchId(),
      });
      // Pilih langsung hasil simpan. Jangan menunggu render/refresh berikutnya karena
      // di HP hal itu sempat membuat editor WO terlihat tertutup lebih dulu.
      onChange(created.id);
      setInputText(getSelectedCustomerLabel(created));
      onNewCustomerCreated?.(created);
      setShowNewForm(false);
      setOpen(false);
      setNewCustomer({ name: '', phone: '', address: '' });
    } catch (error: any) {
      window.alert(`Gagal menyimpan pelanggan: ${error?.message || 'terjadi kesalahan'}`);
    }
  };

  const showSaveNew =
    inputText.trim().length >= 2 &&
    !data.customers.some(
      (c) => c.name.toLowerCase() === inputText.trim().toLowerCase()
    );

  return (
    <div
      className="relative"
      ref={wrapperRef}
      tabIndex={-1}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
          setShowNewForm(false);
          setInputText(selectedCustomer ? getSelectedCustomerLabel(selectedCustomer) : '');
        }
      }}
    >
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
          disabled={disabled}
          placeholder="Ketik nama, HP, atau nopol..."
          autoComplete="off"
          className={`h-[42px] w-full border rounded-lg py-0 pl-9 ${selectedCustomer && selectedAction && !disabled ? 'pr-[4.5rem]' : 'pr-10'} outline-none transition-colors text-sm ${
            disabled
              ? 'cursor-not-allowed border-gray-200 bg-gray-100 font-normal text-gray-600'
              : selectedCustomer
              ? 'border-blue-400 bg-blue-50 font-normal text-blue-900'
              : 'border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
          }`}
        />
        {selectedCustomer && selectedAction && !disabled && (
          <div className="absolute right-9 top-1/2 -translate-y-1/2">
            {selectedAction}
          </div>
        )}
        {selectedCustomer && !disabled && (
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

      {/* Dropdown */}
      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
          {!showNewForm ? (
            <>
              {/* Daftar hasil pencarian */}
              <div className="max-h-60 overflow-x-hidden overflow-y-auto">
                {filtered.length === 0 ? (
                  <div className="py-6 text-center text-sm text-gray-500">
                    <User className="w-8 h-8 mx-auto mb-1.5 text-gray-300" />
                    Tidak ditemukan data yang cocok
                  </div>
                ) : (
                  filtered.map(({ customer, vehicle }) => {
                    const vehicleLabel = vehicle ? getVehicleLabel(vehicle) : '';
                    return (
                      <button
                        key={`${customer.id}:${vehicle?.id || 'tanpa-kendaraan'}`}
                        type="button"
                        onClick={() => handleSelect(customer, vehicle)}
                        className={`flex min-h-[52px] w-full flex-col justify-center border-b border-gray-100 px-3 py-2 text-left text-sm transition-colors last:border-0 hover:bg-blue-50 ${
                          value === customer.id ? 'bg-blue-50' : ''
                        }`}
                      >
                        <span className="flex min-w-0 items-baseline gap-1.5">
                          <span className="min-w-0 truncate font-semibold text-gray-900">{customer.name}</span>
                          {vehicle && (
                            <span className="shrink-0 font-mono text-xs font-semibold text-blue-700">
                              — {formatPlateNumber(vehicle.plateNumber)}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs">
                          <span className="shrink-0 text-gray-500">{customer.phone || '-'}</span>
                          {vehicleLabel && (
                            <span className="min-w-0 truncate text-gray-600">[{vehicleLabel}]</span>
                          )}
                        </span>
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
                  className="flex h-10 w-full items-center justify-center gap-2 border-t border-gray-200 bg-blue-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
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
                  className="flex h-10 w-full items-center justify-center gap-2 border-t border-gray-200 bg-green-50 px-3 text-sm font-medium text-green-700 transition-colors hover:bg-green-100"
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
