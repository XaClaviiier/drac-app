import { useState, useRef, useEffect } from 'react';
import {
  Bot, Send, KeyRound, Sparkles, Car, Users, Package,
  AlertTriangle, ExternalLink, X, Zap, Database, Loader2, Wrench, CheckCircle2, History, Share2, Building2, Grid2X2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/apiClient';
import { localDateKey } from '../lib/date';
import type { WorkOrder, WorkOrderService } from '../types';

const GROQ_URL = `${window.location.origin}/api/ai-chat`;
const GROQ_MODELS = [
  { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (cerdas)' },
  { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (super cepat)' },
  { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' },
];

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
  time: string;
  action?: { type: string; payload: any };
  actions?: Array<{ label: string; type: 'command' | 'select_vehicle' | 'create_wo_vehicle' | 'open_workorders' | 'open_workorder' | 'open_invoice'; value?: string }>;
  shareText?: string;
  vehicleSummary?: VehicleHistorySummary;
}

interface VehicleHistorySummary {
  plateNumber: string;
  vehicleName: string;
  color: string;
  ownerName: string;
  ownerPhone: string;
  entries: Array<{
    woNumber: string;
    date: string;
    branchName: string;
    status: string;
    total: number;
    complaint: string;
    serviceLines: string[];
    componentCount: number;
    invoiceNumber?: string;
  }>;
}

interface AISessionSnapshot {
  messages: ChatMsg[];
  input: string;
  pendingAction: any;
  pendingBranchId: string;
  registrationDraft: RegistrationDraft | null;
  showBranchChooser: boolean;
}

interface RegistrationDraft {
  mode: 'wo' | 'reginv';
  step: 'plate' | 'customerName' | 'phone' | 'vehicle' | 'complaint';
  plateNumber: string;
  customerName: string;
  phone: string;
  vehicleInfo: string;
}

type AIVehicleCatalogGeneration = { id: string; name: string; aliases?: string; isActive: boolean; engineCcs?: number[] };
type AIVehicleCatalogModel = { id: string; name: string; isActive: boolean; usageCount?: number; generations?: AIVehicleCatalogGeneration[] };
type AIVehicleCatalogBrand = { id: string; name: string; isActive: boolean; usageCount?: number; models: AIVehicleCatalogModel[] };
type AIVehicleCatalogColor = { id: string; name: string; isActive: boolean };
type AIVehicleCatalog = { brands: AIVehicleCatalogBrand[]; colors?: AIVehicleCatalogColor[] };

const now = () => new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
const aiSessionStorageKey = (userId: string) => `dokterac_ai_session_${userId}`;
const readAISession = (key: string): AISessionSnapshot | null => {
  try {
    const saved = sessionStorage.getItem(key);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as Partial<AISessionSnapshot>;
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      input: typeof parsed.input === 'string' ? parsed.input : '',
      pendingAction: parsed.pendingAction || null,
      pendingBranchId: typeof parsed.pendingBranchId === 'string' ? parsed.pendingBranchId : '',
      registrationDraft: parsed.registrationDraft || null,
      showBranchChooser: Boolean(parsed.showBranchChooser),
    };
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
};
const woStatusLabel = (status: WorkOrder['status']) => status === 'Closed' ? 'Lost Sales' : status;
const localDateISO = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const parseCompactTransactionDate = (text: string): { date: string; token: string } | null => {
  const match = text.match(/(?:^|\s)(\d{1,2})\/(?:(\d{1,2})(?:\/(\d{2}|\d{4})?)?)?(?=\s|$|[,;])/);
  if (!match) return null;

  const today = new Date();
  const day = Number(match[1]);
  const month = match[2] ? Number(match[2]) : today.getMonth() + 1;
  const rawYear = match[3] ? Number(match[3]) : today.getFullYear();
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) throw new Error(`Tanggal "${match[0].trim()}" tidak valid.`);

  return { date: localDateISO(parsed), token: match[0].trim() };
};

type InlineRegistrationIdentity = {
  customerName: string;
  phone: string;
  address: string;
  plateNumber: string;
  vehicleInfo: string;
  description: string;
};

const parseInlineRegistrationIdentity = (text: string): InlineRegistrationIdentity | null => {
  const source = text.trim();
  const match = source.match(/^reg(?:\s+wo)?\s+(.+?)\s+(08[\d\s-]{6,14})(?=\s|,|$)/i);
  if (!match) return null;

  const customerName = match[1].replace(/[,;]+$/g, '').trim();
  const phone = match[2].replace(/\D/g, '');
  if (!customerName || phone.length < 8) return null;

  let remainder = source.slice(match[0].length).trim().replace(/^[,;]\s*/, '');
  let explicitComplaint = '';
  const complaintMatch = remainder.match(/(?:^|[,;]\s*)keluhan\s*:\s*(.+)$/i);
  if (complaintMatch) {
    explicitComplaint = complaintMatch[1].trim();
    remainder = remainder.slice(0, complaintMatch.index).replace(/[,;\s]+$/, '');
  }

  const segments = remainder.split(',').map(part => part.trim());
  const address = segments[0] || '';
  const vehicleSegment = segments[1] || '';
  const description = explicitComplaint || segments.slice(2).filter(Boolean).join(', ');
  const vehicleMatch = vehicleSegment.match(/^([A-Z]{1,2}\s*\d{1,4}\s*[A-Z]{0,3})\s*(.*)$/i);

  return {
    customerName: customerName.toUpperCase(),
    phone,
    address,
    plateNumber: vehicleMatch?.[1]?.replace(/\s+/g, '').toUpperCase() || '',
    vehicleInfo: vehicleMatch?.[2]?.trim() || '',
    description,
  };
};
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const render = (t: string) =>
  esc(t.replace(/\n{2,}/g, '\n'))
    .replace(/```json[\s\S]*?```/g, '')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-white">$1</strong>')
    .replace(/^- (.+)$/gm, '<span class="block pl-3">• $1</span>')
    .replace(/\n/g, '<br/>');

export default function AIAssistant() {
  const {
    data, currentUser, currentBranchId, setCurrentBranchId,
    addWorkOrder, addCustomer, generateCustomerCode, addVehicle, updateVehicle, generateDocumentNumber,
    hasPermission, refreshData,
  } = useApp();

  const aiSessionUserId = currentUser?.id || currentUser?.username || 'anonymous';
  const aiSessionKey = aiSessionStorageKey(aiSessionUserId);
  const [restoredAISession] = useState<AISessionSnapshot | null>(() => readAISession(aiSessionKey));
  const [messages, setMessages] = useState<ChatMsg[]>(() => restoredAISession?.messages || []);
  const [input, setInput] = useState(() => restoredAISession?.input || '');
  const [busy, setBusy] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('apiToken') || '');
  const [model, setModel] = useState(GROQ_MODELS[0].id);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showBranchChooser, setShowBranchChooser] = useState(() => restoredAISession?.showBranchChooser ?? (currentBranchId === 'ALL'));
  const [showStarterMenu, setShowStarterMenu] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [keyDraft, setKeyDraft] = useState(apiKey);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pendingAction, setPendingAction] = useState<any>(() => restoredAISession?.pendingAction || null);
  const [pendingBranchId, setPendingBranchId] = useState(() => restoredAISession?.pendingBranchId || '');
  const [registrationDraft, setRegistrationDraft] = useState<RegistrationDraft | null>(() => restoredAISession?.registrationDraft || null);
  const commandHistoryKey = `dokterac_ai_history_${currentUser?.id || currentUser?.username || 'default'}`;
  const [commandHistory, setCommandHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`dokterac_ai_history_${currentUser?.id || currentUser?.username || 'default'}`);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [historyDraft, setHistoryDraft] = useState('');
  const [showCommandHistory, setShowCommandHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const historyLongPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLegacyFreeInspection = (item: typeof data.items[number]) => {
    const label = `${item.code} ${item.name} ${item.receiptDescription || ''}`.toUpperCase();
    return item.sellingPrice <= 0 && (/PENGECEKAN\s+GRATIS/.test(label) || /(^|\s)CEK[\s-]*AC($|\s)/.test(label));
  };

  const servicesFromCodes = (text: string, allowInventory = false) => {
    const allowedItems = data.items.filter(item => item.isActive && !isLegacyFreeInspection(item) && (allowInventory || item.type !== 'Persediaan'));
    const byCode = new Map(allowedItems.map(item => [item.code.trim().toUpperCase(), item]));
    const found = new Map<string, { name: string; price: number; qty: number }>();

    text.toUpperCase().split(/[\s,;|]+/).forEach(rawToken => {
      const token = rawToken.replace(/^[^A-Z0-9]+|[^A-Z0-9*X_-]+$/g, '');
      if (!token) return;
      let item = byCode.get(token);
      let qty = 1;
      if (!item) {
        const qtyMatch = token.match(/^(.+?)[X*](\d+)$/);
        if (qtyMatch) {
          item = byCode.get(qtyMatch[1]);
          qty = Math.max(1, Number(qtyMatch[2]) || 1);
        }
      }
      if (!item) return;
      const current = found.get(item.id);
      found.set(item.id, {
        name: item.code,
        price: item.sellingPrice,
        qty: (current?.qty || 0) + qty,
      });
    });

    return [...found.values()];
  };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy, showBranchChooser]);

  useEffect(() => {
    if (currentBranchId === 'ALL') setShowBranchChooser(true);
  }, [currentBranchId]);

  useEffect(() => {
    const snapshot: AISessionSnapshot = {
      messages,
      input,
      pendingAction,
      pendingBranchId,
      registrationDraft,
      showBranchChooser,
    };
    try {
      sessionStorage.setItem(aiSessionKey, JSON.stringify(snapshot));
    } catch {
      // Jika batas penyimpanan browser tercapai, pertahankan 50 pesan terakhir.
      try {
        sessionStorage.setItem(aiSessionKey, JSON.stringify({
          ...snapshot,
          messages: messages.slice(-50),
        }));
      } catch { /* Browser menolak penyimpanan sesi; chat tetap berjalan di memori. */ }
    }
  }, [aiSessionKey, messages, input, pendingAction, pendingBranchId, registrationDraft, showBranchChooser]);

  useEffect(() => {
    const field = inputRef.current;
    if (!field) return;
    field.style.height = '44px';
    if (window.innerWidth < 1024) {
      field.style.overflowY = 'hidden';
      return;
    }
    field.style.height = `${Math.min(field.scrollHeight, 92)}px`;
    field.style.overflowY = field.scrollHeight > 92 ? 'auto' : 'hidden';
  }, [input]);

  const rememberCommand = (command: string) => {
    const clean = command.trim();
    if (!clean || /gsk_|password|api\s*key/i.test(clean)) return;
    setCommandHistory((current) => {
      const next = [clean, ...current.filter((item) => item !== clean)].slice(0, 50);
      localStorage.setItem(commandHistoryKey, JSON.stringify(next));
      return next;
    });
    setHistoryIndex(-1);
    setHistoryDraft('');
  };

  const navigateHistory = (direction: 'up' | 'down') => {
    if (commandHistory.length === 0) return;
    if (direction === 'up') {
      if (historyIndex === -1) setHistoryDraft(input);
      const nextIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
      setHistoryIndex(nextIndex);
      setInput(commandHistory[nextIndex]);
      return;
    }
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    setInput(nextIndex >= 0 ? commandHistory[nextIndex] : historyDraft);
  };

  useEffect(() => {
    // Hapus key lama yang pernah disimpan di browser; key perusahaan kini hanya di server.
    localStorage.removeItem('groq_api_key');
    localStorage.removeItem('groq_model');
    api.getAISettings().then(result => {
      if (result.success && result.data) {
        setAiConfigured(Boolean(result.data.configured && result.data.isActive));
        if (result.data.model) setModel(result.data.model);
      }
    });
  }, []);

  const hasKey = aiConfigured;
  const fmt = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

  // ============ SMART CONTEXT (hemat token, hindari limit Groq) ============
  // Ringkasan selalu dikirim; detail hanya kalau relevan dengan pertanyaan.
  const cabangName = (branchId?: string) =>
    data.branches.find(b => b.id === branchId)?.name || branchId || '-';

  const chooseChatBranch = (branchId: string) => {
    const branch = data.branches.find(item => item.id === branchId);
    if (!branch) return;
    setCurrentBranchId(branchId);
    setPendingBranchId(branchId);
    setShowBranchChooser(false);
    setMessages(history => [
      ...history,
      {
        role: 'assistant',
        content: `Cabang aktif: **${branch.name.replace('CABANG ', '')}**. Pembuatan transaksi berikutnya akan masuk ke cabang ini.`,
        time: now(),
      },
    ]);
  };

  const normalizePlate = (value: string) => value.replace(/[^a-z0-9]/gi, '').toUpperCase();
  const editDistance = (left: string, right: string) => {
    const a = left.toLowerCase();
    const b = right.toLowerCase();
    const matrix = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
    for (let row = 0; row <= a.length; row += 1) matrix[row][0] = row;
    for (let col = 0; col <= b.length; col += 1) matrix[0][col] = col;
    for (let row = 1; row <= a.length; row += 1) {
      for (let col = 1; col <= b.length; col += 1) {
        matrix[row][col] = Math.min(
          matrix[row - 1][col] + 1,
          matrix[row][col - 1] + 1,
          matrix[row - 1][col - 1] + (a[row - 1] === b[col - 1] ? 0 : 1),
        );
      }
    }
    return matrix[a.length][b.length];
  };

  const lookupTerms = (value: string) => {
    const ignored = new Set(['cek', 'cari', 'data', 'customer', 'pelanggan', 'pemilik', 'milik', 'kendaraan', 'mobil', 'plat', 'nomor', 'riwayat', 'servis', 'service', 'siapa', 'punya']);
    return value.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length >= 2 && !ignored.has(term));
  };

  const extractVehiclePlateQuery = (userText: string) => {
    const withoutIntent = userText.trim().replace(/^(?:cek|cari|data|kendaraan|mobil|plat|nomor)\s*/i, '');
    const possiblePlate = withoutIntent.toUpperCase().match(/\b[A-Z]{1,2}[\s-]*\d{2,4}[\s-]*[A-Z]{1,3}\b/)?.[0];
    if (possiblePlate) return normalizePlate(possiblePlate);

    const terms = lookupTerms(withoutIntent)
      .map((term) => normalizePlate(term))
      .filter((term) => term.length >= 2);
    return terms[0] || '';
  };

  const findVehicleSuggestions = (plateQuery: string) => {
    if (!plateQuery) return [];
    return data.vehicles
      .map((item) => {
        const normalized = normalizePlate(item.plateNumber);
        let score = 99;
        if (normalized.startsWith(plateQuery)) score = 0;
        else if (normalized.includes(plateQuery)) score = 1;
        else {
          const distance = editDistance(plateQuery, normalized);
          if (plateQuery.length >= 5 && distance <= Math.max(2, Math.floor(plateQuery.length * 0.3))) score = 2 + distance;
        }
        return { item, score };
      })
      .filter((candidate) => candidate.score < 99)
      .sort((a, b) => a.score - b.score || a.item.plateNumber.localeCompare(b.item.plateNumber))
      .slice(0, 10);
  };

  const buildVehicleHistoryReply = (userText: string): string | null => {
    const lower = userText.toLowerCase();
    const isHistoryIntent = /(cek|riwayat|history|pemilik|milik siapa|siapa punya|pernah|servis|service|wo terakhir|keluhan sebelumnya)/i.test(lower);
    const isCreateIntent = /(buat|tambah|bikin|create)\s+(wo|order)/i.test(lower);
    if (!isHistoryIntent || isCreateIntent) return null;

    const compactText = userText.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const vehicle = data.vehicles.find((item) => compactText.includes(normalizePlate(item.plateNumber)));
    if (!vehicle) {
      const plateQuery = extractVehiclePlateQuery(userText);
      if (!plateQuery) return null;

      const candidates = findVehicleSuggestions(plateQuery);

      if (candidates.length > 0) {
        return [
          `Plat **${plateQuery}** tidak ditemukan persis.`,
          '',
          candidates.length === 1 ? 'Apakah yang dimaksud kendaraan berikut?' : `Ditemukan **${candidates.length} saran nomor plat**:`,
          '',
          ...candidates.map(({ item }, index) => {
            const customer = data.customers.find((entry) => entry.id === item.customerRefId || entry.customerCode === item.customerId);
            const woCount = data.workOrders.filter((wo) =>
              (wo.vehicleRefId && wo.vehicleRefId === item.id)
              || normalizePlate(wo.plateNumber) === normalizePlate(item.plateNumber)
            ).length;
            return `${index + 1}. **${item.plateNumber}** — ${[item.brand, item.model].filter(Boolean).join(' ') || '-'}\n   Pemilik: ${customer?.name || item.customerName || '-'} · ${woCount} WO`;
          }),
          '',
          'Pilih nomor plat di bawah untuk membuka detail kendaraan.',
        ].join('\n');
      }

      return `Kendaraan dengan plat **${plateQuery}** tidak ditemukan dalam Register Kendaraan.\n\nPeriksa kembali nomor plat atau daftarkan kendaraan terlebih dahulu.`;
    }

    const customer = data.customers.find((item) =>
      item.id === vehicle.customerRefId
      || item.customerCode === vehicle.customerId
    );
    const canSeeAllBranches = hasPermission('all_branches');
    const allowedBranchIds = new Set(
      canSeeAllBranches
        ? data.branches.filter((branch) => branch.isActive).map((branch) => branch.id)
        : (currentUser?.branchIds?.length ? currentUser.branchIds : [currentUser?.branchId].filter(Boolean) as string[])
    );
    const allVehicleWOs = data.workOrders
      .filter((wo) =>
        (wo.vehicleRefId && wo.vehicleRefId === vehicle.id)
        || normalizePlate(wo.plateNumber) === normalizePlate(vehicle.plateNumber)
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.woNumber.localeCompare(a.woNumber));
    const visibleWOs = allVehicleWOs.filter((wo) => allowedBranchIds.has(wo.branchId));
    const activeWO = visibleWOs.find((wo) =>
      ['Register', 'Proses'].includes(wo.status) && !wo.continuedToWoId
    );
    const latestClosedWO = visibleWOs[0]?.status === 'Closed' && !visibleWOs[0].continuedToWoId ? visibleWOs[0] : undefined;
    const showAll = /(semua|seluruh|lengkap)/i.test(lower);
    const listedWOs = showAll ? visibleWOs : visibleWOs.slice(0, 3);
    const vehicleName = [vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(' ') || '-';
    const ownerName = customer?.name || vehicle.customerName || '-';
    const ownerPhone = customer?.phone || vehicle.phone || '-';
    const lines = [
      `🚗 **${vehicle.plateNumber}**`,
      `${vehicleName} • ${vehicle.color || '-'}`,
      `👤 **${ownerName}** • ${ownerPhone}`,
    ];

    if (activeWO) {
      lines.push(
        '',
        `⚠️ **WO aktif: ${activeWO.woNumber}**`,
        `${cabangName(activeWO.branchId)} • **${woStatusLabel(activeWO.status)}**`,
        'Buka WO aktif ini sebelum membuat WO lain untuk kendaraan yang sama.',
      );
    } else if (latestClosedWO) {
      lines.push(
        '',
        `ℹ️ WO terakhir **${latestClosedWO.woNumber}** berstatus **Lost Sales**.`,
        'Masalah yang sama dapat dilanjutkan dari WO tersebut; masalah berbeda dibuat sebagai WO baru.',
      );
    }

    if (listedWOs.length === 0) {
      lines.push('', '**Riwayat servis**', 'Belum ada WO pada cabang yang dapat Anda akses.');
      if (allVehicleWOs.length > 0 && !canSeeAllBranches) {
        lines.push('Kendaraan memiliki riwayat di cabang lain, tetapi detailnya dibatasi oleh hak akses Anda.');
      }
      return lines.join('\n');
    }

    lines.push('', showAll ? `**Riwayat servis (${visibleWOs.length})**` : '**Servis terakhir**');
    listedWOs.forEach((wo, index) => {
      const services = compactServiceNames(wo.services);
      lines.push(
        index === 0 ? '' : '────────',
        `**${wo.woNumber}** • ${formatHistoryDate(wo.date)}`,
        `${cabangName(wo.branchId)} • **${woStatusLabel(wo.status)}** • ${fmt(wo.total)}`,
        `Keluhan: ${wo.description || '-'}`,
        `Layanan: ${services}`,
        ...(wo.invoiceNumber ? [`Faktur: **${wo.invoiceNumber}**`] : []),
      );
    });

    if (!showAll && visibleWOs.length > listedWOs.length) {
      lines.push('', `Masih ada ${visibleWOs.length - listedWOs.length} WO lain. Pilih **Riwayat Lengkap** untuk melihat semuanya.`);
    }
    return lines.join('\n');
  };

  const findCustomerMatches = (userText: string) => {
    const compactInput = userText.replace(/[^a-z0-9]/gi, '').toLowerCase();
    const queryWords = lookupTerms(userText);
    let candidates = data.customers.filter((customer) => {
      const compactCode = customer.customerCode.replace(/[^a-z0-9]/gi, '').toLowerCase();
      const compactPhone = customer.phone.replace(/\D/g, '');
      const nameWords = customer.name.toLowerCase().split(/\s+/).filter(Boolean);
      return (compactCode && compactInput.includes(compactCode))
        || (compactPhone.length >= 6 && compactInput.includes(compactPhone))
        || (queryWords.length > 0 && queryWords.every((word) =>
          customer.name.toLowerCase().includes(word)
          || customer.customerCode.toLowerCase().includes(word)
          || customer.phone.includes(word)
          || nameWords.some((nameWord) => nameWord.startsWith(word))
        ));
    });

    let fuzzySearch = false;
    if (candidates.length === 0 && queryWords.length > 0) {
      const nameQuery = queryWords.join(' ');
      candidates = data.customers
        .map((customer) => {
          const normalizedName = customer.name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
          const fullDistance = editDistance(nameQuery, normalizedName);
          const wordDistance = Math.min(...normalizedName.split(' ').map((word) => editDistance(nameQuery, word)));
          const distance = Math.min(fullDistance, wordDistance);
          const allowedDistance = Math.max(1, Math.floor(nameQuery.length * 0.3));
          return { customer, distance, allowedDistance };
        })
        .filter(({ distance, allowedDistance }) => distance <= allowedDistance)
        .sort((a, b) => a.distance - b.distance || a.customer.name.localeCompare(b.customer.name))
        .slice(0, 10)
        .map(({ customer }) => customer);
      fuzzySearch = candidates.length > 0;
    }
    return { candidates, fuzzySearch };
  };

  const findSimilarRegistrationCustomers = (name: string, phone: string) => {
    const ignoredWords = new Set(['pak', 'bapak', 'bu', 'ibu', 'mr', 'mrs']);
    const words = (value: string) => value.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
      .filter(word => word.length >= 3 && !ignoredWords.has(word));
    const requestedWords = words(name);
    const normalizedPhone = phone.replace(/\D/g, '');

    return data.customers.filter(customer => {
      if (customer.name.trim().toUpperCase() === name.trim().toUpperCase()) return false;
      if (normalizedPhone.length >= 8 && customer.phone.replace(/\D/g, '') === normalizedPhone) return true;
      const customerWords = words(customer.name);
      return requestedWords.some(requested => customerWords.some(existing =>
        Math.min(requested.length, existing.length) >= 4
        && (requested.startsWith(existing) || existing.startsWith(requested))
      ));
    }).slice(0, 5);
  };

  const startNewChat = () => {
    sessionStorage.removeItem(aiSessionKey);
    setMessages([]);
    setInput('');
    setPendingAction(null);
    setPendingBranchId('');
    setRegistrationDraft(null);
    setShowStarterMenu(false);
    setShowCommandHistory(false);
    setHistoryIndex(-1);
    setHistoryDraft('');
    setShowBranchChooser(currentBranchId === 'ALL');
  };

  const formatHistoryDate = (value: string) => {
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (!digits) return '-';
    if (digits.length <= 4) return digits;
    return [digits.slice(0, 4), digits.slice(4, 8), digits.slice(8)].filter(Boolean).join(' ');
  };

  const displayBranchName = (branchId: string) =>
    cabangName(branchId).replace(/^CABANG\s+/i, '').trim().toLocaleUpperCase('id-ID');

  const serviceSummary = (services: WorkOrderService[]) => {
    const packageMemberCounts = new Map<string, number>();
    services.forEach((service) => {
      const packageName = service.description?.match(/^Isi dari paket:\s*(.+)$/i)?.[1]?.trim();
      if (!packageName) return;
      const key = packageName.replace(/^\[PAKET\]\s*/i, '').trim().toUpperCase();
      packageMemberCounts.set(key, (packageMemberCounts.get(key) || 0) + 1);
    });

    const roots = services
      .filter((service) => !/^Isi dari paket:/i.test(service.description || ''))
      .map((service) => service.name.replace(/^\[PAKET\]\s*/i, '').trim())
      .filter(Boolean);
    const componentCount = roots.reduce(
      (total, name) => total + (packageMemberCounts.get(name.toUpperCase()) || 0),
      0,
    );

    return {
      lines: roots.length > 0 ? roots.slice(0, 3) : ['Belum ada layanan'],
      componentCount,
      remainingCount: Math.max(0, roots.length - 3),
    };
  };

  const compactServiceNames = (services: WorkOrderService[]) => {
    const summary = serviceSummary(services);
    const componentLabel = summary.componentCount > 0 ? ` (+${summary.componentCount} komponen paket)` : '';
    const remainingLabel = summary.remainingCount > 0 ? `, +${summary.remainingCount} layanan lain` : '';
    return `${summary.lines.join(', ')}${componentLabel}${remainingLabel}`;
  };

  const buildVehicleSummary = (vehicle: typeof data.vehicles[number], showAll = false): VehicleHistorySummary => {
    const customer = data.customers.find((item) =>
      item.id === vehicle.customerRefId || item.customerCode === vehicle.customerId
    );
    const canSeeAllBranches = hasPermission('all_branches');
    const allowedBranchIds = new Set(
      canSeeAllBranches
        ? data.branches.filter((branch) => branch.isActive).map((branch) => branch.id)
        : (currentUser?.branchIds?.length ? currentUser.branchIds : [currentUser?.branchId].filter(Boolean) as string[])
    );
    const workOrders = data.workOrders
      .filter((wo) =>
        ((wo.vehicleRefId && wo.vehicleRefId === vehicle.id)
          || normalizePlate(wo.plateNumber) === normalizePlate(vehicle.plateNumber))
        && allowedBranchIds.has(wo.branchId)
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.woNumber.localeCompare(a.woNumber));

    return {
      plateNumber: vehicle.plateNumber,
      vehicleName: [vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(' ') || '-',
      color: vehicle.color || '-',
      ownerName: customer?.name || vehicle.customerName || '-',
      ownerPhone: formatPhone(customer?.phone || vehicle.phone || ''),
      entries: (showAll ? workOrders : workOrders.slice(0, 3)).map((wo) => {
        const services = serviceSummary(wo.services);
        const invoice = data.invoices.find((item) => item.id === wo.invoiceId || item.woId === wo.id);
        return {
          woNumber: wo.woNumber,
          date: formatHistoryDate(wo.date),
          branchName: displayBranchName(wo.branchId),
          status: woStatusLabel(wo.status),
          total: wo.total,
          complaint: wo.description || '-',
          serviceLines: [
            ...services.lines,
            ...(services.remainingCount > 0 ? [`+${services.remainingCount} layanan lain`] : []),
          ],
          componentCount: services.componentCount,
          invoiceNumber: wo.invoiceNumber || invoice?.invoiceNumber,
        };
      }),
    };
  };

  const buildCustomerLookupReply = (userText: string, lookupResult = findCustomerMatches(userText)): string | null => {
    const lower = userText.toLowerCase();
    const isLookupIntent = /(cek|cari|data|pelanggan|customer|pemilik|kendaraan milik|riwayat|servis|service)/i.test(lower);
    const isCreateIntent = /(buat|tambah|bikin|create)\s+(wo|order|pelanggan|customer)/i.test(lower);
    if (!isLookupIntent || isCreateIntent) return null;
    const { candidates, fuzzySearch } = lookupResult;

    if (candidates.length === 0) return null;
    if (candidates.length > 1 || fuzzySearch) {
      const choices = candidates.slice(0, 8).map((customer, index) => {
        const plates = data.vehicles.filter((vehicle) =>
          vehicle.customerRefId === customer.id
          || (!vehicle.customerRefId && vehicle.customerId === customer.customerCode)
        ).map(vehicle => vehicle.plateNumber);
        return `${index + 1}. **${customer.name}** — ${customer.customerCode}\n   ${customer.phone || 'tanpa telepon'}\n   Kendaraan: ${plates.length ? plates.join(', ') : 'Belum ada kendaraan'}`;
      });
      return [
        fuzzySearch
          ? `Tidak ditemukan nama persis. Apakah yang dimaksud salah satu dari **${candidates.length} pelanggan** berikut?`
          : `Ditemukan **${candidates.length} pelanggan** yang mirip. Pilih nomor plat kendaraan:`,
        '',
        ...choices,
      ].join('\n');
    }

    const customer = candidates[0];
    const vehicles = data.vehicles.filter((vehicle) =>
      vehicle.customerRefId === customer.id
      || (!vehicle.customerRefId && vehicle.customerId === customer.customerCode)
    );
    const canSeeAllBranches = hasPermission('all_branches');
    const allowedBranchIds = new Set(
      canSeeAllBranches
        ? data.branches.filter((branch) => branch.isActive).map((branch) => branch.id)
        : (currentUser?.branchIds?.length ? currentUser.branchIds : [currentUser?.branchId].filter(Boolean) as string[])
    );
    const lines = [
      `**Pelanggan ditemukan**`,
      '',
      `- Kode: **${customer.customerCode}**`,
      `- Nama: **${customer.name}**`,
      `- Telepon: ${customer.phone || '-'}`,
      `- Email: ${customer.email || '-'}`,
      `- Alamat: ${customer.address || '-'}`,
      '',
      `**Kendaraan terdaftar: ${vehicles.length}**`,
    ];

    if (vehicles.length === 0) {
      lines.push('', 'Pelanggan ini belum memiliki kendaraan terdaftar.');
      return lines.join('\n');
    }

    vehicles.forEach((vehicle, index) => {
      const allWOs = data.workOrders
        .filter((wo) =>
          (wo.vehicleRefId && wo.vehicleRefId === vehicle.id)
          || normalizePlate(wo.plateNumber) === normalizePlate(vehicle.plateNumber)
        )
        .sort((a, b) => b.date.localeCompare(a.date) || b.woNumber.localeCompare(a.woNumber));
      const visibleWOs = allWOs.filter((wo) => allowedBranchIds.has(wo.branchId));
      const latest = visibleWOs[0];
      lines.push(
        '',
        `${index + 1}. **${vehicle.plateNumber}**`,
        `   ${[vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(' ') || '-'} · ${vehicle.color || '-'}`,
        `   Riwayat yang dapat diakses: ${visibleWOs.length} WO`,
        latest
          ? `   Terakhir: ${latest.date} · ${latest.woNumber} · ${cabangName(latest.branchId)} · ${latest.status}`
          : '   Terakhir: belum ada riwayat pada cabang yang dapat diakses',
      );
      if (allWOs.length > visibleWOs.length && !canSeeAllBranches) {
        lines.push('   Ada riwayat lain yang dibatasi oleh hak akses cabang.');
      }
    });

    lines.push('', `Ketik **cek ${vehicles[0].plateNumber}** untuk melihat rincian riwayat salah satu kendaraan.`);
    return lines.join('\n');
  };

  const buildListReply = (userText: string): string | null => {
    const lower = userText.toLowerCase().trim();
    if (!lower.startsWith('list')) return null;

    const page = Math.max(1, Number(lower.match(/halaman\s+(\d+)/)?.[1] || 1));
    const pageSize = 10;
    const start = (page - 1) * pageSize;
    const canSeeAllBranches = hasPermission('all_branches');
    const allowedBranchIds = new Set(
      canSeeAllBranches
        ? data.branches.filter((branch) => branch.isActive).map((branch) => branch.id)
        : (currentUser?.branchIds?.length ? currentUser.branchIds : [currentUser?.branchId].filter(Boolean) as string[])
    );
    const finish = (title: string, rows: string[], total: number, example: string) => {
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      if (rows.length === 0) return `**${title}**\n\nTidak ada data yang cocok.`;
      const lines = [
        `**${title} — ${total} ditemukan**`,
        '',
        ...rows,
        '',
        `Halaman **${page}/${totalPages}** · menampilkan ${start + 1}–${Math.min(start + rows.length, total)} dari ${total}.`,
      ];
      if (page < totalPages) lines.push(`Ketik **${example} halaman ${page + 1}** untuk data berikutnya.`);
      return lines.join('\n');
    };
    const queryTerms = lookupTerms(
      lower
        .replace(/^list\s*/, '')
        .replace(/\b(customer|pelanggan|kendaraan|mobil|wo|order kerja|faktur|invoice|barang|item|stok|supplier|pemasok|halaman\s+\d+|hari ini|pengecekan|proses|selesai|dibayar|batal|menipis|habis|belum lunas|lunas)\b/g, ' ')
    );

    if (/\b(customer|pelanggan)\b/.test(lower)) {
      const filtered = data.customers
        .filter((customer) => queryTerms.length === 0 || queryTerms.every((term) =>
          `${customer.customerCode} ${customer.name} ${customer.phone}`.toLowerCase().includes(term)
        ))
        .sort((a, b) => a.name.localeCompare(b.name));
      const rows = filtered.slice(start, start + pageSize).map((customer, index) => {
        const vehicleCount = data.vehicles.filter((vehicle) =>
          vehicle.customerRefId === customer.id || (!vehicle.customerRefId && vehicle.customerId === customer.customerCode)
        ).length;
        return `${start + index + 1}. **${customer.name}** — ${customer.customerCode}\n   ${customer.phone || 'tanpa telepon'} · ${vehicleCount} kendaraan`;
      });
      return finish('Daftar Pelanggan', rows, filtered.length, 'list customer');
    }

    if (/\b(kendaraan|mobil|plat)\b/.test(lower)) {
      const filtered = data.vehicles
        .filter((vehicle) => queryTerms.length === 0 || queryTerms.every((term) =>
          `${vehicle.plateNumber} ${vehicle.brand} ${vehicle.model} ${vehicle.customerName}`.toLowerCase().replace(/[^a-z0-9 ]/g, '').includes(term)
        ))
        .sort((a, b) => a.plateNumber.localeCompare(b.plateNumber));
      const rows = filtered.slice(start, start + pageSize).map((vehicle, index) => {
        const customer = data.customers.find((item) => item.id === vehicle.customerRefId || item.customerCode === vehicle.customerId);
        const woCount = data.workOrders.filter((wo) =>
          (wo.vehicleRefId && wo.vehicleRefId === vehicle.id) || normalizePlate(wo.plateNumber) === normalizePlate(vehicle.plateNumber)
        ).length;
        return `${start + index + 1}. **${vehicle.plateNumber}** — ${[vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(' ')}\n   Pemilik: ${customer?.name || vehicle.customerName || '-'} · ${woCount} WO`;
      });
      return finish('Daftar Kendaraan', rows, filtered.length, 'list kendaraan');
    }

    if (/\b(wo|order kerja)\b/.test(lower)) {
      const status = ['pengecekan', 'proses', 'selesai', 'dibayar', 'batal'].find((item) => lower.includes(item));
      const today = localDateKey();
      const filtered = data.workOrders
        .filter((wo) => allowedBranchIds.has(wo.branchId))
        .filter((wo) => !status || wo.status.toLowerCase() === status)
        .filter((wo) => !lower.includes('hari ini') || wo.date === today)
        .filter((wo) => queryTerms.length === 0 || queryTerms.every((term) =>
          `${wo.woNumber} ${wo.customerName} ${wo.plateNumber}`.toLowerCase().includes(term)
        ))
        .sort((a, b) => b.date.localeCompare(a.date) || b.woNumber.localeCompare(a.woNumber));
      const rows = filtered.slice(start, start + pageSize).map((wo, index) =>
        `${start + index + 1}. **${wo.woNumber}** — ${wo.date}\n   ${wo.customerName} · ${wo.plateNumber} · ${woStatusLabel(wo.status)} · ${fmt(wo.total)} · ${cabangName(wo.branchId)}`
      );
      return finish('Daftar Order Kerja', rows, filtered.length, 'list wo');
    }

    if (/\b(faktur|invoice)\b/.test(lower)) {
      const filtered = data.invoices
        .filter((invoice) => allowedBranchIds.has(invoice.branchId))
        .filter((invoice) => !lower.includes('belum lunas') || invoice.status === 'Belum Lunas')
        .filter((invoice) => !(/\blunas\b/.test(lower) && !lower.includes('belum lunas')) || invoice.status === 'Lunas')
        .filter((invoice) => queryTerms.length === 0 || queryTerms.every((term) =>
          `${invoice.invoiceNumber} ${invoice.customerName}`.toLowerCase().includes(term)
        ))
        .sort((a, b) => b.date.localeCompare(a.date) || b.invoiceNumber.localeCompare(a.invoiceNumber));
      const rows = filtered.slice(start, start + pageSize).map((invoice, index) =>
        `${start + index + 1}. **${invoice.invoiceNumber}** — ${invoice.date}\n   ${invoice.customerName} · ${invoice.status} · ${fmt(invoice.total)} · ${cabangName(invoice.branchId)}`
      );
      return finish('Daftar Faktur Penjualan', rows, filtered.length, 'list faktur');
    }

    if (/\b(barang|item|stok)\b/.test(lower)) {
      const filtered = data.items
        .filter((item) => !lower.includes('menipis') || (item.type === 'Persediaan' && item.stock > 0 && item.stock <= 3))
        .filter((item) => !lower.includes('habis') || (item.type === 'Persediaan' && item.stock <= 0))
        .filter((item) => queryTerms.length === 0 || queryTerms.every((term) =>
          `${item.code} ${item.barcode || ''} ${item.name} ${item.receiptDescription || ''} ${item.categoryName} ${item.brand}`.toLowerCase().includes(term)
        ))
        .sort((a, b) => a.name.localeCompare(b.name));
      const rows = filtered.slice(start, start + pageSize).map((item, index) =>
        `${start + index + 1}. **${item.code} — ${item.name}**\n   ${item.type} · stok ${item.stock} ${item.unit} · ${fmt(item.sellingPrice)}`
      );
      return finish('Daftar Barang & Stok', rows, filtered.length, 'list barang');
    }

    if (/\b(supplier|pemasok)\b/.test(lower)) {
      const filtered = data.suppliers
        .filter((supplier) => queryTerms.length === 0 || queryTerms.every((term) =>
          `${supplier.code} ${supplier.name} ${supplier.phone}`.toLowerCase().includes(term)
        ))
        .sort((a, b) => a.name.localeCompare(b.name));
      const rows = filtered.slice(start, start + pageSize).map((supplier, index) =>
        `${start + index + 1}. **${supplier.name}** — ${supplier.code}\n   ${supplier.phone || 'tanpa telepon'}`
      );
      return finish('Daftar Supplier', rows, filtered.length, 'list supplier');
    }

    return `Gunakan salah satu format berikut:\n\n- **list customer**\n- **list kendaraan DD**\n- **list wo hari ini**\n- **list wo proses**\n- **list faktur belum lunas**\n- **list stok menipis**\n- **list supplier**`;
  };

  const startRegistrationWizard = (mode: 'wo' | 'reginv' = 'wo') => {
    setPendingAction(null);
    setPendingBranchId('');
    setRegistrationDraft({ mode, step: 'plate', plateNumber: '', customerName: '', phone: '', vehicleInfo: '' });
    if (mode === 'reginv') {
      return `**REGINV Cepat — Langkah 1/4**\n\nMasukkan nomor plat kendaraan. Pada langkah terakhir tuliskan kode layanan/barang dan metode **Tunai** atau **Transfer**.\n\nKetik **batal** untuk menghentikan proses.`;
    }
    return `**Registrasi WO Baru — Langkah 1/4**\n\nMasukkan nomor plat kendaraan.\n\nKetik **batal** untuk menghentikan proses.`;
  };

  const continueRegistrationWizard = (userText: string): string => {
    if (!registrationDraft) return startRegistrationWizard();
    const value = userText.trim();
    const lower = value.toLowerCase();
    if (lower === 'batal') {
      setRegistrationDraft(null);
      setPendingAction(null);
      setPendingBranchId('');
      return 'Registrasi WO dibatalkan. Tidak ada data yang disimpan.';
    }
    if (lower === 'ulang') return startRegistrationWizard(registrationDraft.mode);

    if (registrationDraft.step === 'plate') {
      const plateMatch = value.toUpperCase().match(/\b[A-Z]{1,2}[\s-]*\d{2,4}[\s-]*[A-Z]{1,3}\b/)?.[0];
      if (!plateMatch) return 'Format nomor plat belum dikenali. Contoh: **DC1143OW** atau **DD 1486 QZ**.';
      const normalized = normalizePlate(plateMatch);
      const vehicle = data.vehicles.find((item) => normalizePlate(item.plateNumber) === normalized);
      if (vehicle) {
        const customer = data.customers.find((item) => item.id === vehicle.customerRefId || item.customerCode === vehicle.customerId);
        setRegistrationDraft({
          mode: registrationDraft.mode,
          step: 'complaint',
          plateNumber: vehicle.plateNumber,
          customerName: customer?.name || vehicle.customerName || '',
          phone: customer?.phone || vehicle.phone || '',
          vehicleInfo: [vehicle.brand, vehicle.model, vehicle.year, vehicle.color].filter(Boolean).join(' '),
        });
        return `Kendaraan ditemukan:\n\n- Plat: **${vehicle.plateNumber}**\n- Pemilik: **${customer?.name || vehicle.customerName || '-'}**\n- Kendaraan: ${[vehicle.brand, vehicle.model, vehicle.year, vehicle.color].filter(Boolean).join(' ')}\n\n**Langkah 4/4:** Jelaskan keluhan atau layanan yang dibutuhkan.`;
      }
      setRegistrationDraft({ ...registrationDraft, step: 'customerName', plateNumber: normalized });
      return `Plat **${normalized}** belum terdaftar.\n\n**Langkah 2/4:** Masukkan nama lengkap pelanggan.`;
    }

    if (registrationDraft.step === 'customerName') {
      if (value.length < 3) return 'Nama pelanggan minimal 3 karakter.';
      setRegistrationDraft({ ...registrationDraft, step: 'phone', customerName: value.toUpperCase() });
      return `Nama pelanggan: **${value.toUpperCase()}**\n\nMasukkan nomor telepon pelanggan.`;
    }

    if (registrationDraft.step === 'phone') {
      const phone = value.replace(/\D/g, '');
      if (phone.length < 8) return 'Nomor telepon belum valid. Masukkan minimal 8 angka.';
      setRegistrationDraft({ ...registrationDraft, step: 'vehicle', phone });
      return `**Langkah 3/4:** Masukkan data kendaraan dalam satu baris.\n\nFormat: **Merek Model Tahun Warna**\nContoh: Toyota Avanza 2020 Putih`;
    }

    if (registrationDraft.step === 'vehicle') {
      const year = value.match(/\b(19|20)\d{2}\b/)?.[0];
      if (!year || value.replace(year, '').trim().split(/\s+/).length < 2) {
        return 'Data kendaraan belum lengkap. Gunakan format: **Merek Model Tahun Warna**.';
      }
      setRegistrationDraft({ ...registrationDraft, step: 'complaint', vehicleInfo: value });
      return `Data kendaraan diterima: **${value}**\n\n**Langkah 4/4:** Jelaskan keluhan atau layanan yang dibutuhkan.`;
    }

    if (value.length < 3) return 'Keluhan terlalu singkat. Jelaskan kondisi kendaraan atau layanan yang dibutuhkan.';
    const isRegInv = registrationDraft.mode === 'reginv';
    const codedServices = servicesFromCodes(value, isRegInv);
    const paymentMethod = /\b(tf|transfer)\b/i.test(value) ? 'Transfer'
      : /\btunai\b/i.test(value) ? 'Tunai' : '';
    if (isRegInv && codedServices.length === 0) return 'REGINV wajib menyertakan minimal satu **kode layanan/barang** yang terdaftar.';
    if (isRegInv && !paymentMethod) return 'Pilih metode pembayaran dengan mengetik **Tunai** atau **Transfer**.';
    const action = {
      action: isRegInv ? 'create_quick_invoice' : 'create_wo',
      customerName: registrationDraft.customerName,
      phone: registrationDraft.phone,
      plateNumber: registrationDraft.plateNumber,
      vehicleInfo: registrationDraft.vehicleInfo,
      description: value,
      services: codedServices,
      paymentMethod,
    };
    let parsedDate: ReturnType<typeof parseCompactTransactionDate>;
    try {
      parsedDate = parseCompactTransactionDate(value);
    } catch (error: any) {
      return error.message;
    }
    if (parsedDate) Object.assign(action, { date: parsedDate.date });
    setPendingAction(action);
    setPendingBranchId(currentBranchId === 'ALL' ? '' : currentBranchId);
    setRegistrationDraft(null);
    if (isRegInv) {
      return `Data REGINV sudah lengkap.\n\n- Pelanggan: **${action.customerName}**\n- Plat: **${action.plateNumber}**\n- Metode: **${paymentMethod}**\n- Item: **${codedServices.map(item => `${item.name} ×${item.qty}`).join(', ')}**\n\nPilih cabang lalu konfirmasi. Sistem akan membuat nomor WO, invoice, dan pembayaran yang berbeda.`;
    }
    return `Data registrasi sudah lengkap.\n\n- Pelanggan: **${action.customerName}**\n- Telepon: ${action.phone}\n- Plat: **${action.plateNumber}**\n- Kendaraan: ${action.vehicleInfo}\n- Keluhan: ${action.description}\n- Layanan awal: **${codedServices.length > 0 ? codedServices.map(item => item.name).join(', ') : 'Belum ada (status Register)'}**\n\nPilih cabang lalu tekan **Konfirmasi & Buat WO**.`;
  };

  const buildSmartContext = (userMsgText: string): string => {
    const parts: string[] = [];
    const today = localDateKey();
    const lower = userMsgText.toLowerCase();
    const words = lower.split(/[^a-z0-9]+/).filter(w => w.length > 2);

    // Ringkasan (selalu dikirim, sangat kecil)
    const unpaid = data.invoices.filter(i => i.status === 'Belum Lunas');
    const todayRev = data.invoices.filter(i => i.date === today).reduce((s, i) => s + i.payment, 0);
    const totalRev = data.invoices.reduce((s, i) => s + i.payment, 0);
    const lowStock = data.items.filter(i => i.type === 'Persediaan' && i.stock <= 3);

    parts.push(`Hari ini: ${today}. User: ${currentUser?.name} (${currentUser?.roleName}). Cabang aktif: ${currentBranchId === 'ALL' ? 'Semua Cabang' : cabangName(currentBranchId)}.`);
    parts.push(`RINGKASAN: ${data.branches.length} cabang, ${data.customers.length} pelanggan, ${data.vehicles.length} kendaraan, ${data.items.length} item, ${data.workOrders.length} WO, ${data.invoices.length} faktur.`);
    parts.push(`KEUANGAN: total pendapatan ${fmt(totalRev)}, hari ini ${fmt(todayRev)}, piutang ${unpaid.length} faktur = ${fmt(unpaid.reduce((s, i) => s + (i.total - i.payment), 0))}.`);
    if (lowStock.length) parts.push(`STOK MENIPIS: ${lowStock.slice(0, 6).map(i => `${i.name} (${i.stock})`).join(', ')}.`);

    // Deteksi plat kendaraan
    const plateMatches = userMsgText.toUpperCase().match(/\b[A-Z]{1,2}\s?\d{2,4}\s?[A-Z]{1,3}\b/g) || [];
    const foundVehicleIds = new Set<string>();
    plateMatches.forEach(plate => {
      const clean = plate.replace(/\s+/g, '');
      const v = data.vehicles.find(x => x.plateNumber.replace(/\s+/g, '').toUpperCase() === clean);
      if (v) foundVehicleIds.add(v.id);
    });

    // Deteksi intent
    const wantsCustomerList = /(sebutkan|semua|daftar|list|siapa saja|pelanggan)/.test(lower);
    const wantsVehicleList = /(kendaraan|mobil|plat)/.test(lower) && /(semua|daftar|list|apa saja)/.test(lower);
    const wantsItemList = /(barang|jasa|item|paket|group|harga|stok|persediaan|sparepart|freon)/.test(lower);
    const wantsWOList = /(wo|work.?order|order kerja|servis|service)/.test(lower);
    const wantsInvoiceList = /(faktur|invoice|piutang|penjualan)/.test(lower);
    const wantsCategoryList = /(kategori|category)/.test(lower);
    const wantsSupplierList = /(supplier|pemasok|hutang|purchase|pembelian)/.test(lower);

    // Pelanggan yang namanya/kode/HP disebut
    const matchedCustomers = data.customers.filter(c =>
      words.some(w => c.name.toLowerCase().includes(w) || c.customerCode.toLowerCase().includes(w) || c.phone.includes(w))
    );

    // PELANGGAN
    if (wantsCustomerList || matchedCustomers.length > 0) {
      const list = matchedCustomers.length > 0 ? matchedCustomers.slice(0, 30) : data.customers.slice(0, 30);
      parts.push(`\nPELANGGAN (${list.length} dari ${data.customers.length}):`);
      list.forEach(c => {
        const vs = data.vehicles.filter(v =>
          v.customerRefId === c.id ||
          (!v.customerRefId && v.customerId === c.customerCode)
        ).map(v => v.plateNumber).join(', ');
        parts.push(`- ${c.customerCode} ${c.name} | ${c.phone} | ${vs || 'belum ada kendaraan'}`);
      });
    }

    // KENDARAAN yang dicari via plat
    if (foundVehicleIds.size > 0) {
      parts.push(`\nDATA KENDARAAN:`);
      data.vehicles.filter(v => foundVehicleIds.has(v.id)).forEach(v => {
        parts.push(`- ${v.plateNumber} | ${v.brand} ${v.model} ${v.year} ${v.color} | Pemilik: ${v.customerName} (${v.phone}) | ${v.notes || ''}`);
        const wos = data.workOrders.filter(w => w.plateNumber === v.plateNumber).slice(-5);
        if (wos.length) parts.push(`  Riwayat WO (${wos.length}): ${wos.map(w => `${w.woNumber} ${w.date} ${w.status}`).join(' | ')}`);
      });
    } else if (wantsVehicleList) {
      parts.push(`\nKENDARAAN (30 dari ${data.vehicles.length}):`);
      data.vehicles.slice(0, 30).forEach(v => parts.push(`- ${v.plateNumber} | ${v.brand} ${v.model} | ${v.customerName}`));
    }

    // BARANG & JASA
    if (wantsItemList) {
      const matched = data.items.filter(i =>
        words.some(w => i.name.toLowerCase().includes(w) || i.code.toLowerCase().includes(w) || (i.barcode || '').toLowerCase().includes(w) || (i.receiptDescription || '').toLowerCase().includes(w))
      ).slice(0, 20);
      const list = matched.length > 0 ? matched : data.items.slice(0, 20);
      parts.push(`\nBARANG & JASA (${list.length} dari ${data.items.length}):`);
      list.forEach(i => {
        const grp = i.groupMembers?.length ? ` [paket: ${i.groupMembers.map(m => `${m.itemName}x${m.qty}`).join(',')}]` : '';
        parts.push(`- ${i.code} ${i.name} | ${i.type} | stok ${i.stock} ${i.unit} | jual ${fmt(i.sellingPrice)}${grp}`);
      });
    }

    // KATEGORI
    if (wantsCategoryList) {
      parts.push(`\nKATEGORI (${data.itemCategories.length}):`);
      data.itemCategories.forEach(c => {
        const n = data.items.filter(i => i.categoryId === c.id).length;
        parts.push(`- ${c.code} ${c.name} (${n} item)`);
      });
    }

    // WO
    if (wantsWOList) {
      const recent = data.workOrders.slice(-15);
      parts.push(`\nWO TERAKHIR (${recent.length} dari ${data.workOrders.length}):`);
      recent.forEach(w => parts.push(`- ${w.woNumber} ${w.date} | ${w.customerName} ${w.plateNumber} | ${w.status} | ${fmt(w.total)} | ${cabangName(w.branchId)}`));
    }

    // FAKTUR
    if (wantsInvoiceList) {
      const recent = data.invoices.slice(-15);
      parts.push(`\nFAKTUR TERAKHIR (${recent.length} dari ${data.invoices.length}):`);
      recent.forEach(i => parts.push(`- ${i.invoiceNumber} ${i.date} | ${i.customerName} | ${fmt(i.total)} bayar ${fmt(i.payment)} | ${i.status}`));
    }

    // SUPPLIER
    if (wantsSupplierList && data.suppliers.length) {
      parts.push(`\nSUPPLIER (${data.suppliers.length}):`);
      data.suppliers.slice(0, 15).forEach(s => parts.push(`- ${s.code} ${s.name} | ${s.phone}`));
    }

    return parts.join('\n');
  };

  const buildSystemPrompt = (userMsgText: string) => {
    // Ambil daftar layanan cepat dari master untuk referensi harga nyata
    const quickServices = data.items
      .filter(i => i.isActive && i.isQuickService && i.type !== 'Group' && i.sellingPrice > 0 && !isLegacyFreeInspection(i))
      .slice(0, 10)
      .map(i => `${i.code} = ${i.name} (${i.type}) harga Rp ${i.sellingPrice.toLocaleString('id-ID')}`)
      .join(', ');

    return `Kamu adalah "ASISTEN DOKTER AC" — asisten AI bengkel AC mobil "Dokter AC Mobil" (Perintis, Cakalang, Mamuju).

ATURAN:
- Bahasa Indonesia, ringkas, gunakan **tebal** untuk angka & poin penting.
- Gunakan DATA di bawah sebagai kebenaran. Jangan mengarang data.
- Kalau data tidak muncul di bawah, minta user memperjelas (sebut nama/plat/kode barang).
- Kata pemicu "cek" hanya untuk membaca data dan riwayat. Jangan pernah membuat transaksi dari perintah "cek".
- Kata pemicu "list" hanya untuk menampilkan daftar. Jangan pernah membuat atau mengubah data dari perintah "list".
- Hanya boleh menyiapkan pembuatan WO jika pesan dimulai dengan "reg wo".
- Kalau user meminta membuat WO tanpa awalan "reg wo", minta user mengetik ulang dengan format "reg wo ...".

NAMA PELANGGAN/KENDARAAN:
- Selalu pakai nama/plat PERSIS seperti di DATA. Jangan diubah atau ditebak.
- Kalau user sebut nama/plat yang mirip tapi tidak persis sama, tampilkan semua kemungkinan & minta konfirmasi.
- Format registrasi lengkap adalah: "reg wo [nama] [nomor telepon] [alamat], [plat] [merek] [tipe] [warna], [keluhan]".
- Teks sesudah nomor telepon sampai koma pertama SELALU alamat, bukan keluhan.
- Bagian sesudah koma pertama SELALU data kendaraan. Keluhan hanya bagian sesudah koma kedua atau sesudah label "keluhan:".
- Merek, tipe, dan warna wajib berasal dari Master Kendaraan. Jangan menebak tipe kendaraan yang tidak tersedia.

MEMBUAT WO (HANYA UNTUK PESAN YANG DIMULAI "reg wo"):
Format tanggal singkat yang boleh dipakai user:
- "2/" berarti tanggal 2 bulan dan tahun berjalan.
- "2/3" atau "2/3/" berarti 2 Maret tahun berjalan.
- "2/3/26" berarti 2 Maret 2026.
Jika ada tanggal, masukkan sebagai field "date" format YYYY-MM-DD pada JSON. Jika user tidak menulis tanggal, jangan kirim field "date".

Kalau user minta buat WO tanpa menyebut layanan, buat WO tanpa item layanan. WO tetap berstatus Register sampai layanan berharga lebih dari Rp 0 ditambahkan.

Kalau user MENYEBUT layanan atau KODE layanan (misalnya "flushing", "SV-0102"):
- Cari kode atau nama PERSIS di LAYANAN CEPAT berikut: ${quickServices || 'tidak ada data layanan'}
- Kalau tidak ada, jangan membuat layanan dengan harga Rp 0. Minta user memilih kode layanan yang terdaftar.

Setelah ada plat, pelanggan, dan keluhan — LANGSUNG keluarkan JSON tanpa bertanya lebih lanjut:
\`\`\`json
{"action":"create_wo","date":"YYYY-MM-DD","customerName":"NAMA_PERSIS","phone":"08xx","plateNumber":"PLAT_PERSIS","vehicleInfo":"Merek Model Tahun - Warna","description":"keluhan","services":[]}
\`\`\`

Kalau plat/pelanggan tidak ditemukan di data, sertakan nama/plat yang user sebut apa adanya.
Kalau info KURANG (tidak ada plat SAMA SEKALI), TANYA dulu.

${buildSmartContext(userMsgText)}`;
  };

  // ============ Parse & eksekusi aksi ============
  const extractAction = (text: string) => {
    const m = text.match(/```json\s*([\s\S]*?)```/);
    if (!m) return null;
    try {
      const obj = JSON.parse(m[1].trim());
      return obj?.action ? obj : null;
    } catch { return null; }
  };

  const executeCreateWO = async (a: any, selectedBranchId: string) => {
    const branchId = selectedBranchId;
    const branchName = data.branches.find(b => b.id === branchId)?.name || branchId;
    const suppliedDate = String(a.date || '');
    const transactionDate = /^\d{4}-\d{2}-\d{2}$/.test(suppliedDate) ? suppliedDate : localDateISO();
    const today = localDateISO();
    if (transactionDate > today) throw new Error('Tanggal WO tidak boleh melewati hari ini.');
    if (transactionDate < today && !hasPermission('wo:backdate')) {
      throw new Error('Akun ini tidak memiliki izin Input WO Tanggal Mundur. Hubungi Owner untuk mengaktifkannya pada Grup Akses.');
    }

    // 1. Pelanggan
    let customer = data.customers.find(c =>
      c.customerCode.toUpperCase() === String(a.customerId || '').toUpperCase() ||
      c.name.toUpperCase() === String(a.customerName || '').toUpperCase() ||
      (a.phone && c.phone.replace(/\D/g, '') === String(a.phone).replace(/\D/g, ''))
    );
    if (!customer && a.customerName) {
      customer = await addCustomer({
        id: Date.now().toString(),
        customerCode: generateCustomerCode(),
        name: String(a.customerName).toUpperCase(),
        phone: a.phone || '',
        address: String(a.address || '').trim(),
        email: '',
        createdAt: transactionDate,
        branchId,
      });
    }

    // 2. Kendaraan
    let vehicle = data.vehicles.find(v =>
      v.plateNumber.replace(/\s/g, '').toUpperCase() === String(a.plateNumber || '').replace(/\s/g, '').toUpperCase()
    );
    if (!vehicle && a.plateNumber) {
      const vehicleText = String(a.vehicleInfo || '').trim();
      const normalizedVehicleText = vehicleText.toLowerCase();
      const catalogResponse = await api.get<AIVehicleCatalog>('vehicle-catalog');
      const catalogBrands = catalogResponse.success ? (catalogResponse.data?.brands || []).filter(brand => brand.isActive) : [];
      const catalogColors = catalogResponse.success ? (catalogResponse.data?.colors || []).filter(color => color.isActive) : [];
      let catalogMatch: { brand?: any; model?: any; generation?: any } = {};
      for (const brand of catalogBrands) {
        const brandMatched = normalizedVehicleText.includes(String(brand.name).trim().toLowerCase());
        if (!brandMatched) continue;
        for (const model of (brand.models || []).filter(model => model.isActive)) {
          const modelMatched = normalizedVehicleText.includes(String(model.name).trim().toLowerCase());
          const generation = (model.generations || []).filter(item => item.isActive).find((item: any) => [item.name, ...String(item.aliases || '').split(',')].some((alias: string) => alias.trim() && normalizedVehicleText.includes(alias.trim().toLowerCase())));
          if (generation || modelMatched) { catalogMatch = { brand, model, generation }; break; }
        }
        if (catalogMatch.model) break;
      }
      if (!catalogMatch.brand) {
        const typedBrand = vehicleText.split(/\s+/)[0] || vehicleText;
        throw new Error(`Merek kendaraan "${typedBrand}" belum cocok dengan Master Kendaraan. Pilih merek yang tersedia atau tambahkan merek melalui Register Kendaraan > Master Kendaraan.`);
      }
      if (!catalogMatch.model) {
        const availableModels = (catalogMatch.brand.models || []).filter((model: any) => model.isActive).slice(0, 6).map((model: any) => model.name).join(', ');
        throw new Error(`Tipe kendaraan pada "${vehicleText}" belum tersedia untuk ${catalogMatch.brand.name}. Pilihan master: ${availableModels || 'belum ada'}. Tambahkan tipe di Master Kendaraan lalu ulangi registrasi.`);
      }
      const matchedColor = catalogColors.find(color => normalizedVehicleText.includes(color.name.trim().toLowerCase()));
      if (!matchedColor) {
        throw new Error(`Warna kendaraan pada "${vehicleText}" belum cocok dengan daftar warna di Master Kendaraan. Pilih atau tambahkan warna terlebih dahulu.`);
      }
      const engineToken = vehicleText.match(/(?:^|\s)(\d{1,2}[.,]\d)(?=\s|$)|(?:^|\s)(\d{3,4})\s*cc\b/i);
      const engineNumber = engineToken ? Number(String(engineToken[1] || engineToken[2]).replace(',', '.')) : 0;
      const engineCc = engineNumber > 0 && engineNumber < 20 ? Math.round(engineNumber * 1000) : Math.round(engineNumber);
      const allowedEngines: number[] = catalogMatch.generation?.engineCcs || [];
      const newV = {
        id: Date.now().toString() + 'v',
        plateNumber: String(a.plateNumber).toUpperCase(),
        brand: catalogMatch.brand.name,
        model: catalogMatch.model.name,
        brandId: catalogMatch.brand?.id,
        modelId: catalogMatch.model?.id,
        generationId: catalogMatch.generation?.id,
        generationName: catalogMatch.generation?.name || '',
        engineCc: engineCc && (!allowedEngines.length || allowedEngines.includes(engineCc)) ? engineCc : null,
        year: parseInt(vehicleText.split(/[\s-]+/).find((x: string) => /^\d{4}$/.test(x)) || '0') || 0,
        color: matchedColor.name,
        customerRefId: customer?.id,
        customerName: customer?.name || String(a.customerName || '').toUpperCase(),
        customerId: customer?.customerCode || '',
        phone: customer?.phone || a.phone || '',
        address: customer?.address || '',
        registrationDate: transactionDate,
        notes: '',
        branchId,
      };
      await addVehicle(newV);
      vehicle = newV;
    } else if (vehicle && customer && vehicle.customerRefId !== customer.id) {
      // Setelah aksi dikonfirmasi, pelanggan yang dipilih menjadi pemilik aktif.
      const updatedVehicle = {
        ...vehicle,
        customerRefId: customer.id,
        customerId: customer.customerCode,
        customerName: customer.name,
        phone: customer.phone,
        address: customer.address,
      };
      await updateVehicle(vehicle.id, updatedVehicle);
      vehicle = updatedVehicle;
    }

    // 3. Layanan — gunakan nama persis dari master jika cocok
    const rawServices: any[] = Array.isArray(a.services) ? a.services.filter((service: any) => {
      const label = String(service?.name || '').toUpperCase();
      return !(Number(service?.price || 0) <= 0 && (/PENGECEKAN\s+GRATIS/.test(label) || /(^|\s)CEK[\s-]*AC($|\s)/.test(label)));
    }) : [];
    const services: WorkOrderService[] = rawServices.map((s: any, idx: number) => {
      const sNameUp = String(s.name || '').toUpperCase().trim();
      // Cari di master: cocok nama persis, partial, atau kode
      const master = data.items.find(i =>
        i.name.trim().toUpperCase() === sNameUp ||
        i.code.trim().toUpperCase() === sNameUp ||
        (sNameUp.length > 4 && i.name.trim().toUpperCase().includes(sNameUp)) ||
        (sNameUp.length > 4 && sNameUp.includes(i.name.trim().toUpperCase()))
      );
      return {
        id: `${Date.now()}-${idx}`,
        itemId: master?.id,
        code: master?.code,
        // Pakai nama dari master (bukan tebakan AI) supaya konsisten
        name: master?.name || s.name || 'Layanan',
        description: '',
        // Kalau AI kirim harga 0 tapi master punya harga, pakai harga master.
        // Kalau AI kirim harga > 0, pakai harga AI (user mungkin sudah konfirmasi).
        price: Number(s.price) > 0 ? Number(s.price) : (master?.sellingPrice ?? 0),
        qty: Number(s.qty) || 1,
      };
    });
    const total = services.reduce((sum, s) => sum + s.price * s.qty, 0);

    // 4. WO
    const woNumber = generateDocumentNumber('workOrder', branchId, new Date(`${transactionDate}T00:00:00`));

    const wo: WorkOrder = {
      id: Date.now().toString() + 'w',
      woNumber,
      date: transactionDate,
      backdateReason: transactionDate < today ? 'Input transaksi tertinggal via Asisten AI' : undefined,
      customerRefId: customer?.id,
      customerId: customer?.customerCode || '',
      customerName: customer?.name || String(a.customerName || '').toUpperCase(),
      vehicleRefId: vehicle?.id,
      plateNumber: vehicle?.plateNumber || String(a.plateNumber || '').toUpperCase(),
      vehicleInfo: a.vehicleInfo || (vehicle ? `${vehicle.brand} ${vehicle.model} ${vehicle.year} - ${vehicle.color}` : ''),
      description: a.description || '',
      services,
      total,
      estimateTotal: total,
      status: 'Register',
      notes: `Dibuat via Asisten AI oleh ${currentUser?.name}`,
      branchId,
    };
    await addWorkOrder(wo);

    return { woNumber, branchName, total, customerName: wo.customerName, customerPhone: customer?.phone || a.phone || '', plateNumber: wo.plateNumber, vehicleInfo: wo.vehicleInfo, description: wo.description, date: wo.date, servicesCount: services.length };
  };

  const executeQuickInvoice = async (a: any, selectedBranchId: string) => {
    const transactionDate = /^\d{4}-\d{2}-\d{2}$/.test(String(a.date || '')) ? String(a.date) : localDateISO();
    const today = localDateISO();
    if (transactionDate > today) throw new Error('Tanggal transaksi tidak boleh melewati hari ini.');
    if (transactionDate < today) {
      const missing = [
        ['wo:backdate', 'Input WO Tanggal Mundur'],
        ['invoice:backdate', 'Input Faktur Tanggal Mundur'],
        ['payment:backdate', 'Input Pembayaran Tanggal Mundur'],
      ].filter(([permission]) => !hasPermission(permission as any)).map(([, label]) => label);
      if (missing.length) throw new Error(`Akun belum memiliki izin: ${missing.join(', ')}.`);
    }
    const existingVehicle = data.vehicles.find(vehicle => normalizePlate(vehicle.plateNumber) === normalizePlate(String(a.plateNumber || '')));
    const existingCustomer = existingVehicle
      ? data.customers.find(customer => customer.id === existingVehicle.customerRefId || customer.customerCode === existingVehicle.customerId)
      : data.customers.find(customer => customer.name.toUpperCase() === String(a.customerName || '').toUpperCase() || customer.phone.replace(/\D/g, '') === String(a.phone || '').replace(/\D/g, ''));
    const result = await api.create('quick-invoices', {
      branchId: selectedBranchId,
      date: transactionDate,
      customerRefId: existingCustomer?.id,
      vehicleRefId: existingVehicle?.id,
      customerName: a.customerName,
      phone: a.phone,
      plateNumber: a.plateNumber,
      vehicleInfo: a.vehicleInfo,
      description: a.description,
      services: a.services,
      paymentMethod: a.paymentMethod,
      createdBy: currentUser?.id,
      createdByName: currentUser?.name,
    });
    if (!result.success || !result.data) throw new Error(result.message || result.error || 'REGINV gagal dibuat.');
    await refreshData();
    return result.data as any;
  };

  const shareRegisterToWhatsApp = async (text: string) => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Register Servis Baru', text });
        return;
      }
      await navigator.clipboard.writeText(text);
      window.alert('Teks register sudah disalin. Buka WhatsApp lalu pilih grup tujuan.');
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(text);
        window.alert('Teks register sudah disalin. Buka WhatsApp lalu pilih grup tujuan.');
      } catch {
        window.alert('Gagal membuka menu Bagikan. Salin teks register secara manual.');
      }
    }
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    const lowerContent = content.toLowerCase();

    if (lowerContent === 'clear') {
      startNewChat();
      return;
    }
    if (lowerContent === 'history') {
      setInput('');
      const rows = commandHistory.slice(0, 20).map((command, index) => `${index + 1}. \`${command}\``);
      setMessages(history => [
        ...history,
        { role: 'user', content, time: now() },
        { role: 'assistant', content: rows.length ? `**Riwayat Perintah Terakhir**\n\n${rows.join('\n')}` : 'Belum ada riwayat perintah.', time: now() },
      ]);
      return;
    }

    if (lowerContent === 'ganti cabang' || lowerContent === 'pilih cabang' || lowerContent === 'cabang') {
      setInput('');
      setShowBranchChooser(true);
      setMessages(history => [
        ...history,
        { role: 'user', content, time: now() },
        { role: 'assistant', content: 'Silakan pilih cabang aktif di bawah ini.', time: now() },
      ]);
      return;
    }

    rememberCommand(content);

    // Percakapan master kendaraan diproses lokal agar pemeriksaan dan
    // penambahan tidak bergantung pada model AI atau berisiko mengarang data.
    const isVehicleCatalogIntent = /\b(merek|brand|tipe\s+(?:mobil|kendaraan)|type\s+(?:mobil|kendaraan)|master\s+kendaraan)\b/i.test(content)
      || /\b(?:cek|list|daftar|tambah|konfirmasi tambah)\s+(?:tipe|model)\b/i.test(content);
    if (isVehicleCatalogIntent) {
      setInput('');
      setBusy(true);
      try {
        const catalogResponse = await api.get<AIVehicleCatalog>('vehicle-catalog');
        if (!catalogResponse.success || !catalogResponse.data) throw new Error(catalogResponse.message || 'Master kendaraan tidak dapat dibaca.');
        const brands = catalogResponse.data.brands;
        const findBrand = (name: string) => brands.find(brand => brand.name.localeCompare(name.trim(), 'id', { sensitivity: 'base' }) === 0);
        const reply = (message: string, actions?: ChatMsg['actions']) => {
          setMessages(history => [...history, { role: 'user', content, time: now() }, { role: 'assistant', content: message, actions, time: now() }]);
        };

        const confirmBrand = content.match(/^konfirmasi\s+tambah\s+merek\s+(.+)$/i);
        const confirmModel = content.match(/^konfirmasi\s+tambah\s+(?:tipe|model)\s+(.+?)\s+(?:untuk|pada)\s+(?:merek\s+)?(.+)$/i);
        if (confirmBrand) {
          const brandName = confirmBrand[1].trim();
          if (!hasPermission('vehicle:create') && !hasPermission('vehicle:edit')) throw new Error('Akun ini tidak memiliki hak menambah master kendaraan.');
          const existing = findBrand(brandName);
          if (existing) reply(`Merek **${existing.name}** sudah tersedia${existing.isActive ? '' : ', tetapi sedang nonaktif'}.`);
          else {
            const created = await api.create('vehicle-catalog', { entity: 'brand', name: brandName });
            if (!created.success) throw new Error(created.message || 'Gagal menambahkan merek.');
            reply(`Merek **${brandName}** berhasil ditambahkan ke Master Kendaraan.`);
          }
          return;
        }
        if (confirmModel) {
          const modelName = confirmModel[1].trim();
          const brandName = confirmModel[2].trim();
          if (!hasPermission('vehicle:create') && !hasPermission('vehicle:edit')) throw new Error('Akun ini tidak memiliki hak menambah master kendaraan.');
          const brand = findBrand(brandName);
          if (!brand) {
            reply(`Merek **${brandName}** belum tersedia. Tambahkan mereknya terlebih dahulu.`, [{ label: `Tambah merek ${brandName}`, type: 'command', value: `tambah merek ${brandName}` }]);
            return;
          }
          const existing = brand.models.find(model => model.name.localeCompare(modelName, 'id', { sensitivity: 'base' }) === 0);
          if (existing) reply(`Tipe **${existing.name}** untuk merek **${brand.name}** sudah tersedia.`);
          else {
            const created = await api.create('vehicle-catalog', { entity: 'model', name: modelName, brandId: brand.id });
            if (!created.success) throw new Error(created.message || 'Gagal menambahkan tipe kendaraan.');
            reply(`Tipe **${modelName}** berhasil ditambahkan pada merek **${brand.name}**.`);
          }
          return;
        }

        const addBrand = content.match(/^tambah\s+merek\s+(.+)$/i);
        const addModel = content.match(/^tambah\s+(?:tipe|model)\s+(.+?)\s+(?:untuk|pada)\s+(?:merek\s+)?(.+)$/i);
        if (addBrand) {
          const brandName = addBrand[1].trim();
          const existing = findBrand(brandName);
          reply(existing
            ? `Merek **${existing.name}** sudah tersedia dengan **${existing.models.length} tipe**.`
            : `Merek **${brandName}** belum tersedia. Tekan konfirmasi untuk menambahkannya.`,
          existing ? undefined : [{ label: `Konfirmasi tambah ${brandName}`, type: 'command', value: `konfirmasi tambah merek ${brandName}` }]);
          return;
        }
        if (addModel) {
          const modelName = addModel[1].trim();
          const brandName = addModel[2].trim();
          const brand = findBrand(brandName);
          if (!brand) reply(`Merek **${brandName}** belum tersedia. Tambahkan mereknya terlebih dahulu.`, [{ label: `Tambah merek ${brandName}`, type: 'command', value: `tambah merek ${brandName}` }]);
          else {
            const existing = brand.models.find(model => model.name.localeCompare(modelName, 'id', { sensitivity: 'base' }) === 0);
            reply(existing
              ? `Tipe **${existing.name}** sudah tersedia untuk merek **${brand.name}**.`
              : `Tipe **${modelName}** belum tersedia untuk **${brand.name}**. Tekan konfirmasi untuk menambahkannya.`,
            existing ? undefined : [{ label: `Konfirmasi tambah ${modelName}`, type: 'command', value: `konfirmasi tambah tipe ${modelName} untuk ${brand.name}` }]);
          }
          return;
        }

        const checkBrand = content.match(/^(?:cek|cari)\s+(?:merek|brand)\s+(.+?)[?]?$/i);
        const directCatalogQuery = content.match(/^(?:merek|brand|tipe|model)\s+(.+?)[?]?$/i);
        const checkModels = content.match(/^(?:cek|list|daftar)\s+(?:tipe|model)(?:\s+(?:mobil|kendaraan))?\s+(?:merek\s+)?(.+?)[?]?$/i);
        const questionBrand = content.match(/^apakah\s+(?:merek|brand)\s+(.+?)(?:\s+ada)?[?]?$/i);
        const brandQuery = (checkBrand?.[1] || checkModels?.[1] || questionBrand?.[1] || directCatalogQuery?.[1] || '').trim().replace(/\s+ada$/i, '');
        const matchedBrand = brandQuery ? findBrand(brandQuery) : undefined;
        if (matchedBrand) {
          const models = [...matchedBrand.models].filter(model => model.isActive).sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0) || a.name.localeCompare(b.name, 'id'));
          reply(`Merek **${matchedBrand.name}** tersedia dan memiliki **${models.length} tipe aktif**.\n\n${models.length ? models.map(model => `- ${model.name} (${model.usageCount || 0} kendaraan)`).join('\n') : '- Belum ada tipe'}\n\nUntuk menambahkan tipe, ketik: **tambah tipe NAMA TIPE untuk ${matchedBrand.name}**.`);
          return;
        }
        if (brandQuery) {
          const normalizedQuery = brandQuery.toLocaleLowerCase('id-ID');
          const modelMatches = brands.flatMap(brand => brand.models
            .filter(model => model.isActive && (
              model.name.localeCompare(brandQuery, 'id', { sensitivity: 'base' }) === 0
              || model.name.toLocaleLowerCase('id-ID').includes(normalizedQuery)
              || normalizedQuery.includes(model.name.toLocaleLowerCase('id-ID'))
            ))
            .map(model => ({ brand, model })))
            .sort((left, right) => {
              const leftExact = left.model.name.localeCompare(brandQuery, 'id', { sensitivity: 'base' }) === 0 ? 0 : 1;
              const rightExact = right.model.name.localeCompare(brandQuery, 'id', { sensitivity: 'base' }) === 0 ? 0 : 1;
              return leftExact - rightExact || (right.model.usageCount || 0) - (left.model.usageCount || 0);
            })
            .slice(0, 8);
          if (modelMatches.length > 0) {
            const matchingVehicles = data.vehicles.filter(vehicle => modelMatches.some(({ brand, model }) =>
              vehicle.brand.localeCompare(brand.name, 'id', { sensitivity: 'base' }) === 0
              && vehicle.model.localeCompare(model.name, 'id', { sensitivity: 'base' }) === 0
            ));
            const actions: ChatMsg['actions'] = matchingVehicles.slice(0, 10).map(vehicle => ({
              label: vehicle.plateNumber,
              type: 'select_vehicle',
              value: vehicle.plateNumber,
            }));
            reply([
              `**${brandQuery} ditemukan sebagai tipe/model kendaraan.**`,
              '',
              ...modelMatches.map(({ brand, model }) => `- **${brand.name} ${model.name}** — ${model.usageCount || 0} kendaraan terdaftar`),
              matchingVehicles.length ? '' : undefined,
              matchingVehicles.length ? `Kendaraan terdaftar: ${matchingVehicles.map(vehicle => `**${vehicle.plateNumber}**`).join(', ')}` : undefined,
            ].filter(Boolean).join('\n'), actions.length ? actions : undefined);
            return;
          }
          const suggestions = brands
            .filter(brand => brand.name.toLocaleLowerCase('id-ID').includes(brandQuery.toLocaleLowerCase('id-ID')) || brandQuery.toLocaleLowerCase('id-ID').includes(brand.name.toLocaleLowerCase('id-ID')))
            .slice(0, 5);
          reply(`Merek **${brandQuery}** belum ditemukan.${suggestions.length ? `\n\nMungkin yang dimaksud:\n${suggestions.map(brand => `- ${brand.name}`).join('\n')}` : ''}`,
            hasPermission('vehicle:create') || hasPermission('vehicle:edit') ? [{ label: `Tambah merek ${brandQuery}`, type: 'command', value: `tambah merek ${brandQuery}` }] : undefined);
          return;
        }

        const popularBrands = [...brands].filter(brand => brand.isActive).sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0) || a.name.localeCompare(b.name, 'id'));
        reply(`**Master Merek Kendaraan (${popularBrands.length})**\n\n${popularBrands.slice(0, 25).map(brand => `- ${brand.name} — ${brand.models.filter(model => model.isActive).length} tipe, ${brand.usageCount || 0} kendaraan`).join('\n')}\n\nUntuk mengecek tipe, ketik: **cek merek Toyota**.\nUntuk menambah: **tambah tipe Avanza untuk Toyota**.`);
        return;
      } catch (error: any) {
        setMessages(history => [...history, { role: 'user', content, time: now() }, { role: 'assistant', content: `Gagal memproses Master Kendaraan: ${error.message}`, error: true, time: now() }]);
        return;
      } finally {
        setBusy(false);
      }
    }

    const independentCommand = /^(cek|list)\b/i.test(content);
    if (registrationDraft && independentCommand) setRegistrationDraft(null);

    if (/^reginv\b/i.test(content) && !registrationDraft) {
      const plateMatch = content.toUpperCase().match(/\b[A-Z]{1,2}[\s-]*\d{2,4}[\s-]*[A-Z]{1,3}\b/)?.[0];
      const vehicle = plateMatch
        ? data.vehicles.find(item => normalizePlate(item.plateNumber) === normalizePlate(plateMatch))
        : undefined;
      const customer = vehicle
        ? data.customers.find(item => item.id === vehicle.customerRefId || item.customerCode === vehicle.customerId)
        : undefined;
      const paymentMethod = /\b(tf|transfer)\b/i.test(content) ? 'Transfer'
        : /\btunai\b/i.test(content) ? 'Tunai' : '';
      const codedServices = servicesFromCodes(content, true);
      let parsedDate: ReturnType<typeof parseCompactTransactionDate> = null;
      try { parsedDate = parseCompactTransactionDate(content); }
      catch (error: any) {
        setInput('');
        setMessages(history => [...history, { role: 'user', content, time: now() }, { role: 'assistant', content: error.message, error: true, time: now() }]);
        return;
      }
      if (vehicle && customer && paymentMethod && codedServices.length > 0) {
        const action = {
          action: 'create_quick_invoice', customerRefId: customer.id, vehicleRefId: vehicle.id,
          customerName: customer.name, phone: customer.phone, plateNumber: vehicle.plateNumber,
          vehicleInfo: [vehicle.brand, vehicle.model, vehicle.year, vehicle.color].filter(Boolean).join(' '),
          description: content.replace(/^reginv\s*/i, '').trim(), services: codedServices,
          paymentMethod, ...(parsedDate ? { date: parsedDate.date } : {}),
        };
        setPendingAction(action);
        setPendingBranchId(currentBranchId === 'ALL' ? '' : currentBranchId);
        setInput('');
        setMessages(history => [...history, { role: 'user', content, time: now() }, { role: 'assistant', content: `REGINV siap dikonfirmasi untuk **${vehicle.plateNumber}**.\n\nItem: **${codedServices.map(item => `${item.name} ×${item.qty}`).join(', ')}**\nMetode: **${paymentMethod}**`, time: now() }]);
        return;
      }
      const reply = startRegistrationWizard('reginv');
      setInput('');
      setMessages(history => [...history, { role: 'user', content, time: now() }, { role: 'assistant', content: vehicle
        ? `${reply}\n\nPlat ditemukan, tetapi perintah lengkap wajib memuat **kode item** dan metode **Tunai/Transfer**.`
        : reply, time: now() }]);
      return;
    }

    if ((registrationDraft && !independentCommand) || lowerContent === 'reg wo' || lowerContent === 'ulang') {
      const reply = registrationDraft ? continueRegistrationWizard(content) : startRegistrationWizard('wo');
      setInput('');
      setMessages(history => [
        ...history,
        { role: 'user', content, time: now() },
        { role: 'assistant', content: reply, time: now() },
      ]);
      return;
    }

    if (lowerContent === 'batal' && pendingAction) {
      setPendingAction(null);
      setPendingBranchId('');
      setInput('');
      setMessages(history => [
        ...history,
        { role: 'user', content, time: now() },
        { role: 'assistant', content: 'Pembuatan WO dibatalkan. Tidak ada transaksi yang disimpan.', time: now() },
      ]);
      return;
    }

    const listReply = buildListReply(content);
    const vehicleHistoryReply = listReply ? null : buildVehicleHistoryReply(content);
    const customerLookupMatch = listReply || vehicleHistoryReply ? null : findCustomerMatches(content);
    const customerLookupReply = customerLookupMatch ? buildCustomerLookupReply(content, customerLookupMatch) : null;
    const localLookupReply = listReply || vehicleHistoryReply || customerLookupReply;
    if (localLookupReply) {
      const compactContent = normalizePlate(content);
      const exactVehicle = vehicleHistoryReply
        ? data.vehicles.find(vehicle => compactContent.includes(normalizePlate(vehicle.plateNumber)))
        : undefined;
      const ambiguousCustomers = customerLookupMatch && (customerLookupMatch.candidates.length > 1 || customerLookupMatch.fuzzySearch)
        ? customerLookupMatch.candidates
        : [];
      const exactCustomer = customerLookupReply && customerLookupMatch?.candidates.length === 1 && !customerLookupMatch.fuzzySearch
        ? customerLookupMatch.candidates[0]
        : undefined;
      const exactWO = data.workOrders.find(wo => compactContent.includes(normalizePlate(wo.woNumber)));
      const actions: ChatMsg['actions'] = [];
      if (exactVehicle) {
        const canSeeAllBranches = hasPermission('all_branches');
        const allowedBranchIds = new Set(
          canSeeAllBranches
            ? data.branches.filter(branch => branch.isActive).map(branch => branch.id)
            : (currentUser?.branchIds?.length ? currentUser.branchIds : [currentUser?.branchId].filter(Boolean) as string[])
        );
        const vehicleWOs = data.workOrders
          .filter(wo => (wo.vehicleRefId && wo.vehicleRefId === exactVehicle.id) || normalizePlate(wo.plateNumber) === normalizePlate(exactVehicle.plateNumber))
          .filter(wo => allowedBranchIds.has(wo.branchId))
          .sort((a, b) => b.date.localeCompare(a.date) || b.woNumber.localeCompare(a.woNumber));
        const activeWO = vehicleWOs.find(wo => ['Register', 'Proses'].includes(wo.status) && !wo.continuedToWoId);
        const latestWO = vehicleWOs[0];
        const latestInvoice = data.invoices.find(invoice => (
          invoice.id === latestWO?.invoiceId
          || invoice.woId === latestWO?.id
          || (!!latestWO?.invoiceNumber && invoice.invoiceNumber === latestWO.invoiceNumber)
        ));

        if (activeWO) {
          actions.push({ label: `Buka WO Aktif ${activeWO.woNumber}`, type: 'open_workorder', value: activeWO.id });
        } else if (hasPermission('wo:create')) {
          actions.push({ label: '+ Buat WO', type: 'create_wo_vehicle', value: exactVehicle.id });
        }
        if (latestWO && latestWO.id !== activeWO?.id) {
          actions.push({
            label: latestWO.status === 'Closed' ? 'Buka Lost Sales' : 'Buka WO',
            type: 'open_workorder',
            value: latestWO.id,
          });
        }
        if (latestInvoice && hasPermission('invoice:view')) {
          actions.push({ label: 'Lihat Faktur', type: 'open_invoice', value: latestInvoice.id });
        }
        if (vehicleWOs.length > 3) {
          actions.push({ label: 'Riwayat Lengkap', type: 'command', value: `riwayat lengkap ${exactVehicle.plateNumber}` });
        }
      } else if (vehicleHistoryReply) {
        const plateQuery = extractVehiclePlateQuery(content);
        findVehicleSuggestions(plateQuery).forEach(({ item }) => {
          actions.push({ label: item.plateNumber, type: 'select_vehicle', value: item.plateNumber });
        });
      } else if (ambiguousCustomers.length > 0) {
        ambiguousCustomers.slice(0, 8).forEach(customer => {
          data.vehicles
            .filter(vehicle => vehicle.customerRefId === customer.id || (!vehicle.customerRefId && vehicle.customerId === customer.customerCode))
            .forEach(vehicle => actions.push({ label: vehicle.plateNumber, type: 'select_vehicle', value: vehicle.plateNumber }));
        });
      } else if (exactCustomer) {
        const vehicles = data.vehicles.filter(vehicle => vehicle.customerRefId === exactCustomer.id || vehicle.customerId === exactCustomer.customerCode);
        vehicles.forEach(vehicle => actions.push({ label: vehicle.plateNumber, type: 'select_vehicle', value: vehicle.plateNumber }));
        if (vehicles.length === 0) {
          actions.push({ label: 'Riwayat WO', type: 'command', value: `cek riwayat ${exactCustomer.customerCode}` });
          if (hasPermission('wo:create')) actions.push({ label: 'Buat WO', type: 'command', value: 'reg wo' });
        }
      } else if (exactWO) {
        actions.push({ label: 'Buka Daftar WO', type: 'open_workorders' });
      }
      setInput('');
      setMessages(history => [
        ...history,
        { role: 'user', content, time: now() },
        {
          role: 'assistant',
          content: localLookupReply,
          time: now(),
          actions: actions.slice(0, 12),
          vehicleSummary: exactVehicle
            ? buildVehicleSummary(exactVehicle, /(semua|seluruh|lengkap)/i.test(content))
            : undefined,
        },
      ]);
      return;
    }
    if (!hasKey) {
      setMessages(history => [...history, { role: 'assistant', content: 'Integrasi AI belum diatur oleh Owner.', error: true, time: now() }]);
      return;
    }

    setInput('');
    const userMsg: ChatMsg = { role: 'user', content, time: now() };
    const history = [...messages, userMsg];
    setMessages(history);
    setBusy(true);

    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          max_tokens: 1200,
          messages: [
            // System prompt dibangun ulang dengan konteks yang relevan
            // terhadap pesan terakhir user — hemat token & tidak kena limit Groq.
            { role: 'system', content: buildSystemPrompt(content) },
            // History dipangkas jadi 4 pesan terakhir (2 giliran) supaya
            // total token tetap kecil.
            ...history.slice(-4).map(m => ({ role: m.role, content: m.content })),
          ],
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        const raw = e?.error?.message || `HTTP ${res.status}`;
        if (res.status === 401) {
          throw new Error(
            'API Key ditolak Groq (401).\n\n' +
            'Kemungkinan penyebab:\n' +
            '- Key salah ketik atau tidak lengkap saat disalin\n' +
            '- Key sudah dihapus / di-regenerate di Groq\n' +
            '- Key milik layanan lain (bukan Groq)\n\n' +
            'Solusi: buka console.groq.com/keys, buat key baru (diawali gsk_), lalu tempel di menu Pengaturan dan klik Tes Koneksi.'
          );
        }
        if (res.status === 404) throw new Error(`Model "${model}" tidak tersedia untuk akun ini. Ganti model di Pengaturan.`);
        if (res.status === 429) throw new Error('Limit Groq tercapai. Tunggu ±1 menit lalu coba lagi.');
        throw new Error(raw);
      }
      const json = await res.json();
      const reply = json.choices?.[0]?.message?.content || 'Maaf, tidak ada jawaban.';
      const action = extractAction(reply);

      if (action?.action === 'create_wo') {
        const parsedDate = parseCompactTransactionDate(content);
        const inlineIdentity = parseInlineRegistrationIdentity(content);
        const codedServices = servicesFromCodes(content);
        if (parsedDate) action.date = parsedDate.date;
        if (inlineIdentity) {
          action.customerName = inlineIdentity.customerName;
          action.phone = inlineIdentity.phone;
          action.address = inlineIdentity.address;
          if (inlineIdentity.plateNumber) action.plateNumber = inlineIdentity.plateNumber;
          if (inlineIdentity.vehicleInfo) action.vehicleInfo = inlineIdentity.vehicleInfo;
          action.description = inlineIdentity.description;
          action.complaintRequired = !inlineIdentity.description;
        }
        const similarCustomers = findSimilarRegistrationCustomers(String(action.customerName || ''), String(action.phone || ''));
        if (similarCustomers.length > 0) {
          action.customerCandidates = similarCustomers.map(customer => customer.id);
          action.customerMatchResolved = false;
        }
        if (codedServices.length > 0) action.services = codedServices;
      }

      setMessages(h => [...h, { role: 'assistant', content: reply, time: now(), action }]);
      if (action?.action === 'create_wo') {
        setPendingAction(action);
        setPendingBranchId(currentBranchId === 'ALL' ? '' : currentBranchId);
      }
    } catch (e: any) {
      setMessages(h => [...h, { role: 'assistant', content: `⚠️ Gagal: ${e.message}`, error: true, time: now() }]);
    } finally {
      setBusy(false);
    }
  };

  const handleMessageAction = (action: NonNullable<ChatMsg['actions']>[number]) => {
    if (action.type === 'select_vehicle' && action.value) {
      void send(`cek ${action.value}`);
      return;
    }
    if (action.type === 'command' && action.value) {
      void send(action.value);
      return;
    }
    if (action.type === 'open_workorders') {
      window.location.href = '/workorders';
      return;
    }
    if (action.type === 'open_workorder' && action.value) {
      window.location.href = `/workorders?view=${encodeURIComponent(action.value)}`;
      return;
    }
    if (action.type === 'open_invoice' && action.value) {
      window.location.href = `/invoices?view=${encodeURIComponent(action.value)}`;
      return;
    }
    if (action.type === 'create_wo_vehicle' && action.value) {
      const vehicle = data.vehicles.find(item => item.id === action.value);
      if (!vehicle) return;
      const customer = data.customers.find(item => item.id === vehicle.customerRefId || item.customerCode === vehicle.customerId);
      setRegistrationDraft({
        mode: 'wo',
        step: 'complaint',
        plateNumber: vehicle.plateNumber,
        customerName: customer?.name || vehicle.customerName || '',
        phone: customer?.phone || vehicle.phone || '',
        vehicleInfo: [vehicle.brand, vehicle.model, vehicle.year, vehicle.color].filter(Boolean).join(' '),
      });
      setMessages(history => [...history, {
        role: 'assistant',
        content: `Membuat WO untuk **${vehicle.plateNumber}**. Jelaskan keluhan atau layanan yang dibutuhkan.`,
        time: now(),
      }]);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const confirmAction = async () => {
    if (!pendingAction || !pendingBranchId) return;
    setBusy(true);
    let completed = false;
    try {
      if (pendingAction.action === 'create_quick_invoice') {
        const r = await executeQuickInvoice(pendingAction, pendingBranchId);
        const shareDate = new Date(`${r.date}T00:00:00`).toLocaleDateString('id-ID');
        const shareText = `${r.invoiceNumber} ( ${shareDate} )\n🚗 ${r.plateNumber} – ${r.vehicleInfo}\n👤 ${r.customerName}\nWO: ${r.woNumber}\nPembayaran: ${r.paymentNumber}\nTotal: ${fmt(Number(r.total))}\nInput: ${currentUser?.name || '-'}`;
        setMessages(history => [...history, {
          role: 'assistant', time: now(), shareText,
          content: `✅ **REGINV berhasil dibuat!**\n\n- WO: **${r.woNumber}**\n- Invoice: **${r.invoiceNumber}**\n- Pembayaran: **${r.paymentNumber}**\n- Total: **${fmt(Number(r.total))}**\n- Masuk ke: **${r.accountName}**\n\nKetiga dokumen saling terhubung dan stok sudah dipotong oleh invoice.`,
        }]);
        completed = true;
        return;
      }
      const r = await executeCreateWO(pendingAction, pendingBranchId);
      const plateForShare = r.plateNumber.replace(/\s+/g, '').toUpperCase().replace(/^([A-Z]{1,2})(\d{1,4})([A-Z]{0,3})$/, (_all: string, prefix: string, number: string, suffix: string) => `${prefix} ${number}${suffix ? ` ${suffix}` : ''}`);
      const vehicleForShare = (r.vehicleInfo || '-').replace(/\s*-\s*([^-]+)$/, ' ($1)');
      const shareDate = new Date(`${r.date}T00:00:00`).toLocaleDateString('id-ID');
      const shareText = `${r.woNumber} ( ${shareDate} )\n🚗 ${plateForShare} – ${vehicleForShare}\n👤 ${r.customerName}${r.customerPhone ? ` ${r.customerPhone}` : ''}\nKeluhan: ${r.description || '-'}\nInput: ${currentUser?.name || '-'}`;
      setMessages(h => [...h, {
        role: 'assistant',
        time: now(),
        shareText,
        content: `✅ **Order Kerja berhasil dibuat!**\n\n- Nomor: **${r.woNumber}**\n- Pelanggan: **${r.customerName}**\n- Kendaraan: **${r.plateNumber}**\n- Layanan: **${r.servicesCount} item**\n- Estimasi: **${fmt(r.total)}**\n- Cabang: **${r.branchName}**\n- Status: **Register**\n\nBuka menu Servis Job untuk menambah layanan atau mulai dikerjakan.`,
      }]);
      completed = true;
    } catch (e: any) {
      setMessages(h => [...h, { role: 'assistant', content: `⚠️ Gagal membuat WO: ${e.message}`, error: true, time: now() }]);
    } finally {
      if (completed) {
        setPendingAction(null);
        setPendingBranchId('');
      }
      setBusy(false);
    }
  };

  const saveKey = () => {
    const clean = keyDraft.trim();
    if (!clean.startsWith('gsk_')) {
      setTestResult({ ok: false, msg: 'API Key Groq harus diawali "gsk_". Pastikan key disalin lengkap dari console.groq.com/keys.' });
      return;
    }
    localStorage.setItem('groq_api_key', clean);
    localStorage.setItem('groq_model', model);
    setApiKey(clean);
    setTestResult(null);
    setShowSettings(false);
  };

  // Tes koneksi ke Groq dengan request super kecil (hemat token).
  const testConnection = async () => {
    const clean = keyDraft.trim();
    setTestResult(null);

    if (!clean) { setTestResult({ ok: false, msg: 'API Key masih kosong.' }); return; }
    if (!clean.startsWith('gsk_')) { setTestResult({ ok: false, msg: 'Format salah. Key Groq selalu diawali "gsk_".' }); return; }
    if (clean.length < 40) { setTestResult({ ok: false, msg: 'Key terlihat terpotong. Salin ulang seluruh key dari Groq.' }); return; }
    if (/\s/.test(clean)) { setTestResult({ ok: false, msg: 'Key mengandung spasi/baris baru. Hapus spasi lalu coba lagi.' }); return; }

    setTesting(true);
    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clean}` },
        body: JSON.stringify({ model, max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] }),
      });

      if (res.ok) {
        setTestResult({ ok: true, msg: 'Berhasil terhubung ke Groq. Silakan simpan.' });
      } else {
        const err = await res.json().catch(() => null);
        const raw = err?.error?.message || `HTTP ${res.status}`;
        let hint = raw;
        if (res.status === 401) hint = 'Key ditolak (401). Key mungkin salah, sudah dihapus, atau di-regenerate di Groq. Buat key baru lalu tempel ulang.';
        else if (res.status === 404) hint = `Model "${model}" tidak tersedia untuk akun ini. Coba pilih model lain di bawah.`;
        else if (res.status === 429) hint = 'Kena limit sementara. Tunggu ±1 menit lalu tes lagi.';
        setTestResult({ ok: false, msg: hint });
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: `Tidak bisa menghubungi Groq: ${e.message}. Cek koneksi internet atau firewall.` });
    } finally {
      setTesting(false);
    }
  };

  const primaryFrontActions = [
    { label: 'Registrasi WO', icon: Zap, command: 'reg wo', direct: true, tone: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300' },
    { label: 'Cek Kendaraan', icon: Car, command: 'cek ', direct: false, tone: 'border-blue-500/30 bg-blue-500/10 text-blue-300' },
    { label: 'Cek Pelanggan', icon: Users, command: 'cek nama ', direct: false, tone: 'border-violet-500/30 bg-violet-500/10 text-violet-300' },
    { label: 'Cek Parts', icon: Package, command: 'cek part ', direct: false, tone: 'border-orange-500/30 bg-orange-500/10 text-orange-300' },
    { label: 'WO Hari Ini', icon: Wrench, command: 'list wo hari ini', direct: true, tone: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
    { label: 'Belum Diproses', icon: History, command: 'list wo register', direct: true, tone: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
  ];
  const secondaryFrontActions = [
    { label: 'Stok Kritis', icon: AlertTriangle, command: 'Barang apa saja yang stoknya menipis?', direct: true, tone: 'border-rose-500/30 bg-rose-500/10 text-rose-300' },
    { label: 'Daftar Kendaraan', icon: Database, command: 'list merek kendaraan', direct: true, tone: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300' },
  ];
  const frontActions = [...primaryFrontActions, ...secondaryFrontActions];

  const runFrontAction = (command: string, direct: boolean) => {
    setShowStarterMenu(false);
    setShowMoreActions(false);
    if (direct) {
      void send(command);
      return;
    }
    setInput(command);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const lowStock = data.items.filter(i => i.type === 'Persediaan' && i.stock <= 3);

  return (
    <div className="relative h-full min-h-0 lg:h-[calc(100vh-140px)] lg:min-h-[560px]">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-cyan-200/40 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-blue-200/50 blur-3xl" />
      </div>

      <div className="grid h-full gap-4 lg:grid-cols-[300px_1fr]">
        {/* Sidebar */}
        <aside className="hidden flex-col gap-4 overflow-y-auto pr-1 lg:flex">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-bold text-slate-800">
              <Database className="h-4 w-4 text-cyan-600" /> Data yang Dibaca AI
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: Car, val: data.vehicles.length, lbl: 'Kendaraan', c: 'text-blue-600 bg-blue-50' },
                { icon: Users, val: data.customers.length, lbl: 'Pelanggan', c: 'text-violet-600 bg-violet-50' },
                { icon: Package, val: data.items.length, lbl: 'Barang/Jasa', c: 'text-emerald-600 bg-emerald-50' },
                { icon: Wrench, val: data.workOrders.length, lbl: 'Order Kerja', c: 'text-amber-600 bg-amber-50' },
              ].map(s => (
                <div key={s.lbl} className={`rounded-lg p-2.5 ${s.c.split(' ')[1]}`}>
                  <s.icon className={`mb-1 h-4 w-4 ${s.c.split(' ')[0]}`} />
                  <p className={`font-display text-lg font-bold ${s.c.split(' ')[0]}`}>{s.val}</p>
                  <p className="text-[10px] font-semibold uppercase text-slate-500">{s.lbl}</p>
                </div>
              ))}
            </div>
            {lowStock.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                <p className="mb-1 flex items-center gap-1 text-[11px] font-bold text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> Stok Menipis</p>
                {lowStock.slice(0, 4).map(i => <p key={i.id} className="text-[11px] text-amber-800">• {i.name} — <b>{i.stock}</b></p>)}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-bold text-slate-800"><Grid2X2 className="h-4 w-4 text-blue-600" /> Menu Perintah</h3>
            <div className="grid grid-cols-2 gap-2">
              {primaryFrontActions.map(action => {
                const Icon = action.icon;
                return (
                  <button key={`desktop-${action.label}`} type="button" onClick={() => runFrontAction(action.command, action.direct)} disabled={busy} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-2 text-center text-[11px] font-semibold text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50">
                    <Icon className="h-5 w-5 text-blue-600" /><span>{action.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-200 pt-2">
              {secondaryFrontActions.map(action => {
                const Icon = action.icon;
                return (
                  <button key={`desktop-${action.label}`} type="button" onClick={() => runFrontAction(action.command, action.direct)} disabled={busy} className="flex min-h-12 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white p-2 text-center text-[11px] font-semibold text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50">
                    <Icon className="h-4 w-4 text-blue-600" /><span>{action.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-blue-50 p-4">
            <p className="flex items-center gap-2 font-display text-xs font-bold text-cyan-800"><Sparkles className="h-4 w-4" /> Bisa buat WO</p>
            <p className="mt-1 text-[11px] leading-relaxed text-cyan-900/80">
              Minta AI buatkan Order Kerja — pelanggan & kendaraan baru otomatis dibuat kalau belum terdaftar. Akan ada konfirmasi sebelum disimpan.
            </p>
          </div>
        </aside>

        {/* Chat */}
        <section className="relative flex min-h-0 flex-col overflow-hidden rounded-none border border-slate-700/60 bg-slate-900 shadow-2xl lg:rounded-2xl">
          <div className="flex items-center justify-between border-b border-slate-700/60 bg-slate-800/60 px-3 py-2.5 sm:px-4">
            <div className="flex min-w-0 items-center gap-2 text-xs">
              <span className={`flex items-center gap-1.5 rounded-full px-2 py-1 font-semibold ${hasKey ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                <span className={`h-2 w-2 rounded-full ${hasKey ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                {hasKey ? 'Terhubung' : 'Belum diatur'}
              </span>
              <button type="button" onClick={() => setShowBranchChooser(value => !value)} className={`flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1 font-semibold ${currentBranchId === 'ALL' ? 'bg-amber-500/15 text-amber-300' : 'bg-cyan-500/15 text-cyan-300'}`}>
                <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="max-w-28 truncate">{currentBranchId === 'ALL' ? 'Pilih cabang' : cabangName(currentBranchId).replace('CABANG ', '')}</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden font-mono text-[10px] text-slate-500 sm:inline">{GROQ_MODELS.find(m => m.id === model)?.label}</span>
              <button type="button" onClick={() => { window.location.href = '/settings'; }} className="hidden h-7 items-center gap-1 rounded-lg border border-slate-600 bg-slate-900/60 px-2 text-[10px] font-semibold text-slate-300 hover:border-cyan-500 lg:flex" title="Pengaturan AI">
                <KeyRound className="h-3.5 w-3.5" /> Pengaturan
              </button>
              <button
                type="button"
                onClick={() => {
                  if (messages.length === 0 || window.confirm('Mulai chat baru? Percakapan saat ini akan dihapus.')) startNewChat();
                }}
                className="flex h-7 items-center gap-1 rounded-lg border border-slate-600 bg-slate-900/60 px-2 text-[10px] font-semibold text-slate-300 hover:border-cyan-500 hover:text-cyan-200"
                title="Mulai chat baru"
                aria-label="Mulai chat baru"
              >
                <Sparkles className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Chat Baru</span>
              </button>
              <button type="button" onClick={() => setShowStarterMenu(value => !value)} className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-colors ${showStarterMenu ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200' : 'border-slate-600 bg-slate-900/60 text-slate-300 hover:border-cyan-500'}`} title="Menu perintah" aria-label="Buka menu perintah">
                <Grid2X2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {showStarterMenu && (
            <>
              <button type="button" aria-label="Tutup menu perintah" onClick={() => setShowStarterMenu(false)} className="absolute inset-0 z-10 bg-slate-950/25" />
              <div className="absolute right-3 top-12 z-20 w-[min(22rem,calc(100%-1.5rem))] rounded-xl border border-slate-600 bg-slate-900 p-3 shadow-2xl">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-200">Menu Perintah</p>
                  <button type="button" onClick={() => setShowStarterMenu(false)} className="rounded p-1 text-slate-400 hover:bg-slate-800"><X className="h-4 w-4" /></button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {primaryFrontActions.map(action => {
                    const Icon = action.icon;
                    return (
                      <button key={`menu-${action.label}`} type="button" onClick={() => runFrontAction(action.command, action.direct)} className={`flex min-h-12 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[11px] font-semibold hover:bg-slate-800 ${action.tone}`}>
                        <Icon className="h-4 w-4 flex-shrink-0" /><span>{action.label}</span>
                      </button>
                    );
                  })}
                </div>
                <button type="button" onClick={() => setShowMoreActions(value => !value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-[11px] font-semibold text-slate-300 hover:border-cyan-500 hover:text-cyan-200">
                  {showMoreActions ? 'Tutup menu lainnya' : 'Lainnya'}
                </button>
                {showMoreActions && (
                  <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-700 pt-2">
                    {secondaryFrontActions.map(action => {
                      const Icon = action.icon;
                      return (
                        <button key={`more-menu-${action.label}`} type="button" onClick={() => runFrontAction(action.command, action.direct)} className={`flex min-h-11 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[11px] font-semibold hover:bg-slate-800 ${action.tone}`}>
                          <Icon className="h-4 w-4 flex-shrink-0" /><span>{action.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
            {(showBranchChooser || currentBranchId === 'ALL') && (
              <div className="animate-msg-in rounded-xl border border-cyan-500/50 bg-cyan-950/40 p-4">
                <p className="mb-1 flex items-center gap-2 text-sm font-bold text-cyan-200"><Building2 className="h-4 w-4" /> Pilih Cabang Aktif</p>
                <p className="mb-3 text-xs text-slate-400">Cabang wajib dipilih sebelum AI membuat transaksi.</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {data.branches.filter(branch => branch.isActive).map(branch => (
                    <button key={branch.id} type="button" onClick={() => chooseChatBranch(branch.id)} className={`rounded-lg border px-3 py-2.5 text-left text-xs font-bold transition-colors ${currentBranchId === branch.id ? 'border-cyan-300 bg-cyan-400 text-slate-950' : 'border-slate-600 bg-slate-800 text-slate-100 hover:border-cyan-400'}`}>
                      {branch.name.replace('CABANG ', '')}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.length === 0 && !busy && !showBranchChooser && currentBranchId !== 'ALL' && (
              <div className="mx-auto flex h-full w-full max-w-lg flex-col justify-center animate-msg-in">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-lg">
                  <Bot className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-center font-display text-xl font-bold text-white">Halo, {currentUser?.name?.split(' ')[0]}! 👋</h3>
                <p className="mt-1 text-center text-xs text-slate-400">
                  Pilih perintah atau ketik langsung.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {primaryFrontActions.map(action => {
                    const Icon = action.icon;
                    return (
                      <button key={action.label} type="button" onClick={() => runFrontAction(action.command, action.direct)} className={`flex min-h-14 items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors hover:bg-slate-800 ${action.tone}`}>
                        <Icon className="h-5 w-5 flex-shrink-0" />
                        <span>{action.label}</span>
                      </button>
                    );
                  })}
                </div>
                <button type="button" onClick={() => setShowMoreActions(value => !value)} className="mx-auto mt-3 flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-2 text-xs font-semibold text-slate-300 hover:border-cyan-500 hover:text-cyan-200">
                  <Grid2X2 className="h-4 w-4" /> {showMoreActions ? 'Tutup lainnya' : 'Lainnya'}
                </button>
                {showMoreActions && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {secondaryFrontActions.map(action => {
                      const Icon = action.icon;
                      return (
                        <button key={`more-${action.label}`} type="button" onClick={() => runFrontAction(action.command, action.direct)} className={`flex min-h-12 items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors hover:bg-slate-800 ${action.tone}`}>
                          <Icon className="h-5 w-5 flex-shrink-0" /><span>{action.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {!hasKey && <p className="mt-3 text-center text-xs font-semibold text-amber-300">Integrasi AI belum diatur oleh Owner.</p>}
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex animate-msg-in ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="mr-2 mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600">
                    <Bot className="h-5 w-5 text-white" />
                  </div>
                )}
                <div className={msg.vehicleSummary ? 'max-w-[92%] md:max-w-[80%]' : 'max-w-[80%]'}>
                  <div
                    className={`rounded-2xl px-3 py-2 text-sm leading-snug shadow-md ${
                      msg.role === 'user' ? 'rounded-br-sm bg-blue-600 text-white'
                      : msg.error ? 'rounded-bl-sm border border-red-500/40 bg-red-950/60 text-red-200'
                      : 'rounded-bl-sm border-l-2 border-cyan-400 bg-slate-800 text-slate-200'
                    }`}
                  >
                    {msg.vehicleSummary ? (
                      <div className="min-w-0">
                        <div className="flex items-start gap-2">
                          <Car className="mt-0.5 h-4 w-4 flex-shrink-0 text-cyan-300" />
                          <div className="min-w-0">
                            <p className="font-bold tracking-wide text-white">{msg.vehicleSummary.plateNumber}</p>
                            <p className="text-xs text-slate-300">
                              {msg.vehicleSummary.vehicleName} <span className="text-slate-500">•</span> {msg.vehicleSummary.color}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-xs">
                          <Users className="h-4 w-4 flex-shrink-0 text-violet-300" />
                          <span className="font-bold text-white">{msg.vehicleSummary.ownerName}</span>
                          <span className="text-slate-500">•</span>
                          <span className="text-slate-300">{msg.vehicleSummary.ownerPhone}</span>
                        </div>

                        <div className="my-3 border-t border-slate-700" />
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Servis terakhir</p>

                        {msg.vehicleSummary.entries.length === 0 ? (
                          <p className="text-xs text-slate-400">Belum ada riwayat servis yang dapat diakses.</p>
                        ) : msg.vehicleSummary.entries.map((entry, entryIndex) => {
                          const normalizedStatus = entry.status.toLowerCase();
                          const statusClass = normalizedStatus === 'selesai' || normalizedStatus === 'dibayar'
                            ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300'
                            : normalizedStatus === 'lost sales'
                              ? 'border-red-400/30 bg-red-500/15 text-red-300'
                              : normalizedStatus === 'proses'
                                ? 'border-blue-400/30 bg-blue-500/15 text-blue-300'
                                : 'border-amber-400/30 bg-amber-500/15 text-amber-300';
                          return (
                            <div key={entry.woNumber} className={entryIndex > 0 ? 'mt-3 border-t border-slate-700 pt-3' : ''}>
                              <div className="flex items-start justify-between gap-3">
                                <span className="font-bold text-white">{entry.woNumber}</span>
                                <span className="flex-shrink-0 text-[11px] text-slate-400">{entry.date}</span>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span className="text-[11px] font-semibold text-slate-300">{entry.branchName}</span>
                                <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${statusClass}`}>
                                  {entry.status}
                                </span>
                              </div>
                              {entry.invoiceNumber && (
                                <p className="mt-1.5 text-[11px] text-slate-400">
                                  Faktur: <span className="font-bold text-cyan-300">{entry.invoiceNumber}</span>
                                </p>
                              )}
                              <div className="mt-2 grid gap-2 text-xs">
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Keluhan</p>
                                  <p className="text-slate-200">{entry.complaint}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Layanan</p>
                                  {entry.serviceLines.map((line, lineIndex) => (
                                    <p key={`${line}-${lineIndex}`} className={lineIndex > 0 && line.startsWith('+') ? 'text-[11px] text-slate-400' : 'text-slate-200'}>
                                      {line}
                                    </p>
                                  ))}
                                  {entry.componentCount > 0 && (
                                    <p className="text-[11px] text-slate-400">+{entry.componentCount} komponen paket</p>
                                  )}
                                </div>
                              </div>
                              <div className="mt-2 flex items-center justify-between border-t border-slate-700 pt-2">
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Total layanan</span>
                                <span className="font-bold text-white">{fmt(entry.total)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div dangerouslySetInnerHTML={{ __html: render(msg.content) }} />
                    )}
                  </div>
                  {msg.role === 'assistant' && msg.actions && msg.actions.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {msg.actions.map((action, actionIndex) => {
                        const isVehicleChoice = action.type === 'select_vehicle';
                        const isCreateWO = action.type === 'create_wo_vehicle';
                        const isInvoice = action.type === 'open_invoice';
                        const isOpenWO = action.type === 'open_workorder' || action.type === 'open_workorders';
                        const actionClass = isVehicleChoice
                          ? 'border-blue-300 bg-blue-600 text-white shadow-sm hover:bg-blue-500'
                          : isCreateWO
                            ? 'border-emerald-400 bg-emerald-500 text-white shadow-sm hover:bg-emerald-400'
                            : isInvoice
                              ? 'border-green-400/60 bg-transparent text-green-200 hover:bg-green-500/15'
                              : isOpenWO
                                ? 'border-blue-400/60 bg-transparent text-blue-200 hover:bg-blue-500/15'
                                : 'border-cyan-500/50 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20';
                        return (
                          <button
                            key={`${action.label}-${actionIndex}`}
                            type="button"
                            onClick={() => handleMessageAction(action)}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors ${actionClass}`}
                          >
                            {isVehicleChoice && <Car className="h-3.5 w-3.5" />}
                            {isCreateWO && <Wrench className="h-3.5 w-3.5" />}
                            {isOpenWO && <ExternalLink className="h-3.5 w-3.5" />}
                            {isInvoice && <ExternalLink className="h-3.5 w-3.5" />}
                            {action.type === 'command' && <History className="h-3.5 w-3.5" />}
                            {action.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {msg.role === 'assistant' && msg.shareText && (
                    <button type="button" onClick={() => void shareRegisterToWhatsApp(msg.shareText!)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-950/20 hover:bg-emerald-400 active:scale-[0.99]">
                      <Share2 className="h-5 w-5" /> Bagikan ke Grup WA
                    </button>
                  )}
                  <p className={`mt-1 text-[10px] text-slate-500 ${msg.role === 'user' ? 'text-right' : ''}`}>{msg.time}</p>
                </div>
              </div>
            ))}

            {/* Konfirmasi aksi */}
            {pendingAction && !busy && (
              <div className="animate-msg-in rounded-xl border-2 border-cyan-500 bg-cyan-950/40 p-4">
                <p className="mb-2 flex items-center gap-2 text-sm font-bold text-cyan-300">
                  <Wrench className="h-4 w-4" /> {pendingAction.action === 'create_quick_invoice' ? 'Konfirmasi REGINV Cepat' : 'Konfirmasi Buat Order Kerja'}
                </p>
                <div className="mb-3 space-y-1 text-xs text-slate-300">
                  <p>Pelanggan: <b className="text-white">{pendingAction.customerName}</b> {pendingAction.phone && `(${pendingAction.phone})`}</p>
                  {pendingAction.address && <p>Alamat: <b className="text-white">{pendingAction.address}</b></p>}
                  {pendingAction.customerCandidates?.length > 0 && !pendingAction.customerMatchResolved && (
                    <div className="my-3 rounded-lg border border-amber-400 bg-amber-950/40 p-3">
                      <p className="mb-2 font-semibold text-amber-200">Ada pelanggan dengan nama atau telepon mirip. Pakai data lama?</p>
                      <div className="space-y-2">
                        {pendingAction.customerCandidates.map((customerId: string) => {
                          const customer = data.customers.find(item => item.id === customerId);
                          if (!customer) return null;
                          return <button key={customer.id} type="button" onClick={() => setPendingAction((current: any) => ({ ...current, customerName: customer.name, phone: customer.phone, customerId: customer.customerCode, customerRefId: customer.id, customerMatchResolved: true }))} className="w-full rounded-lg border border-amber-500/60 bg-slate-800 px-3 py-2 text-left text-xs text-white hover:border-amber-300">Pakai <b>{customer.name}</b> · {customer.phone || 'tanpa telepon'}</button>;
                        })}
                        <button type="button" onClick={() => setPendingAction((current: any) => ({ ...current, customerMatchResolved: true, customerCandidates: [] }))} className="w-full rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-500">Lanjut buat pelanggan baru: {pendingAction.customerName}</button>
                      </div>
                    </div>
                  )}
                  <p>Kendaraan: <b className="text-white">{pendingAction.plateNumber}</b> — {pendingAction.vehicleInfo}</p>
                  <p>Keluhan: {pendingAction.description || '-'}</p>
                  {pendingAction.complaintRequired && !pendingAction.description?.trim() && (
                    <div className="my-3 rounded-lg border border-orange-400 bg-orange-950/40 p-3">
                      <p className="mb-2 font-semibold text-orange-200">Keluhan belum diisi. Pilih keluhan:</p>
                      <div className="grid grid-cols-2 gap-2">
                        {['AC tidak dingin', 'Berisik', 'Berbau', 'Freon habis', 'Pengecekan rutin'].map(complaint => (
                          <button key={complaint} type="button" onClick={() => setPendingAction((current: any) => ({ ...current, description: complaint, complaintRequired: false }))} className="rounded-lg border border-orange-500/60 bg-slate-800 px-3 py-2 text-left text-xs text-white hover:border-orange-300">{complaint}</button>
                        ))}
                        <button type="button" onClick={() => {
                          const complaint = window.prompt('Tuliskan keluhan pelanggan:');
                          if (complaint?.trim()) setPendingAction((current: any) => ({ ...current, description: complaint.trim(), complaintRequired: false }));
                        }} className="rounded-lg bg-orange-600 px-3 py-2 text-left text-xs font-semibold text-white hover:bg-orange-500">Keluhan lainnya…</button>
                      </div>
                    </div>
                  )}
                  {pendingAction.action === 'create_quick_invoice' && <p>Metode pembayaran: <b className="text-white">{pendingAction.paymentMethod}</b></p>}
                  <div className="mt-3">
                    <p className="mb-2 font-semibold text-white">Cabang tempat WO dibuat:</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {data.branches.filter(branch => branch.isActive).map(branch => (
                        <button
                          key={branch.id}
                          type="button"
                          onClick={() => {
                            setPendingBranchId(branch.id);
                            // Cabang tujuan transaksi harus sama dengan cabang aktif.
                            setCurrentBranchId(branch.id);
                          }}
                          className={`rounded-lg border px-3 py-2 text-left font-semibold transition-colors ${
                            pendingBranchId === branch.id
                              ? 'border-cyan-400 bg-cyan-500 text-slate-950'
                              : 'border-slate-600 bg-slate-800 text-slate-200 hover:border-cyan-500'
                          }`}
                        >
                          {branch.name.replace('CABANG ', '')}
                        </button>
                      ))}
                    </div>
                    {pendingBranchId ? (
                      <p className="mt-2 text-cyan-200">
                        WO akan dicatat di <b>{cabangName(pendingBranchId)}</b>. Cabang ini menjadi cabang aktif transaksi.
                      </p>
                    ) : (
                      <p className="mt-2 text-amber-300">Pilih cabang aktif sebelum membuat WO.</p>
                    )}
                  </div>
                  <div className="mt-2 rounded bg-slate-800 p-2">
                    {(pendingAction.services || []).map((s: any, i: number) => (
                      <div key={i} className="flex justify-between"><span>{s.name} ×{s.qty}</span><span className="font-medium text-white">{fmt((s.price || 0) * (s.qty || 1))}</span></div>
                    ))}
                    <div className="mt-1 flex justify-between border-t border-slate-700 pt-1 font-bold text-cyan-300">
                      <span>Estimasi</span>
                      <span>{fmt((pendingAction.services || []).reduce((t: number, s: any) => t + (s.price || 0) * (s.qty || 1), 0))}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setPendingAction(null); setPendingBranchId(''); }} className="flex-1 rounded-lg border border-slate-600 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800">Batal</button>
                  <button disabled={!pendingBranchId || !pendingAction.description?.trim() || (pendingAction.customerCandidates?.length > 0 && !pendingAction.customerMatchResolved)} onClick={confirmAction} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-cyan-500 py-2 text-xs font-bold text-slate-900 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-400">
                    <CheckCircle2 className="h-4 w-4" /> {pendingBranchId ? `${pendingAction.action === 'create_quick_invoice' ? 'Buat REGINV' : 'Buat WO'} di ${cabangName(pendingBranchId).replace('CABANG ', '')}` : 'Pilih Cabang'}
                  </button>
                </div>
              </div>
            )}

            {busy && (
              <div className="flex animate-msg-in">
                <div className="mr-2 mt-1 flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border-l-2 border-cyan-400 bg-slate-800 px-4 py-3.5">
                  <span className="typing-dot h-2 w-2 rounded-full bg-cyan-400" />
                  <span className="typing-dot h-2 w-2 rounded-full bg-cyan-400" />
                  <span className="typing-dot h-2 w-2 rounded-full bg-cyan-400" />
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-700/60 bg-slate-800/60 p-3">
            <div className="flex items-end gap-2">
              <div className="relative">
                <button type="button" onClick={() => setShowCommandHistory((value) => !value)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-600 bg-slate-900/80 text-slate-300 hover:border-cyan-500 hover:text-cyan-300" title="Riwayat perintah" aria-label="Riwayat perintah">
                  <History className="h-5 w-5" />
                </button>
                {showCommandHistory && (
                  <div className="fixed inset-x-4 bottom-20 z-30 overflow-hidden rounded-xl border border-slate-600 bg-slate-900 shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-14 sm:left-0 sm:w-80">
                    <div className="flex items-center justify-between border-b border-slate-700 px-3 py-2"><span className="text-xs font-bold text-slate-200">Perintah Terakhir</span><button type="button" onClick={() => setShowCommandHistory(false)} className="rounded p-1 text-slate-400 hover:bg-slate-800"><X className="h-3.5 w-3.5" /></button></div>
                    <div className="max-h-64 overflow-y-auto p-1.5">
                      {commandHistory.slice(0, 10).map((command, index) => <button key={`${command}-${index}`} type="button" onClick={() => { setInput(command); setHistoryIndex(index); setShowCommandHistory(false); inputRef.current?.focus(); }} className="block w-full truncate rounded-lg px-3 py-2 text-left font-mono text-xs text-slate-300 hover:bg-slate-800 hover:text-cyan-300" title={command}>{command}</button>)}
                      {commandHistory.length === 0 && <p className="px-3 py-5 text-center text-xs text-slate-500">Belum ada riwayat</p>}
                    </div>
                  </div>
                )}
              </div>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => { setInput(e.target.value); setHistoryIndex(-1); }}
                onContextMenu={e => { e.preventDefault(); setShowCommandHistory(true); }}
                onTouchStart={() => {
                  historyLongPressRef.current = setTimeout(() => setShowCommandHistory(true), 550);
                }}
                onTouchEnd={() => {
                  if (historyLongPressRef.current) clearTimeout(historyLongPressRef.current);
                  historyLongPressRef.current = null;
                }}
                onTouchMove={() => {
                  if (historyLongPressRef.current) clearTimeout(historyLongPressRef.current);
                  historyLongPressRef.current = null;
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); return; }
                  if (e.key === 'Escape') { e.preventDefault(); setInput(''); setHistoryIndex(-1); return; }
                  if (e.key.toLowerCase() === 'l' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); startNewChat(); return; }
                  if (e.key === 'Tab') {
                    const typed = input.trim().toLowerCase();
                    const completion = ['cek', 'list', 'reg wo'].find((command) => typed && command.startsWith(typed));
                    if (completion) { e.preventDefault(); setInput(`${completion} `); }
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    const beforeCursor = e.currentTarget.value.slice(0, e.currentTarget.selectionStart);
                    if (!beforeCursor.includes('\n')) { e.preventDefault(); navigateHistory('up'); }
                    return;
                  }
                  if (e.key === 'ArrowDown') {
                    const afterCursor = e.currentTarget.value.slice(e.currentTarget.selectionEnd);
                    if (!afterCursor.includes('\n') && historyIndex >= 0) { e.preventDefault(); navigateHistory('down'); }
                  }
                }}
                rows={1}
                placeholder="Ketik cek, list, atau reg wo…"
                className="h-11 min-h-11 min-w-0 max-h-11 flex-1 resize-none overflow-hidden rounded-xl border border-slate-600 bg-slate-900/80 px-3 py-3 text-sm leading-5 text-slate-100 placeholder-slate-500 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 lg:max-h-[92px]"
              />
              <button onClick={() => send()} disabled={busy || !input.trim()} className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 text-white shadow-lg transition-all hover:scale-105 disabled:opacity-40">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </button>
            </div>
            <p className="mt-1.5 hidden px-14 text-[10px] text-slate-500 sm:block">Enter kirim · Shift+Enter baris baru · ↑↓ riwayat · Esc kosongkan · Ctrl+L bersihkan chat · Tab lengkapi perintah</p>
          </div>
        </section>
      </div>

      {/* Settings */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md animate-msg-in rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between rounded-t-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-4 text-white">
              <div className="flex items-center gap-2"><KeyRound className="h-5 w-5" /><h3 className="font-display text-lg font-bold">Pengaturan Groq AI</h3></div>
              <button onClick={() => setShowSettings(false)} className="rounded-lg p-1.5 hover:bg-white/20"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4 p-6">
              <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-xs text-cyan-900">
                <p className="mb-1 font-bold">API Key gratis (2 menit):</p>
                <ol className="list-inside list-decimal space-y-0.5">
                  <li>Buka <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="font-semibold underline">console.groq.com/keys</a> <ExternalLink className="ml-0.5 inline h-3 w-3" /></li>
                  <li>Sign up Google → <b>Create API Key</b></li>
                  <li>Copy key (<code className="rounded bg-white px-1">gsk_...</code>) & paste di bawah</li>
                </ol>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Groq API Key</label>
                <input
                  type="text"
                  value={keyDraft}
                  onChange={e => { setKeyDraft(e.target.value); setTestResult(null); }}
                  placeholder="gsk_xxxxxxxxxxxxxxxxxxxx"
                  spellCheck={false}
                  autoComplete="off"
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 font-mono text-sm outline-none focus:border-cyan-500"
                />
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className={keyDraft.trim().startsWith('gsk_') ? 'text-emerald-600' : 'text-slate-500'}>
                    {keyDraft.trim().startsWith('gsk_') ? '✓ format gsk_' : 'harus diawali gsk_'}
                  </span>
                  <span className="text-slate-400">•</span>
                  <span className={keyDraft.trim().length >= 40 ? 'text-emerald-600' : 'text-slate-500'}>
                    {keyDraft.trim().length} karakter
                  </span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-500">disimpan di browser Anda saja</span>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Model</label>
                <select value={model} onChange={e => { setModel(e.target.value); setTestResult(null); }} className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-cyan-500">
                  {GROQ_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>

              {testResult && (
                <div className={`rounded-lg border p-3 text-xs ${testResult.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
                  <p className="font-semibold">{testResult.ok ? '✓ Koneksi berhasil' : '✕ Koneksi gagal'}</p>
                  <p className="mt-0.5 whitespace-pre-line">{testResult.msg}</p>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
                <button onClick={() => setShowSettings(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Batal</button>
                <button
                  onClick={testConnection}
                  disabled={testing}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500 px-4 py-2 text-sm font-semibold text-cyan-700 hover:bg-cyan-50 disabled:opacity-50"
                >
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  {testing ? 'Menguji…' : 'Tes Koneksi'}
                </button>
                <button onClick={saveKey} className="rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2 text-sm font-bold text-white">Simpan</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
