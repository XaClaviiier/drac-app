import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, ChevronDown, Plus, User, Phone, Check, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Customer } from '../types';

// eslint-disable-next-line @typescript-eslint/no-unused-vars

interface CustomerPickerProps {
  value: string;
  onChange: (customerId: string) => void;
  onNewCustomerCreated?: (customer: Customer) => void;
}

export default function CustomerPicker({ value, onChange, onNewCustomerCreated }: CustomerPickerProps) {
  const { data, addCustomer, generateCustomerCode, resolveBranchId } = useApp();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '', address: '' });
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedCustomer = data.customers.find((c) => c.id === value);

  const filteredCustomers = useMemo(() => {
    if (!search.trim()) return data.customers;
    const q = search.toLowerCase();
    return data.customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(search) ||
        c.customerCode.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
    );
  }, [data.customers, search]);

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

  const handleSelect = (customer: Customer) => {
    onChange(customer.id);
    setOpen(false);
    setSearch('');
  };

  const handleCreateNew = async () => {
    if (!newCustomer.name || !newCustomer.phone) return;
    const today = new Date().toISOString().split('T')[0];
    const created = await addCustomer({
      id: Date.now().toString(),
      name: newCustomer.name.toUpperCase(),
      phone: newCustomer.phone,
      email: newCustomer.email,
      address: newCustomer.address,
      createdAt: today,
      branchId: resolveBranchId(),
    });
    onChange(created.id);
    if (onNewCustomerCreated) onNewCustomerCreated(created);
    setNewCustomer({ name: '', phone: '', email: '', address: '' });
    setShowNewForm(false);
    setOpen(false);
    setSearch('');
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white flex items-center justify-between text-left hover:border-blue-400 transition-colors"
      >
        {selectedCustomer ? (
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {selectedCustomer.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-gray-900 truncate">{selectedCustomer.name}</p>
              <p className="text-xs text-gray-500 truncate">
                <span className="font-mono text-blue-600">{selectedCustomer.customerCode}</span> • {selectedCustomer.phone}
              </p>
            </div>
          </div>
        ) : (
          <span className="text-gray-500">Pilih pelanggan...</span>
        )}
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-full bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
          {!showNewForm ? (
            <>
              <div className="p-3 border-b border-gray-200 bg-gray-50">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Cari nama, telepon, ID pelanggan..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto">
                {filteredCustomers.length === 0 ? (
                  <div className="p-6 text-center text-gray-500 text-sm">
                    <User className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    Tidak ada pelanggan ditemukan
                  </div>
                ) : (
                  filteredCustomers.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => handleSelect(customer)}
                      className={`w-full px-4 py-2.5 flex items-center gap-3 hover:bg-blue-50 transition-colors text-left ${
                        value === customer.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                        {customer.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900 truncate">{customer.name}</p>
                          <span className="text-xs font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                            {customer.customerCode}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {customer.phone}
                        </p>
                      </div>
                      {value === customer.id && <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />}
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
                Tambah Pelanggan Baru
              </button>
            </>
          ) : (
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-gray-900 text-sm">Pelanggan Baru</h4>
                <button
                  type="button"
                  onClick={() => setShowNewForm(false)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 flex items-center justify-between text-sm">
                <span className="text-blue-700 font-medium">ID Auto</span>
                <span className="font-bold text-blue-700 font-mono">{generateCustomerCode()}</span>
              </div>
              <input
                type="text"
                placeholder="Nama pelanggan *"
                value={newCustomer.name}
                onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none uppercase"
              />
              <input
                type="tel"
                placeholder="No. Telepon *"
                value={newCustomer.phone}
                onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
              />
              <input
                type="email"
                placeholder="Email (opsional)"
                value={newCustomer.email}
                onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
              />
              <input
                type="text"
                placeholder="Alamat (opsional)"
                value={newCustomer.address}
                onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
              />
              <button
                type="button"
                onClick={handleCreateNew}
                disabled={!newCustomer.name || !newCustomer.phone}
                className="w-full py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                Simpan & Pilih Pelanggan
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
