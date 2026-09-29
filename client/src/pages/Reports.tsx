import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  ConfirmDialog,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  Icon,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Select,
  TableShell,
  Td,
  Th,
  toast,
} from '../components/ui';
import {
  deleteReport,
  generateReport,
  getReportContent,
  getReportHtml,
  listBenchmarks,
  listEvaluations,
  listReports,
} from '../lib/api';
import type {
  BenchmarkDataset,
  EvaluationSummary,
  ReportItem,
  ServerReportDetail,
} from '../lib/api';
import { downloadTextFile, formatDateTime, truncate } from '../lib/utils';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'An unexpected error occurred.';
}

/** Format a raw metric value for display. */
function formatMetricValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(1);
  return String(v);
}

export default function Reports() {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Generate modal state
  const [genOpen, setGenOpen] = useState(false);
  const [genTitle, setGenTitle] = useState('');
  const [genType, setGenType] = useState<'evaluation' | 'benchmark'>('evaluation');
  const [genSourceId, setGenSourceId] = useState('');
  const [genSaving, setGenSaving] = useState(false);
  const [evals, setEvals] = useState<EvaluationSummary[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkDataset[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);

  // View drawer state
  const [viewReport, setViewReport] = useState<ReportItem | null>(null);
  const [viewContent, setViewContent] = useState<ServerReportDetail | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);
  const [autoPrint, setAutoPrint] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<ReportItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReports(await listReports());
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openGenerate = async () => {
    setGenTitle('');
    setGenType('evaluation');
    setGenSourceId('');
    setGenOpen(true);
    if (evals.length === 0 && benchmarks.length === 0) {
      setSourcesLoading(true);
      try {
        const [ev, bm] = await Promise.all([listEvaluations({ pageSize: 50 }), listBenchmarks()]);
        setEvals(ev.items);
        setBenchmarks(bm);
      } catch (e) {
        toast('Failed to load sources', { desc: errMsg(e), tone: 'error' });
      } finally {
        setSourcesLoading(false);
      }
    }
  };

  const handleGenerate = async () => {
    if (!genTitle.trim()) {
      toast('Title is required', { tone: 'error' });
      return;
    }
    if (!genSourceId) {
      toast('Please select a source', { tone: 'error' });
      return;
    }
    setGenSaving(true);
    try {
      await generateReport({ title: genTitle.trim(), sourceType: genType, sourceId: genSourceId });
      toast('Report generated', { tone: 'success' });
      setGenOpen(false);
      await load();
    } catch (e) {
      toast('Failed to generate report', { desc: errMsg(e), tone: 'error' });
    } finally {
      setGenSaving(false);
    }
  };

  const openView = async (report: ReportItem, print = false) => {
    setViewReport(report);
    setViewContent(null);
    setViewError(null);
    setViewLoading(true);
    setAutoPrint(print);
    try {
      setViewContent(await getReportContent(report.id));
    } catch (e) {
      setViewError(errMsg(e));
      setAutoPrint(false);
    } finally {
      setViewLoading(false);
    }
  };

  // Print after the drawer content has rendered.
  useEffect(() => {
    if (autoPrint && viewContent && !viewLoading) {
      setAutoPrint(false);
      const t = setTimeout(() => window.print(), 100);
      return () => clearTimeout(t);
    }
  }, [autoPrint, viewContent, viewLoading]);

  const handleDownload = async (report: ReportItem) => {
    setDownloadingId(report.id);
    try {
      // The server renders and stores the report HTML at generation time.
      const html = await getReportHtml(report.id);
      downloadTextFile(`${report.id}.html`, html, 'text/html');
      toast('Report downloaded', { tone: 'success' });
    } catch (e) {
      toast('Failed to download report', { desc: errMsg(e), tone: 'error' });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteReport(deleteTarget.id);
      toast('Report deleted', { tone: 'success' });
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast('Failed to delete report', { desc: errMsg(e), tone: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Reports"
        description="Generate and download professional reliability reports."
        actions={
          <Button variant="primary" onClick={openGenerate}>
            <Icon name="plus" className="h-4 w-4" /> Generate Report
          </Button>
        }
      />

      {loading ? (
        <LoadingState label="Loading reports…" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : reports.length === 0 ? (
        <EmptyState
          icon="report"
          title="No reports yet"
          description="Generate your first reliability report from an evaluation or benchmark."
          action={
            <Button variant="primary" onClick={openGenerate}>
              <Icon name="plus" className="h-4 w-4" /> Generate Report
            </Button>
          }
        />
      ) : (
        <TableShell ariaLabel="Reports">
          <thead>
            <tr>
              <Th>Title</Th>
              <Th>Source</Th>
              <Th>Created</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <Td className="font-medium text-slate-900 dark:text-white">{r.title}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <Badge tone={r.sourceType === 'evaluation' ? 'info' : 'default'}>{r.sourceType}</Badge>
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400" title={r.sourceId}>
                      {truncate(r.sourceId, 16)}
                    </span>
                  </div>
                </Td>
                <Td className="whitespace-nowrap">{formatDateTime(r.createdAt)}</Td>
                <Td>
                  <Badge tone={r.status === 'ready' ? 'success' : 'info'}>{r.status}</Badge>
                </Td>
                <Td>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openView(r)}>
                      View
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(r)}
                      disabled={downloadingId === r.id}
                    >
                      <Icon name="download" className="h-4 w-4" /> Download HTML
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openView(r, true)}>
                      Print/PDF
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                      onClick={() => setDeleteTarget(r)}
                    >
                      <Icon name="trash" className="h-4 w-4" /> Delete
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      {/* Generate modal */}
      <Modal
        open={genOpen}
        onClose={() => setGenOpen(false)}
        title="Generate Report"
        footer={
          <>
            <Button variant="outline" onClick={() => setGenOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleGenerate} loading={genSaving} disabled={sourcesLoading}>
              Generate
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Title" htmlFor="gen-title">
            <Input
              id="gen-title"
              value={genTitle}
              onChange={(e) => setGenTitle(e.target.value)}
              placeholder="e.g. Q3 reliability review"
              required
            />
          </Field>
          <Field label="Source type" htmlFor="gen-type">
            <Select
              id="gen-type"
              value={genType}
              onChange={(e) => {
                setGenType(e.target.value as 'evaluation' | 'benchmark');
                setGenSourceId('');
              }}
            >
              <option value="evaluation">Evaluation</option>
              <option value="benchmark">Benchmark</option>
            </Select>
          </Field>
          <Field label="Source" htmlFor="gen-source">
            <Select
              id="gen-source"
              value={genSourceId}
              onChange={(e) => setGenSourceId(e.target.value)}
              disabled={sourcesLoading}
            >
              <option value="">{sourcesLoading ? 'Loading…' : 'Select a source'}</option>
              {genType === 'evaluation'
                ? evals.map((e) => (
                    <option key={e.id} value={e.id}>
                      {truncate(e.prompt, 60)} ({e.id})
                    </option>
                  ))
                : benchmarks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.id})
                    </option>
                  ))}
            </Select>
          </Field>
        </div>
      </Modal>

      {/* View drawer */}
      <Drawer open={viewReport !== null} onClose={() => setViewReport(null)} title={viewReport?.title ?? 'Report'}>
        {viewLoading ? (
          <LoadingState label="Loading report…" rows={4} />
        ) : viewError || !viewContent ? (
          <ErrorState
            message={viewError ?? 'Failed to load report content.'}
            onRetry={() => viewReport && openView(viewReport)}
          />
        ) : (
          <div className="print-area">
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <Badge tone={viewReport?.sourceType === 'evaluation' ? 'info' : 'default'}>
                {viewReport?.sourceType}
              </Badge>
              {viewContent.content.evaluationId && (
                <span className="font-mono text-xs">{viewContent.content.evaluationId}</span>
              )}
              {viewContent.content.benchmarkId && (
                <span className="font-mono text-xs">{viewContent.content.benchmarkId}</span>
              )}
              <span aria-hidden="true">·</span>
              <span>{formatDateTime(viewContent.content.generatedAt ?? viewContent.createdAt)}</span>
            </div>

            {viewContent.content.executiveSummary && viewContent.content.executiveSummary.length > 0 && (
              <section className="mt-2">
                <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Executive summary
                </h4>
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
                  {viewContent.content.executiveSummary.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </section>
            )}

            {viewContent.content.metrics && Object.keys(viewContent.content.metrics).length > 0 && (
              <>
                <h4 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Key metrics
                </h4>
                <TableShell ariaLabel="Report metrics">
                  <thead>
                    <tr>
                      <Th>Metric</Th>
                      <Th>Value</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(viewContent.content.metrics).map(([label, value]) => (
                      <tr key={label}>
                        <Td className="font-medium">{label}</Td>
                        <Td>{formatMetricValue(value)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </TableShell>
              </>
            )}

            {viewContent.content.sections?.map((s) => (
              <section key={s.heading} className="mt-6">
                <h4 className="text-base font-semibold text-slate-900 dark:text-white">{s.heading}</h4>
                {s.body.map((para, i) => (
                  <p key={i} className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {para}
                  </p>
                ))}
              </section>
            ))}

            {viewContent.content.tables?.map((t) => (
              <section key={t.title} className="mt-6">
                <h4 className="mb-2 text-base font-semibold text-slate-900 dark:text-white">{t.title}</h4>
                <TableShell ariaLabel={t.title}>
                  <thead>
                    <tr>
                      {t.headers.map((h) => (
                        <Th key={h}>{h}</Th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {t.rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <Td key={j} className={j === 0 ? 'font-medium' : undefined}>
                            {cell}
                          </Td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </TableShell>
              </section>
            ))}

            {viewContent.content.methodology && viewContent.content.methodology.length > 0 && (
              <section className="mt-6">
                <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Methodology
                </h4>
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
                  {viewContent.content.methodology.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </section>
            )}

            {viewContent.content.limitations && viewContent.content.limitations.length > 0 && (
              <section className="mt-6">
                <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Limitations
                </h4>
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
                  {viewContent.content.limitations.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </section>
            )}

            <div className="no-print mt-6 flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                Print / PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => viewReport && handleDownload(viewReport)}
                disabled={!!viewReport && downloadingId === viewReport.id}
              >
                <Icon name="download" className="h-4 w-4" /> Download HTML
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete report"
        description={`Are you sure you want to delete "${deleteTarget?.title ?? ''}"? This action cannot be undone.`}
        confirmLabel="Delete"
        loading={deleting}
      />
    </>
  );
}
