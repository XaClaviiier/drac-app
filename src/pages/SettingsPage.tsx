import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Building2, MapPin, Hash, ShieldCheck, Bot, Save, KeyRound,
  CheckCircle2, AlertTriangle, BookOpenCheck, ClipboardCheck, Wrench, FileText, WalletCards, Database, Trash2,
  GitBranch, Plus, ChevronUp, ChevronDown, Power,
  Download, Upload, FileSpreadsheet, RotateCcw,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { AppSettings } from '../types';
import { api } from '../lib/apiClient';

type Tab = 'company' | 'branches' | 'documents' | 'workflow' | 'security' | 'ai' | 'guide' | 'backup' | 'maintenance';

const tabs = [
  { id: 'company' as const, label: 'Profil Perusahaan', icon: Building2 },
  { id: 'branches' as const, label: 'Cabang', icon: MapPin },
  { id: 'documents' as const, label: 'Nomor Dokumen', icon: Hash },
  { id: 'workflow' as const, label: 'Alur Servis', icon: GitBranch },
  { id: 'security' as const, label: 'Keamanan', icon: ShieldCheck },
  { id: 'ai' as const, label: 'Integrasi AI', icon: Bot },
  { id: 'guide' as const, label: 'Panduan Sistem', icon: BookOpenCheck },
  { id: 'backup' as const, label: 'Backup & Restore', icon: FileSpreadsheet },
  { id: 'maintenance' as const, label: 'Pemeliharaan Data', icon: Database },
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
  const [draft, setDraft] = useState<AppSettings>(() => structuredClone(data.settings));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [aiKey, setAiKey] = useState('');
  const [aiConfigured, setAiConfigured] = useState(false);
  const [cashAccounts, setCashAccounts] = useState<any[]>([]);
  const [ledgerAccounts, setLedgerAccounts] = useState<any[]>([]);
  const [branchAccountSettings, setBranchAccountSettings] = useState<any[]>([]);
  const [maintenanceFrom, setMaintenanceFrom] = useState('2026-08-01');
  const [maintenanceTo, setMaintenanceTo] = useState('2026-08-31');
  const [maintenanceBranchId, setMaintenanceBranchId] = useState('');
  const [maintenancePreview, setMaintenancePreview] = useState<any>(null);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [maintenanceConfirmation, setMaintenanceConfirmation] = useState('');
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
      const result = await api.previewDataMaintenance(maintenanceFrom, maintenanceTo, maintenanceBranchId);
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
    if (!window.confirm(`Hapus permanen transaksi ${targetName} untuk periode ${maintenanceFrom} sampai ${maintenanceTo}? Master pelanggan dan kendaraan tetap dipertahankan.`)) return;
    setMaintenanceLoading(true);
    try {
      const result = await api.purgeDataMaintenance(maintenanceFrom, maintenanceTo, maintenanceBranchId, maintenanceConfirmation);
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
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const sheets: Record<string, any[]> = {};
      for (const name of backupSheetNames) {
        const sheet = workbook.getWorksheet(name);
        if (!sheet) throw new Error(`Sheet ${name} tidak ditemukan.`);
        const headers = (sheet.getRow(1).values as any[]).slice(1).map(value => String(value || '').trim());
        sheets[name] = [];
        sheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return;
          const record: Record<string, any> = {};
          headers.forEach((header, index) => {
            if (!header) return;
            const cellValue: any = row.getCell(index + 1).value;
            record[header] = cellValue && typeof cellValue === 'object' && 'text' in cellValue ? cellValue.text : (cellValue ?? '');
          });
          if (Object.values(record).some(value => value !== '')) sheets[name].push(record);
        });
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

      <div className="space-y-0">
        <nav className="sticky top-0 z-10 flex gap-0.5 overflow-x-auto border-b border-blue-600 bg-gray-100 px-1 pt-1 shadow-sm">
          {tabs.filter(item => !['backup', 'maintenance'].includes(item.id) || currentUser?.isOwner).map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => selectTab(item.id)}
                className={`flex h-11 flex-shrink-0 items-center gap-2 rounded-t-md border border-b-0 px-4 text-left text-sm font-medium transition ${
                  tab === item.id ? 'border-blue-600 bg-blue-600 text-white shadow-sm' : 'border-gray-300 bg-gray-200 text-gray-600 hover:bg-white'
                }`}
              >
                <Icon className="h-4 w-4" /> {item.label}
              </button>
            );
          })}
        </nav>

        <section className={`grid items-start gap-3 pt-0.5 ${['guide', 'backup', 'maintenance'].includes(tab) ? '' : 'lg:grid-cols-[minmax(0,1fr)_120px]'}`}>
          {tab === 'company' && (
            <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
              <TabHeader title="Profil Perusahaan" description="Informasi yang tampil pada dokumen dan laporan." />
              <div className="grid gap-8 lg:grid-cols-2">
                <section>
                  <h4 className="mb-4 border-b border-gray-200 pb-2 text-lg font-medium text-blue-600">Info Umum</h4>
                  <div className="space-y-4">
                    <CompanyField label="Nama perusahaan"><input className={inputClass} value={draft.company.name} onChange={e => setCompany('name', e.target.value)} /></CompanyField>
                    <CompanyField label="Telepon"><input className={inputClass} value={draft.company.phone} onChange={e => setCompany('phone', e.target.value)} /></CompanyField>
                    <CompanyField label="Alamat" multiline><textarea className={`${inputClass} resize-y`} rows={4} value={draft.company.address} onChange={e => setCompany('address', e.target.value)} /></CompanyField>
                    <CompanyField label="NPWP"><input className={inputClass} value={draft.company.taxNumber} onChange={e => setCompany('taxNumber', e.target.value)} /></CompanyField>
                  </div>
                </section>
                <section>
                  <h4 className="mb-4 border-b border-gray-200 pb-2 text-lg font-medium text-blue-600">Info Lainnya</h4>
                  <div className="space-y-4">
                    <CompanyField label="Nama legal"><input className={inputClass} value={draft.company.legalName} onChange={e => setCompany('legalName', e.target.value)} placeholder="PT/CV (opsional)" /></CompanyField>
                    <CompanyField label="Email"><input className={inputClass} type="email" value={draft.company.email} onChange={e => setCompany('email', e.target.value)} /></CompanyField>
                    <CompanyField label="Zona waktu"><select className={inputClass} value={draft.company.timezone} onChange={e => setCompany('timezone', e.target.value)}><option value="Asia/Makassar">Asia/Makassar (WITA)</option><option value="Asia/Jakarta">Asia/Jakarta (WIB)</option></select></CompanyField>
                  </div>
                </section>
                <div className="lg:col-span-2">
                  <CompanyField label="Footer faktur" multiline><textarea className={`${inputClass} resize-y`} rows={3} value={draft.company.invoiceFooter} onChange={e => setCompany('invoiceFooter', e.target.value)} /></CompanyField>
                </div>
              </div>
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
                <label className={labelClass}><span>Dari tanggal</span><input type="date" className={inputClass} value={maintenanceFrom} onChange={event => { setMaintenanceFrom(event.target.value); setMaintenancePreview(null); setMaintenanceConfirmation(''); }} /></label>
                <label className={labelClass}><span>Sampai tanggal</span><input type="date" className={inputClass} value={maintenanceTo} onChange={event => { setMaintenanceTo(event.target.value); setMaintenancePreview(null); setMaintenanceConfirmation(''); }} /></label>
              </div>
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
                    ].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-amber-200 bg-white p-3"><p className="text-xs text-gray-500">{label}</p><p className="text-2xl font-bold text-gray-900">{value}</p></div>)}
                  </div>
                  <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">Pelanggan dan kendaraan merupakan master global dan tidak ikut dihapus.</p>
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
                  <p className="mt-2 text-xs text-emerald-700">Master pelanggan dan kendaraan tetap dipertahankan.</p>
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
  );
}

function TabHeader({ title, description }: { title: string; description: string }) {
  void title;
  void description;
  return null;
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
        <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4"><h3 className="font-bold text-cyan-900">Perintah Asisten AI</h3><p className="mt-2 text-sm leading-6 text-cyan-800"><b>reg</b> untuk registrasi WO, <b>cek</b> untuk mencari pelanggan/kendaraan dan histori, <b>list</b> untuk menampilkan daftar, serta <b>reginv</b> untuk transaksi cepat bagi pengguna yang memiliki izin khusus tanggal mundur.</p></div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h3 className="font-bold text-amber-900">Catatan Kontrol</h3><p className="mt-2 text-sm leading-6 text-amber-800">Tanggal masa depan dilarang. Input tanggal mundur memerlukan izin akun dan alasan bila pengaturannya aktif. Semua perubahan status, invoice, dan pembayaran dicatat dalam timeline/audit.</p></div>
      </section>
    </div>
  );
}
