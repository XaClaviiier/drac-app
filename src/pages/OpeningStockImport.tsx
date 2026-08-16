import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  FileSpreadsheet,
  Filter,
  Info,
  List,
  Lightbulb,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Settings,
  Send,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { api } from "../lib/apiClient";
import { localDateKey } from "../lib/date";

type PreviewRow = {
  row: number;
  code: string;
  itemName: string;
  itemId: string;
  warehouse: string;
  warehouseId: string;
  quantity: number;
  unit: string;
  error: string;
};
type AdjustmentDocument = {
  id: string;
  adjustmentNumber: string;
  adjustmentType: string;
  date: string;
  status: "Draft" | "Posted" | "Cancelled";
  itemCount: number;
  totalQuantity: number;
  cancellationReason?: string;
};
type AdjustmentDetail = AdjustmentDocument & {
  rows: Array<{
    id: string;
    itemCode: string;
    itemName: string;
    warehouseName: string;
    quantity: number;
    unit: string;
  }>;
};

const parseCsv = (text: string) =>
  text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      const cells: string[] = [];
      let value = "";
      let quoted = false;
      for (let index = 0; index < line.length; index++) {
        const char = line[index];
        if (char === '"') {
          if (quoted && line[index + 1] === '"') {
            value += '"';
            index++;
          } else quoted = !quoted;
        } else if (char === "," && !quoted) {
          cells.push(value.trim());
          value = "";
        } else value += char;
      }
      cells.push(value.trim());
      return cells;
    });

export default function OpeningStockImport() {
  const { data, refreshData, currentUser, currentBranchId } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [date, setDate] = useState(localDateKey());
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [documents, setDocuments] = useState<AdjustmentDocument[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "entry">("list");
  const [documentSearch, setDocumentSearch] = useState("");
  const [documentDate, setDocumentDate] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [editingId, setEditingId] = useState("");
  const [selectedDocument, setSelectedDocument] =
    useState<AdjustmentDetail | null>(null);
  const [detailTabs, setDetailTabs] = useState<AdjustmentDetail[]>([]);
  const isAdmin =
    Boolean(currentUser?.isOwner) ||
    String(currentUser?.roleName || "")
      .toLowerCase()
      .includes("admin");
  const validRows = rows.filter((row) => !row.error && row.quantity !== 0);
  const errorRows = rows.filter((row) => row.error);
  const duplicateKeys = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((row) => {
      const key = `${row.itemId}|${row.warehouseId}`;
      if (row.itemId && row.warehouseId)
        counts.set(key, (counts.get(key) || 0) + 1);
    });
    return new Set(
      [...counts].filter(([, count]) => count > 1).map(([key]) => key),
    );
  }, [rows]);
  const defaultWarehouse = data.warehouses.find(
    (warehouse) =>
      warehouse.isActive &&
      !warehouse.isSystem &&
      (currentBranchId === "ALL" || warehouse.branchId === currentBranchId),
  );
  const itemSuggestions = itemSearch.trim().length
    ? data.items
        .filter(
          (item) =>
            item.type === "Persediaan" &&
            item.isActive &&
            `${item.code} ${item.name}`
              .toLowerCase()
              .includes(itemSearch.toLowerCase()),
        )
        .slice(0, 12)
    : [];
  const addManualItem = (item: (typeof data.items)[number]) => {
    if (!defaultWarehouse)
      return setMessage("Gudang aktif belum tersedia untuk cabang ini.");
    if (
      rows.some(
        (row) =>
          row.itemId === item.id && row.warehouseId === defaultWarehouse.id,
      )
    )
      return setMessage(`${item.code} sudah ada dalam rincian.`);
    setRows((current) => [
      ...current,
      {
        row: current.length + 1,
        code: item.code,
        itemName: item.name,
        itemId: item.id,
        warehouse: defaultWarehouse.name,
        warehouseId: defaultWarehouse.id,
        quantity: 1,
        unit: item.unit,
        error: "",
      },
    ]);
    setItemSearch("");
    setMessage("");
  };

  const loadDocuments = async () => {
    const response = await api.get<AdjustmentDocument[]>("stock-adjustments");
    if (response.success) setDocuments(response.data || []);
  };
  useEffect(() => {
    if (isAdmin) void loadDocuments();
  }, [isAdmin]);

  const downloadTemplate = () => {
    const sampleWarehouse = data.warehouses.find(
      (warehouse) => warehouse.isActive && !warehouse.isSystem,
    );
    const content = `Kode Barang,Nama Barang,Gudang,Qty Awal,Harga Pokok,Tanggal\r\nCONTOH-001,NAMA BARANG,${sampleWarehouse?.name || "GUDANG UTAMA"},10,0,${date}`;
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "template_saldo_awal_stok.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const loadFile = async (file?: File) => {
    if (!file) return;
    setMessage("");
    setFileName(file.name);
    setRows([]);
    try {
      let matrix: any[][];
      if (/\.xlsx?$/i.test(file.name)) {
        const { default: readXlsxFile } = await import("read-excel-file");
        matrix = await readXlsxFile(file);
      } else matrix = parseCsv(await file.text());
      if (matrix.length < 2) throw new Error("File tidak memiliki data.");
      const headers = matrix[0].map((value) =>
        String(value || "")
          .toLowerCase()
          .replace(/[_#]+/g, " ")
          .trim(),
      );
      const column = (...names: string[]) =>
        headers.findIndex((header) =>
          names.some((name) => header === name || header.includes(name)),
        );
      const codeIndex = column("kode barang", "kode", "sku");
      const warehouseIndex = column("gudang", "warehouse");
      const quantityIndex = column("qty awal", "kuantitas", "qty", "stok");
      if (codeIndex < 0 || warehouseIndex < 0 || quantityIndex < 0)
        throw new Error("Kolom wajib: Kode Barang, Gudang, dan Qty Awal.");
      const itemsByCode = new Map(
        data.items
          .filter((item) => item.type === "Persediaan" && item.isActive)
          .map((item) => [item.code.trim().toLowerCase(), item]),
      );
      const warehousesByName = new Map<
        string,
        (typeof data.warehouses)[number]
      >();
      data.warehouses
        .filter((warehouse) => warehouse.isActive && !warehouse.isSystem)
        .forEach((warehouse) => {
          warehousesByName.set(warehouse.name.trim().toLowerCase(), warehouse);
          warehousesByName.set(warehouse.code.trim().toLowerCase(), warehouse);
        });
      const preview = matrix
        .slice(1)
        .filter((row) => row.some((value) => String(value || "").trim()))
        .map((source, index) => {
          const code = String(source[codeIndex] || "").trim();
          const warehouseText = String(source[warehouseIndex] || "").trim();
          const quantity =
            Number(
              String(source[quantityIndex] || "0").replace(/[^0-9-]/g, ""),
            ) || 0;
          const item = itemsByCode.get(code.toLowerCase());
          const warehouse = warehousesByName.get(warehouseText.toLowerCase());
          const errors: string[] = [];
          if (!item)
            errors.push("Kode barang tidak ditemukan/bukan persediaan aktif");
          if (!warehouse)
            errors.push("Gudang tidak ditemukan/tidak dapat diakses");
          if (!quantity) errors.push("Qty awal harus selain 0");
          return {
            row: index + 2,
            code,
            itemName: item?.name || "",
            itemId: item?.id || "",
            warehouse: warehouse?.name || warehouseText,
            warehouseId: warehouse?.id || "",
            quantity,
            unit: item?.unit || "",
            error: errors.join("; "),
          };
        });
      const counts = new Map<string, number>();
      preview.forEach((row) => {
        const key = `${row.itemId}|${row.warehouseId}`;
        if (row.itemId && row.warehouseId)
          counts.set(key, (counts.get(key) || 0) + 1);
      });
      setRows(
        preview.map((row) =>
          counts.get(`${row.itemId}|${row.warehouseId}`)! > 1
            ? {
                ...row,
                error: [row.error, "Barang dan gudang terduplikasi dalam file"]
                  .filter(Boolean)
                  .join("; "),
              }
            : row,
        ),
      );
    } catch (error: any) {
      setMessage(error?.message || "File tidak dapat dibaca.");
    }
  };

  const submit = async (postImmediately: boolean) => {
    if (!isAdmin || !validRows.length || errorRows.length || duplicateKeys.size)
      return;
    setLoading(true);
    setMessage("");
    try {
      const normalized =
        validRows
          .map((row) => `${row.itemId}|${row.warehouseId}|${row.quantity}`)
          .sort()
          .join(";") + `|${date}`;
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(normalized),
      );
      const batchKey = [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 24)
        .toUpperCase();
      const payload = {
        date,
        batchKey,
        rows: validRows.map((row) => ({
          itemId: row.itemId,
          warehouseId: row.warehouseId,
          quantity: row.quantity,
        })),
      };
      const response = editingId
        ? await api.update("stock-adjustments", editingId, {
            ...payload,
            action: "save",
          })
        : await api.create("stock-adjustments", payload);
      if (!response.success)
        throw new Error(response.message || response.error || "Import gagal.");
      const documentId = editingId || response.data.id;
      const displayNumber = editingId
        ? documents.find((document) => document.id === editingId)
            ?.adjustmentNumber
        : response.data.adjustmentNumber;
      if (postImmediately) {
        const posted = await api.update("stock-adjustments", documentId, {
          action: "post",
        });
        if (!posted.success)
          throw new Error(
            posted.message || "Draft tersimpan, tetapi gagal diposting.",
          );
        await refreshData();
      }
      await loadDocuments();
      setMessage(
        `${displayNumber || "Dokumen"} berhasil ${postImmediately ? "diposting" : "disimpan sebagai Draft"}.`,
      );
      setRows([]);
      setFileName("");
      setEditingId("");
      setViewMode("list");
      if (inputRef.current) inputRef.current.value = "";
    } catch (error: any) {
      setMessage(error?.message || "Import saldo awal gagal.");
    } finally {
      setLoading(false);
    }
  };

  const editDocument = async (document: AdjustmentDocument) => {
    setLoading(true);
    setMessage("");
    try {
      const response = await api.get<any>(`stock-adjustments/${document.id}`);
      if (!response.success)
        throw new Error(response.message || "Draft tidak dapat dibuka.");
      setEditingId(document.id);
      setDate(response.data.date);
      setFileName(`Draft ${document.adjustmentNumber}`);
      setRows(
        (response.data.rows || []).map((row: any, index: number) => ({
          row: index + 1,
          code: row.itemCode,
          itemName: row.itemName,
          itemId: row.itemId,
          warehouse: row.warehouseName,
          warehouseId: row.warehouseId,
          quantity: Number(row.quantity),
          unit: row.unit,
          error: "",
        })),
      );
      setViewMode("entry");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error: any) {
      setMessage(error?.message || "Draft tidak dapat dibuka.");
    } finally {
      setLoading(false);
    }
  };

  const viewDocument = async (document: AdjustmentDocument) => {
    setLoading(true);
    setMessage("");
    try {
      const response = await api.get<AdjustmentDetail>(
        `stock-adjustments/${document.id}`,
      );
      if (!response.success)
        throw new Error(response.message || "Rincian tidak dapat dibuka.");
      const detail = { ...document, ...response.data } as AdjustmentDetail;
      setDetailTabs((current) => {
        const found = current.some((tab) => tab.id === detail.id);
        return found
          ? current.map((tab) => (tab.id === detail.id ? detail : tab))
          : [...current, detail];
      });
      setSelectedDocument(detail);
      setViewMode("list");
    } catch (error: any) {
      setMessage(error?.message || "Rincian penyesuaian tidak dapat dibuka.");
    } finally {
      setLoading(false);
    }
  };

  const closeDetailTab = (documentId: string) => {
    setDetailTabs((current) => {
      const remaining = current.filter((tab) => tab.id !== documentId);
      if (selectedDocument?.id === documentId)
        setSelectedDocument(remaining[remaining.length - 1] || null);
      return remaining;
    });
  };

  const processDocument = async (
    document: AdjustmentDocument,
    action: "post" | "cancel" | "delete",
  ) => {
    let reason = "";
    if (action === "cancel") {
      reason =
        window
          .prompt(`Alasan pembatalan ${document.adjustmentNumber}:`)
          ?.trim() || "";
      if (!reason) return;
    }
    if (
      action === "delete" &&
      !window.confirm(`Hapus Draft ${document.adjustmentNumber}?`)
    )
      return;
    setLoading(true);
    setMessage("");
    try {
      const response =
        action === "delete"
          ? await api.remove("stock-adjustments", document.id)
          : await api.update("stock-adjustments", document.id, {
              action,
              reason,
            });
      if (!response.success)
        throw new Error(response.message || "Proses gagal.");
      await Promise.all([loadDocuments(), refreshData()]);
      setMessage(response.message || "Penyesuaian stok diperbarui.");
    } catch (error: any) {
      setMessage(error?.message || "Proses penyesuaian stok gagal.");
    } finally {
      setLoading(false);
    }
  };

  const filteredDocuments = documents.filter((document) => {
    const query = documentSearch.trim().toLowerCase();
    return (
      (!documentDate || document.date >= documentDate) &&
      (!query ||
        `${document.adjustmentNumber} ${document.adjustmentType} ${document.status}`
          .toLowerCase()
          .includes(query))
    );
  });

  return (
    <div className="space-y-0 bg-[#eeeeee]">
      <div className="flex min-h-12 items-end gap-1 border-b border-slate-400 bg-[#eeeeee] px-1 pt-1">
        <button
          type="button"
          onClick={() => {
            setSelectedDocument(null);
            setViewMode("list");
          }}
          className={`flex h-11 w-16 items-center justify-center rounded-t-md border border-b-0 ${!selectedDocument && viewMode === "list" ? "border-slate-400 bg-white text-slate-800" : "border-green-600 bg-[#58c915] text-white"}`}
          title="Daftar Penyesuaian Stok"
        >
          <List className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => {
            setSelectedDocument(null);
            setViewMode("entry");
          }}
          className={`flex h-11 min-w-44 items-center justify-between rounded-t-md border border-b-0 px-4 text-sm font-semibold ${!selectedDocument && viewMode === "entry" ? "border-t-2 border-blue-600 bg-white text-slate-800" : "border-slate-400 bg-[#d0d0d0] text-slate-600"}`}
        >
          <span>
            {editingId
              ? documents.find((document) => document.id === editingId)
                  ?.adjustmentNumber || "Data Baru"
              : "Data Baru"}
          </span>
          <X
            className="h-4 w-4"
            onClick={(event) => {
              event.stopPropagation();
              setViewMode("list");
            }}
          />
        </button>
        {detailTabs.map((tab) => {
          const active = selectedDocument?.id === tab.id;
          return (
            <div
              key={tab.id}
              className={`flex h-10 min-w-56 max-w-80 items-center rounded-t-md border border-b-0 ${active ? "border-blue-600 bg-white text-blue-700 shadow-[inset_0_3px_0_#2563eb]" : "border-slate-300 bg-[#d0d0d0] text-slate-700"}`}
            >
              <button
                type="button"
                onClick={() => setSelectedDocument(tab)}
                className="min-w-0 flex-1 truncate px-4 text-left text-sm font-semibold"
              >
                {tab.adjustmentNumber}
              </button>
              <button
                type="button"
                onClick={() => closeDetailTab(tab.id)}
                className="mr-1 rounded p-1.5 hover:bg-slate-100"
                title="Tutup tab"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
        <div className="ml-auto flex h-11 items-center gap-2 pr-2">
          <button
            type="button"
            className="flex h-10 w-12 items-center justify-center rounded border border-blue-600 bg-white text-blue-800"
            title="Pengaturan"
          >
            <Settings className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="flex h-10 w-12 items-center justify-center rounded bg-amber-500 text-white"
            title="Panduan"
          >
            <Lightbulb className="h-5 w-5" />
          </button>
        </div>
      </div>
      {!selectedDocument && (
        <>
          <div className="hidden rounded-t-lg border border-slate-300 bg-[#eeeeee] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Penyesuaian Stok
                </h2>
                <p className="text-sm text-slate-600">
                  Saldo awal disimpan sebagai dokumen. Draft belum mengubah
                  stok; Posting mencatat mutasi dan Pembatalan membuat pembalik.
                </p>
              </div>
              <button
                onClick={downloadTemplate}
                className="flex h-10 items-center gap-2 rounded border border-blue-600 bg-white px-4 text-sm font-semibold text-blue-700"
              >
                <Download className="h-4 w-4" />
                Unduh Template
              </button>
            </div>
          </div>
          {!isAdmin && viewMode === "entry" && (
            <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
              <AlertTriangle className="mr-2 inline h-4 w-4" />
              Import hanya dapat dilakukan Owner atau Administrator.
            </div>
          )}
          {viewMode === "entry" && (
            <div className="relative grid gap-x-12 gap-y-3 border-b border-slate-300 bg-[#eeeeee] px-16 py-5 pr-44 md:grid-cols-2">
              <label className="text-sm">
                Tanggal <span className="text-red-600">*</span>
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="mt-1 h-10 w-full rounded border border-slate-300 px-3"
                />
              </label>
              <label className="text-sm md:row-start-2">
                File CSV/Excel
                <div className="mt-1 flex h-10 items-center rounded border border-slate-300 bg-white">
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="flex h-full items-center gap-2 border-r border-slate-300 px-4 text-blue-700"
                  >
                    <Upload className="h-4 w-4" />
                    {editingId ? "Ganti File" : "Pilih File"}
                  </button>
                  <span className="truncate px-3 text-slate-500">
                    {fileName || "Belum ada file"}
                  </span>
                  {fileName && (
                    <button
                      onClick={() => {
                        setRows([]);
                        setFileName("");
                        setEditingId("");
                      }}
                      className="ml-auto px-3"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(event) => loadFile(event.target.files?.[0])}
                  className="hidden"
                />
              </label>
              <div className="absolute right-5 top-5 flex w-24 flex-col items-stretch gap-2">
                <div className="text-center text-xs text-slate-500">
                  No Penyesuaian #
                  <b className="block font-mono text-blue-700">
                    {editingId
                      ? documents.find((document) => document.id === editingId)
                          ?.adjustmentNumber
                      : "OTOMATIS"}
                  </b>
                </div>
                <button
                  disabled={
                    !isAdmin ||
                    loading ||
                    !validRows.length ||
                    !!errorRows.length
                  }
                  onClick={() => submit(false)}
                  title="Simpan Draft"
                  className="flex h-16 items-center justify-center rounded border border-blue-700 bg-blue-700 text-white shadow disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-400"
                >
                  <Save className="h-8 w-8" />
                </button>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  title="Dokumen / Unduh Template"
                  className="flex h-14 items-center justify-center rounded border border-blue-500 bg-blue-200 text-[#00518b]"
                >
                  <FileText className="h-7 w-7" />
                </button>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  title="Lampiran File"
                  className="flex h-14 items-center justify-center rounded border border-blue-500 bg-blue-200 text-[#00518b]"
                >
                  <Paperclip className="h-7 w-7" />
                </button>
                <button
                  disabled={
                    !isAdmin ||
                    loading ||
                    !validRows.length ||
                    !!errorRows.length
                  }
                  onClick={() => submit(true)}
                  title="Simpan dan Posting"
                  className="flex h-14 items-center justify-center rounded border border-green-600 bg-green-300 text-green-800 disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-400"
                >
                  <MoreHorizontal className="h-7 w-7" />
                </button>
              </div>
            </div>
          )}
          {message && (
            <div
              className={`rounded border p-3 text-sm ${message.includes("berhasil") ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-red-300 bg-red-50 text-red-700"}`}
            >
              {message}
            </div>
          )}
          {viewMode === "entry" && (
            <>
              <div className="mx-3 mt-3 min-h-[460px] overflow-hidden rounded-t-lg border border-slate-300 bg-white shadow-sm">
                <div className="flex items-center gap-3 border-b border-slate-300 px-4 py-3">
                  <FileText className="h-6 w-6 text-pink-500" />
                  <div className="relative w-[505px] max-w-[42vw]">
                    <input
                      value={itemSearch}
                      onChange={(event) => setItemSearch(event.target.value)}
                      placeholder="Cari/Pilih Barang & Jasa..."
                      className="h-10 w-full rounded border border-slate-300 bg-white px-3 pr-10 text-sm outline-none focus:border-blue-500"
                    />
                    <Search className="absolute right-3 top-2.5 h-5 w-5 text-slate-900" />
                    {itemSuggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-11 z-30 max-h-72 overflow-auto rounded border border-slate-300 bg-white shadow-xl">
                        {itemSuggestions.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => addManualItem(item)}
                            className="grid w-full grid-cols-[130px_1fr_auto] gap-2 border-b px-3 py-2 text-left text-sm hover:bg-blue-50"
                          >
                            <b className="font-mono text-blue-700">
                              {item.code}
                            </b>
                            <span className="truncate">{item.name}</span>
                            <span>{item.unit}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="rounded border border-blue-600 bg-white px-4 py-2 text-blue-700"
                  >
                    Rincian
                  </button>
                  <div className="ml-auto flex items-center gap-3">
                    <button className="flex h-10 w-12 items-center justify-center rounded border border-slate-300">
                      <Search className="h-5 w-5" />
                    </button>
                    <b className="text-2xl font-medium">
                      Rincian Barang <span className="text-red-600">*</span>
                    </b>
                  </div>
                </div>
                {rows.length > 0 ? (
                  <div className="overflow-hidden rounded-t-lg border border-slate-300 bg-white">
                    <div className="flex items-center justify-between bg-[#eeeeee] px-4 py-3 text-sm">
                      <span>
                        Pratinjau: <b>{rows.length}</b> baris · Valid{" "}
                        <b className="text-emerald-700">{validRows.length}</b> ·
                        Bermasalah{" "}
                        <b className="text-red-700">{errorRows.length}</b>
                      </span>
                      {!errorRows.length && (
                        <span className="text-emerald-700">
                          <CheckCircle2 className="mr-1 inline h-4 w-4" />
                          Siap disimpan
                        </span>
                      )}
                    </div>
                    <div className="max-h-72 overflow-auto">
                      <table className="min-w-[1000px] w-full text-[13px]">
                        <thead className="sticky top-0 bg-[#637c93] text-left text-white">
                          <tr>
                            <th className="px-3 py-2.5">Baris</th>
                            <th className="px-3 py-2.5">Kode Barang</th>
                            <th className="px-3 py-2.5">Nama Barang</th>
                            <th className="px-3 py-2.5">Gudang</th>
                            <th className="px-3 py-2.5 text-right">Qty Awal</th>
                            <th className="px-3 py-2.5">Satuan</th>
                            <th className="px-3 py-2.5">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, index) => (
                            <tr
                              key={`${row.row}-${index}`}
                              className={`border-b ${row.error ? "bg-red-50" : index % 2 ? "bg-slate-50" : "bg-white"}`}
                            >
                              <td className="px-3 py-2">{row.row}</td>
                              <td className="px-3 py-2 font-medium text-blue-700">
                                {row.code}
                              </td>
                              <td className="px-3 py-2">
                                {row.itemName || "—"}
                              </td>
                              <td className="px-3 py-2">{row.warehouse}</td>
                              <td className="px-3 py-2 text-right font-semibold">
                                <input
                                  type="number"
                                  value={row.quantity}
                                  onChange={(event) =>
                                    setRows((current) =>
                                      current.map((entry, rowIndex) =>
                                        rowIndex === index
                                          ? {
                                              ...entry,
                                              quantity:
                                                Number(event.target.value) || 0,
                                              error: Number(event.target.value)
                                                ? entry.error.replace(
                                                    /;?\s*Qty awal harus selain 0/g,
                                                    "",
                                                  )
                                                : "Qty awal harus selain 0",
                                            }
                                          : entry,
                                      ),
                                    )
                                  }
                                  className="h-8 w-24 rounded border border-slate-300 bg-white px-2 text-right"
                                />
                              </td>
                              <td className="px-3 py-2">{row.unit}</td>
                              <td
                                className={`px-3 py-2 ${row.error ? "text-red-700" : "text-emerald-700"}`}
                              >
                                {row.error || "Valid"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="grid grid-cols-[180px_minmax(360px,1fr)_100px_180px_120px] rounded-t-lg bg-[#637c93] px-3 py-3 text-center text-sm text-white">
                      <span>Kode #</span>
                      <span>Nama Barang</span>
                      <span>Kuantitas</span>
                      <span>Tipe</span>
                      <span>Satuan</span>
                    </div>
                    <div className="py-6 text-center text-lg">
                      Belum ada data
                    </div>
                  </div>
                )}
              </div>
              <div className="ml-auto mr-3 mt-3 w-60 rounded border border-slate-300 bg-white px-5 py-4 text-right shadow-sm">
                <span className="block text-left text-lg">Total Kuantitas</span>
                <b className="text-2xl">
                  {validRows
                    .reduce((total, row) => total + row.quantity, 0)
                    .toLocaleString("id-ID")}
                </b>
              </div>
            </>
          )}
          {viewMode === "list" && (
            <div className="min-h-[calc(100vh-235px)] border border-slate-300 bg-[#eeeeee] p-4">
              <div className="mb-4 flex items-center gap-3">
                <label className="flex h-11 items-center gap-2 rounded border border-slate-300 bg-white px-3 text-sm">
                  Tanggal:
                  <input
                    type="date"
                    value={documentDate}
                    onChange={(event) => setDocumentDate(event.target.value)}
                    className="bg-transparent outline-none"
                  />
                </label>
                <button className="flex h-11 w-14 items-center justify-center rounded border border-blue-600 bg-blue-50 text-blue-700">
                  <Filter className="h-5 w-5" />
                </button>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => window.print()}
                    className="flex h-11 w-14 items-center justify-center rounded border border-blue-600 bg-white text-blue-700"
                  >
                    <Printer className="h-5 w-5" />
                  </button>
                  <button className="flex h-11 w-14 items-center justify-center rounded border border-blue-600 bg-white text-blue-700">
                    <Settings className="h-5 w-5" />
                  </button>
                  <label className="relative w-80">
                    <input
                      value={documentSearch}
                      onChange={(event) =>
                        setDocumentSearch(event.target.value)
                      }
                      placeholder="Ketik dan [Enter]"
                      className="h-11 w-full rounded border border-slate-300 bg-white px-3 pr-10"
                    />
                    <Search className="absolute right-3 top-3 h-5 w-5" />
                  </label>
                  <span className="flex h-11 min-w-20 items-center justify-center rounded border border-slate-300 bg-white">
                    {filteredDocuments.length}
                  </span>
                </div>
              </div>
              <div className="mb-4 flex gap-2">
                <button
                  onClick={() => setViewMode("entry")}
                  className="flex h-12 w-20 items-center justify-center rounded bg-blue-800 text-white"
                >
                  <Plus className="h-7 w-7" />
                </button>
                <button
                  onClick={() => loadDocuments()}
                  className="flex h-12 w-14 items-center justify-center rounded border border-blue-600 bg-white text-blue-700"
                >
                  <RefreshCw className="h-5 w-5" />
                </button>
              </div>
              <div className="overflow-hidden rounded-t-lg border border-slate-300 bg-white">
                <table className="w-full text-[13px]">
                  <thead className="bg-[#637c93] text-left text-white">
                    <tr>
                      <th className="px-3 py-2.5">Nomor</th>
                      <th className="px-3 py-2.5">Tanggal</th>
                      <th className="px-3 py-2.5">Keterangan</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDocuments.map((document, index) => (
                      <tr
                        key={document.id}
                        className={`border-b ${index % 2 ? "bg-slate-50" : "bg-white"}`}
                      >
                        <td className="px-3 py-2 font-medium">
                          <button
                            type="button"
                            onClick={() => viewDocument(document)}
                            className="text-blue-700 underline-offset-2 hover:underline"
                            title="Buka rincian penyesuaian"
                          >
                            {document.adjustmentNumber}
                          </button>
                        </td>
                        <td className="px-3 py-2">{document.date}</td>
                        <td className="px-3 py-2">
                          {document.adjustmentType || "PENYESUAIAN PERSEDIAAN"}{" "}
                          · {document.itemCount} barang (
                          {document.totalQuantity})
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded-full px-2 py-1 ${document.status === "Draft" ? "bg-amber-100 text-amber-800" : document.status === "Posted" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}
                          >
                            {document.status === "Posted"
                              ? "Diposting"
                              : document.status === "Cancelled"
                                ? "Dibatalkan"
                                : "Draft"}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-2">
                            <button
                              title="Lihat Rincian"
                              onClick={() => viewDocument(document)}
                              className="text-slate-600"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            {document.status === "Draft" && (
                              <>
                                <button
                                  title="Edit Draft"
                                  onClick={() => editDocument(document)}
                                  className="text-blue-700"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  title="Posting"
                                  onClick={() =>
                                    processDocument(document, "post")
                                  }
                                  className="text-emerald-700"
                                >
                                  <Send className="h-4 w-4" />
                                </button>
                                <button
                                  title="Hapus Draft"
                                  onClick={() =>
                                    processDocument(document, "delete")
                                  }
                                  className="text-red-600"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </>
                            )}
                            {document.status === "Posted" && (
                              <button
                                title="Batalkan dan balik stok"
                                onClick={() =>
                                  processDocument(document, "cancel")
                                }
                                className="text-amber-700"
                              >
                                <Undo2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!documents.length && (
                  <div className="py-12 text-center text-slate-400">
                    <FileSpreadsheet className="mx-auto mb-2 h-9 w-9" />
                    Belum ada penyesuaian stok.
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
      {selectedDocument && (
        <div className="px-1 pb-3">
          <div className="flex min-h-[calc(100vh-245px)] w-full flex-col overflow-hidden rounded-b border border-slate-300 bg-white shadow-sm">
            <div className="flex items-center justify-between bg-[#123968] px-5 py-4 text-white">
              <div>
                <div className="text-xs text-blue-100">
                  RINCIAN PENYESUAIAN STOK
                </div>
                <h3 className="text-lg font-semibold">
                  {selectedDocument.adjustmentNumber}
                </h3>
              </div>
              <button
                onClick={() => closeDetailTab(selectedDocument.id)}
                className="rounded p-1 hover:bg-white/10"
                title="Tutup"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid gap-3 border-b bg-[#eeeeee] px-5 py-4 text-sm sm:grid-cols-3">
              <div>
                <span className="block text-xs text-slate-500">Tanggal</span>
                <b>{selectedDocument.date}</b>
              </div>
              <div>
                <span className="block text-xs text-slate-500">Jenis</span>
                <b>Saldo Awal</b>
              </div>
              <div>
                <span className="block text-xs text-slate-500">Status</span>
                <b
                  className={
                    selectedDocument.status === "Posted"
                      ? "text-emerald-700"
                      : selectedDocument.status === "Cancelled"
                        ? "text-slate-600"
                        : "text-amber-700"
                  }
                >
                  {selectedDocument.status === "Posted"
                    ? "Diposting"
                    : selectedDocument.status === "Cancelled"
                      ? "Dibatalkan"
                      : "Draft"}
                </b>
              </div>
              {selectedDocument.cancellationReason && (
                <div className="sm:col-span-3">
                  <span className="block text-xs text-slate-500">
                    Alasan Pembatalan
                  </span>
                  <b className="text-red-700">
                    {selectedDocument.cancellationReason}
                  </b>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-auto p-5">
              <table className="w-full min-w-[760px] overflow-hidden rounded-t-lg border border-slate-300 text-[13px]">
                <thead className="bg-[#637c93] text-left text-white">
                  <tr>
                    <th className="px-3 py-2.5">Kode Barang</th>
                    <th className="px-3 py-2.5">Nama Barang</th>
                    <th className="px-3 py-2.5">Gudang</th>
                    <th className="px-3 py-2.5 text-right">Qty</th>
                    <th className="px-3 py-2.5">Satuan</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedDocument.rows.map((row, index) => (
                    <tr
                      key={row.id}
                      className={`border-b ${index % 2 ? "bg-slate-50" : "bg-white"}`}
                    >
                      <td className="px-3 py-2 font-medium text-blue-700">
                        {row.itemCode}
                      </td>
                      <td className="px-3 py-2">{row.itemName}</td>
                      <td className="px-3 py-2">{row.warehouseName}</td>
                      <td className="px-3 py-2 text-right font-semibold">
                        {row.quantity}
                      </td>
                      <td className="px-3 py-2">{row.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 border-t bg-[#eeeeee] px-5 py-3">
              {selectedDocument.status === "Posted" && (
                <button
                  onClick={async () => {
                    closeDetailTab(selectedDocument.id);
                    await processDocument(selectedDocument, "cancel");
                  }}
                  className="rounded border border-amber-500 bg-white px-4 py-2 text-sm font-semibold text-amber-700"
                >
                  Batalkan Penyesuaian
                </button>
              )}
              <button
                onClick={() => closeDetailTab(selectedDocument.id)}
                className="rounded bg-blue-700 px-5 py-2 text-sm font-semibold text-white"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
