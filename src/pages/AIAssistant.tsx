import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Bot, Send, KeyRound, Sparkles, Car, Wrench, Users, Package,
  TrendingUp, AlertTriangle, ExternalLink, X, Zap, Database, Loader2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

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
}

const now = () => new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const renderContent = (text: string) =>
  escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-white">$1</strong>')
    .replace(/\n/g, '<br/>');

export default function AIAssistant() {
  const { data, currentUser } = useApp();

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('groq_api_key') || '');
  const [model, setModel] = useState(() => localStorage.getItem('groq_model') || GROQ_MODELS[0].id);
  const [showSettings, setShowSettings] = useState(false);
  const [keyDraft, setKeyDraft] = useState(apiKey);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy]);

  const hasKey = apiKey.trim().length > 10;

  // ====== Smart context: detect intent and inject real data ======
  const buildContext = useMemo(() => (msg: string): string => {
    const m = msg.toLowerCase();
    const parts: string[] = [];

    parts.push(`Data real-time bengkel per ${new Date().toLocaleDateString('id-ID', { dateStyle: 'full' })}:`);
    parts.push(`- ${data.vehicles.length} kendaraan terdaftar, ${data.customers.length} pelanggan, ${data.items.length} item barang/jasa.`);

    const unpaid = data.invoices.filter(i => i.status === 'Belum Lunas');
    if (unpaid.length) {
      parts.push(`- Piutang belum lunas: ${unpaid.length} faktur, total Rp ${unpaid.reduce((s, i) => s + (i.total - i.payment), 0).toLocaleString('id-ID')}.`);
    }

    // Plate number detection (e.g. DD1486QZ)
    const plateMatch = msg.toUpperCase().match(/\b[A-Z]{1,2}\s?\d{2,4}\s?[A-Z]{1,3}\b/);
    if (plateMatch) {
      const plate = plateMatch[0].replace(/\s/g, '');
      const v = data.vehicles.find(x => x.plateNumber.replace(/\s/g, '') === plate);
      if (v) {
        parts.push(`\nDATA KENDARAAN ${v.plateNumber}:`);
        parts.push(`- ${v.brand} ${v.model} ${v.year}, warna ${v.color}.`);
        parts.push(`- Pemilik: ${v.customerName} (${v.phone}).`);
        if (v.notes) parts.push(`- Catatan: ${v.notes}.`);
        const hist = data.invoices.filter(i => i.vehicleInfo.includes(v.plateNumber) || i.customerName.includes(v.customerName));
        if (hist.length) {
          parts.push(`- Riwayat service (${hist.length}x):`);
          hist.slice(0, 5).forEach(h => parts.push(`  • ${h.date}: ${h.description} — Rp ${h.total.toLocaleString('id-ID')} (${h.status})`));
        }
        const wos = data.workOrders.filter(w => w.plateNumber === v.plateNumber);
        if (wos.length) {
          parts.push(`- Order kerja: ${wos.map(w => `${w.woNumber} (${w.status}, Rp ${w.total.toLocaleString('id-ID')})`).join('; ')}`);
        }
      } else {
        parts.push(`\nKendaraan ${plate} TIDAK ditemukan di database.`);
      }
    }

    // Phone detection
    const phoneMatch = msg.match(/\b(?:\+62|0)\d{8,12}\b/);
    if (phoneMatch) {
      const c = data.customers.find(x => x.phone.replace(/\D/g, '') === phoneMatch[0].replace(/\D/g, '').replace(/^62/, '0') || x.phone === phoneMatch[0]);
      if (c) {
        parts.push(`\nDATA PELANGGAN: ${c.name} (${c.phone}), ${c.customerCode}, alamat: ${c.address || '-'}.`);
        const vehs = data.vehicles.filter(v => v.customerName === c.name);
        if (vehs.length) parts.push(`Kendaraan: ${vehs.map(v => `${v.plateNumber} (${v.brand} ${v.model})`).join(', ')}`);
      }
    }

    // Pricing questions
    if (/(harga|biaya|tarif|berapa)/.test(m)) {
      const words = m.split(/[^a-z0-9]+/).filter(w => w.length > 3);
      const matched = data.items.filter(it =>
        words.some(w => it.name.toLowerCase().includes(w) || w.includes(it.name.toLowerCase().split(' ')[0] || '###'))
      ).slice(0, 8);
      const pool = matched.length ? matched : data.items.filter(i => i.type === 'Jasa' || i.isQuickService).slice(0, 10);
      if (pool.length) {
        parts.push('\nDAFTAR HARGA TERKAIT:');
        pool.forEach(i => parts.push(`- ${i.name} [${i.type}]: jual Rp ${i.sellingPrice.toLocaleString('id-ID')}${i.purchasePrice ? `, beli Rp ${i.purchasePrice.toLocaleString('id-ID')}` : ''}, stok ${i.stock}`));
      }
    }

    // Stock questions
    if (/(stok|persediaan|tersisa|sisa barang)/.test(m)) {
      const words = m.split(/[^a-z0-9]+/).filter(w => w.length > 3);
      let pool = data.items.filter(i => i.type === 'Persediaan');
      const matched = pool.filter(it => words.some(w => it.name.toLowerCase().includes(w)));
      if (matched.length) pool = matched;
      else pool = pool.sort((a, b) => a.stock - b.stock).slice(0, 8);
      parts.push('\nKONDISI STOK:');
      pool.forEach(i => parts.push(`- ${i.name}: ${i.stock} ${i.unit}${i.stock <= 3 ? ' ⚠️ MENIPIS' : ''}`));
    }

    // Revenue recap
    if (/(rekap|pendapatan|omzet|pemasukan|laba)/.test(m)) {
      const total = data.invoices.reduce((s, i) => s + i.payment, 0);
      parts.push(`\nREKAP KEUANGAN:`);
      parts.push(`- Total pendapatan tersimpan: Rp ${total.toLocaleString('id-ID')}`);
      parts.push(`- Faktur lunas: ${data.invoices.filter(i => i.status === 'Lunas').length}, belum lunas: ${unpaid.length}.`);
      parts.push(`- Hutang ke supplier: Rp ${data.purchaseInvoices.reduce((s, p) => s + (p.total - p.paidAmount), 0).toLocaleString('id-ID')}.`);
    }

    // AC expertise default
    if (/(tidak dingin|kurang dingin|bau|bocor|berisik|berembun)/.test(m)) {
      parts.push('\n(Konteks keahlian: berikan diagnosis khas bengkel AC mobil + rekomendasikan jasa/barang dari daftar harga di atas.)');
    }

    return parts.join('\n');
  }, [data]);

  const systemPrompt = `Kamu adalah "ASISTEN DOKTER AC" — asisten AI bengkel spesialis AC mobil "Dokter AC Mobil" (3 cabang: Perintis, Cakalang, Mamuju).
Jawab dalam Bahasa Indonesia, ringkas tapi informatif, gunakan format **tebal** untuk poin penting dan angka rupiah.
Gunakan DATA BENGKEL di bawah sebagai sumber kebenaran — jangan mengarang data kendaraan/pelanggan/harga.
${buildContext(messages.length ? messages[messages.length - 1].content : '')}`;

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
      const payload = {
        model,
        temperature: 0.4,
        max_tokens: 900,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history.slice(-10).map(m => ({ role: m.role, content: m.content })),
        ],
      };
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || `Groq error HTTP ${res.status}`);
      }
      const json = await res.json();
      const reply = json.choices?.[0]?.message?.content || 'Maaf, tidak ada jawaban.';
      setMessages(h => [...h, { role: 'assistant', content: reply, time: now() }]);
    } catch (e: any) {
      setMessages(h => [...h, { role: 'assistant', content: `⚠️ Gagal menghubungi Groq: ${e.message}`, error: true, time: now() }]);
    } finally {
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
    'Cek kendaraan DD1486QZ',
    'Berapa harga jasa flushing AC?',
    'Stok freon masih berapa?',
    'Rekap pendapatan saat ini',
    'AC mobil tidak dingin, kenapa?',
  ];

  const lowStock = data.items.filter(i => i.type === 'Persediaan' && i.stock <= 3);

  return (
    <div className="relative h-[calc(100vh-140px)] min-h-[560px]">
      {/* Ambient layered background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-cyan-200/40 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-blue-200/50 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.35]" style={{ backgroundImage: 'linear-gradient(rgba(30,64,175,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(30,64,175,.06) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
      </div>

      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-lg shadow-cyan-500/30 animate-glow">
            <Bot className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">Asisten AI Bengkel</h2>
            <p className="text-xs text-slate-500">Didukung Groq · Llama 3.3 · terhubung data real-time</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${hasKey ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            <span className={`h-2 w-2 rounded-full ${hasKey ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            {hasKey ? 'Groq Terhubung' : 'API Key Belum Diatur'}
          </span>
          <button onClick={() => { setKeyDraft(apiKey); setShowSettings(true); }} className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
            <KeyRound className="h-3.5 w-3.5" /> Pengaturan
          </button>
        </div>
      </div>

      <div className="grid h-[calc(100%-72px)] gap-4 lg:grid-cols-[300px_1fr]">
        {/* ===== Left panel ===== */}
        <aside className="hidden lg:flex flex-col gap-4 overflow-y-auto pr-1">
          {/* Data snapshot */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-bold text-slate-800">
              <Database className="h-4 w-4 text-cyan-600" /> Konteks Data Aktif
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: Car, val: data.vehicles.length, lbl: 'Kendaraan', color: 'text-blue-600 bg-blue-50' },
                { icon: Users, val: data.customers.length, lbl: 'Pelanggan', color: 'text-violet-600 bg-violet-50' },
                { icon: Package, val: data.items.length, lbl: 'Barang/Jasa', color: 'text-emerald-600 bg-emerald-50' },
                { icon: TrendingUp, val: data.invoices.length, lbl: 'Faktur', color: 'text-amber-600 bg-amber-50' },
              ].map(s => (
                <div key={s.lbl} className={`rounded-lg p-2.5 ${s.color.split(' ')[1]}`}>
                  <s.icon className={`mb-1 h-4 w-4 ${s.color.split(' ')[0]}`} />
                  <p className={`font-display text-lg font-bold ${s.color.split(' ')[0]}`}>{s.val}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{s.lbl}</p>
                </div>
              ))}
            </div>
            {lowStock.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                <p className="mb-1 flex items-center gap-1 text-[11px] font-bold text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> Stok Menipis</p>
                {lowStock.slice(0, 4).map(i => (
                  <p key={i.id} className="text-[11px] text-amber-800">• {i.name} — <b>{i.stock} {i.unit}</b></p>
                ))}
              </div>
            )}
          </div>

          {/* Quick prompts */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-bold text-slate-800">
              <Zap className="h-4 w-4 text-amber-500" /> Coba Tanyakan
            </h3>
            <div className="flex flex-col gap-2">
              {chips.map(c => (
                <button
                  key={c}
                  onClick={() => send(c)}
                  disabled={busy}
                  className="group rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-medium text-slate-700 transition-all hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-800 hover:shadow-sm disabled:opacity-50"
                >
                  <span className="mr-1 text-cyan-500 transition-transform group-hover:inline-block group-hover:translate-x-0.5">→</span>
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-blue-50 p-4">
            <p className="flex items-center gap-2 font-display text-xs font-bold text-cyan-800"><Sparkles className="h-4 w-4" /> Cara kerja</p>
            <p className="mt-1 text-[11px] leading-relaxed text-cyan-900/80">
              AI membaca data bengkel Anda secara langsung — plat nomor, harga jasa, stok, dan rekap keuangan — lalu menjawab dengan konteks nyata, bukan jawaban umum.
            </p>
          </div>
        </aside>

        {/* ===== Chat panel ===== */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl shadow-slate-900/30">
          {/* Chat header strip */}
          <div className="flex items-center justify-between border-b border-slate-700/60 bg-slate-800/60 px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Wrench className="h-3.5 w-3.5 text-cyan-400" />
              <span className="font-mono">{currentUser?.name} @ Dokter AC Mobil</span>
            </div>
            <span className="font-mono text-[10px] text-slate-500">{GROQ_MODELS.find(m => m.id === model)?.label || model}</span>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
            {messages.length === 0 && !busy && (
              <div className="flex h-full flex-col items-center justify-center text-center animate-msg-in">
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-xl shadow-cyan-500/25 animate-glow">
                  <Bot className="h-10 w-10 text-white" />
                </div>
                <h3 className="font-display text-xl font-bold text-white">Halo, {currentUser?.name?.split(' ')[0]}! 👋</h3>
                <p className="mt-1 max-w-sm text-sm text-slate-400">
                  {hasKey
                    ? 'Tanyakan apa saja tentang kendaraan, harga jasa, stok, atau rekap keuangan bengkel.'
                    : 'Atur API Key Groq gratis dulu untuk mulai mengobrol.'}
                </p>
                {!hasKey && (
                  <button onClick={() => setShowSettings(true)} className="mt-4 flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-900 transition-colors hover:bg-cyan-400">
                    <KeyRound className="h-4 w-4" /> Dapatkan Key Gratis
                  </button>
                )}
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {chips.slice(0, 3).map(c => (
                    <button key={c} onClick={() => send(c)} disabled={!hasKey || busy} className="rounded-full border border-slate-600 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-300 transition-all hover:-translate-y-0.5 hover:border-cyan-500 hover:text-cyan-300 disabled:opacity-40">
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex animate-msg-in ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="mr-2 mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 shadow-md shadow-cyan-500/20">
                    <Bot className="h-4.5 w-4.5 h-5 w-5 text-white" />
                  </div>
                )}
                <div className={`max-w-[78%] ${msg.role === 'user' ? '' : ''}`}>
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-md ${
                      msg.role === 'user'
                        ? 'rounded-br-sm bg-blue-600 text-white shadow-blue-900/40'
                        : msg.error
                        ? 'rounded-bl-sm border border-red-500/40 bg-red-950/60 text-red-200'
                        : 'rounded-bl-sm border-l-2 border-cyan-400 bg-slate-800 text-slate-200 shadow-slate-950/50'
                    }`}
                    dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }}
                  />
                  <p className={`mt-1 text-[10px] text-slate-500 ${msg.role === 'user' ? 'text-right' : ''}`}>{msg.time}</p>
                </div>
              </div>
            ))}

            {busy && (
              <div className="flex animate-msg-in">
                <div className="mr-2 mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border-l-2 border-cyan-400 bg-slate-800 px-4 py-3.5 shadow-md">
                  <span className="typing-dot h-2 w-2 rounded-full bg-cyan-400" />
                  <span className="typing-dot h-2 w-2 rounded-full bg-cyan-400" />
                  <span className="typing-dot h-2 w-2 rounded-full bg-cyan-400" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-slate-700/60 bg-slate-800/60 p-3">
            <div className="flex items-end gap-2">
              <div className="relative flex-1">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  rows={1}
                  placeholder={hasKey ? 'Tanya soal kendaraan, harga jasa, stok… (Enter untuk kirim)' : 'Atur API Key dulu di Pengaturan…'}
                  className="w-full resize-none rounded-xl border border-slate-600 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none transition-colors focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30"
                />
              </div>
              <button
                onClick={() => send()}
                disabled={busy || !input.trim()}
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 text-white shadow-lg shadow-cyan-500/25 transition-all hover:scale-105 hover:shadow-cyan-500/40 disabled:opacity-40 disabled:hover:scale-100"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-slate-500">
              Jawaban AI bisa keliru — verifikasi data penting di menu terkait.
            </p>
          </div>
        </section>
      </div>

      {/* ===== Settings modal ===== */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md animate-msg-in rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between rounded-t-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-4 text-white">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                <h3 className="font-display text-lg font-bold">Pengaturan Groq AI</h3>
              </div>
              <button onClick={() => setShowSettings(false)} className="rounded-lg p-1.5 hover:bg-white/20"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4 p-6">
              <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-xs text-cyan-900">
                <p className="mb-1 font-bold">Dapatkan API Key gratis (2 menit):</p>
                <ol className="list-inside list-decimal space-y-0.5">
                  <li>Buka <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="font-semibold underline">console.groq.com/keys</a> <ExternalLink className="ml-0.5 inline h-3 w-3" /></li>
                  <li>Sign up dengan Google → klik <b>Create API Key</b></li>
                  <li>Copy key (diawali <code className="rounded bg-white px-1">gsk_...</code>) & paste di bawah</li>
                </ol>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Groq API Key</label>
                <input
                  type="password"
                  value={keyDraft}
                  onChange={e => setKeyDraft(e.target.value)}
                  placeholder="gsk_xxxxxxxxxxxx"
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 font-mono text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30"
                />
                <p className="mt-1 text-[11px] text-slate-500">Disimpan hanya di browser Anda (localStorage), tidak dikirim ke server lain.</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Model AI</label>
                <select value={model} onChange={e => setModel(e.target.value)} className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-cyan-500">
                  {GROQ_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
                <button onClick={() => setShowSettings(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Batal</button>
                <button onClick={saveKey} className="rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2 text-sm font-bold text-white shadow-md hover:opacity-90">Simpan</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
