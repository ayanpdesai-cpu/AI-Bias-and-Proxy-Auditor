import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  BarChart2, FileDown, FileText, X,
} from "lucide-react";
import { auditDataset, buildData, CsvError, getTargetInfo, setColumnType, type ColumnType, type ParsedData } from "@/lib/audit";
import { EXAMPLE_DATASETS } from "@/lib/examples";
import { BiasXLogo } from "@/components/biasx/BiasXLogo";
import { Splash } from "@/components/biasx/Splash";
import { ProxyInfoBanner } from "@/components/biasx/ProxyInfoBanner";
import { Sidebar } from "@/components/biasx/Sidebar";
import { AuditTab } from "@/components/biasx/AuditTab";
import { ReportTab } from "@/components/biasx/ReportTab";
import { PreviewTab } from "@/components/biasx/PreviewTab";
import { FeatureRiskChart } from "@/components/biasx/FeatureRiskChart";
import { CorrelationHeatmap } from "@/components/biasx/CorrelationHeatmap";

type TabId = "audit" | "viz" | "report" | "preview";
const TABS = [
  { id: "audit", label: "🔍 Audit Results" },
  { id: "viz", label: "📊 Visualizations" },
  { id: "report", label: "📋 Download Report" },
  { id: "preview", label: "🗂️ Data Preview" },
] as const;

const CHIPS = [
  { icon: "📐", title: "Pearson", sub: "Linear bias" },
  { icon: "🔗", title: "Mutual Info", sub: "Non-linear" },
  { icon: "⚖️", title: "Group Disparity", sub: "Outcome gaps" },
  { icon: "🏷️", title: "Protected Names", sub: "70+ attribute list" },
  { icon: "🔡", title: "Categorical", sub: "Non-numeric columns too" },
];

const MAX_BYTES = 10 * 1024 * 1024;

export default function Home() {
  const [data, setData] = useState<ParsedData | null>(null);
  const [targetCol, setTargetCol] = useState("");
  const [threshold, setThreshold] = useState(0.75);
  const [tab, setTab] = useState<TabId>("audit");
  const [error, setError] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const target = data && data.columns.includes(targetCol) ? targetCol : data?.columns[data.columns.length - 1] ?? "";

  const results = useMemo(() => (data && target ? auditDataset(data, target, threshold) : []), [data, target, threshold]);
  const targetInfo = useMemo(() => (data && target ? getTargetInfo(data, target) : null), [data, target]);
  const counts = useMemo(() => results.length === 0 ? null : {
    high: results.filter(r => r.risk === "high").length,
    medium: results.filter(r => r.risk === "medium").length,
    low: results.filter(r => r.risk === "low").length,
  }, [results]);

  const loadExample = useCallback((id: string) => {
    const ex = EXAMPLE_DATASETS.find(e => e.id === id);
    if (!ex) return;
    try {
      setData(buildData(ex.csv, ex.fileName));
      setTargetCol(ex.target);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this example.");
    }
  }, []);

  const handleFile = useCallback((file: File) => {
    setError("");
    if (!/\.csv$/i.test(file.name)) { setError("Only .csv files are supported. Export your data as CSV and try again."); return; }
    if (file.size === 0) { setError("The file is empty."); return; }
    if (file.size > MAX_BYTES) { setError("This file is larger than 10 MB. Use a smaller sample of the dataset."); return; }
    const reader = new FileReader();
    reader.onerror = () => setError("The browser could not read this file.");
    reader.onload = e => {
      try {
        const d = buildData(String(e.target?.result ?? ""), file.name);
        setData(d);
        setTargetCol(d.columns[d.columns.length - 1]);
      } catch (err) {
        setError(err instanceof CsvError ? err.message : "Something went wrong while reading this CSV.");
      }
    };
    reader.readAsText(file);
  }, []);

  const onType = useCallback((col: string, t: ColumnType) => {
    setData(prev => (prev ? setColumnType(prev, col, t) : prev));
  }, []);

  const clear = () => { setData(null); setTargetCol(""); setError(""); setPdfError(""); };

  const download = async () => {
    if (!data) return;
    setPdfBusy(true); setPdfError("");
    try {
      const { generatePDF } = await import("@/lib/pdf");
      generatePDF(data.fileName, results, target, threshold, targetInfo?.note ?? "");
    } catch {
      setPdfError("The PDF could not be generated. Try again.");
    } finally {
      setPdfBusy(false);
    }
  };

  const onTabKey = (e: KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    setTab(next.id);
    tabRefs.current[next.id]?.focus();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-['Inter']">
      <Splash />

      <header className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3 shrink-0 shadow-sm">
        <div className="flex items-center gap-2 mr-1">
          <BiasXLogo size={32} />
          <div className="hidden sm:block leading-none">
            <span className="text-base font-extrabold tracking-tight" style={{ color: "#4f46e5" }}>Bias</span>
            <span className="text-base font-extrabold tracking-tight text-red-500">X</span>
          </div>
        </div>
        <div className="flex-1" />
        {data && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-xs font-medium text-emerald-700 max-w-[260px] min-w-0">
            <FileText className="w-3 h-3 shrink-0" aria-hidden="true" /><span className="truncate">{data.fileName}</span>
            <button type="button" onClick={clear} aria-label="Remove dataset" data-testid="button-clear-dataset" className="ml-1 text-emerald-500 hover:text-emerald-800"><X className="w-3 h-3" /></button>
          </div>
        )}
        <button type="button" onClick={download} disabled={!data || pdfBusy} data-testid="button-export-pdf"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          <FileDown className="w-3.5 h-3.5" aria-hidden="true" /> Export PDF
        </button>
      </header>

      <div className="flex flex-col md:flex-row flex-1 min-h-0">
        <Sidebar data={data} error={error} onFile={handleFile} onExample={loadExample} target={target} onTarget={setTargetCol}
          threshold={threshold} onThreshold={setThreshold} counts={counts} />

        <main className="flex-1 flex flex-col min-w-0 md:overflow-auto">
          <div className="p-3 sm:p-5 space-y-4">
            <section className="bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 rounded-2xl p-4 sm:p-5 shadow-md">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="shrink-0"><BiasXLogo size={44} /></div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-lg font-extrabold text-white tracking-tight leading-tight">
                    Bias<span className="text-red-300">X</span> — AI Bias &amp; Proxy Variable Auditor
                  </h1>
                  <p className="text-sm text-indigo-200 mt-1 leading-relaxed">
                    Upload your training dataset and BiasX detects hidden bias signals across <strong className="text-white">every column</strong> — numeric and categorical — <em>before</em> you train, so you ship fair AI with confidence.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {CHIPS.map(({ icon, title, sub }) => (
                      <div key={title} className="flex items-center gap-1.5 bg-white/10 rounded-lg px-2.5 py-1.5">
                        <span className="text-sm" aria-hidden="true">{icon}</span>
                        <div>
                          <p className="text-xs font-semibold text-white leading-none">{title}</p>
                          <p className="text-xs text-indigo-300 leading-none mt-0.5">{sub}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <ProxyInfoBanner open={showInfo} onToggle={() => setShowInfo(v => !v)} />

            {data && data.notes.length > 0 && (
              <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                <span>Data quality: some values are missing or excluded from calculations.</span>
                <button type="button" onClick={() => setTab("preview")} className="font-semibold underline underline-offset-2">
                  Review {data.notes.length} data note{data.notes.length === 1 ? "" : "s"}
                </button>
              </div>
            )}

            <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div role="tablist" aria-label="Audit sections" className="flex border-b border-gray-200 overflow-x-auto">
                {TABS.map((t, i) => (
                  <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`}
                    tabIndex={tab === t.id ? 0 : -1} data-testid={`tab-${t.id}`}
                    ref={el => { tabRefs.current[t.id] = el; }}
                    onClick={() => setTab(t.id)} onKeyDown={e => onTabKey(e, i)}
                    className={`px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 shrink-0 ${tab === t.id ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                    {t.label}
                  </button>
                ))}
              </div>

              <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
                {tab === "audit" && <AuditTab results={results} threshold={threshold} targetInfo={targetInfo} hasData={!!data} />}
                {tab === "viz" && (
                  <div className="p-4 sm:p-5 space-y-8">
                    {data && results.length >= 1 ? (
                      <>
                        <FeatureRiskChart results={results} currentTarget={target} />
                        <div className="border-t border-gray-100 pt-6">
                          <CorrelationHeatmap data={data} cols={[...data.columns]} />
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-3 p-8 text-gray-400">
                        <BarChart2 className="w-8 h-8 shrink-0" aria-hidden="true" />
                        <p className="text-sm">Load a dataset with at least 2 columns to see visualizations.</p>
                      </div>
                    )}
                  </div>
                )}
                {tab === "report" && <ReportTab data={data} results={results} target={target} targetInfo={targetInfo} onDownload={download} busy={pdfBusy} error={pdfError} />}
                {tab === "preview" && <PreviewTab data={data} target={target} onType={onType} />}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
