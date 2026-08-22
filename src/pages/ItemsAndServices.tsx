import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Boxes, ChevronDown, ChevronUp, Download, Edit, Filter, FolderTree, Layers, Plus, Save, Search, Trash2, Upload, X, AlertCircle, CheckCircle2, FileText, Settings2, RefreshCw, Printer, Share2, List } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Item, ItemCategory, ItemType, GroupMember, StockMovement } from '../types';
import { failSystemProcess, finishSystemProcess, startSystemProcess, updateSystemProcess } from '../lib/processQueue';
import { localDateKey } from '../lib/date';
import { api } from '../lib/apiClient';
import { childTabClass, ui } from '../components/ui/interfaceStandards';
import { matchesStockSearch, parseItemStockSearch } from '../lib/itemSearchRules';
import IndonesianDateInput from '../components/IndonesianDateInput';

const allItemTypes: ItemType[] = ['Persediaan', 'Jasa', 'Non Persediaan', 'Group'];
const units = ['PCS', 'SET', 'CAN', 'BOTOL', 'LITER', 'JASA', 'UNIT', 'PAKET'];
const stockMovementLabels:Record<string,string>={
  receipt:'Penerimaan Barang',sale:'Penjualan',reversal:'Pembalik Transaksi',
  transfer:'Pemindahan Barang',transfer_send:'Kirim Barang',transfer_receive:'Terima Barang',
  adjustment:'Penyesuaian Persediaan',
};

const twoDigitSegment = (value: string, fallback: string) => {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const digits = normalized.replace(/\D/g, '');
  if (digits) return digits.slice(-2).padStart(2, '0');
  const words = normalized.split(/\s+/).filter(Boolean);
  const code = words.length > 1 ? `${words[0][0]}${words[1][0]}` : (words[0] || fallback).slice(0, 2);
  return code.padEnd(2, 'X');
};

const formatNumericInput = (value: number) => value ? value.toLocaleString('id-ID') : '';
const parseNumericInput = (value: string) => Number(value.replace(/\D/g, '')) || 0;

const emptyItem = {
  code: '',
  name: '',
  categoryId: '',
  type: 'Persediaan' as ItemType,
  brand: '',
  vehicleBrandId: '',
  vehicleBrandIds: [] as string[],
  itemBrandId: '',
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
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    data,
    addItem,
    updateItem,
    deleteItem,
    addItemCategory,
    updateItemCategory,
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
  const [filterStock, setFilterStock] = useState('');
  const [showPrintOptions, setShowPrintOptions] = useState(false);
  const [printGroupByCategory, setPrintGroupByCategory] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [itemListTab, setItemListTab] = useState<'list' | 'verification'>('list');
  const [mergeTargets, setMergeTargets] = useState<Record<string, string>>({});
  const [verifyingItemId, setVerifyingItemId] = useState('');
  const [showItemModal, setShowItemModal] = useState(false);
  const [itemFormTab, setItemFormTab] = useState<'general' | 'sales' | 'stock' | 'account' | 'image' | 'other' | 'movement' | 'warehouse'>('general');
  const [movementDateFrom, setMovementDateFrom] = useState(() => {
    const today = new Date();
    return localDateKey(new Date(today.getFullYear(), today.getMonth(), 1));
  });
  const [movementDateTo, setMovementDateTo] = useState(() => localDateKey());
  const [movementSearch, setMovementSearch] = useState('');
  const [movementWarehouseId, setMovementWarehouseId] = useState('');
  const [itemMovementRows, setItemMovementRows] = useState<StockMovement[]>([]);
  const [movementLoading, setMovementLoading] = useState(false);
  const [movementError, setMovementError] = useState('');
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [showVehicleBrandModal, setShowVehicleBrandModal] = useState(false);
  const [newVehicleBrand,setNewVehicleBrand]=useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importSuccess, setImportSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editingCategory, setEditingCategory] = useState<ItemCategory | null>(null);
  const [itemForm, setItemForm] = useState(emptyItem);
  const [vehicleBrands,setVehicleBrands]=useState<Array<{id:string;name:string;itemCode?:string;isActive:boolean}>>([]);
  const [vehicleBrandPickerOpen,setVehicleBrandPickerOpen]=useState(false);
  const [vehicleBrandQuery,setVehicleBrandQuery]=useState('');
  useEffect(()=>{api.get<any>('vehicle-catalog').then(res=>setVehicleBrands(res.data?.brands||[])).catch(()=>setVehicleBrands([]));},[]);
  type ItemBrandMaster={id:string;code:string;name:string;description:string;isActive:boolean;sortOrder?:number;usageCount?:number};
  const [itemBrands,setItemBrands]=useState<ItemBrandMaster[]>([]);
  const [brandForm,setBrandForm]=useState({id:'',code:'',name:'',description:'',isActive:true});
  const loadItemBrands=()=>api.get<ItemBrandMaster[]>('item-brands').then(async res=>{const vehicleNames=new Set(vehicleBrands.map(row=>row.name.trim().toLowerCase()));setItemBrands((res.data||[]).filter(row=>!vehicleNames.has(row.name.trim().toLowerCase())));await refreshData();});
  useEffect(()=>{void loadItemBrands();},[]);
  const [categoryForm, setCategoryForm] = useState(emptyCategory);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ column: 'code' | 'name' | 'category'; direction: 'asc' | 'desc' }>({ column: 'code', direction: 'asc' });
  const [draggedColumn, setDraggedColumn] = useState<ItemColumn | null>(null);
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

  const itemTableColumns = useMemo<ItemColumn[]>(() => {
    const columns = visibleColumns.filter((column, index, all) => all.indexOf(column) === index);
    if (!columns.includes('name')) columns.push('name');
    if (!columns.includes('actions')) columns.push('actions');
    return columns;
  }, [visibleColumns]);

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

  const moveColumn = (source: ItemColumn, target: ItemColumn) => {
    if (source === target) return;
    setVisibleColumns(current => {
      const ordered = [...current];
      const sourceIndex = ordered.indexOf(source);
      const targetIndex = ordered.indexOf(target);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      ordered.splice(sourceIndex, 1);
      ordered.splice(targetIndex, 0, source);
      localStorage.setItem(columnStorageKey, JSON.stringify(ordered));
      return ordered;
    });
  };

  const resizableHeader = (column: ItemColumn, label: string, align: 'left' | 'center' | 'right' = 'left') => (
    <div
      key={column}
      style={columnStyle(column)}
      draggable
      onDragStart={() => setDraggedColumn(column)}
      onDragOver={event => event.preventDefault()}
      onDrop={() => { if (draggedColumn) moveColumn(draggedColumn, column); setDraggedColumn(null); }}
      onDragEnd={() => setDraggedColumn(null)}
      onClick={() => {
        if (column !== 'code' && column !== 'name' && column !== 'category') return;
        setSortConfig(current => ({ column, direction: current.column === column && current.direction === 'asc' ? 'desc' : 'asc' }));
      }}
      title={`${column === 'code' || column === 'name' || column === 'category' ? 'Klik untuk urutkan. ' : ''}Tarik untuk memindahkan kolom.`}
      className={`relative flex flex-shrink-0 cursor-grab select-none items-center gap-1 px-3 py-2.5 text-[13px] font-semibold ${draggedColumn === column ? 'opacity-50' : ''} ${align === 'right' ? 'justify-end text-right' : align === 'center' ? 'justify-center text-center' : 'justify-start text-left'}`}
    >
      <span className="block truncate">{label}</span>
      {sortConfig.column === column && <span className="text-[10px]">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>}
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

  // Master barang bersifat global. Hanya saldo stok yang mengikuti cabang aktif.
  const displayStock = (item: Item) => {
    const stock = currentBranchId === 'ALL'
      ? item.stock
      : (item.branchStocks?.[currentBranchId]?.stock ?? 0);
    const numericStock = Number(stock);
    return Number.isFinite(numericStock) ? numericStock : 0;
  };

  const filteredItems = useMemo(() => {
    const parsedSearch = parseItemStockSearch(search);
    const parsedStockFilter = filterStock ? parseItemStockSearch(filterStock) : parsedSearch;
    const selectedStocks = parsedStockFilter.stocks || (parsedStockFilter.stock ? [parsedStockFilter.stock] : []);
    const q = parsedSearch.text;
    return data.items.filter((item) => {
      const activeMatch = filterActive === 'all' || (filterActive === 'active' ? item.isActive : !item.isActive);
      const categoryMatch = !filterCategory || item.categoryId === filterCategory;
      const typeMatch = !filterType || item.type === filterType;
      const brandMatch = !filterBrand || item.brand === filterBrand;
      const stockMatch = selectedStocks.length === 0 || (
        item.type === 'Persediaan'
        && selectedStocks.some(condition => matchesStockSearch(displayStock(item), condition.operator, condition.value))
      );
      const searchMatch =
        item.code.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.categoryName.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        (item.receiptDescription || '').toLowerCase().includes(q) ||
        (item.barcode || '').toLowerCase().includes(q);
      return activeMatch && categoryMatch && typeMatch && brandMatch && stockMatch && searchMatch;
    }).sort((a, b) => {
      const left = sortConfig.column === 'category' ? a.categoryName : a[sortConfig.column];
      const right = sortConfig.column === 'category' ? b.categoryName : b[sortConfig.column];
      const result = String(left || '').localeCompare(String(right || ''), 'id', { numeric: true, sensitivity: 'base' });
      return sortConfig.direction === 'asc' ? result : -result;
    });
  }, [data.items, search, filterActive, filterCategory, filterType, filterBrand, filterStock, sortConfig, currentBranchId]);

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

  const nextItemCode = (categoryId = itemForm.categoryId) => {
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
        vehicleBrandId: item.vehicleBrandId || '',
        vehicleBrandIds: item.vehicleBrandIds?.length ? [...item.vehicleBrandIds] : (item.vehicleBrandId ? [item.vehicleBrandId] : []),
        itemBrandId: item.itemBrandId || '',
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
      const universalId = vehicleBrands.find(brand=>brand.name.toLowerCase()==='universal')?.id || '';
      setItemForm({ ...emptyItem, categoryId: defaultCategory?.id || '', vehicleBrandId: universalId, vehicleBrandIds: universalId?[universalId]:[], code: '', groupMembers: [] });
    }
    setMemberSearch('');
    setShowItemModal(true);
  };

  useEffect(() => {
    const requestedItemId = searchParams.get('view');
    if (!requestedItemId || !data.items.length) return;

    const requestedItem = data.items.find((item) => item.id === requestedItemId);
    if (requestedItem) openItemModal(requestedItem);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('view');
    setSearchParams(nextParams, { replace: true });
  }, [data.items, searchParams, setSearchParams]);

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

    const code = editingItem?.code || nextItemCode();
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
    const universalVehicleBrandId = vehicleBrands.find(brand => brand.name.trim().toLowerCase() === 'universal')?.id || '';
    const effectiveVehicleBrandIds = itemForm.vehicleBrandIds.length
      ? itemForm.vehicleBrandIds
      : (itemForm.type !== 'Jasa' && !isGroup && universalVehicleBrandId ? [universalVehicleBrandId] : []);
    const payload: Item = {
      id: editingItem?.id || Date.now().toString(),
      code,
      name,
      categoryId: itemForm.categoryId,
      categoryName: category?.name || '-',
      type: itemForm.type,
      brand: itemForm.brand,
      vehicleBrandId: effectiveVehicleBrandIds[0] || undefined,
      vehicleBrandIds: effectiveVehicleBrandIds,
      itemBrandId: itemForm.itemBrandId || undefined,
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

  const printCurrentData = () => {
    const popup = window.open('', '_blank', 'width=1200,height=800');
    if (!popup) {
      window.alert('Popup diblokir browser. Izinkan popup untuk mencetak atau menyimpan PDF.');
      return;
    }

    const escapeHtml = (value: unknown) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    const printableColumns = itemTableColumns.filter(column => column !== 'actions' && (!printGroupByCategory || column !== 'category'));
    const columnValue = (item: Item, column: ItemColumn) => {
      if (column === 'code') return item.code;
      if (column === 'name') return item.name;
      if (column === 'receiptDescription') return item.receiptDescription || item.name;
      if (column === 'type') return item.type;
      if (column === 'category') return item.categoryName;
      if (column === 'barcode') return item.barcode || '—';
      if (column === 'price') return formatCurrency(item.sellingPrice);
      if (column === 'stock') return item.type === 'Persediaan' ? displayStock(item) : '—';
      if (column === 'unit') return item.unit;
      if (column === 'brand') return item.brand || '—';
      if (column === 'purchasePrice') return formatCurrency(item.purchasePrice);
      if (column === 'status') return item.isActive ? 'Aktif' : 'Nonaktif';
      return '';
    };
    const numericColumns = new Set<ItemColumn>(['stock', 'purchasePrice', 'price']);
    const headers = printableColumns.map(column => (
      `<th class="${numericColumns.has(column) ? 'numeric' : ''}">${escapeHtml(column === 'code' ? 'Kode Barang' : itemColumnLabels[column])}</th>`
    )).join('');
    const itemRow = (item: Item) => `<tr>${printableColumns.map(column => (
      `<td class="${numericColumns.has(column) ? 'numeric' : ''}">${escapeHtml(columnValue(item, column))}</td>`
    )).join('')}</tr>`;
    let rows = `<tr><td colspan="${printableColumns.length}" class="empty">Tidak ada barang/jasa yang sesuai dengan filter.</td></tr>`;
    if (filteredItems.length > 0 && printGroupByCategory) {
      const groups = filteredItems.reduce<Map<string, Item[]>>((result, item) => {
        const category = item.categoryName?.trim() || 'Tanpa Kategori';
        result.set(category, [...(result.get(category) || []), item]);
        return result;
      }, new Map());
      rows = [...groups.entries()]
        .sort(([left], [right]) => left.localeCompare(right, 'id', { sensitivity: 'base' }))
        .map(([category, items]) => (
          `<tr class="category-group"><td colspan="${printableColumns.length}">${escapeHtml(category)}<span>${items.length} item</span></td></tr>${items.map(itemRow).join('')}`
        )).join('');
    } else if (filteredItems.length > 0) {
      rows = filteredItems.map(itemRow).join('');
    }

    const activeFilters = [
      filterActive === 'active' ? 'Status: Aktif' : filterActive === 'inactive' ? 'Status: Nonaktif' : '',
      filterBrand ? `Merek: ${filterBrand}` : '',
      filterCategory ? `Kategori: ${data.itemCategories.find(category => category.id === filterCategory)?.name || filterCategory}` : '',
      filterType ? `Jenis: ${filterType}` : '',
      filterStock ? `Stok: ${filterStock.replace(/^stok\s*/i, '')}` : '',
      search.trim() ? `Pencarian: ${search.trim()}` : '',
      printGroupByCategory ? 'Tampilan: Group per Kategori' : '',
    ].filter(Boolean);
    const branchName = currentBranchId === 'ALL'
      ? 'Semua Cabang'
      : data.branches.find(branch => branch.id === currentBranchId)?.name || currentBranchId;
    const filterSummary = activeFilters.length > 0 ? activeFilters.join(' · ') : 'Tanpa filter';
    const printedAt = new Date().toLocaleString('id-ID');

    popup.document.write(`<!doctype html>
      <html lang="id"><head><meta charset="utf-8"><title>Daftar Barang dan Jasa</title>
      <style>
        @page{size:landscape;margin:10mm}
        *{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;color:#172033}
        h1{margin:0 0 4px;font-size:20px}.meta{color:#667085;font-size:11px;line-height:1.5;margin-bottom:14px}
        table{width:100%;border-collapse:collapse;font-size:10px;table-layout:auto}
        thead{display:table-header-group}tr{break-inside:avoid}
        th{background:#637c93;color:#fff;text-align:left;padding:7px;border:1px solid #526b82;white-space:nowrap}
        td{padding:6px 7px;border:1px solid #d0d5dd;vertical-align:top}tbody tr:nth-child(even){background:#f8fafc}
        .category-group{break-after:avoid}.category-group td{background:#dbe8f3!important;color:#29455f;font-size:11px;font-weight:700;padding:7px 9px;border-color:#9fb5c8}
        .category-group span{float:right;font-size:9px;font-weight:600;color:#526b82}
        .numeric{text-align:right;white-space:nowrap}.empty{text-align:center;padding:24px;color:#667085}
        @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
      </style></head><body>
      <h1>DOKTER AC MOBIL — Daftar Barang &amp; Jasa</h1>
      <div class="meta">Cabang: ${escapeHtml(branchName)} · Dicetak: ${escapeHtml(printedAt)} · ${filteredItems.length} item<br>Filter: ${escapeHtml(filterSummary)}</div>
      <table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>
      <script>window.onload=()=>{window.focus();window.print()}<\/script></body></html>`);
    popup.document.close();
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

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const formatCurrency = (v: number) => `Rp ${v.toLocaleString('id-ID')}`;
  const canVerifyItems = Boolean(currentUser?.isOwner) || String(currentUser?.roleName || '').toLowerCase().includes('admin');
  const pendingItems = data.items.filter(item => item.verificationStatus === 'Pending');
  const itemWarehouseRows = editingItem
    ? data.warehouses
        .filter(warehouse => warehouse.isActive && !warehouse.isSystem && (currentBranchId === 'ALL' || warehouse.branchId === currentBranchId))
        .map(warehouse => {
          const stock = data.warehouseStocks.find(row => row.warehouseId === warehouse.id && row.itemId === editingItem.id);
          const quantity = Number(stock?.quantity || 0);
          const reserved = Number(stock?.reservedQuantity || 0);
          return { warehouse, quantity, reserved, available: quantity - reserved };
        })
        .sort((a, b) => a.warehouse.name.localeCompare(b.warehouse.name, 'id'))
    : [];
  const loadItemMovements = async () => {
    if (!editingItem) return;
    setMovementLoading(true);setMovementError('');
    const query = new URLSearchParams({ itemId: editingItem.id, dateFrom: movementDateFrom, dateTo: movementDateTo });
    if (movementWarehouseId) query.set('warehouseId', movementWarehouseId);
    if (movementSearch.trim()) query.set('search', movementSearch.trim());
    const response = await api.get<StockMovement[]>(`stock-movements?${query.toString()}`);
    if (response.success) setItemMovementRows(response.data || []);
    else { setItemMovementRows([]); setMovementError(response.message || 'Data mutasi gagal dimuat.'); }
    setMovementLoading(false);
  };

  const saveItemBrand=async(e:React.FormEvent)=>{e.preventDefault();const payload={...brandForm,code:brandForm.code.trim().toUpperCase(),name:brandForm.name.trim().toUpperCase()};if(!payload.code||!payload.name)return;const result=payload.id?await api.update('item-brands',payload.id,payload):await api.create('item-brands',{...payload,id:`IB-${Date.now()}`});if(!result.success)return window.alert(result.message||'Merek gagal disimpan');setBrandForm({id:'',code:'',name:'',description:'',isActive:true});await loadItemBrands();};
  const removeItemBrand=async(brand:ItemBrandMaster)=>{if(!window.confirm(`Hapus merek ${brand.name}?`))return;const result=await api.remove('item-brands',brand.id);if(!result.success)return window.alert(result.message||'Merek gagal dihapus');await loadItemBrands();};
  const reloadVehicleBrands=async()=>{const result=await api.get<any>('vehicle-catalog');setVehicleBrands(result.data?.brands||[]);};
  const addVehicleBrand=async(e:React.FormEvent)=>{e.preventDefault();if(!newVehicleBrand.trim())return;const result=await api.create('vehicle-catalog',{entity:'brand',name:newVehicleBrand.trim()});if(!result.success)return window.alert(result.message||'Merek kendaraan gagal ditambahkan');setNewVehicleBrand('');await reloadVehicleBrands();};
  const editVehicleBrand=async(brand:{id:string;name:string;isActive:boolean})=>{const name=window.prompt('Ubah nama merek kendaraan:',brand.name)?.trim();if(!name||name===brand.name)return;const result=await api.update('vehicle-catalog',brand.id,{entity:'brand',name,isActive:brand.isActive});if(!result.success)return window.alert(result.message||'Merek kendaraan gagal diperbarui');await reloadVehicleBrands();await refreshData();};
  const toggleVehicleBrand=async(brand:{id:string;name:string;isActive:boolean})=>{const result=await api.update('vehicle-catalog',brand.id,{entity:'brand',name:brand.name,isActive:!brand.isActive});if(!result.success)return window.alert(result.message||'Status merek gagal diperbarui');await reloadVehicleBrands();};

  useEffect(() => {
    if (showItemModal && itemFormTab === 'movement' && editingItem) void loadItemMovements();
    // Filter diterapkan hanya ketika tab dibuka atau tombol Refresh ditekan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showItemModal, itemFormTab, editingItem?.id]);
  const verifyPendingItem = async (itemId: string, targetItemId?: string) => {
    setVerifyingItemId(itemId);
    try {
      await api.update('items', itemId, targetItemId ? { action: 'merge', targetItemId } : { action: 'verify' });
      await refreshData();
      setMergeTargets(current => { const next = { ...current }; delete next[itemId]; return next; });
    } catch (error: any) {
      window.alert(error?.message || 'Verifikasi barang gagal.');
    } finally {
      setVerifyingItemId('');
    }
  };

  return (
    <div className="space-y-0">
      <div className={ui.childBar}>
        <button type="button" onClick={() => { setShowItemModal(false); setItemListTab('list'); }} title="Daftar Barang & Jasa" className={ui.childListTab}>
          <List className="h-5 w-5" />
        </button>
        {!showItemModal && canVerifyItems && <button type="button" onClick={() => setItemListTab('verification')} className={`${childTabClass(itemListTab === 'verification')} gap-2 px-4 text-sm`}>Menunggu Verifikasi {pendingItems.length > 0 && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs text-white">{pendingItems.length}</span>}</button>}
        {showItemModal && (
          <div className={`${childTabClass(true)} gap-2 px-4 text-sm`}>
            <span className="max-w-[340px] truncate" title={editingItem?.name}>{editingItem ? editingItem.name : 'Data Baru'}</span>
            <button type="button" onClick={() => setShowItemModal(false)} className="ml-1 text-slate-500 hover:text-red-600"><X className="h-4 w-4" /></button>
          </div>
        )}
      </div>
      {!showItemModal && <div className="space-y-3 px-1 lg:space-y-0 lg:px-0">
      {itemListTab === 'verification' && <section className="min-h-[560px] border border-slate-300 bg-[#eeeeee] p-4">
        <div className="mb-4"><h3 className="text-lg font-semibold text-slate-900">Verifikasi Barang Baru</h3><p className="text-sm text-slate-600">Sahkan jika data benar, atau gabungkan ke master lama jika barang ternyata duplikat.</p></div>
        <div className="overflow-x-auto rounded-t-lg border border-slate-300 bg-white">
          <div className="grid min-w-[1050px] grid-cols-[160px_minmax(240px,1fr)_170px_minmax(280px,1fr)_210px] bg-[#637c93] px-3 py-2.5 text-sm font-semibold text-white"><span>Kode Barang</span><span>Nama Barang</span><span>Kategori / Stok</span><span>Master Tujuan</span><span>Aksi</span></div>
          {pendingItems.map(item => <div key={item.id} className="grid min-w-[1050px] grid-cols-[160px_minmax(240px,1fr)_170px_minmax(280px,1fr)_210px] items-center border-b border-slate-300 px-3 py-2 text-sm odd:bg-white even:bg-slate-50">
            <span className="font-mono text-blue-700">{item.code}</span><span className="font-medium">{item.name}</span><span className="text-xs text-slate-600">{item.categoryName}<br/>{item.stock} {item.unit}</span>
            <select value={mergeTargets[item.id] || ''} onChange={event => setMergeTargets(current => ({ ...current, [item.id]: event.target.value }))} className="mr-3 h-9 rounded border border-slate-300 bg-white px-2"><option value="">Pilih jika barang duplikat...</option>{data.items.filter(target => target.id !== item.id && target.isActive && target.verificationStatus !== 'Pending' && target.verificationStatus !== 'Merged' && target.type === 'Persediaan').map(target => <option key={target.id} value={target.id}>{target.code} — {target.name}</option>)}</select>
            <div className="flex gap-2"><button disabled={verifyingItemId === item.id} onClick={() => verifyPendingItem(item.id)} className="rounded bg-emerald-600 px-3 py-2 font-semibold text-white disabled:opacity-50">Verifikasi</button><button disabled={!mergeTargets[item.id] || verifyingItemId === item.id} onClick={() => verifyPendingItem(item.id, mergeTargets[item.id])} className="rounded bg-amber-600 px-3 py-2 font-semibold text-white disabled:opacity-40">Gabungkan</button></div>
          </div>)}
          {!pendingItems.length && <div className="py-24 text-center text-slate-500"><CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-400"/>Tidak ada barang yang menunggu verifikasi.</div>}
        </div>
      </section>}
      <div className={itemListTab === 'list' ? '' : 'hidden'}>
      {/* Header */}
      <div className="lg:hidden">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Barang & Jasa</h2>
          <p className="mt-1 text-gray-500">Kelola master sparepart, bahan, jasa service, group, dan kategori.</p>
        </div>
      </div>

      {/* Filters */}
      <div className={`${ui.toolbar} border p-3 shadow-sm lg:border-x-0 lg:border-t-0 lg:shadow-none`}>
        <div className="space-y-2 lg:hidden">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari barang, kode, atau stok..." className={`${ui.search} w-full px-3 pr-9`} /><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-700" /></div>
            {hasPermission('item:create') && <button onClick={() => openItemModal()} title="Barang Baru" aria-label="Barang Baru" className="flex h-10 w-11 flex-shrink-0 items-center justify-center rounded bg-blue-700 text-white hover:bg-blue-800"><Plus className="h-5 w-5" /></button>}
            <button type="button" onClick={() => refreshData()} title="Refresh" aria-label="Refresh" className="flex h-10 w-11 flex-shrink-0 items-center justify-center rounded border border-blue-600 bg-white text-blue-700"><RefreshCw className="h-5 w-5" /></button>
            <button type="button" onClick={() => setShowMobileFilters(value => !value)} title="Filter" aria-label="Filter" className={`relative flex h-10 w-11 flex-shrink-0 items-center justify-center rounded border ${showMobileFilters || filterActive !== 'all' || filterBrand || filterCategory || filterType || filterStock ? 'border-blue-700 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white text-slate-700'}`}><Filter className="h-5 w-5" />{(filterActive !== 'all' || filterBrand || filterCategory || filterType || filterStock) && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-blue-600" />}</button>
            <span className="flex h-10 min-w-12 flex-shrink-0 items-center justify-center rounded border border-slate-300 bg-white px-2 text-xs font-medium text-slate-600">{filteredItems.length}</span>
          </div>
          {showMobileFilters && <div className="grid grid-cols-2 gap-2 rounded border border-slate-200 bg-slate-50 p-2">
            <select value={filterActive} onChange={(e) => setFilterActive(e.target.value)} className="h-9 min-w-0 rounded border border-slate-300 bg-white px-2 text-xs"><option value="all">Semua status</option><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="h-9 min-w-0 rounded border border-slate-300 bg-white px-2 text-xs"><option value="">Semua jenis</option>{allItemTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select>
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="h-9 min-w-0 rounded border border-slate-300 bg-white px-2 text-xs"><option value="">Semua kategori</option>{data.itemCategories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select>
            <select value={filterBrand} onChange={(e) => setFilterBrand(e.target.value)} className="h-9 min-w-0 rounded border border-slate-300 bg-white px-2 text-xs"><option value="">Semua merek</option>{brands.map((brand) => <option key={brand} value={brand}>{brand}</option>)}</select>
            <select value={filterStock} onChange={(e) => setFilterStock(e.target.value)} className="col-span-2 h-9 min-w-0 rounded border border-slate-300 bg-white px-2 text-xs"><option value="">Semua stok</option><option value="stok=0">Stok = 0</option><option value="stok!=0">Stok ≠ 0</option><option value="stok=1">Stok = 1</option><option value="stok>0">Stok &gt; 0</option><option value="stok<0">Stok &lt; 0</option><option value="stok<=1">Stok ≤ 1</option></select>
            {hasPermission('item:create') && <button type="button" onClick={() => openCategoryModal()} className="flex h-9 items-center justify-center gap-1 rounded border border-slate-300 bg-white text-xs font-medium text-blue-700"><FolderTree className="h-4 w-4" /> Kelola Kategori</button>}
            <button type="button" onClick={() => { setFilterActive('all'); setFilterType(''); setFilterCategory(''); setFilterBrand(''); setFilterStock(''); setSearch(''); }} className={`h-9 rounded border border-slate-300 bg-white text-xs font-medium text-blue-700 ${hasPermission('item:create') ? '' : 'col-span-2'}`}>Reset Filter</button>
          </div>}
        </div>
        <div className="hidden flex-wrap items-center gap-3 lg:flex">
          <select value={filterActive} onChange={(e) => setFilterActive(e.target.value)} className="h-10 rounded border border-slate-300 bg-white px-3 text-[13px] outline-none focus:border-blue-500">
            <option value="all">Non Aktif: Semua</option><option value="active">Non Aktif: Tidak</option><option value="inactive">Non Aktif: Ya</option>
          </select>
          <select value={filterBrand} onChange={(e) => setFilterBrand(e.target.value)} className="h-10 rounded border border-slate-300 bg-white px-3 text-[13px] outline-none focus:border-blue-500"><option value="">Merek Barang: Semua</option>{brands.map((brand) => <option key={brand} value={brand}>{brand}</option>)}</select>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="h-10 rounded border border-slate-300 bg-white px-3 text-[13px] outline-none focus:border-blue-500"><option value="">Kategori Barang: Semua</option>{data.itemCategories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="h-10 rounded border border-slate-300 bg-white px-3 text-[13px] outline-none focus:border-blue-500"><option value="">Jenis Barang: Semua</option>{allItemTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select>
          <button type="button" className="flex h-10 w-12 items-center justify-center rounded border border-blue-500 bg-blue-50 text-blue-700" title="Filter lanjutan"><Filter className="h-5 w-5" /></button>
        </div>
        <div className="mt-3 hidden flex-wrap items-center justify-between gap-3 lg:flex">
          <div className="flex gap-2">
            {hasPermission('item:create') && <button onClick={() => openItemModal()} title="Data Baru" className="flex h-11 w-16 items-center justify-center rounded bg-blue-800 text-white hover:bg-blue-900"><Plus className="h-6 w-6" /></button>}
            <button type="button" onClick={() => refreshData()} title="Refresh" className="flex h-11 w-12 items-center justify-center rounded border border-blue-600 bg-white text-blue-700 hover:bg-blue-50"><RefreshCw className="h-5 w-5" /></button>
          </div>
          <div className="relative flex items-center gap-2">
            <button type="button" onClick={exportCurrentData} title="Download / Export" className="flex h-10 w-12 items-center justify-center rounded border border-blue-600 bg-white text-blue-700"><Download className="h-5 w-5" /></button>
            {hasPermission('item:create') && <button type="button" onClick={() => { setShowImportModal(true); setImportPreview([]); setImportErrors([]); setImportSuccess(''); }} title="Import" className="flex h-10 w-12 items-center justify-center rounded border border-blue-600 bg-white text-blue-700"><Share2 className="h-5 w-5" /></button>}
            <button type="button" onClick={() => setShowPrintOptions(true)} title="Cetak / Simpan PDF sesuai filter" className="flex h-10 w-12 items-center justify-center rounded border border-blue-600 bg-white text-blue-700"><Printer className="h-5 w-5" /></button>
            <button type="button" onClick={() => setShowColumnSettings(value => !value)} title="Pengaturan Kolom" className="flex h-10 w-12 items-center justify-center rounded border border-blue-600 bg-white text-blue-700"><Settings2 className="h-5 w-5" /></button>
            <div className="relative w-80"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari atau ketik stok=0, stok!=0, stok>0" title="Filter stok: stok=0, stok!=0 atau stok<>0, stok>=1 atau stok=>1. Pisahkan koma untuk kombinasi OR." className={`${ui.search} w-full px-3 pr-10`} /><Search className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-900" /></div>
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
      <div className={`${ui.tableShell} mx-1`}>
        <div className="lg:hidden">
          <div className="grid grid-cols-[minmax(0,1fr)_62px_76px_36px] items-center gap-2 bg-[#2442a8] px-2 py-2 text-[10px] font-semibold uppercase text-white">
            <span>Barang/Jasa</span><span className="text-center">Stok</span><span>Kategori</span><span className="text-center">Aksi</span>
          </div>
          <div className="max-h-[calc(100vh-330px)] divide-y divide-slate-200 overflow-y-auto">
            {filteredItems.length === 0 ? <div className="px-4 py-16 text-center text-sm text-slate-500">Tidak ada barang/jasa ditemukan</div> : filteredItems.map((item, rowIndex) => (
              <div key={item.id} onClick={() => openItemModal(item)} className={`grid cursor-pointer grid-cols-[minmax(0,1fr)_62px_76px_36px] items-center gap-2 px-2 py-2.5 text-xs ${!item.isActive ? 'bg-red-50/60 opacity-75' : rowIndex % 2 ? 'bg-slate-50' : 'bg-white'}`}>
                <div className="min-w-0"><p className="line-clamp-2 font-semibold leading-4 text-slate-900">{item.name}</p><p className="mt-0.5 truncate font-mono text-[10px] text-slate-500">{item.code}</p></div>
                <div className="text-center font-semibold tabular-nums text-slate-800"><span>{item.type === 'Persediaan' ? displayStock(item) : '—'}</span><span className="ml-1 text-[10px] font-normal text-slate-500">{item.unit}</span></div>
                <div className="truncate text-[10px] text-slate-600" title={item.categoryName}>{item.categoryName}</div>
                <div className="flex justify-center" onClick={(event) => event.stopPropagation()}>{hasPermission('item:edit') && <button type="button" onClick={() => openItemModal(item)} aria-label={`Edit ${item.name}`} className="rounded p-1.5 text-blue-600 hover:bg-blue-100"><Edit className="h-4 w-4" /></button>}</div>
              </div>
            ))}
          </div>
        </div>
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
        <div className="hidden max-h-[calc(100vh-420px)] overflow-auto lg:block lg:max-h-[calc(100vh-265px)]">
          <table className="w-full table-fixed" style={{ minWidth: tableMinWidth }}>
            <thead className="sticky top-0 z-10 bg-[#637c93] text-white">
              <tr>
                <th colSpan={9} className="p-0">
                  <div className="flex items-center text-sm font-medium" style={{ minWidth: tableMinWidth }}>
                    <div className="w-10 flex-shrink-0 px-2 py-3"></div>
                    {itemTableColumns.map(column => resizableHeader(
                      column,
                      column === 'code' ? 'Kode Barang' : column === 'name' ? 'Nama Barang' : itemColumnLabels[column],
                      column === 'stock' || column === 'purchasePrice' || column === 'price' ? 'right' : column === 'status' || column === 'actions' ? 'center' : 'left'
                    ))}
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
              ) : filteredItems.map((item, rowIndex) => {
                const isGroup = item.type === 'Group' && item.groupMembers && item.groupMembers.length > 0;
                const expanded = expandedGroups.has(item.id);
                return (
                    <tr key={item.id} className={`group ${!item.isActive ? 'bg-red-50/50 opacity-75' : rowIndex % 2 ? 'bg-slate-50' : 'bg-white'}`}>
                    <td colSpan={9} className="p-0">
                      {/* Main row */}
                      <div style={{ minWidth: tableMinWidth }} className="flex cursor-pointer items-center transition-colors hover:bg-blue-50/50" onClick={() => openItemModal(item)}>
                        <div className="w-10 flex-shrink-0 px-2 py-3 text-center" onClick={event => { if (isGroup) { event.stopPropagation(); toggleGroup(item.id); } }}>
                          {isGroup ? (
                            expanded ? <ChevronUp className="mx-auto h-4 w-4 text-purple-500" /> : <ChevronDown className="mx-auto h-4 w-4 text-purple-500" />
                          ) : null}
                        </div>
                        {itemTableColumns.map(column => {
                          const base = 'flex-shrink-0 px-3 py-2.5 text-[13px] leading-5 text-slate-800';
                          if (column === 'code') return <div key={column} style={columnStyle(column)} className={`${base} truncate font-medium`} title={item.code}>{item.code}</div>;
                          if (column === 'name') return <div key={column} style={columnStyle(column)} className={`${base} overflow-hidden`}><div className="flex items-center gap-2"><p className="truncate font-medium text-slate-900">{item.name}</p>{!item.isActive && <span className="rounded-full bg-red-100 px-2 text-[10px] font-bold text-red-700">NONAKTIF</span>}{item.verificationStatus === 'Pending' && <span className="rounded-full bg-amber-100 px-2 text-[10px] font-bold text-amber-800">MENUNGGU VERIFIKASI</span>}{isGroup && <span className="rounded bg-purple-100 px-1.5 text-[10px] text-purple-700">{item.groupMembers!.length} item</span>}</div></div>;
                          if (column === 'receiptDescription') return <div key={column} style={columnStyle(column)} className={`${base} truncate`} title={item.receiptDescription || item.name}>{item.receiptDescription || item.name}</div>;
                          if (column === 'type') return <div key={column} style={columnStyle(column)} className={base}><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeColors[item.type] || 'bg-gray-100 text-gray-700'}`}>{item.type}</span></div>;
                          if (column === 'category') return <div key={column} style={columnStyle(column)} className={`${base} truncate`}>{item.categoryName}</div>;
                          if (column === 'barcode') return <div key={column} style={columnStyle(column)} className={`${base} truncate font-mono`}>{item.barcode || '—'}</div>;
                          if (column === 'stock') return <div key={column} style={columnStyle(column)} className={`${base} text-right font-semibold`}>{item.type === 'Persediaan' ? displayStock(item) : '—'}</div>;
                          if (column === 'unit') return <div key={column} style={columnStyle(column)} className={base}>{item.unit}</div>;
                          if (column === 'brand') return <div key={column} style={columnStyle(column)} className={`${base} truncate`}>{item.brand || '—'}</div>;
                          if (column === 'purchasePrice') return <div key={column} style={columnStyle(column)} className={`${base} text-right`}>{formatCurrency(item.purchasePrice)}</div>;
                          if (column === 'status') return <div key={column} style={columnStyle(column)} className={`${base} text-center font-semibold ${item.isActive ? 'text-green-700' : 'text-red-700'}`}>{item.isActive ? 'Aktif' : 'Nonaktif'}</div>;
                          if (column === 'price') return <div key={column} style={columnStyle(column)} className={`${base} text-right font-medium`}>{formatCurrency(item.sellingPrice)}</div>;
                          return <div key={column} style={columnStyle(column)} className={`${base} flex justify-center gap-2`} onClick={event => event.stopPropagation()}>{hasPermission('item:edit') && <button onClick={() => openItemModal(item)} className="p-1 text-blue-600 hover:bg-blue-100" title="Edit"><Edit className="h-4 w-4" /></button>}{hasPermission('item:delete') && <button onClick={() => removeItem(item)} className="p-1 text-red-600 hover:bg-red-100" title="Hapus"><Trash2 className="h-4 w-4" /></button>}</div>;
                        })}
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
      </div>
      </div>}

      {/* ========== Item Modal ========== */}
      {showItemModal && (
        <div className="min-h-[calc(100vh-175px)] bg-[#f4f4f4]">
          <div className="flex min-h-[calc(100vh-175px)] w-full flex-col overflow-hidden border border-slate-300 bg-[#f4f4f4] shadow-sm">
            <div className="flex flex-shrink-0 items-end justify-between border-b border-slate-400 bg-[#f4f4f4] px-4 pt-1">
              <div className="flex items-end gap-1">{([
                  ['general', 'Umum'], ['sales', 'Penjualan / Pembelian'], ['stock', 'Stok'],
                  ['account', 'Akun'], ['image', 'Gambar'], ['other', 'Lain-lain'],
                ] as const).map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setItemFormTab(key)} className={`rounded-t border border-b-0 px-3 py-2 text-sm ${itemFormTab === key ? 'border-t-2 border-t-blue-600 bg-white font-semibold text-slate-900' : 'bg-[#d6d6d6] text-slate-600 hover:bg-[#e2e2e2]'}`}>{label}</button>
                ))}</div>
              {editingItem && <div className="flex items-end gap-1">
                <button type="button" onClick={() => setItemFormTab('movement')} className={`rounded-t border border-b-0 px-5 py-2 text-sm ${itemFormTab === 'movement' ? 'border-t-2 border-t-blue-600 bg-white font-semibold text-slate-900' : 'bg-[#d6d6d6] text-slate-600 hover:bg-[#e2e2e2]'}`}>Mutasi</button>
                <button type="button" onClick={() => setItemFormTab('warehouse')} className={`rounded-t border border-b-0 px-5 py-2 text-sm ${itemFormTab === 'warehouse' ? 'border-t-2 border-t-blue-600 bg-white font-semibold text-slate-900' : 'bg-[#d6d6d6] text-slate-600 hover:bg-[#e2e2e2]'}`}>Gudang</button>
              </div>}
            </div>
            <form onSubmit={saveItem} className="relative min-h-0 flex-1 overflow-y-auto bg-[#f4f4f4] p-2 pr-[76px] sm:p-3 sm:pr-[84px]">
              {itemFormTab === 'general' && <div className="min-h-[520px] rounded border border-slate-300 bg-white p-4 shadow-sm">
                <div className="grid gap-8 lg:grid-cols-2 lg:gap-10 xl:gap-12">
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
                      <input readOnly value={editingItem ? itemForm.code : nextItemCode()} className="h-9 rounded border border-slate-300 bg-slate-100 px-3 font-mono font-semibold uppercase text-blue-700" />
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
                      <label>Merek Kendaraan <small className="block font-normal text-slate-500">Opsional, bisa pilih lebih dari satu</small></label>
                      <div className="flex gap-2"><div className="relative min-w-0 flex-1"><div className="flex min-h-9 flex-wrap items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 pr-10">{itemForm.vehicleBrandIds.map((brandId,index)=>{const selected=vehicleBrands.find(row=>row.id===brandId);return selected?<span key={brandId} title={index===0?'Merek utama untuk kode barang':'Merek kendaraan tambahan'} className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs ${index===0?'border-blue-300 bg-blue-50 text-blue-800':'border-slate-300 bg-slate-50 text-slate-700'}`}><span>{selected.name}</span><button type="button" aria-label={`Hapus ${selected.name}`} onClick={()=>setItemForm(current=>{const ids=current.vehicleBrandIds.filter(id=>id!==brandId);return {...current,vehicleBrandIds:ids,vehicleBrandId:ids[0]||''};})} className="font-bold text-slate-500 hover:text-red-600">×</button></span>:null;})}{!itemForm.vehicleBrandIds.length&&<span className="text-xs text-slate-400">Cari/Pilih Merek Kendaraan...</span>}<button type="button" onClick={()=>setVehicleBrandPickerOpen(open=>!open)} title="Cari merek kendaraan" className="absolute right-1 top-1 flex h-7 w-8 items-center justify-center text-slate-700"><Search className="h-4 w-4"/></button></div>{vehicleBrandPickerOpen&&<div className="absolute left-0 right-0 top-full z-40 mt-1 rounded border border-slate-300 bg-white p-2 shadow-xl"><input autoFocus value={vehicleBrandQuery} onChange={event=>setVehicleBrandQuery(event.target.value)} placeholder="Ketik nama merek..." className="mb-2 h-8 w-full rounded border border-slate-300 px-2 text-sm"/><div className="max-h-44 overflow-y-auto">{vehicleBrands.filter(row=>row.isActive&&!itemForm.vehicleBrandIds.includes(row.id)&&row.name.toLowerCase().includes(vehicleBrandQuery.trim().toLowerCase())).map(row=><button key={row.id} type="button" onClick={()=>{setItemForm(current=>{const ids=[...current.vehicleBrandIds,row.id];return {...current,vehicleBrandIds:ids,vehicleBrandId:ids[0]||''};});setVehicleBrandQuery('');}} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-blue-50">{row.name}</button>)}{!vehicleBrands.some(row=>row.isActive&&!itemForm.vehicleBrandIds.includes(row.id)&&row.name.toLowerCase().includes(vehicleBrandQuery.trim().toLowerCase()))&&<p className="px-3 py-4 text-center text-xs text-slate-400">Tidak ada merek lain.</p>}</div><button type="button" onClick={()=>{setVehicleBrandPickerOpen(false);setVehicleBrandQuery('');}} className="mt-2 w-full border-t pt-2 text-xs text-slate-600">Tutup</button></div>}</div><button type="button" onClick={()=>setShowVehicleBrandModal(true)} title="Kelola merek kendaraan" aria-label="Kelola merek kendaraan" className="flex h-9 w-10 items-center justify-center rounded border border-blue-500 text-blue-700"><Edit className="h-4 w-4"/></button></div>
                      <label>Merek Barang</label>
                      <div className="flex gap-2"><select disabled={itemForm.type==='Jasa'||itemForm.type==='Group'} value={itemForm.itemBrandId} onChange={e=>{const selected=itemBrands.find(row=>row.id===e.target.value);setItemForm({...itemForm,itemBrandId:e.target.value,brand:selected?.name||''});}} className="h-9 min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 disabled:bg-slate-100"><option value="">Tanpa merek</option>{itemBrands.filter(row=>row.isActive||row.id===itemForm.itemBrandId).map(row=><option key={row.id} value={row.id}>{row.code} - {row.name} ({row.usageCount||0})</option>)}</select><button type="button" onClick={()=>setShowBrandModal(true)} title="Kelola merek barang" aria-label="Kelola merek barang" className="flex h-9 w-10 items-center justify-center rounded border border-blue-500 text-blue-700"><Edit className="h-4 w-4"/></button></div>
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
              {itemFormTab === 'stock' && <div className="min-h-[520px] rounded border border-slate-300 bg-white p-5 shadow-sm">
                <h4 className="mb-2 border-b border-slate-300 pb-2 text-lg font-medium text-blue-600">Informasi Stok per Gudang</h4>
                <p className="mb-5 text-sm text-slate-600">Stok hanya berubah melalui penerimaan barang, transfer gudang, pemakaian, dan penyesuaian stok. Nilai di bawah tidak dapat diedit dari master barang.</p>
                {!editingItem && <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">Simpan barang terlebih dahulu untuk melihat stok per gudang.</div>}
                {editingItem && <div className="overflow-hidden rounded-t-lg border border-slate-300">
                  <table className="w-full border-collapse text-sm">
                    <thead className="bg-[#637c93] text-left text-white"><tr><th className="px-4 py-2.5">Gudang</th><th className="px-4 py-2.5">Cabang</th><th className="px-4 py-2.5 text-right">Stok</th><th className="px-4 py-2.5 text-right">Dipesan</th><th className="px-4 py-2.5 text-right">Tersedia</th></tr></thead>
                    <tbody>{itemWarehouseRows.map(({ warehouse, quantity, reserved, available }) => <tr key={warehouse.id} className="border-b border-slate-200 odd:bg-white even:bg-slate-50"><td className="px-4 py-2.5 font-medium text-slate-900">{warehouse.name}</td><td className="px-4 py-2.5 text-slate-600">{warehouse.branchName}</td><td className="px-4 py-2.5 text-right tabular-nums">{quantity} {editingItem.unit}</td><td className="px-4 py-2.5 text-right tabular-nums text-amber-700">{reserved}</td><td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${available < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{available}</td></tr>)}</tbody>
                  </table>
                  {!itemWarehouseRows.length && <div className="bg-white px-4 py-12 text-center text-slate-500">Belum ada gudang aktif pada cabang yang dipilih.</div>}
                </div>}
              </div>}
              {itemFormTab === 'movement' && <div className="min-h-[560px] rounded border border-slate-300 bg-white p-3 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <select value={movementWarehouseId} onChange={event => setMovementWarehouseId(event.target.value)} className="h-10 min-w-56 rounded border border-slate-300 bg-white px-3 text-sm">
                    <option value="">Semua Gudang yang Diakses</option>
                    {data.warehouses.filter(warehouse => warehouse.isActive && !warehouse.isSystem).map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.branchName} · {warehouse.name}</option>)}
                  </select>
                  <IndonesianDateInput value={movementDateFrom} onChange={setMovementDateFrom} className="h-10 w-36 text-sm" />
                  <span className="text-sm font-medium text-slate-600">s/d</span>
                  <IndonesianDateInput value={movementDateTo} onChange={setMovementDateTo} className="h-10 w-36 text-sm" />
                  <button type="button" onClick={loadItemMovements} disabled={movementLoading} className="flex h-10 w-12 items-center justify-center rounded border border-blue-600 bg-white text-blue-700 disabled:opacity-50" title="Terapkan filter dan refresh mutasi"><RefreshCw className={`h-5 w-5 ${movementLoading ? 'animate-spin' : ''}`} /></button>
                  <div className="relative ml-auto w-80 max-w-full"><input value={movementSearch} onChange={event => setMovementSearch(event.target.value)} placeholder="Cari/Pilih..." className="h-10 w-full rounded border border-slate-300 bg-white px-3 pr-10 text-sm"/><Search className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2"/></div>
                </div>
                <div className="overflow-auto rounded-t-lg border border-slate-300">
                  <table className="min-w-[1100px] w-full border-collapse text-[13px]"><thead className="bg-[#637c93] text-white"><tr><th className="px-3 py-2.5 text-left">Tanggal</th><th className="px-3 py-2.5 text-left">No. Sumber #</th><th className="px-3 py-2.5 text-left">Tipe Transaksi</th><th className="px-3 py-2.5 text-left">Keterangan</th><th className="px-3 py-2.5 text-left">Gudang</th><th className="px-3 py-2.5 text-right">Nilai Satuan</th><th className="px-3 py-2.5 text-right">Masuk</th><th className="px-3 py-2.5 text-right">Keluar</th><th className="px-3 py-2.5 text-right">Saldo</th></tr></thead>
                    <tbody>{itemMovementRows.map((movement, index) => <tr key={movement.id} className={`border-b border-slate-200 ${index % 2 ? 'bg-slate-50' : 'bg-white'}`}><td className="px-3 py-2.5">{new Date(movement.occurredAt||movement.createdAt).toLocaleDateString('id-ID')}</td><td className="px-3 py-2.5 font-medium text-blue-700">{movement.referenceNumber || movement.id}</td><td className="px-3 py-2.5">{stockMovementLabels[movement.movementType]||movement.movementType}</td><td className="px-3 py-2.5">{movement.notes || '—'}</td><td className="px-3 py-2.5">{movement.sourceName && movement.destinationName ? `${movement.sourceName} → ${movement.destinationName}` : movement.destinationName || movement.sourceName || '—'}</td><td className="px-3 py-2.5 text-right">{movement.unitCost!=null?formatCurrency(movement.unitCost):'—'}</td><td className="px-3 py-2.5 text-right text-emerald-700">{movement.incoming || ''}</td><td className="px-3 py-2.5 text-right text-red-700">{movement.outgoing || ''}</td><td className="px-3 py-2.5 text-right font-semibold">{movement.balance ?? '—'}</td></tr>)}</tbody>
                  </table>
                  {movementError && <div className="bg-red-50 py-3 text-center text-sm text-red-700">{movementError}</div>}
                  {!movementLoading && !movementError && !itemMovementRows.length && <div className="bg-white py-16 text-center text-slate-500">Belum ada data mutasi pada periode ini.</div>}
                </div>
              </div>}
              {itemFormTab === 'warehouse' && <div className="min-h-[560px] rounded border border-slate-300 bg-white p-3 shadow-sm">
                <div className="mb-3 flex items-center gap-3"><IndonesianDateInput value={movementDateTo} onChange={setMovementDateTo} className="h-10 w-36 text-sm"/><button type="button" onClick={() => refreshData()} className="flex h-10 w-12 items-center justify-center rounded border border-blue-600 bg-white text-blue-700"><RefreshCw className="h-5 w-5"/></button></div>
                <div className="overflow-hidden rounded-t-lg border border-slate-300"><table className="w-full border-collapse text-[13px]"><thead className="bg-[#637c93] text-white"><tr><th className="px-4 py-2.5 text-left">Gudang</th><th className="px-4 py-2.5 text-left">Cabang</th><th className="px-4 py-2.5 text-right">Stok</th><th className="px-4 py-2.5 text-right">Dipesan</th><th className="px-4 py-2.5 text-right">Tersedia</th></tr></thead><tbody>{itemWarehouseRows.map(({ warehouse, quantity, reserved, available }, index) => <tr key={warehouse.id} className={`border-b border-slate-200 ${index % 2 ? 'bg-slate-50' : 'bg-white'}`}><td className="px-4 py-2.5 font-medium">{warehouse.name}</td><td className="px-4 py-2.5">{warehouse.branchName}</td><td className="px-4 py-2.5 text-right">{quantity}</td><td className="px-4 py-2.5 text-right">{reserved}</td><td className={`px-4 py-2.5 text-right font-semibold ${available < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{available}</td></tr>)}</tbody></table>{!itemWarehouseRows.length && <div className="bg-white py-16 text-center text-slate-500">Belum ada gudang aktif.</div>}</div>
              </div>}
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
                  <input readOnly value={editingItem ? itemForm.code : nextItemCode()} className="w-full rounded-lg border border-gray-300 bg-gray-100 px-4 py-2.5 font-mono font-semibold uppercase text-blue-700" />
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
                  <label className="mb-1 block text-sm font-medium text-gray-700">Merek Kendaraan untuk Kode</label>
                  <select value={itemForm.vehicleBrandId} onChange={e=>setItemForm({...itemForm,vehicleBrandId:e.target.value})} className="w-full rounded-lg border border-gray-300 px-4 py-2.5"><option value="">Pilih merek kendaraan</option>{vehicleBrands.filter(b=>b.isActive).map(b=><option key={b.id} value={b.id}>{b.itemCode||'--'} - {b.name}</option>)}</select>
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
              <div className="absolute right-2 top-2 flex w-16 flex-col items-center gap-2 sm:right-2">
                <button type="submit" disabled={isSavingItem} title="Simpan" className="flex h-12 w-12 items-center justify-center rounded border border-blue-700 bg-blue-600 text-white shadow-md hover:bg-blue-700 disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-400"><Save className="h-6 w-6" /></button>
                <button type="button" onClick={() => setShowItemModal(false)} title="Tutup" className="flex h-10 w-12 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"><X className="h-5 w-5" /></button>
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

      {showVehicleBrandModal&&<div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl"><header className="flex items-center justify-between border-b px-5 py-4"><div><h3 className="text-lg font-bold">Master Merek Kendaraan</h3><p className="text-sm text-slate-500">Kode digunakan sebagai bagian kode barang otomatis.</p></div><button type="button" onClick={()=>setShowVehicleBrandModal(false)}><X/></button></header><form onSubmit={addVehicleBrand} className="flex gap-2 border-b bg-slate-50 p-4"><input value={newVehicleBrand} onChange={e=>setNewVehicleBrand(e.target.value)} placeholder="Nama merek kendaraan baru" className="min-w-0 flex-1 rounded border px-3 py-2 uppercase"/><button className="rounded bg-blue-600 px-5 py-2 font-semibold text-white">Tambah</button></form><div className="max-h-[52vh] overflow-y-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-slate-600 text-white"><tr><th className="p-3 text-left">Kode</th><th className="text-left">Merek Kendaraan</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{vehicleBrands.map(row=><tr key={row.id} className="border-b"><td className="p-3 font-mono">{row.itemCode||'--'}</td><td>{row.name}</td><td className="text-center"><button type="button" onClick={()=>void toggleVehicleBrand(row)} className={`rounded-full px-2 py-0.5 text-xs ${row.isActive?'bg-emerald-100 text-emerald-700':'bg-slate-200 text-slate-600'}`}>{row.isActive?'Aktif':'Nonaktif'}</button></td><td className="text-center"><button type="button" onClick={()=>void editVehicleBrand(row)} title="Edit merek kendaraan" className="p-2 text-blue-600"><Edit className="h-4 w-4"/></button></td></tr>)}</tbody></table></div><footer className="flex justify-end border-t p-4"><button type="button" onClick={()=>setShowVehicleBrandModal(false)} className="rounded border px-5 py-2">Tutup</button></footer></div></div>}

      {showBrandModal&&<div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl"><header className="flex items-center justify-between border-b px-5 py-4"><div><h3 className="text-lg font-bold">Master Merek Barang</h3><p className="text-sm text-slate-500">Kode otomatis diurutkan dari merek yang paling banyak digunakan.</p></div><button type="button" onClick={()=>setShowBrandModal(false)}><X/></button></header><form onSubmit={saveItemBrand} className="grid gap-2 border-b bg-slate-50 p-4 sm:grid-cols-[110px_1fr_auto_auto]"><input readOnly value={brandForm.id?brandForm.code:'Otomatis'} aria-label="Kode otomatis" className="rounded border bg-slate-100 px-3 py-2 text-slate-500"/><input required value={brandForm.name} onChange={e=>setBrandForm({...brandForm,name:e.target.value})} placeholder="Nama merek" className="rounded border px-3 py-2 uppercase"/><label className="flex items-center gap-2 px-2 text-sm"><input type="checkbox" checked={brandForm.isActive} onChange={e=>setBrandForm({...brandForm,isActive:e.target.checked})}/>Aktif</label><button className="rounded bg-blue-600 px-5 py-2 font-semibold text-white">{brandForm.id?'Perbarui':'Tambah'}</button></form><div className="max-h-[50vh] overflow-y-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-slate-600 text-white"><tr><th className="p-3 text-left">Kode</th><th className="text-left">Nama Merek</th><th>Barang</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{itemBrands.map(row=><tr key={row.id} className="border-b"><td className="p-3 font-mono">{row.code}</td><td>{row.name}</td><td className="text-center font-semibold">{row.usageCount||0}</td><td className="text-center">{row.isActive?'Aktif':'Nonaktif'}</td><td className="text-center"><button type="button" onClick={()=>setBrandForm({id:row.id,code:row.code,name:row.name,description:row.description||'',isActive:row.isActive})} className="p-2 text-blue-600"><Edit className="h-4 w-4"/></button><button type="button" onClick={()=>void removeItemBrand(row)} className="p-2 text-red-600"><Trash2 className="h-4 w-4"/></button></td></tr>)}</tbody></table></div><footer className="flex justify-between border-t p-4"><button type="button" onClick={()=>setBrandForm({id:'',code:'',name:'',description:'',isActive:true})} className="rounded border px-4 py-2">Data Baru</button><button type="button" onClick={()=>setShowBrandModal(false)} className="rounded border px-5 py-2">Tutup</button></footer></div></div>}

      {/* ============================================================ */}
      {/* IMPORT CSV MODAL */}
      {/* ============================================================ */}
      {showPrintOptions && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b px-5 py-4">
              <div><h3 className="text-lg font-bold text-slate-900">Opsi Cetak Barang &amp; Jasa</h3><p className="text-sm text-slate-500">{filteredItems.length} item sesuai filter aktif</p></div>
              <button type="button" onClick={() => setShowPrintOptions(false)} className="rounded p-2 hover:bg-slate-100" aria-label="Tutup opsi cetak"><X className="h-5 w-5" /></button>
            </header>
            <div className="space-y-3 p-5">
              <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${!printGroupByCategory ? 'border-blue-600 bg-blue-50' : 'border-slate-200'}`}>
                <input type="radio" name="print-layout" checked={!printGroupByCategory} onChange={() => setPrintGroupByCategory(false)} className="mt-1" />
                <span><strong className="block text-slate-900">Daftar biasa</strong><span className="text-sm text-slate-500">Urutan mengikuti tabel yang sedang ditampilkan.</span></span>
              </label>
              <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${printGroupByCategory ? 'border-blue-600 bg-blue-50' : 'border-slate-200'}`}>
                <input type="radio" name="print-layout" checked={printGroupByCategory} onChange={() => setPrintGroupByCategory(true)} className="mt-1" />
                <span><strong className="flex items-center gap-2 text-slate-900"><FolderTree className="h-4 w-4 text-blue-700" />Group berdasarkan kategori</strong><span className="text-sm text-slate-500">Kategori diurutkan A-Z dan menampilkan jumlah item per kategori.</span></span>
              </label>
            </div>
            <footer className="flex justify-end gap-3 border-t bg-slate-50 px-5 py-4">
              <button type="button" onClick={() => setShowPrintOptions(false)} className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 font-medium text-slate-700">Batal</button>
              <button type="button" onClick={() => { setShowPrintOptions(false); printCurrentData(); }} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white hover:bg-blue-800"><Printer className="h-4 w-4" />Cetak / Simpan PDF</button>
            </footer>
          </div>
        </div>
      )}

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
