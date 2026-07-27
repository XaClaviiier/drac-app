import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, ChevronDown, Plus, Car, Check, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Vehicle, Customer } from '../types';

interface VehiclePickerProps {
  customer: Customer | null;
  value: string;
  onChange: (vehicleId: string) => void;
  onNewVehicleCreated?: (vehicle: Vehicle) => void;
}

const carBrands = [
  'Toyota', 'Honda', 'Suzuki', 'Daihatsu', 'Mitsubishi',
  'Nissan', 'Hyundai', 'Kia', 'Wuling', 'DFSK', 'Isuzu', 'Mazda', 'Lainnya',
];

export default function VehiclePicker({ customer, value, onChange, onNewVehicleCreated }: VehiclePickerProps) {
  const { data, addVehicle, resolveBranchId } = useApp();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [newVehicle, setNewVehicle] = useState({
    plateNumber: '',
    brand: '',
    model: '',
    year: new Date().getFullYear(),
    color: '',
  });
  const dropdownRef = useRef<HTMLDivElement>(null);

  const customerVehicles = useMemo(() => {
    if (!customer) return [];
    return data.vehicles.filter((v) => v.customerName === customer.name);
  }, [data.vehicles, customer]);

  const selectedVehicle = data.vehicles.find((v) => v.id === value);

  const filteredVehicles = useMemo(() => {
    if (!search.trim()) return customerVehicles;
    const q = search.toLowerCase();
    return customerVehicles.filter(
      (v) =>
        v.plateNumber.toLowerCase().includes(q) ||
        v.brand.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q) ||
        v.color.toLowerCase().includes(q)
    );
  }, [customerVehicles, search]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowNewForm(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleSelect = (vehicle: Vehicle) => {
    onChange(vehicle.id);
    setOpen(false);
    setSearch('');
  };

  const handleCreateNew = () => {
    if (!customer) return;
    if (!newVehicle.plateNumber || !newVehicle.brand || !newVehicle.model || !newVehicle.color) return;
    const today = new Date().toISOString().split('T')[0];
    const vehicle: Vehicle = {
      id: Date.now().toString(),
      plateNumber: newVehicle.plateNumber.toUpperCase(),
      brand: newVehicle.brand,
      model: newVehicle.model,
      year: newVehicle.year,
      color: newVehicle.color,
      customerName: customer.name,
      customerId: customer.customerCode,
      phone: customer.phone,
      address: customer.address,
      registrationDate: today,
      notes: '',
      branchId: resolveBranchId(),
    };
    addVehicle(vehicle);
    onChange(vehicle.id);
    if (onNewVehicleCreated) onNewVehicleCreated(vehicle);
    setNewVehicle({ plateNumber: '', brand: '', model: '', year: new Date().getFullYear(), color: '' });
    setShowNewForm(false);
    setOpen(false);
    setSearch('');
  };

  const disabled = !customer;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white flex items-center justify-between text-left hover:border-blue-400 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed disabled:hover:border-gray-300"
      >
        {selectedVehicle ? (
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center text-white flex-shrink-0">
              <Car className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-gray-900 truncate">
                <span className="font-mono text-blue-700">{selectedVehicle.plateNumber}</span> - {selectedVehicle.brand} {selectedVehicle.model}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {selectedVehicle.year} • {selectedVehicle.color}
              </p>
            </div>
          </div>
        ) : (
          <span className="text-gray-500">
            {disabled ? 'Pilih pelanggan terlebih dahulu' : 'Pilih kendaraan...'}
          </span>
        )}
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && !disabled && (
        <div className="absolute z-50 mt-2 w-full bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
          {!showNewForm ? (
            <>
              <div className="p-3 border-b border-gray-200 bg-gray-50">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Cari plat, merek, model, warna..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Kendaraan milik <strong>{customer?.name}</strong> ({customerVehicles.length})
                </p>
              </div>

              <div className="max-h-64 overflow-y-auto">
                {filteredVehicles.length === 0 ? (
                  <div className="p-6 text-center text-gray-500 text-sm">
                    <Car className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    {customerVehicles.length === 0
                      ? 'Belum ada kendaraan terdaftar untuk pelanggan ini'
                      : 'Tidak ada kendaraan ditemukan'}
                  </div>
                ) : (
                  filteredVehicles.map((vehicle) => (
                    <button
                      key={vehicle.id}
                      type="button"
                      onClick={() => handleSelect(vehicle)}
                      className={`w-full px-4 py-2.5 flex items-center gap-3 hover:bg-blue-50 transition-colors text-left ${
                        value === vehicle.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="w-9 h-9 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center text-white flex-shrink-0">
                        <Car className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-blue-700">{vehicle.plateNumber}</span>
                          <span className="text-sm font-medium text-gray-900">
                            {vehicle.brand} {vehicle.model}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">
                          {vehicle.year} • {vehicle.color}
                        </p>
                      </div>
                      {value === vehicle.id && <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                    </button>
                  ))
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowNewForm(true)}
                className="w-full p-3 bg-green-50 hover:bg-green-100 text-green-700 font-medium text-sm flex items-center justify-center gap-2 border-t border-gray-200 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Tambah Kendaraan Baru
              </button>
            </>
          ) : (
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-gray-900 text-sm">
                  Kendaraan Baru - {customer?.name}
                </h4>
                <button
                  type="button"
                  onClick={() => setShowNewForm(false)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              <input
                type="text"
                placeholder="Nomor Plat * (DD1234AB)"
                value={newVehicle.plateNumber}
                onChange={(e) => setNewVehicle({ ...newVehicle, plateNumber: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none uppercase font-mono"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newVehicle.brand}
                  onChange={(e) => setNewVehicle({ ...newVehicle, brand: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none bg-white"
                >
                  <option value="">Merek *</option>
                  {carBrands.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Model *"
                  value={newVehicle.model}
                  onChange={(e) => setNewVehicle({ ...newVehicle, model: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="Tahun"
                  min="1990"
                  max={new Date().getFullYear() + 1}
                  value={newVehicle.year}
                  onChange={(e) => setNewVehicle({ ...newVehicle, year: parseInt(e.target.value) || new Date().getFullYear() })}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                />
                <input
                  type="text"
                  placeholder="Warna *"
                  value={newVehicle.color}
                  onChange={(e) => setNewVehicle({ ...newVehicle, color: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                />
              </div>
              <button
                type="button"
                onClick={handleCreateNew}
                disabled={!newVehicle.plateNumber || !newVehicle.brand || !newVehicle.model || !newVehicle.color}
                className="w-full py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                Simpan & Pilih Kendaraan
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
