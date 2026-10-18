import { jsPDF } from "jspdf";
import type { AuditResult } from "@/lib/audit";
import { isSensitive } from "@/lib/knowledge";

// ── PDF generation ─────────────────────────────────────────────────────────
export function buildPDF(fileName: string, results: AuditResult[], currentTarget: string, threshold: number, targetNote = "") {
  const doc  = new jsPDF({ unit: "mm", format: "a4" });
  const W    = 210;
  const ML   = 14;        // left margin
  const MR   = 14;        // right margin
  const CW   = W - ML - MR;  // 182 mm usable content width
  const PAGE_H     = 297;
  const SAFE_BOTTOM = PAGE_H - 16; // keep 16 mm for footer

  const flagged = results.filter(r => r.risk === "high");
  const medium  = results.filter(r => r.risk === "medium");
  const safe    = results.filter(r => r.risk === "low");
  const today   = new Date().toLocaleDateString("en-US", { dateStyle: "long" });

  // ── helpers ────────────────────────────────────────────────────────────
  /** Set font + colour */
  const S = (
    size: number,
    style: "normal" | "bold" = "normal",
    rgb: [number, number, number] = [50, 50, 50],
  ) => { doc.setFontSize(size); doc.setFont("helvetica", style); doc.setTextColor(...rgb); };

  /** Wrap text to maxW mm at given size — always set font first so metrics are correct */
  const wrap = (text: string, maxW: number, size: number, style: "normal" | "bold" = "normal"): string[] => {
    doc.setFontSize(size); doc.setFont("helvetica", style);
    return doc.splitTextToSize(text, maxW) as string[];
  };

  /** Height of one text line for a given font size (mm) */
  const lh = (size: number) => size * 0.42;

  /** Ensure `needed` mm is available below y; if not, add a page and return new y */
  const need = (needed: number, y: number): number => {
    if (y + needed <= SAFE_BOTTOM) return y;
    doc.addPage();
    doc.setFillColor(55, 48, 163); doc.rect(0, 0, W, 10, "F");
    S(7, "normal", [199, 210, 254]);
    doc.text("BiasX  —  AI Bias & Proxy Variable Audit Report (continued)", ML, 7);
    return 18;
  };

  /** Draw the table column-header row and return updated ty */
  const drawTableHeader = (ty: number): number => {
    doc.setFillColor(235, 237, 245); doc.rect(ML, ty, CW, 8, "F");
    doc.setDrawColor(180, 190, 210); doc.setLineWidth(0.25);
    doc.rect(ML, ty, CW, 8, "S");
    S(7, "bold", [60, 70, 90]);
    TC.forEach(c => doc.text(c.l, c.x + 1.5, ty + 5.5));
    return ty + 8;
  };

  // ── Table column layout — widths MUST sum exactly to CW (182) ──────────
  //  Feature 40 | Type 17 | Risk 19 | Pearson 20 | MI 20 | Disp 19 | Signal 47 = 182
  const TC = [
    { l: "Feature",    x: ML,       w: 40 },
    { l: "Type",       x: ML + 40,  w: 17 },
    { l: "Risk",       x: ML + 57,  w: 19 },
    { l: "Pearson r",  x: ML + 76,  w: 20 },
    { l: "MI (bits)",  x: ML + 96,  w: 20 },
    { l: "Disparity",  x: ML + 116, w: 19 },
    { l: "Signal",     x: ML + 135, w: 47 },
  ];
  // Verify sum at runtime (dev sanity check)
  // console.assert(TC.reduce((a,c)=>a+c.w,0)===CW);

  // ════════════════════════════════════════════════════════════════════════
  // PAGE 1 — Executive Summary
  // ════════════════════════════════════════════════════════════════════════

  // ── Header bar ──────────────────────────────────────────────────────────
  doc.setFillColor(37, 31, 136); doc.rect(0, 0, W, 48, "F");
  doc.setFillColor(99, 102, 241); doc.rect(0, 46, W, 2, "F");

  // Logo badge
  doc.setFillColor(79, 70, 229);  doc.roundedRect(ML, 9, 22, 22, 4, 4, "F");
  doc.setFillColor(239, 68, 68);  doc.circle(ML + 17.5, 12, 5.5, "F");
  S(7.5, "bold", [255, 255, 255]);
  doc.text("BX", ML + 17.5, 13.5, { align: "center" });

  const hx = ML + 26;
  S(19, "bold", [255, 255, 255]);  doc.text("BiasX", hx, 19);
  S(9.5, "normal", [199, 210, 254]); doc.text("AI Bias & Proxy Variable Audit Report", hx, 27);

  // Metadata — two short lines, safely within right margin
  const maxMetaW = W - hx - MR - 2;
  S(7.5, "normal", [180, 190, 220]);
  const meta1 = wrap(`Date: ${today}   |   Dataset: ${fileName}   |   Target: ${currentTarget}`, maxMetaW, 7.5);
  const meta2 = wrap(` threshold: ${threshold.toFixed(2)}   |   Features audited: ${results.length}`, maxMetaW, 7.5);
  doc.text(meta1, hx, 34);
  doc.text(meta2, hx, 34 + meta1.length * lh(7.5) + 2);

  // ── Stat boxes ──────────────────────────────────────────────────────────
  let y = 56;
  const bW = Math.floor((CW - 8) / 3);
  const statBoxes = [
    { count: flagged.length, label: "High Risk",   sub: "Review first",  bg: [254,242,242] as [number,number,number], fg: [185,28,28] as [number,number,number],  bdr: [252,165,165] as [number,number,number] },
    { count: medium.length,  label: "Medium Risk", sub: "Worth a closer look",      bg: [255,251,235] as [number,number,number], fg: [146,64,14] as [number,number,number],  bdr: [251,191,36] as [number,number,number]  },
    { count: safe.length,    label: "Low Risk",     sub: "Not flagged by these signals",  bg: [240,253,244] as [number,number,number], fg: [21,128,61] as [number,number,number],  bdr: [134,239,172] as [number,number,number] },
  ];
  statBoxes.forEach((b, i) => {
    const bx = ML + i * (bW + 4);
    doc.setFillColor(...b.bg); doc.roundedRect(bx, y, bW, 26, 3, 3, "F");
    doc.setDrawColor(...b.bdr); doc.setLineWidth(0.4);
    doc.roundedRect(bx, y, bW, 26, 3, 3, "S");
    S(22, "bold", b.fg); doc.text(String(b.count), bx + bW / 2, y + 14, { align: "center" });
    S(8,  "bold", b.fg); doc.text(b.label, bx + bW / 2, y + 20, { align: "center" });
    S(7,  "normal", b.fg); doc.text(b.sub, bx + bW / 2, y + 25, { align: "center" });
  });
  y += 34;

  // ── Overview paragraph ──────────────────────────────────────────────────
  S(11, "bold", [25, 25, 25]); doc.text("Overview", ML, y); y += 7;
  const overviewLines = wrap(
    `This report audits ${results.length} feature${results.length !== 1 ? "s" : ""} from "${fileName}" against the target "${currentTarget}" using four screening signals: Pearson Correlation (linear), Mutual Information (non-linear), Group Disparity (outcome rate gaps between groups, binary outcomes only), and Sensitive Attribute Detection (name-based matching against 70+ known protected fields). Pearson risk threshold: ${threshold.toFixed(2)}. ${targetNote} Missing values and invalid NUM values are excluded per feature/target pair. A flag is a signal for human review, not proof of bias, and a low-risk result does not show that a feature is fair.`,
    CW, 9,
  );
  S(9, "normal", [70, 70, 70]); doc.text(overviewLines, ML, y);
  y += overviewLines.length * lh(9) + 9;

  // ── Proxy variable callout box ──────────────────────────────────────────
  const proxyBody = wrap(
    "A proxy variable is a column that does not directly measure a protected characteristic, but is statistically correlated with one. Example: ZIP code never mentions race, but due to historical residential segregation it strongly predicts it. A model trained on ZIP codes can discriminate by race without ever seeing a race column. Common proxies: last name (ethnicity), parental status (gender), neighbourhood (race/income), criminal record (race), insurance type (income).",
    CW - 12, 8.5,
  );
  const proxyBoxH = 8 + lh(9) + 2 + proxyBody.length * lh(8.5) + 7;
  y = need(proxyBoxH + 6, y);
  doc.setFillColor(238, 242, 255); doc.roundedRect(ML, y, CW, proxyBoxH, 3, 3, "F");
  doc.setDrawColor(199, 210, 254); doc.setLineWidth(0.3);
  doc.roundedRect(ML, y, CW, proxyBoxH, 3, 3, "S");
  doc.setFillColor(79, 70, 229); doc.roundedRect(ML, y, 4, proxyBoxH, 1.5, 1.5, "F");
  S(9, "bold", [55, 48, 163]);   doc.text("What is a Proxy Variable?", ML + 8, y + 7);
  S(8.5, "normal", [67, 56, 202]); doc.text(proxyBody, ML + 8, y + 7 + lh(9) + 2);
  y += proxyBoxH + 9;

  // ── Detection methods ───────────────────────────────────────────────────
  y = need(52, y);
  S(11, "bold", [25, 25, 25]); doc.text("Detection Methods", ML, y); y += 7;
  const methods = [
    ["Pearson Correlation",  "Absolute linear correlation (r) between a feature and the target, for numeric columns and binary categories. Reported as N/A for nominal categories with more than two values, because no meaningful ordering exists. Values at or above the threshold trigger HIGH risk."],
    ["Mutual Information",   "Quantifies statistical dependence, including non-linear patterns, in bits. Respects each column's NUM or CAT type: numeric columns are binned, categories are used as-is."],
    ["Group Disparity",      "For binary outcomes only (mapped to 0/1) and features with 12 or fewer groups, the maximum minus minimum outcome rate across groups. This is a rate gap, not the four-fifths selection ratio."],
    ["Sensitive Attribute",  "Flags columns whose names match a curated library of 70+ known protected or proxy attribute names, regardless of numeric scores."],
  ];
  methods.forEach(([title, desc]) => {
    const descLines = wrap(desc, CW - 8, 8.5);
    const blockH = lh(9) + 1.5 + descLines.length * lh(8.5) + 4;
    y = need(blockH + 2, y);
    S(8.5, "bold", [55, 65, 81]); doc.text(title + ":", ML + 3, y);
    y += lh(8.5) + 1.5;
    S(8.5, "normal", [90, 90, 90]); doc.text(descLines, ML + 5, y);
    y += descLines.length * lh(8.5) + 4;
  });

  // ════════════════════════════════════════════════════════════════════════
  // PAGE 2 — Feature Risk Table
  // ════════════════════════════════════════════════════════════════════════
  doc.addPage();
  doc.setFillColor(37, 31, 136); doc.rect(0, 0, W, 16, "F");
  S(13, "bold", [255, 255, 255]); doc.text("Feature Risk Analysis", ML, 11);
  // Right-side subtitle — safe within MR
  const subtitleText = `${results.length} features  |  target: ${currentTarget}  |  threshold: ${threshold.toFixed(2)}`;
  const subtitleLines = wrap(subtitleText, W - ML - MR - 80, 7.5, "normal");
  S(7.5, "normal", [199, 210, 254]);
  doc.text(subtitleLines[0] ?? subtitleText.slice(0, 60), W - MR, 11, { align: "right" });

  let ty = drawTableHeader(22);
  let tablePageStart = true;

  results.forEach((r, ri) => {
    const sigRaw  = r.triggers[0] ?? (isSensitive(r.name) ? "Sensitive attribute detected" : "—");
    // Strip leading "Signal N: " prefix so the short signal text fits
    const sigClean = sigRaw.replace(/^Signal \d+:\s*/i, "");
    const sigLines = wrap(sigClean, TC[6].w - 3, 7);
    const rowH = Math.max(7.5, sigLines.length * lh(7) + 4);

    const prevTy = ty;
    ty = need(rowH + 1, ty);
    if (ty !== prevTy) {
      // New page added — re-draw header
      ty = drawTableHeader(ty);
      tablePageStart = true;
    } else {
      tablePageStart = false;
    }

    const bg: [number,number,number] =
      r.risk === "high"   ? [254, 242, 242] :
      r.risk === "medium" ? [255, 251, 235] :
      ri % 2 === 0        ? [255, 255, 255] : [249, 250, 251];
    doc.setFillColor(...bg); doc.rect(ML, ty, CW, rowH, "F");
    doc.setDrawColor(220, 224, 232); doc.setLineWidth(0.15);
    doc.line(ML, ty + rowH, ML + CW, ty + rowH);

    const fg: [number,number,number] =
      r.risk === "high"   ? [185, 28, 28]  :
      r.risk === "medium" ? [146, 64, 14]  : [55, 65, 81];

    // Truncate feature name to fit within column width
    const nameStr = r.name.length > 21 ? r.name.slice(0, 20) + "…" : r.name;
    const midY = ty + rowH / 2 + 1.5;

    S(7.5, r.risk !== "low" ? "bold" : "normal", fg);
    doc.text(nameStr, TC[0].x + 1.5, midY);

    S(7, "normal", [120, 130, 150]);
    doc.text(r.isEncoded ? "categ." : "numeric", TC[1].x + 1.5, midY);

    S(7.5, "bold", fg);
    doc.text(r.risk === "high" ? "HIGH" : r.risk === "medium" ? "MED" : "LOW", TC[2].x + 1.5, midY);

    S(7.5, "normal", [70, 70, 70]);
    doc.text(r.pearsonApplicable ? r.corr.toFixed(3) : "N/A", TC[3].x + 1.5, midY);
    doc.text(r.mi.toFixed(3),  TC[4].x + 1.5, midY);
    doc.text(r.disp != null ? `${(r.disp * 100).toFixed(1)}%` : "—", TC[5].x + 1.5, midY);

    S(7, "normal", [80, 80, 80]);
    doc.text(sigLines, TC[6].x + 1.5, ty + 4.5);

    ty += rowH;
  });

  // ════════════════════════════════════════════════════════════════════════
  // PAGE 3 — Recommendations
  // ════════════════════════════════════════════════════════════════════════
  doc.addPage();
  doc.setFillColor(37, 31, 136); doc.rect(0, 0, W, 16, "F");
  S(13, "bold", [255, 255, 255]); doc.text("Recommendations", ML, 11);
  let ry = 26;

  /** Recommendation card for one flagged/medium feature */
  const recCard = (
    r: AuditResult, bodyText: string,
    bg: [number,number,number], accent: [number,number,number],
    hfg: [number,number,number], bfg: [number,number,number],
  ) => {
    const hdrLines  = wrap(
      `${r.name}   |   Pearson r = ${r.pearsonApplicable ? r.corr.toFixed(3) : "N/A"}   |   MI = ${r.mi.toFixed(3)} bits`,
      CW - 14, 9, "bold",
    );
    const bodyLines = wrap(bodyText, CW - 14, 8.5);
    const boxH = 6 + hdrLines.length * lh(9) + 3 + bodyLines.length * lh(8.5) + 7;
    ry = need(boxH + 5, ry);
    doc.setFillColor(...bg); doc.roundedRect(ML, ry, CW, boxH, 3, 3, "F");
    doc.setFillColor(...accent); doc.roundedRect(ML, ry, 5, boxH, 2, 2, "F");
    S(9, "bold", hfg);   doc.text(hdrLines,  ML + 9, ry + 7);
    S(8.5, "normal", bfg); doc.text(bodyLines, ML + 9, ry + 7 + hdrLines.length * lh(9) + 3);
    ry += boxH + 5;
  };

  if (flagged.length > 0) {
    S(11, "bold", [185, 28, 28]); doc.text("High Risk — Review Before Training", ML, ry); ry += 8;
    flagged.forEach(r => recCard(
      r,
      "Review whether this feature should be removed or replaced before training. If it must stay, apply a fairness-aware algorithm (e.g. reweighing or adversarial debiasing) and document the justification in your Model Card. Run demographic parity and equalized odds checks post-training.",
      [254, 242, 242], [239, 68, 68], [185, 28, 28], [130, 20, 20],
    ));
    ry += 4;
  }

  if (medium.length > 0) {
    ry = need(20, ry);
    S(11, "bold", [146, 64, 14]); doc.text("Medium Risk — Review Carefully", ML, ry); ry += 8;
    medium.forEach(r => recCard(
      r,
      "Evaluate whether this feature is strictly necessary for the model's purpose. If retained, test for disparate impact across all protected groups and apply bias mitigation techniques. Document the decision in a Model Card.",
      [255, 251, 235], [245, 158, 11], [146, 64, 14], [110, 60, 10],
    ));
    ry += 4;
  }

  ry = need(70, ry);
  S(11, "bold", [25, 25, 25]); doc.text("General Best Practices", ML, ry); ry += 8;
  const practices = [
    "Run demographic parity, equalized odds, and calibration checks before deploying any model on this data.",
    "Establish a fairness testing pipeline that re-runs automatically on every retrain — bias can re-enter via data drift.",
    "Document all feature inclusion decisions in a Model Card or Datasheets for Datasets artifact.",
    "Have a diverse, cross-functional team review dataset composition and outputs before production release.",
    "Re-audit whenever the source population, data collection process, or target definition changes.",
    "For high-stakes decisions (credit, hiring, healthcare), consider third-party bias audits alongside automated tools.",
  ];
  practices.forEach(rec => {
    const lines = wrap("• " + rec, CW - 6, 9);
    ry = need(lines.length * lh(9) + 4, ry);
    S(9, "normal", [65, 65, 65]); doc.text(lines, ML + 4, ry);
    ry += lines.length * lh(9) + 4;
  });

  // ── Footer on every page ────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(210, 215, 225); doc.setLineWidth(0.3);
    doc.line(ML, PAGE_H - 13, W - MR, PAGE_H - 13);
    S(7, "normal", [150, 150, 160]);
    doc.text("BiasX  |  Generated in the browser. Flags are signals, not proof of bias", ML, PAGE_H - 8);
    doc.text(`Page ${i} of ${totalPages}  |  ${today}`, W - MR, PAGE_H - 8, { align: "right" });
  }

  return doc;
}

export function generatePDF(fileName: string, results: AuditResult[], currentTarget: string, threshold: number, targetNote = "") {
  buildPDF(fileName, results, currentTarget, threshold, targetNote)
    .save(`biasx-audit-${fileName.replace(/\.csv$/i, "").replace(/[^a-z0-9]/gi, "_")}.pdf`);
}
