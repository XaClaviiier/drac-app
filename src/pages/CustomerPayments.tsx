import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Banknote,
  Edit3,
  LockKeyhole,
  List,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../lib/apiClient";
import { useApp } from "../context/AppContext";
import IndonesianDateInput from "../components/IndonesianDateInput";
import { ui } from "../components/ui/interfaceStandards";

type PaymentRow = {
  id: string;
  paymentNumber: string;
  invoiceId: string;
  invoiceNumber: string;
  date: string;
  customerName: string;
  customerId: string;
  vehicleInfo: string;
  invoiceTotal: number;
  invoicePaid: number;
  amount: number;
  balanceAfter: number;
  paymentStatus: "Lunas" | "Cicilan";
  paymentMethod: string;
  accountId?: string;
  accountName?: string;
  branchId: string;
  createdByName?: string;
  notes?: string;
  isDeposited?: boolean;
};
type CashAccount = {
  id: string;
  name: string;
  accountType: "cash" | "bank";
  branchId?: string;
};
type Period = "today" | "this_month" | "last_month" | "custom" | "all";

const rupiah = (value: number) =>
  `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const displayDate = (value: string) =>
  value
    ? new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(`${value}T00:00:00`))
    : "-";

export default function CustomerPayments() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, currentBranchId, hasPermission, refreshData } = useApp();
  const [rows, setRows] = useState<PaymentRow[]>([]),
    [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [loading, setLoading] = useState(false),
    [search, setSearch] = useState(""),
    [showForm, setShowForm] = useState(false),
    [invoiceSearch, setInvoiceSearch] = useState("");
  const [editingPayment, setEditingPayment] = useState<PaymentRow | null>(null);
  const [viewingPayment, setViewingPayment] = useState<PaymentRow | null>(null);
  const [period, setPeriod] = useState<Period>("this_month"),
    [dateFrom, setDateFrom] = useState(""),
    [dateTo, setDateTo] = useState("");
  const [methodFilter, setMethodFilter] = useState("ALL"),
    [accountFilter, setAccountFilter] = useState("ALL"),
    [userFilter, setUserFilter] = useState("ALL"),
    [statusFilter, setStatusFilter] = useState("ALL");
  const today = localDate();
  const emptyForm = {
    invoiceId: "",
    date: today,
    amount: 0,
    paymentMethod: "Tunai",
    accountId: "",
    notes: "",
    reason: "",
  };
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    setLoading(true);
    const [p, a] = await Promise.all([
      api.get("customer-payments"),
      api.get("cash-accounts"),
    ]);
    if (p.success) setRows(p.data || []);
    else window.alert(p.message);
    if (a.success) setAccounts(a.data || []);
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const requestedPayment = searchParams.get("view");
    if (!requestedPayment || !rows.length) return;
    const selected = rows.find((row) => row.id === requestedPayment || row.paymentNumber === requestedPayment);
    if (selected) setViewingPayment(selected);
    else window.alert("Pembayaran tidak ditemukan atau tidak dapat diakses.");
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.delete("view");
      return next;
    }, { replace: true });
  }, [searchParams, rows, setSearchParams]);

  const unpaid = data.invoices.filter(
    (i) =>
      i.total > i.payment &&
      (currentBranchId === "ALL" || i.branchId === currentBranchId),
  );
  const invoice = data.invoices.find((i) => i.id === form.invoiceId),
    outstanding = invoice ? Math.max(0, invoice.total - invoice.payment) : 0,
    maximumEditableAmount = outstanding + (editingPayment?.amount || 0);
  const invoiceChoices = useMemo(() => {
    const q = invoiceSearch.trim().toLowerCase();
    return unpaid
      .filter((i) => {
        const customer = data.customers.find(
          (c) =>
            c.id === i.customerRefId ||
            c.id === i.customerId ||
            c.name === i.customerName,
        );
        return `${i.invoiceNumber} ${i.customerName} ${customer?.phone || ""} ${i.vehicleInfo}`
          .toLowerCase()
          .includes(q);
      })
      .slice(0, 60);
  }, [unpaid, invoiceSearch, data.customers]);
  const expectedAccountType = form.paymentMethod === "Tunai" ? "cash" : "bank";
  const availableAccounts = accounts.filter(
    (a) =>
      a.accountType === expectedAccountType &&
      (!a.branchId || a.branchId === invoice?.branchId),
  );

  useEffect(() => {
    const viewInvoiceId = searchParams.get("viewInvoiceId");
    if (viewInvoiceId) {
      const selected = data.invoices.find((item) => item.id === viewInvoiceId);
      if (selected) {
        setPeriod("all");
        setSearch(selected.invoiceNumber);
      }
      setSearchParams({}, { replace: true });
      return;
    }
    const invoiceId = searchParams.get("invoiceId");
    if (!invoiceId) return;
    const selected = data.invoices.find((item) => item.id === invoiceId);
    if (!selected || selected.total <= selected.payment) return;
    setInvoiceSearch("");
    setForm({
      invoiceId: selected.id,
      date: today,
      amount: Math.max(0, selected.total - selected.payment),
      paymentMethod: "Tunai",
      accountId: "",
      notes: "",
      reason: "",
    });
    setShowForm(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, data.invoices, today, setSearchParams]);

  const periodRange = useMemo(() => {
    const now = new Date();
    if (period === "all") return ["", ""];
    if (period === "today") return [today, today];
    if (period === "custom") return [dateFrom, dateTo];
    const base =
      period === "last_month"
        ? new Date(now.getFullYear(), now.getMonth() - 1, 1)
        : new Date(now.getFullYear(), now.getMonth(), 1);
    return [
      localDate(base),
      localDate(new Date(base.getFullYear(), base.getMonth() + 1, 0)),
    ];
  }, [period, dateFrom, dateTo, today]);
  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (currentBranchId === "ALL" || r.branchId === currentBranchId) &&
          (!periodRange[0] || r.date >= periodRange[0]) &&
          (!periodRange[1] || r.date <= periodRange[1]) &&
          (methodFilter === "ALL" || r.paymentMethod === methodFilter) &&
          (accountFilter === "ALL" || r.accountId === accountFilter) &&
          (userFilter === "ALL" || (r.createdByName || "-") === userFilter) &&
          (statusFilter === "ALL" || r.paymentStatus === statusFilter) &&
          `${r.paymentNumber} ${r.invoiceNumber} ${r.customerName} ${r.customerId} ${r.vehicleInfo} ${r.accountName || ""}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [
      rows,
      currentBranchId,
      periodRange,
      methodFilter,
      accountFilter,
      userFilter,
      statusFilter,
      search,
    ],
  );
  const inputUsers = useMemo(
    () =>
      Array.from(
        new Set(rows.map((r) => r.createdByName || "-").filter(Boolean)),
      ).sort(),
    [rows],
  );
  const visibleAccounts = useMemo(
    () =>
      accounts.filter(
        (a) =>
          !a.branchId ||
          currentBranchId === "ALL" ||
          a.branchId === currentBranchId,
      ),
    [accounts, currentBranchId],
  );
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const maximum = editingPayment ? maximumEditableAmount : outstanding;
    if (!invoice || form.amount <= 0 || form.amount > maximum)
      return window.alert("Periksa faktur dan nominal pembayaran.");
    if (editingPayment && !form.reason.trim())
      return window.alert("Alasan perubahan pembayaran wajib diisi.");
    const r = editingPayment
      ? await api.update("customer-payments", editingPayment.id, form)
      : await api.create("customer-payments", form);
    if (!r.success) return window.alert(r.message);
    await refreshData();
    await load();
    closeForm();
  };
  const remove = async (row: PaymentRow) => {
    if (row.isDeposited)
      return window.alert(
        "Pembayaran sudah masuk setoran cabang. Batalkan setoran terlebih dahulu.",
      );
    const reason = window.prompt(`Alasan menghapus ${row.paymentNumber}:`);
    if (reason === null) return;
    if (!reason.trim()) return window.alert("Alasan penghapusan wajib diisi.");
    if (
      !window.confirm(
        `Hapus ${row.paymentNumber}? Faktur akan kembali terutang sebesar pembayaran ini.`,
      )
    )
      return;
    const result = await api.removeWithReason(
      "customer-payments",
      row.id,
      reason.trim(),
    );
    if (!result.success) return window.alert(result.message);
    await refreshData();
    await load();
  };
  const customerPhone = (row: PaymentRow) =>
    data.customers.find(
      (customer) =>
        customer.customerCode === row.customerId ||
        customer.id === row.customerId ||
        customer.name === row.customerName,
    )?.phone || "";
  const whatsappNumber = (phone: string) => {
    const digits = phone.replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("0")) return `62${digits.slice(1)}`;
    return digits;
  };
  const sendWhatsApp = (row: PaymentRow) => {
    const phone = whatsappNumber(customerPhone(row));
    if (!phone)
      return window.alert(`Nomor WhatsApp ${row.customerName} belum tersedia.`);
    const message = `Halo ${row.customerName}, pembayaran ${row.paymentNumber} untuk faktur ${row.invoiceNumber} sebesar ${rupiah(row.amount)} telah kami terima. Sisa tagihan: ${rupiah(row.balanceAfter)}. Terima kasih.\n\nDOKTER AC MOBIL`;
    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };
  const openForm = () => {
    setEditingPayment(null);
    setForm(emptyForm);
    setInvoiceSearch("");
    setShowForm(true);
  };
  const openEdit = (row: PaymentRow) => {
    if (row.isDeposited)
      return window.alert(
        "Pembayaran sudah masuk setoran cabang. Batalkan setoran terlebih dahulu.",
      );
    setEditingPayment(row);
    setInvoiceSearch("");
    setForm({
      invoiceId: row.invoiceId,
      date: row.date,
      amount: row.amount,
      paymentMethod: row.paymentMethod === "Transfer" ? "Transfer" : "Tunai",
      accountId: row.accountId || "",
      notes: row.notes || "",
      reason: "",
    });
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditingPayment(null);
    setInvoiceSearch("");
    setForm(emptyForm);
  };

  return (
    <div className="space-y-3 lg:-mx-6 lg:-mt-6 lg:space-y-0">
      <div className={`${ui.childBar} hidden lg:flex`}>
        <button type="button" className={ui.childListTab} title="Daftar Pembayaran Pelanggan" aria-label="Daftar Pembayaran Pelanggan">
          <List className="h-5 w-5" />
        </button>
      </div>

      <div className={`${ui.toolbar} border border-gray-300 p-3 shadow-sm lg:border-x-0 lg:border-y lg:px-3 lg:py-2`}>
        <div className="flex flex-wrap items-center gap-2">
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          className={`${ui.field} px-3`}
        >
          <option value="today">Hari Ini</option>
          <option value="this_month">Bulan Ini</option>
          <option value="last_month">Bulan Lalu</option>
          <option value="custom">Pilih Tanggal</option>
          <option value="all">Semua Tanggal</option>
        </select>
        {period === "custom" && (
          <>
            <IndonesianDateInput value={dateFrom} onChange={setDateFrom} className="h-9 w-36 text-sm"/>
            <IndonesianDateInput value={dateTo} onChange={setDateTo} className="h-9 w-36 text-sm"/>
          </>
        )}
        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className={`${ui.field} px-3`}
        >
          <option value="ALL">Semua Metode</option>
          <option>Tunai</option>
          <option>Transfer</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={`${ui.field} px-3`}
        >
          <option value="ALL">Semua Status</option>
          <option>Lunas</option>
          <option>Cicilan</option>
        </select>
        <select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          className={`${ui.field} max-w-[190px] px-3`}
        >
          <option value="ALL">Semua Akun</option>
          {visibleAccounts.map((a) => (
            <option value={a.id} key={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          className={`${ui.field} max-w-[170px] px-3`}
        >
          <option value="ALL">Semua Input</option>
          {inputUsers.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {hasPermission("payment:create") && (
              <button onClick={openForm} title="Pembayaran Baru" aria-label="Pembayaran Baru" className="flex h-9 w-14 items-center justify-center rounded bg-blue-800 text-white shadow-sm hover:bg-blue-700">
                <Plus className="h-5 w-5" />
              </button>
            )}
            <button onClick={() => void load()} title="Muat ulang" className="flex h-9 w-11 items-center justify-center rounded border border-blue-600 bg-white text-blue-700 hover:bg-blue-50">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <div className="relative w-full min-w-[240px] sm:w-[360px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari pembayaran, faktur, pelanggan, plat..." className={`${ui.search} w-full pl-9 pr-3`} />
            </div>
            <span className="flex h-9 min-w-14 items-center justify-center rounded border border-gray-300 bg-white px-3 text-sm text-gray-700">{filtered.length}</span>
          </div>
        </div>
      </div>

      <div className={`${ui.tableShell} mx-1 hidden overflow-x-auto shadow-sm md:block lg:mx-3 lg:mt-0.5`}>
        <table className="w-full text-sm">
          <thead className="bg-blue-800 text-white">
            <tr>
              {[
                "Tanggal",
                "No. Pembayaran",
                "Faktur",
                "Pelanggan",
                "Diterima",
                "Saldo Setelah",
                "Masuk Ke",
                "Input",
                "Aksi",
              ].map((x) => (
                <th
                  key={x}
                  className="whitespace-nowrap px-3 text-left text-xs font-semibold uppercase tracking-wide"
                >
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-blue-50/40">
                <td className="whitespace-nowrap px-3 py-2.5">
                  {displayDate(r.date)}
                </td>
                <td className="whitespace-nowrap px-3 font-semibold text-blue-700">
                  <button type="button" onClick={() => setViewingPayment(r)} className="hover:underline" title="Buka detail pembayaran">{r.paymentNumber}</button>
                </td>
                <td className="px-3">{r.invoiceNumber}</td>
                <td className="px-3">
                  <b>{r.customerName}</b>
                  <small className="block max-w-[240px] truncate text-gray-500">
                    {r.vehicleInfo}
                  </small>
                </td>
                <td className="whitespace-nowrap px-3 font-bold text-green-700">
                  {rupiah(r.amount)}
                </td>
                <td className="whitespace-nowrap px-3">
                  <b
                    className={
                      r.balanceAfter > 0 ? "text-amber-700" : "text-green-700"
                    }
                  >
                    {rupiah(r.balanceAfter)}
                  </b>
                  <small className="block text-gray-500">
                    {r.paymentStatus}
                  </small>
                </td>
                <td className="px-3">
                  <b>{r.accountName || "-"}</b>
                  <small className="block text-gray-500">
                    {r.paymentMethod}
                  </small>
                </td>
                <td className="px-3">{r.createdByName || "-"}</td>
                <td className="px-3">
                  <div className="flex items-center gap-1">
                    {hasPermission("payment:edit") && (
                      <button
                        onClick={() => openEdit(r)}
                        title={r.isDeposited ? "Terkunci karena sudah masuk setoran" : "Edit pembayaran"}
                        disabled={r.isDeposited}
                        className="rounded p-1.5 text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-gray-300"
                      >
                        {r.isDeposited ? <LockKeyhole className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
                      </button>
                    )}
                    <button
                      onClick={() => sendWhatsApp(r)}
                      title={customerPhone(r) ? "Kirim konfirmasi via WhatsApp" : "Nomor WhatsApp belum tersedia"}
                      disabled={!customerPhone(r)}
                      className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:text-gray-300"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </button>
                    {hasPermission("payment:delete") && (
                      <button
                        onClick={() => void remove(r)}
                        title={r.isDeposited ? "Terkunci karena sudah masuk setoran" : "Hapus pembayaran"}
                        disabled={r.isDeposited}
                        className="rounded p-2 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-gray-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={9} className="p-12 text-center text-gray-400">
                  Belum ada pembayaran pada filter ini
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 md:hidden">
        {filtered.map((r) => (
          <article
            key={r.id}
            className="rounded-xl border bg-white p-3 shadow-sm"
          >
            <div className="flex justify-between gap-2">
              <div>
                <button type="button" onClick={() => setViewingPayment(r)} className="font-bold text-blue-700 hover:underline">{r.paymentNumber}</button>
                <p className="text-xs text-gray-500">
                  {displayDate(r.date)} · {r.invoiceNumber}
                </p>
              </div>
              <div className="flex items-start gap-2">
                {hasPermission("payment:edit") && (
                  <button
                    onClick={() => openEdit(r)}
                    disabled={r.isDeposited}
                    title={r.isDeposited ? "Terkunci karena sudah masuk setoran" : "Edit pembayaran"}
                    className="rounded-lg bg-blue-50 p-1.5 text-blue-600 disabled:bg-gray-50 disabled:text-gray-300"
                  >
                    {r.isDeposited ? <LockKeyhole className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
                  </button>
                )}
                <button
                  onClick={() => sendWhatsApp(r)}
                  disabled={!customerPhone(r)}
                  title={customerPhone(r) ? "Kirim konfirmasi via WhatsApp" : "Nomor WhatsApp belum tersedia"}
                  className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 disabled:bg-gray-50 disabled:text-gray-300"
                >
                  <MessageCircle className="h-4 w-4" />
                </button>
                <b className="text-green-700">{rupiah(r.amount)}</b>
              </div>
            </div>
            <div className="mt-2 border-t pt-2">
              <b>{r.customerName}</b>
              <p className="truncate text-xs text-gray-500">{r.vehicleInfo}</p>
            </div>
            <div className="mt-2 grid grid-cols-2 text-xs">
              <span>
                Masuk ke
                <br />
                <b>{r.accountName || "-"}</b> · {r.paymentMethod}
              </span>
              <span className="text-right">
                Saldo faktur
                <br />
                <b
                  className={
                    r.balanceAfter > 0 ? "text-amber-700" : "text-green-700"
                  }
                >
                  {rupiah(r.balanceAfter)}
                </b>
              </span>
            </div>
            {hasPermission("payment:delete") && (
              <button
                onClick={() => void remove(r)}
                disabled={r.isDeposited}
                className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-red-200 py-2 text-xs font-semibold text-red-600 disabled:border-gray-200 disabled:text-gray-400"
              >
                {r.isDeposited ? <LockKeyhole className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                {r.isDeposited ? "Sudah Masuk Setoran" : "Hapus Pembayaran"}
              </button>
            )}
          </article>
        ))}
        {!filtered.length && (
          <div className="rounded-xl border bg-white p-10 text-center text-gray-400">
            Belum ada pembayaran
          </div>
        )}
      </div>

      {viewingPayment && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-3" role="dialog" aria-modal="true" aria-label={`Detail pembayaran ${viewingPayment.paymentNumber}`}>
          <section className="w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <header className="flex items-center justify-between bg-blue-900 px-5 py-4 text-white">
              <div><p className="text-xs text-blue-200">DETAIL PEMBAYARAN</p><h3 className="font-mono text-lg font-bold">{viewingPayment.paymentNumber}</h3></div>
              <button type="button" onClick={() => setViewingPayment(null)} className="rounded p-2 hover:bg-white/10" aria-label="Tutup"><X className="h-5 w-5" /></button>
            </header>
            <div className="grid gap-x-6 gap-y-4 p-5 text-sm sm:grid-cols-2">
              <div><span className="text-gray-500">Faktur</span><button type="button" onClick={() => window.location.assign(`/invoices?view=${encodeURIComponent(viewingPayment.invoiceId)}`)} className="block font-semibold text-blue-700 hover:underline">{viewingPayment.invoiceNumber}</button></div>
              <div><span className="text-gray-500">Tanggal</span><strong className="block">{displayDate(viewingPayment.date)}</strong></div>
              <div><span className="text-gray-500">Pelanggan</span><strong className="block">{viewingPayment.customerName}</strong><small className="text-gray-500">{viewingPayment.vehicleInfo}</small></div>
              <div><span className="text-gray-500">Nominal Pembayaran</span><strong className="block text-lg text-emerald-700">{rupiah(viewingPayment.amount)}</strong></div>
              <div><span className="text-gray-500">Metode</span><strong className="block">{viewingPayment.paymentMethod}</strong></div>
              <div><span className="text-gray-500">Masuk ke</span><strong className="block">{viewingPayment.accountName || "-"}</strong></div>
              <div><span className="text-gray-500">Saldo Faktur Setelah Pembayaran</span><strong className={`block ${viewingPayment.balanceAfter > 0 ? "text-amber-700" : "text-emerald-700"}`}>{rupiah(viewingPayment.balanceAfter)} · {viewingPayment.paymentStatus}</strong></div>
              <div><span className="text-gray-500">Input Oleh</span><strong className="block">{viewingPayment.createdByName || "-"}</strong></div>
              {viewingPayment.notes && <div className="sm:col-span-2"><span className="text-gray-500">Keterangan</span><p className="mt-1 rounded border border-gray-200 bg-gray-50 p-3">{viewingPayment.notes}</p></div>}
            </div>
            <footer className="flex justify-end gap-2 border-t bg-gray-50 px-5 py-3">
              {hasPermission("payment:edit") && <button type="button" disabled={viewingPayment.isDeposited} onClick={() => { const selected = viewingPayment; setViewingPayment(null); openEdit(selected); }} className="rounded border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400">Edit</button>}
              <button type="button" onClick={() => setViewingPayment(null)} className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Tutup</button>
            </footer>
          </section>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
          <form
            onSubmit={save}
            className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white"
          >
            <header className="sticky top-0 z-10 flex justify-between border-b bg-white p-4">
              <b className="flex items-center gap-2">
                <Banknote />
                {editingPayment ? `Edit ${editingPayment.paymentNumber}` : "Pembayaran Pelanggan"}
              </b>
              <button type="button" onClick={closeForm}>
                <X />
              </button>
            </header>
            <div className="space-y-4 p-5">
              {!editingPayment && (
                <label className="block text-sm">
                  Cari Faktur
                  <input
                    value={invoiceSearch}
                    onChange={(e) => setInvoiceSearch(e.target.value)}
                    placeholder="Nomor faktur, pelanggan, HP, atau kendaraan"
                    className="mt-1 w-full rounded-lg border p-2.5"
                  />
                </label>
              )}
              <label className="block text-sm">
                Faktur
                <select
                  required
                  disabled={!!editingPayment}
                  value={form.invoiceId}
                  onChange={(e) => {
                    const selected = data.invoices.find(
                      (x) => x.id === e.target.value,
                    );
                    setForm({
                      ...form,
                      invoiceId: e.target.value,
                      amount: selected ? selected.total - selected.payment : 0,
                      accountId: "",
                    });
                  }}
                  className="mt-1 w-full rounded-lg border p-2.5 disabled:bg-gray-100"
                >
                  <option value="">
                    Pilih faktur ({invoiceChoices.length})
                  </option>
                  {(editingPayment && invoice ? [invoice] : invoiceChoices).map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.invoiceNumber} · {i.customerName} ·{" "}
                      {rupiah(i.total - i.payment)}
                    </option>
                  ))}
                </select>
              </label>
              {invoice && (
                <div className="grid grid-cols-3 rounded-lg bg-blue-50 p-3 text-sm">
                  <span>
                    Total
                    <br />
                    <b>{rupiah(invoice.total)}</b>
                  </span>
                  <span>
                    Dibayar
                    <br />
                    <b>{rupiah(editingPayment ? Math.max(0, invoice.payment - editingPayment.amount) : invoice.payment)}</b>
                  </span>
                  <span>
                    Sisa
                    <br />
                    <b className="text-red-600">{rupiah(editingPayment ? maximumEditableAmount : outstanding)}</b>
                  </span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  Tanggal
                  <IndonesianDateInput min={invoice?.date} max={today} value={form.date} onChange={date=>setForm({...form,date})} className="mt-1 h-11 w-full"/>
                </label>
                <label className="text-sm">
                  Metode
                  <select
                    value={form.paymentMethod}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        paymentMethod: e.target.value,
                        accountId: "",
                      })
                    }
                    className="mt-1 w-full rounded-lg border p-2.5"
                  >
                    <option>Tunai</option>
                    <option>Transfer</option>
                  </select>
                </label>
              </div>
              <label className="block text-sm">
                Diterima ke
                <select
                  value={form.accountId}
                  onChange={(e) =>
                    setForm({ ...form, accountId: e.target.value })
                  }
                  className="mt-1 w-full rounded-lg border p-2.5"
                >
                  <option value="">Otomatis sesuai pengaturan cabang</option>
                  {availableAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <small className="text-gray-500">
                  Pilihan akun otomatis mengikuti metode pembayaran.
                </small>
              </label>
              <label className="block text-sm">
                Nominal
                <input
                  type="number"
                  min="1"
                  max={editingPayment ? maximumEditableAmount : outstanding}
                  value={form.amount || ""}
                  onChange={(e) =>
                    setForm({ ...form, amount: Number(e.target.value) })
                  }
                  className="mt-1 w-full rounded-lg border p-2.5 text-lg font-bold"
                />
              </label>
              <label className="block text-sm">
                Catatan (opsional)
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="mt-1 w-full rounded-lg border p-2.5"
                />
              </label>
              {editingPayment && (
                <label className="block text-sm font-medium text-amber-800">
                  Alasan Perubahan *
                  <textarea
                    required
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    placeholder="Contoh: salah pilih metode pembayaran"
                    className="mt-1 w-full rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-gray-900"
                  />
                  <small className="font-normal">Perubahan sebelum dan sesudah disimpan ke audit.</small>
                </label>
              )}
            </div>
            <footer className="sticky bottom-0 flex justify-end gap-2 border-t bg-white p-4">
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg border px-4 py-2"
              >
                Batal
              </button>
              <button className="rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white">
                {editingPayment ? "Simpan Perubahan" : "Simpan Pembayaran"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}
