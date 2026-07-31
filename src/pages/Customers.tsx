import { useState, useMemo } from 'react';
import { Plus, Search, Edit, Trash2, Users, X, Save, Phone, Mail, MapPin, List, Settings2, RotateCcw, Printer, Download } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Customer } from '../types';

type CustomerColumn = 'name' | 'phone' | 'plates' | 'email' | 'address' | 'vehicles' | 'workOrders' | 'invoices' | 'firstBranch' | 'actions';
const customerColumns: Array<{ id: CustomerColumn; label: string; locked?: boolean }> = [
  { id: 'name', label: 'Kode / Nama Pelanggan', locked: true }, { id: 'phone', label: 'No. Telepon' },
  { id: 'plates', label: 'No. Plat Kendaraan' }, { id: 'email', label: 'Email' }, { id: 'address', label: 'Alamat' },
  { id: 'vehicles', label: 'Jumlah Kendaraan' }, { id: 'workOrders', label: 'Jumlah WO' },
  { id: 'invoices', label: 'Jumlah Faktur' }, { id: 'firstBranch', label: 'Cabang Pertama' },
  { id: 'actions', label: 'Aksi', locked: true },
];
const defaultCustomerColumns: CustomerColumn[] = ['name', 'phone', 'plates', 'vehicles', 'workOrders', 'invoices', 'actions'];

export default function Customers() {
  const { data, addCustomer, updateCustomer, deleteCustomer, generateCustomerCode, resolveBranchId, hasPermission } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [columnSearch, setColumnSearch] = useState('');
  const [visibleColumns, setVisibleColumns] = useState<CustomerColumn[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('drac-customer-columns') || '[]');
      return Array.isArray(saved) && saved.length ? Array.from(new Set<CustomerColumn>(['name', ...saved, 'actions'])) : defaultCustomerColumns;
    } catch { return defaultCustomerColumns; }
  });

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    email: '',
  });

  const filteredCustomers = useMemo(() => {
    // Pelanggan bersifat GLOBAL — tampil di semua cabang
    return data.customers.filter((c) => {
      const matchesPlate = data.vehicles.some(v => (v.customerRefId === c.id || (!v.customerRefId && v.customerId === c.customerCode)) && v.plateNumber.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesSearch =
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone.includes(searchTerm) ||
        c.email.toLowerCase().includes(searchTerm.toLowerCase()) || matchesPlate;
      return matchesSearch;
    });
  }, [data.customers, data.vehicles, searchTerm]);

  const setColumns = (columns: CustomerColumn[]) => {
    const next = Array.from(new Set<CustomerColumn>(['name', ...columns, 'actions']));
    setVisibleColumns(next);
    localStorage.setItem('drac-customer-columns', JSON.stringify(next));
  };
  const toggleColumn = (column: CustomerColumn) => setColumns(visibleColumns.includes(column) ? visibleColumns.filter(item => item !== column) : [...visibleColumns, column]);

  const customerFieldValue = (customer: Customer, column: CustomerColumn) => {
    const vehicles = data.vehicles.filter(vehicle => vehicle.customerRefId === customer.id || (!vehicle.customerRefId && vehicle.customerId === customer.customerCode));
    if (column === 'name') return `${customer.customerCode} - ${customer.name}`;
    if (column === 'phone') return customer.phone || '';
    if (column === 'plates') return vehicles.map(vehicle => vehicle.plateNumber).join(', ');
    if (column === 'email') return customer.email || '';
    if (column === 'address') return customer.address || '';
    if (column === 'vehicles') return String(vehicles.length);
    if (column === 'workOrders') return String(data.workOrders.filter(wo => wo.customerRefId === customer.id || wo.customerName === customer.name).length);
    if (column === 'invoices') return String(data.invoices.filter(invoice => invoice.customerRefId === customer.id || invoice.customerName.includes(customer.name)).length);
    if (column === 'firstBranch') return data.branches.find(branch => branch.id === customer.firstSeenBranchId)?.name || '';
    return '';
  };

  const printableColumns = customerColumns.filter(column => column.id !== 'actions' && visibleColumns.includes(column.id));
  const exportCustomers = () => {
    const csv = [printableColumns.map(column => `"${column.label}"`).join(','), ...filteredCustomers.map(customer => printableColumns.map(column => `"${customerFieldValue(customer, column.id).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `daftar_pelanggan_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const printCustomers = () => {
    const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const popup = window.open('', '_blank', 'width=1100,height=750');
    if (!popup) return window.alert('Popup diblokir browser. Izinkan popup untuk mencetak.');
    const headers = printableColumns.map(column => `<th>${escape(column.label)}</th>`).join('');
    const rows = filteredCustomers.map(customer => `<tr>${printableColumns.map(column => `<td>${escape(customerFieldValue(customer, column.id))}</td>`).join('')}</tr>`).join('');
    popup.document.write(`<!doctype html><html><head><title>Daftar Pelanggan</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#172033}h1{margin:0 0 4px;font-size:22px}.meta{color:#667085;font-size:12px;margin-bottom:18px}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#1e40af;color:white;text-align:left;padding:8px;border:1px solid #1e3a8a}td{padding:7px;border:1px solid #d0d5dd}tr:nth-child(even){background:#f8fafc}@media print{body{margin:8mm}}</style></head><body><h1>DOKTER AC MOBIL — Daftar Pelanggan</h1><div class="meta">Dicetak ${new Date().toLocaleString('id-ID')} · ${filteredCustomers.length} pelanggan</div><table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`);
    popup.document.close();
  };

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

      <div className={`${showModal ? 'lg:hidden' : ''} space-y-6 lg:space-y-0.5`}>
      {/* Search */}
      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="relative w-full max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Cari nama, nomor telepon, atau email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 w-full rounded-lg border border-gray-300 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button type="button" onClick={printCustomers} disabled={filteredCustomers.length === 0} title="Print daftar pelanggan" className="hidden h-9 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 sm:inline-flex"><Printer className="h-4 w-4" /><span className="hidden xl:inline">Print</span></button>
          <button type="button" onClick={exportCustomers} disabled={filteredCustomers.length === 0} title="Export CSV" className="hidden h-9 items-center justify-center gap-1.5 rounded-lg border border-green-300 bg-white px-3 text-sm font-medium text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-40 sm:inline-flex"><Download className="h-4 w-4" /><span className="hidden xl:inline">Export</span></button>
          {hasPermission('customer:create') && (
            <button onClick={() => handleOpenModal()} title="Tambah Pelanggan" className="inline-flex h-9 flex-shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-700">
              <Plus className="h-5 w-5" /><span className="hidden sm:inline">Tambah</span>
            </button>
          )}
          <div className="relative hidden lg:block">
            <button type="button" onClick={() => setShowColumnPicker(current => !current)} title="Pilih kolom tabel" className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${showColumnPicker ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}`}><Settings2 className="h-4 w-4" /></button>
            {showColumnPicker && (
              <>
                <button type="button" aria-label="Tutup pilihan kolom" onClick={() => setShowColumnPicker(false)} className="fixed inset-0 z-20" />
                <div className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
                  <div className="relative mb-2"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input autoFocus value={columnSearch} onChange={event => setColumnSearch(event.target.value)} placeholder="Cari field..." className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500" /></div>
                  <div className="max-h-72 space-y-1 overflow-y-auto">
                    {customerColumns.filter(column => column.label.toLowerCase().includes(columnSearch.toLowerCase())).map(column => (
                      <label key={column.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${column.locked ? 'cursor-not-allowed bg-gray-50 text-gray-400' : 'cursor-pointer text-gray-700 hover:bg-blue-50'}`}>
                        <input type="checkbox" checked={visibleColumns.includes(column.id)} disabled={column.locked} onChange={() => toggleColumn(column.id)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />{column.label}
                      </label>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3"><button type="button" onClick={() => setColumns(customerColumns.map(column => column.id))} className="text-xs font-semibold text-blue-600 hover:text-blue-800">Tampilkan Semua</button><button type="button" onClick={() => setColumns(defaultCustomerColumns)} className="flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900"><RotateCcw className="h-3.5 w-3.5" /> Reset Default</button></div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Desktop Customer Table */}
      {filteredCustomers.length > 0 && (
        <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm lg:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left">
              <thead className="bg-blue-800 text-xs uppercase tracking-wide text-white">
                <tr>
                  {visibleColumns.includes('name') && <th className="px-4 py-3 font-semibold">Kode / Nama Pelanggan</th>}
                  {visibleColumns.includes('phone') && <th className="px-4 py-3 font-semibold">No. Telepon</th>}
                  {visibleColumns.includes('plates') && <th className="px-4 py-3 font-semibold">No. Plat Kendaraan</th>}
                  {visibleColumns.includes('email') && <th className="px-4 py-3 font-semibold">Email</th>}
                  {visibleColumns.includes('address') && <th className="px-4 py-3 font-semibold">Alamat</th>}
                  {visibleColumns.includes('vehicles') && <th className="px-4 py-3 text-center font-semibold">Kendaraan</th>}
                  {visibleColumns.includes('workOrders') && <th className="px-4 py-3 text-center font-semibold">WO</th>}
                  {visibleColumns.includes('invoices') && <th className="px-4 py-3 text-center font-semibold">Faktur</th>}
                  {visibleColumns.includes('firstBranch') && <th className="px-4 py-3 font-semibold">Cabang Pertama</th>}
                  {visibleColumns.includes('actions') && <th className="px-4 py-3 text-right font-semibold">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCustomers.map((customer) => {
                  const customerVehicles = data.vehicles.filter((v) =>
                    v.customerRefId === customer.id ||
                    (!v.customerRefId && v.customerId === customer.customerCode)
                  );
                  const vehicleCount = customerVehicles.length;
                  const invoiceCount = data.invoices.filter(
                    (invoice) => invoice.customerRefId === customer.id || invoice.customerName.includes(customer.name)
                  ).length;
                  const workOrderCount = data.workOrders.filter(
                    (wo) => wo.customerRefId === customer.id || wo.customerName === customer.name
                  ).length;
                  return (
                    <tr key={customer.id} className="transition-colors hover:bg-blue-50/50">
                      {visibleColumns.includes('name') && <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-sm font-bold text-white">
                            {customer.name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="max-w-[220px] truncate text-sm font-semibold text-gray-900">{customer.name}</p>
                            <p className="font-mono text-xs font-medium text-blue-600">{customer.customerCode}</p>
                          </div>
                        </div>
                      </td>}
                      {visibleColumns.includes('phone') && <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-800">{customer.phone || '—'}</td>}
                      {visibleColumns.includes('plates') && <td className="px-4 py-3"><div className="flex max-w-[240px] flex-wrap gap-1">{customerVehicles.slice(0, 2).map(vehicle => <span key={vehicle.id} title={vehicle.vehicleInfo} className="rounded-md bg-sky-100 px-2 py-1 font-mono text-xs font-semibold text-sky-800">{vehicle.plateNumber}</span>)}{customerVehicles.length > 2 && <span title={customerVehicles.slice(2).map(vehicle => `${vehicle.plateNumber} — ${vehicle.vehicleInfo}`).join('\n')} className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">+{customerVehicles.length - 2} lainnya</span>}{customerVehicles.length === 0 && <span className="text-sm text-gray-400">—</span>}</div></td>}
                      {visibleColumns.includes('email') && <td className="px-4 py-3 text-sm text-gray-700">
                        <span className="block max-w-[190px] truncate" title={customer.email}>{customer.email || '—'}</span>
                      </td>}
                      {visibleColumns.includes('address') && <td className="px-4 py-3 text-sm text-gray-700">
                        <span className="block max-w-[260px] truncate" title={customer.address}>{customer.address || '—'}</span>
                      </td>}
                      {visibleColumns.includes('vehicles') && <td className="px-4 py-3 text-center">
                        <span className="inline-flex min-w-8 justify-center rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">{vehicleCount}</span>
                      </td>}
                      {visibleColumns.includes('workOrders') && <td className="px-4 py-3 text-center">
                        <span className="inline-flex min-w-8 justify-center rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-800">{workOrderCount}</span>
                      </td>}
                      {visibleColumns.includes('invoices') && <td className="px-4 py-3 text-center">
                        <span className="inline-flex min-w-8 justify-center rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">{invoiceCount}</span>
                      </td>}
                      {visibleColumns.includes('firstBranch') && <td className="px-4 py-3 text-sm text-gray-700">{data.branches.find(branch => branch.id === customer.firstSeenBranchId)?.name || '—'}</td>}
                      {visibleColumns.includes('actions') && <td className="px-4 py-3">
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
                      </td>}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 lg:static lg:z-auto lg:grid lg:grid-cols-[minmax(0,1fr)_120px] lg:items-start lg:gap-3 lg:bg-transparent lg:p-0">
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
            <form id="customer-data-form" onSubmit={handleSubmit} className="space-y-5 p-6 lg:p-4">
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

              <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4 lg:hidden">
                <button
                  type="button"
                  onClick={() => handleCloseModal()}
                  className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!formData.name.trim() || !formData.phone.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none"
                >
                  <Save className="h-4 w-4" />
                  <span>{editingCustomer ? 'Simpan Perubahan' : 'Simpan Pelanggan'}</span>
                </button>
              </div>
            </form>
          </div>
          <button type="submit" form="customer-data-form" disabled={!formData.name.trim() || !formData.phone.trim()} title="Simpan Pelanggan" className="sticky top-[60px] mt-[45px] hidden h-28 w-28 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/25 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none lg:inline-flex">
            <Save className="h-12 w-12" />
          </button>
        </div>
      )}
    </div>
  );
}
