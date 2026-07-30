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

      {/* Desktop Customer Table */}
      {filteredCustomers.length > 0 && (
        <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm lg:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left">
              <thead className="bg-blue-800 text-xs uppercase tracking-wide text-white">
                <tr>
                  <th className="px-4 py-3 font-semibold">Kode / Nama Pelanggan</th>
                  <th className="px-4 py-3 font-semibold">No. Telepon</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Alamat</th>
                  <th className="px-4 py-3 text-center font-semibold">Kendaraan</th>
                  <th className="px-4 py-3 text-center font-semibold">WO</th>
                  <th className="px-4 py-3 text-center font-semibold">Faktur</th>
                  <th className="px-4 py-3 text-right font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCustomers.map((customer) => {
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
                    <tr key={customer.id} className="transition-colors hover:bg-blue-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-sm font-bold text-white">
                            {customer.name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="max-w-[220px] truncate text-sm font-semibold text-gray-900">{customer.name}</p>
                            <p className="font-mono text-xs font-medium text-blue-600">{customer.customerCode}</p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-800">{customer.phone || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        <span className="block max-w-[190px] truncate" title={customer.email}>{customer.email || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        <span className="block max-w-[260px] truncate" title={customer.address}>{customer.address || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex min-w-8 justify-center rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">{vehicleCount}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex min-w-8 justify-center rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-800">{workOrderCount}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex min-w-8 justify-center rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">{invoiceCount}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {hasPermission('customer:edit') && (
                            <button onClick={() => handleOpenModal(customer)} className="rounded-lg p-2 text-blue-600 hover:bg-blue-100" title="Edit pelanggan">
                              <Edit className="h-4 w-4" />
                            </button>
                          )}
                          {hasPermission('customer:delete') && (
                            <button onClick={() => handleDelete(customer.id)} className="rounded-lg p-2 text-red-600 hover:bg-red-100" title="Hapus pelanggan">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
            <span>Data pelanggan bersifat global dan dapat digunakan oleh seluruh cabang.</span>
            <span className="font-semibold">{filteredCustomers.length} pelanggan</span>
          </div>
        </div>
      )}

      {filteredCustomers.length === 0 && (
        <div className="hidden rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm lg:block">
          <Users className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <p className="text-lg font-medium text-gray-900">Tidak ada data pelanggan</p>
          <p className="text-sm text-gray-500">Ubah pencarian atau tambahkan pelanggan baru.</p>
        </div>
      )}

      {/* Mobile Customer Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:hidden">
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
