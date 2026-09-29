import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Badge,
  Button,
  Card,
  ChartCard,
  Checkbox,
  Input,
  ProgressBar,
  ResponseViewer,
  ScoreRing,
  Select,
  Slider,
  Textarea,
} from '../components/ui/index';
import { useToast } from '../components/ui/Toast';
import { evaluationsApi, promptsApi, toApiError } from '../lib/api';
import type { CreateEvaluationPayload, PromptAnalysis } from '../types';

const DOMAINS = [
  'Programming',
  'Mathematics',
  'Data Analytics',
  'Reasoning',
  'Current Information',
  'Academic',
  'General Knowledge',
  'Custom',
];

const TASK_TYPES = [
  'Question Answering',
  'Coding',
  'Debugging',
  'Explanation',
  'Summarization',
  'Reasoning',
  'Data Analysis',
  'Creative Writing',
  'Research',
  'Other',
];

const MODES = ['Quick Evaluation', 'Consistency Test', 'Deep Evaluation', 'Adversarial Test'];

const MIN_QUESTION_LENGTH = 10;

type ToggleKey =
  | 'evidenceVerification'
  | 'factChecking'
  | 'promptAnalysis'
  | 'uncertaintyAnalysis'
  | 'conflictDetection';

const TOGGLES: { key: ToggleKey; label: string }[] = [
  { key: 'evidenceVerification', label: 'Evidence verification' },
  { key: 'factChecking', label: 'Fact checking' },
  { key: 'promptAnalysis', label: 'Prompt analysis' },
  { key: 'uncertaintyAnalysis', label: 'Uncertainty analysis' },
  { key: 'conflictDetection', label: 'Conflict detection' },
];

type CompareResult = Awaited<ReturnType<typeof promptsApi.compare>>;

interface PlaygroundState {
  a: string;
  b: string;
  compareResult: CompareResult | null;
  comparing: boolean;
}

// ---------------------------------------------------------------------------
// Small inline SVG icons (no emojis)
// ---------------------------------------------------------------------------

function WarningIcon() {
  return (
    <svg
      className="mt-0.5 h-4 w-4 shrink-0"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      className="mt-0.5 h-4 w-4 shrink-0"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function QuestionWorkspace() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [question, setQuestion] = useState('');
  const [domain, setDomain] = useState('Programming');
  const [taskType, setTaskType] = useState('Question Answering');
  const [mode, setMode] = useState('Consistency Test');
  const [runs, setRuns] = useState(5);
  const [temperature, setTemperature] = useState(0.3);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [timeoutSec, setTimeoutSec] = useState(60);
  const [systemInstructions, setSystemInstructions] = useState('');
  const [toggles, setToggles] = useState<Record<ToggleKey, boolean>>({
    evidenceVerification: true,
    factChecking: true,
    promptAnalysis: true,
    uncertaintyAnalysis: true,
    conflictDetection: true,
  });

  const [analysis, setAnalysis] = useState<PromptAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [improved, setImproved] = useState<string | null>(null);
  const [improving, setImproving] = useState(false);
  const [useImprovedChoice, setUseImprovedChoice] = useState<boolean | null>(null);

  const [playground, setPlayground] = useState<PlaygroundState>({
    a: '',
    b: '',
    compareResult: null,
    comparing: false,
  });

  const [modelIds, setModelIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Read selected models on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('cg_selected_models');
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      setModelIds(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []);
    } catch {
      setModelIds([]);
    }
  }, []);

  // Keep playground prompt A in sync with the workspace question.
  useEffect(() => {
    setPlayground((p) => (p.a === question ? p : { ...p, a: question }));
  }, [question]);

  const questionValid = question.trim().length >= MIN_QUESTION_LENGTH;

  const handleAnalyze = async () => {
    if (!questionValid) {
      toast(`Question must be at least ${MIN_QUESTION_LENGTH} characters.`, 'error');
      return;
    }
    setAnalyzing(true);
    try {
      const result = await promptsApi.analyze(question);
      setAnalysis(result);
      setImproved(null);
    } catch (err) {
      toast(toApiError(err).message, 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleImprove = async () => {
    setImproving(true);
    try {
      const text = (await promptsApi.improve(question)).optimized;
      setImproved(text);
      setPlayground((p) => ({ ...p, b: text }));
    } catch (err) {
      toast(toApiError(err).message, 'error');
    } finally {
      setImproving(false);
    }
  };

  const handleUseImproved = () => {
    if (!improved) return;
    setQuestion(improved);
    setUseImprovedChoice(true);
    toast('Improved prompt applied to the question.', 'success');
  };

  const handleKeepOriginal = () => {
    setImproved(null);
    setUseImprovedChoice(false);
  };

  const handleCompare = async () => {
    if (!playground.a.trim() || !playground.b.trim()) {
      toast('Both playground prompts need content before comparing.', 'error');
      return;
    }
    setPlayground((p) => ({ ...p, comparing: true }));
    try {
      const result: CompareResult = await promptsApi.compare(playground.a, playground.b);
      setPlayground((p) => ({ ...p, compareResult: result, comparing: false }));
    } catch (err) {
      setPlayground((p) => ({ ...p, comparing: false }));
      toast(toApiError(err).message, 'error');
    }
  };

  const handleGetResponses = async () => {
    setFormError(null);
    if (!questionValid) {
      setFormError(`Question must be at least ${MIN_QUESTION_LENGTH} characters.`);
      return;
    }
    if (modelIds.length === 0) {
      setFormError('Select at least one model before running an evaluation.');
      return;
    }
    const payload: CreateEvaluationPayload = {
      question: question.trim(),
      domain,
      taskType,
      mode,
      modelIds,
      runs,
      temperature,
      maxTokens,
      timeoutSec,
      systemInstructions,
      options: toggles,
    };
    setSubmitting(true);
    try {
      const id = (await evaluationsApi.create(payload)).id;
      navigate(`/evaluate/running?evaluationId=${id}`);
    } catch (err) {
      setFormError(toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  const compareChartData = playground.compareResult
    ? [
        {
          metric: 'Reliability',
          Original: playground.compareResult.metricsA.reliability,
          Optimized: playground.compareResult.metricsB.reliability,
        },
        {
          metric: 'Consistency',
          Original: playground.compareResult.metricsA.consistency,
          Optimized: playground.compareResult.metricsB.consistency,
        },
        {
          metric: 'Relevance',
          Original: playground.compareResult.metricsA.relevance,
          Optimized: playground.compareResult.metricsB.relevance,
        },
        {
          metric: 'Completeness',
          Original: playground.compareResult.metricsA.completeness,
          Optimized: playground.compareResult.metricsB.completeness,
        },
        {
          metric: 'Grounding',
          Original: playground.compareResult.metricsA.grounding,
          Optimized: playground.compareResult.metricsB.grounding,
        },
      ]
    : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Question Workspace</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Compose a question, tune the run settings, check prompt quality, then evaluate it across
          models.
        </p>
      </div>

      {modelIds.length === 0 && (
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40">
          <div className="flex flex-wrap items-center justify-between gap-4 p-5">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              No models selected. Choose at least one model before running an evaluation.
            </p>
            <Link to="/evaluate/models">
              <Button variant="outline">Select models</Button>
            </Link>
          </div>
        </Card>
      )}

      {/* Card 1 — Question / Prompt */}
      <Card title="Question / Prompt">
        <div className="space-y-4 p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-stone-500 dark:text-stone-400">
              The prompt every selected model will answer.
            </span>
            {useImprovedChoice === true && <Badge variant="success">Using improved prompt</Badge>}
          </div>
          <div>
            <label
              htmlFor="qw-question"
              className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-200"
            >
              Question
            </label>
            <Textarea
              id="qw-question"
              rows={6}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question to evaluate models against, e.g. “Explain how database indexes speed up queries, with an example.”"
            />
            <div className="mt-1 flex justify-between text-xs text-stone-500 dark:text-stone-400">
              <span aria-live="polite">
                {!questionValid && question.length > 0
                  ? `Minimum ${MIN_QUESTION_LENGTH} characters required.`
                  : ''}
              </span>
              <span>{question.length} characters</span>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label="Domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              options={DOMAINS.map((d) => ({ value: d, label: d }))}
            />
            <Select
              label="Task type"
              value={taskType}
              onChange={(e) => setTaskType(e.target.value)}
              options={TASK_TYPES.map((t) => ({ value: t, label: t }))}
            />
            <Select
              label="Mode"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              options={MODES.map((m) => ({ value: m, label: m }))}
            />
          </div>
        </div>
      </Card>

      {/* Card 2 — Advanced settings */}
      <Card title="Advanced settings" subtitle="Run configuration and analysis features.">
        <div className="space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label
                htmlFor="qw-runs"
                className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-200"
              >
                Runs per model (1–10)
              </label>
              <Input
                id="qw-runs"
                type="number"
                min={1}
                max={10}
                value={runs}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setRuns(Number.isNaN(n) ? 1 : Math.min(10, Math.max(1, n)));
                }}
              />
            </div>
            <div>
              <Slider
                id="qw-temperature"
                label={
                  <>
                    Temperature: <span className="font-normal">{temperature.toFixed(1)}</span>
                  </>
                }
                min={0}
                max={1}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="mt-2"
              />
            </div>
            <div>
              <label
                htmlFor="qw-max-tokens"
                className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-200"
              >
                Max tokens
              </label>
              <Input
                id="qw-max-tokens"
                type="number"
                min={1}
                value={maxTokens}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setMaxTokens(Number.isNaN(n) ? 1 : Math.max(1, n));
                }}
              />
            </div>
            <div>
              <label
                htmlFor="qw-timeout"
                className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-200"
              >
                Timeout (seconds)
              </label>
              <Input
                id="qw-timeout"
                type="number"
                min={1}
                value={timeoutSec}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setTimeoutSec(Number.isNaN(n) ? 1 : Math.max(1, n));
                }}
              />
            </div>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-stone-700 dark:text-stone-200">
              Analysis features
            </legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {TOGGLES.map((t) => (
                <Checkbox
                  key={t.key}
                  label={t.label}
                  checked={toggles[t.key]}
                  onChange={(e) =>
                    setToggles((prev) => ({ ...prev, [t.key]: e.target.checked }))
                  }
                />
              ))}
            </div>
          </fieldset>
          <div>
            <label
              htmlFor="qw-system"
              className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-200"
            >
              System instructions <span className="font-normal text-stone-400">(optional)</span>
            </label>
            <Textarea
              id="qw-system"
              rows={3}
              value={systemInstructions}
              onChange={(e) => setSystemInstructions(e.target.value)}
              placeholder="Extra instructions prepended to the prompt for every run…"
            />
          </div>
        </div>
      </Card>

      {/* Card 3 — Prompt Quality Analyzer */}
      <Card
        title="Prompt Quality Analyzer"
        subtitle="Score the prompt before spending runs on it."
      >
        <div className="space-y-4 p-5">
          <Button onClick={handleAnalyze} loading={analyzing} disabled={!questionValid}>
            Analyze Prompt
          </Button>
          {analysis && (
            <div className="space-y-4 border-t border-stone-200 pt-4 dark:border-stone-800">
              <div className="flex flex-col gap-6 sm:flex-row">
                <ScoreRing score={analysis.score} size={120} label="Prompt quality score" />
                <div className="flex-1 space-y-2">
                  {analysis.dimensions.map((d) => (
                    <div key={d.name}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="text-stone-600 dark:text-stone-300">{d.name}</span>
                        <span className="font-medium text-stone-700 dark:text-stone-200">
                          {d.score}
                        </span>
                      </div>
                      <ProgressBar value={d.score} />
                    </div>
                  ))}
                </div>
              </div>
              {analysis.issues.length > 0 && (
                <div>
                  <h3 className="mb-2 font-medium text-stone-900 dark:text-stone-100">Issues</h3>
                  <ul className="space-y-1">
                    {analysis.issues.map((issue, i) => (
                      <li
                        key={i}
                        className="flex gap-2 text-sm text-amber-700 dark:text-amber-400"
                      >
                        <WarningIcon />
                        <span>{issue}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {analysis.suggestions.length > 0 && (
                <div>
                  <h3 className="mb-2 font-medium text-stone-900 dark:text-stone-100">
                    Suggestions
                  </h3>
                  <ul className="space-y-1">
                    {analysis.suggestions.map((s, i) => (
                      <li
                        key={i}
                        className="flex gap-2 text-sm text-stone-600 dark:text-stone-300"
                      >
                        <InfoIcon />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Button variant="outline" onClick={handleImprove} loading={improving}>
                Improve Prompt
              </Button>
            </div>
          )}
          {improved && (
            <div className="space-y-3 border-t border-stone-200 pt-4 dark:border-stone-800">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-medium text-stone-700 dark:text-stone-200">
                    Original
                  </h3>
                  <ResponseViewer text={question} />
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-medium text-stone-700 dark:text-stone-200">
                    Optimized
                  </h3>
                  <ResponseViewer text={improved} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleUseImproved}>Use Improved Prompt</Button>
                <Button variant="ghost" onClick={handleKeepOriginal}>
                  Keep Original
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Card 4 — Prompt Playground */}
      <Card
        title="Prompt Playground"
        subtitle="Compare the original prompt against an optimized version."
      >
        <div className="space-y-4 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label
                htmlFor="qw-play-a"
                className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-200"
              >
                A — Original
              </label>
              <Textarea
                id="qw-play-a"
                rows={5}
                value={playground.a}
                onChange={(e) => setPlayground((p) => ({ ...p, a: e.target.value }))}
              />
            </div>
            <div>
              <label
                htmlFor="qw-play-b"
                className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-200"
              >
                B — Optimized
              </label>
              <Textarea
                id="qw-play-b"
                rows={5}
                value={playground.b}
                onChange={(e) => setPlayground((p) => ({ ...p, b: e.target.value }))}
              />
            </div>
          </div>
          <Button
            variant="outline"
            onClick={handleCompare}
            loading={playground.comparing}
            disabled={!playground.a.trim() || !playground.b.trim()}
          >
            Run Both &amp; Compare
          </Button>
          {playground.compareResult && (
            <div>
              <ChartCard title="Prompt comparison" height={300}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={compareChartData}
                    margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="metric" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Original" fill="#78716c" />
                    <Bar dataKey="Optimized" fill="#4f46e5" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
                Calculated from evaluation data.
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Sticky footer — translucent material with scroll edge fade, no hard divider. */}
      <div className="material-chrome sticky bottom-0 -mx-6 px-6 py-4">
        <div aria-hidden="true" className="edge-fade-t pointer-events-none absolute inset-x-0 bottom-full h-8" />
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div aria-live="polite" className="min-h-5 text-sm text-red-600 dark:text-red-400">
            {formError}
          </div>
          <Button variant="primary" size="lg" onClick={handleGetResponses} loading={submitting}>
            Get Responses
          </Button>
        </div>
      </div>
    </div>
  );
}
