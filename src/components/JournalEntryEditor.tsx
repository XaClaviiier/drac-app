import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '../lib/apiClient';
import { localDate, sourceLabel, type JournalRow } from '../lib/journalList';
import type { JournalBranch } from './JournalListFilters';
import AccurateDocumentSideTabs, { type AccurateDocumentTab } from './AccurateDocumentSideTabs';
import AccurateFormActionRail from './AccurateFormActionRail';
import AccountSearch, { type AccountSearchOption } from './AccountSearch';

export type JournalDetail = JournalRow & { lines: Array<{ account_code?: string; account_name?: string; debit: number; credit: number; memo?: string }> };
export type JournalAccount = AccountSearchOption;
type EntryLine = { accountId: string; debit: string; credit: string; memo: string };
const blank = (): EntryLine => ({ accountId: '', debit: '', credit: '', memo: '' });
export const journalMoney = (value: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(value);

export default function JournalEntryEditor({ detail, accounts, branches, initialBranchId, initialBranchName, canCreate, onDirtyChange, onBusyChange, onSaved, onNotice, onNavigate }: {
  detail?: JournalDetail;
  accounts: JournalAccount[];
  branches: JournalBranch[];
  initialBranchId: string;
  initialBranchName?: string;
  canCreate: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  onSaved: (message: string) => void;
  onNotice: (message: string) => void;
  onNavigate: (path: string) => void;
}) {
  const [tab, setTab] = useState<AccurateDocumentTab>('details');
  const [initialDate] = useState(localDate);
  const [date, setDate] = useState(initialDate);
  const [description, setDescription] = useState('');
  const [branchId, setBranchId] = useState(initialBranchId);
  const [autoNumber, setAutoNumber] = useState(true);
  const [entryNumber, setEntryNumber] = useState('');
  const [lines, setLines] = useState<EntryLine[]>([]);
  const [busy, setBusy] = useState(false);
  const dirty = !detail && (date !== initialDate || !!description || branchId !== initialBranchId || !autoNumber || !!entryNumber || lines.length > 0 || lines.some(line => !!line.accountId || !!line.debit || !!line.credit || !!line.memo));
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { if (!detail) setBranchId(initialBranchId); }, [detail, initialBranchId]);
  const debit = detail ? detail.lines.reduce((sum, line) => sum + Number(line.debit), 0) : lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const credit = detail ? detail.lines.reduce((sum, line) => sum + Number(line.credit), 0) : lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  const balanced = debit > 0 && Math.round(debit * 100) === Math.round(credit * 100);
  const update = (index: number, patch: Partial<EntryLine>) => setLines(values => values.map((value, i) => i === index ? { ...value, ...patch } : value));
  const addAccountLine = (account: JournalAccount) => {
    if (detail || busy || !canCreate || !account.isActive) return;
    setLines(values => [...values, { ...blank(), accountId: account.id }]);
  };
  const sourcePath = detail?.sourceId && detail.sourceType === 'sales_invoice' ? '/invoices?view=' + encodeURIComponent(detail.sourceId)
    : detail?.sourceId && detail.sourceType === 'customer_payment' ? '/customer-payments?viewInvoiceId=' + encodeURIComponent(detail.sourceId)
    : detail?.sourceType === 'purchase_invoice' ? '/purchase-invoices' : detail?.sourceType === 'supplier_payment' ? '/purchase-payments' : '';
  const save = async () => {
    if (detail || busy || !canCreate) return;
    if (!branchId || branchId === 'ALL') { onNotice('Pilih satu cabang pada header aplikasi sebelum membuat jurnal.'); return; }
    if (!date || !description.trim()) { onNotice('Tanggal dan keterangan jurnal wajib diisi.'); setTab(!description.trim() ? 'info' : 'details'); return; }
    if (!autoNumber && !entryNumber.trim()) { onNotice('Nomor jurnal wajib diisi jika nomor otomatis dimatikan.'); setTab('details'); return; }
    if (lines.some(line => !line.accountId || !Number.isFinite(Number(line.debit || 0)) || !Number.isFinite(Number(line.credit || 0)) || Number(line.debit || 0) < 0 || Number(line.credit || 0) < 0 || (Number(line.debit || 0) > 0) === (Number(line.credit || 0) > 0))) {
      onNotice('Setiap baris harus memilih akun dan memiliki debit atau kredit positif saja.'); return;
    }
    if (!balanced) { onNotice('Total debit dan kredit harus sama dan lebih dari nol.'); return; }
    setBusy(true);
    onBusyChange(true);
    try {
      const response = await api.create('general-ledger', { date, description: description.trim(), branchId, autoNumber, entryNumber: entryNumber.trim(), numberSeries: 'Jurnal Umum', lines: lines.map(line => ({ ...line, debit: Number(line.debit || 0), credit: Number(line.credit || 0) })) });
      if (!response.success) throw new Error(response.message || 'Jurnal gagal disimpan.');
      onDirtyChange(false);
      onSaved('Jurnal ' + (response.data?.number || '') + ' berhasil disimpan.');
    } catch (error) { onNotice(error instanceof Error ? error.message : 'Jurnal gagal disimpan.'); }
    finally { setBusy(false); onBusyChange(false); }
  };
  const entryBranchName = detail?.branchName || (detail?.branchId ? detail.branchId : '') || initialBranchName || branches.find(branch => branch.id === branchId)?.name || branchId;

  return <div className="app-entry-editor" aria-busy={busy}>
    <div className="app-entry-main" data-accounting-print>
      <section className="app-entry-header-fields">
        <label className="app-entry-date"><span>Tanggal <span className="app-required">*</span></span><input aria-label="Tanggal jurnal" type="date" value={detail?.date || date} disabled={!!detail || busy || !canCreate} onChange={event => setDate(event.target.value)} /></label>
        <div className="app-entry-number-kind"><label><span>Nomor # <span className="app-required">*</span></span><div className="app-entry-number-control"><input className="app-entry-auto-toggle" aria-label="Nomor otomatis" type="checkbox" checked={detail ? true : autoNumber} disabled={!!detail || busy || !canCreate} onChange={event => { setAutoNumber(event.target.checked); setEntryNumber(''); }} /><input aria-label="Nomor jurnal" readOnly={autoNumber || !!detail} value={detail?.number || (autoNumber ? 'Auto' : entryNumber)} placeholder="Isi manual" onChange={event => setEntryNumber(event.target.value)} /></div></label></div>
        <label className="app-entry-type"><span>Tipe Transaksi</span><input aria-label="Tipe transaksi jurnal" readOnly value={sourceLabel(detail?.sourceType)} /></label>
        <label className="app-entry-branch"><span>Cabang</span><input aria-label="Cabang jurnal" readOnly value={entryBranchName || 'Pilih cabang pada header aplikasi'} /></label>
      </section>
      <div data-journal-document-shell className="app-entry-document-shell relative min-h-[320px] bg-white lg:ml-10 lg:border lg:border-gray-400 lg:shadow-[0_2px_7px_rgba(15,23,42,0.18)]">
        <AccurateDocumentSideTabs active={tab} onChange={setTab} visibleTabs={['details', 'info']} ariaLabel="Bagian dokumen Jurnal Umum" />
        {tab === 'details' ? <>
        <section className="app-entry-lines-panel">
          <div className="app-entry-lines-toolbar">
            <AccountSearch accounts={accounts} disabled={busy || !canCreate || !!detail} onSelect={addAccountLine} />
            <strong className="app-entry-lines-count">{detail ? detail.lines.length : lines.length} Akun</strong>
          </div>
          <div className="app-table-scroll app-table-shell">
            <table className="app-data-table app-accounting-table app-journal-lines">
              <thead><tr><th className="app-entry-row-handle" /><th>Kode #</th><th>Nama Perkiraan</th><th className="amount">Debit</th><th className="amount">Kredit</th></tr></thead>
              <tbody>{detail ? detail.lines.map((line, index) => <tr key={index}><td className="app-entry-row-handle">☰</td><td>{line.account_code || '—'}</td><td>{line.account_name || '—'}{line.memo && <div className="app-entry-note">{line.memo}</div>}</td><td className="amount">{journalMoney(Number(line.debit))}</td><td className="amount">{journalMoney(Number(line.credit))}</td></tr>) : lines.map((line, index) => <tr key={index}>
                <td className="app-entry-row-handle"><button type="button" aria-label={'Hapus baris ' + (index + 1)} disabled={busy || !canCreate || lines.length <= 2} onClick={() => setLines(values => values.filter((_, i) => i !== index))}><Trash2 size={14} /></button></td>
                <td colSpan={2}><select aria-label={'Akun baris ' + (index + 1)} value={line.accountId} disabled={busy || !canCreate} onChange={event => update(index, { accountId: event.target.value })}><option value="">Cari/Pilih Akun Perkiraan...</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.code + ' · ' + account.name}</option>)}</select><input aria-label={'Catatan baris ' + (index + 1)} className="app-entry-note-input" placeholder="Catatan" value={line.memo} disabled={busy || !canCreate} onChange={event => update(index, { memo: event.target.value })} /></td>
                <td><input aria-label={'Debit baris ' + (index + 1)} type="number" min="0" step="0.01" value={line.debit} disabled={busy || !canCreate} onChange={event => update(index, { debit: event.target.value, credit: '' })} /></td>
                <td><input aria-label={'Kredit baris ' + (index + 1)} type="number" min="0" step="0.01" value={line.credit} disabled={busy || !canCreate} onChange={event => update(index, { credit: event.target.value, debit: '' })} /></td>
              </tr>)}</tbody>
              {!detail && !lines.length && <tbody><tr><td colSpan={5} className="app-data-empty">Belum ada data</td></tr></tbody>}
            </table>
          </div>
        </section>
        </>
          : <section className="app-entry-metadata"><h2>Informasi Transaksi</h2><p>{detail ? 'Jurnal terposting ditampilkan dalam mode baca saja.' : 'Jurnal manual diposting setelah debit dan kredit seimbang dan disimpan.'}</p>{!detail && <label className="app-entry-metadata-description"><span>Keterangan <span className="app-required">*</span></span><input aria-label="Keterangan jurnal" value={description} disabled={busy || !canCreate} onChange={event => setDescription(event.target.value)} /></label>}{detail && <><p>Tipe transaksi: {sourceLabel(detail.sourceType)}</p><p>No. Trans #: {detail.transactionNumber || detail.sourceId || '—'}</p><p>Nama pihak: {detail.partyName || '—'}</p></>}</section>}
      </div>
      {tab === 'details' && <div className="app-entry-total"><div><span>Total Debit</span><strong>{journalMoney(debit)}</strong></div><div><span>Total Kredit</span><strong>{journalMoney(credit)}</strong></div></div>}
    </div>
    <AccurateFormActionRail
      ariaLabel="Aksi Jurnal Umum"
      className="absolute right-4 top-4 z-20 hidden gap-1.5 lg:flex [&>button:first-child]:mb-1.5 [&>div]:mt-1.5"
      save={{ onClick: () => void save(), disabled: !!detail || busy || !canCreate || !dirty || !balanced, title: detail ? 'Jurnal terposting hanya dapat dilihat' : 'Simpan jurnal' }}
      print={{ onClick: () => window.print(), title: 'Cetak jurnal' }}
      attachment={{ disabled: true, title: 'Lampiran belum tersedia' }}
      more={{ onClick: () => sourcePath ? onNavigate(sourcePath) : setTab('info'), title: sourcePath ? 'Buka transaksi sumber' : 'Info lainnya' }}
      remove={{ disabled: true, title: 'Hapus jurnal' }}
    />
    <div className="mt-3 flex justify-end gap-2 lg:hidden">
      <button type="button" className="rounded border border-gray-300 bg-white px-3 py-2" onClick={() => window.print()}>Cetak jurnal</button>
      <button type="button" className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50" disabled={!!detail || busy || !canCreate || !dirty || !balanced} onClick={() => void save()}>Simpan jurnal</button>
    </div>
  </div>;
}
