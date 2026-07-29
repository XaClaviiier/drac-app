import { useState, useMemo } from 'react';
import { Plus, Search, Edit, Trash2, Users, X, Save, Phone, Mail, MapPin } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Customer } from '../types';

export default function Customers() {
  const { data, addCustomer, updateCustomer, deleteCustomer, generateCustomerCode, resolveBranchId, hasPermission } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    email: '',
  });

  const filteredCustomers = useMemo(() => {
    // Pelanggan bersifat GLOBAL — tampil di semua cabang
    return data.customers.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone.includes(searchTerm) ||
        c.email.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    });
  }, [data.customers, searchTerm]);

  const resetForm = () => {
    setFormData({ name: '', phone: '', address: '', email: '' });
    setEditingCustomer(null);
  };

  const handleOpenModal = (customer?: Customer) => {
    if (customer) {
      setEditingCustomer(customer);
      setFormData({
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        email: customer.email,
      });
    } else {
      resetForm();
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    resetForm();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date().toISOString().split('T')[0];

    if (editingCustomer) {
      updateCustomer(editingCustomer.id, {
        ...editingCustomer,
        ...formData,
      });
    } else {
      addCustomer({
        id: Date.now().toString(),
        ...formData,
        createdAt: now,
        branchId: resolveBranchId(),
      });
    }
    handleCloseModal();
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus pelanggan ini?')) {
      deleteCustomer(id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Data Pelanggan</h2>
          <p className="text-gray-500 mt-1">Kelola data pelanggan bengkel AC mobil</p>
        </div>
        {hasPermission('customer:create') && (
          <button
            onClick={() => handleOpenModal()}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-lg shadow-blue-600/20"
          >
            <Plus className="w-5 h-5" />
            Tambah Pelanggan
          </button>
        )}
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Cari nama, nomor telepon, atau email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
      </div>

      {/* Customer Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCustomers.length === 0 ? (
          <div className="col-span-full bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-lg font-medium text-gray-900">Tidak ada data pelanggan</p>
            <p className="text-sm text-gray-500">Klik "Tambah Pelanggan" untuk menambahkan data baru</p>
          </div>
        ) : (
          filteredCustomers.map((customer) => {
            const vehicleCount = data.vehicles.filter((v) =>
              v.customerRefId === customer.id ||
              (!v.customerRefId && v.customerId === customer.customerCode)
            ).length;
            const invoiceCount = data.invoices.filter(
              (invoice) => invoice.customerRefId === customer.id || invoice.customerName.includes(customer.name)
            ).length;
            const workOrderCount = data.workOrders.filter(
              (wo) => wo.customerRefId === customer.id || wo.customerName === customer.name
            ).length;
            return (
              <div key={customer.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                      {customer.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{customer.name}</h3>
                      <p className="text-xs text-blue-600 font-mono font-medium">{customer.customerCode}</p>
                      <p className="text-xs text-gray-500">Sejak {customer.createdAt}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {hasPermission('customer:edit') && (
                      <button
                        onClick={() => handleOpenModal(customer)}
                        className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    )}
                    {hasPermission('customer:delete') && (
                      <button
                        onClick={() => handleDelete(customer.id)}
                        className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                        title="Hapus"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <span>{customer.phone}</span>
                  </div>
                  {customer.email && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Mail className="w-4 h-4 text-gray-400" />
                      <span>{customer.email}</span>
                    </div>
                  )}
                  {customer.address && (
                    <div className="flex items-start gap-2 text-gray-600">
                      <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <span>{customer.address}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200 flex flex-wrap gap-2">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {vehicleCount} kendaraan
                  </span>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    {invoiceCount} faktur
                  </span>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                    {workOrderCount} WO
                  </span>
                  {/* Cabang input pertama */}
                  {customer.firstSeenBranchId && (
                    <span
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600"
                      title="Cabang tempat pelanggan pertama kali diinput"
                    >
                      📍 {data.branches.find(b => b.id === customer.firstSeenBranchId)?.name.replace('CABANG ', '') || customer.firstSeenBranchId}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingCustomer ? 'Edit Pelanggan' : 'Tambah Pelanggan Baru'}
                </h3>
                <p className="text-sm text-gray-500">Isi data pelanggan</p>
              </div>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
                <span className="text-sm text-blue-700 font-medium">ID Pelanggan (Auto)</span>
                <span className="text-base font-bold text-blue-700 font-mono">
                  {editingCustomer ? editingCustomer.customerCode : generateCustomerCode()}
                </span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nama Pelanggan <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value.toUpperCase() })}
                  placeholder="Nama lengkap pelanggan"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none uppercase"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  No. Telepon <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="08xxxxxxxxxx"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@example.com"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Alamat</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Alamat lengkap pelanggan"
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-lg shadow-blue-600/20"
                >
                  <Save className="w-4 h-4" />
                  {editingCustomer ? 'Simpan Perubahan' : 'Simpan Pelanggan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
