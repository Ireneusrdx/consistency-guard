import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { getEvaluationResults } from '../engine/evaluation';

export interface ReportSection {
  heading: string;
  body: string[];
}

export interface BuiltReport {
  title: string;
  generatedAt: string;
  evaluationId?: string;
  benchmarkId?: string;
  executiveSummary: string[];
  methodology: string[];
  sections: ReportSection[];
  tables: Array<{ title: string; headers: string[]; rows: string[][] }>;
  limitations: string[];
}

function fmt(n: number | null | undefined): string {
  return n == null ? 'n/a' : String(Math.round(n));
}

/** Builds a report object from real evaluation results. */
export async function buildEvaluationReport(evaluationId: string): Promise<BuiltReport> {
  const r = await getEvaluationResults(evaluationId);
  if (!r) throw new Error('Evaluation not found.');

  const modelRows = r.models.map((m) => {
    const g = (name: string) => m.metrics[name]?.value as number | undefined;
    return [
      m.displayName,
      fmt(g('reliability')),
      fmt(g('consistency')),
      m.metrics['accuracy']?.isEstimated ? `${fmt(g('accuracy'))} (est.)` : fmt(g('accuracy')),
      fmt(g('grounding')),
      fmt(g('relevance')),
      m.avgLatencyMs != null ? `${m.avgLatencyMs} ms` : 'n/a',
      m.totalCostUsd != null ? `$${m.totalCostUsd.toFixed(4)}` : 'n/a',
    ];
  });

  const highConflicts = r.conflicts.filter((c) => c.severity === 'high');
  const estimated = r.models.some((m) => m.metrics['accuracy']?.isEstimated);

  return {
    title: `Consistency Guard Report — ${r.question.slice(0, 60)}${r.question.length > 60 ? '…' : ''}`,
    generatedAt: new Date().toISOString(),
    evaluationId,
    executiveSummary: [
      `Question (${r.domain} / ${r.taskType}): "${r.question}"`,
      `${r.models.length} model(s) evaluated with ${r.runs} repeated run(s) each on ${new Date(r.createdAt).toLocaleString()}.`,
      `Average reliability: ${fmt(r.avgReliability)}/100. Average consistency: ${fmt(r.avgConsistency)}/100.`,
      `${r.conflicts.length} conflict(s) detected (${highConflicts.length} high severity).`,
      'Results were produced with live provider APIs.',
    ],
    methodology: [
      'Each model answered the same prompt N times (controlled repeated runs).',
      'Responses were normalized and compared semantically (token Jaccard + claim overlap), never by exact string equality.',
      'Factual claims were extracted, cross-compared for conflicts, and checked against retrieved reference evidence.',
      estimated
        ? 'No reference answer was provided: accuracy figures are ESTIMATES from cross-model semantic agreement, not ground-truth accuracy.'
        : 'Accuracy is ground-truth accuracy measured against the provided reference answer.',
      `Reliability = 0.35·accuracy + 0.20·consistency + 0.15·relevance + 0.10·completeness + 0.10·grounding + 0.10·instruction-following.`,
    ],
    sections: [
      {
        heading: 'Reliability scores',
        body: r.models.map((m) => {
          const met = m.metrics;
          const val = (n: string) => fmt((met[n]?.value as number | undefined));
          return `${m.displayName}: reliability ${val('reliability')}/100 (consistency ${val('consistency')}, grounding ${val('grounding')}, relevance ${val('relevance')}, completeness ${val('completeness')}, instruction-following ${val('instructionFollowing')}, hallucination risk ${val('hallucinationRisk')}).`;
        }),
      },
      {
        heading: 'Conflict analysis',
        body:
          r.conflicts.length === 0
            ? ['No cross-model conflicts were detected.']
            : r.conflicts.map((c) => `[${c.severity.toUpperCase()}] ${c.conflictType}: ${c.explanation}`),
      },
      {
        heading: 'Evidence',
        body: r.models.flatMap((m) =>
          m.claims.slice(0, 5).map((c) => {
            const ev = c.evidence[0];
            return `Claim (${c.status}): "${c.text.slice(0, 100)}"${ev ? ` — evidence: ${ev.title} (${ev.url})` : ' — no retrieved evidence'}`;
          }),
        ),
      },
      {
        heading: 'Prompt quality',
        body: r.promptAnalysis
          ? [
              `Prompt quality score: ${r.promptAnalysis.score}/100.`,
              `Issues: ${(r.promptAnalysis.issues as string[]).join('; ') || 'none'}.`,
            ]
          : ['Prompt analysis was not enabled for this evaluation.'],
      },
    ],
    tables: [
      {
        title: 'Model metrics',
        headers: ['Model', 'Reliability', 'Consistency', 'Accuracy', 'Grounding', 'Relevance', 'Avg latency', 'Est. cost'],
        rows: modelRows,
      },
    ],
    limitations: [
      'Scores are estimates produced by heuristic analysis, not absolute measures of truth.',
      estimated
        ? 'Without a reference answer, "accuracy" reflects cross-model agreement, which can be wrong if all models err together.'
        : 'Ground-truth accuracy depends on the quality of the provided reference answer.',
      'Without an evidence corpus configured (EVIDENCE_CORPUS_PATH), claims are reported unverified — never treated as grounded fact.',
      'Cost figures are estimates from published per-token pricing and reported token usage.',
    ],
  };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function barChartHtml(title: string, items: Array<{ label: string; value: number }>): string {
  const bars = items
    .map(
      (it) => `
      <div style="display:flex;align-items:center;gap:8px;margin:6px 0;">
        <div style="width:180px;font-size:13px;">${esc(it.label)}</div>
        <div style="flex:1;background:#eef1f5;border-radius:4px;height:14px;">
          <div style="width:${Math.max(0, Math.min(100, it.value))}%;height:14px;border-radius:4px;background:#2563eb;"></div>
        </div>
        <div style="width:48px;text-align:right;font-size:13px;font-weight:600;">${it.value}</div>
      </div>`,
    )
    .join('');
  return `<h3>${esc(title)}</h3>${bars}`;
}

/** Renders a printable HTML report. */
export function renderReportHtml(report: BuiltReport): string {
  const firstTable = report.tables[0];
  const reliabilityItems =
    firstTable?.rows.map((row) => ({ label: row[0], value: parseInt(row[1], 10) || 0 })) ?? [];

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>${esc(report.title)}</title>
<style>
  body{font-family:Inter,system-ui,sans-serif;color:#1a2332;max-width:900px;margin:0 auto;padding:40px 24px;line-height:1.6;}
  h1{font-size:26px;margin-bottom:4px;} h2{font-size:18px;margin-top:32px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;}
  h3{font-size:15px;margin-top:20px;} table{border-collapse:collapse;width:100%;font-size:13px;margin-top:8px;}
  th,td{border:1px solid #e2e8f0;padding:8px 10px;text-align:left;} th{background:#f1f5f9;}
  .meta{color:#64748b;font-size:13px;} .badge{display:inline-block;background:#fef3c7;color:#92400e;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:600;}
  ul{padding-left:20px;} li{margin:4px 0;font-size:14px;}
  @media print{body{padding:0;}}
</style></head><body>
<h1>${esc(report.title)}</h1>
<p class="meta">Generated ${esc(report.generatedAt)} · Evaluation ${esc(report.evaluationId ?? 'n/a')}</p>
<h2>Executive summary</h2><ul>${report.executiveSummary.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
<h2>Methodology</h2><ul>${report.methodology.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
${reliabilityItems.length ? barChartHtml('Reliability by model', reliabilityItems) : ''}
${report.tables.map((t) => `<h2>${esc(t.title)}</h2><table><thead><tr>${t.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('')}
${report.sections.map((s) => `<h2>${esc(s.heading)}</h2><ul>${s.body.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`).join('')}
<h2>Limitations</h2><ul>${report.limitations.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
</body></html>`;
}

/** Renders a real PDF report via pdfkit. Returns the absolute file path. */
export function renderReportPdf(report: BuiltReport, outDir: string, reportId: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    fs.mkdirSync(outDir, { recursive: true });
    const filePath = path.join(outDir, `${reportId}.pdf`);
    const doc = new PDFDocument({ margin: 48 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.fontSize(20).text(report.title, { underline: false });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#64748b').text(`Generated ${report.generatedAt}`);
    if (report.evaluationId) doc.text(`Evaluation ID: ${report.evaluationId}`);
    doc.moveDown();

    const section = (title: string, items: string[]) => {
      doc.fontSize(14).fillColor('#1a2332').text(title);
      doc.moveDown(0.4);
      doc.fontSize(10).fillColor('#334155');
      for (const item of items) {
        doc.text(`• ${item}`, { indent: 12 });
        doc.moveDown(0.25);
      }
      doc.moveDown(0.5);
    };

    section('Executive summary', report.executiveSummary);
    section('Methodology', report.methodology);
    for (const s of report.sections) section(s.heading, s.body);
    for (const t of report.tables) {
      doc.fontSize(14).fillColor('#1a2332').text(t.title);
      doc.moveDown(0.4);
      doc.fontSize(9).fillColor('#334155');
      doc.text(t.headers.join(' | '));
      doc.moveDown(0.2);
      for (const row of t.rows) {
        doc.text(row.join(' | '));
        doc.moveDown(0.15);
      }
      doc.moveDown(0.5);
    }
    section('Limitations', report.limitations);

    doc.end();
    stream.on('finish', () => resolvePromise(filePath));
    stream.on('error', reject);
  });
}
