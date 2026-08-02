import { useState, useRef, useEffect } from 'react';
import {
  Bot, Send, KeyRound, Sparkles, Car, Users, Package,
  AlertTriangle, ExternalLink, X, Zap, Database, Loader2, Wrench, CheckCircle2, History, Share2, Building2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/apiClient';
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
  shareText?: string;
}

interface RegistrationDraft {
  step: 'plate' | 'customerName' | 'phone' | 'vehicle' | 'complaint';
  plateNumber: string;
  customerName: string;
  phone: string;
  vehicleInfo: string;
}

const now = () => new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const render = (t: string) =>
  esc(t)
    .replace(/```json[\s\S]*?```/g, '')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-white">$1</strong>')
    .replace(/^- (.+)$/gm, '<span class="block pl-3">• $1</span>')
    .replace(/\n/g, '<br/>');

export default function AIAssistant() {
  const {
    data, currentUser, currentBranchId, setCurrentBranchId, resolveBranchId,
    addWorkOrder, addCustomer, generateCustomerCode, addVehicle, updateVehicle, generateDocumentNumber,
    hasPermission,
  } = useApp();

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('apiToken') || '');
  const [model, setModel] = useState(GROQ_MODELS[0].id);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showBranchChooser, setShowBranchChooser] = useState(() => currentBranchId === 'ALL');
  const [keyDraft, setKeyDraft] = useState(apiKey);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pendingAction, setPendingAction] = useState<any>(null);
  const [pendingBranchId, setPendingBranchId] = useState('');
  const [registrationDraft, setRegistrationDraft] = useState<RegistrationDraft | null>(null);
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

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy, showBranchChooser]);

  useEffect(() => {
    if (currentBranchId === 'ALL') setShowBranchChooser(true);
  }, [currentBranchId]);

  useEffect(() => {
    const field = inputRef.current;
    if (!field) return;
    field.style.height = '44px';
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

  const buildVehicleHistoryReply = (userText: string): string | null => {
    const lower = userText.toLowerCase();
    const isHistoryIntent = /(cek|riwayat|history|pemilik|milik siapa|siapa punya|pernah|servis|service|wo terakhir|keluhan sebelumnya)/i.test(lower);
    const isCreateIntent = /(buat|tambah|bikin|create)\s+(wo|order)/i.test(lower);
    if (!isHistoryIntent || isCreateIntent) return null;

    const compactText = userText.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const vehicle = data.vehicles.find((item) => compactText.includes(normalizePlate(item.plateNumber)));
    if (!vehicle) {
      const possiblePlate = userText.toUpperCase().match(/\b[A-Z]{1,2}[\s-]*\d{2,4}[\s-]*[A-Z]{1,3}\b/)?.[0];
      const terms = lookupTerms(userText).map((term) => normalizePlate(term)).filter((term) => term.length >= 2);
      const plateQuery = possiblePlate ? normalizePlate(possiblePlate) : (terms[0] || '');
      if (!plateQuery) return null;

      const candidates = data.vehicles
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

      if (candidates.length > 0) {
        return [
          `Ditemukan **${candidates.length} kendaraan** yang cocok atau mirip dengan **${plateQuery}**:`,
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
          `Ketik nomor plat lengkap, misalnya **cek ${candidates[0].item.plateNumber}**.`,
        ].join('\n');
      }

      return possiblePlate
        ? `Kendaraan dengan plat **${normalizePlate(possiblePlate)}** tidak ditemukan dalam Register Kendaraan.\n\nPeriksa kembali nomor plat atau daftarkan kendaraan terlebih dahulu.`
        : null;
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
    const showAll = /(semua|seluruh|lengkap)/i.test(lower);
    const listedWOs = showAll ? visibleWOs : visibleWOs.slice(0, 5);

    const lines = [
      `**Kendaraan ditemukan**`,
      ``,
      `- Plat: **${vehicle.plateNumber}**`,
      `- Pemilik: **${customer?.name || vehicle.customerName || '-'}**`,
      `- Telepon: ${customer?.phone || vehicle.phone || '-'}`,
      `- Kendaraan: ${[vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(' ') || '-'}`,
      `- Warna: ${vehicle.color || '-'}`,
      ``,
      `**Riwayat servis: ${visibleWOs.length} WO yang dapat Anda akses**`,
    ];

    if (listedWOs.length === 0) {
      lines.push('', 'Belum ada riwayat WO pada cabang yang dapat Anda akses.');
      if (allVehicleWOs.length > 0 && !canSeeAllBranches) {
        lines.push('Kendaraan memiliki riwayat di cabang lain, tetapi detailnya dibatasi oleh hak akses Anda.');
      }
      return lines.join('\n');
    }

    listedWOs.forEach((wo, index) => {
      const services = wo.services.map((service) => `${service.name} ×${service.qty}`).join(', ') || 'Belum ada layanan';
      lines.push(
        '',
        `${index + 1}. **${wo.woNumber}** — ${wo.date}`,
        `   Cabang: ${cabangName(wo.branchId)}`,
        `   Keluhan: ${wo.description || '-'}`,
        `   Layanan: ${services}`,
        `   Status: **${wo.status}**`,
        `   Total: ${fmt(wo.total)}${wo.invoiceNumber ? ` · Faktur ${wo.invoiceNumber}` : ''}`,
      );
    });

    if (!showAll && visibleWOs.length > listedWOs.length) {
      lines.push('', `Menampilkan 5 WO terbaru. Ketik **riwayat lengkap ${vehicle.plateNumber}** untuk melihat semuanya.`);
    }
    return lines.join('\n');
  };

  const buildCustomerLookupReply = (userText: string): string | null => {
    const lower = userText.toLowerCase();
    const isLookupIntent = /(cek|cari|data|pelanggan|customer|pemilik|kendaraan milik|riwayat|servis|service)/i.test(lower);
    const isCreateIntent = /(buat|tambah|bikin|create)\s+(wo|order|pelanggan|customer)/i.test(lower);
    if (!isLookupIntent || isCreateIntent) return null;

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

    if (candidates.length === 0) return null;
    if (candidates.length > 1 || fuzzySearch) {
      const choices = candidates.slice(0, 8).map((customer, index) => {
        const vehicleCount = data.vehicles.filter((vehicle) =>
          vehicle.customerRefId === customer.id
          || (!vehicle.customerRefId && vehicle.customerId === customer.customerCode)
        ).length;
        return `${index + 1}. **${customer.name}** — ${customer.customerCode} · ${customer.phone || 'tanpa telepon'} · ${vehicleCount} kendaraan`;
      });
      return [
        fuzzySearch
          ? `Tidak ditemukan nama persis. Apakah yang dimaksud salah satu dari **${candidates.length} pelanggan** berikut?`
          : `Ditemukan **${candidates.length} pelanggan** yang mirip. Pilih dengan mengetik kode pelanggan atau nomor telepon:`,
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
      const today = new Date().toISOString().split('T')[0];
      const filtered = data.workOrders
        .filter((wo) => allowedBranchIds.has(wo.branchId))
        .filter((wo) => !status || wo.status.toLowerCase() === status)
        .filter((wo) => !lower.includes('hari ini') || wo.date === today)
        .filter((wo) => queryTerms.length === 0 || queryTerms.every((term) =>
          `${wo.woNumber} ${wo.customerName} ${wo.plateNumber}`.toLowerCase().includes(term)
        ))
        .sort((a, b) => b.date.localeCompare(a.date) || b.woNumber.localeCompare(a.woNumber));
      const rows = filtered.slice(start, start + pageSize).map((wo, index) =>
        `${start + index + 1}. **${wo.woNumber}** — ${wo.date}\n   ${wo.customerName} · ${wo.plateNumber} · ${wo.status} · ${fmt(wo.total)} · ${cabangName(wo.branchId)}`
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

  const startRegistrationWizard = () => {
    setPendingAction(null);
    setPendingBranchId('');
    setRegistrationDraft({ step: 'plate', plateNumber: '', customerName: '', phone: '', vehicleInfo: '' });
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
    if (lower === 'ulang') return startRegistrationWizard();

    if (registrationDraft.step === 'plate') {
      const plateMatch = value.toUpperCase().match(/\b[A-Z]{1,2}[\s-]*\d{2,4}[\s-]*[A-Z]{1,3}\b/)?.[0];
      if (!plateMatch) return 'Format nomor plat belum dikenali. Contoh: **DC1143OW** atau **DD 1486 QZ**.';
      const normalized = normalizePlate(plateMatch);
      const vehicle = data.vehicles.find((item) => normalizePlate(item.plateNumber) === normalized);
      if (vehicle) {
        const customer = data.customers.find((item) => item.id === vehicle.customerRefId || item.customerCode === vehicle.customerId);
        setRegistrationDraft({
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
    const action = {
      action: 'create_wo',
      customerName: registrationDraft.customerName,
      phone: registrationDraft.phone,
      plateNumber: registrationDraft.plateNumber,
      vehicleInfo: registrationDraft.vehicleInfo,
      description: value,
      services: [{ name: 'CEK AC', price: 0, qty: 1 }],
    };
    setPendingAction(action);
    setPendingBranchId(currentBranchId === 'ALL' ? '' : currentBranchId);
    setRegistrationDraft(null);
    return `Data registrasi sudah lengkap.\n\n- Pelanggan: **${action.customerName}**\n- Telepon: ${action.phone}\n- Plat: **${action.plateNumber}**\n- Kendaraan: ${action.vehicleInfo}\n- Keluhan: ${action.description}\n- Layanan awal: **CEK AC (gratis)**\n\nPilih cabang lalu tekan **Konfirmasi & Buat WO**.`;
  };

  const buildSmartContext = (userMsgText: string): string => {
    const parts: string[] = [];
    const today = new Date().toISOString().split('T')[0];
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
      .filter(i => i.isActive && i.isQuickService && i.type !== 'Group')
      .slice(0, 10)
      .map(i => `${i.name} (${i.type}) harga ${i.sellingPrice === 0 ? 'GRATIS Rp 0' : `Rp ${i.sellingPrice.toLocaleString('id-ID')}`}`)
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

MEMBUAT WO (HANYA UNTUK PESAN YANG DIMULAI "reg wo"):
Kalau user minta buat WO tanpa menyebut layanan, OTOMATIS tambahkan default:
  {"name":"CEK AC","price":0,"qty":1}
Ini adalah pengecekan gratis. Jangan tanya layanan kalau sudah ada keluhan yang jelas.

Kalau user MENYEBUT layanan (misalnya "flushing", "isi freon"):
- Cari nama PERSIS di LAYANAN CEPAT berikut: ${quickServices || 'tidak ada data layanan'}
- Kalau tidak ada, gunakan nama yang user sebut & harga 0 (tanyakan ke user untuk konfirmasi harga).

Setelah ada plat, pelanggan, dan keluhan — LANGSUNG keluarkan JSON tanpa bertanya lebih lanjut:
\`\`\`json
{"action":"create_wo","customerName":"NAMA_PERSIS","phone":"08xx","plateNumber":"PLAT_PERSIS","vehicleInfo":"Merek Model Tahun - Warna","description":"keluhan","services":[{"name":"CEK AC","price":0,"qty":1}]}
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
        address: '',
        email: '',
        createdAt: new Date().toISOString().split('T')[0],
        branchId,
      });
    }

    // 2. Kendaraan
    let vehicle = data.vehicles.find(v =>
      v.plateNumber.replace(/\s/g, '').toUpperCase() === String(a.plateNumber || '').replace(/\s/g, '').toUpperCase()
    );
    if (!vehicle && a.plateNumber) {
      const parts = String(a.vehicleInfo || '').split(/[\s-]+/);
      const newV = {
        id: Date.now().toString() + 'v',
        plateNumber: String(a.plateNumber).toUpperCase(),
        brand: parts[0] || '-',
        model: parts[1] || '-',
        year: parseInt(parts.find((x: string) => /^\d{4}$/.test(x)) || '0') || new Date().getFullYear(),
        color: parts[parts.length - 1] || '-',
        customerRefId: customer?.id,
        customerName: customer?.name || String(a.customerName || '').toUpperCase(),
        customerId: customer?.customerCode || '',
        phone: customer?.phone || a.phone || '',
        address: customer?.address || '',
        registrationDate: new Date().toISOString().split('T')[0],
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
    const rawServices: any[] = a.services?.length > 0 ? a.services : [{ name: 'CEK AC', price: 0, qty: 1 }];
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
    const woNumber = generateDocumentNumber('workOrder', branchId);

    const wo: WorkOrder = {
      id: Date.now().toString() + 'w',
      woNumber,
      date: new Date().toISOString().split('T')[0],
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
      status: 'Pengecekan',
      notes: `Dibuat via Asisten AI oleh ${currentUser?.name}`,
      branchId,
    };
    await addWorkOrder(wo);

    return { woNumber, branchName, total, customerName: wo.customerName, customerPhone: customer?.phone || a.phone || '', plateNumber: wo.plateNumber, vehicleInfo: wo.vehicleInfo, description: wo.description, date: wo.date, servicesCount: services.length };
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
      setMessages([]);
      setInput('');
      setHistoryIndex(-1);
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

    if (registrationDraft || lowerContent === 'reg wo' || lowerContent === 'ulang') {
      const reply = registrationDraft ? continueRegistrationWizard(content) : startRegistrationWizard();
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
    const customerLookupReply = listReply || vehicleHistoryReply ? null : buildCustomerLookupReply(content);
    const localLookupReply = listReply || vehicleHistoryReply || customerLookupReply;
    if (localLookupReply) {
      setInput('');
      setMessages(history => [
        ...history,
        { role: 'user', content, time: now() },
        { role: 'assistant', content: localLookupReply, time: now() },
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

  const confirmAction = async () => {
    if (!pendingAction || !pendingBranchId) return;
    setBusy(true);
    try {
      const r = await executeCreateWO(pendingAction, pendingBranchId);
      const plateForShare = r.plateNumber.replace(/\s+/g, '').toUpperCase().replace(/^([A-Z]{1,2})(\d{1,4})([A-Z]{0,3})$/, (_all: string, prefix: string, number: string, suffix: string) => `${prefix} ${number}${suffix ? ` ${suffix}` : ''}`);
      const vehicleForShare = (r.vehicleInfo || '-').replace(/\s*-\s*([^-]+)$/, ' ($1)');
      const shareText = `🔧 ${r.woNumber}\n📅 ${new Date(`${r.date}T00:00:00`).toLocaleDateString('id-ID')}\n🚗 ${plateForShare} – ${vehicleForShare}\n👤 ${r.customerName}${r.customerPhone ? ` ${r.customerPhone}` : ''}\n📝 Keluhan: ${r.description || '-'}\n✍️ Input: ${currentUser?.name || '-'}`;
      setMessages(h => [...h, {
        role: 'assistant',
        time: now(),
        shareText,
        content: `✅ **Order Kerja berhasil dibuat!**\n\n- Nomor: **${r.woNumber}**\n- Pelanggan: **${r.customerName}**\n- Kendaraan: **${r.plateNumber}**\n- Layanan: **${r.servicesCount} item**\n- Estimasi: **${fmt(r.total)}**\n- Cabang: **${r.branchName}**\n- Status: **Pengecekan** (gratis, menunggu persetujuan pelanggan)\n\nBuka menu Order Kerja untuk melanjutkan.`,
      }]);
    } catch (e: any) {
      setMessages(h => [...h, { role: 'assistant', content: `⚠️ Gagal membuat WO: ${e.message}`, error: true, time: now() }]);
    } finally {
      setPendingAction(null);
      setPendingBranchId('');
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

  const chips = [
    'cek DD',
    'list customer',
    'list wo hari ini',
    'reg wo',
    'Barang apa saja yang stoknya menipis?',
    'Berapa harga jasa flushing AC?',
    'Rekap pendapatan & piutang',
  ];

  const lowStock = data.items.filter(i => i.type === 'Persediaan' && i.stock <= 3);

  return (
    <div className="relative h-full min-h-0 lg:h-[calc(100vh-140px)] lg:min-h-[560px]">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-cyan-200/40 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-blue-200/50 blur-3xl" />
      </div>

      {/* Status dan pengaturan; judul halaman sudah tampil di header utama */}
      <div className="mb-3 hidden items-center justify-end gap-2 lg:flex">
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${hasKey ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            <span className={`h-2 w-2 rounded-full ${hasKey ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            {hasKey ? 'Terhubung' : 'Belum Diatur'}
          </span>
          <button onClick={() => { window.location.href = '/settings'; }} className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <KeyRound className="h-3.5 w-3.5" /> Pengaturan
          </button>
        </div>
      </div>

      <div className="grid h-full gap-4 lg:h-[calc(100%-72px)] lg:grid-cols-[300px_1fr]">
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
            <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-bold text-slate-800"><Zap className="h-4 w-4 text-amber-500" /> Coba Tanyakan</h3>
            <div className="flex flex-col gap-2">
              {chips.map(c => (
                <button key={c} onClick={() => send(c)} disabled={busy} className="group rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-medium text-slate-700 transition-all hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-800 disabled:opacity-50">
                  <span className="mr-1 text-cyan-500">→</span>{c}
                </button>
              ))}
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
        <section className="flex min-h-0 flex-col overflow-hidden rounded-none border border-slate-700/60 bg-slate-900 shadow-2xl lg:rounded-2xl">
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
            <span className="hidden font-mono text-[10px] text-slate-500 sm:inline">{GROQ_MODELS.find(m => m.id === model)?.label}</span>
          </div>

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
              <div className="flex h-full flex-col items-center justify-center text-center animate-msg-in">
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-xl animate-glow">
                  <Bot className="h-10 w-10 text-white" />
                </div>
                <h3 className="font-display text-xl font-bold text-white">Halo, {currentUser?.name?.split(' ')[0]}! 👋</h3>
                <p className="mt-1 max-w-sm text-sm text-slate-400">
                  {hasKey ? 'Saya bisa cek data, jawab pertanyaan, dan membuatkan Order Kerja.' : 'Atur API Key Groq gratis dulu.'}
                </p>
                {!hasKey && (
                  <button onClick={() => { window.location.href = '/settings'; }} className="mt-4 flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-900 hover:bg-cyan-400">
                    <KeyRound className="h-4 w-4" /> Dapatkan Key Gratis
                  </button>
                )}
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex animate-msg-in ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="mr-2 mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600">
                    <Bot className="h-5 w-5 text-white" />
                  </div>
                )}
                <div className="max-w-[80%]">
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-md ${
                      msg.role === 'user' ? 'rounded-br-sm bg-blue-600 text-white'
                      : msg.error ? 'rounded-bl-sm border border-red-500/40 bg-red-950/60 text-red-200'
                      : 'rounded-bl-sm border-l-2 border-cyan-400 bg-slate-800 text-slate-200'
                    }`}
                    dangerouslySetInnerHTML={{ __html: render(msg.content) }}
                  />
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
                  <Wrench className="h-4 w-4" /> Konfirmasi Buat Order Kerja
                </p>
                <div className="mb-3 space-y-1 text-xs text-slate-300">
                  <p>Pelanggan: <b className="text-white">{pendingAction.customerName}</b> {pendingAction.phone && `(${pendingAction.phone})`}</p>
                  <p>Kendaraan: <b className="text-white">{pendingAction.plateNumber}</b> — {pendingAction.vehicleInfo}</p>
                  <p>Keluhan: {pendingAction.description || '-'}</p>
                  <div className="mt-3">
                    <p className="mb-2 font-semibold text-white">Cabang tempat WO dibuat:</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {data.branches.filter(branch => branch.isActive).map(branch => (
                        <button
                          key={branch.id}
                          type="button"
                          onClick={() => setPendingBranchId(branch.id)}
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
                    {!pendingBranchId && <p className="mt-2 text-amber-300">Pilih cabang sebelum membuat WO.</p>}
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
                  <button disabled={!pendingBranchId} onClick={confirmAction} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-cyan-500 py-2 text-xs font-bold text-slate-900 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-400">
                    <CheckCircle2 className="h-4 w-4" /> {pendingBranchId ? `Buat di ${cabangName(pendingBranchId).replace('CABANG ', '')}` : 'Pilih Cabang'}
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
                  if (e.key.toLowerCase() === 'l' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setMessages([]); return; }
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
                className="min-h-11 min-w-0 max-h-[92px] flex-1 resize-none rounded-xl border border-slate-600 bg-slate-900/80 px-3 py-3 text-sm leading-5 text-slate-100 placeholder-slate-500 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30"
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
