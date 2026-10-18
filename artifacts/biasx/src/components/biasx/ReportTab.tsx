import { CheckCircle, Download, FileDown } from "lucide-react";
import type { AuditResult, ParsedData, TargetInfo } from "@/lib/audit";

interface Props {
  data: ParsedData | null;
  results: AuditResult[];
  target: string;
  targetInfo: TargetInfo | null;
  onDownload: () => void;
  busy: boolean;
  error: string;
}

export function ReportTab({ data, results, target, targetInfo, onDownload, busy, error }: Props) {
  const flagged = results.filter(r => r.risk === "high");
  const medium = results.filter(r => r.risk === "medium");
  const low = results.filter(r => r.risk === "low");

  const recs: string[] = [];
  flagged.forEach(r => out(recs, `Review "${r.name}" before training — flagged HIGH. ${r.triggers[0] ?? ""}`.trim()));
  medium.forEach(r => out(recs, `Review "${r.name}" — flagged MEDIUM. Decide whether it is strictly necessary for the model's purpose.`));
  if (flagged.length > 0 || medium.length > 0) {
    out(recs, "Run demographic parity and equalized odds checks before deploying any model trained on this data.");
    out(recs, "Document all feature inclusion decisions in a Model Card or Datasheets for Datasets.");
    out(recs, "Have a diverse team review the dataset and model outputs before production deployment.");
  }

  return (
    <div className="p-4 sm:p-5 space-y-4">
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-xl p-4 sm:p-5 flex flex-wrap items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
          <FileDown className="w-6 h-6 text-white" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <h2 className="text-sm font-bold text-white">Download Full PDF Report</h2>
          <p className="text-xs text-indigo-200 mt-0.5">Executive Summary · Feature Risk Table (all columns) · Recommendations</p>
        </div>
        <button type="button" onClick={onDownload} disabled={!data || busy} data-testid="button-download-pdf"
          className="flex items-center gap-2 px-4 py-2 bg-white text-indigo-700 rounded-lg text-sm font-semibold hover:bg-indigo-50 active:scale-95 transition-all shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">
          <Download className="w-4 h-4" aria-hidden="true" /> {busy ? "Preparing..." : "Download PDF"}
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      {!data && <p className="text-xs text-gray-500">Load a dataset to generate a report. Nothing is uploaded; the PDF is built in your browser.</p>}

      {data && (
        <>
          <section className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5">
              <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide">📄 Executive Summary</h3>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                  <div className="text-3xl font-bold text-red-600">{flagged.length}</div>
                  <div className="text-xs text-red-600 font-medium mt-0.5">High Risk</div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                  <div className="text-3xl font-bold text-amber-500">{medium.length}</div>
                  <div className="text-xs text-amber-600 font-medium mt-0.5">Medium Risk</div>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                  <div className="text-3xl font-bold text-emerald-600">{low.length}</div>
                  <div className="text-xs text-emerald-600 font-medium mt-0.5">Low Risk</div>
                </div>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                Audited <strong>{results.length} features</strong> in <strong>{data.fileName}</strong> (including categorical columns) against <code className="bg-indigo-50 text-indigo-700 px-1 rounded">{target}</code>.
                {flagged.length > 0 && <span className="text-red-700 font-medium"> {flagged.length} feature{flagged.length > 1 ? "s were" : " was"} flagged HIGH and should be reviewed first.</span>}
                {medium.length > 0 && <span className="text-amber-700 font-medium"> {medium.length} feature{medium.length > 1 ? "s were" : " was"} flagged MEDIUM.</span>}
                {flagged.length === 0 && medium.length === 0 && <span className="text-emerald-700 font-medium"> No features were flagged at the current settings.</span>}
              </p>
              <p className="text-xs text-gray-500 leading-relaxed mt-2">
                {targetInfo?.note} Flags are signals for review, not proof of bias; a low-risk result does not show fairness.
              </p>
            </div>
          </section>

          {(flagged.length > 0 || medium.length > 0) && (
            <section className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5">
                <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide">🚩 Flagged Variables</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {[...flagged, ...medium].map(r => (
                  <div key={r.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${r.risk === "high" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                      {r.risk === "high" ? "HIGH" : "MEDIUM"}
                    </span>
                    <code className="text-xs font-mono text-gray-800 font-semibold">{r.name}</code>
                    {r.isEncoded && <span className="text-xs text-gray-400">categorical</span>}
                    <div className="flex items-center gap-3 ml-auto text-xs text-gray-500 font-mono">
                      <span>r={r.pearsonApplicable ? r.corr.toFixed(3) : "N/A"}</span>
                      <span>MI={r.mi.toFixed(3)}</span>
                      {r.disp != null && <span>gap={(r.disp * 100).toFixed(1)}%</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {recs.length > 0 && (
            <section className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5">
                <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide">✅ Recommendations</h3>
              </div>
              <ol className="p-4 space-y-2.5">
                {recs.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-xs text-gray-600 leading-relaxed">
                    <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {recs.length === 0 && results.length > 0 && (
            <p className="flex items-center gap-2 text-xs text-gray-500"><CheckCircle className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" /> No recommendations triggered. Continue to test model outputs for group differences after training.</p>
          )}
        </>
      )}
    </div>
  );
}

function out(list: string[], s: string) { list.push(s); }
