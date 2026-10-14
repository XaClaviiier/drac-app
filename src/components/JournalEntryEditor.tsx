import { useEffect, useState } from 'react';
import { ExternalLink, FileText, Info, MoreHorizontal, Paperclip, Plus, Save, Trash2 } from 'lucide-react';
import { api } from '../lib/apiClient';
import { localDate, sourceLabel, type JournalRow } from '../lib/journalList';
import type { JournalBranch } from './JournalListFilters';

export type JournalDetail = JournalRow & { lines: Array<{ account_code?: string; account_name?: string; debit: number; credit: number; memo?: string }> };
export type JournalAccount = { id: string; code: string; name: string; isActive: boolean };
type EntryLine = { accountId: string; debit: string; credit: string; memo: string };
const blank = (): EntryLine => ({ accountId: '', debit: '', credit: '', memo: '' });
export const journalMoney = (value: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(value);

export default function JournalEntryEditor({ detail, accounts, branches, initialBranchId, canCreate, onDirtyChange, onBusyChange, onSaved, onNotice, onNavigate }: {
  detail?: JournalDetail;
  accounts: JournalAccount[];
  branches: JournalBranch[];
  initialBranchId: string;
  canCreate: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  onSaved: (message: string) => void;
  onNotice: (message: string) => void;
  onNavigate: (path: string) => void;
}) {
  const [tab, setTab] = useState('Informasi Umum');
  const [initialDate] = useState(localDate);
  const [date, setDate] = useState(initialDate);
  const [description, setDescription] = useState('');
  const [branchId, setBranchId] = useState(initialBranchId);
  const [lines, setLines] = useState<EntryLine[]>([]);
  const [busy, setBusy] = useState(false);
  const dirty = !detail && (date !== initialDate || !!description || branchId !== initialBranchId || lines.length > 0 || lines.some(line => !!line.accountId || !!line.debit || !!line.credit || !!line.memo));
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  const debit = detail ? detail.lines.reduce((sum, line) => sum + Number(line.debit), 0) : lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const credit = detail ? detail.lines.reduce((sum, line) => sum + Number(line.credit), 0) : lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  const balanced = debit > 0 && Math.round(debit * 100) === Math.round(credit * 100);
  const update = (index: number, patch: Partial<EntryLine>) => setLines(values => values.map((value, i) => i === index ? { ...value, ...patch } : value));
  const sourcePath = detail?.sourceId && detail.sourceType === 'sales_invoice' ? '/invoices?view=' + encodeURIComponent(detail.sourceId)
    : detail?.sourceId && detail.sourceType === 'customer_payment' ? '/customer-payments?viewInvoiceId=' + encodeURIComponent(detail.sourceId)
    : detail?.sourceType === 'purchase_invoice' ? '/purchase-invoices' : detail?.sourceType === 'supplier_payment' ? '/purchase-payments' : '';
  const save = async () => {
    if (detail || busy || !canCreate) return;
    if (!date || !description.trim()) { onNotice('Tanggal dan keterangan jurnal wajib diisi.'); setTab('Informasi Umum'); return; }
    if (lines.some(line => !line.accountId || !Number.isFinite(Number(line.debit || 0)) || !Number.isFinite(Number(line.credit || 0)) || Number(line.debit || 0) < 0 || Number(line.credit || 0) < 0 || (Number(line.debit || 0) > 0) === (Number(line.credit || 0) > 0))) {
      onNotice('Setiap baris harus memilih akun dan memiliki debit atau kredit positif saja.'); return;
    }
    if (!balanced) { onNotice('Total debit dan kredit harus sama dan lebih dari nol.'); return; }
    setBusy(true);
    onBusyChange(true);
    try {
      const response = await api.create('general-ledger', { date, description: description.trim(), branchId: branchId || null, lines: lines.map(line => ({ ...line, debit: Number(line.debit || 0), credit: Number(line.credit || 0) })) });
      if (!response.success) throw new Error(response.message || 'Jurnal gagal disimpan.');
      onDirtyChange(false);
      onSaved('Jurnal ' + (response.data?.number || '') + ' berhasil disimpan.');
    } catch (error) { onNotice(error instanceof Error ? error.message : 'Jurnal gagal disimpan.'); }
    finally { setBusy(false); onBusyChange(false); }
  };

  return <div className="app-entry-editor" aria-busy={busy}>
    <aside className="app-entry-side-tabs" aria-label="Tab rincian jurnal">
      <button type="button" className={tab === 'Informasi Umum' ? 'active' : ''} aria-label="Rincian jurnal" onClick={() => setTab('Informasi Umum')}><FileText size={20} /></button>
      <button type="button" className={tab === 'Lain-lain' ? 'active' : ''} aria-label="Informasi lainnya" onClick={() => setTab('Lain-lain')}><Info size={20} /></button>
    </aside>
    <div className="app-entry-main" data-accounting-print>
      {tab === 'Informasi Umum' ? <>
        <section className="app-entry-header-fields">
          <label>Tanggal <span className="app-required">*</span><input aria-label="Tanggal jurnal" type="date" value={detail?.date || date} disabled={!!detail || busy || !canCreate} onChange={event => setDate(event.target.value)} /></label>
          <label>Nomor # <span className="app-required">*</span><input aria-label="Nomor jurnal" readOnly value={detail?.number || 'Otomatis saat disimpan'} /></label>
          <label className="app-entry-type">Tipe Transaksi<input aria-label="Tipe transaksi jurnal" readOnly value={sourceLabel(detail?.sourceType)} /></label>
          <label className="app-entry-kind">Jenis jurnal<select aria-label="Jenis jurnal" disabled={!!detail || busy || !canCreate}><option>Jurnal Umum</option></select></label>
          <label className="app-entry-description">Keterangan <span className="app-required">*</span><input aria-label="Keterangan jurnal" value={detail?.description || description} disabled={!!detail || busy || !canCreate} onChange={event => setDescription(event.target.value)} /></label>
          <label className="app-entry-branch">Cabang<select aria-label="Cabang jurnal" value={detail ? detail.branchId || '' : branchId} disabled={!!detail || busy || !canCreate} onChange={event => setBranchId(event.target.value)}>
            <option value="">Tanpa cabang / umum</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            {detail?.branchId && !branches.some(branch => branch.id === detail.branchId) && <option value={detail.branchId}>{detail.branchName || detail.branchId}</option>}
          </select></label>
        </section>
        <section className="app-entry-lines-panel">
          <div className="app-entry-lines-toolbar"><div className="app-entry-account-search"><input aria-label="Cari akun perkiraan" placeholder="Cari/Pilih Akun Perkiraan..." readOnly /><span>⌕</span></div><div className="app-entry-lines-title"><button type="button" aria-label="Cari rincian jurnal"><Info size={19} /></button>Rincian Jurnal <span className="app-required">*</span></div></div>
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
          {!detail && <button type="button" className="app-entry-add-line" disabled={busy || !canCreate} onClick={() => setLines(values => [...values, blank()])}><Plus size={16} />Tambah baris</button>}
        </section>
      </> : <section className="app-entry-panel app-entry-metadata"><h2>Informasi Transaksi</h2><p>{detail ? 'Jurnal terposting ditampilkan dalam mode baca saja.' : 'Jurnal manual diposting setelah debit dan kredit seimbang dan disimpan.'}</p>{detail && <><p>Tipe transaksi: {sourceLabel(detail.sourceType)}</p><p>No. Trans #: {detail.transactionNumber || detail.sourceId || '—'}</p><p>Nama pihak: {detail.partyName || '—'}</p></>}</section>}
    </div>
    <aside className="app-entry-actions" aria-label="Aksi Jurnal Umum">
      <button type="button" className="app-entry-save" aria-label="Simpan jurnal" title={detail ? 'Jurnal terposting hanya dapat dilihat' : 'Simpan jurnal'} disabled={!!detail || busy || !canCreate || !dirty || !balanced} onClick={() => void save()}><Save size={33} /></button>
      <button type="button" className="app-entry-secondary app-entry-doc" aria-label="Dokumen jurnal" title="Cetak jurnal" onClick={() => window.print()}><FileText size={29} /><span>⌄</span></button>
      <button type="button" className="app-entry-secondary app-entry-doc" aria-label="Lampiran jurnal" title="Lampiran belum tersedia" disabled><Paperclip size={29} /><span>⌄</span></button>
      <button type="button" className="app-entry-more" aria-label="Menu jurnal" title={sourcePath ? 'Buka transaksi sumber' : 'Lain-lain'} onClick={() => sourcePath ? onNavigate(sourcePath) : setTab('Lain-lain')}><MoreHorizontal size={29} /><span>⌄</span></button>
      <button type="button" className="app-entry-delete" aria-label="Hapus jurnal" disabled><Trash2 size={29} /></button>
      {sourcePath && <button type="button" className="app-entry-source-hidden" aria-label="Buka transaksi sumber" onClick={() => onNavigate(sourcePath)}><ExternalLink size={16} /></button>}
    </aside>
    <div className="app-entry-total"><div><span>Total Debit</span><strong>{journalMoney(debit)}</strong></div><div><span>Total Credit</span><strong>{journalMoney(credit)}</strong></div></div>
  </div>;
}
