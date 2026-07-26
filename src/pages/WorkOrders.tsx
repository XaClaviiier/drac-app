import { useState, useMemo } from 'react';
import { Plus, Search, Edit, Trash2, Wrench, X, Save, FileText, CheckCircle2, Receipt, User, Car } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { WorkOrder, WorkOrderService } from '../types';
import CustomerPicker from '../components/CustomerPicker';
import VehiclePicker from '../components/VehiclePicker';

// Layanan yang sering digunakan akan diambil otomatis dari Master Barang & Jasa (Type: Jasa / Group)

export default function WorkOrders() {
  const { data, addWorkOrder, updateWorkOrder, deleteWorkOrder, createInvoiceFromWO, addItem, currentBranchId, hasPermission } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editingWO, setEditingWO] = useState<WorkOrder | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [invoiceWO, setInvoiceWO] = useState<WorkOrder | null>(null);
  const [invoicePayment, setInvoicePayment] = useState(0);
  const [successMsg, setSuccessMsg] = useState('');

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    customerRefId: '',
    customerId: '',
    customerName: '',
    vehicleRefId: '',
    plateNumber: '',
    vehicleInfo: '',
    description: '',
    services: [] as WorkOrderService[],
    notes: '',
    status: 'Draft' as WorkOrder['status'],
  });

  const [newService, setNewService] = useState({ itemId: '', code: '', name: '', description: '', price: 0, qty: 1 });
  const [showServiceForm, setShowServiceForm] = useState(false);
  const availableServiceItems = data.items.filter((item) => item.isActive);

  // Quick-add Item modal state
  const [showQuickAddItem, setShowQuickAddItem] = useState(false);
  const [quickItemForm, setQuickItemForm] = useState({
    name: '',
    type: 'Jasa' as 'Persediaan' | 'Jasa' | 'Non Persediaan',
    unit: 'JASA',
    sellingPrice: 0,
    categoryId: '',
  });

  const handleQuickAddItem = () => {
    if (!quickItemForm.name) { window.alert('Nama barang/jasa harus diisi'); return; }
    if (!quickItemForm.categoryId) {
      const firstCat = data.itemCategories.find(c => c.isActive);
      if (!firstCat) { window.alert('Belum ada kategori barang. Buat kategori dulu di menu Barang & Jasa.'); return; }
      quickItemForm.categoryId = firstCat.id;
    }
    const category = data.itemCategories.find(c => c.id === quickItemForm.categoryId);
    const prefix = quickItemForm.type === 'Jasa' ? 'JSA' : quickItemForm.type === 'Non Persediaan' ? 'NP' : 'BRG';
    const count = data.items.filter(item => item.code.startsWith(prefix)).length + 1;
    const newCode = `${prefix}-${String(count).padStart(4, '0')}`;

    const newItem = {
      id: Date.now().toString(),
      code: newCode,
      name: quickItemForm.name.toUpperCase(),
      categoryId: quickItemForm.categoryId,
      categoryName: category?.name || '-',
      type: quickItemForm.type,
      brand: '',
      unit: quickItemForm.unit,
      stock: 0,
      sellableStock: 0,
      purchasePrice: 0,
      sellingPrice: quickItemForm.sellingPrice,
      isActive: true,
      isQuickService: false,
      description: '',
      branchId: currentBranchId === 'ALL' ? 'BR-001' : (currentBranchId || 'BR-001'),
    };
    addItem(newItem);

    // Auto-add to current WO services
    setFormData(prev => ({
      ...prev,
      services: [
        ...prev.services,
        {
          id: Date.now().toString() + '-svc',
          itemId: newItem.id,
          code: newItem.code,
          name: newItem.name,
          description: '',
          price: newItem.sellingPrice,
          qty: 1,
        },
      ],
    }));

    setQuickItemForm({ name: '', type: 'Jasa', unit: 'JASA', sellingPrice: 0, categoryId: '' });
    setShowQuickAddItem(false);
    setShowServiceForm(false);
  };

  const selectedCustomer = data.customers.find((customer) => customer.id === formData.customerRefId) || null;

  const handleCustomerSelect = (customerRefId: string) => {
    const customer = data.customers.find((item) => item.id === customerRefId);
    if (!customer) {
      setFormData((prev) => ({
        ...prev,
        customerRefId: '',
        customerId: '',
        customerName: '',
        vehicleRefId: '',
        plateNumber: '',
        vehicleInfo: '',
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      customerRefId: customer.id,
      customerId: customer.customerCode,
      customerName: customer.name,
      vehicleRefId: '',
      plateNumber: '',
      vehicleInfo: '',
    }));
  };

  const handleVehicleSelect = (vehicleId: string) => {
    const vehicle = data.vehicles.find((item) => item.id === vehicleId);
    if (!vehicle) return;

    setFormData((prev) => ({
      ...prev,
      vehicleRefId: vehicle.id,
      plateNumber: vehicle.plateNumber,
      vehicleInfo: `${vehicle.brand} ${vehicle.model} ${vehicle.year} - ${vehicle.color}`,
    }));
  };

  const filteredWOs = useMemo(() => {
    return data.workOrders
      .filter((wo) => {
        const branchMatch = currentBranchId === 'ALL' || wo.branchId === currentBranchId;
        if (!branchMatch) return false;

        const matchesSearch =
          wo.woNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
          wo.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          wo.plateNumber.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = !filterStatus || wo.status === filterStatus;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        // Newest first: compare by date desc, then by WO number desc (for same-day records)
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return b.woNumber.localeCompare(a.woNumber);
      });
  }, [data.workOrders, searchTerm, filterStatus, currentBranchId]);

  const totalServices = formData.services.reduce((sum, s) => sum + s.price * s.qty, 0);

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      customerRefId: '',
      customerId: '',
      customerName: '',
      vehicleRefId: '',
      plateNumber: '',
      vehicleInfo: '',
      description: '',
      services: [],
      notes: '',
      status: 'Draft',
    });
    setNewService({ itemId: '', code: '', name: '', description: '', price: 0, qty: 1 });
    setShowServiceForm(false);
    setEditingWO(null);
  };

  const handleOpenModal = (wo?: WorkOrder) => {
    if (wo) {
      setEditingWO(wo);
      const matchedVehicle = data.vehicles.find(
        (v) => v.plateNumber === wo.plateNumber && v.customerName === wo.customerName
      );
      setFormData({
        date: wo.date,
        customerRefId: wo.customerRefId || '',
        customerId: wo.customerId,
        customerName: wo.customerName,
        vehicleRefId: matchedVehicle?.id || '',
        plateNumber: wo.plateNumber,
        vehicleInfo: wo.vehicleInfo,
        description: wo.description || '',
        services: wo.services,
        notes: wo.notes || '',
        status: wo.status,
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

  const handleAddService = () => {
    if (newService.name) {
      setFormData({
        ...formData,
        services: [
          ...formData.services,
          { ...newService, id: Date.now().toString() },
        ],
      });
      setNewService({ itemId: '', code: '', name: '', description: '', price: 0, qty: 1 });
      setShowServiceForm(false);
    } else {
      window.alert('Nama layanan/barang harus diisi');
    }
  };

  const handleRemoveService = (id: string) => {
    setFormData({
      ...formData,
      services: formData.services.filter((s) => s.id !== id),
    });
  };

  const handleUpdateService = (id: string, field: 'price' | 'qty' | 'description', value: number | string) => {
    setFormData(prev => ({
      ...prev,
      services: prev.services.map(s => s.id === id ? { ...s, [field]: value } : s),
    }));
  };

  const handleUseItem = (itemId: string) => {
    const item = data.items.find((entry) => entry.id === itemId);
    if (!item) return;

    // If Group, add header line with fixed group price and members with 0 price
    if (item.type === 'Group' && item.groupMembers && item.groupMembers.length > 0) {
      // 1. Group Header Line (Carries the price)
      const groupHeader: WorkOrderService = {
        id: `head-${Date.now()}`,
        itemId: item.id,
        code: item.code,
        name: `📦 ${item.name}`,
        description: 'Harga Paket / Group',
        price: item.sellingPrice,
        qty: 1,
      };

      // 2. Individual Member Lines (Informational, price 0)
      const memberLines: WorkOrderService[] = item.groupMembers.map((member, index) => ({
        id: `mem-${Date.now()}-${index}`,
        itemId: member.itemId,
        code: member.itemCode,
        name: `   - ${member.itemName}`,
        description: `Isi dari paket: ${item.name}`,
        price: 0,
        qty: member.qty,
      }));

      setFormData((prev) => ({
        ...prev,
        services: [...prev.services, groupHeader, ...memberLines],
      }));
      
      setNewService({ itemId: '', code: '', name: '', description: '', price: 0, qty: 1 });
      setShowServiceForm(false);
      return;
    }

    setNewService({
      itemId: item.id,
      code: item.code,
      name: item.name,
      description: item.description,
      price: item.sellingPrice,
      qty: 1,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const woCount = data.workOrders.length + 1;
    const woNumber = `WO-2026-${String(woCount).padStart(3, '0')}`;

    if (editingWO) {
      updateWorkOrder(editingWO.id, {
        ...editingWO,
        ...formData,
        total: totalServices,
      });
    } else {
      addWorkOrder({
        id: Date.now().toString(),
        woNumber,
        ...formData,
        total: totalServices,
        branchId: currentBranchId || 'BR-001',
      });
    }
    handleCloseModal();
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus order kerja ini?')) {
      deleteWorkOrder(id);
    }
  };

  const handleStatusChange = (id: string, status: WorkOrder['status']) => {
    const wo = data.workOrders.find((w) => w.id === id);
    if (wo) {
      updateWorkOrder(id, { ...wo, status });
    }
  };

  const handleOpenInvoiceModal = (wo: WorkOrder) => {
    setInvoiceWO(wo);
    setInvoicePayment(wo.total);
  };

  const handleCreateInvoice = async () => {
    if (invoiceWO) {
      const invoice = await createInvoiceFromWO(invoiceWO.id, invoicePayment);
      if (invoice) {
        setSuccessMsg(`Faktur ${invoice.invoiceNumber} berhasil dibuat dari ${invoiceWO.woNumber}!`);
        setTimeout(() => setSuccessMsg(''), 4000);
      }
      setInvoiceWO(null);
      setInvoicePayment(0);
    }
  };

  const statusColors = {
    Draft: 'bg-gray-100 text-gray-800',
    Proses: 'bg-blue-100 text-blue-800',
    Selesai: 'bg-green-100 text-green-800',
    Dibayar: 'bg-purple-100 text-purple-800',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Order Kerja</h2>
          <p className="text-gray-500 mt-1">Kelola order kerja service AC mobil</p>
        </div>
        {hasPermission('wo:create') && (
          <button
            onClick={() => handleOpenModal()}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-lg shadow-blue-600/20"
          >
            <Plus className="w-5 h-5" />
            Buat Order Kerja
          </button>
        )}
      </div>

      {/* Success Message */}
      {successMsg && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3 animate-pulse">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-sm font-medium text-green-800">{successMsg}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(['Draft', 'Proses', 'Selesai', 'Dibayar'] as const).map((status) => {
          const count = data.workOrders.filter((w) => w.status === status).length;
          return (
            <div key={status} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <p className="text-sm text-gray-500">{status}</p>
              <p className="text-2xl font-bold text-gray-900">{count}</p>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Cari nomor WO, pelanggan, atau nomor plat..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
          >
            <option value="">Semua Status</option>
            <option value="Draft">Draft</option>
            <option value="Proses">Proses</option>
            <option value="Selesai">Selesai</option>
            <option value="Dibayar">Dibayar</option>
          </select>
        </div>
      </div>

      {/* Work Order Cards */}
      <div className="space-y-4">
        {filteredWOs.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <Wrench className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-lg font-medium text-gray-900">Tidak ada order kerja</p>
            <p className="text-sm text-gray-500">Klik "Buat Order Kerja" untuk menambahkan order baru</p>
          </div>
        ) : (
          filteredWOs.map((wo) => (
            <div key={wo.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
              <div className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center">
                      <Wrench className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 text-lg">{wo.woNumber}</h3>
                      <p className="text-sm text-gray-500">{wo.date} • {wo.plateNumber}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      value={wo.status}
                      disabled={!hasPermission('wo:edit')}
                      onChange={(e) => handleStatusChange(wo.id, e.target.value as WorkOrder['status'])}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border-0 ${statusColors[wo.status]} ${!hasPermission('wo:edit') ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                      <option value="Draft">Draft</option>
                      <option value="Proses">Proses</option>
                      <option value="Selesai">Selesai</option>
                      <option value="Dibayar">Dibayar</option>
                    </select>
                    {wo.invoiceId ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm font-medium">
                        <FileText className="w-4 h-4" />
                        {wo.invoiceNumber}
                      </span>
                    ) : (
                      hasPermission('invoice:create') && (
                        <button
                          onClick={() => handleOpenInvoiceModal(wo)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                          title="Buat Faktur dari Order Kerja"
                        >
                          <Receipt className="w-4 h-4" />
                          Buat Faktur
                        </button>
                      )
                    )}
                    {hasPermission('wo:edit') && (
                      <button
                        onClick={() => handleOpenModal(wo)}
                        className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    )}
                    {hasPermission('wo:delete') && (
                      <button
                        onClick={() => handleDelete(wo.id)}
                        className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                        title="Hapus"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Pelanggan</p>
                    <p className="text-gray-900">{wo.customerName}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">Kendaraan</p>
                    <p className="text-gray-900">{wo.vehicleInfo}</p>
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Layanan ({wo.services.length})</p>
                  <div className="space-y-2">
                    {wo.services.map((service) => (
                      <div key={service.id} className="flex items-center justify-between text-sm">
                        <div>
                          <span className="font-medium text-gray-900">{service.name}</span>
                          <span className="text-gray-500 ml-2">x{service.qty}</span>
                        </div>
                        <span className="text-gray-900 font-medium">
                          Rp {(service.price * service.qty).toLocaleString('id-ID')}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
                    <span className="font-semibold text-gray-900">Total</span>
                    <span className="text-xl font-bold text-blue-600">
                      Rp {wo.total.toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>

                {(wo.description || wo.notes) && (
                  <div className="mt-4 space-y-2">
                    {wo.description && (
                      <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                        <p className="text-sm text-gray-700">
                          <span className="font-medium text-blue-700">Keterangan:</span> {wo.description}
                        </p>
                      </div>
                    )}
                    {wo.notes && (
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-600">
                          <span className="font-medium">Catatan:</span> {wo.notes}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingWO ? 'Edit Order Kerja' : 'Buat Order Kerja Baru'}
                </h3>
                <p className="text-sm text-gray-500">Isi data order kerja service AC</p>
              </div>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Tanggal & Status */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tanggal <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as WorkOrder['status'] })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                  >
                    <option value="Draft">Draft</option>
                    <option value="Proses">Proses</option>
                    <option value="Selesai">Selesai</option>
                    <option value="Dibayar">Dibayar</option>
                  </select>
                </div>
              </div>

              {/* Pelanggan & Kendaraan dengan Searchable Picker */}
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                    <User className="w-4 h-4 text-blue-600" />
                    Data Pelanggan <span className="text-red-500">*</span>
                  </label>
                  <CustomerPicker
                    value={formData.customerRefId}
                    onChange={handleCustomerSelect}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                    <Car className="w-4 h-4 text-orange-600" />
                    Data Kendaraan <span className="text-red-500">*</span>
                  </label>
                  <VehiclePicker
                    customer={selectedCustomer}
                    value={formData.vehicleRefId}
                    onChange={handleVehicleSelect}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Keterangan
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Keluhan pelanggan / catatan kendaraan / masalah AC..."
                    rows={2}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                  />
                </div>
              </div>

              {/* Services */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700">Layanan Service AC</label>
                  <button
                    type="button"
                    onClick={() => setShowServiceForm(!showServiceForm)}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {showServiceForm ? 'Batal' : '+ Tambah Layanan'}
                  </button>
                </div>

                {showServiceForm && (
                  <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Pilih dari Master Barang & Jasa</label>
                      <div className="flex gap-2">
                        <select
                          value={newService.itemId}
                          onChange={(e) => handleUseItem(e.target.value)}
                          className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Pilih barang/jasa...</option>
                          {availableServiceItems.filter((i) => i.type === 'Group').length > 0 && (
                            <optgroup label="📦 Group / Paket">
                              {availableServiceItems.filter((i) => i.type === 'Group').map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.code} - {item.name} ({item.groupMembers?.length || 0} item) - Rp {item.sellingPrice.toLocaleString('id-ID')}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup label="Barang & Jasa">
                            {availableServiceItems.filter((i) => i.type !== 'Group').map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.code} - {item.name} - Rp {item.sellingPrice.toLocaleString('id-ID')}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                        {hasPermission('item:create') && (
                          <button
                            type="button"
                            onClick={() => setShowQuickAddItem(true)}
                            className="inline-flex items-center gap-1 rounded-lg bg-green-600 hover:bg-green-700 px-3 py-2 text-sm font-medium text-white shadow-sm"
                            title="Tambah barang/jasa baru (tidak ada di master)"
                          >
                            <Plus className="w-4 h-4" /> Baru
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-[10px] text-gray-500">
                        Tidak ketemu? Klik tombol <strong className="text-green-700">+ Baru</strong> untuk menambahkan barang/jasa baru.
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Layanan Cepat (Jasa & Paket)</label>
                      <div className="flex flex-wrap gap-2">
                        {availableServiceItems
                          .filter((i) => i.isActive && i.isQuickService)
                          .map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleUseItem(item.id)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                                item.type === 'Group'
                                  ? 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100'
                                  : 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                              }`}
                              title={item.name}
                            >
                              {item.name}
                            </button>
                          ))}
                        {availableServiceItems.filter((i) => i.isActive && i.isQuickService).length === 0 && (
                          <p className="text-[10px] text-gray-400 italic">Belum ada master layanan cepat yang dipilih</p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div className="md:col-span-2">
                        <input
                          type="text"
                          placeholder="Nama layanan"
                          value={newService.name}
                          onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                      </div>
                      <div>
                        <input
                          type="number"
                          placeholder="Harga"
                          min="0"
                          value={newService.price || ''}
                          onChange={(e) => setNewService({ ...newService, price: parseInt(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                      </div>
                      <div>
                        <input
                          type="number"
                          placeholder="Qty"
                          min="1"
                          value={newService.qty}
                          onChange={(e) => setNewService({ ...newService, qty: parseInt(e.target.value) || 1 })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Deskripsi (opsional)"
                        value={newService.description}
                        onChange={(e) => setNewService({ ...newService, description: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddService}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Tambahkan Layanan
                    </button>
                  </div>
                )}

                {formData.services.length > 0 ? (
                  <div className="space-y-2">
                    {formData.services.map((service) => {
                      const isGroupHeader = service.name.startsWith('📦');
                      const isGroupMember = service.name.startsWith('   -');
                      return (
                        <div
                          key={service.id}
                          className={`rounded-lg border p-3 transition-colors ${
                            isGroupHeader
                              ? 'bg-purple-50 border-purple-200'
                              : isGroupMember
                              ? 'bg-gray-50 border-gray-200 ml-6'
                              : 'bg-white border-gray-200'
                          }`}
                        >
                          {/* Name + Delete */}
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold ${isGroupHeader ? 'text-purple-700' : 'text-gray-900'}`}>
                                {service.name}
                              </p>
                              {service.code && (
                                <p className="font-mono text-[10px] text-gray-400">{service.code}</p>
                              )}
                              {service.description && (
                                <p className="text-xs text-gray-500 italic mt-0.5">{service.description}</p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveService(service.id)}
                              className="p-1 text-red-500 hover:bg-red-100 rounded transition-colors flex-shrink-0"
                              title="Hapus"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Editable Qty, Price, Subtotal */}
                          <div className="grid grid-cols-12 gap-2 items-center">
                            <div className="col-span-3">
                              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Qty</label>
                              <input
                                type="number"
                                min="1"
                                value={service.qty}
                                onChange={(e) => handleUpdateService(service.id, 'qty', parseInt(e.target.value) || 1)}
                                className="w-full rounded border border-gray-300 px-2 py-1.5 text-center text-sm font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div className="col-span-5">
                              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                                Harga Satuan {isGroupHeader && '(Group)'}
                              </label>
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">Rp</span>
                                <input
                                  type="number"
                                  min="0"
                                  value={service.price}
                                  onChange={(e) => handleUpdateService(service.id, 'price', parseInt(e.target.value) || 0)}
                                  className={`w-full rounded border-2 px-7 py-1.5 text-right text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${
                                    isGroupHeader
                                      ? 'font-bold text-purple-700 border-purple-300 bg-purple-50'
                                      : service.price === 0
                                      ? 'border-yellow-300 bg-yellow-50 text-gray-700'
                                      : 'border-gray-300 bg-white'
                                  }`}
                                />
                              </div>
                              {service.price === 0 && !isGroupMember && !isGroupHeader && (
                                <p className="text-[10px] text-yellow-600 mt-0.5">⚠ Harga 0</p>
                              )}
                            </div>
                            <div className="col-span-4">
                              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Subtotal</label>
                              <div className={`rounded border px-2 py-1.5 text-right text-sm font-bold whitespace-nowrap ${
                                isGroupHeader
                                  ? 'border-purple-300 bg-purple-100 text-purple-700'
                                  : 'border-gray-200 bg-gray-50 text-gray-900'
                              }`}>
                                Rp {(service.price * service.qty).toLocaleString('id-ID')}
                              </div>
                            </div>
                          </div>

                          {/* Editable Description */}
                          <input
                            type="text"
                            value={service.description || ''}
                            onChange={(e) => handleUpdateService(service.id, 'description', e.target.value)}
                            placeholder="Tambah keterangan (opsional)..."
                            className="mt-2 w-full bg-transparent text-xs text-gray-500 border-b border-dashed border-gray-200 hover:border-gray-400 focus:border-blue-500 outline-none py-1"
                          />
                        </div>
                      );
                    })}

                    {/* TOTAL */}
                    <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg border-2 border-blue-300">
                      <span className="font-semibold text-gray-900">TOTAL</span>
                      <span className="text-xl font-bold text-blue-700">
                        Rp {totalServices.toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                    <Wrench className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">Belum ada layanan ditambahkan</p>
                  </div>
                )}
              </div>

              {/* Catatan Internal */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Catatan Internal Bengkel</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Catatan internal teknisi (sparepart, kendala, dll)..."
                  rows={2}
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
                  {editingWO ? 'Simpan Perubahan' : 'Simpan Order Kerja'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Add Item Modal */}
      {showQuickAddItem && (
        <div className="fixed inset-[5%] z-[60] flex items-start justify-center pointer-events-none">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md pointer-events-auto border-2 border-green-500">
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-4 rounded-t-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                <h3 className="text-lg font-bold">Tambah Barang/Jasa Baru</h3>
              </div>
              <button onClick={() => setShowQuickAddItem(false)} className="rounded-lg p-1.5 hover:bg-white/20"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-xs text-blue-700">
                💡 Item akan otomatis tersimpan ke <strong>Master Barang & Jasa</strong> dan langsung masuk ke WO ini.
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Jenis *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Jasa', 'Persediaan', 'Non Persediaan'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setQuickItemForm({ ...quickItemForm, type: t, unit: t === 'Jasa' ? 'JASA' : 'PCS' })}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                        quickItemForm.type === t
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Barang/Jasa *</label>
                <input
                  autoFocus
                  type="text"
                  value={quickItemForm.name}
                  onChange={(e) => setQuickItemForm({ ...quickItemForm, name: e.target.value.toUpperCase() })}
                  placeholder="Mis: ISI FREON R134A"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 uppercase outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Satuan</label>
                  <select
                    value={quickItemForm.unit}
                    onChange={(e) => setQuickItemForm({ ...quickItemForm, unit: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white outline-none focus:border-green-500"
                  >
                    {['PCS', 'SET', 'CAN', 'BOTOL', 'LITER', 'JASA', 'UNIT'].map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Harga Jual</label>
                  <input
                    type="number"
                    min="0"
                    value={quickItemForm.sellingPrice}
                    onChange={(e) => setQuickItemForm({ ...quickItemForm, sellingPrice: parseInt(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-green-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
                <select
                  value={quickItemForm.categoryId}
                  onChange={(e) => setQuickItemForm({ ...quickItemForm, categoryId: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white outline-none focus:border-green-500"
                >
                  <option value="">Auto (kategori pertama)</option>
                  {data.itemCategories.filter(c => c.isActive).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="border-t border-gray-200 p-4 flex gap-2 justify-end">
              <button type="button" onClick={() => setShowQuickAddItem(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Batal</button>
              <button type="button" onClick={handleQuickAddItem} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
                <Save className="w-4 h-4" /> Simpan & Tambahkan ke WO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Confirmation Modal */}
      {invoiceWO && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-4 rounded-t-xl flex items-center justify-between">
              <div className="flex items-center gap-3 text-white">
                <Receipt className="w-6 h-6" />
                <div>
                  <h3 className="text-lg font-semibold">Buat Faktur dari WO</h3>
                  <p className="text-sm text-green-100">{invoiceWO.woNumber}</p>
                </div>
              </div>
              <button
                onClick={() => setInvoiceWO(null)}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Pelanggan</span>
                  <span className="font-medium text-gray-900">{invoiceWO.customerName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Kendaraan</span>
                  <span className="font-medium text-gray-900">{invoiceWO.plateNumber}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Jumlah Layanan</span>
                  <span className="font-medium text-gray-900">{invoiceWO.services.length} item</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-200">
                  <span className="font-semibold text-gray-900">Total Tagihan</span>
                  <span className="text-lg font-bold text-green-600">
                    Rp {invoiceWO.total.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Jumlah Pembayaran (Rp)
                </label>
                <input
                  type="number"
                  min="0"
                  value={invoicePayment}
                  onChange={(e) => setInvoicePayment(parseInt(e.target.value) || 0)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setInvoicePayment(invoiceWO.total)}
                    className="flex-1 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Bayar Lunas
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvoicePayment(0)}
                    className="flex-1 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Belum Bayar
                  </button>
                </div>
                <p className={`mt-2 text-sm font-medium ${invoicePayment >= invoiceWO.total ? 'text-green-600' : 'text-yellow-600'}`}>
                  Status: {invoicePayment >= invoiceWO.total ? 'Lunas' : `Belum Lunas (sisa Rp ${(invoiceWO.total - invoicePayment).toLocaleString('id-ID')})`}
                </p>
              </div>
            </div>

            <div className="px-6 pb-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setInvoiceWO(null)}
                className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleCreateInvoice}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors shadow-lg shadow-green-600/20"
              >
                <Receipt className="w-4 h-4" />
                Buat Faktur
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
