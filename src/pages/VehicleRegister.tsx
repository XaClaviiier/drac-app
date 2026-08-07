import { useState, useMemo, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, Car, X, Save, Database, Power, ArrowDownAZ, ChevronUp, ChevronDown, Eye, Clock3, GitBranch } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Vehicle } from '../types';
import CustomerPicker from '../components/CustomerPicker';
import { vehicleBrands, vehicleColors, vehicleModels, vehicleYears } from '../lib/vehicleCatalog';
import { api } from '../lib/apiClient';
import { localDateKey } from '../lib/date';

type CatalogModel = { id: string; name: string; isActive: boolean; brandId: string; sortOrder: number };
type CatalogBrand = { id: string; name: string; isActive: boolean; sortOrder: number; models: CatalogModel[] };
type CatalogColor = { id: string; name: string; isActive: boolean; sortOrder: number };

const formatAuditTime = (value?: string) => {
  if (!value) return '-';
  const parsed = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
};

const formatBusinessDate = (value?: string) => {
  if (!value) return '-';
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(parsed);
};

export default function VehicleRegister() {
  const { data, addVehicle, updateVehicle, deleteVehicle, resolveBranchId, hasPermission, currentUser } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [detailVehicle, setDetailVehicle] = useState<Vehicle | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterModel, setFilterModel] = useState('');
  const [masterOpen, setMasterOpen] = useState(false);
  const [masterTab, setMasterTab] = useState<'brand' | 'color'>('brand');
  const [catalog, setCatalog] = useState<{ brands: CatalogBrand[]; colors: CatalogColor[] }>({ brands: [], colors: [] });
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [newBrand, setNewBrand] = useState('');
  const [newModel, setNewModel] = useState('');
  const [newColor, setNewColor] = useState('');
  const canManageCatalog = Boolean(currentUser?.isOwner || currentUser?.roleName === 'Administrator');

  const loadCatalog = async () => {
    const response = await api.get('vehicle-catalog');
    if (response.success && response.data) {
      const next = response.data as { brands: CatalogBrand[]; colors: CatalogColor[] };
      setCatalog(next);
      setSelectedBrandId(current => current && next.brands.some(brand => brand.id === current) ? current : (next.brands[0]?.id || ''));
    }
  };

  useEffect(() => { void loadCatalog(); }, []);

  const createCatalogItem = async (entity: 'brand' | 'model' | 'color', name: string, brandId?: string) => {
    if (!name.trim()) return;
    const response = await api.create('vehicle-catalog', { entity, name: name.trim(), brandId });
    if (!response.success) { window.alert(response.message || 'Gagal menambahkan master kendaraan.'); return; }
    setNewBrand(''); setNewModel(''); setNewColor(''); await loadCatalog();
  };

  const editCatalogItem = async (entity: 'brand' | 'model' | 'color', item: CatalogBrand | CatalogModel | CatalogColor) => {
    const name = window.prompt('Ubah nama:', item.name)?.trim();
    if (!name || name === item.name) return;
    const response = await api.update('vehicle-catalog', item.id, { entity, name, isActive: item.isActive });
    if (!response.success) { window.alert(response.message || 'Gagal mengubah master kendaraan.'); return; }
    await loadCatalog();
  };

  const toggleCatalogItem = async (entity: 'brand' | 'model' | 'color', item: CatalogBrand | CatalogModel | CatalogColor) => {
    const response = await api.update('vehicle-catalog', item.id, { entity, name: item.name, isActive: !item.isActive });
    if (!response.success) { window.alert(response.message || 'Gagal mengubah status master kendaraan.'); return; }
    await loadCatalog();
  };

  const reorderCatalog = async (entity: 'brand' | 'model' | 'color', items: Array<CatalogBrand | CatalogModel | CatalogColor>, index?: number, direction?: -1 | 1, alphabetical = false) => {
    const ordered = alphabetical
      ? [...items].sort((left, right) => left.name.localeCompare(right.name, 'id', { sensitivity: 'base' }))
      : [...items];
    if (!alphabetical && index !== undefined && direction !== undefined) {
      const target = index + direction;
      if (target < 0 || target >= ordered.length) return;
      [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    }
    const response = await api.update('vehicle-catalog', 'reorder', { entity, action: 'reorder', orderedIds: ordered.map(item => item.id) });
    if (!response.success) { window.alert(response.message || 'Gagal menyimpan urutan master kendaraan.'); return; }
    await loadCatalog();
  };

  const [formData, setFormData] = useState({
    plateNumber: '',
    brand: '',
    model: '',
    year: 0,
    color: '',
    customerRefId: '',
    customerName: '',
    phone: '',
    address: '',
    notes: '',
  });
  const catalogBrandNames = catalog.brands.length ? catalog.brands.filter(brand => brand.isActive).map(brand => brand.name) : vehicleBrands;
  const catalogModelNames = catalog.brands.length
    ? (catalog.brands.find(brand => brand.name === formData.brand)?.models || []).filter(model => model.isActive).map(model => model.name)
    : (vehicleModels[formData.brand] || []);
  const catalogColorNames = catalog.colors.length ? catalog.colors.filter(color => color.isActive).map(color => color.name) : vehicleColors;
  const selectedCatalogBrand = catalog.brands.find(brand => brand.id === selectedBrandId);

  const filteredVehicles = useMemo(() => {
    // Kendaraan bersifat GLOBAL — tampil di semua cabang
    return data.vehicles.filter((v) => {
      const matchesSearch =
        v.plateNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.customerId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.phone.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.model.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesBrand = !filterBrand || v.brand === filterBrand;
      const matchesModel = !filterModel || v.model === filterModel;
      return matchesSearch && matchesBrand && matchesModel;
    });
  }, [data.vehicles, searchTerm, filterBrand, filterModel]);

  const resetForm = () => {
    setFormData({
      plateNumber: '',
      brand: '',
      model: '',
      year: 0,
      color: '',
      customerRefId: '',
      customerName: '',
      phone: '',
      address: '',
      notes: '',
    });
    setEditingVehicle(null);
  };

  const handleOpenModal = (vehicle?: Vehicle) => {
    if (vehicle) {
      const owner = data.customers.find(customer =>
        customer.id === vehicle.customerRefId ||
        customer.customerCode === vehicle.customerId ||
        customer.name === vehicle.customerName
      );
      setEditingVehicle(vehicle);
      setFormData({
        plateNumber: vehicle.plateNumber,
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.year,
        color: vehicle.color,
        customerRefId: owner?.id || '',
        customerName: owner?.name || vehicle.customerName,
        phone: owner?.phone || vehicle.phone,
        address: owner?.address || vehicle.address,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const now = localDateKey();
    const normalizedPlate = formData.plateNumber.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const duplicate = data.vehicles.find(vehicle =>
      vehicle.id !== editingVehicle?.id &&
      vehicle.plateNumber.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() === normalizedPlate
    );
    if (duplicate) {
      window.alert(`Plat ${formData.plateNumber} sudah terdaftar atas nama ${duplicate.customerName}.`);
      return;
    }
    const customer = data.customers.find(item => item.id === formData.customerRefId);
    if (!customer) {
      window.alert('Pilih pelanggan dari data pelanggan terlebih dahulu.');
      return;
    }
    const normalizedForm = {
      ...formData,
      plateNumber: normalizedPlate,
      customerRefId: customer.id,
      customerId: customer.customerCode,
      customerName: customer.name,
      phone: customer.phone,
      address: customer.address,
    };

    if (editingVehicle) {
      await updateVehicle(editingVehicle.id, {
        ...editingVehicle,
        ...normalizedForm,
      });
    } else {
      await addVehicle({
        id: Date.now().toString(),
        ...normalizedForm,
        registrationDate: now,
        branchId: resolveBranchId(),
        firstSeenBranchId: resolveBranchId(),
      });
    }
    handleCloseModal();
  };

  const handleCustomerSelect = (customerRefId: string) => {
    const customer = data.customers.find(item => item.id === customerRefId);
    setFormData(current => ({
      ...current,
      customerRefId,
      customerName: customer?.name || '',
      phone: customer?.phone || '',
      address: customer?.address || '',
    }));
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus data kendaraan ini?')) {
      deleteVehicle(id);
    }
  };

  const detailWorkOrders = detailVehicle
    ? data.workOrders
        .filter(wo => wo.vehicleRefId === detailVehicle.id || wo.plateNumber.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() === detailVehicle.plateNumber.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())
        .sort((left, right) => left.date.localeCompare(right.date) || (left.createdAt || '').localeCompare(right.createdAt || ''))
    : [];
  const firstWorkOrder = detailWorkOrders[0];
  const vehicleTimeline = detailVehicle ? [
    {
      at: detailVehicle.createdAt || `${detailVehicle.registrationDate}T00:00:00`,
      title: 'Kendaraan diregister',
      description: `Tanggal transaksi ${formatBusinessDate(detailVehicle.registrationDate)} · ${data.branches.find(branch => branch.id === detailVehicle.firstSeenBranchId)?.name || 'Cabang tidak tercatat'}`,
      tone: 'bg-blue-600',
    },
    ...detailWorkOrders.flatMap(wo => {
      const branchName = data.branches.find(branch => branch.id === wo.branchId)?.name || wo.branchId;
      const events = [{
        at: wo.createdAt || `${wo.date}T00:00:00`,
        title: `WO dibuat · ${wo.woNumber}`,
        description: `Tanggal transaksi ${formatBusinessDate(wo.date)} · ${branchName} · Input ${wo.createdByName || '-'}`,
        tone: 'bg-emerald-600',
      }];
      (wo.statusLog || []).filter(log => log.from !== log.to).forEach(log => events.push({
        at: log.at,
        title: `${log.from} → ${log.to}`,
        description: `${wo.woNumber} · Oleh ${log.byUserName || '-'}${log.reason ? ` · ${log.reason}` : ''}`,
        tone: 'bg-amber-500',
      }));
      if (wo.continuedToWoId) events.push({
        at: wo.continuedAt || data.workOrders.find(item => item.id === wo.continuedToWoId)?.createdAt || wo.updatedAt || wo.date,
        title: `Dilanjutkan ke ${wo.continuedToWoNumber || 'WO baru'}`,
        description: `${wo.continuedToBranchName || data.branches.find(branch => branch.id === wo.continuedBranchId)?.name || '-'} · Oleh ${wo.continuedByName || '-'}`,
        tone: 'bg-violet-600',
      });
      return events;
    }),
  ].sort((left, right) => left.at.localeCompare(right.at)) : [];

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center gap-3 overflow-x-auto">
          <div className="relative min-w-[280px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Cari nomor plat, nama pelanggan, merek..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <select value={filterBrand} onChange={(e) => { setFilterBrand(e.target.value); setFilterModel(''); }} className="min-w-[150px] px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
            <option value="">Semua Merek</option>
            {[...new Set(data.vehicles.map(vehicle => vehicle.brand))].sort().map((brand) => (
              <option key={brand} value={brand}>{brand}</option>
            ))}
          </select>
          <select value={filterModel} onChange={e => setFilterModel(e.target.value)} className="min-w-[170px] px-3 py-2.5 border border-gray-300 rounded-lg bg-white">
            <option value="">Semua Tipe</option>
            {[...new Set(data.vehicles.filter(v => !filterBrand || v.brand === filterBrand).map(v => v.model))].sort().map(model => <option key={model} value={model}>{model}</option>)}
          </select>
          {canManageCatalog && (
            <button onClick={() => { setMasterOpen(true); void loadCatalog(); }} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-blue-300 bg-white px-4 py-2.5 font-medium text-blue-700 hover:bg-blue-50">
              <Database className="h-5 w-5" /> Master Kendaraan
            </button>
          )}
          {hasPermission('vehicle:create') && (
            <button onClick={() => handleOpenModal()} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-700">
              <Plus className="h-5 w-5" /> Tambah Kendaraan
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="max-h-[calc(100vh-225px)] overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-gradient-to-r from-blue-800 to-blue-900 text-white">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">No. Plat</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Merek/Model</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Tahun</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Warna</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Pelanggan</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Telepon</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Tgl Daftar</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Cabang Input</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredVehicles.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
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
                    <td className="px-4 py-3 text-sm text-gray-900">{vehicle.year || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{vehicle.color}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{vehicle.customerName}</p>
                      <p className="text-xs text-gray-500">ID: {vehicle.customerId}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{vehicle.phone}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{vehicle.registrationDate}</td>
                    <td className="px-4 py-3">
                      {vehicle.firstSeenBranchId ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                          📍 {data.branches.find(b => b.id === vehicle.firstSeenBranchId)?.name.replace('CABANG ', '') || vehicle.firstSeenBranchId}
                        </span>
                      ) : <span className="text-xs text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setDetailVehicle(vehicle)}
                          className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Lihat riwayat"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
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

      {detailVehicle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Riwayat Kendaraan · {detailVehicle.plateNumber}</h3>
                <p className="text-sm text-gray-500">{detailVehicle.brand} {detailVehicle.model} {detailVehicle.year || ''} · {detailVehicle.color}</p>
              </div>
              <button onClick={() => setDetailVehicle(null)} className="rounded-lg p-2 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="overflow-y-auto p-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3"><p className="text-xs uppercase text-gray-500">Tanggal register</p><p className="mt-1 font-semibold text-gray-900">{formatBusinessDate(detailVehicle.registrationDate)}</p></div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3"><p className="text-xs uppercase text-gray-500">Waktu input server</p><p className="mt-1 font-semibold text-gray-900">{formatAuditTime(detailVehicle.createdAt)}</p></div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3"><p className="text-xs uppercase text-gray-500">WO pertama</p><p className="mt-1 font-semibold text-gray-900">{firstWorkOrder ? `${firstWorkOrder.woNumber} · ${formatBusinessDate(firstWorkOrder.date)}` : 'Belum ada WO'}</p></div>
              </div>
              <div className="mt-5 rounded-xl border border-gray-200 p-4">
                <div className="mb-4 flex items-center gap-2"><Clock3 className="h-5 w-5 text-blue-600" /><h4 className="font-bold text-gray-900">Timeline kendaraan dan WO</h4></div>
                <div className="relative ml-2 border-l-2 border-gray-200 pl-6">
                  {vehicleTimeline.map((event, index) => (
                    <div key={`${event.at}-${event.title}-${index}`} className="relative pb-5 last:pb-0">
                      <span className={`absolute -left-[31px] top-1 h-3 w-3 rounded-full ring-4 ring-white ${event.tone}`} />
                      <div className="flex items-start gap-2">
                        {event.title.startsWith('Dilanjutkan') && <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />}
                        <div><p className="font-semibold text-gray-900">{event.title}</p><p className="text-sm text-gray-600">{event.description}</p><p className="mt-1 text-xs text-gray-400">Waktu aktual: {formatAuditTime(event.at)}</p></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Master Merek, Tipe, dan Warna */}
      {masterOpen && canManageCatalog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div><h3 className="text-lg font-bold text-gray-900">Master Kendaraan</h3><p className="text-sm text-gray-500">Kelola pilihan yang digunakan pada form kendaraan.</p></div>
              <button onClick={() => setMasterOpen(false)} className="rounded-lg p-2 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex border-b border-blue-600 bg-gray-100 px-2 pt-2">
              <button onClick={() => setMasterTab('brand')} className={`rounded-t-md border border-b-0 px-5 py-2.5 text-sm font-semibold ${masterTab === 'brand' ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-gray-200 text-gray-600'}`}>Merek &amp; Tipe</button>
              <button onClick={() => setMasterTab('color')} className={`ml-1 rounded-t-md border border-b-0 px-5 py-2.5 text-sm font-semibold ${masterTab === 'color' ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-gray-200 text-gray-600'}`}>Warna</button>
            </div>
            <div className="max-h-[65vh] overflow-y-auto p-5">
              {masterTab === 'brand' ? (
                <div className="grid gap-5 md:grid-cols-2">
                  <section>
                    <div className="mb-3 flex items-center justify-between"><h4 className="font-semibold text-gray-900">Daftar Merek</h4><button onClick={() => void reorderCatalog('brand', catalog.brands, undefined, undefined, true)} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"><ArrowDownAZ className="h-4 w-4" /> A–Z</button></div>
                    <div className="mb-3 flex gap-2"><input value={newBrand} onChange={event => setNewBrand(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void createCatalogItem('brand', newBrand); }} placeholder="Merek baru" className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2" /><button onClick={() => void createCatalogItem('brand', newBrand)} className="rounded-lg bg-blue-600 px-3 text-white"><Plus className="h-4 w-4" /></button></div>
                    <div className="space-y-2">
                      {catalog.brands.map((brand, index) => <div key={brand.id} className={`flex items-center rounded-lg border p-2 ${selectedBrandId === brand.id ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}><button onClick={() => setSelectedBrandId(brand.id)} className={`min-w-0 flex-1 truncate text-left text-sm font-medium ${brand.isActive ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{brand.name}</button><button disabled={index === 0} onClick={() => void reorderCatalog('brand', catalog.brands, index, -1)} className="p-1 text-gray-500 disabled:opacity-20"><ChevronUp className="h-4 w-4" /></button><button disabled={index === catalog.brands.length - 1} onClick={() => void reorderCatalog('brand', catalog.brands, index, 1)} className="p-1 text-gray-500 disabled:opacity-20"><ChevronDown className="h-4 w-4" /></button><button onClick={() => void editCatalogItem('brand', brand)} className="p-2 text-blue-600"><Edit className="h-4 w-4" /></button><button onClick={() => void toggleCatalogItem('brand', brand)} title={brand.isActive ? 'Nonaktifkan' : 'Aktifkan'} className={`p-2 ${brand.isActive ? 'text-emerald-600' : 'text-gray-400'}`}><Power className="h-4 w-4" /></button></div>)}
                    </div>
                  </section>
                  <section>
                    <div className="mb-3 flex items-center justify-between"><h4 className="font-semibold text-gray-900">Tipe {selectedCatalogBrand ? `— ${selectedCatalogBrand.name}` : ''}</h4>{selectedCatalogBrand && <button onClick={() => void reorderCatalog('model', selectedCatalogBrand.models, undefined, undefined, true)} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"><ArrowDownAZ className="h-4 w-4" /> A–Z</button>}</div>
                    <div className="mb-3 flex gap-2"><input disabled={!selectedCatalogBrand} value={newModel} onChange={event => setNewModel(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && selectedCatalogBrand) void createCatalogItem('model', newModel, selectedCatalogBrand.id); }} placeholder="Tipe/model baru" className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100" /><button disabled={!selectedCatalogBrand} onClick={() => selectedCatalogBrand && void createCatalogItem('model', newModel, selectedCatalogBrand.id)} className="rounded-lg bg-blue-600 px-3 text-white disabled:bg-gray-300"><Plus className="h-4 w-4" /></button></div>
                    <div className="space-y-2">
                      {(selectedCatalogBrand?.models || []).map((model, index, models) => <div key={model.id} className="flex items-center rounded-lg border border-gray-200 p-2"><span className={`min-w-0 flex-1 truncate text-sm ${model.isActive ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{model.name}</span><button disabled={index === 0} onClick={() => void reorderCatalog('model', models, index, -1)} className="p-1 text-gray-500 disabled:opacity-20"><ChevronUp className="h-4 w-4" /></button><button disabled={index === models.length - 1} onClick={() => void reorderCatalog('model', models, index, 1)} className="p-1 text-gray-500 disabled:opacity-20"><ChevronDown className="h-4 w-4" /></button><button onClick={() => void editCatalogItem('model', model)} className="p-2 text-blue-600"><Edit className="h-4 w-4" /></button><button onClick={() => void toggleCatalogItem('model', model)} className={`p-2 ${model.isActive ? 'text-emerald-600' : 'text-gray-400'}`}><Power className="h-4 w-4" /></button></div>)}
                    </div>
                  </section>
                </div>
              ) : (
                <section className="mx-auto max-w-xl">
                  <div className="mb-3 flex items-center justify-between"><h4 className="font-semibold text-gray-900">Daftar Warna</h4><button onClick={() => void reorderCatalog('color', catalog.colors, undefined, undefined, true)} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"><ArrowDownAZ className="h-4 w-4" /> A–Z</button></div>
                  <div className="mb-3 flex gap-2"><input value={newColor} onChange={event => setNewColor(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void createCatalogItem('color', newColor); }} placeholder="Warna baru" className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2" /><button onClick={() => void createCatalogItem('color', newColor)} className="rounded-lg bg-blue-600 px-3 text-white"><Plus className="h-4 w-4" /></button></div>
                  <div className="space-y-2">{catalog.colors.map((color, index) => <div key={color.id} className="flex items-center rounded-lg border border-gray-200 p-2"><span className={`min-w-0 flex-1 truncate text-sm ${color.isActive ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{color.name}</span><button disabled={index === 0} onClick={() => void reorderCatalog('color', catalog.colors, index, -1)} className="p-1 text-gray-500 disabled:opacity-20"><ChevronUp className="h-4 w-4" /></button><button disabled={index === catalog.colors.length - 1} onClick={() => void reorderCatalog('color', catalog.colors, index, 1)} className="p-1 text-gray-500 disabled:opacity-20"><ChevronDown className="h-4 w-4" /></button><button onClick={() => void editCatalogItem('color', color)} className="p-2 text-blue-600"><Edit className="h-4 w-4" /></button><button onClick={() => void toggleCatalogItem('color', color)} className={`p-2 ${color.isActive ? 'text-emerald-600' : 'text-gray-400'}`}><Power className="h-4 w-4" /></button></div>)}</div>
                </section>
              )}
            </div>
          </div>
        </div>
      )}

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
                    <input
                      list="vehicle-brand-options"
                      required
                      value={formData.brand}
                      onChange={(e) => setFormData({ ...formData, brand: e.target.value, model: '' })}
                      placeholder="Pilih atau ketik merek"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                    <datalist id="vehicle-brand-options">
                      {catalogBrandNames.map((brand) => (
                        <option key={brand} value={brand}>{brand}</option>
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Model <span className="text-red-500">*</span>
                    </label>
                    <input
                      list="vehicle-model-options"
                      required
                      value={formData.model}
                      onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                      placeholder={formData.brand ? 'Pilih atau ketik tipe/model' : 'Pilih merek dahulu'}
                      disabled={!formData.brand}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-100"
                    />
                    <datalist id="vehicle-model-options">
                      {catalogModelNames.map(model => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tahun <span className="text-xs font-normal text-gray-400">(opsional)</span>
                    </label>
                    <select
                      value={formData.year}
                      onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                    >
                      <option value={0}>Tidak diketahui</option>
                      {vehicleYears.map(year => <option key={year} value={year}>{year}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Warna <span className="text-red-500">*</span>
                    </label>
                    <input
                      list="vehicle-color-options"
                      required
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      placeholder="Pilih atau ketik warna"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                    />
                    <datalist id="vehicle-color-options">
                      {catalogColorNames.map(color => <option key={color} value={color} />)}
                    </datalist>
                  </div>
                </div>
              </div>

              {/* Info Pelanggan */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <span className="w-4 h-4 flex items-center justify-center text-xs">👤</span> Informasi Pelanggan
                </h4>
                <div className="space-y-4">
                  <div className="relative z-20">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cari dan Pilih Pelanggan <span className="text-red-500">*</span>
                    </label>
                    <CustomerPicker value={formData.customerRefId} onChange={handleCustomerSelect} />
                  </div>
                  {formData.customerRefId && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                      <div className="font-semibold text-gray-900">{formData.customerName}</div>
                      <div className="mt-1 text-sm text-gray-600">{formData.phone || 'Nomor telepon belum diisi'}</div>
                      <div className="text-sm text-gray-600">{formData.address || 'Alamat belum diisi'}</div>
                      <div className="mt-2 text-xs text-blue-700">Data kontak mengikuti master pelanggan.</div>
                    </div>
                  )}
                  {!data.customers.length && (
                    <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
                      Belum ada pelanggan. Tambahkan pelanggan terlebih dahulu melalui menu Pelanggan.
                    </p>
                  )}
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
