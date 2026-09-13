import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Building2, MapPin, Hash, ShieldCheck, Bot, Save, KeyRound,
  CheckCircle2, AlertTriangle, BookOpenCheck, ClipboardCheck, Wrench, FileText, WalletCards, Database, Trash2,
  GitBranch, Plus, ChevronUp, ChevronDown, Power,
  Download, Upload, FileSpreadsheet, RotateCcw, Search,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { AppSettings } from '../types';
import { api } from '../lib/apiClient';
import IndonesianDateInput from '../components/IndonesianDateInput';

type Tab = 'company' | 'features' | 'tax' | 'sales' | 'purchases' | 'security' | 'approval' | 'attachments' | 'attributes' | 'defaultAccounts' | 'other' | 'branches' | 'documents' | 'workflow' | 'inventory' | 'ai' | 'guide' | 'backup' | 'maintenance';

const tabs = [
  { id: 'company' as const, label: 'Perusahaan', hint: 'Profil, logo, alamat, identitas pajak', group: 'Preferensi Utama', icon: Building2 },
  { id: 'features' as const, label: 'Fitur', hint: 'Aktifkan modul sesuai kebutuhan usaha', group: 'Preferensi Utama', icon: ClipboardCheck },
  { id: 'tax' as const, label: 'Pajak', hint: 'PPN dan akun pajak', group: 'Preferensi Utama', icon: FileText },
  { id: 'defaultAccounts' as const, label: 'Akun Default', hint: 'Akun otomatis untuk transaksi', group: 'Preferensi Utama', icon: WalletCards },
  { id: 'branches' as const, label: 'Cabang & Akun', hint: 'Kas, bank, piutang, pendapatan, persediaan', group: 'Preferensi Utama', icon: MapPin },
  { id: 'documents' as const, label: 'Penomoran Dokumen', hint: 'Nomor WO dan faktur', group: 'Transaksi', icon: Hash },
  { id: 'sales' as const, label: 'Penjualan', hint: 'Aturan faktur dan pembayaran pelanggan', group: 'Transaksi', icon: FileText },
  { id: 'purchases' as const, label: 'Pembelian', hint: 'Aturan penerimaan dan hutang supplier', group: 'Transaksi', icon: WalletCards },
  { id: 'inventory' as const, label: 'Persediaan', hint: 'Stok, HPP, gudang, dan penyesuaian', group: 'Transaksi', icon: Database },
  { id: 'workflow' as const, label: 'Operasional Bengkel', hint: 'Alur WO dan alasan Lost Sales', group: 'Transaksi', icon: GitBranch },
  { id: 'security' as const, label: 'Keamanan & Pembatasan', hint: 'Sesi, backdate, audit, akses', group: 'Kontrol', icon: ShieldCheck },
  { id: 'approval' as const, label: 'Persetujuan', hint: 'Alur persetujuan transaksi', group: 'Kontrol', icon: ClipboardCheck },
  { id: 'attachments' as const, label: 'Lampiran', hint: 'Aturan dokumen pendukung', group: 'Kontrol', icon: FileText },
  { id: 'attributes' as const, label: 'Atribut Tambahan', hint: 'Kolom tambahan transaksi', group: 'Kontrol', icon: Plus },
  { id: 'ai' as const, label: 'Integrasi AI', hint: 'Model dan izin data Asisten AI', group: 'Integrasi', icon: Bot },
  { id: 'other' as const, label: 'Lain-lain', hint: 'Pengaturan tambahan sistem', group: 'Sistem', icon: Wrench },
  { id: 'guide' as const, label: 'Panduan Sistem', hint: 'Cara kerja modul CerdikApp', group: 'Sistem', icon: BookOpenCheck },
  { id: 'backup' as const, label: 'Backup & Restore', hint: 'Cadangan transaksi Excel', group: 'Sistem', icon: FileSpreadsheet },
  { id: 'maintenance' as const, label: 'Pemeliharaan Data', hint: 'Perbaikan dan penghapusan terkontrol', group: 'Sistem', icon: Database },
];

const backupSheetNames = ['Pelanggan', 'Kendaraan', 'WO', 'Detail_WO', 'Faktur', 'Detail_Faktur', 'Pembayaran'] as const;

const inputClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';
const labelClass = 'space-y-1.5 text-sm font-medium text-gray-700';

export default function SettingsPage() {
  const { data, currentUser, updateSettings } = useApp();
  const [tab, setTab] = useState<Tab>(() => {
    const saved = localStorage.getItem('drac-settings-tab') as Tab | null;
    return tabs.some(item => item.id === saved) ? saved! : 'company';
  });
  const [innerTab, setInnerTab] = useState('perusahaan');
  const [companyTab, setCompanyTab] = useState<'info' | 'address'>('info');

  const [draft, setDraft] = useState<AppSettings>(() => structuredClone(data.settings));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [aiKey, setAiKey] = useState('');
  const [aiConfigured, setAiConfigured] = useState(false);
  const [cashAccounts, setCashAccounts] = useState<any[]>([]);
  const [ledgerAccounts, setLedgerAccounts] = useState<any[]>([]);
  const [branchAccountSettings, setBranchAccountSettings] = useState<any[]>([]);
  const [maintenanceFrom, setMaintenanceFrom] = useState('2000-01-01');
  const [maintenanceTo, setMaintenanceTo] = useState('2026-07-31');
  const [maintenanceBranchId, setMaintenanceBranchId] = useState('');
  const [maintenancePreview, setMaintenancePreview] = useState<any>(null);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [maintenanceConfirmation, setMaintenanceConfirmation] = useState('');
  const [maintenanceCleanupOrphans, setMaintenanceCleanupOrphans] = useState(false);
  const [maintenanceResult, setMaintenanceResult] = useState<any>(null);
  const [restoreSheets, setRestoreSheets] = useState<Record<string, any[]> | null>(null);
  const [restoreFileName, setRestoreFileName] = useState('');
  const [restorePreview, setRestorePreview] = useState<any>(null);
  const [restoreMode, setRestoreMode] = useState<'insert' | 'upsert'>('insert');
  const [backupBusy, setBackupBusy] = useState(false);
  const [newLostSalesReason, setNewLostSalesReason] = useState('');
  const canEdit = Boolean(currentUser?.isOwner || currentUser?.roleName === 'Administrator');
  const maintenanceBranch = data.branches.find(branch => branch.id === maintenanceBranchId);
  const maintenanceExpectedConfirmation = maintenanceBranchId === 'ALL' ? 'HAPUS SEMUA CABANG' : maintenanceBranch ? `HAPUS ${maintenanceBranch.name.toUpperCase()}` : '';
  const lostSalesReasons = draft.lostSalesReasonTemplates || [];
  const updateLostSalesReasons = (reasons: NonNullable<AppSettings['lostSalesReasonTemplates']>) => setDraft(prev => ({ ...prev, lostSalesReasonTemplates: reasons }));
  const moveLostSalesReason = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= lostSalesReasons.length) return;
    const next = [...lostSalesReasons];
    [next[index], next[target]] = [next[target], next[index]];
    updateLostSalesReasons(next);
  };
  const addLostSalesReason = () => {
    const label = newLostSalesReason.trim();
    if (!label || lostSalesReasons.some(reason => reason.label.localeCompare(label, 'id', { sensitivity: 'base' }) === 0)) return;
    updateLostSalesReasons([...lostSalesReasons, { id: `lost-${Date.now()}`, label, isActive: true, requiresNote: false }]);
    setNewLostSalesReason('');
  };

  useEffect(() => {
    setDraft(structuredClone(data.settings));
  }, [data.settings]);

  useEffect(() => {
    const next = tab === 'company' ? 'info' : tab === 'features' ? 'perusahaan' : tab === 'inventory' ? 'persediaan' : tab === 'sales' ? 'penjualan' : tab === 'purchases' ? 'pembelian' : tab === 'tax' ? 'pajak' : tab;
    setInnerTab(next);
    if (tab === 'company') setCompanyTab('info');
  }, [tab]);

  useEffect(() => {
    api.getAISettings().then(result => {
      if (result.success && result.data) {
        setAiConfigured(Boolean(result.data.configured));
        if (result.data.model) setDraft(prev => ({ ...prev, ai: { ...prev.ai, model: result.data.model } }));
      }
    });
  }, []);

  useEffect(() => {
    Promise.all([
      api.get('cash-accounts'),
      api.get('chart-of-accounts'),
      api.get('branch-account-settings'),
    ]).then(([cashResult, ledgerResult, mappingResult]) => {
      if (cashResult.success) setCashAccounts(cashResult.data || []);
      if (ledgerResult.success) setLedgerAccounts(ledgerResult.data || []);
      if (mappingResult.success) setBranchAccountSettings(mappingResult.data || []);
    });
  }, []);

  const previews = useMemo(() => {
    const firstBranch = data.branches[0]?.id || 'BR-001';
    const code = draft.branchDocumentCodes[firstBranch] || 'X';
    const now = new Date();
    const branchNumbers: Record<string, string> = { 'BR-001': '3', 'BR-002': '2', 'BR-003': '1' };
    const dateKey = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const seq = '1'.padStart(draft.documents.sequenceDigits, '0');
    return {
      workOrder: `${draft.documents.workOrderPrefix}${code}${dateKey}${seq}`,
      invoice: `${code}${String(now.getFullYear()).slice(-2)}${branchNumbers[firstBranch] || '0'}001`,
    };
  }, [data.branches, draft]);

  const save = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      await updateSettings(draft);
      if (tab === 'branches') {
        for (const mapping of branchAccountSettings) {
          const result = await api.update('branch-account-settings', mapping.branchId, mapping);
          if (!result.success) throw new Error(result.message || 'Gagal menyimpan pengaitan akun cabang');
        }
      }
      if (tab === 'ai' && currentUser?.isOwner && aiKey.trim()) {
        const result = await api.updateAISettings(aiKey.trim(), draft.ai.model);
        if (!result.success) throw new Error([result.message, result.error].filter(Boolean).join(': ') || 'Gagal menyimpan API Key Groq');
        setAiConfigured(true);
        setAiKey('');
      }
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3000);
    } catch (error: any) {
      window.alert(error?.message || 'Gagal menyimpan pengaturan');
    } finally {
      setSaving(false);
    }
  };

  const setCompany = (key: keyof AppSettings['company'], value: string) =>
    setDraft(prev => ({ ...prev, company: { ...prev.company, [key]: value } }));
  const selectTab = (nextTab: Tab) => {
    setTab(nextTab);
    localStorage.setItem('drac-settings-tab', nextTab);
  };
  const setBranchAccount = (branchId: string, key: string, value: string) => {
    setBranchAccountSettings(prev => {
      const existing = prev.find(item => item.branchId === branchId);
      if (existing) return prev.map(item => item.branchId === branchId ? { ...item, [key]: value || null } : item);
      return [...prev, { branchId, [key]: value || null }];
    });
  };
  const previewMaintenance = async () => {
    if (!maintenanceBranchId) { window.alert('Pilih cabang yang transaksinya akan diperiksa.'); return; }
    setMaintenanceLoading(true);
    setMaintenanceResult(null);
    try {
      const result = await api.previewDataMaintenance(maintenanceFrom, maintenanceTo, maintenanceBranchId, maintenanceCleanupOrphans);
      if (!result.success) throw new Error(result.message || 'Gagal memeriksa data');
      setMaintenancePreview(result.data);
    } catch (error: any) {
      window.alert(error?.message || 'Gagal memeriksa data');
    } finally {
      setMaintenanceLoading(false);
    }
  };
  const purgeMaintenance = async () => {
    if (!maintenanceBranchId || maintenanceConfirmation !== maintenanceExpectedConfirmation) return;
    const targetName = maintenanceBranchId === 'ALL' ? 'SEMUA CABANG' : maintenanceBranch?.name;
    const masterMessage = maintenanceCleanupOrphans ? 'Pelanggan dan kendaraan tanpa transaksi tersisa juga akan dihapus.' : 'Master pelanggan dan kendaraan tetap dipertahankan.';
    if (!window.confirm(`Hapus permanen transaksi ${targetName} untuk periode ${maintenanceFrom} sampai ${maintenanceTo}? ${masterMessage}`)) return;
    setMaintenanceLoading(true);
    try {
      const result = await api.purgeDataMaintenance(maintenanceFrom, maintenanceTo, maintenanceBranchId, maintenanceConfirmation, maintenanceCleanupOrphans);
      if (!result.success) throw new Error(result.message || 'Gagal menghapus data');
      setMaintenanceResult(result.data);
      setMaintenancePreview(null);
      setMaintenanceConfirmation('');
    } catch (error: any) {
      window.alert(error?.message || 'Gagal menghapus data');
    } finally {
      setMaintenanceLoading(false);
    }
  };

  const exportBackup = async () => {
    setBackupBusy(true);
    try {
      const result = await api.exportTransactionBackup();
      if (!result.success || !result.data?.sheets) throw new Error(result.message || 'Gagal mengambil data backup');
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      for (const sheetName of backupSheetNames) {
        const rows = result.data.sheets[sheetName] || [];
        const sheet = workbook.addWorksheet(sheetName);
        const columns = rows.length ? Object.keys(rows[0]) : [];
        sheet.columns = columns.map(key => ({ header: key, key, width: Math.min(36, Math.max(12, key.length + 2)) }));
        rows.forEach((row: any) => sheet.addRow(row));
        sheet.views = [{ state: 'frozen', ySplit: 1 }];
        sheet.getRow(1).font = { bold: true };
      }
      const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `backup-transaksi-drac-${stamp}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      window.alert(error?.message || 'Gagal membuat backup Excel');
    } finally {
      setBackupBusy(false);
    }
  };

  const selectRestoreFile = async (file?: File) => {
    if (!file) return;
    setBackupBusy(true);
    setRestorePreview(null);
    try {
      const { default: readXlsxFile, readSheetNames } = await import('read-excel-file');
      const availableSheetNames = await readSheetNames(file);
      const missingSheetNames = backupSheetNames.filter(name => !availableSheetNames.includes(name));
      if (missingSheetNames.length > 0) {
        const available = availableSheetNames.length > 0 ? availableSheetNames.join(', ') : 'tidak ada';
        throw new Error(
          `File ini bukan backup transaksi aplikasi. Sheet wajib yang belum ada: ${missingSheetNames.join(', ')}. ` +
          `Sheet dalam file: ${available}. Gunakan file hasil tombol Download Backup XLSX, bukan file ekspor laporan Accurate.`,
        );
      }
      const sheets: Record<string, any[]> = {};
      for (const name of backupSheetNames) {
        const rows = await readXlsxFile(file, { sheet: name });
        const headers = (rows[0] || []).map(value => String(value ?? '').trim());
        sheets[name] = rows.slice(1).reduce<any[]>((records, row) => {
          const record: Record<string, any> = {};
          headers.forEach((header, index) => {
            if (!header) return;
            const cellValue = row[index];
            record[header] = cellValue instanceof Date ? cellValue.toISOString() : (cellValue ?? '');
          });
          if (Object.values(record).some(value => value !== '')) records.push(record);
          return records;
        }, []);
      }
      const result = await api.previewTransactionRestore(sheets);
      if (!result.success) throw new Error(result.message || 'Validasi file gagal');
      setRestoreSheets(sheets);
      setRestoreFileName(file.name);
      setRestorePreview(result.data);
    } catch (error: any) {
      setRestoreSheets(null);
      setRestoreFileName('');
      window.alert(error?.message || 'File backup tidak valid');
    } finally {
      setBackupBusy(false);
    }
  };

  const runRestore = async () => {
    if (!restoreSheets || !restorePreview) return;
    const warning = restoreMode === 'upsert'
      ? 'Data dengan ID yang sama akan diperbarui. Data lain tetap dipertahankan.'
      : 'Restore hanya akan menambah data. ID yang sudah ada akan menyebabkan proses dibatalkan.';
    if (!window.confirm(`Restore ${restoreFileName}?\n\n${warning}\n\nSistem akan membuat snapshot otomatis sebelum perubahan.`)) return;
    setBackupBusy(true);
    try {
      const result = await api.importTransactionRestore(restoreSheets, restoreMode);
      if (!result.success) throw new Error(result.message || 'Restore gagal');
      window.alert(`Restore berhasil. Snapshot: ${result.data?.snapshotId || '-'}\n${result.data?.totalRows || 0} baris diproses.`);
      setRestoreSheets(null);
      setRestoreFileName('');
      setRestorePreview(null);
    } catch (error: any) {
      window.alert(error?.message || 'Restore gagal dan seluruh perubahan dibatalkan');
    } finally {
      setBackupBusy(false);
    }
  };

  if (!canEdit) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-500" />
        <h2 className="text-lg font-bold text-amber-900">Akses Pengaturan Dibatasi</h2>
        <p className="mt-1 text-sm text-amber-700">Halaman ini hanya dapat dibuka oleh Owner atau Administrator.</p>
      </div>
    );
  }

  return (
    <div className="lg:-mx-5 lg:-mt-5">
      {saved && (
        <div className="fixed right-6 top-20 z-[100] flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 shadow-lg">
          <CheckCircle2 className="h-5 w-5" /> Pengaturan berhasil disimpan.
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-gray-200 bg-[#edf1f4] shadow-sm">
        <div className="space-y-0">
        <div className="flex items-start border-b border-gray-300 bg-[#edf1f4]">
        <nav className="w-full flex-shrink-0 overflow-x-auto border-r border-gray-300 bg-[#e5e8eb] p-2 lg:w-[168px] lg:space-y-1">
          {['company','features','tax','sales','purchases','security','approval','attachments','attributes','defaultAccounts','other'].map(id => { const item=tabs.find(candidate=>candidate.id===id); if(!item)return null; const Icon=item.icon; return <button key={item.id} onClick={()=>selectTab(item.id)} title={item.hint} className={`relative flex min-w-[145px] items-center justify-end gap-2 border px-3 py-2 text-right text-xs transition lg:w-full ${tab===item.id?'z-10 mr-[-1px] border-[#ff4081] border-r-white bg-white font-bold text-gray-800':'border-gray-300 bg-[#f1f2f3] text-gray-600 hover:bg-white'}`}><Icon className="hidden h-4 w-4 text-blue-600 lg:block" />{item.label}</button>; })}
        </nav>
        <div className="min-w-0 flex-1 border-l border-gray-300 bg-white">
        <InnerTabs tab={tab} active={innerTab} onChange={id => { setInnerTab(id); if (tab === 'company') setCompanyTab(id === 'alamat' ? 'address' : 'info'); }} />

        <section className={`grid items-start gap-3 pt-0.5 ${['guide', 'backup', 'maintenance'].includes(tab) ? '' : 'lg:grid-cols-[minmax(0,1fr)_120px]'}`}>
          {tab === 'company' && <div className="rounded-md border border-gray-200 bg-white shadow-sm"><div className="p-5">{companyTab==='info' ? <div className="max-w-3xl space-y-3"><CompanyField label="Nama"><input className={inputClass} value={draft.company.name} onChange={e => setCompany('name', e.target.value)} /></CompanyField><CompanyField label="Kategori Usaha"><div className="flex items-center rounded-lg border border-gray-300 bg-white px-2 py-1"><span className="rounded border border-blue-300 px-2 py-1 text-sm text-blue-700">JASA / SERVICES ×</span><Search className="ml-auto h-4 w-4 text-gray-600" /></div></CompanyField><CompanyField label="Bidang Usaha"><div className="flex items-center rounded-lg border border-gray-300 bg-white px-2 py-1"><span className="rounded border border-blue-300 px-2 py-1 text-sm text-blue-700">Automotive (Otomotif) ×</span><Search className="ml-auto h-4 w-4 text-gray-600" /></div></CompanyField><CompanyField label="Telepon"><input className={inputClass} value={draft.company.phone} onChange={e => setCompany('phone', e.target.value)} /></CompanyField><CompanyField label="Faksimili"><input className={inputClass} /></CompanyField><CompanyField label="Email"><input className={inputClass} type="email" value={draft.company.email} onChange={e => setCompany('email', e.target.value)} /></CompanyField><CompanyField label="Tgl Mulai Data"><input className={inputClass} type="date" defaultValue="2025-01-01" /></CompanyField><CompanyField label="Periode Akuntansi"><select className={inputClass} defaultValue="Januari - Desember"><option>Januari - Desember</option></select></CompanyField><CompanyField label="Mata Uang"><div className="flex gap-2"><input className={`${inputClass} bg-gray-100`} value="Indonesian Rupiah" readOnly /><button type="button" className="rounded-lg border px-3">✎</button></div></CompanyField></div> : <div className="max-w-3xl space-y-3"><CompanyField label="Alamat" multiline><textarea className={`${inputClass} resize-y`} rows={4} value={draft.company.address} onChange={e => setCompany('address', e.target.value)} placeholder="Jalan" /></CompanyField><CompanyField label="Kota"><div className="flex items-center rounded-lg border border-gray-300 bg-white px-2 py-1"><span className="rounded border border-blue-300 px-2 py-1 text-sm text-blue-700">Kota Makassar ×</span></div></CompanyField><CompanyField label="Provinsi"><input className={inputClass} defaultValue="Sulawesi Selatan" /></CompanyField><CompanyField label="K.Pos"><input className={inputClass} /></CompanyField><CompanyField label="Negara"><input className={inputClass} defaultValue="Indonesia" /></CompanyField></div>}</div></div>}

          {tab === 'features' && <AccurateFeaturesPanel activeTab={innerTab} />}
          {tab === 'sales' && <AccurateSalesPanel />}
          {['tax', 'purchases', 'inventory', 'other'].includes(tab) && <PreferencePanel tab={tab} />}

          {tab === 'defaultAccounts' && (
            <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
              <TabHeader title="Akun Default" description="Seperti tab Akun di Accurate: tentukan akun yang digunakan otomatis oleh transaksi CerdikApp." />
              <div className="grid gap-4 lg:grid-cols-2">
                {(innerTab === 'barang' || innerTab === 'perusahaan') && <PreferenceAccountGroup title="Barang & Jasa" rows={['Persediaan', 'Pendapatan Jasa', 'Pendapatan Barang', 'HPP', 'Retur Penjualan', 'Diskon Penjualan']} />}
                {(innerTab === 'penjualanPembelian' || innerTab === 'barang') && <PreferenceAccountGroup title="Pembelian" rows={['Hutang Usaha', 'Persediaan', 'Pembelian Belum Tertagih', 'Retur Pembelian', 'Diskon Pembelian']} />}
                {(innerTab === 'penjualanPembelian' || innerTab === 'perusahaan') && <PreferenceAccountGroup title="Kas & Pembayaran" rows={['Kas Tunai', 'Bank / Transfer', 'Piutang Usaha', 'Akun Pembayaran Supplier']} />}
                {(innerTab === 'persediaan' || innerTab === 'perusahaan') && <PreferenceAccountGroup title="Saldo & Penyesuaian" rows={['Ekuitas Saldo Awal', 'Penyesuaian Persediaan', 'Selisih Stok', 'Pembulatan']} />}
              </div>
              <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">Akun yang belum dipetakan akan memblokir posting otomatis agar Buku Besar tidak menerima jurnal yang tidak lengkap.</p>
            </div>
          )}

          {tab === 'branches' && (
            <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
              <TabHeader title="Cabang & Pengaitan Akun" description="Tentukan akun kas, bank, setoran, piutang, pendapatan, dan persediaan untuk setiap cabang." />
              <div className="space-y-3">
                {data.branches.map(branch => {
                  const mapping = branchAccountSettings.find(item => item.branchId === branch.id) || { branchId: branch.id };
                  const branchCashAccounts = cashAccounts.filter(account => account.isActive !== false && (!account.branchId || account.branchId === branch.id));
                  const activeLedgerAccounts = ledgerAccounts.filter(account => account.isActive !== false);
                  return (
                    <div key={branch.id} className="rounded-lg border border-gray-200 p-3">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
                        <div><p className="font-semibold text-gray-900">{branch.name}</p><p className="text-xs text-gray-500">{branch.id} · {branch.address}</p></div>
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-2 text-sm text-gray-600">Kode dokumen<input className="h-9 w-14 rounded-md border border-gray-300 text-center font-semibold uppercase" maxLength={1} value={draft.branchDocumentCodes[branch.id] || ''} onChange={e => setDraft(prev => ({ ...prev, branchDocumentCodes: { ...prev.branchDocumentCodes, [branch.id]: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') } }))} /></label>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${branch.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{branch.isActive ? 'Aktif' : 'Nonaktif'}</span>
                        </div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <SettingSelect label="Kas tunai cabang" value={mapping.cashAccountId} options={branchCashAccounts.filter(account => account.accountType === 'cash')} onChange={value => setBranchAccount(branch.id, 'cashAccountId', value)} />
                        <SettingSelect label="Bank cabang" value={mapping.bankAccountId} options={branchCashAccounts.filter(account => account.accountType === 'bank')} onChange={value => setBranchAccount(branch.id, 'bankAccountId', value)} />
                        <SettingSelect label="Tujuan setoran tunai" value={mapping.depositDestinationAccountId} options={branchCashAccounts.filter(account => account.accountType !== 'cash')} onChange={value => setBranchAccount(branch.id, 'depositDestinationAccountId', value)} />
                        <SettingSelect label="Piutang pelanggan" value={mapping.receivableCoaId} options={activeLedgerAccounts.filter(account => account.accountType === 'Asset')} onChange={value => setBranchAccount(branch.id, 'receivableCoaId', value)} />
                        <SettingSelect label="Pendapatan jasa" value={mapping.serviceRevenueCoaId} options={activeLedgerAccounts.filter(account => account.accountType === 'Revenue')} onChange={value => setBranchAccount(branch.id, 'serviceRevenueCoaId', value)} />
                        <SettingSelect label="Penjualan barang" value={mapping.goodsRevenueCoaId} options={activeLedgerAccounts.filter(account => account.accountType === 'Revenue')} onChange={value => setBranchAccount(branch.id, 'goodsRevenueCoaId', value)} />
                        <SettingSelect label="Persediaan" value={mapping.inventoryCoaId} options={activeLedgerAccounts.filter(account => account.accountType === 'Asset')} onChange={value => setBranchAccount(branch.id, 'inventoryCoaId', value)} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'documents' && (
            <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
              <TabHeader title="Nomor Dokumen" description="Urutan direset setiap hari dan dipisahkan per cabang." />
              <div className="grid gap-5 lg:grid-cols-2">
                <DocumentCard title="Work Order" value={draft.documents.workOrderPrefix} preview={previews.workOrder} onChange={value => setDraft(prev => ({ ...prev, documents: { ...prev.documents, workOrderPrefix: value.toUpperCase() } }))} />
                <DocumentCard title="Invoice Penjualan" value={draft.documents.invoicePrefix} preview={previews.invoice} onChange={value => setDraft(prev => ({ ...prev, documents: { ...prev.documents, invoicePrefix: value.toUpperCase() } }))} />
                <CompanyField label="Digit urutan"><select className={inputClass} value={draft.documents.sequenceDigits} onChange={e => setDraft(prev => ({ ...prev, documents: { ...prev.documents, sequenceDigits: Number(e.target.value) } }))}><option value={3}>3 digit</option><option value={4}>4 digit</option></select></CompanyField>
              </div>
            </div>
          )}

          {tab === 'workflow' && (
            <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
              <TabHeader title="Alur Servis" description="Kelola pilihan operasional yang digunakan pada proses WO." />
              <div className="mb-4">
                <h3 className="text-lg font-bold text-gray-900">Alasan Lost Sales</h3>
                <p className="mt-1 text-sm text-gray-500">Alasan yang nonaktif tidak muncul pada transaksi baru, tetapi histori lama tetap tersimpan.</p>
              </div>
              <div className="space-y-2">
                {lostSalesReasons.map((reason, index) => (
                  <div key={reason.id} className={`grid items-center gap-2 rounded-xl border p-3 sm:grid-cols-[auto_minmax(180px,1fr)_auto_auto] ${reason.isActive ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-100'}`}>
                    <div className="flex sm:flex-col">
                      <button type="button" disabled={index === 0} onClick={() => moveLostSalesReason(index, -1)} className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-20" title="Naikkan"><ChevronUp className="h-4 w-4" /></button>
                      <button type="button" disabled={index === lostSalesReasons.length - 1} onClick={() => moveLostSalesReason(index, 1)} className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-20" title="Turunkan"><ChevronDown className="h-4 w-4" /></button>
                    </div>
                    <input value={reason.label} onChange={event => updateLostSalesReasons(lostSalesReasons.map(item => item.id === reason.id ? { ...item, label: event.target.value } : item))} className={inputClass} aria-label="Nama alasan Lost Sales" />
                    <label className="flex items-center gap-2 whitespace-nowrap text-xs font-medium text-gray-600"><input type="checkbox" checked={reason.requiresNote === true} onChange={event => updateLostSalesReasons(lostSalesReasons.map(item => item.id === reason.id ? { ...item, requiresNote: event.target.checked } : item))} className="h-4 w-4 rounded" /> Catatan wajib</label>
                    <button type="button" onClick={() => updateLostSalesReasons(lostSalesReasons.map(item => item.id === reason.id ? { ...item, isActive: !item.isActive } : item))} className={`inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold ${reason.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}><Power className="h-4 w-4" />{reason.isActive ? 'Aktif' : 'Nonaktif'}</button>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-col gap-2 border-t border-gray-200 pt-4 sm:flex-row">
                <input value={newLostSalesReason} onChange={event => setNewLostSalesReason(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addLostSalesReason(); } }} placeholder="Alasan Lost Sales baru" className={inputClass} />
                <button type="button" onClick={addLostSalesReason} className="inline-flex flex-shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"><Plus className="h-4 w-4" />Tambah Alasan</button>
              </div>
            </div>
          )}

          {tab === 'security' && (
            <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
              <TabHeader title="Keamanan" description="Aturan akun Owner dan sesi pengguna." />
              <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3"><ShieldCheck className="h-8 w-8 text-blue-600" /><div><p className="font-bold text-blue-900">OWNER UTAMA</p><p className="text-xs text-blue-700">Akses penuh · tidak dapat dihapus atau dinonaktifkan</p></div></div>
                  <button className="flex items-center gap-2 rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-medium text-blue-700"><KeyRound className="h-4 w-4" /> Ganti Password</button>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <CompanyField label="Durasi sesi"><select className={inputClass} value={draft.security.sessionHours} onChange={e => setDraft(prev => ({ ...prev, security: { ...prev.security, sessionHours: Number(e.target.value) } }))}><option value={1}>1 jam</option><option value={4}>4 jam</option><option value={8}>8 jam</option></select></CompanyField>
                <CompanyField label="Batas gagal login"><select className={inputClass} value={draft.security.maxLoginAttempts} onChange={e => setDraft(prev => ({ ...prev, security: { ...prev.security, maxLoginAttempts: Number(e.target.value) } }))}><option value={3}>3 kali</option><option value={5}>5 kali</option></select></CompanyField>
                <Toggle label="Aktifkan audit log" checked={draft.security.auditLogEnabled} onChange={checked => setDraft(prev => ({ ...prev, security: { ...prev.security, auditLogEnabled: checked } }))} />
                <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <Toggle label="Wajibkan alasan saat input tanggal mundur" checked={draft.security.requireBackdateReason !== false} onChange={checked => setDraft(prev => ({ ...prev, security: { ...prev.security, requireBackdateReason: checked } }))} />
                  <p className="mt-2 text-xs text-amber-700">Matikan sementara saat input data awal. Tanggal masa depan tetap tidak diizinkan.</p>
                </div>
              </div>
            </div>
          )}

          {tab === 'ai' && (
            <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
              <TabHeader title="Integrasi AI" description="Atur model dan jenis data yang boleh digunakan Asisten AI." />
              {currentUser?.isOwner ? (
                <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <CompanyField label="API Key Groq">
                    <input
                      className={inputClass}
                      type="password"
                      value={aiKey}
                      onChange={event => setAiKey(event.target.value)}
                      placeholder={aiConfigured ? 'Sudah tersimpan — isi hanya untuk mengganti key' : 'Masukkan key yang diawali gsk_'}
                    />
                  </CompanyField>
                  <p className="mt-2 text-xs text-blue-700">
                    {aiConfigured ? 'Key perusahaan sudah aktif dan tidak ditampilkan kembali.' : 'Belum ada key perusahaan.'}
                  </p>
                </div>
              ) : (
                <p className="mb-4 rounded-lg bg-gray-100 p-3 text-sm text-gray-600">API Key hanya dapat dikelola oleh Owner.</p>
              )}
              <CompanyField label="Model Groq"><select className={inputClass} value={draft.ai.model} onChange={e => setDraft(prev => ({ ...prev, ai: { ...prev.ai, model: e.target.value } }))}><option value="openai/gpt-oss-120b">GPT-OSS 120B (cerdas)</option><option value="openai/gpt-oss-20b">GPT-OSS 20B (super cepat)</option></select></CompanyField>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Toggle label="Data pelanggan & kendaraan" checked={draft.ai.allowCustomerData} onChange={checked => setDraft(prev => ({ ...prev, ai: { ...prev.ai, allowCustomerData: checked } }))} />
                <Toggle label="Data barang & stok" checked={draft.ai.allowInventoryData} onChange={checked => setDraft(prev => ({ ...prev, ai: { ...prev.ai, allowInventoryData: checked } }))} />
                <Toggle label="Data keuangan" checked={draft.ai.allowFinancialData} onChange={checked => setDraft(prev => ({ ...prev, ai: { ...prev.ai, allowFinancialData: checked } }))} />
                <Toggle label="Boleh membuat WO setelah konfirmasi" checked={draft.ai.allowCreateWorkOrder} onChange={checked => setDraft(prev => ({ ...prev, ai: { ...prev.ai, allowCreateWorkOrder: checked } }))} />
              </div>
              <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700">Satu key digunakan seluruh perusahaan melalui server. Pengguna lain tidak dapat melihat API Key.</p>
            </div>
          )}

          {tab === 'guide' && <SystemGuide />}

          {tab === 'backup' && currentUser?.isOwner && (
            <div className="space-y-5 rounded-md border border-blue-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3 border-b border-blue-100 pb-4">
                <span className="rounded-xl bg-blue-100 p-3 text-blue-700"><FileSpreadsheet className="h-7 w-7" /></span>
                <div><h2 className="text-xl font-bold text-gray-900">Backup & Restore Transaksi</h2><p className="mt-1 text-sm text-gray-500">Pindahkan pelanggan, kendaraan, WO, faktur, dan pembayaran dalam satu Excel yang tetap saling terhubung.</p></div>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex gap-3"><Download className="h-6 w-6 text-emerald-700" /><div><h3 className="font-bold text-emerald-900">Backup ke Excel</h3><p className="mt-1 text-sm text-emerald-700">Unduh seluruh transaksi dalam 7 sheet berelasi.</p></div></div>
                  <div className="mt-4 flex flex-wrap gap-1.5">{backupSheetNames.map(name => <span key={name} className="rounded-full border border-emerald-200 bg-white px-2 py-1 text-xs font-medium text-emerald-700">{name}</span>)}</div>
                  <button type="button" onClick={exportBackup} disabled={backupBusy} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:bg-gray-300"><Download className="h-4 w-4" />{backupBusy ? 'Memproses...' : 'Download Backup XLSX'}</button>
                </section>
                <section className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <div className="flex gap-3"><Upload className="h-6 w-6 text-blue-700" /><div><h3 className="font-bold text-blue-900">Restore dari Excel</h3><p className="mt-1 text-sm text-blue-700">Validasi dahulu, lalu restore secara atomik.</p></div></div>
                  <label className="mt-5 flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-blue-300 bg-white px-4 py-5 text-sm font-semibold text-blue-700 hover:bg-blue-50"><FileSpreadsheet className="h-5 w-5" />{restoreFileName || 'Pilih file backup .xlsx'}<input type="file" accept=".xlsx" className="hidden" disabled={backupBusy} onChange={event => selectRestoreFile(event.target.files?.[0])} /></label>
                  <p className="mt-2 text-xs leading-5 text-blue-700">Khusus file dari <strong>Download Backup XLSX</strong> dengan 7 sheet di atas. Ekspor laporan Accurate memakai menu impor faktur, bukan Restore.</p>
                </section>
              </div>
              {restorePreview && (
                <section className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                  <div className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><div><h3 className="font-bold text-gray-900">File siap dipulihkan</h3><p className="text-xs text-gray-600">{restoreFileName}</p></div></div>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">{backupSheetNames.map(name => <div key={name} className="rounded-lg border border-amber-200 bg-white p-2"><p className="truncate text-[11px] text-gray-500">{name}</p><p className="text-lg font-bold">{restorePreview.counts?.[name] || 0}</p></div>)}</div>
                  {restorePreview.existingTotal > 0 && <p className="mt-3 rounded-lg border border-amber-200 bg-white p-3 text-sm text-amber-800"><AlertTriangle className="mr-1 inline h-4 w-4" />{restorePreview.existingTotal} ID sudah ada di database.</p>}
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <label className={labelClass}><span>Mode restore</span><select className={inputClass} value={restoreMode} onChange={event => setRestoreMode(event.target.value as 'insert' | 'upsert')}><option value="insert">Tambah baru saja (paling aman)</option><option value="upsert">Tambah + perbarui ID yang sama</option></select></label>
                    <div className="flex gap-2"><button type="button" onClick={() => { setRestoreSheets(null); setRestorePreview(null); setRestoreFileName(''); }} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold"><RotateCcw className="h-4 w-4" />Batal</button><button type="button" onClick={runRestore} disabled={backupBusy} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:bg-gray-300"><Upload className="h-4 w-4" />{backupBusy ? 'Memulihkan...' : 'Jalankan Restore'}</button></div>
                  </div>
                </section>
              )}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600"><strong>Pengaman:</strong> hanya Owner; relasi divalidasi, snapshot otomatis dibuat, dan kegagalan membatalkan seluruh perubahan.</div>
            </div>
          )}

          {tab === 'maintenance' && currentUser?.isOwner && (
            <div className="space-y-4 rounded-md border border-red-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3 border-b border-red-100 pb-4">
                <span className="rounded-xl bg-red-100 p-3 text-red-700"><Database className="h-7 w-7" /></span>
                <div><h2 className="text-xl font-bold text-gray-900">Pemeliharaan Data Transaksi</h2><p className="mt-1 text-sm text-gray-500">Khusus Owner. Sistem membuat snapshot sebelum penghapusan dan menjaga data di luar periode tetap utuh.</p></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className={labelClass}><span>Cabang yang akan dihapus *</span><select className={inputClass} value={maintenanceBranchId} onChange={event => { setMaintenanceBranchId(event.target.value); setMaintenancePreview(null); setMaintenanceResult(null); setMaintenanceConfirmation(''); }}><option value="">Pilih cabang...</option>{data.branches.filter(branch=>branch.isActive).map(branch=><option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}<option value="ALL">⚠ SEMUA CABANG</option></select></label>
                <label className={labelClass}><span>Dari tanggal</span><IndonesianDateInput className="h-10 w-full" value={maintenanceFrom} onChange={value => { setMaintenanceFrom(value); setMaintenancePreview(null); setMaintenanceConfirmation(''); }} /></label>
                <label className={labelClass}><span>Sampai tanggal</span><IndonesianDateInput className="h-10 w-full" value={maintenanceTo} onChange={value => { setMaintenanceTo(value); setMaintenancePreview(null); setMaintenanceConfirmation(''); }} /></label>
              </div>
              <label className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><input type="checkbox" checked={maintenanceCleanupOrphans} onChange={event => { setMaintenanceCleanupOrphans(event.target.checked); setMaintenancePreview(null); setMaintenanceResult(null); setMaintenanceConfirmation(''); }} className="mt-0.5 h-4 w-4" /><span><strong>Hapus pelanggan dan kendaraan tanpa transaksi tersisa</strong><br/><span className="text-xs">Master yang masih terhubung ke WO atau faktur di luar periode tetap dipertahankan.</span></span></label>
              {maintenanceBranchId === 'ALL' && <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-800"><AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" /> Pilihan ini mencakup transaksi seluruh cabang dalam periode. Gunakan hanya jika benar-benar diperlukan.</div>}
              <button type="button" onClick={previewMaintenance} disabled={maintenanceLoading || !maintenanceBranchId} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300">{maintenanceLoading ? 'Memeriksa...' : 'Periksa Data Periode'}</button>

              {maintenancePreview && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                  <h3 className="font-bold text-amber-900">Data yang akan dihapus — {maintenancePreview.branchName}</h3>
                  <p className="mt-1 text-xs text-amber-800">Periode {maintenancePreview.from} sampai {maintenancePreview.to}</p>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      ['Order Kerja', maintenancePreview.workOrders], ['Layanan WO', maintenancePreview.workOrderServices],
                      ['Invoice', maintenancePreview.invoices], ['Detail Invoice', maintenancePreview.invoiceItems],
                      ['Pembayaran', maintenancePreview.payments],
                      ['Kendaraan tanpa transaksi', maintenancePreview.vehicles], ['Pelanggan tanpa transaksi', maintenancePreview.customers],
                    ].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-amber-200 bg-white p-3"><p className="text-xs text-gray-500">{label}</p><p className="text-2xl font-bold text-gray-900">{value}</p></div>)}
                  </div>
                  <p className={`mt-4 rounded-lg border p-3 text-sm font-medium ${maintenancePreview.cleanupOrphans ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{maintenancePreview.cleanupOrphans ? 'Pelanggan dan kendaraan yang tidak memiliki transaksi tersisa ikut dihapus.' : 'Pelanggan dan kendaraan merupakan master global dan tidak ikut dihapus.'}</p>
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
                    <p className="text-sm font-semibold text-red-800">Ketik <span className="font-mono">{maintenanceExpectedConfirmation}</span> untuk mengaktifkan tombol penghapusan.</p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <input className={`${inputClass} font-mono font-bold uppercase`} value={maintenanceConfirmation} onChange={event => setMaintenanceConfirmation(event.target.value.toUpperCase())} placeholder={maintenanceExpectedConfirmation} />
                      <button type="button" onClick={purgeMaintenance} disabled={maintenanceLoading || maintenanceConfirmation !== maintenanceExpectedConfirmation} className="inline-flex flex-shrink-0 items-center justify-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300"><Trash2 className="h-4 w-4" /> Hapus Transaksi Cabang</button>
                    </div>
                  </div>
                </div>
              )}

              {maintenanceResult && (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
                  <h3 className="flex items-center gap-2 font-bold"><CheckCircle2 className="h-5 w-5" /> Penghapusan selesai</h3>
                  <p className="mt-1 text-sm">ID snapshot: <code className="font-bold">{maintenanceResult.purgeId}</code></p>
                  <p className="mt-2 text-sm">Cabang: <strong>{maintenanceResult.branchName}</strong>. Dihapus: {maintenanceResult.workOrders} WO, {maintenanceResult.invoices} invoice, dan {maintenanceResult.payments} pembayaran.</p>
                  <p className="mt-2 text-xs text-emerald-700">Kendaraan dihapus: {maintenanceResult.vehiclesDeleted || 0}. Pelanggan dihapus: {maintenanceResult.customersDeleted || 0}.</p>
                </div>
              )}
            </div>
          )}

          {tab !== 'guide' && tab !== 'backup' && tab !== 'maintenance' && <button onClick={save} disabled={saving} title="Simpan Pengaturan" className="sticky top-[60px] mt-[45px] hidden h-28 w-28 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/25 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none lg:inline-flex">
            <Save className="h-12 w-12" />
          </button>}

          {tab !== 'guide' && tab !== 'backup' && tab !== 'maintenance' && <div className="mt-3 flex justify-end border-t border-gray-200 pt-3 lg:hidden">
            <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              <Save className="h-4 w-4" /> {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </button>
          </div>}
        </section>
      </div>
    </div>
    </div>
    </div>
    </div>
  );
}

function InnerTabs({ tab, active, onChange }: { tab: Tab; active: string; onChange: (id: string) => void }) {
  const tabSets: Partial<Record<Tab, Array<[string, string]>>> = {
    company: [['info', 'Info Perusahaan'], ['alamat', 'Alamat']],
    features: [['perusahaan', 'Perusahaan'], ['penjualan', 'Penjualan'], ['pembelian', 'Pembelian'], ['persediaan', 'Persediaan']],
    sales: [['penjualan', 'Penjualan']],
    purchases: [['pembelian', 'Pembelian']],
    inventory: [['persediaan', 'Persediaan']],
    tax: [['pajak', 'Pajak']],
    defaultAccounts: [['barang', 'Barang & Jasa'], ['perusahaan', 'Perusahaan'], ['penjualanPembelian', 'Penjualan/Pembelian'], ['persediaan', 'Persediaan']],
    workflow: [['operasional', 'Operasional Bengkel']],
    security: [['keamanan', 'Keamanan & Pembatasan']],
    ai: [['ai', 'Integrasi AI']],
    other: [['lainnya', 'Lain-lain']],
  };
  const items = tabSets[tab] || [[tab, tabs.find(item => item.id === tab)?.label || 'Preferensi']];
  return <div className="flex h-10 items-center gap-1 overflow-x-auto border-b border-gray-300 bg-white px-2 text-xs">{items.map(([id, label]) => <button key={id} type="button" onClick={() => onChange(id)} className={`border border-b-0 px-3 py-2 ${active === id ? 'border-[#ff4081] bg-white font-bold text-gray-800' : 'border-gray-300 bg-gray-100 text-gray-600 hover:bg-white'}`}>{label}</button>)}</div>;
}

function TabHeader({ title, description }: { title: string; description: string }) {
  return <div className="mb-5 flex items-start gap-3 border-b border-gray-100 pb-4"><div className="rounded-xl bg-blue-50 p-2.5 text-blue-700"><ClipboardCheck className="h-5 w-5" /></div><div><h2 className="text-xl font-bold text-gray-900">{title}</h2><p className="mt-1 text-sm text-gray-500">{description}</p></div></div>;
}

function AccurateFeaturesPanel({ activeTab }: { activeTab: string }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({ pajak: true, approval: true, aset: true, budget: true });
  const toggle = (key: string) => setChecked(prev => ({ ...prev, [key]: !prev[key] }));
  const basic = [['multiCabang','Multi Cabang'],['multiCurrency','Multi Mata Uang'],['pajak','Pajak'],['approval','Persetujuan (Approval)'],['aset','Pencatatan Aset'],['budget','Anggaran dan Target']];
  return <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm"><TabHeader title="Fitur" description="Aktifkan fitur sesuai kebutuhan perusahaan seperti Preferensi Accurate." />{activeTab==='perusahaan' && <div className="grid gap-8 lg:grid-cols-2"><section><h3 className="mb-3 border-b border-gray-200 pb-2 text-base font-bold text-blue-700">⚙ Fitur Dasar</h3><div className="space-y-3">{basic.map(([key,label]) => <label key={key} className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={checked[key]===true} onChange={() => toggle(key)} className="h-4 w-4" />{label}{key==='multiCabang'&&<span className="text-xs italic text-blue-600">(Pelajari lebih lanjut)</span>}</label>)}</div><h3 className="mb-3 mt-7 border-b border-gray-200 pb-2 text-base font-bold text-blue-700">◉ Metode Biaya Persediaan</h3><label className="flex items-center gap-2 text-sm"><input type="radio" checked readOnly /> Rata-rata</label></section><section><h3 className="mb-3 border-b border-gray-200 pb-2 text-base font-bold text-blue-700">◉ Pusat Laba &amp; Biaya</h3><div className="space-y-3">{['Departemen','Proyek','Kategori Keuangan'].map(label => <label key={label} className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" className="h-4 w-4" />{label}</label>)}</div><p className="mt-3 text-xs italic text-blue-600">(Pelajari lebih lanjut)</p><h3 className="mb-3 mt-7 border-b border-gray-200 pb-2 text-base font-bold text-blue-700">▤ Lainnya</h3><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" />Pinjaman Karyawan</label></section></div>}{activeTab!=='perusahaan' && <PreferencePanel tab={activeTab==='persediaan'?'inventory':activeTab==='penjualan'?'sales':'purchases'} />}</div>;
}

function AccurateSalesPanel() {
  const [autoClose, setAutoClose] = useState(false); const [returnCost, setReturnCost] = useState('bpp'); const [nonReturn, setNonReturn] = useState('hpp');
  return <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm"><TabHeader title="Penjualan" description="Pengaturan transaksi penjualan seperti Accurate." /><div className="space-y-7"><section><h3 className="mb-3 border-b border-gray-200 pb-2 text-base font-bold text-blue-700">▣ Pesanan Penjualan</h3><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={autoClose} onChange={e=>setAutoClose(e.target.checked)} className="h-4 w-4" />Ya <span className="text-gray-400">ⓘ</span></label></section><section><h3 className="mb-3 border-b border-gray-200 pb-2 text-base font-bold text-blue-700">↩ Retur Penjualan</h3><p className="mb-2 text-sm font-semibold">Opsi Nilai Barang yang di Retur <span className="font-normal">(Nilai pengembalian yang dijurnal)</span></p><div className="space-y-2 text-sm"><label className="flex items-center gap-2"><input type="radio" name="returnCost" checked={returnCost==='last'} onChange={()=>setReturnCost('last')} />Harga Beli/Biaya masuk terakhir</label><label className="flex items-center gap-2"><input type="radio" name="returnCost" checked={returnCost==='bpp'} onChange={()=>setReturnCost('bpp')} />BPP Faktur Penjualan</label></div><p className="mb-2 mt-5 text-sm font-semibold">Opsi Jika barang TIDAK dikembalikan saat Retur</p><div className="space-y-2 text-sm"><label className="flex items-center gap-2"><input type="radio" name="nonReturn" checked={nonReturn==='hpp'} onChange={()=>setNonReturn('hpp')} />Dibebankan ke akun HPP barang</label><label className="flex items-center gap-2"><input type="radio" name="nonReturn" checked={nonReturn==='account'} onChange={()=>setNonReturn('account')} />Dibebankan ke akun</label></div><label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" />Perbarui biaya barang saat simpan ulang Retur Penjualan</label></section><section><h3 className="mb-3 border-b border-gray-200 pb-2 text-base font-bold text-blue-700">♙ Pelanggan</h3><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" />Pelanggan baru selalu termasuk pajak</label></section></div></div>;
}

function PreferencePanel({ tab }: { tab: string }) {
  const content: Record<string, { title: string; description: string; groups: Array<{ title: string; items: string[] }> }> = {
    features: { title: 'Fitur', description: 'Aktifkan hanya fitur yang benar-benar digunakan agar menu dan form tetap sederhana.', groups: [{ title: 'Perusahaan', items: ['Cabang aktif', 'Multi gudang', 'Akun & jurnal otomatis'] }, { title: 'Barang & Jasa', items: ['Barang persediaan', 'Jasa bengkel', 'Penjualan barang dan jasa terpisah'] }] },
    tax: { title: 'Pajak', description: 'Kerangka pengaturan pajak disiapkan seperti Preferensi Accurate; aktifkan hanya jika operasional membutuhkan.', groups: [{ title: 'Pajak Penjualan', items: ['PPN keluaran', 'Harga termasuk pajak', 'Akun pajak keluaran'] }, { title: 'Pajak Pembelian', items: ['PPN masukan', 'Harga di luar pajak', 'Akun pajak masukan'] }] },
    sales: { title: 'Penjualan', description: 'Aturan faktur, pembayaran pelanggan, retur, dan jurnal penjualan.', groups: [{ title: 'Transaksi', items: ['Penomoran faktur otomatis', 'Penjualan jasa', 'Penjualan barang', 'Pembayaran sebagian'] }, { title: 'Jurnal Otomatis', items: ['Pendapatan jasa', 'Pendapatan barang', 'Piutang pelanggan', 'Kas dan bank'] }] },
    purchases: { title: 'Pembelian', description: 'Aturan penerimaan barang, faktur pembelian, pembayaran supplier, dan hutang.', groups: [{ title: 'Transaksi', items: ['Penerimaan barang', 'Faktur pembelian', 'Pembayaran supplier', 'Retur pembelian'] }, { title: 'Jurnal Otomatis', items: ['Persediaan', 'Hutang usaha', 'Pembelian belum tertagih', 'Kas dan bank'] }] },
    inventory: { title: 'Persediaan', description: 'Aturan stok, gudang, biaya unit, HPP, dan penyesuaian persediaan.', groups: [{ title: 'Stok', items: ['Gudang utama per cabang', 'Stok berkurang saat faktur', 'Penerimaan menyimpan unit cost'] }, { title: 'Penilaian', items: ['HPP saat barang terjual', 'Penyesuaian stok', 'Selisih stok opname'] }] },
    other: { title: 'Lain-lain', description: 'Pengaturan tambahan yang tidak masuk ke kelompok utama.', groups: [{ title: 'Tampilan', items: ['Bahasa Indonesia', 'Zona waktu WITA', 'Format Rupiah'] }, { title: 'Sistem', items: ['Panduan sistem', 'Backup dan restore', 'Pemeliharaan data'] }] },
  };
  const current = content[tab];
  if (!current) return null;
  return <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm"><TabHeader title={current.title} description={current.description} /><div className="grid gap-4 lg:grid-cols-2">{current.groups.map(group => <section key={group.title} className="rounded-xl border border-gray-200 p-4"><h3 className="mb-3 font-bold text-gray-900">{group.title}</h3><div className="space-y-2">{group.items.map(item => <div key={item} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm"><span>{item}</span><span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700">Tersedia</span></div>)}</div></section>)}</div><p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Pengaturan rinci akan mengikuti mapping akun dan aturan transaksi CerdikApp. Fitur yang belum memiliki konfigurasi tidak dapat diposting otomatis.</p></div>;
}

function PreferenceAccountGroup({ title, rows }: { title: string; rows: string[] }) {
  return <section className="rounded-xl border border-gray-200 p-4"><h3 className="mb-3 border-b border-gray-100 pb-2 font-bold text-gray-900">{title}</h3><div className="space-y-2">{rows.map(row => <div key={row} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm"><span>{row}</span><button type="button" className="rounded-md border border-blue-200 bg-white px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50">Pilih akun</button></div>)}</div></section>;
}

function CompanyField({ label, multiline = false, children }: { label: string; multiline?: boolean; children: ReactNode }) {
  return (
    <div className={`grid gap-2 sm:grid-cols-[150px_1fr] ${multiline ? 'items-start' : 'items-center'}`}>
      <label className={`${multiline ? 'pt-2.5 ' : ''}text-sm font-medium text-gray-700`}>{label}</label>
      {children}
    </div>
  );
}

function SettingSelect({ label, value, options, onChange }: { label: string; value?: string | null; options: any[]; onChange: (value: string) => void }) {
  return (
    <label className={labelClass}>
      <span>{label}</span>
      <select className={inputClass} value={value || ''} onChange={event => onChange(event.target.value)}>
        <option value="">Belum dikaitkan</option>
        {options.map(option => <option key={option.id} value={option.id}>{option.code ? `${option.code} · ` : ''}{option.name}</option>)}
      </select>
    </label>
  );
}

function DocumentCard({ title, value, preview, onChange }: { title: string; value: string; preview: string; onChange: (value: string) => void }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <h4 className="mb-3 font-bold text-gray-900">{title}</h4>
      <CompanyField label="Awalan"><input className={inputClass} value={value} maxLength={8} onChange={e => onChange(e.target.value)} /></CompanyField>
      <div className="mt-3 border-t border-gray-100 pt-3"><p className="text-xs text-gray-500">Preview nomor berikutnya</p><code className="text-lg font-bold text-blue-700">{preview}</code></div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-200 p-3 text-sm font-medium text-gray-700">
      {label}<input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="h-5 w-5 rounded border-gray-300 text-blue-600" />
    </label>
  );
}

function SystemGuide() {
  const flow = [
    { title: '1. Register', text: 'Pilih pelanggan dan kendaraan, lalu isi keluhan. Layanan belum wajib dan nilai Rp0 masih diperbolehkan.', icon: ClipboardCheck, tone: 'border-slate-200 bg-slate-50 text-slate-700' },
    { title: '2. Tambah Layanan', text: 'Diagnosa dilakukan di dalam status Register. Tambahkan minimal satu layanan/barang dan total estimasi lebih dari Rp0.', icon: Wrench, tone: 'border-orange-200 bg-orange-50 text-orange-700' },
    { title: '3. Dikerjakan', text: 'Tombol Setuju · Dikerjakan berarti pelanggan menyetujui layanan dan harga. Sistem menyimpan snapshot estimasi yang disetujui.', icon: CheckCircle2, tone: 'border-blue-200 bg-blue-50 text-blue-700' },
    { title: '4. Selesai & Faktur', text: 'Pekerjaan boleh ditambah saat Dikerjakan. Setelah selesai, status WO tetap Selesai; faktur ditampilkan sebagai indikator administrasi terpisah.', icon: FileText, tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
    { title: '5. Pembayaran', text: 'Pembayaran masuk ke akun kas/bank cabang. Pembayaran tunai yang belum disetor dipantau melalui menu Setoran.', icon: WalletCards, tone: 'border-violet-200 bg-violet-50 text-violet-700' },
  ];
  const rules = [
    ['Cabang transaksi', 'Saat posisi Semua Cabang, pembuatan transaksi diblokir sampai cabang dipilih secara jelas.'],
    ['Persetujuan pelanggan', 'Setuju hanya dapat dipilih bila ada layanan dan total estimasi lebih dari Rp0. Daftar serta harga yang disetujui disimpan sebagai histori audit.'],
    ['Perubahan pekerjaan', 'Tambahan pekerjaan setelah persetujuan diperbolehkan. Estimasi awal tetap tersimpan; rincian invoice menjadi pekerjaan/barang final.'],
    ['Lost Sales', 'Gunakan bila pelanggan tidak melanjutkan. Masalah yang sama dapat dilanjutkan dari WO lama; masalah berbeda harus dibuatkan WO baru.'],
    ['Stok', 'WO hanya mencatat estimasi dan tidak memotong stok. Stok baru berkurang ketika invoice final dibuat.'],
    ['Status WO', 'Status operasional hanya Register, Dikerjakan, Selesai, dan Lost Sales. Invoice serta pembayaran adalah indikator administrasi terpisah, bukan status WO.'],
    ['Invoice & pembayaran', 'Invoice dari WO mengunci pelanggan dan kendaraan. Menghapus pembayaran membuat invoice terutang lagi; menghapus invoice tetap menyisakan WO pada status Selesai.'],
    ['Pelanggan & kendaraan', 'Satu pelanggan dapat memiliki beberapa kendaraan. Pemilik aktif kendaraan dapat diganti tanpa menghapus histori WO sebelumnya.'],
    ['Akses pengguna', 'Owner memiliki akses penuh dan tidak dapat dihapus. Role, cabang, jam login, tanggal mundur, dan akses AI mengikuti hak pengguna.'],
  ];
  return (
    <div className="space-y-4 rounded-md border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3 border-b border-gray-100 pb-4">
        <span className="rounded-xl bg-blue-100 p-3 text-blue-700"><BookOpenCheck className="h-7 w-7" /></span>
        <div><h2 className="text-xl font-bold text-gray-900">Panduan Sistem & Aturan Operasional</h2><p className="mt-1 text-sm text-gray-500">Ringkasan aturan yang disepakati untuk menjaga alur servis, stok, cabang, dan keuangan tetap konsisten.</p></div>
      </div>
      <section>
        <h3 className="mb-3 font-bold text-gray-900">Alur Servis Job</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {flow.map(step => { const Icon = step.icon; return <div key={step.title} className={`rounded-xl border p-3 ${step.tone}`}><Icon className="mb-2 h-5 w-5"/><h4 className="font-bold">{step.title}</h4><p className="mt-1 text-xs leading-5 text-gray-600">{step.text}</p></div>; })}
        </div>
      </section>
      <section className="rounded-xl border border-gray-200">
        <h3 className="border-b border-gray-200 bg-gray-50 px-4 py-3 font-bold text-gray-900">Aturan Utama</h3>
        <div className="divide-y divide-gray-100">
          {rules.map(([title, text]) => <div key={title} className="grid gap-1 px-4 py-3 md:grid-cols-[190px_1fr]"><b className="text-sm text-gray-800">{title}</b><p className="text-sm leading-6 text-gray-600">{text}</p></div>)}
        </div>
      </section>
      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4"><h3 className="font-bold text-cyan-900">Perintah Asisten AI</h3><p className="mt-2 text-sm leading-6 text-cyan-800"><b>reg</b> untuk registrasi WO, <b>cek</b> untuk mencari pelanggan/kendaraan dan histori, <b>list</b> untuk menampilkan daftar.</p></div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h3 className="font-bold text-amber-900">Catatan Kontrol</h3><p className="mt-2 text-sm leading-6 text-amber-800">Tanggal masa depan dilarang. Input tanggal mundur memerlukan izin akun dan alasan bila pengaturannya aktif. Semua perubahan status, invoice, dan pembayaran dicatat dalam timeline/audit.</p></div>
      </section>
    </div>
  );
}
