import { useEffect, useState } from "react";
import { Plus, RefreshCw, ShieldCheck, X } from "lucide-react";
import { api } from "../lib/apiClient";
import { localDateKey } from "../lib/date";
import { useApp } from "../context/AppContext";
type Summary = {
  branchId: string;
  branchName: string;
  accountId: string;
  accountName: string;
  cashReceived: number;
  deposited: number;
  unsubmitted: number;
};
type Deposit = {
  id: string;
  depositNumber: string;
  date: string;
  branchId: string;
  branchName: string;
  sourceName: string;
  destinationName: string;
  amount: number;
  status: string;
  createdByName?: string;
};
type Account = { id: string; name: string; accountType: string };
export default function BranchDeposits() {
  const { currentUser, currentBranchId } = useApp();
  const [summary, setSummary] = useState<Summary[]>([]),
    [rows, setRows] = useState<Deposit[]>([]),
    [accounts, setAccounts] = useState<Account[]>([]),
    [loading, setLoading] = useState(false),
    [show, setShow] = useState(false);
  const today = localDateKey();
  const [form, setForm] = useState({
    branchId: "",
    sourceAccountId: "",
    destinationAccountId: "",
    date: today,
    amount: 0,
    notes: "",
  });
  const load = async () => {
    setLoading(true);
    const [d, a] = await Promise.all([
      api.get("branch-deposits"),
      api.get("cash-accounts"),
    ]);
    if (d.success) {
      setSummary(d.data?.summary || []);
      setRows(d.data?.deposits || []);
    }
    if (a.success) setAccounts(a.data || []);
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, []);
  const visible = summary.filter(
    (s) => currentBranchId === "ALL" || s.branchId === currentBranchId,
  );
  const open = (s: Summary) => {
    setForm({
      branchId: s.branchId,
      sourceAccountId: s.accountId,
      destinationAccountId: "",
      date: today,
      amount: s.unsubmitted,
      notes: "",
    });
    setShow(true);
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await api.create("branch-deposits", {
      ...form,
      createdBy: currentUser?.id,
      createdByName: currentUser?.name,
    });
    if (!r.success) return window.alert(r.message);
    setShow(false);
    await load();
  };
  const verify = async (r: Deposit, status: string) => {
    const x = await api.update("branch-deposits", r.id, {
      status,
      verifiedBy: currentUser?.id,
      verifiedByName: currentUser?.name,
    });
    if (!x.success) return window.alert(x.message);
    await load();
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => void load()}
          className="rounded-lg border p-2.5 text-blue-700"
        >
          <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {visible.map((s) => (
          <div key={s.branchId} className="rounded-xl border bg-white p-4">
            <b>{s.branchName}</b>
            <div className="mt-3 grid grid-cols-2 text-sm">
              <span>
                Tunai diterima
                <br />
                <b>Rp {s.cashReceived.toLocaleString("id-ID")}</b>
              </span>
              <span>
                Sudah disetor
                <br />
                <b>Rp {s.deposited.toLocaleString("id-ID")}</b>
              </span>
            </div>
            <p className="mt-3 text-sm">Belum disetor</p>
            <p className="text-2xl font-bold text-red-600">
              Rp {s.unsubmitted.toLocaleString("id-ID")}
            </p>
            <button
              disabled={!s.unsubmitted}
              onClick={() => open(s)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 text-white disabled:bg-gray-300"
            >
              <Plus className="h-4 w-4" />
              Buat Setoran
            </button>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-blue-900 text-white">
            <tr>
              {[
                "Tanggal",
                "No Setoran",
                "Cabang",
                "Dari",
                "Tujuan",
                "Nominal",
                "Status",
                "Dibuat Oleh",
                "Aksi",
              ].map((x) => (
                <th className="px-3 py-3 text-left" key={x}>
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-3">{r.date}</td>
                <td className="px-3 font-semibold text-blue-700">
                  {r.depositNumber}
                </td>
                <td className="px-3">{r.branchName}</td>
                <td className="px-3">{r.sourceName}</td>
                <td className="px-3">{r.destinationName}</td>
                <td className="px-3 font-bold">
                  Rp {r.amount.toLocaleString("id-ID")}
                </td>
                <td className="px-3">{r.status}</td>
                <td className="px-3">{r.createdByName || "-"}</td>
                <td className="px-3">
                  {currentUser?.isOwner && r.status === "Dikirim" && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => void verify(r, "Terverifikasi")}
                        className="rounded bg-green-600 px-2 py-1 text-white"
                      >
                        Verifikasi
                      </button>
                      <button
                        onClick={() => void verify(r, "Ditolak")}
                        className="rounded bg-red-100 px-2 py-1 text-red-700"
                      >
                        Tolak
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <form onSubmit={save} className="w-full max-w-md rounded-xl bg-white">
            <header className="flex justify-between border-b p-4">
              <b>Buat Setoran Cabang</b>
              <button type="button" onClick={() => setShow(false)}>
                <X />
              </button>
            </header>
            <div className="space-y-3 p-5">
              <label className="block text-sm">
                Tanggal
                <input
                  type="date"
                  max={today}
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="mt-1 w-full rounded-lg border p-2.5"
                />
              </label>
              <label className="block text-sm">
                Tujuan
                <select
                  value={form.destinationAccountId}
                  onChange={(e) =>
                    setForm({ ...form, destinationAccountId: e.target.value })
                  }
                  className="mt-1 w-full rounded-lg border p-2.5"
                >
                  <option value="">Otomatis sesuai pengaturan cabang</option>
                  {accounts
                    .filter((a) => a.accountType !== "cash")
                    .map((a) => (
                      <option value={a.id} key={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block text-sm">
                Nominal
                <input
                  type="number"
                  min="1"
                  value={form.amount}
                  onChange={(e) =>
                    setForm({ ...form, amount: Number(e.target.value) })
                  }
                  className="mt-1 w-full rounded-lg border p-2.5 font-bold"
                />
              </label>
              <label className="block text-sm">
                Catatan
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="mt-1 w-full rounded-lg border p-2.5"
                />
              </label>
            </div>
            <footer className="flex justify-end gap-2 border-t p-4">
              <button
                type="button"
                onClick={() => setShow(false)}
                className="rounded border px-4 py-2"
              >
                Batal
              </button>
              <button className="flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-white">
                <ShieldCheck className="h-4 w-4" />
                Kirim Setoran
              </button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}
