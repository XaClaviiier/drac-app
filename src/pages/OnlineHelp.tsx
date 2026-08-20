import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  BookOpen,
  Boxes,
  ChevronRight,
  CircleHelp,
  FileText,
  Search,
  ShieldCheck,
  ShoppingCart,
  Wrench,
  X,
} from "lucide-react";
import { helpArticles, helpCategories } from "../data/helpArticles";

const categoryIcons: Record<string, typeof BookOpen> = {
  "Mulai Menggunakan": BookOpen,
  "Servis & WO": Wrench,
  Penjualan: FileText,
  Pembelian: ShoppingCart,
  Persediaan: Boxes,
  "Kas & Bank": FileText,
  Laporan: FileText,
  Administrasi: ShieldCheck,
};

const normalize = (value: string) => value.toLocaleLowerCase("id-ID").trim();

export default function OnlineHelp() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(params.get("category") || "Semua");
  const selectedId = params.get("article");
  const selected = helpArticles.find((article) => article.id === selectedId) || null;

  const filtered = useMemo(() => {
    const needle = normalize(query);
    return helpArticles.filter((article) => {
      if (category !== "Semua" && article.category !== category) return false;
      if (!needle) return true;
      const haystack = normalize(
        [
          article.title,
          article.summary,
          article.category,
          ...article.keywords,
          ...article.sections.flatMap((section) => [
            section.title,
            ...(section.paragraphs || []),
            ...(section.steps || []),
            ...(section.rules || []),
          ]),
        ].join(" "),
      );
      return haystack.includes(needle);
    });
  }, [category, query]);

  const chooseCategory = (next: string) => {
    setCategory(next);
    const nextParams = new URLSearchParams(params);
    nextParams.delete("article");
    if (next === "Semua") nextParams.delete("category");
    else nextParams.set("category", next);
    setParams(nextParams);
  };

  const openArticle = (id: string) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set("article", id);
    setParams(nextParams);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (selected) {
    return (
      <div className="min-h-full bg-[#f5f7fa]">
        <div className="border-b border-blue-900 bg-[#0b376e] px-4 py-5 text-white sm:px-7">
          <button onClick={() => chooseCategory(selected.category)} className="mb-3 text-sm text-blue-100 hover:text-white">← Kembali ke Dokumentasi</button>
          <p className="text-xs font-semibold uppercase tracking-wider text-cyan-200">{selected.category}</p>
          <h1 className="mt-1 max-w-4xl text-2xl font-bold sm:text-3xl">{selected.title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-100">{selected.summary}</p>
        </div>
        <main className="mx-auto max-w-5xl p-3 sm:p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-xs text-gray-500">
            <div className="flex flex-wrap items-center gap-2"><span>Terakhir diperbarui: {selected.updatedAt}</span><span className={`rounded-full px-2 py-1 font-semibold ${selected.sources?.length ? "bg-cyan-50 text-cyan-800" : "bg-slate-100 text-slate-700"}`}>{selected.sources?.length ? "Pedoman Accurate + Adaptasi DRAC" : "Aturan Operasional DRAC"}</span></div>
            {selected.route && <button onClick={() => navigate(selected.route!)} className="font-semibold text-blue-700 hover:underline">Buka modul terkait →</button>}
          </div>
          <article className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-7">
            {selected.sections.map((section, sectionIndex) => (
              <section key={`${section.title}-${sectionIndex}`} className={sectionIndex ? "border-t border-gray-100 pt-5" : ""}>
                <h2 className="text-lg font-bold text-gray-900">{section.title}</h2>
                {section.paragraphs?.map((paragraph) => <p key={paragraph} className="mt-2 text-sm leading-7 text-gray-700">{paragraph}</p>)}
                {section.steps && <ol className="mt-3 space-y-3">{section.steps.map((step, index) => <li key={step} className="flex gap-3 text-sm leading-6 text-gray-700"><span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{index + 1}</span><span>{step}</span></li>)}</ol>}
                {section.rules && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-800">Aturan penting</p><ul className="space-y-2">{section.rules.map((rule) => <li key={rule} className="flex gap-2 text-sm leading-6 text-amber-950"><span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500"/><span>{rule}</span></li>)}</ul></div>}
              </section>
            ))}
            {selected.sources?.length && <section className="border-t border-gray-100 pt-5"><h2 className="text-lg font-bold text-gray-900">Sumber Pedoman</h2><p className="mt-1 text-sm leading-6 text-gray-600">Manual resmi Accurate digunakan sebagai referensi pola kerja. Ketentuan yang berbeda karena kebutuhan bengkel DRAC dijelaskan pada artikel.</p><div className="mt-3 space-y-2">{selected.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-800 hover:bg-blue-100"><span>{source.label}</span><span aria-hidden="true">↗</span></a>)}</div></section>}
          </article>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#f5f7fa]">
      <section className="bg-[#0b376e] px-4 py-7 text-white sm:px-7 sm:py-10">
        <div className="mx-auto max-w-6xl text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/10"><BookOpen className="h-6 w-6"/></div>
          <h1 className="mt-3 text-2xl font-bold sm:text-3xl">Dokumentasi DRAC Online</h1>
          <p className="mt-2 text-sm text-blue-100">Temukan cara pemakaian, aturan transaksi, dan alur kerja setiap modul.</p>
          <div className="relative mx-auto mt-5 max-w-2xl">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"/>
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari: hapus faktur, stok opname, transfer gudang..." className="h-12 w-full rounded-lg border-0 bg-white pl-12 pr-11 text-sm text-gray-900 shadow-lg outline-none ring-blue-300 focus:ring-2"/>
            {query && <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4"/></button>}
          </div>
        </div>
      </section>

      <main className="mx-auto grid max-w-7xl gap-4 p-3 sm:p-6 lg:grid-cols-[250px_1fr]">
        <aside className="h-fit rounded-lg border border-gray-200 bg-white p-2 shadow-sm lg:sticky lg:top-3">
          <button onClick={() => chooseCategory("Semua")} className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm ${category === "Semua" ? "bg-blue-700 font-semibold text-white" : "text-gray-700 hover:bg-blue-50"}`}><span>Semua Artikel</span><span>{helpArticles.length}</span></button>
          {helpCategories.map((name) => {
            const Icon = categoryIcons[name] || CircleHelp;
            const count = helpArticles.filter((article) => article.category === name).length;
            return <button key={name} onClick={() => chooseCategory(name)} className={`mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm ${category === name ? "bg-blue-700 font-semibold text-white" : "text-gray-700 hover:bg-blue-50"}`}><Icon className="h-4 w-4 flex-shrink-0"/><span className="flex-1">{name}</span><span className="text-xs opacity-70">{count}</span></button>;
          })}
        </aside>

        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div><h2 className="text-xl font-bold text-gray-900">{query ? `Hasil pencarian “${query}”` : category === "Semua" ? "Semua Panduan" : category}</h2><p className="text-sm text-gray-500">{filtered.length} artikel ditemukan</p></div>
          </div>
          {filtered.length ? <div className="grid gap-3 md:grid-cols-2">{filtered.map((article) => (
            <button key={article.id} onClick={() => openArticle(article.id)} className="group rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md">
              <div className="flex items-start gap-3"><span className="rounded-lg bg-blue-50 p-2 text-blue-700"><BookOpen className="h-5 w-5"/></span><div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-wide text-blue-600">{article.category}</p><h3 className="mt-1 font-bold text-gray-900 group-hover:text-blue-700">{article.title}</h3><p className="mt-2 text-sm leading-6 text-gray-600">{article.summary}</p></div><ChevronRight className="mt-2 h-5 w-5 flex-shrink-0 text-gray-300 group-hover:text-blue-600"/></div>
            </button>
          ))}</div> : <div className="rounded-lg border border-dashed border-gray-300 bg-white px-5 py-14 text-center"><CircleHelp className="mx-auto h-10 w-10 text-gray-300"/><h3 className="mt-3 font-bold text-gray-700">Panduan tidak ditemukan</h3><p className="mt-1 text-sm text-gray-500">Coba kata kunci lain atau pilih Semua Artikel.</p></div>}
        </section>
      </main>
    </div>
  );
}
