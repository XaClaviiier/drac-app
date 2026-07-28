import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Plus, Car, Check, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Vehicle, Customer } from '../types';

/** Tunggu vehicle dengan id tertentu muncul di data, lalu callback. */
function useWaitForVehicle(targetId: string | null, onFound: (v: Vehicle) => void) {
  const { data } = useApp();
  useEffect(() => {
    if (!targetId) return;
    const found = data.vehicles.find(v => v.id === targetId);
    if (found) onFound(found);
  }, [data.vehicles, targetId, onFound]);
}

interface VehiclePickerProps {
  customer: Customer | null;
  value: string;
  onChange: (vehicleId: string) => void;
  onNewVehicleCreated?: (vehicle: Vehicle) => void;
}

const CAR_BRANDS = [
  'Toyota', 'Honda', 'Suzuki', 'Daihatsu', 'Mitsubishi',
  'Nissan', 'Hyundai', 'Kia', 'Wuling', 'DFSK',
  'Isuzu', 'Mazda', 'Lexus', 'BMW', 'Mercedes-Benz', 'Lainnya',
];

export default function VehiclePicker({ customer, value, onChange, onNewVehicleCreated }: VehiclePickerProps) {
  const { data, addVehicle, resolveBranchId } = useApp();
  const [inputText, setInputText] = useState('');
  const [open, setOpen] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newVehicle, setNewVehicle] = useState({
    plateNumber: '',
    brand: '',
    model: '',
    year: new Date().getFullYear(),
    color: '',
  });
  const [pendingSelectId, setPendingSelectId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Setelah addVehicle, tunggu data.vehicles terupdate lalu panggil onChange
  useWaitForVehicle(pendingSelectId, useCallback((found: Vehicle) => {
    onChange(found.id);
    setInputText(found.plateNumber);
    if (onNewVehicleCreated) onNewVehicleCreated(found);
    setPendingSelectId(null);
  }, [onChange, onNewVehicleCreated]));

  // Kendaraan milik pelanggan yang dipilih
  const customerVehicles = useMemo(() => {
    if (!customer) return [];
    return data.vehicles.filter((v) => v.customerName === customer.name);
  }, [data.vehicles, customer]);

  const selectedVehicle = data.vehicles.find((v) => v.id === value);

  // Sinkronisasi teks input dengan kendaraan terpilih
  useEffect(() => {
    if (selectedVehicle && !open) {
      setInputText(selectedVehicle.plateNumber);
    }
  }, [selectedVehicle, open]);

  // Reset saat pelanggan berubah
  useEffect(() => {
    if (!customer) {
      setInputText('');
      setOpen(false);
      setShowNewForm(false);
    }
  }, [customer]);

  // Tutup saat klik luar
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowNewForm(false);
        if (selectedVehicle) setInputText(selectedVehicle.plateNumber);
        else setInputText('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [selectedVehicle]);

  const filtered = useMemo(() => {
    const q = inputText.trim().toLowerCase().replace(/\s+/g, '');
    if (!q) return customerVehicles;
    return customerVehicles.filter((v) =>
      v.plateNumber.toLowerCase().replace(/\s+/g, '').includes(q) ||
      v.brand.toLowerCase().includes(q) ||
      v.model.toLowerCase().includes(q) ||
      v.color.toLowerCase().includes(q)
    );
  }, [customerVehicles, inputText]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.toUpperCase();
    setInputText(v);
    setOpen(true);
    setShowNewForm(false);
    if (value) onChange('');
  };

  const handleFocus = () => {
    if (!customer) return;
    setOpen(true);
    if (selectedVehicle) setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      if (selectedVehicle) setInputText(selectedVehicle.plateNumber);
    }
    if (e.key === 'Enter' && filtered.length === 1) {
      e.preventDefault();
      handleSelect(filtered[0]);
    }
  };

  const handleSelect = useCallback((vehicle: Vehicle) => {
    onChange(vehicle.id);
    setInputText(vehicle.plateNumber);
    setOpen(false);
    setShowNewForm(false);
  }, [onChange]);

  const handleCreateNew = async () => {
    if (!customer) return;
    const plate = newVehicle.plateNumber.trim().toUpperCase();
    if (!plate || !newVehicle.brand || !newVehicle.model || !newVehicle.color) {
      window.alert('Nomor plat, merek, model, dan warna wajib diisi.');
      return;
    }
    // Validasi plat belum terdaftar
    const dup = data.vehicles.find(v => v.plateNumber.replace(/\s+/g,'').toUpperCase() === plate.replace(/\s+/g,''));
    if (dup) {
      window.alert(`Plat "${plate}" sudah terdaftar atas nama ${dup.customerName}.`);
      return;
    }

    const newId = Date.now().toString();
    const today = new Date().toISOString().split('T')[0];
    const vehicle: Vehicle = {
      id: newId,
      plateNumber: plate,
      brand: newVehicle.brand,
      model: newVehicle.model,
      year: newVehicle.year || new Date().getFullYear(),
      color: newVehicle.color,
      customerName: customer.name,
      customerId: customer.customerCode,
      phone: customer.phone,
      address: customer.address,
      registrationDate: today,
      notes: '',
      branchId: resolveBranchId(),
      firstSeenBranchId: resolveBranchId(),
    };

    // Tampilkan plat di input dulu, tutup dropdown
    setInputText(plate);
    setShowNewForm(false);
    setOpen(false);
    setNewVehicle({ plateNumber: '', brand: '', model: '', year: new Date().getFullYear(), color: '' });

    // Simpan dan tunggu state update, baru panggil onChange
    await addVehicle(vehicle);
    setPendingSelectId(newId);
  };

  const disabled = !customer;

  // Apakah plat yang diketik belum ada di daftar kendaraan pelanggan ini?
  const plateTyped = inputText.trim().toUpperCase();
  const plateNotFound =
    plateTyped.length >= 3 &&
    !customerVehicles.some(v => v.plateNumber.replace(/\s+/g,'').toUpperCase() === plateTyped.replace(/\s+/g,''));

  return (
    <div className="relative" ref={wrapperRef}>
      {/* Input utama */}
      <div className="relative">
        <Car className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? 'Pilih pelanggan terlebih dahulu' : 'Ketik nomor plat kendaraan...'}
          autoComplete="off"
          className={`w-full pl-9 pr-10 py-2.5 border rounded-lg outline-none transition-colors text-sm font-mono ${
            disabled
              ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
              : selectedVehicle
              ? 'border-orange-400 bg-orange-50 font-bold text-orange-900'
              : 'border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 uppercase'
          }`}
        />
        {selectedVehicle && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              setInputText('');
              setOpen(true);
              setTimeout(() => inputRef.current?.focus(), 50);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-orange-200 text-orange-500"
            title="Ganti kendaraan"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Badge kendaraan terpilih */}
      {selectedVehicle && !open && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-600 px-1">
          <span className="font-semibold text-gray-800">{selectedVehicle.brand} {selectedVehicle.model}</span>
          <span className="text-gray-500">{selectedVehicle.year}</span>
          <span className="text-gray-500">{selectedVehicle.color}</span>
        </div>
      )}

      {/* Dropdown */}
      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
          {!showNewForm ? (
            <>
              {/* Info jumlah kendaraan */}
              <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  Kendaraan milik <strong>{customer?.name}</strong>
                </span>
                <span className="text-xs font-medium text-gray-700">{customerVehicles.length} unit</span>
              </div>

              {/* Daftar kendaraan */}
              <div className="max-h-52 overflow-y-auto">
                {filtered.length === 0 ? (
                  <div className="py-6 text-center text-sm text-gray-500">
                    <Car className="w-8 h-8 mx-auto mb-1.5 text-gray-300" />
                    {customerVehicles.length === 0
                      ? 'Belum ada kendaraan terdaftar'
                      : 'Tidak ditemukan'}
                  </div>
                ) : (
                  filtered.map((vehicle) => (
                    <button
                      key={vehicle.id}
                      type="button"
                      onClick={() => handleSelect(vehicle)}
                      className={`w-full px-4 py-2.5 flex items-center gap-3 hover:bg-orange-50 transition-colors text-left border-b border-gray-100 last:border-0 ${
                        value === vehicle.id ? 'bg-orange-50' : ''
                      }`}
                    >
                      <div className="w-9 h-9 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center text-white flex-shrink-0">
                        <Car className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-orange-700">{vehicle.plateNumber}</span>
                          <span className="text-sm font-medium text-gray-900 truncate">
                            {vehicle.brand} {vehicle.model}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">{vehicle.year} • {vehicle.color}</p>
                      </div>
                      {value === vehicle.id && <Check className="w-4 h-4 text-orange-600 flex-shrink-0" />}
                    </button>
                  ))
                )}
              </div>

              {/* Tombol daftarkan plat baru */}
              {plateNotFound && (
                <button
                  type="button"
                  onClick={() => {
                    setShowNewForm(true);
                    setNewVehicle(prev => ({ ...prev, plateNumber: plateTyped }));
                  }}
                  className="w-full px-4 py-3 bg-orange-600 hover:bg-orange-700 text-white font-semibold text-sm flex items-center justify-center gap-2 border-t border-gray-200 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Daftarkan &ldquo;{plateTyped}&rdquo; sebagai kendaraan baru?
                </button>
              )}

              {/* Tombol tambah biasa */}
              {!plateNotFound && (
                <button
                  type="button"
                  onClick={() => setShowNewForm(true)}
                  className="w-full px-4 py-3 bg-green-50 hover:bg-green-100 text-green-700 font-medium text-sm flex items-center justify-center gap-2 border-t border-gray-200 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Tambah Kendaraan Baru
                </button>
              )}
            </>
          ) : (
            /* Form kendaraan baru */
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-gray-900 text-sm">Kendaraan Baru</h4>
                  <p className="text-xs text-gray-500">Untuk {customer?.name}</p>
                </div>
                <button type="button" onClick={() => setShowNewForm(false)} className="p-1 hover:bg-gray-100 rounded">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              {/* Plat */}
              <input
                autoFocus
                type="text"
                placeholder="Nomor Plat * (contoh: DD1234AB)"
                value={newVehicle.plateNumber}
                onChange={(e) => setNewVehicle({ ...newVehicle, plateNumber: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none uppercase font-mono font-bold tracking-wider"
              />

              {/* Merek + Model */}
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newVehicle.brand}
                  onChange={(e) => setNewVehicle({ ...newVehicle, brand: e.target.value })}
                  className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none bg-white"
                >
                  <option value="">Merek *</option>
                  {CAR_BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
                <input
                  type="text"
                  placeholder="Model * (Avanza, Jazz...)"
                  value={newVehicle.model}
                  onChange={(e) => setNewVehicle({ ...newVehicle, model: e.target.value })}
                  className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                />
              </div>

              {/* Warna + Tahun */}
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Warna * (Hitam, Putih...)"
                  value={newVehicle.color}
                  onChange={(e) => setNewVehicle({ ...newVehicle, color: e.target.value })}
                  className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                />
                <input
                  type="number"
                  placeholder="Tahun (opsional)"
                  min="1990"
                  max={new Date().getFullYear() + 1}
                  value={newVehicle.year || ''}
                  onChange={(e) => setNewVehicle({ ...newVehicle, year: parseInt(e.target.value) || 0 })}
                  className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                />
              </div>

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
                  disabled={!newVehicle.plateNumber || !newVehicle.brand || !newVehicle.model || !newVehicle.color}
                  className="flex-1 rounded-lg bg-orange-600 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
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
