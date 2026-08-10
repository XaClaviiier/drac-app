import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Plus, Car, Check, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Vehicle, Customer } from '../types';
import { vehicleBrands, vehicleColors, vehicleModels, vehicleYears } from '../lib/vehicleCatalog';
import { localDateKey } from '../lib/date';
import { api } from '../lib/apiClient';

type QuickCatalogGeneration = { id: string; name: string; isActive: boolean; yearFrom?: number | null; yearTo?: number | null; engineCcs: number[] };
type QuickCatalogModel = { id: string; name: string; isActive: boolean; generations?: QuickCatalogGeneration[] };
type QuickCatalogBrand = { id: string; name: string; isActive: boolean; models: QuickCatalogModel[] };

interface VehiclePickerProps {
  customer: Customer | null;
  value: string;
  onChange: (vehicleId: string) => void;
  onNewVehicleCreated?: (vehicle: Vehicle) => void;
}

const normalizePlate = (value: string) => value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

export default function VehiclePicker({ customer, value, onChange, onNewVehicleCreated }: VehiclePickerProps) {
  const { data, addVehicle, resolveBranchId } = useApp();
  const [inputText, setInputText] = useState('');
  const [open, setOpen] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [catalogBrands, setCatalogBrands] = useState<QuickCatalogBrand[]>([]);
  const [newVehicle, setNewVehicle] = useState({
    plateNumber: '',
    brand: '',
    model: '',
    generationId: '',
    generationName: '',
    engineCc: 0,
    year: 0,
    color: '',
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void api.get<{ brands: QuickCatalogBrand[] }>('vehicle-catalog').then(response => {
      if (response.success && response.data?.brands) setCatalogBrands(response.data.brands);
    });
  }, []);

  const activeBrands: QuickCatalogBrand[] = catalogBrands.length ? catalogBrands.filter(brand => brand.isActive) : vehicleBrands.map(name => ({ id: name, name, isActive: true, models: (vehicleModels[name] || []).map(model => ({ id: model, name: model, isActive: true, generations: [] })) }));
  const activeModels = (activeBrands.find(brand => brand.name === newVehicle.brand)?.models || []).filter(model => model.isActive);
  const activeGenerations = (activeModels.find(model => model.name === newVehicle.model)?.generations || []).filter(generation => generation.isActive);
  const selectedGeneration = activeGenerations.find(generation => generation.id === newVehicle.generationId);

  // Kendaraan milik pelanggan yang dipilih
  const customerVehicles = useMemo(() => {
    if (!customer) return [];
    return data.vehicles.filter((v) =>
      v.customerRefId === customer.id ||
      (!v.customerRefId && v.customerId === customer.customerCode)
    );
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
    const q = normalizePlate(inputText).toLowerCase();
    if (!q) return customerVehicles;
    return customerVehicles.filter((v) =>
      normalizePlate(v.plateNumber).toLowerCase().includes(q) ||
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

  const handleCreateNew = async (event?: React.MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    event?.stopPropagation();
    if (!customer) return;
    const plate = normalizePlate(newVehicle.plateNumber);
    if (!plate || !newVehicle.brand || !newVehicle.model || !newVehicle.color) {
      window.alert('Nomor plat, merek, model, dan warna wajib diisi.');
      return;
    }
    const catalogBrand = activeBrands.find(brand => brand.name === newVehicle.brand);
    const catalogModel = activeModels.find(model => model.name === newVehicle.model);
    if (!catalogBrand || !catalogModel) {
      window.alert('Pilih merek dan tipe dari Master Kendaraan. Master dapat ditambah melalui modul Register Kendaraan.');
      return;
    }
    // Validasi plat belum terdaftar
    const dup = data.vehicles.find(v => normalizePlate(v.plateNumber) === plate);
    if (dup) {
      window.alert(`Plat "${plate}" sudah terdaftar atas nama ${dup.customerName}.`);
      return;
    }

    const newId = Date.now().toString();
    const today = localDateKey();
    const vehicle: Vehicle = {
      id: newId,
      plateNumber: plate,
      brand: newVehicle.brand,
      model: newVehicle.model,
      brandId: catalogBrand.id,
      modelId: catalogModel.id,
      generationId: selectedGeneration?.id,
      generationName: selectedGeneration?.name || '',
      engineCc: newVehicle.engineCc || null,
      year: newVehicle.year || 0,
      color: newVehicle.color,
      customerRefId: customer.id,
      customerName: customer.name,
      customerId: customer.customerCode,
      phone: customer.phone,
      address: customer.address,
      registrationDate: today,
      notes: '',
      branchId: resolveBranchId(),
      firstSeenBranchId: resolveBranchId(),
    };

    try {
      await addVehicle(vehicle);
      // Tetap berada di editor WO dan langsung gunakan kendaraan yang baru dibuat.
      onChange(vehicle.id);
      setInputText(vehicle.plateNumber);
      onNewVehicleCreated?.(vehicle);
      setShowNewForm(false);
      setOpen(false);
      setNewVehicle({ plateNumber: '', brand: '', model: '', generationId: '', generationName: '', engineCc: 0, year: 0, color: '' });
    } catch (error: any) {
      window.alert(`Gagal menyimpan kendaraan: ${error?.message || 'terjadi kesalahan'}`);
    }
  };

  const disabled = !customer;

  // Apakah plat yang diketik belum ada di daftar kendaraan pelanggan ini?
  const plateTyped = inputText.trim().toUpperCase();
  const plateNotFound =
    plateTyped.length >= 3 &&
    !customerVehicles.some(v => normalizePlate(v.plateNumber) === normalizePlate(plateTyped));

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
                        <p className="text-xs text-gray-500">{vehicle.year ? `${vehicle.year} • ` : ''}{vehicle.color}</p>
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
                  onChange={(e) => setNewVehicle({ ...newVehicle, brand: e.target.value, model: '', generationId: '', generationName: '', engineCc: 0 })}
                  className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none bg-white"
                >
                  <option value="">Merek *</option>
                  {activeBrands.map((brand) => <option key={brand.id} value={brand.name}>{brand.name}</option>)}
                </select>
                <select
                  value={newVehicle.model}
                  onChange={(e) => setNewVehicle({ ...newVehicle, model: e.target.value, generationId: '', generationName: '', engineCc: 0 })}
                  disabled={!newVehicle.brand}
                  className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none bg-white"
                >
                  <option value="">{newVehicle.brand ? 'Tipe/model *' : 'Pilih merek dahulu'}</option>
                  {activeModels.map((model) => <option key={model.id} value={model.name}>{model.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select value={newVehicle.generationId} onChange={event=>{const generation=activeGenerations.find(item=>item.id===event.target.value);setNewVehicle({...newVehicle,generationId:event.target.value,generationName:generation?.name||'',engineCc:0});}} disabled={!newVehicle.model} className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm disabled:bg-gray-100"><option value="">Generasi belum diketahui</option>{activeGenerations.map(generation=><option key={generation.id} value={generation.id}>{generation.name}</option>)}</select>
                <select value={newVehicle.engineCc} onChange={event=>setNewVehicle({...newVehicle,engineCc:Number(event.target.value)||0})} disabled={!selectedGeneration} className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm disabled:bg-gray-100"><option value={0}>CC belum diketahui</option>{(selectedGeneration?.engineCcs||[]).map(cc=><option key={cc} value={cc}>{(cc/1000).toLocaleString('id-ID',{maximumFractionDigits:1})}L / {cc}cc</option>)}</select>
              </div>

              {/* Warna + Tahun */}
              <div className="grid grid-cols-2 gap-2">
                <input
                  list="quick-vehicle-color-options"
                  value={newVehicle.color}
                  onChange={(e) => setNewVehicle({ ...newVehicle, color: e.target.value })}
                  placeholder="Warna *"
                  className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                />
                <datalist id="quick-vehicle-color-options">
                  {vehicleColors.map((color) => <option key={color} value={color} />)}
                </datalist>
                <select
                  value={newVehicle.year}
                  onChange={(e) => setNewVehicle({ ...newVehicle, year: parseInt(e.target.value) || 0 })}
                  className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                >
                  <option value={0}>Tahun (opsional)</option>
                  {vehicleYears.filter(year => !selectedGeneration || ((!selectedGeneration.yearFrom || year >= selectedGeneration.yearFrom) && (!selectedGeneration.yearTo || year <= selectedGeneration.yearTo))).map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
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
