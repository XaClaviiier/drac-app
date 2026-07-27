import { useState, useRef, useEffect } from 'react';
import {
  Bot, Send, KeyRound, Sparkles, Car, Users, Package,
  AlertTriangle, ExternalLink, X, Zap, Database, Loader2, Wrench, CheckCircle2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { WorkOrder, WorkOrderService } from '../types';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
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
    data, currentUser, currentBranchId, resolveBranchId,
    addWorkOrder, addCustomer, generateCustomerCode, addVehicle,
  } = useApp();

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('groq_api_key') || '');
  const [model, setModel] = useState(() => localStorage.getItem('groq_model') || GROQ_MODELS[0].id);
  const [showSettings, setShowSettings] = useState(false);
  const [keyDraft, setKeyDraft] = useState(apiKey);
  const [pendingAction, setPendingAction] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy]);

  const hasKey = apiKey.trim().length > 10;
  const fmt = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

  // ============ FULL DATA SNAPSHOT untuk AI ============
  const buildFullContext = (): string => {
    const p: string[] = [];
    const today = new Date().toISOString().split('T')[0];

    p.push(`=== TANGGAL: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'full' })} ===`);
    p.push(`User login: ${currentUser?.name} (${currentUser?.roleName}), cabang aktif: ${currentBranchId === 'ALL' ? 'Semua Cabang' : data.branches.find(b => b.id === currentBranchId)?.name}`);

    // CABANG
    p.push(`\n=== CABANG (${data.branches.length}) ===`);
    data.branches.forEach(b => p.push(`${b.id} | ${b.name} | ${b.address} | ${b.phone}`));

    // PELANGGAN — daftar lengkap
    p.push(`\n=== PELANGGAN (${data.customers.length}) ===`);
    data.customers.forEach(c => {
      const vs = data.vehicles.filter(v => v.customerName === c.name).map(v => v.plateNumber).join(', ');
      p.push(`${c.customerCode} | ${c.name} | HP: ${c.phone} | ${c.address || '-'} | Kendaraan: ${vs || 'belum ada'} | Cabang: ${data.branches.find(b => b.id === c.branchId)?.name || c.branchId}`);
    });

    // KENDARAAN — daftar lengkap
    p.push(`\n=== KENDARAAN (${data.vehicles.length}) ===`);
    data.vehicles.forEach(v => {
      p.push(`${v.plateNumber} | ${v.brand} ${v.model} ${v.year} ${v.color} | Pemilik: ${v.customerName} (${v.phone}) | ${v.notes || ''}`);
    });

    // KATEGORI
    p.push(`\n=== KATEGORI BARANG (${data.itemCategories.length}) ===`);
    data.itemCategories.forEach(c => {
      const n = data.items.filter(i => i.categoryId === c.id).length;
      p.push(`${c.code} | ${c.name} | jenis: ${c.type} | ${n} item`);
    });

    // BARANG & JASA — daftar lengkap dengan harga
    p.push(`\n=== BARANG & JASA (${data.items.length}) ===`);
    data.items.forEach(i => {
      const grp = i.groupMembers?.length ? ` | isi paket: ${i.groupMembers.map(m => `${m.itemName} x${m.qty}`).join(', ')}` : '';
      p.push(`${i.code} | ${i.name} | ${i.type} | ${i.categoryName} | satuan ${i.unit} | stok ${i.stock} | beli ${i.purchasePrice} | JUAL ${i.sellingPrice}${i.isQuickService ? ' | layanan-cepat' : ''}${grp}`);
    });

    // ORDER KERJA
    p.push(`\n=== ORDER KERJA (${data.workOrders.length}) ===`);
    data.workOrders.slice(-25).forEach(w => {
      p.push(`${w.woNumber} | ${w.date} | ${w.customerName} | ${w.plateNumber} | ${w.status} | ${fmt(w.total)} | ${data.branches.find(b => b.id === w.branchId)?.name} | keluhan: ${w.description || '-'}`);
    });

    // FAKTUR
    p.push(`\n=== FAKTUR PENJUALAN (${data.invoices.length}) ===`);
    data.invoices.slice(-20).forEach(i => {
      p.push(`${i.invoiceNumber} | ${i.date} | ${i.customerName} | ${fmt(i.total)} | bayar ${fmt(i.payment)} | ${i.status}`);
    });

    // SUPPLIER
    if (data.suppliers.length) {
      p.push(`\n=== SUPPLIER (${data.suppliers.length}) ===`);
      data.suppliers.forEach(s => p.push(`${s.code} | ${s.name} | ${s.phone} | ${s.contactPerson || '-'}`));
    }

    // RINGKASAN KEUANGAN
    const totalRev = data.invoices.reduce((s, i) => s + i.payment, 0);
    const unpaid = data.invoices.filter(i => i.status === 'Belum Lunas');
    const todayRev = data.invoices.filter(i => i.date === today).reduce((s, i) => s + i.payment, 0);
    const lowStock = data.items.filter(i => i.type === 'Persediaan' && i.stock <= 3);
    p.push(`\n=== RINGKASAN ===`);
    p.push(`Total pendapatan: ${fmt(totalRev)} | Hari ini: ${fmt(todayRev)}`);
    p.push(`Piutang: ${unpaid.length} faktur = ${fmt(unpaid.reduce((s, i) => s + (i.total - i.payment), 0))}`);
    p.push(`Hutang supplier: ${fmt(data.purchaseInvoices.reduce((s, x) => s + (x.total - x.paidAmount), 0))}`);
    if (lowStock.length) p.push(`Stok menipis: ${lowStock.map(i => `${i.name} (${i.stock})`).join(', ')}`);

    return p.join('\n');
  };

  const systemPrompt = `Kamu adalah "ASISTEN DOKTER AC" — asisten AI bengkel spesialis AC mobil "Dokter AC Mobil" (cabang Perintis, Cakalang, Mamuju).

ATURAN JAWABAN:
- Bahasa Indonesia, ringkas, gunakan **tebal** untuk poin penting & angka rupiah.
- Gunakan DATA BENGKEL di bawah sebagai satu-satunya sumber kebenaran. JANGAN mengarang.
- Kalau ditanya "siapa pelanggan", "kendaraan apa saja", "barang apa saja" — SEBUTKAN NAMA-NAMANYA dari data, jangan cuma jumlah.
- Kalau data tidak ada, katakan tidak ditemukan.

KEMAMPUAN AKSI:
Kamu BISA membuat Order Kerja baru. Kalau user minta buat WO, balas penjelasan singkat LALU sertakan blok JSON persis format ini di akhir:

\`\`\`json
{"action":"create_wo","customerName":"NAMA","phone":"08xx","plateNumber":"DD1234XX","vehicleInfo":"Toyota Avanza 2020 - Hitam","description":"keluhan pelanggan","services":[{"name":"NAMA JASA/BARANG","price":150000,"qty":1}]}
\`\`\`

Aturan JSON aksi:
- Ambil harga dari daftar BARANG & JASA. Kalau item tidak ada di master, tetap boleh dengan harga yang user sebut.
- Kalau pelanggan sudah ada di data, pakai nama & HP persis dari data.
- Kalau plat sudah terdaftar, pakai vehicleInfo dari data.
- Kalau info kurang (plat/pelanggan/keluhan), TANYAKAN dulu, jangan keluarkan JSON.

${buildFullContext()}`;

  // ============ Parse & eksekusi aksi ============
  const extractAction = (text: string) => {
    const m = text.match(/```json\s*([\s\S]*?)```/);
    if (!m) return null;
    try {
      const obj = JSON.parse(m[1].trim());
      return obj?.action ? obj : null;
    } catch { return null; }
  };

  const executeCreateWO = async (a: any) => {
    const branchId = resolveBranchId();
    const branchName = data.branches.find(b => b.id === branchId)?.name || branchId;

    // 1. Pelanggan
    let customer = data.customers.find(c =>
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
    }

    // 3. Layanan
    const services: WorkOrderService[] = (a.services || []).map((s: any, idx: number) => {
      const master = data.items.find(i =>
        i.name.toUpperCase() === String(s.name || '').toUpperCase() ||
        i.code.toUpperCase() === String(s.name || '').toUpperCase()
      );
      return {
        id: `${Date.now()}-${idx}`,
        itemId: master?.id,
        code: master?.code,
        name: master?.name || String(s.name || 'Layanan'),
        description: '',
        price: Number(s.price) || master?.sellingPrice || 0,
        qty: Number(s.qty) || 1,
      };
    });
    const total = services.reduce((sum, s) => sum + s.price * s.qty, 0);

    // 4. WO
    const prefixes: Record<string, string> = { 'BR-001': 'WO-P', 'BR-002': 'WO-C', 'BR-003': 'WO-M' };
    const prefix = prefixes[branchId] || 'WO';
    const count = data.workOrders.filter(w => w.branchId === branchId).length + 1;
    const woNumber = `${prefix}-${new Date().getFullYear()}-${String(count).padStart(3, '0')}`;

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

    return { woNumber, branchName, total, customerName: wo.customerName, plateNumber: wo.plateNumber, servicesCount: services.length };
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    if (!hasKey) { setShowSettings(true); return; }

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
          model, temperature: 0.3, max_tokens: 1400,
          messages: [
            { role: 'system', content: systemPrompt },
            ...history.slice(-8).map(m => ({ role: m.role, content: m.content })),
          ],
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        throw new Error(e?.error?.message || `HTTP ${res.status}`);
      }
      const json = await res.json();
      const reply = json.choices?.[0]?.message?.content || 'Maaf, tidak ada jawaban.';
      const action = extractAction(reply);

      setMessages(h => [...h, { role: 'assistant', content: reply, time: now(), action }]);
      if (action?.action === 'create_wo') setPendingAction(action);
    } catch (e: any) {
      setMessages(h => [...h, { role: 'assistant', content: `⚠️ Gagal: ${e.message}`, error: true, time: now() }]);
    } finally {
      setBusy(false);
    }
  };

  const confirmAction = async () => {
    if (!pendingAction) return;
    setBusy(true);
    try {
      const r = await executeCreateWO(pendingAction);
      setMessages(h => [...h, {
        role: 'assistant',
        time: now(),
        content: `✅ **Order Kerja berhasil dibuat!**\n\n- Nomor: **${r.woNumber}**\n- Pelanggan: **${r.customerName}**\n- Kendaraan: **${r.plateNumber}**\n- Layanan: **${r.servicesCount} item**\n- Estimasi: **${fmt(r.total)}**\n- Cabang: **${r.branchName}**\n- Status: **Pengecekan** (gratis, menunggu persetujuan pelanggan)\n\nBuka menu Order Kerja untuk melanjutkan.`,
      }]);
    } catch (e: any) {
      setMessages(h => [...h, { role: 'assistant', content: `⚠️ Gagal membuat WO: ${e.message}`, error: true, time: now() }]);
    } finally {
      setPendingAction(null);
      setBusy(false);
    }
  };

  const saveKey = () => {
    localStorage.setItem('groq_api_key', keyDraft.trim());
    localStorage.setItem('groq_model', model);
    setApiKey(keyDraft.trim());
    setShowSettings(false);
  };

  const chips = [
    'Sebutkan semua pelanggan & kendaraannya',
    'Barang apa saja yang stoknya menipis?',
    'Buatkan WO untuk DD1486QZ, AC tidak dingin, flushing + isi freon',
    'Berapa harga jasa flushing AC?',
    'Rekap pendapatan & piutang',
  ];

  const lowStock = data.items.filter(i => i.type === 'Persediaan' && i.stock <= 3);

  return (
    <div className="relative h-[calc(100vh-140px)] min-h-[560px]">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-cyan-200/40 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-blue-200/50 blur-3xl" />
      </div>

      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-lg shadow-cyan-500/30 animate-glow">
            <Bot className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">Asisten AI Bengkel</h2>
            <p className="text-xs text-slate-500">Groq · akses penuh data · bisa buat Order Kerja</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${hasKey ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            <span className={`h-2 w-2 rounded-full ${hasKey ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            {hasKey ? 'Terhubung' : 'Belum Diatur'}
          </span>
          <button onClick={() => { setKeyDraft(apiKey); setShowSettings(true); }} className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <KeyRound className="h-3.5 w-3.5" /> Pengaturan
          </button>
        </div>
      </div>

      <div className="grid h-[calc(100%-72px)] gap-4 lg:grid-cols-[300px_1fr]">
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
        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-700/60 bg-slate-800/60 px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Wrench className="h-3.5 w-3.5 text-cyan-400" />
              <span className="font-mono">{currentUser?.name}</span>
            </div>
            <span className="font-mono text-[10px] text-slate-500">{GROQ_MODELS.find(m => m.id === model)?.label}</span>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
            {messages.length === 0 && !busy && (
              <div className="flex h-full flex-col items-center justify-center text-center animate-msg-in">
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-xl animate-glow">
                  <Bot className="h-10 w-10 text-white" />
                </div>
                <h3 className="font-display text-xl font-bold text-white">Halo, {currentUser?.name?.split(' ')[0]}! 👋</h3>
                <p className="mt-1 max-w-sm text-sm text-slate-400">
                  {hasKey ? 'Saya bisa cek data, jawab pertanyaan, dan membuatkan Order Kerja.' : 'Atur API Key Groq gratis dulu.'}
                </p>
                {!hasKey && (
                  <button onClick={() => setShowSettings(true)} className="mt-4 flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-900 hover:bg-cyan-400">
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
                  <button onClick={() => setPendingAction(null)} className="flex-1 rounded-lg border border-slate-600 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800">Batal</button>
                  <button onClick={confirmAction} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-cyan-500 py-2 text-xs font-bold text-slate-900 hover:bg-cyan-400">
                    <CheckCircle2 className="h-4 w-4" /> Buat Sekarang
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
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                rows={1}
                placeholder={hasKey ? 'Tanya atau minta buatkan WO…' : 'Atur API Key dulu…'}
                className="flex-1 resize-none rounded-xl border border-slate-600 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30"
              />
              <button onClick={() => send()} disabled={busy || !input.trim()} className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 text-white shadow-lg transition-all hover:scale-105 disabled:opacity-40">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </button>
            </div>
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
                <input type="password" value={keyDraft} onChange={e => setKeyDraft(e.target.value)} placeholder="gsk_xxxx" className="w-full rounded-lg border border-slate-300 px-4 py-2.5 font-mono text-sm outline-none focus:border-cyan-500" />
                <p className="mt-1 text-[11px] text-slate-500">Disimpan di browser Anda saja.</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Model</label>
                <select value={model} onChange={e => setModel(e.target.value)} className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-cyan-500">
                  {GROQ_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
                <button onClick={() => setShowSettings(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Batal</button>
                <button onClick={saveKey} className="rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2 text-sm font-bold text-white">Simpan</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
