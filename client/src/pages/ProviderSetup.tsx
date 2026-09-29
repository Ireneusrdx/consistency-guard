/**
 * Provider setup: connect AI provider API keys. Keys are encrypted at rest;
 * the browser only ever sees masked values.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Input,
  Card,
  CardContent,
  Badge,
  Icon,
  Field,
  LoadingState,
  ErrorState,
  ConfirmDialog,
  PageHeader,
  toast,
} from '../components/ui';
import {
  getSettings,
  saveProviderCredential,
  testProviderConnection,
  removeProviderCredential,
  toApiError,
  type ProviderInfo,
} from '../lib/api';

type TestResult = { ok: boolean; message: string } | null;

// ------------------------------------------------------------------- data --
function useProviderList() {
  const [providers, setProviders] = useState<ProviderInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getSettings().then(
      (s) => {
        if (!cancelled) setProviders(s.providers);
      },
      (e) => {
        if (!cancelled) setError(toApiError(e).message);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return {
    providers,
    error,
    loading: providers === null && error === null,
    reload: () => setReloadKey((k) => k + 1),
  };
}

// ------------------------------------------------------------------- card --
function ProviderCard({
  provider,
  onSave,
  onTest,
  onRemove,
}: {
  provider: ProviderInfo;
  onSave: (apiKey: string) => Promise<void>;
  onTest: () => Promise<{ ok: boolean; message: string }>;
  onRemove: () => Promise<void>;
}) {
  const [apiKey, setApiKey] = useState('');
  const [keyError, setKeyError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [testResult, setTestResult] = useState<TestResult>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKey.trim().length < 8) {
      setKeyError('Enter a valid API key');
      return;
    }
    setKeyError(undefined);
    setSaving(true);
    try {
      await onSave(apiKey.trim());
      setApiKey('');
      setTestResult(null);
    } catch (err) {
      setKeyError(toApiError(err).message);
      toast('Could not save the API key', { tone: 'error', desc: toApiError(err).message });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await onTest());
    } finally {
      setTesting(false);
    }
  };

  const handleRemove = async () => {
    setConfirmOpen(false);
    setRemoving(true);
    try {
      await onRemove();
      setTestResult(null);
    } catch (err) {
      toast('Could not remove the API key', { tone: 'error', desc: toApiError(err).message });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-slate-900 dark:text-white">{provider.name}</h3>
              {provider.freeTier && <Badge tone="success">Free</Badge>}
            </div>
            {provider.freeTier && provider.signupUrl ? (
              <a
                href={provider.signupUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-400"
              >
                Get a free key — no credit card
              </a>
            ) : (
              <a
                href={provider.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-brand-700 hover:underline dark:text-brand-400"
              >
                Get an API key
              </a>
            )}
            {provider.freeTier && (
              <p className="mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">
                One key unlocks 40+ models. Free Pollen credits refill hourly.
              </p>
            )}
          </div>
          {provider.connected ? <Badge tone="success">Connected</Badge> : <Badge>Not connected</Badge>}
        </div>

        {provider.connected && provider.maskedKey && (
          <p className="font-mono text-xs text-slate-500 dark:text-slate-400" aria-label="Saved key preview">
            {provider.maskedKey}
          </p>
        )}
        {provider.connected && provider.lastTestedAt && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Last tested {new Date(provider.lastTestedAt).toLocaleString()}
          </p>
        )}

        <form onSubmit={handleSave} className="space-y-2">
          <Field
            label={provider.connected ? 'Replace API key' : 'API key'}
            error={keyError}
            htmlFor={`key-${provider.id}`}
          >
            <Input
              id={`key-${provider.id}`}
              type="password"
              autoComplete="off"
              placeholder={provider.keyHint ? `Paste your key (${provider.keyHint})` : 'Paste your API key'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              aria-invalid={!!keyError}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" loading={saving}>
              {provider.connected ? 'Update key' : 'Save key'}
            </Button>
            {provider.connected && (
              <>
                <Button type="button" variant="outline" size="sm" loading={testing} onClick={handleTest}>
                  Test
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  loading={removing}
                  onClick={() => setConfirmOpen(true)}
                  className="text-red-600 hover:text-red-700 dark:text-red-400"
                >
                  <Icon name="trash" className="h-4 w-4" /> Remove
                </Button>
              </>
            )}
          </div>
        </form>

        {testResult && (
          <p
            role="status"
            className={`text-xs ${testResult.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
          >
            {testResult.message}
          </p>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleRemove}
        title={`Remove ${provider.name} key?`}
        description="The stored key will be deleted. You will need to add it again to run live evaluations with this provider."
        confirmLabel="Remove key"
      />
    </Card>
  );
}

// ------------------------------------------------------------------- page --
export default function ProviderSetup() {
  const navigate = useNavigate();
  const { providers, error, loading, reload } = useProviderList();

  // Local overrides reflecting the latest successful save/test/remove.
  const [overrides, setOverrides] = useState<Record<string, Partial<ProviderInfo>>>({});

  const merged: ProviderInfo[] = (providers ?? []).map((p) => ({ ...p, ...overrides[p.id] }));

  const handleSave = async (providerId: string, apiKey: string) => {
    const info = await saveProviderCredential(providerId, apiKey);
    setOverrides((prev) => ({ ...prev, [providerId]: info }));
    toast('API key saved', { tone: 'success' });
  };

  const handleTest = async (providerId: string): Promise<{ ok: boolean; message: string }> => {
    try {
      const result = await testProviderConnection(providerId);
      if (result.ok) {
        setOverrides((prev) => ({
          ...prev,
          [providerId]: { lastTestedAt: new Date().toISOString() },
        }));
      }
      return result;
    } catch (e) {
      return { ok: false, message: toApiError(e).message };
    }
  };

  const handleRemove = async (providerId: string) => {
    await removeProviderCredential(providerId);
    setOverrides((prev) => ({
      ...prev,
      [providerId]: { connected: false, maskedKey: null, lastTestedAt: null },
    }));
    toast('API key removed', { tone: 'success' });
  };

  return (
    <div>
      <PageHeader
        title="Connect AI Providers"
        description="Add API keys to run live evaluations. Keys are encrypted at rest and never shown again."
      />

      {loading && <LoadingState label="Loading providers…" />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && merged.length === 0 && (
        <ErrorState message="No providers are available right now." onRetry={reload} />
      )}
      {!loading && !error && merged.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {merged.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              onSave={(apiKey) => handleSave(provider.id, apiKey)}
              onTest={() => handleTest(provider.id)}
              onRemove={() => handleRemove(provider.id)}
            />
          ))}
        </div>
      )}

      <Card className="mt-8">
        <CardContent className="flex items-start gap-4 p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
            <Icon name="shield" className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">How your credentials are handled</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Credentials are encrypted at rest and used only for AI evaluation requests. They are never logged, never
              returned in full, and never exposed to the browser.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="mt-8 flex flex-wrap items-center justify-end gap-4">
        <Button onClick={() => navigate('/evaluate/models')}>Save &amp; Continue</Button>
      </div>
    </div>
  );
}
