import { useState, useMemo } from 'react';
import { Plus, Search, Edit, Trash2, Users, X, Save, Phone, Mail, MapPin, List, Settings2, RotateCcw, Printer, Download, MessageCircle, History, Clock3 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Customer, CustomerPerson, CustomerPersonRole } from '../types';
import { localDateKey } from '../lib/date';
import { api } from '../lib/apiClient';

type ContactTemplate = 'Hubungi Kembali' | 'Terima Kasih' | 'Minta Ulasan' | 'Pengingat Servis' | 'Pesan Bebas';
type ContactLog = { id:string; templateType:string; messageText:string; vehicleInfo?:string; workOrderNumber?:string; invoiceNumber?:string; status:string; createdByName?:string; createdAt:string };

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
  const { data, addCustomer, updateCustomer, deleteCustomer, generateCustomerCode, resolveBranchId, hasPermission, refreshData } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [columnSearch, setColumnSearch] = useState('');
  const [contactCustomer, setContactCustomer] = useState<Customer | null>(null);
  const [contactTemplate, setContactTemplate] = useState<ContactTemplate>('Hubungi Kembali');
  const [contactMessage, setContactMessage] = useState('');
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [contactHistory, setContactHistory] = useState<ContactLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [peopleCustomer, setPeopleCustomer] = useState<Customer | null>(null);
  const [editingPerson, setEditingPerson] = useState<CustomerPerson | null>(null);
  const [personSaving, setPersonSaving] = useState(false);
  const emptyPersonForm = { name:'', phone:'', email:'', relationshipLabel:'', roles:['Supir'] as CustomerPersonRole[], vehicleIds:[] as string[], isPrimaryPic:false, isBillingContact:false, isActive:true };
  const [personForm, setPersonForm] = useState(emptyPersonForm);
  const [visibleColumns, setVisibleColumns] = useState<CustomerColumn[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('drac-customer-columns') || '[]');
      return Array.isArray(saved) && saved.length ? Array.from(new Set<CustomerColumn>(['name', ...saved, 'actions'])) : defaultCustomerColumns;
    } catch { return defaultCustomerColumns; }
  });

  const [formData, setFormData] = useState({
    accountType: 'Pribadi' as 'Pribadi' | 'Perusahaan',
    name: '',
    companyName: '',
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
        (c.companyName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
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
    if (column === 'name') return `${customer.customerCode} - ${customer.companyName ? `${customer.companyName} / ` : ''}${customer.name}`;
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
    link.download = `daftar_pelanggan_${localDateKey()}.csv`;
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
    setFormData({ accountType: 'Pribadi', name: '', companyName: '', phone: '', address: '', email: '' });
    setEditingCustomer(null);
  };

  const handleOpenModal = (customer?: Customer) => {
    if (customer) {
      setEditingCustomer(customer);
      setPeopleCustomer(customer);
      setEditingPerson(null);
      setPersonForm(emptyPersonForm);
      setFormData({
        accountType: customer.accountType || 'Pribadi',
        name: customer.name,
        companyName: customer.companyName || '',
        phone: customer.phone,
        address: customer.address,
        email: customer.email,
      });
    } else {
      resetForm();
      setPeopleCustomer(null);
    }
    setShowModal(true);
  };

  const formIsDirty = () => {
    if (editingCustomer) return formData.accountType !== (editingCustomer.accountType || 'Pribadi') || formData.name !== editingCustomer.name || formData.companyName !== (editingCustomer.companyName || '') || formData.phone !== editingCustomer.phone || formData.address !== editingCustomer.address || formData.email !== editingCustomer.email;
    return Object.values(formData).some(value => value.trim() !== '');
  };

  const handleCloseModal = (force = false) => {
    if (!force && formIsDirty() && !window.confirm('Data pelanggan belum disimpan. Tutup form ini?')) return;
    setShowModal(false);
    setPeopleCustomer(null);
    setEditingPerson(null);
    setPersonForm(emptyPersonForm);
    resetForm();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const now = localDateKey();

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

  const customerContext = (customer: Customer) => {
    const vehicles = data.vehicles.filter(v => v.customerRefId === customer.id || (!v.customerRefId && v.customerId === customer.customerCode));
    const workOrders = data.workOrders.filter(wo => wo.customerRefId === customer.id || wo.customerName === customer.name).sort((a,b)=>(b.createdAt||b.date).localeCompare(a.createdAt||a.date));
    const invoices = data.invoices.filter(invoice => invoice.customerRefId === customer.id || invoice.customerName === customer.name).sort((a,b)=>(b.createdAt||b.date).localeCompare(a.createdAt||a.date));
    const wo = workOrders[0], invoice = invoices[0];
    const vehicle = vehicles.find(v => v.id === wo?.vehicleRefId) || vehicles[0];
    const branchId = wo?.branchId || invoice?.branchId || customer.firstSeenBranchId || customer.branchId;
    return { vehicle, wo, invoice, branchId, branch:data.branches.find(branch => branch.id === branchId) };
  };
  const templateMessage = (customer: Customer, template: ContactTemplate) => {
    const {vehicle,wo,branch}=customerContext(customer); const plate=vehicle?.plateNumber || wo?.plateNumber || 'kendaraan Anda'; const branchName=branch?.name || 'Dokter AC Mobil';
    if(template==='Terima Kasih') return `Halo Bapak/Ibu ${customer.name}, terima kasih sudah mempercayakan ${plate} kepada ${branchName}. Semoga AC mobilnya kembali dingin dan nyaman. Kami siap membantu apabila ada yang ingin ditanyakan.`;
    if(template==='Minta Ulasan') return `Halo Bapak/Ibu ${customer.name}, terima kasih sudah mempercayakan ${plate} kepada ${branchName}. Kami sangat menghargai apabila Bapak/Ibu bersedia memberikan ulasan melalui tautan berikut:\n\n${branch?.reviewUrl || '[Link Google Review belum diatur pada data cabang]'}`;
    if(template==='Pengingat Servis') return `Halo Bapak/Ibu ${customer.name}, kami dari ${branchName} ingin mengingatkan jadwal pengecekan kembali AC mobil ${plate}. Silakan balas pesan ini untuk menentukan waktu kunjungan.`;
    if(template==='Pesan Bebas') return `Halo Bapak/Ibu ${customer.name}, `;
    return `Halo Bapak/Ibu ${customer.name}, kami dari ${branchName} ingin menindaklanjuti kondisi AC mobil ${plate}${wo ? ` setelah pemeriksaan ${wo.woNumber}` : ''}. Apakah pengerjaannya ingin dilanjutkan atau dijadwalkan kembali?`;
  };
  const openContact = (customer:Customer) => { setContactCustomer(customer); setContactTemplate('Hubungi Kembali'); setContactMessage(templateMessage(customer,'Hubungi Kembali')); };
  const changeTemplate = (template:ContactTemplate) => { setContactTemplate(template); if(contactCustomer)setContactMessage(templateMessage(contactCustomer,template)); };
  const whatsappNumber=(value:string)=>{const digits=value.replace(/\D/g,'');return digits.startsWith('0')?`62${digits.slice(1)}`:digits};
  const sendContact = async () => { if(!contactCustomer||!contactMessage.trim())return;const context=customerContext(contactCustomer);if(contactTemplate==='Minta Ulasan'&&!context.branch?.reviewUrl)return window.alert('Link Google Review cabang belum diatur. Buka Pengguna & Akses → Cabang → Edit Cabang.');const payload={customerId:contactCustomer.id,customerName:contactCustomer.name,phone:contactCustomer.phone,templateType:contactTemplate,messageText:contactMessage,vehicleId:context.vehicle?.id,vehicleInfo:context.vehicle?`${context.vehicle.plateNumber} · ${context.vehicle.brand} ${context.vehicle.model}`:'',workOrderId:context.wo?.id,workOrderNumber:context.wo?.woNumber,invoiceId:context.invoice?.id,invoiceNumber:context.invoice?.invoiceNumber,branchId:context.branchId};const logRequest=api.create('customer-contacts',payload);window.open(`https://wa.me/${whatsappNumber(contactCustomer.phone)}?text=${encodeURIComponent(contactMessage)}`,'_blank','noopener,noreferrer');setContactCustomer(null);const result=await logRequest;if(!result.success)window.alert(result.message||'WhatsApp dibuka, tetapi histori kontak gagal disimpan.'); };
  const openHistory = async(customer:Customer)=>{setHistoryCustomer(customer);setHistoryLoading(true);const result=await api.get(`customer-contacts/${customer.id}`);setContactHistory(result.success?result.data||[]:[]);setHistoryLoading(false);};
  const editPerson = (person: CustomerPerson) => {
    setEditingPerson(person);
    setPersonForm({ name:person.name, phone:person.phone, email:person.email, relationshipLabel:person.relationshipLabel, roles:person.roles, vehicleIds:Array.from(new Set(person.vehicleAssignments.map(item=>item.vehicleId))), isPrimaryPic:person.isPrimaryPic, isBillingContact:person.isBillingContact, isActive:person.isActive });
  };
  const togglePersonRole = (role: CustomerPersonRole) => setPersonForm(current => ({ ...current, roles:current.roles.includes(role) ? current.roles.filter(item=>item!==role) : [...current.roles,role] }));
  const savePerson = async () => {
    if(!peopleCustomer || !personForm.name.trim()) return;
    setPersonSaving(true);
    const assignments = personForm.vehicleIds.flatMap(vehicleId => [
      ...(personForm.roles.includes('Owner') ? [{vehicleId,role:'Owner' as const}] : []),
      ...(personForm.roles.includes('Supir') ? [{vehicleId,role:'Supir' as const}] : []),
    ]);
    const payload={...personForm,customerId:peopleCustomer.id,vehicleAssignments:assignments};
    const result=editingPerson ? await api.update('customer-people',editingPerson.id,payload) : await api.create('customer-people',payload);
    setPersonSaving(false);
    if(!result.success) return window.alert(result.message || 'Kontak gagal disimpan.');
    await refreshData(); setEditingPerson(null); setPersonForm(emptyPersonForm);
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
          <div className="max-h-[calc(100vh-245px)] overflow-auto">
            <table className="w-full min-w-[1050px] text-left">
              <thead className="sticky top-0 z-10 bg-blue-800 text-xs uppercase tracking-wide text-white">
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
                            {customer.companyName && <p className="max-w-[220px] truncate text-xs text-gray-500">{customer.companyName}</p>}
                            <p className="font-mono text-xs font-medium text-blue-600">{customer.customerCode}</p>
                          </div>
                        </div>
                      </td>}
                      {visibleColumns.includes('phone') && <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-800">{customer.phone || '—'}</td>}
                      {visibleColumns.includes('plates') && <td className="px-4 py-3"><div className="flex max-w-[240px] flex-wrap gap-1">{customerVehicles.slice(0, 2).map(vehicle => <span key={vehicle.id} title={`${vehicle.brand} ${vehicle.model} ${vehicle.year || ''} - ${vehicle.color}`} className="rounded-md bg-sky-100 px-2 py-1 font-mono text-xs font-semibold text-sky-800">{vehicle.plateNumber}</span>)}{customerVehicles.length > 2 && <span title={customerVehicles.slice(2).map(vehicle => `${vehicle.plateNumber} — ${vehicle.brand} ${vehicle.model} ${vehicle.year || ''} - ${vehicle.color}`).join('\n')} className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">+{customerVehicles.length - 2} lainnya</span>}{customerVehicles.length === 0 && <span className="text-sm text-gray-400">—</span>}</div></td>}
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
                          <button onClick={() => openContact(customer)} disabled={!customer.phone} className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:text-gray-300" title="Hubungi via WhatsApp"><MessageCircle className="h-4 w-4" /></button>
                          <button onClick={() => void openHistory(customer)} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100" title="Riwayat kontak"><History className="h-4 w-4" /></button>
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
                      {customer.companyName && <p className="text-xs text-gray-500">{customer.companyName}</p>}
                      <p className="text-xs text-blue-600 font-mono font-medium">{customer.customerCode}</p>
                      <p className="text-xs text-gray-500">Sejak {customer.createdAt}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openContact(customer)} disabled={!customer.phone} className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 disabled:text-gray-300" title="Hubungi via WhatsApp"><MessageCircle className="h-4 w-4" /></button>
                    <button onClick={() => void openHistory(customer)} className="rounded-lg bg-slate-50 p-1.5 text-slate-600" title="Riwayat kontak"><History className="h-4 w-4" /></button>
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
                      <label className="text-sm font-medium text-gray-700">Nama Customer/PIC <span className="text-red-500">*</span></label>
                      <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value.toUpperCase() })} placeholder="Nama orang yang dapat dihubungi" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="grid items-center gap-2 sm:grid-cols-[150px_1fr]">
                      <label className="text-sm font-medium text-gray-700">Nama Perusahaan <span className="block text-xs font-normal text-gray-400">Opsional</span></label>
                      <input type="text" value={formData.companyName} onChange={(e) => setFormData({ ...formData, companyName: e.target.value.toUpperCase() })} placeholder="Perusahaan atau instansi" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
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
                  <h4 className="mb-4 border-b border-gray-200 pb-2 text-lg font-medium text-blue-600">Kontak Customer</h4>
                  <div className="space-y-4">
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                      <div className="mb-3 flex items-center justify-between"><strong className="text-sm text-blue-900">Kontak Utama (PIC)</strong><span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">UTAMA</span></div>
                      <p className="font-semibold text-gray-900">{formData.name || 'Nama mengikuti customer/perusahaan'}</p>
                      {formData.companyName && <p className="text-xs font-medium text-blue-700">{formData.companyName}</p>}
                      <p className="mt-1 text-sm text-gray-600">{formData.phone || 'Nomor telepon belum diisi'}</p>
                      <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="Email PIC (opsional)" className="mt-3 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500" />
                    </div>

                    {editingCustomer && peopleCustomer ? <>
                      <div>
                        <div className="mb-2 flex items-center justify-between"><strong className="text-sm text-gray-700">Kontak Tambahan</strong><button type="button" onClick={()=>{setEditingPerson(null);setPersonForm(emptyPersonForm)}} className="text-xs font-semibold text-blue-600">+ Tambah Kontak</button></div>
                        <div className="max-h-36 space-y-2 overflow-y-auto">
                          {data.customerPeople.filter(person=>person.customerId===editingCustomer.id && person.id!==editingCustomer.primaryContactId).map(person=><button type="button" key={person.id} onClick={()=>editPerson(person)} className={`w-full rounded-lg border p-2.5 text-left ${editingPerson?.id===person.id?'border-blue-500 bg-blue-50':'border-gray-200'}`}><div className="flex items-center justify-between gap-2"><strong className="text-sm">{person.name}</strong><span className="text-[10px] text-gray-500">{person.roles.join(', ')||'Kontak'}</span></div><p className="text-xs text-gray-500">{person.phone||'Tanpa telepon'} · {person.relationshipLabel||'Tanpa keterangan'}</p></button>)}
                          {data.customerPeople.filter(person=>person.customerId===editingCustomer.id && person.id!==editingCustomer.primaryContactId).length===0&&<p className="rounded-lg border border-dashed p-4 text-center text-xs text-gray-400">Belum ada kontak tambahan.</p>}
                        </div>
                      </div>
                      <div className="space-y-3 rounded-xl border bg-gray-50 p-3">
                        <div className="grid gap-2 sm:grid-cols-2"><input value={personForm.name} onChange={e=>setPersonForm({...personForm,name:e.target.value.toUpperCase()})} placeholder="Nama kontak" className="h-10 rounded-lg border px-3 text-sm"/><input value={personForm.phone} onChange={e=>setPersonForm({...personForm,phone:e.target.value})} placeholder="Nomor telepon" className="h-10 rounded-lg border px-3 text-sm"/><input value={personForm.relationshipLabel} onChange={e=>setPersonForm({...personForm,relationshipLabel:e.target.value})} placeholder="Jabatan / hubungan" className="h-10 rounded-lg border px-3 text-sm"/><input value={personForm.email} onChange={e=>setPersonForm({...personForm,email:e.target.value})} placeholder="Email (opsional)" className="h-10 rounded-lg border px-3 text-sm"/></div>
                        <div className="flex flex-wrap gap-1.5">{(['Owner','PIC','Supir','Keuangan','Pengelola Kendaraan'] as CustomerPersonRole[]).map(role=><label key={role} className={`cursor-pointer rounded-lg border px-2 py-1.5 text-[11px] font-semibold ${personForm.roles.includes(role)?'border-violet-500 bg-violet-50 text-violet-700':'bg-white text-gray-500'}`}><input type="checkbox" className="mr-1" checked={personForm.roles.includes(role)} onChange={()=>togglePersonRole(role)}/>{role}</label>)}</div>
                        <div><p className="mb-1 text-[11px] font-semibold text-gray-600">Kendaraan yang boleh dibawa/dimiliki</p><div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">{data.vehicles.filter(vehicle=>vehicle.customerRefId===editingCustomer.id).map(vehicle=><label key={vehicle.id} className="rounded-lg border bg-white px-2 py-1.5 text-[11px]"><input type="checkbox" className="mr-1" checked={personForm.vehicleIds.includes(vehicle.id)} onChange={()=>setPersonForm(current=>({...current,vehicleIds:current.vehicleIds.includes(vehicle.id)?current.vehicleIds.filter(id=>id!==vehicle.id):[...current.vehicleIds,vehicle.id]}))}/>{vehicle.plateNumber}</label>)}</div></div>
                        <button type="button" onClick={()=>void savePerson()} disabled={!personForm.name.trim()||personSaving} className="w-full rounded-lg bg-violet-600 py-2 text-sm font-semibold text-white disabled:bg-gray-300">{personSaving?'Menyimpan...':editingPerson?'Simpan Perubahan Kontak':'Tambah Kontak'}</button>
                      </div>
                    </> : <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-500">Simpan customer terlebih dahulu. Setelah itu buka Edit untuk menambahkan supir, owner, PIC lain, atau orang yang dipercayakan.</p>}
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
      {peopleCustomer && !showModal && <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/50 p-3"><div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b px-5 py-4"><div><h3 className="font-bold">Kontak & Pengguna Kendaraan</h3><p className="text-sm text-gray-500">{peopleCustomer.name} · {peopleCustomer.accountType || 'Pribadi'}</p></div><button onClick={()=>setPeopleCustomer(null)}><X className="h-5 w-5"/></button></header>
        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[1fr_1.15fr]">
          <section className="border-b p-4 md:border-b-0 md:border-r"><h4 className="mb-3 text-sm font-bold text-slate-700">Daftar kontak</h4><div className="space-y-2">{data.customerPeople.filter(person=>person.customerId===peopleCustomer.id).map(person=><button type="button" key={person.id} onClick={()=>editPerson(person)} className={`w-full rounded-xl border p-3 text-left ${editingPerson?.id===person.id?'border-blue-500 bg-blue-50':'border-gray-200 hover:bg-slate-50'}`}><div className="flex justify-between gap-2"><strong>{person.name}</strong><span className={`text-xs font-semibold ${person.isActive?'text-emerald-600':'text-gray-400'}`}>{person.isActive?'Aktif':'Nonaktif'}</span></div><p className="text-xs text-gray-500">{person.phone || 'Tanpa telepon'} · {person.relationshipLabel || 'Kontak'}</p><div className="mt-2 flex flex-wrap gap-1">{person.roles.map(role=><span key={role} className="rounded bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">{role}</span>)}</div></button>)}{data.customerPeople.filter(person=>person.customerId===peopleCustomer.id).length===0&&<p className="rounded-lg bg-gray-50 p-6 text-center text-sm text-gray-400">Belum ada kontak.</p>}</div></section>
          <section className="space-y-4 p-4"><div className="flex items-center justify-between"><h4 className="text-sm font-bold text-slate-700">{editingPerson?'Edit kontak':'Kontak baru'}</h4>{editingPerson&&<button onClick={()=>{setEditingPerson(null);setPersonForm(emptyPersonForm)}} className="text-xs font-semibold text-blue-600">+ Kontak baru</button>}</div>
            <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-gray-600">Nama *<input value={personForm.name} onChange={e=>setPersonForm({...personForm,name:e.target.value.toUpperCase()})} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm font-normal"/></label><label className="text-xs font-semibold text-gray-600">Hubungan / Jabatan<input value={personForm.relationshipLabel} onChange={e=>setPersonForm({...personForm,relationshipLabel:e.target.value})} placeholder="Direktur, istri, staf..." className="mt-1 h-10 w-full rounded-lg border px-3 text-sm font-normal"/></label><label className="text-xs font-semibold text-gray-600">Telepon<input value={personForm.phone} onChange={e=>setPersonForm({...personForm,phone:e.target.value})} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm font-normal"/></label><label className="text-xs font-semibold text-gray-600">Email<input value={personForm.email} onChange={e=>setPersonForm({...personForm,email:e.target.value})} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm font-normal"/></label></div>
            <div><p className="mb-2 text-xs font-bold text-gray-600">Peran</p><div className="flex flex-wrap gap-2">{(['Owner','PIC','Supir','Keuangan','Pengelola Kendaraan'] as CustomerPersonRole[]).map(role=><label key={role} className={`cursor-pointer rounded-lg border px-3 py-2 text-xs font-semibold ${personForm.roles.includes(role)?'border-violet-500 bg-violet-50 text-violet-700':'border-gray-200 text-gray-500'}`}><input type="checkbox" checked={personForm.roles.includes(role)} onChange={()=>togglePersonRole(role)} className="mr-2"/>{role}</label>)}</div></div>
            <div><p className="mb-2 text-xs font-bold text-gray-600">Kendaraan yang boleh dibawa / dimiliki</p><div className="grid max-h-32 gap-2 overflow-y-auto sm:grid-cols-2">{data.vehicles.filter(vehicle=>vehicle.customerRefId===peopleCustomer.id).map(vehicle=><label key={vehicle.id} className="flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-xs"><input type="checkbox" checked={personForm.vehicleIds.includes(vehicle.id)} onChange={()=>setPersonForm(current=>({...current,vehicleIds:current.vehicleIds.includes(vehicle.id)?current.vehicleIds.filter(id=>id!==vehicle.id):[...current.vehicleIds,vehicle.id]}))}/><span><strong>{vehicle.plateNumber}</strong><br/>{vehicle.brand} {vehicle.model}</span></label>)}</div></div>
            <div className="grid gap-2 sm:grid-cols-3"><label className="text-xs"><input type="checkbox" checked={personForm.isPrimaryPic} onChange={e=>setPersonForm({...personForm,isPrimaryPic:e.target.checked})} className="mr-2"/>PIC utama</label><label className="text-xs"><input type="checkbox" checked={personForm.isBillingContact} onChange={e=>setPersonForm({...personForm,isBillingContact:e.target.checked})} className="mr-2"/>Penerima tagihan</label><label className="text-xs"><input type="checkbox" checked={personForm.isActive} onChange={e=>setPersonForm({...personForm,isActive:e.target.checked})} className="mr-2"/>Aktif</label></div>
          </section>
        </div><footer className="flex justify-end gap-2 border-t p-4"><button onClick={()=>setPeopleCustomer(null)} className="rounded-lg border px-4 py-2">Tutup</button><button onClick={()=>void savePerson()} disabled={!personForm.name.trim()||personSaving} className="rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white disabled:bg-gray-300">{personSaving?'Menyimpan...':'Simpan Kontak'}</button></footer>
      </div></div>}
      {contactCustomer && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"><header className="flex items-center justify-between bg-emerald-600 px-5 py-4 text-white"><div><h3 className="font-bold">WhatsApp Pelanggan</h3><p className="text-xs text-emerald-100">{contactCustomer.name} · {contactCustomer.phone}</p></div><button onClick={()=>setContactCustomer(null)}><X className="h-5 w-5"/></button></header><div className="space-y-4 p-5"><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{(['Hubungi Kembali','Terima Kasih','Minta Ulasan','Pengingat Servis','Pesan Bebas'] as ContactTemplate[]).map(template=><button key={template} onClick={()=>changeTemplate(template)} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${contactTemplate===template?'border-emerald-600 bg-emerald-50 text-emerald-700':'border-gray-200 text-gray-600'}`}>{template}</button>)}</div><label className="block text-sm font-medium text-gray-700">Pesan<textarea rows={7} value={contactMessage} onChange={event=>setContactMessage(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-300 p-3 text-sm outline-none focus:border-emerald-500"/></label><p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Saat dilanjutkan, sistem mencatat status “WhatsApp Dibuka”. Pengiriman dan pembacaan pesan tidak dapat dipastikan tanpa WhatsApp Business API.</p></div><footer className="flex justify-end gap-2 border-t p-4"><button onClick={()=>setContactCustomer(null)} className="rounded-lg border px-4 py-2">Batal</button><button onClick={()=>void sendContact()} disabled={!contactMessage.trim()} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white disabled:bg-gray-300"><MessageCircle className="h-4 w-4"/>Buka WhatsApp</button></footer></div></div>}
      {historyCustomer && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"><header className="flex items-center justify-between border-b px-5 py-4"><div><h3 className="font-bold">Riwayat Kontak</h3><p className="text-sm text-gray-500">{historyCustomer.name}</p></div><button onClick={()=>setHistoryCustomer(null)}><X className="h-5 w-5"/></button></header><div className="max-h-[70vh] space-y-3 overflow-y-auto p-5">{historyLoading?<p className="py-10 text-center text-gray-400">Memuat histori...</p>:contactHistory.length?contactHistory.map(log=><article key={log.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{log.templateType}</span><p className="mt-2 text-xs text-gray-500">{[log.vehicleInfo,log.workOrderNumber,log.invoiceNumber].filter(Boolean).join(' · ')||'Kontak pelanggan'}</p></div><div className="text-right text-xs text-gray-500"><p className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5"/>{new Date(log.createdAt).toLocaleString('id-ID')}</p><p>{log.createdByName||'-'} · {log.status}</p></div></div><p className="mt-3 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{log.messageText}</p></article>):<p className="py-10 text-center text-gray-400">Belum ada riwayat kontak.</p>}</div><footer className="flex justify-end border-t p-4"><button onClick={()=>setHistoryCustomer(null)} className="rounded-lg border px-4 py-2">Tutup</button></footer></div></div>}
    </div>
  );
}
