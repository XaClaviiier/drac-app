import { useState, useMemo, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, Car, X, Save, Database, Power, ArrowDownAZ, ChevronUp, ChevronDown, Eye, Clock3, GitBranch, ChartNoAxesColumnIncreasing, Combine, ScrollText } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Vehicle } from '../types';
import CustomerPicker from '../components/CustomerPicker';
import { vehicleBrands, vehicleColors, vehicleModels, vehicleYears } from '../lib/vehicleCatalog';
import { api } from '../lib/apiClient';
import { localDateKey } from '../lib/date';

type CatalogGeneration = { id: string; modelId: string; name: string; aliases: string; yearFrom?: number | null; yearTo?: number | null; engineCcs: number[]; isActive: boolean };
type CatalogModel = { id: string; name: string; isActive: boolean; brandId: string; sortOrder: number; usageCount: number; generations?: CatalogGeneration[] };
type CatalogBrand = { id: string; name: string; isActive: boolean; sortOrder: number; usageCount: number; models: CatalogModel[] };
type CatalogColor = { id: string; name: string; isActive: boolean; sortOrder: number; usageCount: number };
type CatalogAuditLog = { id: string; entity: 'brand' | 'model' | 'generation' | 'color'; entityId?: string; entityName?: string; action: string; detail?: string; userName?: string; createdAt: string };
type CatalogData = {
  brands: CatalogBrand[];
  colors: CatalogColor[];
  sortModes: { brandSortMode: 'manual' | 'usage'; modelSortMode: 'manual' | 'usage'; colorSortMode: 'manual' | 'usage' };
  auditLogs: CatalogAuditLog[];
};

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
  const { data, addVehicle, updateVehicle, deleteVehicle, resolveBranchId, hasPermission, currentUser, refreshData } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [detailVehicle, setDetailVehicle] = useState<Vehicle | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterModel, setFilterModel] = useState('');
  const [masterOpen, setMasterOpen] = useState(false);
  const [masterTab, setMasterTab] = useState<'brand' | 'generation' | 'color' | 'audit'>('brand');
  const [catalog, setCatalog] = useState<CatalogData>({ brands: [], colors: [], sortModes: { brandSortMode: 'manual', modelSortMode: 'manual', colorSortMode: 'manual' }, auditLogs: [] });
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [newBrand, setNewBrand] = useState('');
  const [newModel, setNewModel] = useState('');
  const [newColor, setNewColor] = useState('');
  const [masterSearch, setMasterSearch] = useState('');
  const [generationModelId, setGenerationModelId] = useState('');
  const [editingGenerationId, setEditingGenerationId] = useState('');
  const [generationDraft, setGenerationDraft] = useState({ name: '', aliases: '', yearFrom: '', yearTo: '', engineCcs: '' });
  const canManageCatalog = hasPermission('vehicle:create') || hasPermission('vehicle:edit');
  const canDeactivateCatalog = Boolean(currentUser?.isOwner || currentUser?.roleName === 'Administrator' || hasPermission('vehicle:delete'));

  const parseEngineCcs = (value: string) => [...new Set((value.match(/\d+(?:[.,]\d+)?/g) || []).map(item => { const parsed = Number(item.replace(',', '.')); return parsed > 0 && parsed < 20 ? Math.round(parsed * 1000) : Math.round(parsed); }).filter(cc => cc >= 600 && cc <= 10000))];
  const resetGenerationDraft = (modelId = generationModelId) => { setGenerationModelId(modelId); setEditingGenerationId(''); setGenerationDraft({ name: '', aliases: '', yearFrom: '', yearTo: '', engineCcs: '' }); };
  const openGenerationForm = (model: CatalogModel, generation?: CatalogGeneration) => {
    setMasterTab('generation'); setGenerationModelId(model.id); setEditingGenerationId(generation?.id || '');
    setGenerationDraft(generation ? { name: generation.name, aliases: generation.aliases || '', yearFrom: generation.yearFrom ? String(generation.yearFrom) : '', yearTo: generation.yearTo ? String(generation.yearTo) : '', engineCcs: generation.engineCcs.map(cc => String(cc)).join(', ') } : { name: '', aliases: '', yearFrom: '', yearTo: '', engineCcs: '' });
  };
  const saveGeneration = async () => {
    const name = generationDraft.name.trim(); const yearFrom = Number(generationDraft.yearFrom) || null; const yearTo = Number(generationDraft.yearTo) || null;
    if (!generationModelId || !name) { window.alert('Pilih model dan isi nama generasi.'); return; }
    if (yearFrom && yearTo && yearTo < yearFrom) { window.alert('Tahun akhir tidak boleh lebih kecil dari tahun awal.'); return; }
    const existingGeneration = selectedGenerationModel?.generations?.find(generation => generation.id === editingGenerationId);
    const payload = { entity: 'generation', modelId: generationModelId, name, aliases: generationDraft.aliases.trim(), yearFrom, yearTo, engineCcs: parseEngineCcs(generationDraft.engineCcs), isActive: existingGeneration?.isActive ?? true };
    const response = editingGenerationId ? await api.update('vehicle-catalog', editingGenerationId, payload) : await api.create('vehicle-catalog', payload);
    if (!response.success) { window.alert(response.message || 'Gagal menyimpan generasi.'); return; }
    resetGenerationDraft(generationModelId); await loadCatalog(); await refreshData();
  };
  const toggleGeneration = async (generation: CatalogGeneration) => {
    const response = await api.update('vehicle-catalog', generation.id, { entity: 'generation', modelId: generation.modelId, name: generation.name, aliases: generation.aliases, yearFrom: generation.yearFrom, yearTo: generation.yearTo, engineCcs: generation.engineCcs, isActive: !generation.isActive });
    if (!response.success) { window.alert(response.message || 'Gagal mengubah status generasi.'); return; } await loadCatalog();
  };

  const loadCatalog = async () => {
    const response = await api.get('vehicle-catalog');
    if (response.success && response.data) {
      const next = response.data as CatalogData;
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
    await refreshData();
  };

  const toggleCatalogItem = async (entity: 'brand' | 'model' | 'color', item: CatalogBrand | CatalogModel | CatalogColor) => {
    const response = await api.update('vehicle-catalog', item.id, { entity, name: item.name, isActive: !item.isActive });
    if (!response.success) { window.alert(response.message || 'Gagal mengubah status master kendaraan.'); return; }
    await loadCatalog();
  };

  const deleteCatalogItem = async (entity: 'brand' | 'model' | 'color', item: CatalogBrand | CatalogModel | CatalogColor) => {
    const label = entity === 'brand' ? 'merek' : entity === 'model' ? 'tipe' : 'warna';
    if ((item.usageCount || 0) > 0) {
      window.alert(`${item.name} tidak dapat dihapus karena digunakan oleh ${item.usageCount} kendaraan. Gunakan Nonaktifkan atau Gabungkan.`);
      return;
    }
    if (entity === 'brand' && (item as CatalogBrand).models.length > 0) {
      window.alert(`${item.name} masih memiliki ${(item as CatalogBrand).models.length} tipe. Hapus atau gabungkan seluruh tipe terlebih dahulu.`);
      return;
    }
    if (!window.confirm(`Hapus permanen ${label} "${item.name}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    const response = await api.deleteVehicleCatalogItem(item.id, entity);
    if (!response.success) { window.alert(response.message || `Gagal menghapus ${label}.`); return; }
    if (entity === 'brand') setSelectedBrandId('');
    await loadCatalog();
    await refreshData();
  };

  const mergeCatalogItem = async (entity: 'brand' | 'model' | 'color', item: CatalogBrand | CatalogModel | CatalogColor, candidates: Array<CatalogBrand | CatalogModel | CatalogColor>) => {
    const targetName = window.prompt(`Gabungkan "${item.name}" ke nama master yang mana?`)?.trim();
    if (!targetName) return;
    const target = candidates.find(candidate => candidate.id !== item.id && candidate.name.localeCompare(targetName, 'id', { sensitivity: 'base' }) === 0);
    if (!target) { window.alert(`Target "${targetName}" tidak ditemukan pada daftar yang sama.`); return; }
    if (!target.isActive) { window.alert('Target penggabungan harus dalam keadaan aktif.'); return; }
    if (!window.confirm(`Gabungkan "${item.name}" ke "${target.name}"? Kendaraan akan dipindahkan ke target dan data sumber dinonaktifkan. Histori kendaraan tidak dihapus.`)) return;
    const response = await api.update('vehicle-catalog', item.id, { entity, action: 'merge', targetId: target.id });
    if (!response.success) { window.alert(response.message || 'Gagal menggabungkan master kendaraan.'); return; }
    await loadCatalog();
    await refreshData();
  };

  const reorderCatalog = async (entity: 'brand' | 'model' | 'color', items: Array<CatalogBrand | CatalogModel | CatalogColor>, index?: number, direction?: -1 | 1, mode?: 'alphabetical' | 'usage') => {
    const ordered = mode === 'alphabetical'
      ? [...items].sort((left, right) => left.name.localeCompare(right.name, 'id', { sensitivity: 'base' }))
      : mode === 'usage'
        ? [...items].sort((left, right) => ('usageCount' in right ? right.usageCount : 0) - ('usageCount' in left ? left.usageCount : 0) || left.name.localeCompare(right.name, 'id', { sensitivity: 'base' }))
        : [...items];
    if (!mode && index !== undefined && direction !== undefined) {
      const target = index + direction;
      if (target < 0 || target >= ordered.length) return;
      [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    }
    const response = await api.update('vehicle-catalog', 'reorder', { entity, action: 'reorder', orderedIds: ordered.map(item => item.id), sortMode: mode === 'usage' ? 'usage' : 'manual' });
    if (!response.success) { window.alert(response.message || 'Gagal menyimpan urutan master kendaraan.'); return; }
    await loadCatalog();
  };

  const [formData, setFormData] = useState({
    plateNumber: '',
    brand: '',
    model: '',
    generationId: '',
    generationName: '',
    engineCc: 0,
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
  const selectedFormModel = catalog.brands.find(brand => brand.name === formData.brand)?.models.find(model => model.name === formData.model);
  const availableGenerations = (selectedFormModel?.generations || []).filter(generation => generation.isActive);
  const selectedGeneration = availableGenerations.find(generation => generation.id === formData.generationId);
  const selectedCatalogBrand = catalog.brands.find(brand => brand.id === selectedBrandId);
  const catalogModels = catalog.brands.flatMap(brand => brand.models.map(model => ({ ...model, brandName: brand.name })));
  const selectedGenerationModel = catalogModels.find(model => model.id === generationModelId);
  const filteredCatalogBrands = catalog.brands.filter(brand => !masterSearch || brand.name.toLowerCase().includes(masterSearch.toLowerCase()));
  const filteredCatalogModels = (selectedCatalogBrand?.models || []).filter(model => !masterSearch || model.name.toLowerCase().includes(masterSearch.toLowerCase()));
  const filteredGenerations = catalogModels.flatMap(model => (model.generations || []).map(generation => ({ ...generation, modelName: model.name, brandName: model.brandName }))).filter(generation => {
    const query = masterSearch.toLowerCase();
    return (!generationModelId || generation.modelId === generationModelId) && (!query || `${generation.brandName} ${generation.modelName} ${generation.name} ${generation.aliases}`.toLowerCase().includes(query));
  });

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
      generationId: '', generationName: '', engineCc: 0,
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
        generationId: vehicle.generationId || '',
        generationName: vehicle.generationName || '',
        engineCc: vehicle.engineCc || 0,
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
    const selectedBrand = catalog.brands.find(brand => brand.isActive && brand.name === formData.brand);
    const selectedModel = selectedBrand?.models.find(model => model.isActive && model.name === formData.model);
    if (catalog.brands.length && (!selectedBrand || !selectedModel)) {
      window.alert('Pilih merek dan tipe dari Master Kendaraan. Jika belum tersedia, tambahkan melalui tombol Master Kendaraan.');
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
      brandId: selectedBrand?.id,
      modelId: selectedModel?.id,
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
          <button
            onClick={() => {
              if (!canManageCatalog) {
                window.alert('Anda memerlukan hak Tambah atau Edit Kendaraan untuk mengelola master merek dan tipe.');
                return;
              }
              setMasterOpen(true);
              void loadCatalog();
            }}
            title={canManageCatalog ? 'Kelola merek, tipe, dan warna kendaraan' : 'Memerlukan hak Tambah atau Edit Kendaraan'}
            className={`inline-flex shrink-0 items-center gap-2 rounded-lg border bg-white px-4 py-2.5 font-medium ${canManageCatalog ? 'border-blue-300 text-blue-700 hover:bg-blue-50' : 'border-gray-300 text-gray-500'}`}
          >
            <Database className="h-5 w-5" /> Master Kendaraan{!canManageCatalog && ' 🔒'}
          </button>
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
                      {(vehicle.generationName || vehicle.engineCc) && <p className="text-[11px] font-medium text-cyan-700">{vehicle.generationName || 'Generasi belum diketahui'}{vehicle.engineCc ? ` · ${(vehicle.engineCc/1000).toLocaleString('id-ID',{maximumFractionDigits:1})}L` : ''}</p>}
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
                <p className="text-sm text-gray-500">{detailVehicle.brand} {detailVehicle.model}{detailVehicle.generationName ? ` · ${detailVehicle.generationName}` : ''}{detailVehicle.engineCc ? ` · ${(detailVehicle.engineCc/1000).toLocaleString('id-ID',{maximumFractionDigits:1})}L` : ''} {detailVehicle.year || ''} · {detailVehicle.color}</p>
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
              <button onClick={() => setMasterTab('brand')} className={`rounded-t-md border border-b-0 px-5 py-2.5 text-sm font-semibold ${masterTab === 'brand' ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-gray-200 text-gray-600'}`}>Merek &amp; Model</button>
              <button onClick={() => setMasterTab('generation')} className={`ml-1 rounded-t-md border border-b-0 px-5 py-2.5 text-sm font-semibold ${masterTab === 'generation' ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-gray-200 text-gray-600'}`}>Generasi &amp; Mesin</button>
              <button onClick={() => setMasterTab('color')} className={`ml-1 rounded-t-md border border-b-0 px-5 py-2.5 text-sm font-semibold ${masterTab === 'color' ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-gray-200 text-gray-600'}`}>Warna</button>
              <button onClick={() => setMasterTab('audit')} className={`ml-1 rounded-t-md border border-b-0 px-5 py-2.5 text-sm font-semibold ${masterTab === 'audit' ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-gray-200 text-gray-600'}`}><span className="inline-flex items-center gap-1"><ScrollText className="h-4 w-4" /> Riwayat</span></button>
            </div>
            <div className="max-h-[65vh] overflow-y-auto p-5">
              {masterTab !== 'audit' && <div className="relative mb-4"><Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" /><input value={masterSearch} onChange={event => setMasterSearch(event.target.value)} placeholder="Cari merek, model, generasi, atau alias..." className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm" /></div>}
              {masterTab === 'brand' ? (
                <div className="grid gap-5 md:grid-cols-2">
                  <section>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold text-gray-900">Daftar Merek</h4><div className="flex gap-1"><button onClick={() => void reorderCatalog('brand', catalog.brands, undefined, undefined, 'usage')} className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${catalog.sortModes.brandSortMode === 'usage' ? 'border-blue-600 bg-blue-600 text-white' : 'border-blue-300 text-blue-700 hover:bg-blue-50'}`}><ChartNoAxesColumnIncreasing className="h-4 w-4" /> Paling Dipakai</button><button onClick={() => void reorderCatalog('brand', catalog.brands, undefined, undefined, 'alphabetical')} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"><ArrowDownAZ className="h-4 w-4" /> A–Z</button></div></div>
                    <div className="mb-3 flex gap-2"><input value={newBrand} onChange={event => setNewBrand(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void createCatalogItem('brand', newBrand); }} placeholder="Merek baru" className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2" /><button onClick={() => void createCatalogItem('brand', newBrand)} className="rounded-lg bg-blue-600 px-3 text-white"><Plus className="h-4 w-4" /></button></div>
                    <div className="space-y-2">
                      {filteredCatalogBrands.map((brand, index) => { const canDelete = (brand.usageCount || 0) === 0 && brand.models.length === 0; const deleteTitle = (brand.usageCount || 0) > 0 ? `Tidak dapat dihapus: digunakan ${brand.usageCount} kendaraan` : brand.models.length > 0 ? `Tidak dapat dihapus: masih memiliki ${brand.models.length} tipe` : 'Hapus merek permanen'; return <div key={brand.id} className={`flex items-center rounded-lg border p-2 ${selectedBrandId === brand.id ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}><button onClick={() => setSelectedBrandId(brand.id)} className={`min-w-0 flex-1 truncate text-left text-sm font-medium ${brand.isActive ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{brand.name} <span className="ml-1 text-xs font-normal text-gray-400">({brand.usageCount || 0})</span></button><button disabled={index === 0} onClick={() => void reorderCatalog('brand', filteredCatalogBrands, index, -1)} className="p-1 text-gray-500 disabled:opacity-20"><ChevronUp className="h-4 w-4" /></button><button disabled={index === filteredCatalogBrands.length - 1} onClick={() => void reorderCatalog('brand', filteredCatalogBrands, index, 1)} className="p-1 text-gray-500 disabled:opacity-20"><ChevronDown className="h-4 w-4" /></button><button title="Ubah merek" onClick={() => void editCatalogItem('brand', brand)} className="p-2 text-blue-600"><Edit className="h-4 w-4" /></button>{canDeactivateCatalog && <button onClick={() => void mergeCatalogItem('brand', brand, catalog.brands)} title="Gabungkan duplikat" className="p-2 text-violet-600"><Combine className="h-4 w-4" /></button>}{canDeactivateCatalog && <button onClick={() => void toggleCatalogItem('brand', brand)} title={brand.isActive ? 'Nonaktifkan' : 'Aktifkan'} className={`p-2 ${brand.isActive ? 'text-emerald-600' : 'text-gray-400'}`}><Power className="h-4 w-4" /></button>}{canDeactivateCatalog && <button disabled={!canDelete} onClick={() => void deleteCatalogItem('brand', brand)} title={deleteTitle} className={`p-2 ${canDelete ? 'text-red-600 hover:bg-red-50' : 'cursor-not-allowed text-gray-300'}`}><Trash2 className="h-4 w-4" /></button>}</div>; })}
                    </div>
                  </section>
                  <section>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold text-gray-900">Tipe {selectedCatalogBrand ? `— ${selectedCatalogBrand.name}` : ''}</h4>{selectedCatalogBrand && <div className="flex gap-1"><button onClick={() => void reorderCatalog('model', selectedCatalogBrand.models, undefined, undefined, 'usage')} className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${catalog.sortModes.modelSortMode === 'usage' ? 'border-blue-600 bg-blue-600 text-white' : 'border-blue-300 text-blue-700 hover:bg-blue-50'}`}><ChartNoAxesColumnIncreasing className="h-4 w-4" /> Paling Dipakai</button><button onClick={() => void reorderCatalog('model', selectedCatalogBrand.models, undefined, undefined, 'alphabetical')} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"><ArrowDownAZ className="h-4 w-4" /> A–Z</button></div>}</div>
                    <div className="mb-3 flex gap-2"><input disabled={!selectedCatalogBrand} value={newModel} onChange={event => setNewModel(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && selectedCatalogBrand) void createCatalogItem('model', newModel, selectedCatalogBrand.id); }} placeholder="Tipe/model baru" className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100" /><button disabled={!selectedCatalogBrand} onClick={() => selectedCatalogBrand && void createCatalogItem('model', newModel, selectedCatalogBrand.id)} className="rounded-lg bg-blue-600 px-3 text-white disabled:bg-gray-300"><Plus className="h-4 w-4" /></button></div>
                    <div className="space-y-2">
                      {filteredCatalogModels.map((model, index, models) => { const canDelete = (model.usageCount || 0) === 0; return <div key={model.id} className="rounded-lg border border-gray-200 p-2"><div className="flex items-center"><span className={`min-w-0 flex-1 truncate text-sm ${model.isActive ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{model.name} <span className="ml-1 text-xs text-gray-400">({model.usageCount || 0})</span></span><button title="Kelola generasi dan mesin" onClick={() => openGenerationForm(model)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-cyan-700 hover:bg-cyan-50"><GitBranch className="h-4 w-4" /> Generasi</button><button disabled={index === 0} onClick={() => void reorderCatalog('model', models, index, -1)} className="p-1 text-gray-500 disabled:opacity-20"><ChevronUp className="h-4 w-4" /></button><button disabled={index === models.length - 1} onClick={() => void reorderCatalog('model', models, index, 1)} className="p-1 text-gray-500 disabled:opacity-20"><ChevronDown className="h-4 w-4" /></button><button title="Ubah model" onClick={() => void editCatalogItem('model', model)} className="p-2 text-blue-600"><Edit className="h-4 w-4" /></button>{canDeactivateCatalog && <button onClick={() => void mergeCatalogItem('model', model, selectedCatalogBrand?.models || [])} title="Gabungkan duplikat" className="p-2 text-violet-600"><Combine className="h-4 w-4" /></button>}{canDeactivateCatalog && <button title={model.isActive ? 'Nonaktifkan' : 'Aktifkan'} onClick={() => void toggleCatalogItem('model', model)} className={`p-2 ${model.isActive ? 'text-emerald-600' : 'text-gray-400'}`}><Power className="h-4 w-4" /></button>}{canDeactivateCatalog && <button disabled={!canDelete} onClick={() => void deleteCatalogItem('model', model)} title={canDelete ? 'Hapus tipe permanen' : `Tidak dapat dihapus: digunakan ${model.usageCount} kendaraan`} className={`p-2 ${canDelete ? 'text-red-600 hover:bg-red-50' : 'cursor-not-allowed text-gray-300'}`}><Trash2 className="h-4 w-4" /></button>}</div>{(model.generations||[]).length>0&&<div className="mt-1 flex flex-wrap gap-1 pl-1">{(model.generations||[]).map(generation=><button onClick={() => openGenerationForm(model,generation)} key={generation.id} className={`rounded px-2 py-1 text-[10px] ${generation.isActive?'bg-cyan-50 text-cyan-800':'bg-gray-100 text-gray-400 line-through'}`}>{generation.name}{generation.engineCcs.length ? ` · ${generation.engineCcs.map(cc=>(cc/1000).toLocaleString('id-ID',{maximumFractionDigits:1})+'L').join('/')}` : ''}</button>)}</div>}</div>; })}
                    </div>
                  </section>
                </div>
              ) : masterTab === 'generation' ? (
                <section className="space-y-4">
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                    <div className="mb-3 flex items-center justify-between"><div><h4 className="font-semibold text-gray-900">{editingGenerationId ? 'Edit Generasi & Mesin' : 'Tambah Generasi & Mesin'}</h4><p className="text-xs text-gray-500">Tahun dan kapasitas mesin boleh dikosongkan jika belum diketahui.</p></div>{editingGenerationId && <button onClick={() => resetGenerationDraft()} className="text-sm font-semibold text-blue-700">+ Data baru</button>}</div>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      <label className="text-xs font-medium text-gray-600">Model *<select value={generationModelId} onChange={event => resetGenerationDraft(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"><option value="">Pilih merek dan model</option>{catalogModels.filter(model=>model.isActive).map(model=><option key={model.id} value={model.id}>{model.brandName} — {model.name}</option>)}</select></label>
                      <label className="text-xs font-medium text-gray-600">Nama generasi *<input value={generationDraft.name} onChange={event=>setGenerationDraft({...generationDraft,name:event.target.value})} placeholder="Grand New Avanza" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></label>
                      <label className="text-xs font-medium text-gray-600">Alias pencarian<input value={generationDraft.aliases} onChange={event=>setGenerationDraft({...generationDraft,aliases:event.target.value})} placeholder="grand, grand new, gen 2" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></label>
                      <label className="text-xs font-medium text-gray-600">Tahun awal<input type="number" min="1900" value={generationDraft.yearFrom} onChange={event=>setGenerationDraft({...generationDraft,yearFrom:event.target.value})} placeholder="2015" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></label>
                      <label className="text-xs font-medium text-gray-600">Tahun akhir<input type="number" min="1900" value={generationDraft.yearTo} onChange={event=>setGenerationDraft({...generationDraft,yearTo:event.target.value})} placeholder="Kosong = sekarang" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></label>
                      <label className="text-xs font-medium text-gray-600">Pilihan CC<input value={generationDraft.engineCcs} onChange={event=>setGenerationDraft({...generationDraft,engineCcs:event.target.value})} placeholder="1.3, 1.5 atau 1300, 1500" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></label>
                    </div>
                    <div className="mt-3 flex justify-end gap-2"><button onClick={()=>resetGenerationDraft()} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Batal</button><button onClick={()=>void saveGeneration()} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"><Save className="h-4 w-4" /> Simpan</button></div>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-gray-200"><table className="w-full min-w-[760px] text-sm"><thead className="bg-gray-100 text-left text-xs uppercase text-gray-600"><tr><th className="px-3 py-2">Merek / Model</th><th className="px-3 py-2">Generasi</th><th className="px-3 py-2">Alias</th><th className="px-3 py-2">Tahun</th><th className="px-3 py-2">Mesin</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-gray-100">{filteredGenerations.map(generation=><tr key={generation.id} className={!generation.isActive?'bg-gray-50 text-gray-400':''}><td className="px-3 py-2"><div className="font-medium">{generation.brandName}</div><div className="text-xs text-gray-500">{generation.modelName}</div></td><td className="px-3 py-2 font-semibold">{generation.name}</td><td className="max-w-[180px] truncate px-3 py-2 text-xs">{generation.aliases||'-'}</td><td className="whitespace-nowrap px-3 py-2">{generation.yearFrom||'?'}–{generation.yearTo||'sekarang'}</td><td className="whitespace-nowrap px-3 py-2">{generation.engineCcs.length?generation.engineCcs.map(cc=>`${(cc/1000).toLocaleString('id-ID',{maximumFractionDigits:1})} L`).join(', '):'Belum diketahui'}</td><td className="px-3 py-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${generation.isActive?'bg-emerald-100 text-emerald-700':'bg-gray-200 text-gray-500'}`}>{generation.isActive?'Aktif':'Nonaktif'}</span></td><td className="px-3 py-2"><div className="flex justify-end gap-1"><button title="Edit generasi" onClick={()=>{ const model=catalogModels.find(item=>item.id===generation.modelId); if(model) openGenerationForm(model,generation); }} className="inline-flex items-center gap-1 rounded px-2 py-1 text-blue-700 hover:bg-blue-50"><Edit className="h-4 w-4" /> Edit</button>{canDeactivateCatalog&&<button title={generation.isActive?'Nonaktifkan':'Aktifkan'} onClick={()=>void toggleGeneration(generation)} className={`inline-flex items-center gap-1 rounded px-2 py-1 ${generation.isActive?'text-emerald-700':'text-gray-600'}`}><Power className="h-4 w-4" /> {generation.isActive?'Aktif':'Nonaktif'}</button>}</div></td></tr>)}</tbody></table>{filteredGenerations.length===0&&<p className="py-8 text-center text-sm text-gray-400">Belum ada generasi yang sesuai pencarian.</p>}</div>
                </section>
              ) : masterTab === 'color' ? (
                <section className="mx-auto max-w-xl">
                  <div className="mb-3 flex items-center justify-between"><h4 className="font-semibold text-gray-900">Daftar Warna</h4><span className="inline-flex items-center gap-1 rounded-lg border border-blue-600 bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white"><ChartNoAxesColumnIncreasing className="h-4 w-4" /> Paling Dipakai</span></div>
                  <div className="mb-3 flex gap-2"><input value={newColor} onChange={event => setNewColor(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void createCatalogItem('color', newColor); }} placeholder="Warna baru" className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2" /><button onClick={() => void createCatalogItem('color', newColor)} className="rounded-lg bg-blue-600 px-3 text-white"><Plus className="h-4 w-4" /></button></div>
                  <div className="space-y-2">{catalog.colors.filter(color=>!masterSearch||color.name.toLowerCase().includes(masterSearch.toLowerCase())).map(color => <div key={color.id} className="flex items-center rounded-lg border border-gray-200 p-2"><span className={`min-w-0 flex-1 truncate text-sm ${color.isActive ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{color.name} <span className="ml-1 text-xs font-normal text-gray-400">({color.usageCount || 0} kendaraan)</span></span><button title="Ubah warna" onClick={() => void editCatalogItem('color', color)} className="p-2 text-blue-600"><Edit className="h-4 w-4" /></button>{canDeactivateCatalog && <button onClick={() => void mergeCatalogItem('color', color, catalog.colors)} title="Gabungkan duplikat" className="p-2 text-violet-600"><Combine className="h-4 w-4" /></button>}{canDeactivateCatalog && <button title={color.isActive?'Nonaktifkan':'Aktifkan'} onClick={() => void toggleCatalogItem('color', color)} className={`p-2 ${color.isActive ? 'text-emerald-600' : 'text-gray-400'}`}><Power className="h-4 w-4" /></button>}</div>)}</div>
                </section>
              ) : (
                <section>
                  <div className="mb-3"><h4 className="font-semibold text-gray-900">Riwayat Perubahan Master</h4><p className="text-xs text-gray-500">Mencatat penambahan, perubahan nama, urutan, penggabungan, dan penonaktifan.</p></div>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full min-w-[680px] text-sm">
                      <thead className="bg-gray-100 text-left text-xs uppercase text-gray-600"><tr><th className="px-3 py-2">Waktu</th><th className="px-3 py-2">Pengguna</th><th className="px-3 py-2">Data</th><th className="px-3 py-2">Aksi</th><th className="px-3 py-2">Keterangan</th></tr></thead>
                      <tbody className="divide-y divide-gray-100">{catalog.auditLogs.map(log => <tr key={log.id}><td className="whitespace-nowrap px-3 py-2 text-gray-500">{formatAuditTime(log.createdAt)}</td><td className="px-3 py-2 font-medium text-gray-800">{log.userName || '-'}</td><td className="px-3 py-2">{log.entityName || log.entity}</td><td className="px-3 py-2 font-semibold text-blue-700">{log.action}</td><td className="px-3 py-2 text-gray-600">{log.detail || '-'}</td></tr>)}</tbody>
                    </table>
                  </div>
                  {catalog.auditLogs.length === 0 && <p className="py-8 text-center text-sm text-gray-400">Belum ada perubahan yang tercatat.</p>}
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
                    <select
                      required
                      value={formData.brand}
                      onChange={(e) => setFormData({ ...formData, brand: e.target.value, model: '', generationId: '', generationName: '', engineCc: 0 })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                    >
                      <option value="">Pilih merek</option>
                      {formData.brand && !catalogBrandNames.includes(formData.brand) && <option value={formData.brand}>{formData.brand} — perlu verifikasi</option>}
                      {catalogBrandNames.map((brand) => (
                        <option key={brand} value={brand}>{brand}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Model <span className="text-red-500">*</span>
                    </label>
                    <select
                      required
                      value={formData.model}
                      onChange={(e) => setFormData({ ...formData, model: e.target.value, generationId: '', generationName: '', engineCc: 0 })}
                      disabled={!formData.brand}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-100 bg-white"
                    >
                      <option value="">{formData.brand ? 'Pilih tipe/model' : 'Pilih merek dahulu'}</option>
                      {formData.model && !catalogModelNames.includes(formData.model) && <option value={formData.model}>{formData.model} — perlu verifikasi</option>}
                      {catalogModelNames.map(model => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Generasi / Nama Pasar <span className="text-xs font-normal text-gray-400">(opsional)</span></label>
                    <select value={formData.generationId} onChange={event => { const generation=availableGenerations.find(item=>item.id===event.target.value); setFormData({...formData,generationId:event.target.value,generationName:generation?.name||'',engineCc:0,year: formData.year && generation && ((generation.yearFrom&&formData.year<generation.yearFrom)||(generation.yearTo&&formData.year>generation.yearTo)) ? 0 : formData.year}); }} disabled={!formData.model} className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 disabled:bg-gray-100">
                      <option value="">Belum diketahui</option>{availableGenerations.map(generation=><option key={generation.id} value={generation.id}>{generation.name}{generation.yearFrom ? ` (${generation.yearFrom}${generation.yearTo ? `–${generation.yearTo}` : '–sekarang'})` : ''}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Kapasitas Mesin <span className="text-xs font-normal text-gray-400">(opsional)</span></label>
                    <select value={formData.engineCc} onChange={event=>setFormData({...formData,engineCc:Number(event.target.value)||0})} disabled={!selectedGeneration} className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 disabled:bg-gray-100">
                      <option value={0}>Belum diketahui</option>{(selectedGeneration?.engineCcs||[]).map(cc=><option key={cc} value={cc}>{(cc/1000).toLocaleString('id-ID',{maximumFractionDigits:1})} L / {cc.toLocaleString('id-ID')} cc</option>)}
                    </select>
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
                      {vehicleYears.filter(year => !selectedGeneration || ((!selectedGeneration.yearFrom || year >= selectedGeneration.yearFrom) && (!selectedGeneration.yearTo || year <= selectedGeneration.yearTo))).map(year => <option key={year} value={year}>{year}</option>)}
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
