import { useState, useMemo } from 'react';
import { Plus, Search, Edit, Trash2, Car, X, Save, Filter } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Vehicle } from '../types';

const carBrands = [
  'Toyota', 'Honda', 'Suzuki', 'Daihatsu', 'Mitsubishi',
  'Nissan', 'Hyundai', 'Kia', 'BMW', 'Mercedes-Benz',
  'Wuling', 'DFSK', 'Lexus', 'Isuzu', 'Mazda', 'Lainnya',
];

export default function VehicleRegister() {
  const { data, addVehicle, updateVehicle, deleteVehicle, currentBranchId, hasPermission } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBrand, setFilterBrand] = useState('');

  const [formData, setFormData] = useState({
    plateNumber: '',
    brand: '',
    model: '',
    year: new Date().getFullYear(),
    color: '',
    customerName: '',
    phone: '',
    address: '',
    notes: '',
  });

  const filteredVehicles = useMemo(() => {
    return data.vehicles.filter((v) => {
      const branchMatch = currentBranchId === 'ALL' || v.branchId === currentBranchId;
      if (!branchMatch) return false;

      const matchesSearch =
        v.plateNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.model.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesBrand = !filterBrand || v.brand === filterBrand;
      return matchesSearch && matchesBrand;
    });
  }, [data.vehicles, searchTerm, filterBrand, currentBranchId]);

  const resetForm = () => {
    setFormData({
      plateNumber: '',
      brand: '',
      model: '',
      year: new Date().getFullYear(),
      color: '',
      customerName: '',
      phone: '',
      address: '',
      notes: '',
    });
    setEditingVehicle(null);
  };

  const handleOpenModal = (vehicle?: Vehicle) => {
    if (vehicle) {
      setEditingVehicle(vehicle);
      setFormData({
        plateNumber: vehicle.plateNumber,
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.year,
        color: vehicle.color,
        customerName: vehicle.customerName,
        phone: vehicle.phone,
        address: vehicle.address,
        notes: vehicle.notes,
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
    const customerId = formData.plateNumber.replace(/[^a-zA-Z0-9]/g, '');

    if (editingVehicle) {
      updateVehicle(editingVehicle.id, {
        ...editingVehicle,
        ...formData,
      });
    } else {
      addVehicle({
        id: Date.now().toString(),
        ...formData,
        customerId,
        registrationDate: now,
        branchId: currentBranchId || 'BR-001',
      });
    }
    handleCloseModal();
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus data kendaraan ini?')) {
      deleteVehicle(id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Register Kendaraan</h2>
          <p className="text-gray-500 mt-1">Kelola data kendaraan pelanggan bengkel AC mobil</p>
        </div>
        {hasPermission('vehicle:create') && (
          <button
            onClick={() => handleOpenModal()}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-lg shadow-blue-600/20"
          >
            <Plus className="w-5 h-5" />
            Tambah Kendaraan
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Cari nomor plat, nama pelanggan, merek..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-400" />
            <select
              value={filterBrand}
              onChange={(e) => setFilterBrand(e.target.value)}
              className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
            >
              <option value="">Semua Merek</option>
              {carBrands.map((brand) => (
                <option key={brand} value={brand}>{brand}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Kendaraan</p>
          <p className="text-2xl font-bold text-gray-900">{data.vehicles.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Toyota</p>
          <p className="text-2xl font-bold text-blue-600">
            {data.vehicles.filter((v) => v.brand === 'Toyota').length}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Honda</p>
          <p className="text-2xl font-bold text-red-600">
            {data.vehicles.filter((v) => v.brand === 'Honda').length}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Suzuki</p>
          <p className="text-2xl font-bold text-green-600">
            {data.vehicles.filter((v) => v.brand === 'Suzuki').length}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-blue-800 to-blue-900 text-white">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">No. Plat</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Merek/Model</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Tahun</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Warna</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Pelanggan</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Telepon</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Tgl Daftar</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredVehicles.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    <Car className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-lg font-medium">Tidak ada data kendaraan</p>
                    <p className="text-sm">Klik "Tambah Kendaraan" untuk menambahkan data baru</p>
                  </td>
                </tr>
              ) : (
                filteredVehicles.map((vehicle) => (
                  <tr key={vehicle.id} className="hover:bg-blue-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-blue-100 text-blue-800 text-sm font-mono font-medium">
                        {vehicle.plateNumber}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{vehicle.brand}</p>
                      <p className="text-xs text-gray-500">{vehicle.model}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{vehicle.year}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{vehicle.color}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{vehicle.customerName}</p>
                      <p className="text-xs text-gray-500">ID: {vehicle.customerId}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{vehicle.phone}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{vehicle.registrationDate}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        {hasPermission('vehicle:edit') && (
                          <button
                            onClick={() => handleOpenModal(vehicle)}
                            className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}
                        {hasPermission('vehicle:delete') && (
                          <button
                            onClick={() => handleDelete(vehicle.id)}
                            className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                            title="Hapus"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-500">
          Menampilkan {filteredVehicles.length} dari {data.vehicles.length} kendaraan
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingVehicle ? 'Edit Kendaraan' : 'Tambah Kendaraan Baru'}
                </h3>
                <p className="text-sm text-gray-500">Isi data kendaraan pelanggan</p>
              </div>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Info Kendaraan */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Car className="w-4 h-4" /> Informasi Kendaraan
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nomor Plat <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.plateNumber}
                      onChange={(e) => setFormData({ ...formData, plateNumber: e.target.value.toUpperCase() })}
                      placeholder="Contoh: DD1234AB"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Merek <span className="text-red-500">*</span>
                    </label>
                    <select
                      required
                      value={formData.brand}
                      onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                    >
                      <option value="">Pilih Merek</option>
                      {carBrands.map((brand) => (
                        <option key={brand} value={brand}>{brand}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Model <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.model}
                      onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                      placeholder="Contoh: Avanza, CR-V, APV"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tahun <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      min="1990"
                      max={new Date().getFullYear() + 1}
                      value={formData.year}
                      onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Warna <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      placeholder="Contoh: Putih, Hitam, Merah"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Info Pelanggan */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <span className="w-4 h-4 flex items-center justify-center text-xs">👤</span> Informasi Pelanggan
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nama Pelanggan <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.customerName}
                      onChange={(e) => setFormData({ ...formData, customerName: e.target.value.toUpperCase() })}
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
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Alamat
                    </label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="Alamat lengkap pelanggan"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Catatan
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Catatan tambahan tentang kendaraan atau keluhan AC..."
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                />
              </div>

              {/* Actions */}
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
                  {editingVehicle ? 'Simpan Perubahan' : 'Simpan Kendaraan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
