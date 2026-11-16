import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ChevronDown,
  ArrowUpDown,
  Info,
  FileText,
  Filter,
  List,
  Lightbulb,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Settings,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { api } from "../lib/apiClient";
import { localDateKey } from "../lib/date";
import ItemSearchOption from "../components/ItemSearchOption";
import { childTabClass, ui } from "../components/ui/interfaceStandards";
import IndonesianDateInput from "../components/IndonesianDateInput";
import AccurateFormActionRail from "../components/AccurateFormActionRail";
import "./OpeningStockImport.css";

type PreviewRow = {
  unitCost?: number;
  unitCostBefore?: number | null;
  valueChange?: number | null;
  targetQuantity?: number | null;
  stockBefore?: number | null;
  lineNotes?: string;
  adjustmentMode?: "plus" | "minus" | "set";

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
  isStockOpnameLinked: boolean;
  itemCount: number;
  totalQuantity: number;
  valuationRevision?: number;
  valuationAccountId?: string;
  cancellationReason?: string;
  notes?: string;
};
type AdjustmentDetail = AdjustmentDocument & {
  valuationRevision?: number;
  valuationAccountId?: string;
  rows: Array<{
    unitCostBefore?: number | null;
    valueChange?: number | null;
    id: string;
    itemId: string;
    itemCode: string;
    itemName: string;
    warehouseName: string;
    warehouseId: string;
    quantity: number;
    unit: string;
  unitCost?: number;
  targetQuantity?: number | null;
  stockBefore?: number | null;
  lineNotes?: string;
  adjustmentMode?: "plus" | "minus" | "set";
  }>;
};

const canDeleteAdjustment = (document: AdjustmentDocument) =>
  ["Draft", "Posted", "Cancelled"].includes(document.status) && !document.isStockOpnameLinked && (document.adjustmentType !== "cost_adjustment" || document.status === "Draft");

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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedDocument = searchParams.get('view');
  const [documentsLoaded, setDocumentsLoaded] = useState(false);
  const { data, refreshData, currentUser, currentBranchId, hasPermission } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const listImportRef = useRef<HTMLInputElement>(null);
  const [date, setDate] = useState(localDateKey());
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [documents, setDocuments] = useState<AdjustmentDocument[]>([]);
  const [entryTabOpen, setEntryTabOpen] = useState(true);
  const [viewMode, setViewMode] = useState<"list" | "entry">("list");
  const [documentSearch, setDocumentSearch] = useState("");
  const [documentDate, setDocumentDate] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [editingId, setEditingId] = useState("");
  const [selectedDocument, setSelectedDocument] =
    useState<AdjustmentDetail | null>(null);
  const [detailTabs, setDetailTabs] = useState<AdjustmentDetail[]>([]);
  const [notes, setNotes] = useState("");
  const [formTab, setFormTab] = useState<"items" | "info">("items");
  const [menu, setMenu] = useState<"import" | "settings" | "details" | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [sortKey, setSortKey] = useState<"adjustmentNumber" | "date" | "notes">("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [rowDialog, setRowDialog] = useState<{ index: number; row: PreviewRow; readOnly: boolean } | null>(null);
  const [detailSearch, setDetailSearch] = useState("");
  const [listAdjustmentType, setListAdjustmentType] = useState<"opening_balance" | "cost_adjustment">("opening_balance");
  const [adjustmentType, setAdjustmentType] = useState("opening_balance");
  const [valuationAccountId, setValuationAccountId] = useState("");
  const [valuationAccounts, setValuationAccounts] = useState<Array<{id:string;code:string;name:string}>>([]);
  const [valuationRevision, setValuationRevision] = useState(0);
  const [valuationLoading, setValuationLoading] = useState(false);
  const defaultValuationAccount = useRef("");
  const pendingValuationCreate = useRef<{fingerprint:string;key:string} | null>(null);
  const isHpp = (selectedDocument?.adjustmentType || adjustmentType) === "cost_adjustment";
  const valueChange = (row: PreviewRow) => row.valueChange ?? Math.round((Math.round((row.stockBefore || 0)*(row.unitCost || 0)*100)/100 - Math.round((row.stockBefore || 0)*(row.unitCostBefore || 0)*100)/100)*100)/100;
  const [rowTab, setRowTab] = useState<"items" | "info" | "image">("items");
  useEffect(() => { setRowTab("items"); }, [rowDialog?.index]);
  const stockFor = (row: PreviewRow) => Number(data.warehouseStocks?.find(stock => stock.itemId === row.itemId && stock.warehouseId === row.warehouseId)?.quantity || 0);
  const dialogMode = rowDialog?.row.adjustmentMode || (rowDialog?.row.targetQuantity != null ? "set" : (rowDialog?.row.quantity || 0) < 0 ? "minus" : "plus");
  const changeDialog = (patch: Partial<PreviewRow>) => {
    if (!rowDialog || rowDialog.readOnly) return;
    const row = {...rowDialog.row, ...patch};
    const mode = patch.adjustmentMode || dialogMode;
    row.adjustmentMode = mode;
    if (isHpp) { row.quantity = 0; row.targetQuantity = null; row.valueChange = undefined; } else if (mode === "set") {
      row.targetQuantity = patch.targetQuantity ?? row.targetQuantity ?? Math.max(0, stockFor(row));
      row.stockBefore = stockFor(row);
      row.quantity = row.targetQuantity - row.stockBefore;
    } else {
      row.targetQuantity = null; row.stockBefore = null;
      row.quantity = Math.abs(row.quantity) * (mode === "minus" ? -1 : 1);
    }
    setRowDialog({...rowDialog, row});
  };
  const [rowMessage, setRowMessage] = useState("");
  useEffect(() => { setRowMessage(""); }, [rowDialog?.index, rowDialog?.row.quantity, rowDialog?.row.warehouseId]);
  const currentRole = data.roles.find(role => role.id === currentUser?.roleId);
  const isAdmin = Boolean(currentUser?.isOwner) || currentRole?.code?.toUpperCase() === "ADM" || (currentRole?.name || currentUser?.roleName || "").trim().toLowerCase() === "administrator";
  const canHpp = isAdmin || hasPermission("stock_adjustment:hpp");
  const canManageAdjustments = isAdmin || canHpp;
  useEffect(() => {
    if (!canManageAdjustments) return;
    let active = true;
    void api.get<{accounts:Array<{id:string;code:string;name:string}>;defaultAccountId:string}>("stock-adjustments?valuationOptions=1").then(response => {
      if (!active || !response.success || !response.data) return;
      setValuationAccounts(response.data.accounts);
      defaultValuationAccount.current = response.data.defaultAccountId;
      setValuationAccountId(previous => previous || response.data!.defaultAccountId);
    });
    return () => { active = false; };
  }, [canManageAdjustments]);
  useEffect(() => {
    if (!isHpp || !rowDialog || rowDialog.readOnly) return;
    let active = true;
    const query = new URLSearchParams({valuationPreview:"1",itemId:rowDialog.row.itemId,warehouseId:rowDialog.row.warehouseId,date});
    setValuationLoading(true); setRowMessage("");
    setRowDialog(previous => previous ? {...previous,row:{...previous.row,stockBefore:undefined,unitCostBefore:undefined}} : previous);
    void api.get<{stockBefore:number;unitCostBefore:number}>(`stock-adjustments?${query}`).then(response => {
      if (!active) return;
      if (!response.success || !response.data) { setRowMessage(response.message || "HPP belum dapat dimuat."); return; }
      const snapshot=response.data;
      setRowDialog(previous => previous ? {...previous,row:{...previous.row,...snapshot,unitCost:previous.row.unitCost ?? snapshot.unitCostBefore,quantity:0,valueChange:undefined}} : previous);
    }).finally(() => { if (active) setValuationLoading(false); });
    return () => { active = false; };
  }, [isHpp,rowDialog?.index,rowDialog?.row.itemId,rowDialog?.row.warehouseId,rowDialog?.readOnly,date]);
  const validRows = rows.filter((row) => !row.error && (isHpp ? row.stockBefore! > 0 && row.unitCost! > 0 && row.unitCostBefore != null : row.quantity !== 0));
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
    setRowDialog({index:rows.length,readOnly:false,row:{
      row:rows.length+1,code:item.code,itemName:item.name,itemId:item.id,
      warehouse:defaultWarehouse.name,warehouseId:defaultWarehouse.id,
      quantity:isHpp?0:1,unit:item.unit,unitCost:isHpp?undefined:0,error:"",
    }});
    setItemSearch("");
    setMessage("");
  };

  const loadDocuments = async () => {
    const response = await api.get<AdjustmentDocument[]>("stock-adjustments");
    if (response.success) {
      setDocuments(response.data || []);
      setDocumentsLoaded(true);
      setMessage("");
      return;
    }
    setMessage(
      response.message ||
        response.error ||
        "Daftar penyesuaian stok gagal dimuat.",
    );
  };
  useEffect(() => {
    if (canManageAdjustments) void loadDocuments();
  }, [canManageAdjustments]);

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
    setAdjustmentType("opening_balance");
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

  const importFromMainList = async (file?: File) => {
    if (!file) return;
    setSelectedDocument(null);
    setEditingId("");
    setNotes("");
    setFormTab("items");
    setEntryTabOpen(true); setViewMode("entry");
    await loadFile(file);
    if (listImportRef.current) listImportRef.current.value = "";
  };

  const submit = async (postImmediately: boolean) => {
    if ((isHpp ? !canHpp : !isAdmin) || !validRows.length || errorRows.length || duplicateKeys.size)
      return;
    if (isHpp && (!notes.trim() || !valuationAccountId)) { setMessage("Isi akun penyesuaian dan alasan koreksi HPP pada Info lainnya."); setFormTab("info"); return; }
    setLoading(true);
    setMessage("");
    try {
      const normalized =
        validRows
          .map((row) => `${row.itemId}|${row.warehouseId}|${row.quantity}|${row.unitCost||0}|${row.targetQuantity??""}|${row.lineNotes||""}`)
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
        notes,
        batchKey,
        adjustmentType, valuationAccountId, valuationRevision,
        rows: validRows.map((row) => ({
          itemId: row.itemId,
          warehouseId: row.warehouseId,
          quantity: row.quantity,
          unitCost: row.unitCost || 0,
          unitCostBefore: row.unitCostBefore,
          targetQuantity: row.targetQuantity ?? null,
          stockBefore: row.stockBefore ?? null,
          lineNotes: row.lineNotes || "",
        })),
      };
      const fingerprint = JSON.stringify(payload);
      if (!pendingValuationCreate.current || pendingValuationCreate.current.fingerprint !== fingerprint) pendingValuationCreate.current = {fingerprint,key:crypto.randomUUID()};
      const response = editingId
        ? await api.update("stock-adjustments", editingId, {
            ...payload,
            action: "save",
          })
        : await api.create("stock-adjustments", {...payload,requestKey:pendingValuationCreate.current.key});
      if (!response.success)
        throw new Error(response.message || response.error || "Import gagal.");
      const documentId = editingId || response.data.id;
      const savedRevision = response.data.valuationRevision ?? valuationRevision;
      if (isHpp) { setEditingId(documentId); setValuationRevision(savedRevision); }
      const displayNumber = editingId
        ? documents.find((document) => document.id === editingId)
            ?.adjustmentNumber
        : response.data.adjustmentNumber;
      if (postImmediately) {
        const posted = await api.update("stock-adjustments", documentId, {
          action: "post", valuationRevision: savedRevision,
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
      pendingValuationCreate.current = null;
      setValuationRevision(0);
      setRows([]);
      setFileName("");
      setEditingId("");
      setNotes("");
      setViewMode("list");
      if (inputRef.current) inputRef.current.value = "";
    } catch (error: any) {
      setMessage(error?.message || "Import saldo awal gagal.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!requestedDocument || !documentsLoaded) return;
    const document = documents.find(row => row.id === requestedDocument || row.adjustmentNumber === requestedDocument);
    if (document) void viewDocument(document);
    else setMessage('Penyesuaian sumber tidak ditemukan atau sudah tidak dapat diakses.');
    setSearchParams(params => { const next = new URLSearchParams(params); next.delete('view'); return next; }, { replace: true });
  }, [requestedDocument, documentsLoaded, documents, setSearchParams]);

  const editDocument = async (document: AdjustmentDocument) => {
    setLoading(true);
    setMessage("");
    try {
      const response = await api.get<any>(`stock-adjustments/${document.id}`);
      if (!response.success)
        throw new Error(response.message || "Draft tidak dapat dibuka.");
      setAdjustmentType(response.data.adjustmentType || "opening_balance");
      setValuationAccountId(response.data.valuationAccountId || defaultValuationAccount.current);
      setValuationRevision(response.data.valuationRevision || 0);
      setEditingId(document.id);
      setDate(response.data.date);
      setNotes(response.data.notes || "");
      setSelectedDocument(null);
      setFormTab("items");
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
          unitCost: row.unitCost, unitCostBefore: row.unitCostBefore, valueChange: row.valueChange, targetQuantity: row.targetQuantity, stockBefore: row.stockBefore, lineNotes: row.lineNotes,
          error: "",
        })),
      );
      setEntryTabOpen(true); setViewMode("entry");
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
      setFormTab("items");
      setDetailSearch("");
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
    action: "post" | "delete" | "cancel",
  ) => {
    if (loading) return;
    if (action === "delete" && !canDeleteAdjustment(document)) {
      setMessage("Dokumen ini tidak dapat dihapus.");
      return;
    }
    let reason = "Dihapus oleh pengguna";
    if (action === "cancel") { const answer = window.prompt(`Alasan pembatalan ${document.adjustmentNumber}:`); if (!answer?.trim()) return; reason = answer.trim(); }
    if (action === "delete") {
      const impact =
        document.status === "Posted"
          ? " Dokumen dan mutasinya akan dihapus, saldo stok disesuaikan otomatis. Riwayat penghapusan tersimpan untuk audit."
          : document.status === "Cancelled"
          ? " Dokumen serta mutasi awal dan pembatalannya akan dihapus. Saldo stok tetap. Riwayat penghapusan tersimpan di Log Aktivitas."
          : "";
      if (!window.confirm(`Hapus ${document.adjustmentNumber}?${impact}`)) return;
    }
    setLoading(true);
    setMessage("");
    try {
      const response =
        action === "delete"
          ? await api.removeWithBody("stock-adjustments", document.id, {
              reason, valuationRevision: document.valuationRevision ?? 0,
            })
          : await api.update("stock-adjustments", document.id, {
              action, reason, valuationRevision: document.valuationRevision ?? 0,
            });
      if (!response.success)
        throw new Error(response.message || "Proses gagal.");
      await Promise.all([loadDocuments(), refreshData()]);
      if (action === "delete") {
        closeDetailTab(document.id);
        if (editingId === document.id) {
          setEditingId(""); setRows([]); setNotes(""); setFileName(""); setViewMode("list");
        }
      }
      if (action === "cancel") await viewDocument(document);
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
      document.adjustmentType === listAdjustmentType &&
      (!documentDate || document.date >= documentDate) &&
      (!statusFilter || document.status === statusFilter) &&
      (!query ||
        `${document.adjustmentNumber} ${document.notes || ""} ${document.adjustmentType} ${document.status}`
          .toLowerCase()
          .includes(query))
    );
  });

  const newDocument = (type = "opening_balance") => {
    setListAdjustmentType(type === "cost_adjustment" ? "cost_adjustment" : "opening_balance");
    setAdjustmentType(type); setValuationRevision(0); setValuationAccountId(defaultValuationAccount.current); pendingValuationCreate.current = null;
    setSelectedDocument(null); setEditingId(""); setRows([]); setNotes("");
    setFileName(""); setDate(localDateKey()); setEntryTabOpen(true); setViewMode("entry"); setFormTab("items"); setMenu(null);
  };
  const displayRows: PreviewRow[] = selectedDocument ? selectedDocument.rows.map((row, index) => ({
    row: index + 1, code: row.itemCode, itemName: row.itemName, itemId: row.itemId,
    warehouse: row.warehouseName, warehouseId: row.warehouseId, quantity: row.quantity, unit: row.unit, unitCost: row.unitCost, unitCostBefore: row.unitCostBefore, valueChange: row.valueChange, targetQuantity: row.targetQuantity, stockBefore: row.stockBefore, lineNotes: row.lineNotes, error: "",
  })) : rows;
  const quantityTotal = displayRows.reduce((sum, row) => sum + (isHpp ? row.stockBefore || 0 : Math.abs(row.quantity)), 0);
  const activeDocument = selectedDocument || documents.find(document => document.id === editingId);
  const showForm = !!selectedDocument || viewMode === "entry";
  const saveDisabled = (isHpp ? !canHpp : !isAdmin) || loading || !validRows.length || !!errorRows.length || !!duplicateKeys.size;
  const formatDate = (value: string) => value.split("-").reverse().join("/");
  const toggleMenu = (value: typeof menu) => setMenu(current => current === value ? null : value);
  const openDocument = (document: AdjustmentDocument) => {
    setListAdjustmentType(document.adjustmentType === "cost_adjustment" ? "cost_adjustment" : "opening_balance");
    setMenu(null);
    if (document.status === "Draft" && !document.isStockOpnameLinked) void editDocument(document);
    else void viewDocument(document);
  };
  const saveRow = () => {
    if (!rowDialog || rowDialog.readOnly) return;
    const row = rowDialog.row;
    if (isHpp && (valuationLoading || row.stockBefore == null || row.unitCostBefore == null)) { setRowMessage("Muat ulang stok dan HPP sebelum melanjutkan."); return; }
    if (isHpp && (!(row.unitCost! > 0) || valueChange(row) === 0)) { setRowMessage("HPP baru harus lebih dari nol dan berbeda dari HPP lama."); return; }
    if (!isHpp && dialogMode === "set" && (!Number.isSafeInteger(row.targetQuantity) || Number(row.targetQuantity) < 0)) { setRowMessage("Stok akhir harus bilangan bulat nol atau lebih."); return; }
    if (!isHpp && dialogMode === "set" && row.quantity === 0) { setRowMessage("Stok akhir sama dengan stok saat ini; tidak ada penyesuaian."); return; }
    if (!Number.isFinite(row.unitCost || 0) || (row.unitCost || 0) < 0 || (row.unitCost || 0) >= 1e12 || !/^\d+(\.\d{1,4})?$/.test(String(row.unitCost || 0))) { setRowMessage("Biaya satuan harus nol atau positif, maksimal 4 desimal."); return; }
    if (!isHpp && (!Number.isSafeInteger(row.quantity) || !row.quantity || Math.abs(row.quantity) > 2147483647)) { setRowMessage("Kuantitas harus bilangan bulat antara 1 dan 2.147.483.647."); return; }
    if (!row.itemId) { setRowMessage("Kode barang belum dikenali. Hapus baris ini lalu pilih barang yang terdaftar."); return; }
    if (!row.warehouseId) { setRowMessage("Pilih gudang untuk barang ini."); return; }
    if (rows.some((other, index) => index !== rowDialog.index && other.itemId === row.itemId && other.warehouseId === row.warehouseId)) { setRowMessage("Barang sudah ada pada gudang yang sama."); return; }
    setRows(current => rowDialog.index === current.length ? [...current, {...row,error:""}] : current.map((other, index) => index === rowDialog.index ? { ...row, error: "" } : other));
    setRowDialog(null);
  };
  const orderedDocuments = [...filteredDocuments].sort((a,b) =>
    String(a[sortKey] || "").localeCompare(String(b[sortKey] || ""), "id", { numeric: true }) * (sortAsc ? 1 : -1));
  const orderBy = (key: typeof sortKey) => { setSortAsc(sortKey === key ? !sortAsc : true); setSortKey(key); };

  if (!canManageAdjustments) return <div className="adjustment-message">Penyesuaian Persediaan hanya tersedia untuk user yang memiliki izin edit barang.</div>;
  return (
    <div className={`app-module-page adjustment-workspace ${isHpp ? "adjustment-hpp" : ""}`}>
      <div className={ui.childBar}>
        <button type="button" title="Daftar Penyesuaian Persediaan" className={`${ui.childListTab} ${!showForm ? "app-child-list-tab--active" : ""}`} onClick={() => { setSelectedDocument(null); setViewMode("list"); setMenu(null); }}><List size={22}/></button>
        {entryTabOpen && <div className={childTabClass(!selectedDocument && viewMode === "entry")}>
          <button type="button" onClick={() => { setSelectedDocument(null); setViewMode("entry"); setMenu(null); }}>
            {editingId ? documents.find(document => document.id === editingId)?.adjustmentNumber : "Data Baru"}
          </button>
          <button type="button" title="Tutup Data Baru" disabled={loading} onClick={() => {
            setEntryTabOpen(false); setViewMode("list"); setEditingId(""); setRows([]); setNotes("");
            setFileName(""); setItemSearch(""); setRowDialog(null); setMenu(null); setMessage("");
          }}><X size={16}/></button>
        </div>}
        {detailTabs.map(tab => <div key={tab.id} className={childTabClass(selectedDocument?.id === tab.id)}>
          <button type="button" onClick={() => { setSelectedDocument(tab); setFormTab("items"); setDetailSearch(""); setMenu(null); }}>{tab.adjustmentNumber}</button>
          <button type="button" title="Tutup tab" onClick={() => closeDetailTab(tab.id)}><X size={16}/></button>
        </div>)}
        <div className="adjustment-tab-tools">
          <button className="adjustment-icon" title="Pengaturan tampilan" onClick={() => toggleMenu("settings")}><Settings size={17}/></button>
          <button className="adjustment-help" title="Panduan" onClick={() => window.open("/help?article=penyesuaian-stok", "_blank")}><Lightbulb size={18}/></button>
          {menu === "settings" && <div className="adjustment-menu"><button onClick={() => { setDocumentDate(""); setDocumentSearch(""); setStatusFilter(""); setSortKey("date"); setSortAsc(false); setMenu(null); }}>Reset filter dan urutan</button><button onClick={() => { setMenu(null); void Promise.all([loadDocuments(),refreshData()]); }}>Muat ulang data</button></div>}
        </div>
      </div>
      <div className="app-module-panel app-fill-stack">
      {message && <div role="status" className="adjustment-message">{message}</div>}
      <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" hidden onChange={event => { void loadFile(event.target.files?.[0]); event.target.value = ""; }}/>
      <input ref={listImportRef} type="file" accept=".csv,.xlsx,.xls" hidden onChange={event => void importFromMainList(event.target.files?.[0])}/>
      {!showForm ? <section className="app-fill-stack adjustment-list">
        <div className="adjustment-filter-row">
          <label className="adjustment-date-filter">Tanggal: <IndonesianDateInput value={documentDate} onChange={setDocumentDate}/></label>
          <button className="adjustment-icon adjustment-filter" title="Tambah kriteria" onClick={() => setShowFilter(!showFilter)}><Filter size={16}/><ChevronDown size={12}/></button>
          {showFilter && <div className="adjustment-filter-options"><label>Status <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">Semua</option><option value="Draft">Draft</option><option value="Posted">Diposting</option><option value="Cancelled">Dibatalkan</option></select></label><button onClick={() => { setDocumentDate(""); setStatusFilter(""); }}>Bersihkan</button></div>}
        </div>
        <div className="adjustment-list-toolbar">
          <button className="adjustment-add" title={`Data Baru: ${listAdjustmentType === "cost_adjustment" ? "Penyesuaian HPP" : "Penyesuaian Stok"}`} onClick={() => newDocument(listAdjustmentType)}><Plus size={23}/></button>
          <label className="adjustment-kind adjustment-list-kind">Jenis Penyesuaian<select aria-label="Filter jenis penyesuaian" value={listAdjustmentType} onChange={event => setListAdjustmentType(event.target.value as "opening_balance" | "cost_adjustment")}><option value="opening_balance">Penyesuaian Stok</option>{canHpp && <option value="cost_adjustment">Penyesuaian HPP</option>}</select></label>
          <button className="adjustment-icon" title="Perbarui" disabled={loading} onClick={() => void Promise.all([loadDocuments(),refreshData()])}><RefreshCw size={16}/></button>
          <div className="adjustment-list-tools">
            <button className="adjustment-icon" title="Cetak daftar" onClick={() => window.print()}><Printer size={16}/></button>
            <div className="adjustment-dropdown"><button className="adjustment-icon" title="Impor dan template" onClick={() => toggleMenu("import")}><Settings size={16}/><ChevronDown size={12}/></button>
              {menu === "import" && <div className="adjustment-menu"><button disabled={!isAdmin} onClick={() => { setMenu(null); listImportRef.current?.click(); }}>Impor Excel/CSV</button><button onClick={() => { setMenu(null); downloadTemplate(); }}>Unduh template</button></div>}
            </div>
            <label className="adjustment-search"><input aria-label="Cari penyesuaian" placeholder="Ketik dan [Enter]" value={documentSearch} onChange={event => setDocumentSearch(event.target.value)}/><Search size={18}/></label>
            <output className="adjustment-count">{orderedDocuments.length}</output>
          </div>
        </div>
        <div className="app-table-scroll app-table-scroll--fill adjustment-table-scroll adjustment-list-table"><table>
          <colgroup><col style={{width:"38%"}}/><col style={{width:"23%"}}/><col/></colgroup>
          <thead><tr>{([['adjustmentNumber','Nomor #'],['date','Tanggal'],['notes','Keterangan']] as const).map(([key,label]) => <th key={key}><button onClick={() => orderBy(key)}><ArrowUpDown size={12}/>{label}</button></th>)}</tr></thead>
          <tbody>{orderedDocuments.map(document => <tr key={document.id} className="adjustment-clickable" onClick={() => openDocument(document)}>
            <td><button className="adjustment-document-link" onClick={event => { event.stopPropagation(); openDocument(document); }}>{document.adjustmentNumber}</button></td>
            <td>{formatDate(document.date)}</td><td>{document.adjustmentType === "cost_adjustment" && <span className="adjustment-hpp-tag">HPP</span>}{document.notes || ""}</td>
          </tr>)}</tbody>
        </table>{!orderedDocuments.length && <div className="adjustment-empty">{loading ? "Memuat data…" : "Belum ada data"}</div>}</div>
      </section> : <section className="adjustment-form adjustment-entry">
        <div className="adjustment-form-main">
          <div className="adjustment-form-header">
            <div className="adjustment-header-column">
              <label className="adjustment-header-field">
                <span className="adjustment-field-label">Tanggal <em>*</em></span>
                <IndonesianDateInput className="adjustment-date-control" value={selectedDocument?.date || date} onChange={setDate} disabled={!!selectedDocument || (isHpp && rows.length > 0)}/>
              </label>
              <label className="adjustment-header-field">
                <span className="adjustment-field-label">Jenis Penyesuaian</span>
                <select aria-label="Jenis penyesuaian" disabled value={selectedDocument ? (selectedDocument.adjustmentType === "cost_adjustment" ? "cost_adjustment" : "opening_balance") : adjustmentType}>
                  <option value="opening_balance">Penyesuaian Stok</option>
                  {canHpp && <option value="cost_adjustment">Penyesuaian HPP</option>}
                </select>
              </label>
            </div>
            <div className="adjustment-header-column">
              <label className="adjustment-header-field adjustment-header-number">
                <span className="adjustment-field-label">No Penyesuaian #</span>
                <input readOnly value={activeDocument?.adjustmentNumber || "Otomatis"} aria-label="Nomor penyesuaian"/>
              </label>
            </div>
          </div>
          <div className="adjustment-body-wrap">
            <nav className="adjustment-side-tabs" aria-label="Bagian penyesuaian">
              <button title="Rincian Barang" className={formTab === "items" ? "active" : ""} onClick={() => {setFormTab("items"); setMenu(null);}}><FileText size={19}/></button>
              <button title="Info lainnya" className={formTab === "info" ? "active" : ""} onClick={() => {setFormTab("info"); setMenu(null);}}><Info size={19}/></button>
            </nav>
            <div className="adjustment-body">
              {formTab === "items" ? <>
                <div className="adjustment-items-toolbar">
                  <div className="adjustment-item-search"><label className="adjustment-search"><input aria-label={selectedDocument ? "Cari rincian barang" : "Cari atau pilih barang"} value={selectedDocument ? detailSearch : itemSearch} onChange={event => selectedDocument ? setDetailSearch(event.target.value) : setItemSearch(event.target.value)} placeholder="Cari/Pilih Barang & Jasa..."/><Search size={18}/></label>
                    {!selectedDocument && itemSuggestions.length > 0 && <div className="adjustment-suggestions">{itemSuggestions.map(item => <button key={item.id} onClick={() => addManualItem(item)}><ItemSearchOption name={item.name} code={item.code}/></button>)}</div>}
                  </div>
                  {!selectedDocument && !isHpp && <div className="adjustment-dropdown"><button className="adjustment-outline" onClick={() => toggleMenu("import")}>Ambil <ChevronDown size={12}/></button>{menu === "import" && <div className="adjustment-menu"><button disabled={!isAdmin} onClick={() => {setMenu(null); inputRef.current?.click();}}>Impor Excel/CSV</button><button onClick={() => {setMenu(null); downloadTemplate();}}>Unduh template</button></div>}</div>}
                  <div className="adjustment-dropdown"><button className="adjustment-outline" onClick={() => toggleMenu("details")}>Rincian <ChevronDown size={12}/></button>{menu === "details" && <div className="adjustment-menu"><button onClick={() => {setMenu(null); setFormTab("info");}}>Info lainnya</button><button disabled={!displayRows.length} onClick={() => {setMenu(null); setRowDialog({index:0,row:{...displayRows[0]},readOnly:!!selectedDocument});}}>Rincian barang pertama</button></div>}</div>
                  <h2>{displayRows.length ? `${displayRows.length} Barang (${quantityTotal.toLocaleString("id-ID")})` : "Rincian Barang"} <span>*</span></h2>
                </div>
                {!selectedDocument && (errorRows.length > 0 || duplicateKeys.size > 0) && <div className="adjustment-message"><AlertTriangle size={16}/> {errorRows.length} baris bermasalah{duplicateKeys.size ? ` · ${duplicateKeys.size} barang/gudang duplikat` : ""}. Periksa rincian sebelum menyimpan.</div>}
                <div className="app-table-scroll adjustment-table-scroll adjustment-items-table"><table>
                  <colgroup><col style={{width:"12%"}}/><col style={{width:"46%"}}/><col style={{width:"9%"}}/><col style={{width:"23%"}}/><col style={{width:"10%"}}/></colgroup>
                  <thead><tr><th>Kode #</th><th>Nama Barang</th><th>{isHpp ? "Stok Tetap" : "Kuantitas"}</th><th>Tipe</th><th>Satuan</th></tr></thead>
                  <tbody>{displayRows.map((row,index) => (!selectedDocument || `${row.code} ${row.itemName}`.toLowerCase().includes(detailSearch.toLowerCase())) && <tr key={`${row.row}-${index}`} className={`adjustment-clickable ${row.error ? "adjustment-row-error" : ""}`} onClick={() => setRowDialog({index,row:{...row},readOnly:!!selectedDocument})}>
                    <td><button onClick={event => {event.stopPropagation(); setRowDialog({index,row:{...row},readOnly:!!selectedDocument});}}>{row.code}</button></td>
                    <td>{row.itemName || "—"}{row.error && <small>{row.error}</small>}</td><td className="adjustment-qty">{(isHpp ? row.stockBefore || 0 : Math.abs(row.quantity)).toLocaleString("id-ID")}</td><td>{isHpp ? "Penyesuaian HPP" : row.quantity < 0 ? "Pengurangan" : "Penambahan"}</td><td>{row.unit}</td>
                  </tr>)}</tbody>
                </table>{!displayRows.length && <div className="adjustment-empty">Belum ada data</div>}</div>
              </> : <div className="adjustment-info">
                <h2><Info size={20}/> Info lainnya</h2>
                <label>Akun Penyesuaian{isHpp ? <select aria-label="Akun penyesuaian HPP" disabled={!!selectedDocument || loading} value={selectedDocument?.valuationAccountId || valuationAccountId} onChange={event => setValuationAccountId(event.target.value)}><option value="">Pilih akun...</option>{valuationAccounts.map(account => <option key={account.id} value={account.id}>[{account.code}] {account.name}</option>)}</select> : <input disabled value="Mengikuti preferensi akun persediaan"/>}</label>
                <label>{isHpp ? "Alasan Koreksi *" : "Keterangan"}<textarea aria-label="Keterangan penyesuaian" maxLength={255} rows={3} readOnly={!!selectedDocument} value={selectedDocument ? selectedDocument.notes || "" : notes} onChange={event => setNotes(event.target.value)}/></label>
                {activeDocument && <label>Status<span>{activeDocument.status === "Posted" ? "Diposting" : activeDocument.status === "Cancelled" ? "Dibatalkan" : "Draft"}</span></label>}
                {selectedDocument?.cancellationReason && <label>Catatan pembatalan sebelumnya<span>{selectedDocument.cancellationReason}</span></label>}
                {fileName && !selectedDocument && <label>File impor<span>{fileName}</span></label>}
              </div>}
            </div>
          </div>
          <div className="adjustment-total"><span>{isHpp ? "Selisih Nilai Persediaan" : "Total"}</span><strong>Rp {displayRows.reduce((sum,row)=>sum+(isHpp ? valueChange(row) : Math.abs(row.quantity)*(row.unitCost||0)),0).toLocaleString("id-ID",{maximumFractionDigits:isHpp?2:4})}</strong><small>{isHpp ? "Jumlah stok tidak berubah" : `Total Kuantitas: ${quantityTotal.toLocaleString("id-ID")}`}</small></div>
          {isHpp && <div className="adjustment-hpp-actions">{!selectedDocument && <button className="adjustment-outline" disabled={saveDisabled} onClick={() => void submit(false)}>Simpan Draft</button>}{selectedDocument?.status === "Posted" && <button className="adjustment-outline" disabled={loading} onClick={() => void processDocument(selectedDocument,"cancel")}>Batalkan Penyesuaian HPP</button>}</div>}
        </div>
        <div className="adjustment-rail">
          <AccurateFormActionRail
            save={{disabled:!!selectedDocument || saveDisabled,onClick:() => void submit(true),title:"Simpan"}}
            print={{onClick:() => window.print(),title:"Cetak"}}
            attachment={{disabled:true,title:"Lampiran"}}
            more={{disabled:true,title:"Pilihan lainnya"}}
            remove={activeDocument && canDeleteAdjustment(activeDocument) ? {disabled:loading,onClick:() => void processDocument(activeDocument,"delete"),title:"Hapus"} : undefined}
          />

        </div>
      </section>}
      {rowDialog && <div className="adjustment-modal-overlay" onKeyDown={event => {if(event.key === "Escape") setRowDialog(null);}}>
        <section role="dialog" aria-modal="true" aria-labelledby="adjustment-row-title" className="adjustment-modal">
          <header><h2 id="adjustment-row-title"><Pencil size={17}/> Rincian Barang</h2><button autoFocus title="Tutup rincian" onClick={() => setRowDialog(null)}><X size={18}/></button></header>
          <div className="adjustment-modal-content">
            <div className="adjustment-modal-tabs" role="tablist" aria-label="Rincian barang">
              {([['items','Rincian Barang'],['info','Info Lainnya'],['image','Gambar']] as const).map(([tab,label])=><button role="tab" aria-selected={rowTab===tab} key={tab} className={rowTab===tab?'active':''} onClick={()=>setRowTab(tab)}>{label}</button>)}
            </div>
            {rowTab === "items" && <>
            <label>Kode #<button className="adjustment-item-link" onClick={() => navigate(`/items?view=${encodeURIComponent(rowDialog.row.itemId)}`)}>{rowDialog.row.code}</button></label>
            <label>Nama Barang <span>*</span><input readOnly value={rowDialog.row.itemName}/></label>
            {!isHpp && <><div className="adjustment-type-field"><span>Tipe Penyesuaian</span><div>{([['plus','Penambahan'],['minus','Pengurangan'],['set','Atur Stok']] as const).map(([mode,label])=><label key={mode}><input type="radio" name="adjustment-mode" checked={dialogMode===mode} disabled={rowDialog.readOnly} onChange={()=>changeDialog({adjustmentMode:mode})}/>{label}</label>)}</div></div>
            <label>{dialogMode === "set" ? "Stok Akhir" : "Kuantitas"} <span>*</span><div className="adjustment-modal-quantity"><input aria-label={dialogMode === "set" ? "Stok Akhir" : "Kuantitas"} readOnly={rowDialog.readOnly} type="number" min={dialogMode === "set" ? "0" : "1"} step="1" value={dialogMode === "set" ? rowDialog.row.targetQuantity ?? 0 : Math.abs(rowDialog.row.quantity)} onChange={event=>changeDialog(dialogMode==='set'?{targetQuantity:Number(event.target.value)}:{quantity:Number(event.target.value)})}/><select aria-label="Satuan" disabled={rowDialog.readOnly} value={rowDialog.row.unit} onChange={()=>{}}><option>{rowDialog.row.unit}</option></select></div></label>
            <label>Biaya Satuan<div className="adjustment-currency"><span>Rp</span><input aria-label="Biaya Satuan" readOnly={rowDialog.readOnly} type="number" min="0" max="999999999999.9999" step="0.0001" value={rowDialog.row.unitCost ?? 0} onChange={event=>changeDialog({unitCost:Number(event.target.value)})}/></div></label>
            <label>Total Biaya<input aria-label="Total Biaya" readOnly value={(Math.abs(rowDialog.row.quantity)*(rowDialog.row.unitCost||0)).toLocaleString('id-ID',{maximumFractionDigits:4})}/></label>
            </>}
            <label>Gudang <span>*</span>{rowDialog.readOnly ? <input readOnly value={rowDialog.row.warehouse}/> : <select aria-label="Gudang" value={rowDialog.row.warehouseId} onChange={event=>{const warehouse=data.warehouses.find(value=>value.id===event.target.value);if(warehouse)changeDialog({warehouseId:warehouse.id,warehouse:warehouse.name});}}>{data.warehouses.filter(warehouse => warehouse.isActive && !warehouse.isSystem && (currentBranchId === "ALL" || warehouse.branchId === currentBranchId)).map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select>}</label>
            {isHpp && <>
              <label>Stok Tetap<input aria-label="Stok tetap" readOnly value={valuationLoading ? "Memuat..." : rowDialog.row.stockBefore == null ? "—" : `${rowDialog.row.stockBefore.toLocaleString("id-ID")} ${rowDialog.row.unit}`}/></label>
              <label>HPP Lama<input aria-label="HPP lama" readOnly value={rowDialog.row.unitCostBefore == null ? "—" : `Rp ${rowDialog.row.unitCostBefore.toLocaleString("id-ID",{maximumFractionDigits:4})}`}/></label>
              <label>HPP Baru <span>*</span><div className="adjustment-currency"><span>Rp</span><input aria-label="HPP baru" readOnly={rowDialog.readOnly} disabled={valuationLoading || rowDialog.row.unitCostBefore == null} type="number" min="0.0001" max="999999999999.9999" step="0.0001" value={rowDialog.row.unitCost ?? ""} onChange={event => changeDialog({unitCost:Number(event.target.value)})}/></div></label>
              <dl className="adjustment-hpp-values"><div><dt>Nilai Lama</dt><dd>Rp {((rowDialog.row.stockBefore||0)*(rowDialog.row.unitCostBefore||0)).toLocaleString("id-ID",{maximumFractionDigits:2})}</dd></div><div><dt>Nilai Baru</dt><dd>Rp {((rowDialog.row.stockBefore||0)*(rowDialog.row.unitCost||0)).toLocaleString("id-ID",{maximumFractionDigits:2})}</dd></div><div><dt>Selisih Nilai</dt><dd>Rp {valueChange(rowDialog.row).toLocaleString("id-ID",{maximumFractionDigits:2})}</dd></div></dl>
              <p className="adjustment-detail-note">Jumlah stok tetap. HPP baru berlaku untuk transaksi berikutnya.</p>
            </>}
            {!isHpp && <p className="adjustment-stock-note">Stok saat ini: <strong>{stockFor(rowDialog.row).toLocaleString('id-ID')} {rowDialog.row.unit}</strong>{dialogMode==='set' && <> | Selisih: {rowDialog.row.quantity > 0 ? '+' : ''}{rowDialog.row.quantity.toLocaleString('id-ID')}</>}</p>}
            </>}
            {rowTab === "info" && <><label>Keterangan<textarea aria-label="Keterangan barang" maxLength={1000} readOnly={rowDialog.readOnly} rows={4} value={rowDialog.row.lineNotes||''} onChange={event=>changeDialog({lineNotes:event.target.value})}/></label><p className="adjustment-detail-note">{isHpp ? "Penyesuaian HPP mencatat selisih nilai persediaan tanpa mengubah jumlah stok. Pembatalan memerlukan alasan dan hanya dapat dilakukan sebelum ada transaksi lanjutan." : "Satuan mengikuti master barang. Nilai penyesuaian dicatat saat posting."}</p></>}
            {rowTab === "image" && <p className="adjustment-empty-image">Gambar barang belum tersedia pada master barang.</p>}
            {(rowMessage || rowDialog.row.error) && <p role="alert" className="adjustment-message">{rowMessage || rowDialog.row.error}</p>}
          </div>
          <footer>{!rowDialog.readOnly && rowDialog.index < rows.length && <button className="adjustment-outline" onClick={() => {setRows(current=>current.filter((_,index)=>index!==rowDialog.index));setRowDialog(null);}}>Hapus</button>}<button className="adjustment-primary" disabled={!rowDialog.readOnly && valuationLoading} onClick={rowDialog.readOnly ? () => setRowDialog(null) : saveRow}>{rowDialog.readOnly ? "Tutup" : "Lanjut"}</button></footer>
        </section>
      </div>}
    </div>
    </div>
  );
}
