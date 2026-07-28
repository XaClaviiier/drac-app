import { useMemo, useRef, useState } from 'react';
import { Boxes, ChevronDown, ChevronUp, Download, Edit, Filter, FolderTree, Layers, Plus, Save, Search, Trash2, Upload, X, AlertCircle, CheckCircle2, FileText } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Item, ItemCategory, ItemType, GroupMember } from '../types';

const allItemTypes: ItemType[] = ['Persediaan', 'Jasa', 'Non Persediaan', 'Group'];
const units = ['PCS', 'SET', 'CAN', 'BOTOL', 'LITER', 'JASA', 'UNIT', 'PAKET'];

const emptyItem = {
  code: '',
  name: '',
  categoryId: '',
  type: 'Persediaan' as ItemType,
  brand: '',
  unit: 'PCS',
  stock: 0,
  purchasePrice: 0,
  sellingPrice: 0,
  isActive: true,
  isQuickService: false,
  description: '',
  groupMembers: [] as GroupMember[],
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
  } = useApp();

  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState('active');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [showItemModal, setShowItemModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importSuccess, setImportSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editingCategory, setEditingCategory] = useState<ItemCategory | null>(null);
  const [itemForm, setItemForm] = useState(emptyItem);
  const [categoryForm, setCategoryForm] = useState(emptyCategory);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Group member picker state
  const [memberSearch, setMemberSearch] = useState('');

  const brands = useMemo(
    () => [...new Set(data.items.map((item) => item.brand).filter((b) => b && b !== '-'))],
    [data.items]
  );

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase();
    return data.items.filter((item) => {
      const branchMatch = currentBranchId === 'ALL' || item.branchId === currentBranchId;
      if (!branchMatch) return false;

      const activeMatch = filterActive === 'all' || (filterActive === 'active' ? item.isActive : !item.isActive);
      const categoryMatch = !filterCategory || item.categoryId === filterCategory;
      const typeMatch = !filterType || item.type === filterType;
      const brandMatch = !filterBrand || item.brand === filterBrand;
      const searchMatch =
        item.code.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.categoryName.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q);
      return activeMatch && categoryMatch && typeMatch && brandMatch && searchMatch;
    });
  }, [data.items, search, filterActive, filterCategory, filterType, filterBrand, currentBranchId]);

  // Items available for group picking (exclude Groups and current item)
  const pickableItems = useMemo(() => {
    const editId = editingItem?.id;
    const q = memberSearch.toLowerCase();
    return data.items.filter((item) => {
      if (item.type === 'Group') return false;
      if (item.id === editId) return false;
      if (!item.isActive) return false;
      if (!q) return true;
      return item.code.toLowerCase().includes(q) || item.name.toLowerCase().includes(q);
    });
  }, [data.items, editingItem, memberSearch]);

  const nextItemCode = (type: ItemType) => {
    const prefix = type === 'Jasa' ? 'JSA' : type === 'Non Persediaan' ? 'NP' : type === 'Group' ? 'GRP' : 'BRG';
    const count = data.items.filter((item) => item.code.startsWith(prefix)).length + 1;
    return `${prefix}-${String(count).padStart(4, '0')}`;
  };

  const nextCategoryCode = () => `KAT-${String(data.itemCategories.length + 1).padStart(3, '0')}`;

  const memberSubtotal = (members: GroupMember[]) => members.reduce((sum, m) => sum + m.unitPrice * m.qty, 0);

  const openItemModal = (item?: Item) => {
    if (item) {
      setEditingItem(item);
      setItemForm({
        code: item.code,
        name: item.name,
        categoryId: item.categoryId,
        type: item.type,
        brand: item.brand,
        unit: item.unit,
        stock: item.stock,
        purchasePrice: item.purchasePrice,
        sellingPrice: item.sellingPrice,
        isActive: item.isActive,
        isQuickService: item.isQuickService,
        description: item.description,
        groupMembers: item.groupMembers ? [...item.groupMembers] : [],
      });
    } else {
      setEditingItem(null);
      setItemForm({ ...emptyItem, code: nextItemCode('Persediaan'), groupMembers: [] });
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
        type: category.type,
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
      code: editingItem ? prev.code : nextItemCode(type),
      unit: isGroup ? 'PAKET' : isJasa ? 'JASA' : prev.unit === 'JASA' || prev.unit === 'PAKET' ? 'PCS' : prev.unit,
      stock: isGroup || isJasa ? 0 : prev.stock,
      purchasePrice: isGroup || isJasa ? 0 : prev.purchasePrice,
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

  const updateMember = (itemId: string, field: 'qty' | 'unitPrice', value: number) => {
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

  const saveItem = (e: React.FormEvent) => {
    e.preventDefault();

    const code = itemForm.code.trim().toUpperCase();
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

    const category = data.itemCategories.find((cat) => cat.id === itemForm.categoryId);
    const isGroup = itemForm.type === 'Group';
    const payload: Item = {
      id: editingItem?.id || Date.now().toString(),
      code,
      name,
      categoryId: itemForm.categoryId,
      categoryName: category?.name || '-',
      type: itemForm.type,
      brand: itemForm.brand,
      unit: itemForm.unit,
      stock: isGroup ? 0 : itemForm.stock,
      sellableStock: isGroup || itemForm.type === 'Jasa' ? 0 : Math.max(0, itemForm.stock),
      purchasePrice: isGroup ? 0 : itemForm.purchasePrice,
      sellingPrice: itemForm.sellingPrice,
      isActive: itemForm.isActive,
      isQuickService: itemForm.isQuickService,
      description: itemForm.description,
      groupMembers: isGroup ? itemForm.groupMembers : undefined,
      branchId: editingItem?.branchId || resolveBranchId(),
    };

    if (editingItem) updateItem(editingItem.id, payload);
    else addItem(payload);

    setShowItemModal(false);
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
    const headers = ['kode', 'nama', 'jenis', 'kategori', 'merek', 'satuan', 'stok', 'harga_beli', 'harga_jual', 'layanan_cepat', 'keterangan'];
    const sampleRows = [
      ['BRG-0001', 'CONTOH SPAREPART AC', 'Persediaan', 'Sparepart AC', 'Denso', 'PCS', '10', '150000', '250000', 'tidak', 'Contoh keterangan'],
      ['JSA-0001', 'CONTOH JASA SERVICE', 'Jasa', 'Jasa Service AC', '-', 'JASA', '0', '0', '200000', 'ya', 'Jasa teknisi'],
      ['NP-0001', 'CONTOH TOOLS', 'Non Persediaan', 'Tools Bengkel', 'Krisbow', 'PCS', '1', '350000', '500000', 'tidak', 'Alat bengkel'],
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
    const headers = ['kode', 'nama', 'jenis', 'kategori', 'merek', 'satuan', 'stok', 'harga_beli', 'harga_jual', 'layanan_cepat', 'keterangan'];
    const rows = data.items
      .filter(i => i.type !== 'Group')
      .map(item => [
        item.code, item.name, item.type, item.categoryName || '',
        item.brand || '', item.unit || '', item.stock, item.purchasePrice,
        item.sellingPrice, item.isQuickService ? 'ya' : 'tidak', item.description || ''
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `barang_jasa_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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
    const idxJenis = findHeaderIndex(headersLower, 'jenis');
    const idxKategori = findHeaderIndex(headersLower, 'kategori');
    const idxMerek = findHeaderIndex(headersLower, 'merek');
    const idxSatuan = findHeaderIndex(headersLower, 'satuan');
    const idxStok = findHeaderIndex(headersLower, 'stok');
    const idxHargaBeli = findHeaderIndex(headersLower, 'harga_beli');
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
      const jenisRaw = idxJenis >= 0 ? getByIdx(idxJenis) : 'Persediaan';
      const kategoriRaw = idxKategori >= 0 ? getByIdx(idxKategori) : '';
      const merekRaw = idxMerek >= 0 ? getByIdx(idxMerek) : '';
      const satuanRaw = idxSatuan >= 0 ? getByIdx(idxSatuan) : 'PCS';
      const stokRaw = idxStok >= 0 ? getByIdx(idxStok) : '0';
      const hargaBeliRaw = idxHargaBeli >= 0 ? getByIdx(idxHargaBeli) : '0';
      const hargaJualRaw = idxHargaJual >= 0 ? getByIdx(idxHargaJual) : '0';
      const layananRaw = idxLayanan >= 0 ? getByIdx(idxLayanan) : '';
      const ketRaw = idxKet >= 0 ? getByIdx(idxKet) : '';

      const code = codeRaw.toUpperCase().trim();
      const name = nameRaw.toUpperCase().trim();
      const kategori = kategoriRaw.trim();
      const merek = merekRaw.trim();
      const satuan = satuanRaw.toUpperCase() || 'PCS';
      const stok = parseNumber(stokRaw);
      const hargaBeli = parseNumber(hargaBeliRaw);
      const hargaJual = parseNumber(hargaJualRaw) || (isAccurateMode && hargaBeliRaw ? 0 : parseNumber(hargaJualRaw));
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
        stock: jenis === 'Jasa' || jenis === 'Group' ? 0 : stok,
        sellableStock: jenis === 'Jasa' || jenis === 'Group' ? 0 : stok,
        purchasePrice: jenis === 'Jasa' || jenis === 'Group' ? 0 : hargaBeli,
        sellingPrice: hargaJual || (jenis === 'Jasa' || jenis === 'Group' ? 0 : hargaBeli),
        isActive: true,
        isQuickService: ['ya', 'yes', 'y', '1', 'true', 'cepat'].includes(layananCepat) || (jenis === 'Jasa' && isAccurateMode), // auto quick service for Jasa from Accurate
        description: ketRaw,
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
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

    try {
      if (isExcel) {
        // Dynamically import xlsx
        const XLSX = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        // Convert to array of arrays
        const rows: string[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false }) as string[][];
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
    let success = 0, failed = 0;
    const createdCategoryIds = new Set<string>();

    const createdCategoryNames = new Set(
      data.itemCategories.map(c => c.name.trim().toLowerCase())
    );

    for (const row of importPreview) {
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
            type: row._category.type, description: row._category.description, isActive: row._category.isActive
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
          branchId: resolveBranchId(),
        });
        success++;
      } catch (err) {
        failed++;
      }
    }
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
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Barang & Jasa</h2>
          <p className="mt-1 text-gray-500">Kelola master sparepart, bahan, jasa service, group, dan kategori.</p>
        </div>
        <div className="flex flex-wrap gap-2">
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
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
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
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari kode, nama barang, merek, kategori..." className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
          </div>
          <select value={filterActive} onChange={(e) => setFilterActive(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
            <option value="active">Non Aktif: Tidak</option>
            <option value="inactive">Non Aktif: Ya</option>
            <option value="all">Non Aktif: Semua</option>
          </select>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
            <option value="">Kategori: Semua</option>
            {data.itemCategories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
            <option value="">Jenis: Semua</option>
            {allItemTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <select value={filterBrand} onChange={(e) => setFilterBrand(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
            <option value="">Merek: Semua</option>
            {brands.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Filter className="h-4 w-4" />
            Menampilkan {filteredItems.length} dari {data.items.length} item
          </div>
          <span className="text-sm font-medium text-gray-600">{data.items.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-blue-800 to-blue-900 text-white">
              <tr>
                <th className="w-8 px-2 py-3"></th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Kode Barang</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Nama Barang</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider">Kts</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Satuan</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Jenis Barang</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Kategori</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider">Harga Jual</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">Aksi</th>
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
                  <tr key={item.id} className="group">
                    <td colSpan={9} className="p-0">
                      {/* Main row */}
                      <div className={`flex items-center transition-colors hover:bg-blue-50/50 ${isGroup ? 'cursor-pointer' : ''}`} onClick={isGroup ? () => toggleGroup(item.id) : undefined}>
                        <div className="w-10 flex-shrink-0 px-2 py-3 text-center">
                          {isGroup ? (
                            expanded ? <ChevronUp className="mx-auto h-4 w-4 text-purple-500" /> : <ChevronDown className="mx-auto h-4 w-4 text-purple-500" />
                          ) : null}
                        </div>
                        <div className="min-w-[130px] px-4 py-3 font-mono text-sm text-gray-900">{item.code}</div>
                        <div className="flex-1 px-4 py-3">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900">{item.name}</p>
                            {isGroup && (
                              <span className="inline-flex items-center gap-1 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                                <Layers className="h-3 w-3" /> {item.groupMembers!.length} item
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">{item.brand && item.brand !== '-' ? item.brand : ''} {item.description ? (item.brand && item.brand !== '-' ? '- ' : '') + item.description : ''}</p>
                        </div>
                        <div className="w-16 px-4 py-3 text-right text-sm text-gray-900">{item.stock}</div>
                        <div className="w-20 px-4 py-3 text-sm text-gray-700">{item.unit}</div>
                        <div className="w-28 px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${typeColors[item.type] || 'bg-gray-100 text-gray-700'}`}>
                            {item.type}
                          </span>
                        </div>
                        <div className="w-28 px-4 py-3 text-sm text-gray-700">{item.categoryName}</div>
                        <div className="w-32 px-4 py-3 text-right text-sm font-medium text-gray-900">{formatCurrency(item.sellingPrice)}</div>
                        <div className="w-24 px-4 py-3">
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
              <span className="mt-2 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{category.type}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ========== Item Modal ========== */}
      {showItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 rounded-t-xl">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{editingItem ? 'Edit Barang/Jasa' : 'Barang/Jasa Baru'}</h3>
                <p className="text-sm text-gray-500">Isi data item, stok, kategori, dan harga jual.</p>
              </div>
              <button onClick={() => setShowItemModal(false)} className="rounded-lg p-2 hover:bg-gray-100"><X className="h-5 w-5 text-gray-500" /></button>
            </div>
            <form onSubmit={saveItem} className="space-y-5 p-6">
              {/* Basic info */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Kode Barang/Jasa *</label>
                  <input required value={itemForm.code} onChange={(e) => setItemForm({ ...itemForm, code: e.target.value.toUpperCase() })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 font-mono uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Jenis Barang *</label>
                  <select value={itemForm.type} onChange={(e) => handleItemTypeChange(e.target.value as ItemType)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
                    {allItemTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Nama Barang/Jasa *</label>
                  <input required value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value.toUpperCase() })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Kategori *</label>
                  <select required value={itemForm.categoryId} onChange={(e) => setItemForm({ ...itemForm, categoryId: e.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
                    <option value="">Pilih kategori</option>
                    {data.itemCategories.filter((cat) => cat.isActive).map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Merek</label>
                  <input value={itemForm.brand} onChange={(e) => setItemForm({ ...itemForm, brand: e.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Satuan *</label>
                  <select value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
                    {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                </div>
                {itemForm.type !== 'Group' && (
                  <>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Stok</label>
                      <input type="number" disabled={itemForm.type === 'Jasa'} value={itemForm.stock} onChange={(e) => setItemForm({ ...itemForm, stock: parseInt(e.target.value) || 0 })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100" />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Harga Beli</label>
                      <input type="number" disabled={itemForm.type === 'Jasa'} value={itemForm.purchasePrice} onChange={(e) => setItemForm({ ...itemForm, purchasePrice: parseInt(e.target.value) || 0 })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100" />
                    </div>
                  </>
                )}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {itemForm.type === 'Group' ? 'Harga 1 Group (Paket) *' : 'Harga Jual *'}
                  </label>
                  <input type="number" required value={itemForm.sellingPrice} onChange={(e) => setItemForm({ ...itemForm, sellingPrice: parseInt(e.target.value) || 0 })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
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
              </div>

              {/* ===== GROUP MEMBERS SECTION ===== */}
              {itemForm.type === 'Group' && (
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
                                <input type="number" min="0" value={member.unitPrice} onChange={(e) => updateMember(member.itemId, 'unitPrice', parseInt(e.target.value) || 0)} className="w-full rounded border border-gray-300 px-2 py-1 text-right text-sm outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500" />
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

              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={itemForm.isActive} onChange={(e) => setItemForm({ ...itemForm, isActive: e.target.checked })} className="h-4 w-4 rounded text-blue-600" />
                  Aktif
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={itemForm.isQuickService} onChange={(e) => setItemForm({ ...itemForm, isQuickService: e.target.checked })} className="h-4 w-4 rounded text-blue-600" />
                  Layanan Cepat (Template)
                </label>
              </div>
              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
                <button type="button" onClick={() => setShowItemModal(false)} className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium text-gray-700 hover:bg-gray-50">Batal</button>
                <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700"><Save className="h-4 w-4" /> Simpan</button>
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
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Untuk Jenis</label>
                  <select value={categoryForm.type} onChange={(e) => setCategoryForm({ ...categoryForm, type: e.target.value as ItemCategory['type'] })} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
                    <option value="Semua">Semua</option>
                    {allItemTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
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
                  <p className="text-sm text-green-100">Support file export Accurate Online (.xls / .xlsx)</p>
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
                      <li>Klik tombol <strong>Export / Download</strong> (Excel .xls / .xlsx)</li>
                      <li>File akan ter-download (mis: Barang & Jasa.xls)</li>
                      <li>Upload file tersebut di bawah → sistem otomatis mapping kolom</li>
                    </ol>
                    <div className="mt-2 bg-white rounded p-2 border border-blue-200">
                      <p className="text-xs font-semibold text-gray-700">Kolom Accurate yang terbaca otomatis:</p>
                      <p className="text-xs text-gray-600">Kode Barang → kode, Nama Barang → nama, Jenis Barang → jenis, Kategori → kategori, Merek → merek, Satuan → satuan, Stok/Kts → stok</p>
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
                    <div><strong>stok</strong> — Angka</div>
                    <div><strong>harga_beli</strong> — Angka</div>
                    <div><strong>harga_jual</strong> — Angka</div>
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
                    accept=".csv,.txt,.xlsx,.xls"
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
                          <th className="px-3 py-2 text-right font-medium">Stok</th>
                          <th className="px-3 py-2 text-right font-medium">Harga Beli</th>
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
                            <td className="px-3 py-2 text-right">{row.stock}</td>
                            <td className="px-3 py-2 text-right text-gray-600">Rp {row.purchasePrice.toLocaleString('id-ID')}</td>
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
