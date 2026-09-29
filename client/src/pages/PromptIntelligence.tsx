import { useCallback, useEffect, useState } from 'react';
import {
  analyzePrompt,
  improvePrompt,
  listPromptHistory,
  savePromptHistory,
  type PromptAnalysis,
  type PromptDimension,
  type PromptHistoryItem,
} from '../lib/api';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CopyButton,
  EmptyState,
  ErrorState,
  Field,
  Icon,
  LoadingState,
  PageHeader,
  ProgressBar,
  ScoreRing,
  Td,
  Th,
  TableShell,
  Textarea,
  toast,
} from '../components/ui';
import { formatDate, truncate } from '../lib/utils';

function DimensionRow({ dimension }: { dimension: PromptDimension }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{dimension.name}</p>
        <p
          className="text-sm font-bold tabular-nums text-slate-900 dark:text-white"
          aria-label={`${dimension.name} score ${Math.round(dimension.score)} out of 100`}
        >
          {Math.round(dimension.score)}
        </p>
      </div>
      <ProgressBar value={dimension.score} className="mt-2" />
      {dimension.feedback && (
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{dimension.feedback}</p>
      )}
    </div>
  );
}

export default function PromptIntelligence() {
  const [prompt, setPrompt] = useState('');
  const [analysis, setAnalysis] = useState<PromptAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [improvement, setImprovement] = useState<{ improved: string; changes: string[] } | null>(null);
  const [improving, setImproving] = useState(false);
  const [saving, setSaving] = useState(false);

  const [history, setHistory] = useState<PromptHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const promptIsEmpty = prompt.trim().length === 0;

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistory(await listPromptHistory());
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Could not load prompt history.');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const handleAnalyze = async () => {
    if (promptIsEmpty || analyzing) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const result = await analyzePrompt(prompt);
      setAnalysis(result);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Analysis failed. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleImprove = async () => {
    if (promptIsEmpty || improving) return;
    setImproving(true);
    try {
      const result = await improvePrompt(prompt);
      setImprovement(result);
    } catch (err) {
      toast('Could not improve prompt', {
        desc: err instanceof Error ? err.message : 'Please try again.',
        tone: 'error',
      });
    } finally {
      setImproving(false);
    }
  };

  const handleUseImproved = () => {
    if (!improvement) return;
    setPrompt(improvement.improved);
    setImprovement(null);
    toast('Prompt updated', { desc: 'Re-run analysis to score it.', tone: 'success' });
  };

  const handleKeepOriginal = () => setImprovement(null);

  const handleSaveToHistory = async () => {
    if (!analysis || !improvement || saving) return;
    setSaving(true);
    try {
      const reAnalysis = await analyzePrompt(improvement.improved);
      const saved = await savePromptHistory({
        original: prompt,
        improved: improvement.improved,
        scoreBefore: analysis.score,
        scoreAfter: reAnalysis.score,
      });
      setHistory((prev) => [saved, ...prev]);
      toast('Saved to history', {
        desc: `Score ${Math.round(analysis.score)} → ${Math.round(reAnalysis.score)}`,
        tone: 'success',
      });
    } catch (err) {
      toast('Could not save to history', {
        desc: err instanceof Error ? err.message : 'Please try again.',
        tone: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLoadHistoryItem = (item: PromptHistoryItem) => {
    setPrompt(item.original);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Prompt Intelligence"
        description="Analyze, score, and improve your prompts before spending model calls."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Editor */}
        <Card>
          <CardHeader title="Prompt editor" description="Write or paste the prompt you want to evaluate." />
          <CardContent className="space-y-4">
            <Field label="Prompt" htmlFor="prompt-editor">
              <Textarea
                id="prompt-editor"
                rows={10}
                placeholder="Enter your prompt here…"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </Field>
            <p className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
              {prompt.length} character{prompt.length === 1 ? '' : 's'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleAnalyze} loading={analyzing} disabled={promptIsEmpty}>
                <Icon name="flask" className="h-4 w-4" />
                Analyze Prompt
              </Button>
              <Button
                variant="outline"
                onClick={handleImprove}
                loading={improving}
                disabled={analysis === null || improving}
                title={analysis === null ? 'Run an analysis first' : undefined}
              >
                <Icon name="bulb" className="h-4 w-4" />
                Improve Prompt
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Analysis */}
        <Card>
          <CardHeader title="Analysis" description="Score breakdown for the current prompt." />
          <CardContent>
            {analyzing && <LoadingState label="Analyzing prompt…" rows={2} />}
            {!analyzing && analysisError && (
              <ErrorState message={analysisError} onRetry={handleAnalyze} />
            )}
            {!analyzing && !analysisError && !analysis && (
              <EmptyState icon="bulb" title="Enter a prompt and run analysis." />
            )}
            {!analyzing && analysis && (
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <ScoreRing value={analysis.score} label="Prompt Score" />
                  <p className="max-w-xs text-sm text-slate-500 dark:text-slate-400">
                    {analysis.score >= 75
                      ? 'Strong prompt. Minor refinements could still help.'
                      : analysis.score >= 50
                        ? 'Decent starting point. Address the issues below before running.'
                        : 'This prompt needs work — start with the suggestions below.'}
                  </p>
                </div>

                <div className="space-y-3">
                  {analysis.dimensions.map((d) => (
                    <DimensionRow key={d.name} dimension={d} />
                  ))}
                </div>

                {analysis.issues.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Issues</h4>
                    <ul className="space-y-1.5">
                      {analysis.issues.map((issue, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" aria-hidden="true" />
                          {issue}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {analysis.suggestions.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Suggestions</h4>
                    <ul className="space-y-1.5">
                      {analysis.suggestions.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                          <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Improvement comparison */}
      {improvement && (
        <section aria-label="Prompt improvement comparison" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader
                title="Original Prompt"
                actions={<CopyButton text={prompt} label="Copy" />}
              />
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{prompt}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader
                title="Optimized Prompt"
                actions={<CopyButton text={improvement.improved} label="Copy" />}
              />
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
                  {improvement.improved}
                </p>
              </CardContent>
            </Card>
          </div>
          <Card className="mt-6">
            <CardHeader title="Changes applied" />
            <CardContent className="space-y-4">
              <ul className="space-y-1.5">
                {improvement.changes.map((change, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
                    {change}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleUseImproved}>
                  <Icon name="arrowRight" className="h-4 w-4" />
                  Use Improved Prompt
                </Button>
                <Button variant="outline" onClick={handleKeepOriginal}>
                  Keep Original
                </Button>
                <Button variant="outline" onClick={handleSaveToHistory} loading={saving}>
                  <Icon name="download" className="h-4 w-4" />
                  Save to History
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* History */}
      <Card className="mt-6">
        <CardHeader title="Prompt history" description="Previously analyzed and improved prompts." />
        <CardContent>
          {historyLoading && <LoadingState label="Loading prompt history…" rows={2} />}
          {!historyLoading && historyError && <ErrorState message={historyError} onRetry={loadHistory} />}
          {!historyLoading && !historyError && history.length === 0 && (
            <EmptyState icon="history" title="No prompt history yet." />
          )}
          {!historyLoading && !historyError && history.length > 0 && (
            <TableShell ariaLabel="Prompt history">
              <thead>
                <tr>
                  <Th>Original</Th>
                  <Th>Score</Th>
                  <Th>Date</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => {
                  const improvedDelta = item.scoreAfter - item.scoreBefore;
                  return (
                    <tr key={item.id}>
                      <Td className="max-w-xs">{truncate(item.original, 60)}</Td>
                      <Td>
                        <span className="inline-flex items-center gap-2">
                          <span className="tabular-nums">
                            {Math.round(item.scoreBefore)} → {Math.round(item.scoreAfter)}
                          </span>
                          {improvedDelta > 0 && (
                            <Badge tone="success">+{Math.round(improvedDelta)}</Badge>
                          )}
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap">{formatDate(item.createdAt)}</Td>
                      <Td>
                        <Button variant="ghost" size="sm" onClick={() => handleLoadHistoryItem(item)}>
                          Load
                        </Button>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableShell>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
