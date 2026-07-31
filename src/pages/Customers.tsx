import { useState, useMemo } from 'react';
import { Plus, Search, Edit, Trash2, Users, X, Save, Phone, Mail, MapPin, List } from 'lucide-react';
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

  const formIsDirty = () => {
    if (editingCustomer) return formData.name !== editingCustomer.name || formData.phone !== editingCustomer.phone || formData.address !== editingCustomer.address || formData.email !== editingCustomer.email;
    return Object.values(formData).some(value => value.trim() !== '');
  };

  const handleCloseModal = (force = false) => {
    if (!force && formIsDirty() && !window.confirm('Data pelanggan belum disimpan. Tutup form ini?')) return;
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
    handleCloseModal(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus pelanggan ini?')) {
      deleteCustomer(id);
    }
  };

  return (
    <div className="space-y-6 lg:-mx-5 lg:-mt-5 lg:space-y-1">
      {/* Subtab modul Pelanggan (desktop) */}
      <div className="hidden items-end border-b border-blue-600 bg-gray-100 px-1 lg:flex">
        <button type="button" onClick={() => showModal && handleCloseModal()} title="Daftar Pelanggan" className={`flex h-11 w-14 items-center justify-center rounded-t-md border border-b-0 ${!showModal ? 'border-green-600 bg-green-500 text-white' : 'border-gray-300 bg-green-500 text-white hover:bg-green-600'}`}><List className="h-6 w-6" /></button>
        {showModal && (
          <div className="ml-0.5 flex h-11 min-w-48 max-w-80 items-center rounded-t-md border border-b-0 border-blue-600 bg-blue-600 text-white">
            <span className="min-w-0 flex-1 truncate px-4 text-sm font-semibold">{editingCustomer ? `Edit — ${editingCustomer.name}` : 'Data Baru'}</span>
            <button type="button" onClick={() => handleCloseModal()} className="mr-1 rounded p-1.5 hover:bg-blue-700" title="Tutup tab"><X className="h-4 w-4" /></button>
          </div>
        )}
      </div>

      <div className={`${showModal ? 'lg:hidden' : ''} space-y-6`}>
      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="relative w-full max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Cari nama, nomor telepon, atau email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          {hasPermission('customer:create') && (
            <button onClick={() => handleOpenModal()} title="Tambah Pelanggan" className="inline-flex h-11 flex-shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 font-medium text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-700">
              <Plus className="h-5 w-5" /><span className="hidden sm:inline">Tambah</span>
            </button>
          )}
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
      </div>

      {/* Form: subtab penuh di desktop, modal sederhana di mobile */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 lg:static lg:z-auto lg:block lg:bg-transparent lg:p-0">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-2xl lg:max-h-none lg:max-w-none lg:rounded-md lg:border lg:border-gray-200 lg:shadow-sm">
            <div className="sticky top-0 flex items-center justify-between rounded-t-xl border-b border-gray-200 bg-white px-6 py-4 lg:hidden">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingCustomer ? 'Edit Pelanggan' : 'Tambah Pelanggan Baru'}
                </h3>
                <p className="text-sm text-gray-500">Isi data pelanggan</p>
              </div>
              <button
                onClick={() => handleCloseModal()}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="hidden border-b border-gray-300 bg-gray-100 px-3 lg:flex"><span className="-mb-px rounded-t-md border border-b-white border-gray-300 border-t-blue-600 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800">Umum</span></div>
            <form onSubmit={handleSubmit} className="space-y-5 p-6 lg:grid lg:grid-cols-[minmax(0,1fr)_88px] lg:gap-4 lg:space-y-0 lg:p-4">
              <div className="grid gap-8 lg:grid-cols-2">
                <section>
                  <h4 className="mb-4 border-b border-gray-200 pb-2 text-lg font-medium text-blue-600">Info Umum</h4>
                  <div className="space-y-4">
                    <div className="grid items-center gap-2 sm:grid-cols-[150px_1fr]">
                      <label className="text-sm font-medium text-gray-700">ID Pelanggan</label>
                      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 font-mono font-bold text-blue-700">{editingCustomer ? editingCustomer.customerCode : generateCustomerCode()}</div>
                    </div>
                    <div className="grid items-center gap-2 sm:grid-cols-[150px_1fr]">
                      <label className="text-sm font-medium text-gray-700">Nama Pelanggan <span className="text-red-500">*</span></label>
                      <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value.toUpperCase() })} placeholder="Nama lengkap pelanggan" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="grid items-center gap-2 sm:grid-cols-[150px_1fr]">
                      <label className="text-sm font-medium text-gray-700">No. Telepon <span className="text-red-500">*</span></label>
                      <input type="tel" required value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="08xxxxxxxxxx" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="grid items-start gap-2 sm:grid-cols-[150px_1fr]">
                      <label className="pt-2.5 text-sm font-medium text-gray-700">Alamat</label>
                      <textarea value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Alamat lengkap pelanggan" rows={4} className="w-full resize-y rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                </section>
                <section>
                  <h4 className="mb-4 border-b border-gray-200 pb-2 text-lg font-medium text-blue-600">Info Lainnya</h4>
                  <div className="space-y-4">
                    <div className="grid items-center gap-2 sm:grid-cols-[110px_1fr]">
                      <label className="text-sm font-medium text-gray-700">Email <span className="block text-xs font-normal text-gray-400">Opsional</span></label>
                      <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="email@example.com" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                </section>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4 lg:sticky lg:top-4 lg:self-start lg:border-t-0 lg:pt-0">
                <button
                  type="button"
                  onClick={() => handleCloseModal()}
                  className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-50 lg:hidden"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!formData.name.trim() || !formData.phone.trim()}
                  title="Simpan Pelanggan"
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none lg:h-20 lg:w-20 lg:justify-center lg:px-0"
                >
                  <Save className="h-4 w-4 lg:h-9 lg:w-9" />
                  <span className="lg:hidden">{editingCustomer ? 'Simpan Perubahan' : 'Simpan Pelanggan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
