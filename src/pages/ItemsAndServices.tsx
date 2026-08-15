import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { Boxes, ChevronDown, ChevronUp, Download, Edit, Filter, FolderTree, Layers, Plus, Save, Search, Trash2, Upload, X, AlertCircle, CheckCircle2, FileText, Settings2, RefreshCw, Printer, Share2, List } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Item, ItemCategory, ItemType, GroupMember } from '../types';
import { failSystemProcess, finishSystemProcess, startSystemProcess, updateSystemProcess } from '../lib/processQueue';
import { localDateKey } from '../lib/date';
import { api } from '../lib/apiClient';

const allItemTypes: ItemType[] = ['Persediaan', 'Jasa', 'Non Persediaan', 'Group'];
const units = ['PCS', 'SET', 'CAN', 'BOTOL', 'LITER', 'JASA', 'UNIT', 'PAKET'];

const twoDigitSegment = (value: string, fallback: string) => {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const digits = normalized.replace(/\D/g, '');
  if (digits) return digits.slice(-2).padStart(2, '0');
  const words = normalized.split(/\s+/).filter(Boolean);
  const code = words.length > 1 ? `${words[0][0]}${words[1][0]}` : (words[0] || fallback).slice(0, 2);
  return code.padEnd(2, 'X');
};

const brandSegment = (brand: string, type: ItemType) => twoDigitSegment(
  brand,
  type === 'Jasa' ? 'JS' : type === 'Group' ? 'GP' : type === 'Non Persediaan' ? 'NP' : 'NA'
);
const formatNumericInput = (value: number) => value ? value.toLocaleString('id-ID') : '';
const parseNumericInput = (value: string) => Number(value.replace(/\D/g, '')) || 0;

const emptyItem = {
  code: '',
  name: '',
  categoryId: '',
  type: 'Persediaan' as ItemType,
  brand: '',
  vehicleBrandId: '',
  unit: 'PCS',
  stock: 0,
  purchasePrice: 0,
  sellingPrice: 0,
  isActive: true,
  isQuickService: false,
  description: '',
  receiptDescription: '',
  barcode: '',
  groupMembers: [] as GroupMember[],
};

type ItemColumn = 'code' | 'name' | 'receiptDescription' | 'type' | 'category' | 'barcode' | 'price' | 'stock' | 'unit' | 'brand' | 'purchasePrice' | 'status' | 'actions';
const defaultItemColumns: ItemColumn[] = ['code', 'name', 'stock', 'unit', 'category', 'brand', 'actions'];
const itemColumnLabels: Record<ItemColumn, string> = {
  code: 'Kode',
  name: 'Nama Barang/Jasa',
  receiptDescription: 'Deskripsi Nota',
  type: 'Jenis',
  category: 'Kategori',
  barcode: 'Barcode',
  price: 'Harga Jual',
  stock: 'KTS/Stok',
  unit: 'Satuan',
  brand: 'Merek',
  purchasePrice: 'Harga Beli',
  status: 'Status Aktif',
  actions: 'Aksi',
};

const defaultItemColumnWidths: Record<ItemColumn, number> = {
  code: 140,
  name: 360,
  receiptDescription: 240,
  type: 140,
  category: 180,
  barcode: 180,
  price: 150,
  stock: 100,
  unit: 100,
  brand: 150,
  purchasePrice: 150,
  status: 120,
  actions: 100,
};

const emptyCategory = {
  code: '',
  name: '',
  type: 'Semua' as ItemCategory['type'],
  description: '',
  isActive: true,
};

const typeColors: Record<string, string> = {
  Persediaan: 'bg-blue-100 text-blue-800',
  Jasa: 'bg-green-100 text-green-800',
  'Non Persediaan': 'bg-yellow-100 text-yellow-800',
  Group: 'bg-purple-100 text-purple-800',
};

export default function ItemsAndServices() {
  const {
    data,
    addItem,
    updateItem,
    deleteItem,
    addItemCategory,
    updateItemCategory,
    deleteItemCategory,
    currentBranchId,
    resolveBranchId,
    hasPermission,
    currentUser,
    refreshData,
  } = useApp();

  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState('all');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [showItemModal, setShowItemModal] = useState(false);
  const [itemFormTab, setItemFormTab] = useState<'general' | 'sales' | 'stock' | 'account' | 'image' | 'other'>('general');
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importSuccess, setImportSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editingCategory, setEditingCategory] = useState<ItemCategory | null>(null);
  const [itemForm, setItemForm] = useState(emptyItem);
  const [vehicleBrands,setVehicleBrands]=useState<Array<{id:string;name:string;itemCode?:string;isActive:boolean}>>([]);
  useEffect(()=>{api.get<any>('vehicle-catalog').then(res=>setVehicleBrands(res.data?.brands||[])).catch(()=>setVehicleBrands([]));},[]);
  const [categoryForm, setCategoryForm] = useState(emptyCategory);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const columnStorageKey = `dokterac_item_columns_accurate_v2_${currentUser?.id || currentUser?.username || 'default'}`;
  const columnWidthStorageKey = `dokterac_item_column_widths_${currentUser?.id || currentUser?.username || 'default'}`;
  const [visibleColumns, setVisibleColumns] = useState<ItemColumn[]>(() => {
    try {
      const saved = localStorage.getItem(`dokterac_item_columns_accurate_v2_${currentUser?.id || currentUser?.username || 'default'}`);
      if (saved) return JSON.parse(saved) as ItemColumn[];
    } catch { /* gunakan default */ }
    return defaultItemColumns;
  });
  const [columnWidths, setColumnWidths] = useState<Record<ItemColumn, number>>(() => {
    try {
      const saved = localStorage.getItem(`dokterac_item_column_widths_${currentUser?.id || currentUser?.username || 'default'}`);
      if (saved) return { ...defaultItemColumnWidths, ...JSON.parse(saved) };
    } catch { /* gunakan default */ }
    return defaultItemColumnWidths;
  });

  const itemTableColumns = useMemo<ItemColumn[]>(() => [
    ...(visibleColumns.includes('code') ? ['code' as const] : []),
    'name',
    ...(['receiptDescription', 'type', 'category', 'barcode', 'stock', 'unit', 'brand', 'purchasePrice', 'status', 'price'] as ItemColumn[])
      .filter((column) => visibleColumns.includes(column)),
    'actions',
  ], [visibleColumns]);

  const tableMinWidth = useMemo(
    () => 40 + itemTableColumns.reduce((total, column) => total + columnWidths[column], 0),
    [itemTableColumns, columnWidths]
  );

  const beginColumnResize = (column: ItemColumn, event: ReactMouseEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columnWidths[column];
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (moveEvent: MouseEvent) => {
      const width = Math.max(column === 'name' ? 200 : 80, startWidth + moveEvent.clientX - startX);
      setColumnWidths((current) => ({ ...current, [column]: width }));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setColumnWidths((current) => {
        localStorage.setItem(columnWidthStorageKey, JSON.stringify(current));
        return current;
      });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const columnStyle = (column: ItemColumn) => ({ width: columnWidths[column], minWidth: columnWidths[column] });

  const setColumnVisible = (column: ItemColumn, visible: boolean) => {
    if (column === 'name' || column === 'actions') return;
    setVisibleColumns((current) => {
      const next = visible ? [...new Set([...current, column])] : current.filter((item) => item !== column);
      localStorage.setItem(columnStorageKey, JSON.stringify(next));
      return next;
    });
  };

  const resetColumns = () => {
    setVisibleColumns(defaultItemColumns);
    setColumnWidths(defaultItemColumnWidths);
    localStorage.setItem(columnStorageKey, JSON.stringify(defaultItemColumns));
    localStorage.setItem(columnWidthStorageKey, JSON.stringify(defaultItemColumnWidths));
  };

  const resizableHeader = (column: ItemColumn, label: string, align: 'left' | 'center' | 'right' = 'left') => (
    <div
      key={column}
      style={columnStyle(column)}
      className={`relative flex-shrink-0 px-3 py-2 ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}
    >
      <span className="block truncate">{label}</span>
      <span
        role="separator"
        aria-label={`Ubah lebar kolom ${label}`}
        onMouseDown={(event) => beginColumnResize(column, event)}
        className="absolute right-0 top-0 h-full w-2 cursor-col-resize border-r border-white/30 hover:bg-white/30"
      />
    </div>
  );

  // Group member picker state
  const [memberSearch, setMemberSearch] = useState('');
  const [isSavingItem, setIsSavingItem] = useState(false);

  const brands = useMemo(
    () => [...new Set(data.items.map((item) => item.brand).filter((b) => b && b !== '-'))],
    [data.items]
  );

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase();
    return data.items.filter((item) => {
      const activeMatch = filterActive === 'all' || (filterActive === 'active' ? item.isActive : !item.isActive);
      const categoryMatch = !filterCategory || item.categoryId === filterCategory;
      const typeMatch = !filterType || item.type === filterType;
      const brandMatch = !filterBrand || item.brand === filterBrand;
      const searchMatch =
        item.code.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.categoryName.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        (item.receiptDescription || '').toLowerCase().includes(q) ||
        (item.barcode || '').toLowerCase().includes(q);
      return activeMatch && categoryMatch && typeMatch && brandMatch && searchMatch;
    });
  }, [data.items, search, filterActive, filterCategory, filterType, filterBrand]);

  // Master barang bersifat global. Hanya saldo stok yang mengikuti cabang aktif.
  const displayStock = (item: Item) =>
    currentBranchId === 'ALL'
      ? item.stock
      : (item.branchStocks?.[currentBranchId]?.stock ?? 0);

  // Items available for group picking (exclude Groups and current item)
  const pickableItems = useMemo(() => {
    const editId = editingItem?.id;
    const q = memberSearch.toLowerCase();
    return data.items.filter((item) => {
      if (item.type === 'Group') return false;
      if (item.id === editId) return false;
      if (!item.isActive) return false;
      if (!q) return true;
      return item.code.toLowerCase().includes(q) || item.name.toLowerCase().includes(q) || (item.barcode || '').toLowerCase().includes(q);
    });
  }, [data.items, editingItem, memberSearch]);

  const nextItemCode = (type: ItemType, categoryId = itemForm.categoryId) => {
    const category = data.itemCategories.find(item => item.id === categoryId);
    const categoryCode = twoDigitSegment(category?.code || category?.name || '', '00');
    const selectedBrand=vehicleBrands.find(brand=>brand.id===itemForm.vehicleBrandId)||vehicleBrands.find(brand=>brand.name.toLowerCase()==='universal');
    const prefix = `${categoryCode}${(selectedBrand?.itemCode||'01').padStart(2,'0')}`;
    const maxSequence = data.items.reduce((max, item) => {
      const match = item.code.toUpperCase().match(new RegExp(`^${prefix}-(\\d{4})$`));
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `${prefix}-${String(maxSequence + 1).padStart(4, '0')}`;
  };

  const nextCategoryCode = () => `KAT-${String(data.itemCategories.length + 1).padStart(3, '0')}`;

  const memberSubtotal = (members: GroupMember[]) => members.reduce((sum, m) => sum + m.unitPrice * m.qty, 0);

  const itemTypeLocked = editingItem ? (
    Object.values(editingItem.branchStocks || {}).some(stock => Number(stock.stock) !== 0)
    || data.workOrders.some(wo => wo.services.some(service => service.itemId === editingItem.id))
    || data.invoices.some(invoice => invoice.items?.some(line => line.itemId === editingItem.id))
    || data.goodsReceipts.some(receipt => receipt.items.some(line => line.itemId === editingItem.id))
    || data.purchaseInvoices.some(invoice => invoice.items.some(line => line.itemId === editingItem.id))
    || data.items.some(item => item.groupMembers?.some(member => member.itemId === editingItem.id))
  ) : false;

  const openItemModal = (item?: Item) => {
    setItemFormTab('general');
    if (item) {
      setEditingItem(item);
      setItemForm({
        code: item.code,
        name: item.name,
        categoryId: item.categoryId,
        type: item.type,
        brand: item.brand,
        vehicleBrandId: item.vehicleBrandId || vehicleBrands.find(brand=>brand.name.toLowerCase()==='universal')?.id || '',
        unit: item.unit,
        stock: item.stock,
        purchasePrice: item.purchasePrice,
        sellingPrice: item.sellingPrice,
        isActive: item.isActive,
        isQuickService: item.isQuickService,
        description: item.description,
        receiptDescription: item.receiptDescription || '',
        barcode: item.barcode || '',
        groupMembers: item.groupMembers ? [...item.groupMembers] : [],
      });
    } else {
      setEditingItem(null);
      const defaultCategory = data.itemCategories.find(category => category.isActive);
      setItemForm({ ...emptyItem, categoryId: defaultCategory?.id || '', vehicleBrandId:vehicleBrands.find(brand=>brand.name.toLowerCase()==='universal')?.id||'', code: '', groupMembers: [] });
    }
    setMemberSearch('');
    setShowItemModal(true);
  };

  const openCategoryModal = (category?: ItemCategory) => {
    if (category) {
      setEditingCategory(category);
      setCategoryForm({
        code: category.code,
        name: category.name,
        type: 'Semua',
        description: category.description,
        isActive: category.isActive,
      });
    } else {
      setEditingCategory(null);
      setCategoryForm({ ...emptyCategory, code: nextCategoryCode() });
    }
    setShowCategoryModal(true);
  };

  const handleItemTypeChange = (type: ItemType) => {
    const isGroup = type === 'Group';
    const isJasa = type === 'Jasa';
    setItemForm((prev) => ({
      ...prev,
      type,
      code: editingItem ? prev.code : '',
      unit: isGroup ? 'PAKET' : isJasa ? 'JASA' : prev.unit === 'JASA' || prev.unit === 'PAKET' ? 'PCS' : prev.unit,
      stock: isGroup || isJasa ? 0 : prev.stock,
      purchasePrice: isGroup || isJasa ? 0 : prev.purchasePrice,
      brand: isGroup || isJasa ? '' : prev.brand,
      barcode: isGroup || isJasa ? '' : prev.barcode,
      isQuickService: isGroup || isJasa ? prev.isQuickService : false,
      groupMembers: isGroup ? prev.groupMembers : [],
    }));
  };

  const addGroupMember = (item: Item) => {
    const exists = itemForm.groupMembers.some((m) => m.itemId === item.id);
    if (exists) return;
    const member: GroupMember = {
      itemId: item.id,
      itemCode: item.code,
      itemName: item.name,
      itemType: item.type,
      qty: 1,
      unitPrice: item.sellingPrice,
    };
    setItemForm((prev) => ({ ...prev, groupMembers: [...prev.groupMembers, member] }));
    setMemberSearch('');
  };

  const updateMember = (itemId: string, field: 'qty', value: number) => {
    setItemForm((prev) => ({
      ...prev,
      groupMembers: prev.groupMembers.map((m) => m.itemId === itemId ? { ...m, [field]: value } : m),
    }));
  };

  const removeMember = (itemId: string) => {
    setItemForm((prev) => ({
      ...prev,
      groupMembers: prev.groupMembers.filter((m) => m.itemId !== itemId),
    }));
  };

  const saveItem = async (e: React.FormEvent) => {
    e.preventDefault();

    const code = editingItem?.code || nextItemCode(itemForm.type);
    const name = itemForm.name.trim().toUpperCase();

    if (!code || !name) {
      window.alert('Kode dan Nama barang/jasa wajib diisi.');
      return;
    }

    // Kode wajib unik
    const dupCode = data.items.find(
      i => i.code.trim().toUpperCase() === code && i.id !== editingItem?.id
    );
    if (dupCode) {
      window.alert(`Kode "${code}" sudah dipakai oleh "${dupCode.name}". Gunakan kode lain.`);
      return;
    }

    // Nama wajib unik
    const dupName = data.items.find(
      i => i.name.trim().toUpperCase() === name && i.id !== editingItem?.id
    );
    if (dupName) {
      window.alert(`Nama "${name}" sudah ada (kode ${dupName.code}). Gunakan nama lain.`);
      return;
    }

    const barcode = itemForm.barcode.trim();
    const dupBarcode = barcode && data.items.find(
      i => (i.barcode || '').trim() === barcode && i.id !== editingItem?.id
    );
    if (dupBarcode) {
      window.alert(`Barcode "${barcode}" sudah dipakai oleh "${dupBarcode.name}".`);
      return;
    }

    const category = data.itemCategories.find((cat) => cat.id === itemForm.categoryId);
    const isGroup = itemForm.type === 'Group';
    if (isGroup && itemForm.groupMembers.length === 0) {
      window.alert('Group/Paket wajib memiliki minimal satu barang atau jasa.');
      return;
    }
    const payload: Item = {
      id: editingItem?.id || Date.now().toString(),
      code,
      name,
      categoryId: itemForm.categoryId,
      categoryName: category?.name || '-',
      type: itemForm.type,
      brand: itemForm.brand,
      vehicleBrandId: itemForm.vehicleBrandId || undefined,
      unit: itemForm.unit,
      // Saldo stok dan harga beli dikelola oleh transaksi persediaan/pembelian,
      // bukan dari master Barang & Jasa.
      stock: editingItem?.stock ?? 0,
      sellableStock: editingItem?.sellableStock ?? 0,
      purchasePrice: editingItem?.purchasePrice ?? 0,
      sellingPrice: itemForm.sellingPrice,
      isActive: itemForm.isActive,
      isQuickService: itemForm.isQuickService,
      description: itemForm.description,
      receiptDescription: itemForm.receiptDescription.trim() || name,
      barcode,
      groupMembers: isGroup ? itemForm.groupMembers : undefined,
      branchId: editingItem?.branchId || resolveBranchId(),
    };

    setIsSavingItem(true);
    try {
      if (editingItem) await updateItem(editingItem.id, payload);
      else await addItem({ ...payload, autoCode: true } as Item & { autoCode: boolean });
      setShowItemModal(false);
    } catch (error: any) {
      window.alert(error?.message || 'Barang/Jasa gagal disimpan.');
    } finally {
      setIsSavingItem(false);
    }
  };

  const saveCategory = (e: React.FormEvent) => {
    e.preventDefault();

    const code = categoryForm.code.trim().toUpperCase();
    const name = categoryForm.name.trim();

    if (!code || !name) {
      window.alert('Kode dan Nama kategori wajib diisi.');
      return;
    }

    // Validasi UNIQUE kode
    const dupCode = data.itemCategories.find(
      c => c.code.trim().toUpperCase() === code && c.id !== editingCategory?.id
    );
    if (dupCode) {
      window.alert(`Kode kategori "${code}" sudah dipakai oleh "${dupCode.name}". Gunakan kode lain.`);
      return;
    }

    // Validasi UNIQUE nama
    const dupName = data.itemCategories.find(
      c => c.name.trim().toLowerCase() === name.toLowerCase() && c.id !== editingCategory?.id
    );
    if (dupName) {
      window.alert(`Nama kategori "${name}" sudah ada (kode ${dupName.code}). Gunakan nama lain.`);
      return;
    }

    const payload: ItemCategory = {
      id: editingCategory?.id || Date.now().toString(),
      ...categoryForm,
      type: 'Semua',
      code,
      name,
    };
    if (editingCategory) updateItemCategory(editingCategory.id, payload);
    else addItemCategory(payload);
    setShowCategoryModal(false);
  };

  const removeItem = (item: Item) => {
    // Check if used as group member
    const usedInGroup = data.items.some((i) => i.groupMembers?.some((m) => m.itemId === item.id));
    if (usedInGroup) {
      window.alert('Item ini masih digunakan di dalam Group lain. Hapus dari Group terlebih dahulu.');
      return;
    }
    if (window.confirm(`Hapus barang/jasa "${item.name}"?`)) deleteItem(item.id);
  };

  // ==================== IMPORT / EXPORT CSV ====================
  // ==================== EXPORT / TEMPLATE ====================
  const downloadTemplate = () => {
    const headers = ['kode', 'nama', 'deskripsi_nota', 'barcode', 'jenis', 'kategori', 'merek', 'satuan', 'harga_jual', 'layanan_cepat', 'keterangan'];
    const sampleRows = [
      ['BRG-0001', 'CONTOH SPAREPART AC', 'Sparepart AC', '8991234567890', 'Persediaan', 'Sparepart AC', 'Denso', 'PCS', '250000', 'tidak', 'Contoh keterangan'],
      ['JSA-0001', 'CONTOH JASA SERVICE', 'Jasa Service AC', '', 'Jasa', 'Jasa Service AC', '-', 'JASA', '200000', 'ya', 'Jasa teknisi'],
      ['NP-0001', 'CONTOH TOOLS', 'Tools Bengkel', '', 'Non Persediaan', 'Tools Bengkel', 'Krisbow', 'PCS', '', 'tidak', 'Harga jual boleh kosong'],
    ];
    const csv = [headers.join(','), ...sampleRows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'template_import_barang_jasa.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportCurrentData = () => {
    const processId = startSystemProcess('Export Barang & Jasa', `Menyiapkan ${data.items.length} item`);
    const headers = ['kode', 'nama', 'deskripsi_nota', 'barcode', 'jenis', 'kategori', 'merek', 'satuan', 'stok', 'harga_beli', 'harga_jual', 'layanan_cepat', 'keterangan'];
    const rows = data.items
      .filter(i => i.type !== 'Group')
      .map(item => [
        item.code, item.name, item.receiptDescription || item.name, item.barcode || '', item.type, item.categoryName || '',
        item.brand || '', item.unit || '', item.stock, item.purchasePrice,
        item.sellingPrice, item.isQuickService ? 'ya' : 'tidak', item.description || ''
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `barang_jasa_${localDateKey()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    finishSystemProcess(processId, `${rows.length} item berhasil diekspor`);
  };

  // ==================== CSV PARSER ====================
  const parseCSV = (text: string): string[][] => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    return lines.map(line => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
          else inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      result.push(current.trim());
      return result;
    });
  };

  // ==================== ALIAS MAPPING UNTUK ACCURATE ONLINE ====================
  const fieldAliases: Record<string, string[]> = {
    kode: ['kode', 'kode barang', 'kode_barang', 'item code', 'code', 'kode item', 'sku', 'kode#'],
    nama: ['nama', 'nama barang', 'nama_barang', 'item name', 'name', 'deskripsi barang', 'nama jasa', 'nama barang/jasa'],
    deskripsi_nota: ['deskripsi nota', 'deskripsi_nota', 'nama nota', 'receipt description', 'invoice description'],
    barcode: ['barcode', 'barcode asli', 'ean', 'upc', 'kode barcode'],
    jenis: ['jenis', 'jenis barang', 'jenis_barang', 'tipe', 'type', 'item type', 'tipe barang'],
    kategori: ['kategori', 'kategori barang', 'kategori_barang', 'category', 'kelompok', 'group kategori', 'grup'],
    merek: ['merek', 'merek barang', 'merek_barang', 'brand', 'merk', 'merek barang/jasa'],
    satuan: ['satuan', 'sat', 'unit', 'uom', 'satu', 'satuan barang'],
    stok: ['stok', 'kts', 'kuantitas', 'qty', 'stok dapat dijual', 'stock', 'jumlah', 'kuantitas (gdng', 'kts (gdng', 'kts (gudang', 'stok gudang', 'quantity'],
    harga_beli: ['harga beli', 'harga_beli', 'beli', 'purchase price', 'hpp', 'cost', 'harga beli satuan', 'modal'],
    harga_jual: ['harga jual', 'harga_jual', 'jual', 'selling price', 'harga satuan', 'harga', 'sales price', 'harga jual satuan'],
    layanan_cepat: ['layanan cepat', 'layanan_cepat', 'quick', 'template', 'fast', 'layanan', 'quick service'],
    keterangan: ['keterangan', 'deskripsi', 'description', 'notes', 'catatan', 'ket', 'remark'],
  };

  const normalizeHeader = (h: string) => h.toLowerCase().trim().replace(/[_#]+/g, ' ').replace(/\s+/g, ' ').replace(/\([^)]*\)/g, '').trim();

  const findHeaderIndex = (headersLower: string[], field: string): number => {
    const aliases = fieldAliases[field] || [];
    // Exact match first
    for (let i = 0; i < headersLower.length; i++) {
      const h = normalizeHeader(headersLower[i]);
      for (const alias of aliases) {
        if (h === alias) return i;
      }
    }
    // Contains match
    for (let i = 0; i < headersLower.length; i++) {
      const h = normalizeHeader(headersLower[i]);
      for (const alias of aliases) {
        if (h.includes(alias) || alias.includes(h)) return i;
      }
    }
    return -1;
  };

  const parseNumber = (val: any): number => {
    if (val === null || val === undefined) return 0;
    const s = String(val).trim();
    if (!s || s === '-' || s.toLowerCase() === 'null') return 0;
    // Remove Rp, %, etc, keep digits, dot, comma, minus
    // Handle Indonesian format: 1.550.000 -> 1550000, 1,5 -> 1.5
    let cleaned = s.replace(/[^0-9,.\-]/g, '');
    // If contains both . and , -> assume . thousands and , decimal (1.234,56)
    // Remove . thousands, replace , with .
    if (cleaned.includes('.') && cleaned.includes(',')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (cleaned.includes(',') && !cleaned.includes('.')) {
      // Could be 1,000 -> if 3 digits after comma -> thousands, else decimal
      const parts = cleaned.split(',');
      if (parts[1] && parts[1].length === 3) {
        cleaned = cleaned.replace(/,/g, '');
      } else {
        cleaned = cleaned.replace(',', '.');
      }
    } else if (cleaned.includes('.')) {
      // If multiple dots like 1.550.000
      if ((cleaned.match(/\./g) || []).length > 1) {
        cleaned = cleaned.replace(/\./g, '');
      }
    }
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : Math.floor(n); // use floor for qty/stock-like, but okay for price
  };

  const mapJenis = (raw: string): ItemType | null => {
    const v = String(raw).toLowerCase();
    if (v.includes('grup') || v.includes('group')) return 'Group';
    if (v.includes('jasa')) return 'Jasa';
    if (v.includes('non') && v.includes('persed')) return 'Non Persediaan';
    if (v.includes('non persediaan')) return 'Non Persediaan';
    if (v.includes('varian')) return 'Persediaan'; // Varian di Accurate = barang persediaan dengan varian
    if (v.includes('persed')) return 'Persediaan';
    // Fallback check exact
    if (['persediaan', 'jasa', 'non persediaan', 'group', 'grup'].includes(v.trim())) {
      if (v.trim() === 'grup') return 'Group';
      return (v.charAt(0).toUpperCase() + v.slice(1)) as ItemType;
    }
    return null;
  };

  const processRowsToPreview = (headersRaw: string[], dataRows: string[][]) => {
    const headersLower = headersRaw.map(h => h.toLowerCase().trim());
    const idxKode = findHeaderIndex(headersLower, 'kode');
    const idxNama = findHeaderIndex(headersLower, 'nama');
    const idxDeskripsiNota = findHeaderIndex(headersLower, 'deskripsi_nota');
    const idxBarcode = findHeaderIndex(headersLower, 'barcode');
    const idxJenis = findHeaderIndex(headersLower, 'jenis');
    const idxKategori = findHeaderIndex(headersLower, 'kategori');
    const idxMerek = findHeaderIndex(headersLower, 'merek');
    const idxSatuan = findHeaderIndex(headersLower, 'satuan');
    const idxHargaJual = findHeaderIndex(headersLower, 'harga_jual');
    const idxLayanan = findHeaderIndex(headersLower, 'layanan_cepat');
    const idxKet = findHeaderIndex(headersLower, 'keterangan');

    const isAccurateMode = headersLower.some(h => h.includes('kode barang') || h.includes('nama barang') || h.includes('jenis barang'));

    const errors: string[] = [];
    const preview: any[] = [];

    // Kategori baru yang dibuat selama proses import ini.
    // Key = nama kategori huruf kecil, supaya tidak terduplikasi antar baris.
    const newCategoryMap = new Map<string, ItemCategory>();
    let autoCatSeq = data.itemCategories.reduce((max, c) => {
      const n = parseInt(String(c.code).replace(/\D/g, '')) || 0;
      return n > max ? n : max;
    }, 0);

    if (idxKode === -1 || idxNama === -1) {
      setImportErrors([`Header wajib tidak ditemukan (butuh Kode Barang & Nama Barang). Terdeteksi header: ${headersRaw.join(', ')}. Untuk Accurate: pastikan export Barang & Jasa lengkap.`]);
      return;
    }

    dataRows.forEach((row, rowIdx) => {
      if (row.every(c => !String(c).trim())) return; // skip empty

      const getByIdx = (idx: number) => (idx >= 0 && idx < row.length ? String(row[idx] ?? '').trim() : '');

      const codeRaw = getByIdx(idxKode);
      const nameRaw = getByIdx(idxNama);
      const deskripsiNotaRaw = idxDeskripsiNota >= 0 ? getByIdx(idxDeskripsiNota) : '';
      const barcodeRaw = idxBarcode >= 0 ? getByIdx(idxBarcode) : '';
      const jenisRaw = idxJenis >= 0 ? getByIdx(idxJenis) : 'Persediaan';
      const kategoriRaw = idxKategori >= 0 ? getByIdx(idxKategori) : '';
      const merekRaw = idxMerek >= 0 ? getByIdx(idxMerek) : '';
      const satuanRaw = idxSatuan >= 0 ? getByIdx(idxSatuan) : 'PCS';
      const hargaJualRaw = idxHargaJual >= 0 ? getByIdx(idxHargaJual) : '0';
      const layananRaw = idxLayanan >= 0 ? getByIdx(idxLayanan) : '';
      const ketRaw = idxKet >= 0 ? getByIdx(idxKet) : '';

      const code = codeRaw.toUpperCase().trim();
      const name = nameRaw.toUpperCase().trim();
      const kategori = kategoriRaw.trim();
      const merek = merekRaw.trim();
      const satuan = satuanRaw.toUpperCase() || 'PCS';
      const hargaJual = parseNumber(hargaJualRaw);
      const layananCepat = layananRaw.toLowerCase();

      // Jenis mapping
      let jenis: ItemType | null = mapJenis(jenisRaw);
      if (!jenis) {
        // Default fallback for Accurate: if no jenis column, assume Persediaan unless name contains JASA
        if (isAccurateMode) jenis = name.includes('JASA') || name.includes('BLOWER (INPUT)') ? 'Jasa' as ItemType : 'Persediaan';
        else jenis = 'Persediaan';
      }

      // Skip Group type from import (needs special handling)
      if (jenis === 'Group') {
        // For Group import from Accurate, treat as Group but with empty members - will need manual edit
        // Still allow but warn
      }

      const rowErrs: string[] = [];
      if (!code) rowErrs.push(`Baris ${rowIdx + 2}: kode kosong`);
      if (!name) rowErrs.push(`Baris ${rowIdx + 2}: nama kosong`);
      if (!jenis) rowErrs.push(`Baris ${rowIdx + 2}: jenis "${jenisRaw}" tidak dikenali`);

      // Kode barang wajib unik
      if (code && data.items.some(x => x.code.toUpperCase() === code)) {
        rowErrs.push(`Baris ${rowIdx + 2}: kode "${code}" sudah ada di sistem`);
      }
      if (code && preview.some(x => x.code === code)) {
        rowErrs.push(`Baris ${rowIdx + 2}: kode "${code}" duplikat dalam file`);
      }

      // Nama barang/jasa wajib unik
      if (name && data.items.some(x => x.name.trim().toUpperCase() === name)) {
        const existing = data.items.find(x => x.name.trim().toUpperCase() === name);
        rowErrs.push(`Baris ${rowIdx + 2}: nama "${name}" sudah ada di sistem (kode ${existing?.code})`);
      }
      if (name && preview.some(x => x.name === name)) {
        rowErrs.push(`Baris ${rowIdx + 2}: nama "${name}" duplikat dalam file`);
      }
      if (barcodeRaw && data.items.some(x => (x.barcode || '') === barcodeRaw)) {
        rowErrs.push(`Baris ${rowIdx + 2}: barcode "${barcodeRaw}" sudah ada di sistem`);
      }
      if (barcodeRaw && preview.some(x => x.barcode === barcodeRaw)) {
        rowErrs.push(`Baris ${rowIdx + 2}: barcode "${barcodeRaw}" duplikat dalam file`);
      }

      // Untuk Accurate: Varian tetap bisa diimport sebagai Persediaan (hanya info)
      if (jenisRaw.toLowerCase().includes('varian')) {
        jenis = 'Persediaan';
      }

      if (rowErrs.length > 0) {
        errors.push(...rowErrs);
        return;
      }

      // ---- Resolusi kategori (anti-duplikat) ----
      const katKey = kategori.toLowerCase();
      let category: ItemCategory | undefined;
      let isNewCategory = false;

      if (kategori) {
        // 1) Cari di kategori yang sudah tersimpan di sistem
        category = data.itemCategories.find(
          c => c.name.trim().toLowerCase() === katKey || c.code.trim().toLowerCase() === katKey
        );

        // 2) Cari di kategori yang baru dibuat pada file import ini
        if (!category && newCategoryMap.has(katKey)) {
          category = newCategoryMap.get(katKey);
        }

        // 3) Belum ada di mana pun -> buat sekali saja, lalu simpan ke map
        if (!category) {
          autoCatSeq += 1;
          category = {
            id: `${Date.now()}-cat-${autoCatSeq}`,
            code: `KAT-${String(autoCatSeq).padStart(3, '0')}`,
            name: kategori,
            type: 'Semua',
            description: 'Dibuat otomatis saat import',
            isActive: true,
          };
          newCategoryMap.set(katKey, category);
          isNewCategory = true; // hanya baris pertama yang menandai kategori ini baru
        }
      }

      if (!category) {
        category = data.itemCategories[0];
      }

      preview.push({
        _isNewCategory: isNewCategory,
        _category: category,
        _isAccurate: isAccurateMode,
        code, name,
        type: jenis as ItemType,
        categoryId: category?.id || '',
        categoryName: category?.name || '',
        brand: merek === '-' || merek.toLowerCase() === 'null' ? '' : merek,
        unit: satuan || 'PCS',
        stock: 0,
        sellableStock: 0,
        purchasePrice: 0,
        sellingPrice: hargaJual,
        isActive: true,
        isQuickService: ['ya', 'yes', 'y', '1', 'true', 'cepat'].includes(layananCepat) || (jenis === 'Jasa' && isAccurateMode), // auto quick service for Jasa from Accurate
        description: ketRaw,
        receiptDescription: deskripsiNotaRaw || name,
        barcode: barcodeRaw,
      });
    });

    setImportPreview(preview);
    setImportErrors(errors);
    if (preview.length > 0 && errors.length === 0 && isAccurateMode) {
      // Actually setAccurate flag is internal, but we used local variable; we should detect again?
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportErrors([]);
    setImportSuccess('');
    setImportPreview([]);

    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith('.xlsx');

    try {
      if (isExcel) {
        // Gunakan parser XLSX yang tidak membawa advisori keamanan SheetJS.
        const { default: readXlsxFile } = await import('read-excel-file');
        const parsedRows = await readXlsxFile(file);
        const rows: string[][] = parsedRows.map(row => row.map(value => value == null ? '' : String(value)));
        if (rows.length < 2) {
          setImportErrors(['File Excel kosong atau hanya berisi header']);
          return;
        }
        const headers = rows[0];
        const dataRows = rows.slice(1);
        processRowsToPreview(headers, dataRows);
      } else {
        // CSV/TXT
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const text = ev.target?.result as string;
            const rows = parseCSV(text);
            if (rows.length < 2) {
              setImportErrors(['File CSV kosong atau hanya berisi header']);
              return;
            }
            const headers = rows[0];
            const dataRows = rows.slice(1);
            processRowsToPreview(headers, dataRows);
          } catch (err: any) {
            setImportErrors(['Gagal parse file CSV: ' + err.message]);
          }
        };
        reader.readAsText(file, 'UTF-8');
      }
    } catch (err: any) {
      setImportErrors(['Gagal membaca file: ' + err.message]);
    } finally {
      // Reset input so same file can be re-uploaded
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const confirmImport = async () => {
    if (importPreview.length === 0) return;
    const processId = startSystemProcess('Import Barang & Jasa', `0 dari ${importPreview.length} baris`);
    let success = 0, failed = 0;
    const createdCategoryIds = new Set<string>();

    const createdCategoryNames = new Set(
      data.itemCategories.map(c => c.name.trim().toLowerCase())
    );

    for (let rowIndex = 0; rowIndex < importPreview.length; rowIndex++) {
      const row = importPreview[rowIndex];
      try {
        // Kategori hanya dibuat sekali: cek berdasarkan ID dan nama.
        const catName = String(row._category?.name || '').trim().toLowerCase();
        if (
          row._isNewCategory &&
          row._category &&
          !createdCategoryIds.has(row._category.id) &&
          !createdCategoryNames.has(catName)
        ) {
          await addItemCategory({
            id: row._category.id, code: row._category.code, name: row._category.name,
            type: 'Semua', description: row._category.description, isActive: row._category.isActive
          });
          createdCategoryIds.add(row._category.id);
          createdCategoryNames.add(catName);
        }
        await addItem({
          id: Date.now().toString() + Math.random().toString(36).slice(2, 5),
          code: row.code, name: row.name, categoryId: row.categoryId, categoryName: row.categoryName,
          type: row.type, brand: row.brand, unit: row.unit,
          stock: row.stock, sellableStock: row.sellableStock,
          purchasePrice: row.purchasePrice, sellingPrice: row.sellingPrice,
          isActive: row.isActive, isQuickService: row.isQuickService,
          description: row.description,
          receiptDescription: row.receiptDescription,
          barcode: row.barcode,
          branchId: resolveBranchId(),
        });
        success++;
      } catch (err) {
        failed++;
      }
      updateSystemProcess(processId, ((rowIndex + 1) / importPreview.length) * 100, `${rowIndex + 1} dari ${importPreview.length} baris`);
    }
    if (success === 0 && failed > 0) failSystemProcess(processId, `${failed} baris gagal diimport`);
    else finishSystemProcess(processId, `${success} berhasil${failed > 0 ? `, ${failed} gagal` : ''}`);
    setImportSuccess(`✅ ${success} barang berhasil diimport${failed > 0 ? `, ${failed} gagal` : ''}!`);
    setImportPreview([]);
    setTimeout(() => {
      setShowImportModal(false);
      setImportSuccess('');
    }, 3000);
  };

  const removeCategory = (category: ItemCategory) => {
    const usedItems = data.items.filter((item) => item.categoryId === category.id);
    if (usedItems.length > 0) {
      const names = usedItems.slice(0, 5).map(i => `• ${i.code} - ${i.name}`).join('\n');
      window.alert(
        `Kategori "${category.name}" tidak bisa dihapus.\n\n` +
        `Masih dipakai oleh ${usedItems.length} barang/jasa:\n${names}` +
        (usedItems.length > 5 ? `\n… dan ${usedItems.length - 5} lainnya` : '') +
        `\n\nPindahkan item ke kategori lain terlebih dahulu.`
      );
      return;
    }
    if (window.confirm(`Hapus kategori "${category.name}" (${category.code})?`)) {
      deleteItemCategory(category.id);
    }
  };

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const formatCurrency = (v: number) => `Rp ${v.toLocaleString('id-ID')}`;

  return (
    <div className="space-y-0">
      <div className="flex h-11 items-stretch border-b border-slate-300 bg-[#eeeeee]">
        <button type="button" onClick={() => setShowItemModal(false)} title="Daftar Barang & Jasa" className={`flex w-16 items-center justify-center rounded-t-md border border-b-0 border-slate-400 ${showItemModal ? 'bg-[#58c915] text-white' : 'bg-white text-slate-800'}`}>
          <List className="h-5 w-5" />
        </button>
        {showItemModal && (
          <div className="flex items-center gap-2 rounded-t-md border-x border-t-2 border-blue-600 bg-white px-4 text-sm font-semibold text-blue-700">
            {editingItem ? editingItem.code : 'Data Baru'}
            <button type="button" onClick={() => setShowItemModal(false)} className="ml-1 text-slate-500 hover:text-red-600"><X className="h-4 w-4" /></button>
          </div>
        )}
      </div>
      {!showItemModal && <div className="space-y-3 px-1 lg:space-y-0 lg:px-0">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:hidden">
        <div className="lg:hidden">
          <h2 className="text-2xl font-bold text-gray-900">Barang & Jasa</h2>
          <p className="mt-1 text-gray-500">Kelola master sparepart, bahan, jasa service, group, dan kategori.</p>
        </div>
        <div className="flex flex-wrap gap-2 lg:ml-auto">
          {hasPermission('item:create') && (
            <>
              <button
                onClick={() => { setShowImportModal(true); setImportPreview([]); setImportErrors([]); setImportSuccess(''); }}
                className="inline-flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 font-medium text-green-700 transition-colors hover:bg-green-100"
                title="Import barang & jasa dari file CSV / Excel"
              >
                <Upload className="h-4 w-4" /> Import CSV
              </button>
              <button
                onClick={exportCurrentData}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-50"
                title="Download semua data ke CSV"
              >
                <Download className="h-4 w-4" /> Export
              </button>
              <button onClick={() => openCategoryModal()} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 font-medium text-blue-700 transition-colors hover:bg-blue-100">
                <FolderTree className="h-4 w-4" /> Kategori Baru
              </button>
              <button onClick={() => openItemModal()} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-700">
                <Plus className="h-4 w-4" /> Barang/Jasa Baru
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5 lg:hidden">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Total Item</p>
          <p className="text-2xl font-bold text-gray-900">{data.items.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Persediaan</p>
          <p className="text-2xl font-bold text-blue-600">{data.items.filter((i) => i.type === 'Persediaan').length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Jasa</p>
          <p className="text-2xl font-bold text-green-600">{data.items.filter((i) => i.type === 'Jasa').length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Group</p>
          <p className="text-2xl font-bold text-purple-600">{data.items.filter((i) => i.type === 'Group').length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Kategori</p>
          <p className="text-2xl font-bold text-orange-600">{data.itemCategories.length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="border border-slate-300 bg-[#eeeeee] p-3 shadow-sm lg:border-x-0 lg:border-t-0 lg:shadow-none">
        <div className="flex flex-wrap items-center gap-3">
          <select value={filterActive} onChange={(e) => setFilterActive(e.target.value)} className="h-10 rounded border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500">
            <option value="all">Non Aktif: Semua</option><option value="active">Non Aktif: Tidak</option><option value="inactive">Non Aktif: Ya</option>
          </select>
          <select value={filterBrand} onChange={(e) => setFilterBrand(e.target.value)} className="h-10 rounded border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500"><option value="">Merek Barang: Semua</option>{brands.map((brand) => <option key={brand} value={brand}>{brand}</option>)}</select>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="h-10 rounded border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500"><option value="">Kategori Barang: Semua</option>{data.itemCategories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="h-10 rounded border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500"><option value="">Jenis Barang: Semua</option>{allItemTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select>
          <button type="button" className="flex h-10 w-12 items-center justify-center rounded border border-blue-500 bg-blue-50 text-blue-700" title="Filter lanjutan"><Filter className="h-5 w-5" /></button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            {hasPermission('item:create') && <button onClick={() => openItemModal()} title="Data Baru" className="flex h-11 w-16 items-center justify-center rounded bg-blue-800 text-white hover:bg-blue-900"><Plus className="h-6 w-6" /></button>}
            <button type="button" onClick={() => refreshData()} title="Refresh" className="flex h-11 w-12 items-center justify-center rounded border border-blue-600 bg-white text-blue-700 hover:bg-blue-50"><RefreshCw className="h-5 w-5" /></button>
          </div>
          <div className="relative flex items-center gap-2">
            <button type="button" onClick={exportCurrentData} title="Download / Export" className="flex h-10 w-12 items-center justify-center rounded border border-blue-600 bg-white text-blue-700"><Download className="h-5 w-5" /></button>
            {hasPermission('item:create') && <button type="button" onClick={() => { setShowImportModal(true); setImportPreview([]); setImportErrors([]); setImportSuccess(''); }} title="Import" className="flex h-10 w-12 items-center justify-center rounded border border-blue-600 bg-white text-blue-700"><Share2 className="h-5 w-5" /></button>}
            <button type="button" onClick={() => window.print()} title="Cetak" className="flex h-10 w-12 items-center justify-center rounded border border-blue-600 bg-white text-blue-700"><Printer className="h-5 w-5" /></button>
            <button type="button" onClick={() => setShowColumnSettings(value => !value)} title="Pengaturan Kolom" className="flex h-10 w-12 items-center justify-center rounded border border-blue-600 bg-white text-blue-700"><Settings2 className="h-5 w-5" /></button>
            <div className="relative w-72"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ketik dan [Enter]" className="h-10 w-full rounded border border-slate-300 bg-white px-3 pr-10 outline-none focus:border-blue-500" /><Search className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-900" /></div>
            <span className="flex h-10 min-w-16 items-center justify-center rounded border border-slate-300 bg-white px-3 text-sm text-slate-600">{filteredItems.length}</span>
            {showColumnSettings && (
              <div className="absolute right-0 top-12 z-30 w-72 rounded border border-slate-300 bg-white p-4 shadow-xl">
                <div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-bold">Kolom Ditampilkan</p><p className="text-[10px] text-slate-500">Tersimpan untuk pengguna ini</p></div><button type="button" onClick={() => setShowColumnSettings(false)}><X className="h-4 w-4" /></button></div>
                {(Object.keys(itemColumnLabels) as ItemColumn[]).map(column => { const required = column === 'name' || column === 'actions'; return <label key={column} className="flex items-center justify-between px-2 py-1.5 text-sm"><span>{itemColumnLabels[column]}</span><input type="checkbox" disabled={required} checked={required || visibleColumns.includes(column)} onChange={event => setColumnVisible(column, event.target.checked)} /></label>; })}
                <button type="button" onClick={resetColumns} className="mt-2 w-full rounded border px-3 py-2 text-xs">Kembalikan Default</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-t-lg border border-slate-300 bg-white lg:rounded-none lg:border-x-0 lg:border-t-0">
        <div className="hidden items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Filter className="h-4 w-4" />
            Menampilkan {filteredItems.length} dari {data.items.length} item
          </div>
          <div className="relative flex items-center gap-2">
            <button type="button" onClick={() => setShowColumnSettings((value) => !value)} className="hidden items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 lg:inline-flex">
              <Settings2 className="h-4 w-4" /> Atur Kolom
            </button>
            <span className="text-sm font-medium text-gray-600">{data.items.length}</span>
            {showColumnSettings && (
              <div className="absolute right-0 top-11 z-30 hidden w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-xl lg:block">
                <div className="mb-3 flex items-center justify-between">
                  <div><p className="text-sm font-bold text-gray-900">Kolom Ditampilkan</p><p className="text-[10px] text-gray-500">Tersimpan untuk pengguna ini</p></div>
                  <button type="button" onClick={() => setShowColumnSettings(false)} className="rounded p-1 hover:bg-gray-100"><X className="h-4 w-4" /></button>
                </div>
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {(Object.keys(itemColumnLabels) as ItemColumn[]).map((column) => {
                    const required = column === 'name' || column === 'actions';
                    return <label key={column} className={`flex items-center justify-between rounded-lg px-2 py-2 text-sm ${required ? 'bg-gray-50 text-gray-500' : 'cursor-pointer hover:bg-blue-50'}`}><span>{itemColumnLabels[column]}</span><input type="checkbox" disabled={required} checked={required || visibleColumns.includes(column)} onChange={(event) => setColumnVisible(column, event.target.checked)} className="h-4 w-4 rounded text-blue-600" /></label>;
                  })}
                </div>
                <button type="button" onClick={resetColumns} className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50">Kembalikan Default</button>
              </div>
            )}
          </div>
        </div>
        <div className="max-h-[calc(100vh-420px)] overflow-auto lg:max-h-[calc(100vh-265px)]">
          <table className="w-full table-fixed" style={{ minWidth: tableMinWidth }}>
            <thead className="sticky top-0 z-10 bg-[#637c93] text-white">
              <tr>
                <th colSpan={9} className="p-0">
                  <div className="flex items-center text-sm font-medium" style={{ minWidth: tableMinWidth }}>
                    <div className="w-10 flex-shrink-0 px-2 py-3"></div>
                    {visibleColumns.includes('code') && resizableHeader('code', 'Kode Barang')}
                    {resizableHeader('name', 'Nama Barang')}
                    {visibleColumns.includes('receiptDescription') && resizableHeader('receiptDescription', 'Deskripsi Nota')}
                    {visibleColumns.includes('type') && resizableHeader('type', 'Jenis')}
                    {visibleColumns.includes('category') && resizableHeader('category', 'Kategori')}
                    {visibleColumns.includes('barcode') && resizableHeader('barcode', 'Barcode')}
                    {visibleColumns.includes('stock') && resizableHeader('stock', 'KTS', 'right')}
                    {visibleColumns.includes('unit') && resizableHeader('unit', 'Satuan')}
                    {visibleColumns.includes('brand') && resizableHeader('brand', 'Merek')}
                    {visibleColumns.includes('purchasePrice') && resizableHeader('purchasePrice', 'Harga Beli', 'right')}
                    {visibleColumns.includes('status') && resizableHeader('status', 'Status', 'center')}
                    {visibleColumns.includes('price') && resizableHeader('price', 'Harga Jual', 'right')}
                    {resizableHeader('actions', 'Aksi', 'center')}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                    <Boxes className="mx-auto mb-3 h-12 w-12 text-gray-300" />
                    Tidak ada barang/jasa ditemukan
                  </td>
                </tr>
              ) : filteredItems.map((item) => {
                const isGroup = item.type === 'Group' && item.groupMembers && item.groupMembers.length > 0;
                const expanded = expandedGroups.has(item.id);
                return (
                    <tr key={item.id} className={`group ${!item.isActive ? 'bg-red-50/50 opacity-75' : ''}`}>
                    <td colSpan={9} className="p-0">
                      {/* Main row */}
                      <div style={{ minWidth: tableMinWidth }} className={`flex items-center transition-colors hover:bg-blue-50/50 ${isGroup ? 'cursor-pointer' : ''}`} onClick={isGroup ? () => toggleGroup(item.id) : undefined}>
                        <div className="w-10 flex-shrink-0 px-2 py-3 text-center">
                          {isGroup ? (
                            expanded ? <ChevronUp className="mx-auto h-4 w-4 text-purple-500" /> : <ChevronDown className="mx-auto h-4 w-4 text-purple-500" />
                          ) : null}
                        </div>
                        {visibleColumns.includes('code') && <div style={columnStyle('code')} className="flex-shrink-0 px-3 py-3 font-mono text-sm text-gray-900">{item.code}</div>}
                        <div style={columnStyle('name')} className="flex-shrink-0 overflow-hidden px-3 py-3">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900">{item.name}</p>
                            {!item.isActive && <span className="rounded-full border border-red-200 bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">NONAKTIF</span>}
                            {isGroup && (
                              <span className="inline-flex items-center gap-1 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                                <Layers className="h-3 w-3" /> {item.groupMembers!.length} item
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">{item.description || ''}</p>
                        </div>
                        {visibleColumns.includes('receiptDescription') && <div style={columnStyle('receiptDescription')} className="flex-shrink-0 truncate px-3 py-3 text-sm text-gray-700" title={item.receiptDescription || item.name}>{item.receiptDescription || item.name}</div>}
                        {visibleColumns.includes('type') && <div style={columnStyle('type')} className="flex-shrink-0 px-3 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${typeColors[item.type] || 'bg-gray-100 text-gray-700'}`}>
                            {item.type}
                          </span>
                        </div>}
                        {visibleColumns.includes('category') && <div style={columnStyle('category')} className="flex-shrink-0 truncate px-3 py-3 text-sm text-gray-700">{item.categoryName}</div>}
                        {visibleColumns.includes('barcode') && <div style={columnStyle('barcode')} className="flex-shrink-0 truncate px-3 py-3 font-mono text-xs text-gray-700" title={item.barcode}>{item.barcode || '—'}</div>}
                        {visibleColumns.includes('stock') && <div style={columnStyle('stock')} className="flex-shrink-0 px-3 py-3 text-right text-sm font-semibold text-gray-900">{item.type === 'Persediaan' ? displayStock(item) : '—'}</div>}
                        {visibleColumns.includes('unit') && <div style={columnStyle('unit')} className="flex-shrink-0 px-3 py-3 text-sm text-gray-700">{item.unit}</div>}
                        {visibleColumns.includes('brand') && <div style={columnStyle('brand')} className="flex-shrink-0 truncate px-3 py-3 text-sm text-gray-700">{item.brand || '—'}</div>}
                        {visibleColumns.includes('purchasePrice') && <div style={columnStyle('purchasePrice')} className="flex-shrink-0 px-3 py-3 text-right text-sm text-gray-700">{formatCurrency(item.purchasePrice)}</div>}
                        {visibleColumns.includes('status') && <div style={columnStyle('status')} className="flex-shrink-0 px-3 py-3 text-center text-xs font-semibold">{item.isActive ? <span className="text-green-700">Aktif</span> : <span className="text-red-700">Nonaktif</span>}</div>}
                        {visibleColumns.includes('price') && <div style={columnStyle('price')} className="flex-shrink-0 px-3 py-3 text-right text-sm font-medium text-gray-900">{formatCurrency(item.sellingPrice)}</div>}
                        <div style={columnStyle('actions')} className="flex-shrink-0 px-3 py-3">
                          <div className="flex justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                            {hasPermission('item:edit') && (
                              <button onClick={() => openItemModal(item)} className="rounded-lg p-1.5 text-blue-600 transition-colors hover:bg-blue-100" title="Edit"><Edit className="h-4 w-4" /></button>
                            )}
                            {hasPermission('item:delete') && (
                              <button onClick={() => removeItem(item)} className="rounded-lg p-1.5 text-red-600 transition-colors hover:bg-red-100" title="Hapus"><Trash2 className="h-4 w-4" /></button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expanded group members */}
                      {isGroup && expanded && (
                        <div className="border-t border-purple-100 bg-purple-50/40">
                          <div className="px-14 py-2">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-purple-600">Isi Group / Paket</p>
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-xs text-gray-500">
                                  <th className="py-1 text-left font-medium">Kode</th>
                                  <th className="py-1 text-left font-medium">Nama Item</th>
                                  <th className="py-1 text-left font-medium">Jenis</th>
                                  <th className="py-1 text-right font-medium">Qty</th>
                                  <th className="py-1 text-right font-medium">Harga Satuan</th>
                                  <th className="py-1 text-right font-medium">Subtotal</th>
                                </tr>
                              </thead>
                              <tbody>
                                {item.groupMembers!.map((member) => (
                                  <tr key={member.itemId} className="border-t border-purple-100/60">
                                    <td className="py-1.5 font-mono text-xs text-gray-600">{member.itemCode}</td>
                                    <td className="py-1.5 text-gray-900">{member.itemName}</td>
                                    <td className="py-1.5"><span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${typeColors[member.itemType] || 'bg-gray-100 text-gray-700'}`}>{member.itemType}</span></td>
                                    <td className="py-1.5 text-right text-gray-900">{member.qty}</td>
                                    <td className="py-1.5 text-right text-gray-600">{member.unitPrice === 0 ? <span className="text-gray-400">0</span> : formatCurrency(member.unitPrice)}</td>
                                    <td className="py-1.5 text-right font-medium text-gray-900">{formatCurrency(member.unitPrice * member.qty)}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="border-t border-purple-200">
                                  <td colSpan={5} className="py-2 text-right text-xs font-semibold text-gray-600">Total Harga Item</td>
                                  <td className="py-2 text-right font-medium text-gray-900">{formatCurrency(memberSubtotal(item.groupMembers!))}</td>
                                </tr>
                                <tr>
                                  <td colSpan={5} className="pb-2 text-right text-xs font-bold text-purple-700">Harga Group (1 Paket)</td>
                                  <td className="pb-2 text-right text-lg font-bold text-purple-700">{formatCurrency(item.sellingPrice)}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Categories */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold text-gray-900"><FolderTree className="h-5 w-5 text-blue-600" /> Kategori Barang/Jasa</h3>
          <button onClick={() => openCategoryModal()} className="text-sm font-medium text-blue-600 hover:text-blue-700">+ Tambah Kategori</button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {data.itemCategories.map((category) => (
            <div key={category.id} className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-900">{category.name}</p>
                  <p className="font-mono text-xs text-blue-600">{category.code}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openCategoryModal(category)} className="rounded p-1 text-blue-600 hover:bg-blue-100"><Edit className="h-3.5 w-3.5" /></button>
                  <button onClick={() => removeCategory(category)} className="rounded p-1 text-red-600 hover:bg-red-100"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500">{category.description || '-'}</p>
            </div>
          ))}
        </div>
      </div>
      </div>}

      {/* ========== Item Modal ========== */}
      {showItemModal && (
        <div className="min-h-[calc(100vh-175px)] bg-[#f4f4f4]">
          <div className="flex min-h-[calc(100vh-175px)] w-full flex-col overflow-hidden border border-slate-300 bg-[#f4f4f4] shadow-sm">
            <div className="flex flex-shrink-0 items-end gap-1 border-b border-slate-400 bg-[#f4f4f4] px-4 pt-1">
              {([
                ['general', 'Umum'], ['sales', 'Penjualan / Pembelian'], ['stock', 'Stok'],
                ['account', 'Akun'], ['image', 'Gambar'], ['other', 'Lain-lain'],
              ] as const).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setItemFormTab(key)} className={`rounded-t border border-b-0 px-3 py-2 text-sm ${itemFormTab === key ? 'bg-white font-semibold text-slate-900' : 'bg-[#d6d6d6] text-slate-600 hover:bg-[#e2e2e2]'}`}>{label}</button>
              ))}
            </div>
            <form onSubmit={saveItem} className="relative min-h-0 flex-1 overflow-y-auto bg-[#f4f4f4] p-3 pr-24 sm:p-5 sm:pr-28">
              {itemFormTab === 'general' && <div className="min-h-[520px] rounded border border-slate-300 bg-white p-3 shadow-sm">
                <div className="grid gap-10 lg:grid-cols-2 lg:gap-20">
                  <section>
                    <h4 className="mb-3 border-b border-slate-300 pb-2 text-lg font-medium text-blue-600">Informasi Barang &amp; Jasa</h4>
                    <div className="grid grid-cols-[150px_minmax(0,1fr)] items-center gap-x-4 gap-y-3 text-sm">
                      <label>Nama Barang <span className="text-red-600">*</span></label>
                      <input autoFocus required value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value.toUpperCase() })} className="h-9 rounded border border-slate-300 bg-white px-3 uppercase outline-none focus:border-blue-500 focus:shadow-[0_0_5px_rgba(59,130,246,.45)]" />
                      <label>Kategori Barang <span className="text-red-600">*</span></label>
                      <select required value={itemForm.categoryId} onChange={(e) => setItemForm({ ...itemForm, categoryId: e.target.value })} className="h-9 rounded border border-slate-300 bg-white px-2 outline-none focus:border-blue-500">
                        <option value="">Pilih kategori</option>
                        {data.itemCategories.filter((cat) => cat.isActive).map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                      </select>
                      <label>Jenis Barang</label>
                      <select disabled={itemTypeLocked} value={itemForm.type} onChange={(e) => handleItemTypeChange(e.target.value as ItemType)} className="h-9 rounded border border-slate-300 bg-white px-2 disabled:bg-slate-100">
                        {allItemTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                      </select>
                      <label>Kode Barang <span className="text-red-600">*</span></label>
                      <input readOnly value={editingItem ? itemForm.code : nextItemCode(itemForm.type)} className="h-9 rounded border border-slate-300 bg-slate-100 px-3 font-mono font-semibold uppercase text-blue-700" />
                      <label>UPC/Barcode</label>
                      <input disabled={itemForm.type === 'Jasa' || itemForm.type === 'Group'} value={itemForm.barcode} onChange={(e) => setItemForm({ ...itemForm, barcode: e.target.value.trim() })} placeholder="Scan atau ketik barcode" className="h-9 rounded border border-slate-300 bg-white px-3 font-mono outline-none disabled:bg-slate-100" />
                      <label>Satuan <span className="text-red-600">*</span></label>
                      <select value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })} className="h-9 rounded border border-slate-300 bg-white px-2">
                        {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                      </select>
                    </div>
                  </section>
                  <section>
                    <h4 className="mb-3 border-b border-slate-300 pb-2 text-lg font-medium text-blue-600">Informasi Lainnya</h4>
                    <div className="grid grid-cols-[170px_minmax(0,1fr)] items-center gap-x-4 gap-y-3 text-sm">
                      <label>Merek Kendaraan <span className="text-red-600">*</span></label>
                      <select required value={itemForm.vehicleBrandId} onChange={e => setItemForm({ ...itemForm, vehicleBrandId: e.target.value })} className="h-9 rounded border border-slate-300 bg-white px-2">
                        <option value="">Pilih merek kendaraan</option>
                        {vehicleBrands.filter(b => b.isActive).map(b => <option key={b.id} value={b.id}>{b.itemCode || '--'} - {b.name}</option>)}
                      </select>
                      <label>Merek Barang</label>
                      <input disabled={itemForm.type === 'Jasa' || itemForm.type === 'Group'} value={itemForm.brand} onChange={(e) => setItemForm({ ...itemForm, brand: e.target.value.toUpperCase() })} placeholder="Cari/Pilih Merek..." className="h-9 rounded border border-slate-300 bg-white px-3 uppercase outline-none disabled:bg-slate-100" />
                      <span>Aktifkan No. Seri/Produksi</span>
                      <button type="button" title="Fitur nomor seri disiapkan untuk pengembangan berikutnya" className="relative h-5 w-9 rounded-full bg-slate-300"><span className="absolute left-1 top-1 h-3 w-3 rounded-full bg-white" /></button>
                    </div>
                  </section>
                </div>
              </div>}
              {itemFormTab === 'sales' && <div className="min-h-[520px] rounded border border-slate-300 bg-white p-5 shadow-sm">
                <h4 className="mb-5 border-b border-slate-300 pb-2 text-lg font-medium text-blue-600">Informasi Penjualan / Pembelian</h4>
                <div className="grid max-w-3xl gap-4 md:grid-cols-[210px_1fr] md:items-center">
                  <label className="text-sm">Harga Jual (opsional)</label>
                  <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">Rp</span><input type="text" inputMode="numeric" value={formatNumericInput(itemForm.sellingPrice)} onChange={(e) => setItemForm({ ...itemForm, sellingPrice: parseNumericInput(e.target.value) })} placeholder="0" className="h-9 w-full rounded border border-slate-300 bg-white pl-10 pr-3 text-right font-semibold tabular-nums" /></div>
                  <label className="text-sm">Deskripsi Nota</label>
                  <input value={itemForm.receiptDescription} onChange={(e) => setItemForm({ ...itemForm, receiptDescription: e.target.value })} placeholder="Nama/keterangan pada WO dan faktur" className="h-9 rounded border border-slate-300 bg-white px-3" />
                </div>
              </div>}
              {itemFormTab === 'stock' && <div className="min-h-[520px] rounded border border-slate-300 bg-white p-5 shadow-sm"><h4 className="mb-4 border-b border-slate-300 pb-2 text-lg font-medium text-blue-600">Informasi Stok</h4><p className="text-sm text-slate-600">Stok dan harga beli tidak diinput dari master barang. Nilainya berasal dari penerimaan barang, pemindahan gudang, pembelian, dan penyesuaian stok.</p></div>}
              {itemFormTab === 'account' && <div className="min-h-[520px] rounded border border-slate-300 bg-white p-5 shadow-sm"><h4 className="mb-4 border-b border-slate-300 pb-2 text-lg font-medium text-blue-600">Akun Barang &amp; Jasa</h4><p className="text-sm text-slate-600">Pemetaan akun mengikuti kategori barang dan pengaturan akun perkiraan perusahaan.</p></div>}
              {itemFormTab === 'image' && <div className="min-h-[520px] rounded border border-slate-300 bg-white p-5 shadow-sm"><h4 className="mb-4 border-b border-slate-300 pb-2 text-lg font-medium text-blue-600">Gambar Barang</h4><div className="flex h-56 max-w-lg items-center justify-center rounded border-2 border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">Fitur gambar barang akan ditambahkan pada penyimpanan media.</div></div>}
              {itemFormTab === 'other' && <div className="min-h-[520px] rounded border border-slate-300 bg-white p-5 shadow-sm">
                <h4 className="mb-4 border-b border-slate-300 pb-2 text-lg font-medium text-blue-600">Informasi Lain-lain</h4>
                <div className="max-w-3xl space-y-4"><label className="block text-sm">Keterangan<textarea value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} rows={4} className="mt-1 w-full resize-none rounded border border-slate-300 bg-white p-3" /></label><div className="flex gap-6"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={itemForm.isActive} onChange={(e) => setItemForm({ ...itemForm, isActive: e.target.checked })} /> Aktif</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={itemForm.isQuickService} onChange={(e) => setItemForm({ ...itemForm, isQuickService: e.target.checked })} /> Layanan Cepat (Template)</label></div></div>
              </div>}
              {/* Basic info */}
              {false && <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Kode Barang/Jasa *</label>
                  <input readOnly value={editingItem ? itemForm.code : nextItemCode(itemForm.type)} className="w-full rounded-lg border border-gray-300 bg-gray-100 px-4 py-2.5 font-mono font-semibold uppercase text-blue-700" />
                  <p className="mt-1 text-xs text-gray-500">Otomatis: kategori 2 digit + merek 2 digit + urutan 4 digit.</p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Jenis Barang *</label>
                  <select disabled={itemTypeLocked} value={itemForm.type} onChange={(e) => handleItemTypeChange(e.target.value as ItemType)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100">
                    {allItemTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                  {itemTypeLocked && <p className="mt-1 text-xs text-amber-700">Jenis dikunci karena item sudah memiliki stok atau histori transaksi.</p>}
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Nama Barang/Jasa *</label>
                  <input required value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value.toUpperCase() })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Deskripsi Nota</label>
                  <input value={itemForm.receiptDescription} onChange={(e) => setItemForm({ ...itemForm, receiptDescription: e.target.value })} placeholder="Nama/keterangan yang dicetak pada WO dan faktur" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                  <p className="mt-1 text-xs text-gray-500">Jika kosong, sistem menggunakan Nama Barang/Jasa.</p>
                </div>
                {itemForm.type !== 'Jasa' && itemForm.type !== 'Group' && <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Barcode Asli</label>
                  <input value={itemForm.barcode} onChange={(e) => setItemForm({ ...itemForm, barcode: e.target.value.trim() })} placeholder="Scan atau ketik barcode pabrik/supplier" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 font-mono outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                  <p className="mt-1 text-xs text-gray-500">Harus unik jika diisi; boleh kosong untuk jasa dan paket.</p>
                </div>}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Kategori *</label>
                  <select required value={itemForm.categoryId} onChange={(e) => setItemForm({ ...itemForm, categoryId: e.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
                    <option value="">Pilih kategori</option>
                    {data.itemCategories.filter((cat) => cat.isActive).map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Merek Kendaraan untuk Kode *</label>
                  <select required value={itemForm.vehicleBrandId} onChange={e=>setItemForm({...itemForm,vehicleBrandId:e.target.value})} className="w-full rounded-lg border border-gray-300 px-4 py-2.5"><option value="">Pilih merek kendaraan</option>{vehicleBrands.filter(b=>b.isActive).map(b=><option key={b.id} value={b.id}>{b.itemCode||'--'} - {b.name}</option>)}</select>
                  <p className="mt-1 text-xs text-gray-500">Pilih Universal untuk barang yang cocok ke semua mobil.</p>
                </div>
                {itemForm.type !== 'Jasa' && itemForm.type !== 'Group' && <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Merek Produk (opsional)</label>
                  <input value={itemForm.brand} onChange={(e) => setItemForm({ ...itemForm, brand: e.target.value.toUpperCase() })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                </div>}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Satuan *</label>
                  <select value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
                    {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {itemForm.type === 'Group' ? 'Harga 1 Group (Opsional)' : 'Harga Jual (Opsional)'}
                  </label>
                  <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">Rp</span><input type="text" inputMode="numeric" value={formatNumericInput(itemForm.sellingPrice)} onChange={(e) => setItemForm({ ...itemForm, sellingPrice: parseNumericInput(e.target.value) })} placeholder="0" className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-right font-semibold tabular-nums outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" /></div>
                  <p className="mt-1 text-xs text-gray-500">Boleh dikosongkan. Harga dapat ditentukan saat membuat WO atau faktur.</p>
                  {itemForm.type === 'Group' && itemForm.groupMembers.length > 0 && (
                    <p className="mt-1 text-xs text-gray-500">
                      Total harga item: {formatCurrency(memberSubtotal(itemForm.groupMembers))} — Harga group bisa lebih murah (diskon paket)
                    </p>
                  )}
                </div>
                <div className={itemForm.type === 'Group' ? '' : 'md:col-span-2'}>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Keterangan</label>
                  <textarea value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} rows={2} className="w-full resize-none rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>}

              {/* ===== GROUP MEMBERS SECTION ===== */}
              {itemFormTab === 'general' && itemForm.type === 'Group' && (
                <div className="rounded-lg border-2 border-purple-200 bg-purple-50/30 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="flex items-center gap-2 font-semibold text-purple-800">
                      <Layers className="h-5 w-5" /> Isi Group ({itemForm.groupMembers.length} item)
                    </h4>
                  </div>

                  {/* Picker */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-purple-700">Tambah Barang / Jasa ke Group</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        placeholder="Cari kode atau nama barang/jasa..."
                        className="w-full rounded-lg border border-purple-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    {memberSearch.trim() && (
                      <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-purple-200 bg-white shadow-lg">
                        {pickableItems.length === 0 ? (
                          <p className="p-3 text-center text-xs text-gray-500">Tidak ada item ditemukan</p>
                        ) : pickableItems.slice(0, 15).map((pi) => {
                          const alreadyAdded = itemForm.groupMembers.some((m) => m.itemId === pi.id);
                          return (
                            <button
                              key={pi.id}
                              type="button"
                              disabled={alreadyAdded}
                              onClick={() => addGroupMember(pi)}
                              className="flex w-full items-center justify-between border-b border-gray-100 px-3 py-2 text-left text-sm transition-colors hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-50 last:border-b-0"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs text-gray-500">{pi.code}</span>
                                <span className="font-medium text-gray-900">{pi.name}</span>
                                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${typeColors[pi.type]}`}>{pi.type}</span>
                              </div>
                              <span className="text-xs font-medium text-gray-600">{formatCurrency(pi.sellingPrice)}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Members table */}
                  {itemForm.groupMembers.length === 0 ? (
                    <div className="rounded-lg bg-purple-100/50 p-8 text-center">
                      <Layers className="mx-auto mb-2 h-8 w-8 text-purple-300" />
                      <p className="text-sm text-purple-600">Belum ada item dalam group. Cari & tambahkan item di atas.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-purple-200 bg-white">
                      <table className="w-full text-sm">
                        <thead className="bg-purple-100/70">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-purple-700">Kode</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-purple-700">Nama Item</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-purple-700">Jenis</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-purple-700 w-20">Qty</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-purple-700 w-36">Harga Satuan</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-purple-700">Subtotal</th>
                            <th className="px-3 py-2 w-10"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {itemForm.groupMembers.map((member) => (
                            <tr key={member.itemId} className="border-t border-purple-100">
                              <td className="px-3 py-2 font-mono text-xs text-gray-600">{member.itemCode}</td>
                              <td className="px-3 py-2 text-gray-900">{member.itemName}</td>
                              <td className="px-3 py-2"><span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${typeColors[member.itemType]}`}>{member.itemType}</span></td>
                              <td className="px-3 py-2">
                                <input type="number" min="1" value={member.qty} onChange={(e) => updateMember(member.itemId, 'qty', parseInt(e.target.value) || 1)} className="w-full rounded border border-gray-300 px-2 py-1 text-center text-sm outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500" />
                              </td>
                              <td className="px-3 py-2">
                                <div className="text-right font-medium text-gray-700">{formatCurrency(member.unitPrice)}</div>
                              </td>
                              <td className="px-3 py-2 text-right font-medium text-gray-900">{formatCurrency(member.unitPrice * member.qty)}</td>
                              <td className="px-3 py-2">
                                <button type="button" onClick={() => removeMember(member.itemId)} className="rounded p-1 text-red-500 hover:bg-red-50"><X className="h-4 w-4" /></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-purple-200 bg-purple-50">
                            <td colSpan={5} className="px-3 py-2 text-right text-xs font-semibold text-gray-700">Total Harga Item</td>
                            <td className="px-3 py-2 text-right font-bold text-gray-900">{formatCurrency(memberSubtotal(itemForm.groupMembers))}</td>
                            <td></td>
                          </tr>
                          <tr className="bg-purple-50">
                            <td colSpan={5} className="px-3 pb-2 text-right text-xs font-bold text-purple-700">Harga 1 Group</td>
                            <td className="px-3 pb-2 text-right text-lg font-bold text-purple-700">{formatCurrency(itemForm.sellingPrice)}</td>
                            <td></td>
                          </tr>
                          {itemForm.sellingPrice < memberSubtotal(itemForm.groupMembers) && (
                            <tr className="bg-green-50">
                              <td colSpan={5} className="px-3 pb-2 text-right text-xs font-medium text-green-700">Hemat</td>
                              <td className="px-3 pb-2 text-right font-bold text-green-700">{formatCurrency(memberSubtotal(itemForm.groupMembers) - itemForm.sellingPrice)}</td>
                              <td></td>
                            </tr>
                          )}
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {false && <div className="flex gap-6">
                {(itemForm.type === 'Jasa' || itemForm.type === 'Group') && <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={itemForm.isActive} onChange={(e) => setItemForm({ ...itemForm, isActive: e.target.checked })} className="h-4 w-4 rounded text-blue-600" />
                  Aktif
                </label>}
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={itemForm.isQuickService} onChange={(e) => setItemForm({ ...itemForm, isQuickService: e.target.checked })} className="h-4 w-4 rounded text-blue-600" />
                  Layanan Cepat (Template)
                </label>
              </div>}
              <div className="absolute right-3 top-3 flex flex-col gap-3 sm:right-4">
                <button type="submit" disabled={isSavingItem} title="Simpan" className="flex h-14 w-14 items-center justify-center rounded border border-blue-700 bg-blue-600 text-white shadow-md hover:bg-blue-700 disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-400"><Save className="h-7 w-7" /></button>
                <button type="button" onClick={() => setShowItemModal(false)} title="Tutup" className="flex h-10 w-14 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"><X className="h-5 w-5" /></button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========== Category Modal ========== */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{editingCategory ? 'Edit Kategori' : 'Kategori Baru'}</h3>
                <p className="text-sm text-gray-500">Kategori untuk mengelompokkan barang dan jasa.</p>
              </div>
              <button onClick={() => setShowCategoryModal(false)} className="rounded-lg p-2 hover:bg-gray-100"><X className="h-5 w-5 text-gray-500" /></button>
            </div>
            <form onSubmit={saveCategory} className="space-y-4 p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Kode *</label>
                  <input required value={categoryForm.code} onChange={(e) => setCategoryForm({ ...categoryForm, code: e.target.value.toUpperCase() })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 font-mono uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Nama Kategori *</label>
                <input required value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Keterangan</label>
                <textarea value={categoryForm.description} onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })} rows={3} className="w-full resize-none rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={categoryForm.isActive} onChange={(e) => setCategoryForm({ ...categoryForm, isActive: e.target.checked })} className="h-4 w-4 rounded text-blue-600" />
                Aktif
              </label>
              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
                <button type="button" onClick={() => setShowCategoryModal(false)} className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium text-gray-700 hover:bg-gray-50">Batal</button>
                <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700"><Save className="h-4 w-4" /> Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* IMPORT CSV MODAL */}
      {/* ============================================================ */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[95vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-4 rounded-t-xl text-white">
              <div className="flex items-center gap-3">
                <Upload className="h-6 w-6" />
                <div>
                  <h3 className="text-lg font-bold">Import Barang & Jasa dari CSV / Excel</h3>
                  <p className="text-sm text-green-100">Mendukung file Accurate Online (.xlsx) dan CSV</p>
                </div>
              </div>
              <button onClick={() => setShowImportModal(false)} className="rounded-lg p-2 hover:bg-white/20">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Success Message */}
              {importSuccess && (
                <div className="rounded-lg bg-green-50 border border-green-200 p-4 flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                  <p className="text-green-800 font-medium">{importSuccess}</p>
                </div>
              )}

              {/* Instructions */}
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                <h4 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
                  <FileText className="h-5 w-5" /> Panduan Import - Support Accurate Online
                </h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-bold text-blue-800 mb-1">📥 Dari Accurate Online:</p>
                    <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
                      <li>Buka Accurate Online → <strong>Barang & Jasa</strong></li>
                      <li>Klik tombol <strong>Export / Download</strong> (Excel .xlsx atau CSV)</li>
                      <li>Pilih format .xlsx atau CSV saat mengunduh dari Accurate</li>
                      <li>Upload file tersebut di bawah → sistem otomatis mapping kolom</li>
                    </ol>
                    <div className="mt-2 bg-white rounded p-2 border border-blue-200">
                      <p className="text-xs font-semibold text-gray-700">Kolom Accurate yang terbaca otomatis:</p>
                      <p className="text-xs text-gray-600">Kode Barang → kode, Nama Barang → nama, Jenis Barang → jenis, Kategori → kategori, Merek → merek, Satuan → satuan, Harga Jual → harga jual opsional.</p>
                      <p className="mt-1 text-xs text-amber-700">Kolom stok dan harga beli dari file tidak diimpor ke master; keduanya masuk melalui transaksi persediaan/pembelian.</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-blue-800 mb-1">📄 Dari Template CSV:</p>
                    <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
                      <li><strong>Download template</strong> CSV</li>
                      <li>Buka dengan <strong>Excel / Google Sheets</strong></li>
                      <li>Isi data barang/jasa Anda</li>
                      <li>Save sebagai <strong>CSV</strong> & upload</li>
                    </ol>
                  </div>
                </div>
                <div className="mt-3">
                  <p className="text-xs text-blue-700 font-medium mb-2">📋 Format Kolom (wajib untuk CSV manual):</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-1 text-xs">
                    <div><strong>kode</strong> — Kode barang (unique)</div>
                    <div><strong>nama</strong> — Nama barang</div>
                    <div><strong>jenis</strong> — Persediaan / Jasa / Non Persediaan / Group</div>
                    <div><strong>kategori</strong> — Nama kategori</div>
                    <div><strong>merek</strong> — Merek (opsional)</div>
                    <div><strong>satuan</strong> — PCS / SET / JASA dll</div>
                    <div><strong>harga_jual</strong> — Angka (opsional)</div>
                    <div><strong>layanan_cepat</strong> — ya / tidak</div>
                    <div><strong>keterangan</strong> — Opsional</div>
                  </div>
                </div>
              </div>

              {/* Download Template Button */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={downloadTemplate}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border-2 border-blue-500 bg-blue-50 px-5 py-3 font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
                >
                  <Download className="h-5 w-5" /> 1. Download Template CSV
                </button>

                {/* Upload File */}
                <label className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border-2 border-green-500 bg-green-50 px-5 py-3 font-semibold text-green-700 hover:bg-green-100 transition-colors cursor-pointer">
                  <Upload className="h-5 w-5" /> 2. Upload File (CSV / Excel / Accurate)
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt,.xlsx"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Errors */}
              {importErrors.length > 0 && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                  <h4 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" /> {importErrors.length} Error Ditemukan
                  </h4>
                  <ul className="text-sm text-red-700 space-y-1 max-h-40 overflow-y-auto">
                    {importErrors.slice(0, 20).map((err, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-red-500">•</span>
                        <span>{err}</span>
                      </li>
                    ))}
                    {importErrors.length > 20 && (
                      <li className="text-red-500 italic">... dan {importErrors.length - 20} error lainnya</li>
                    )}
                  </ul>
                </div>
              )}

              {/* Preview */}
              {importPreview.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    Preview: {importPreview.length} baris siap diimport
                  </h4>
                  <div className="overflow-x-auto rounded-lg border border-gray-200 max-h-96">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 text-xs text-gray-600 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">#</th>
                          <th className="px-3 py-2 text-left font-medium">Kode</th>
                          <th className="px-3 py-2 text-left font-medium">Nama</th>
                          <th className="px-3 py-2 text-left font-medium">Jenis</th>
                          <th className="px-3 py-2 text-left font-medium">Kategori</th>
                          <th className="px-3 py-2 text-right font-medium">Harga Jual</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.map((row, i) => (
                          <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                            <td className="px-3 py-2 font-mono text-xs">{row.code}</td>
                            <td className="px-3 py-2 font-medium">{row.name}</td>
                            <td className="px-3 py-2">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeColors[row.type]}`}>
                                {row.type}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs">
                              {row.categoryName}
                              {row._isNewCategory && <span className="ml-1 text-[10px] text-green-600">(baru)</span>}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold">Rp {row.sellingPrice.toLocaleString('id-ID')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium text-gray-700 hover:bg-gray-50"
                >
                  Batal
                </button>
                {importPreview.length > 0 && (
                  <button
                    type="button"
                    onClick={confirmImport}
                    className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-6 py-2.5 font-semibold text-white shadow-lg shadow-green-600/30 hover:bg-green-700"
                  >
                    <CheckCircle2 className="h-5 w-5" /> Import {importPreview.length} Barang Sekarang
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
