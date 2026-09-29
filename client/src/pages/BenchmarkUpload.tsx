import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  ErrorState,
  Field,
  Icon,
  Input,
  LoadingState,
  PageHeader,
  Select,
  StatCard,
  TableShell,
  Td,
  Textarea,
  Th,
  toast,
} from '../components/ui';
import {
  DATASET_TARGETS,
  createBenchmark,
  parseDatasetFile,
  type DatasetPreview,
} from '../lib/api';
import { DOMAINS } from '../lib/options';
import { cn } from '../lib/utils';

type DatasetTarget = (typeof DATASET_TARGETS)[number];
const QUESTION_TARGET: DatasetTarget = 'question';

function targetLabel(target: string): string {
  return target
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function StepHeading({ n, title, description }: { n: number; title: string; description: string }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white"
        aria-hidden="true"
      >
        {n}
      </span>
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
      </div>
    </div>
  );
}

export default function BenchmarkUpload() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DatasetPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});

  const [name, setName] = useState('');
  const [domain, setDomain] = useState('General Knowledge');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const resetFile = () => {
    setFile(null);
    setPreview(null);
    setMapping({});
    setParseError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFile = async (f: File) => {
    setFile(f);
    setParseError(null);
    setPreview(null);
    setMapping({});
    setParsing(true);
    try {
      const p = await parseDatasetFile(f);
      setPreview(p);
      setMapping({ ...p.mapping });
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Could not parse this file.');
    } finally {
      setParsing(false);
    }
  };

  const handleMappingChange = (target: DatasetTarget, column: string) => {
    setMapping((prev) => ({ ...prev, [target]: column === '' ? null : column }));
  };

  const mappedColumns: string[] = preview
    ? preview.columns.filter((c) => DATASET_TARGETS.some((t) => mapping[t] === c))
    : [];

  const columnTargetLabel = (column: string): string => {
    const t = DATASET_TARGETS.find((tt) => mapping[tt] === column);
    return t ? targetLabel(t) : column;
  };

  const canCreate =
    preview !== null && name.trim().length > 0 && mapping[QUESTION_TARGET] != null && preview.validRows > 0;

  const handleCreate = async () => {
    if (!preview || !canCreate || creating) return;
    setCreating(true);
    try {
      const trimmedName = name.trim();
      await createBenchmark({
        name: trimmedName,
        domain,
        description: description.trim() || undefined,
        rows: preview.rows,
        mapping,
      });
      toast('Benchmark created', {
        desc: `${trimmedName} — ${preview.validRows} questions imported.`,
        tone: 'success',
      });
      navigate('/benchmarks');
    } catch (err) {
      toast('Could not create benchmark', {
        desc: err instanceof Error ? err.message : undefined,
        tone: 'error',
      });
      setCreating(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Upload Dataset"
        description="Import your own question bank as CSV or JSON."
        crumbs={[{ label: 'Benchmarks' }, { label: 'Upload' }]}
      />

      <div className="space-y-6">
        {/* Step 1 — File */}
        <Card>
          <CardContent className="py-5">
            <StepHeading n={1} title="Choose a file" description="Drop a CSV or JSON file, or click to browse." />
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload dataset file"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void handleFile(f);
              }}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
                dragging
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30'
                  : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50',
              )}
            >
              <span className="rounded-full bg-slate-100 p-3 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                <Icon name="upload" className="h-6 w-6" />
              </span>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Drag and drop your file here, or click to browse
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">CSV or JSON, up to 10 MB</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.json"
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
            </div>

            {file && (
              <div className="mt-4 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/50">
                <Icon name="file" className="h-5 w-5 shrink-0 text-slate-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{file.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{formatSize(file.size)}</p>
                </div>
                <Button size="sm" variant="outline" onClick={resetFile}>
                  Replace
                </Button>
              </div>
            )}

            {parsing && (
              <div className="mt-4">
                <LoadingState label="Parsing file…" rows={2} />
              </div>
            )}

            {parseError && !parsing && (
              <div className="mt-4">
                <ErrorState
                  message={parseError}
                  onRetry={() => {
                    setParseError(null);
                    fileInputRef.current?.click();
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {preview && (
          <>
            {/* Step 2 — Column mapping */}
            <Card>
              <CardHeader
                title="Map columns"
                description="Match your file's columns to the dataset fields. The question field is required."
              />
              <CardContent>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {DATASET_TARGETS.map((target) => (
                    <Field
                      key={target}
                      label={
                        <span>
                          {targetLabel(target)}
                          {target === QUESTION_TARGET && (
                            <Badge tone="danger" className="ml-2">
                              Required
                            </Badge>
                          )}
                        </span>
                      }
                      error={
                        target === QUESTION_TARGET && mapping[QUESTION_TARGET] == null
                          ? 'A column must be mapped to "question".'
                          : undefined
                      }
                    >
                      <Select
                        value={mapping[target] ?? ''}
                        onChange={(e) => handleMappingChange(target, e.target.value)}
                        aria-label={`Map column for ${targetLabel(target)}`}
                      >
                        <option value="">— not mapped —</option>
                        {preview.columns.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Step 3 — Validation summary */}
            <Card>
              <CardHeader title="Validation summary" description="Rows were validated against the current column mapping." />
              <CardContent>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <StatCard label="Valid rows" value={preview.validRows} icon="check" />
                  <StatCard label="Invalid rows" value={preview.invalidRows} icon="alert" />
                  <StatCard label="Warnings" value={preview.warnings.length} icon="info" />
                </div>

                {preview.warnings.length > 0 && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Warnings</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-700 dark:text-amber-300">
                      {preview.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {preview.errors.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">
                      Errors <span className="font-normal text-slate-500">({preview.errors.length} shown)</span>
                    </p>
                    <TableShell ariaLabel="Validation errors">
                      <thead>
                        <tr>
                          <Th className="w-24">Row</Th>
                          <Th>Message</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.errors.map((e, i) => (
                          <tr key={i}>
                            <Td>{e.row}</Td>
                            <Td>{e.message}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </TableShell>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Step 4 — Preview */}
            <Card>
              <CardHeader title="Preview" description="How the first mapped rows will be imported." />
              <CardContent>
                {mappedColumns.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Map at least one column above to preview the data.
                  </p>
                ) : (
                  <>
                    <TableShell ariaLabel="Dataset preview">
                      <thead>
                        <tr>
                          {mappedColumns.map((c) => (
                            <Th key={c}>{columnTargetLabel(c)}</Th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.sample.map((row, i) => (
                          <tr key={i}>
                            {mappedColumns.map((c) => (
                              <Td key={c}>{row[c] ?? ''}</Td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </TableShell>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Showing first {preview.sample.length} of {preview.validRows} valid rows.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Step 5 — Create */}
            <Card>
              <CardHeader title="Create benchmark" description="Give the imported question bank a name and a domain." />
              <CardContent>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field
                    label="Benchmark name"
                    error={!name.trim() ? 'A name is required.' : undefined}
                  >
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Customer Support QA Bank"
                    />
                  </Field>
                  <Field label="Domain">
                    <Select value={domain} onChange={(e) => setDomain(e.target.value)} aria-label="Domain">
                      {DOMAINS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="mt-4">
                  <Field label="Description" hint="Optional — what this question bank covers.">
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="A short description of the dataset…"
                    />
                  </Field>
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Button onClick={handleCreate} loading={creating} disabled={!canCreate}>
                    <Icon name="plus" className="h-4 w-4" />
                    Create Benchmark
                  </Button>
                  {!canCreate && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Name, a mapped question column, and at least one valid row are required.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
