import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  ErrorState,
  Field,
  Icon,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Select,
  Slider,
  Switch,
  toast,
} from '../components/ui';
import {
  changePassword,
  deleteAccount,
  exportUserData,
  getSettings,
  listSessions,
  removeProviderCredential,
  revokeAllSessions,
  revokeSession,
  saveProviderCredential,
  testProviderConnection,
  updateSettings,
} from '../lib/api';
import type { ProviderInfo, ScoringWeights, SessionInfo, UserSettings } from '../lib/api';
import { DOMAINS } from '../lib/options';
import { downloadTextFile, formatDateTime } from '../lib/utils';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'An unexpected error occurred.';
}

function applyTheme(theme: 'light' | 'dark' | 'system'): void {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    // 'light' removes the class; 'system' also removes it (follows OS default)
    root.classList.remove('dark');
  }
}

// ------------------------------------------------------------------ profile
function ProfileSection({
  initial,
  onSaved,
}: {
  initial: UserSettings['profile'];
  onSaved: (s: UserSettings) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await updateSettings({ profile: { name: name.trim(), email: initial.email } });
      onSaved(updated);
      toast('Profile updated', { tone: 'success' });
    } catch (e) {
      toast('Failed to save profile', { desc: errMsg(e), tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Profile" description="Your public name and account email." />
      <CardContent className="space-y-4">
        <Field label="Name" htmlFor="profile-name">
          <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </Field>
        <Field label="Email" htmlFor="profile-email" hint="Your sign-in email cannot be changed here.">
          <Input
            id="profile-email"
            type="email"
            value={initial.email}
            disabled
            autoComplete="email"
          />
        </Field>
        <Button onClick={save} loading={saving}>
          Save profile
        </Button>
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------- security
function SecuritySection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessLoading, setSessLoading] = useState(true);
  const [revokeTarget, setRevokeTarget] = useState<SessionInfo | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeAllOpen, setRevokeAllOpen] = useState(false);
  const [revokeAllSaving, setRevokeAllSaving] = useState(false);

  const loadSessions = async () => {
    setSessLoading(true);
    try {
      setSessions(await listSessions());
    } catch (e) {
      toast('Failed to load sessions', { desc: errMsg(e), tone: 'error' });
    } finally {
      setSessLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handlePassword = async () => {
    if (next.length < 8) {
      setPwError('New password must be at least 8 characters.');
      return;
    }
    if (next !== confirm) {
      setPwError('New passwords do not match.');
      return;
    }
    setPwError(null);
    setPwSaving(true);
    try {
      await changePassword(current, next);
      toast('Password changed', { tone: 'success' });
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (e) {
      setPwError(errMsg(e));
    } finally {
      setPwSaving(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await revokeSession(revokeTarget.id);
      toast('Session revoked', { tone: 'success' });
      setRevokeTarget(null);
      await loadSessions();
    } catch (e) {
      toast('Failed to revoke session', { desc: errMsg(e), tone: 'error' });
    } finally {
      setRevoking(false);
    }
  };

  const handleRevokeAll = async () => {
    setRevokeAllSaving(true);
    try {
      await revokeAllSessions();
      toast('All other sessions logged out', { tone: 'success' });
      setRevokeAllOpen(false);
      await loadSessions();
    } catch (e) {
      toast('Failed to log out sessions', { desc: errMsg(e), tone: 'error' });
    } finally {
      setRevokeAllSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Security" description="Manage your password and active sessions." />
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Change password</h4>
          <Field label="Current password" htmlFor="pw-current">
            <Input
              id="pw-current"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
          </Field>
          <Field label="New password" htmlFor="pw-new" error={pwError ?? undefined}>
            <Input
              id="pw-new"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Confirm new password" htmlFor="pw-confirm">
            <Input
              id="pw-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Button onClick={handlePassword} loading={pwSaving}>
            Change password
          </Button>
        </div>

        <div className="space-y-3 border-t border-slate-200 pt-6 dark:border-slate-800">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Active sessions</h4>
          {sessLoading ? (
            <LoadingState label="Loading sessions…" rows={2} />
          ) : sessions.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No active sessions.</p>
          ) : (
            <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {sessions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{s.device}</p>
                      {s.current && <Badge tone="info">This device</Badge>}
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                      {s.ip} · Last active {formatDateTime(s.lastActive)}
                    </p>
                  </div>
                  {!s.current && (
                    <Button variant="outline" size="sm" onClick={() => setRevokeTarget(s)}>
                      Revoke
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div>
            <Button variant="outline" size="sm" onClick={() => setRevokeAllOpen(true)}>
              Log out all other sessions
            </Button>
          </div>
        </div>
      </CardContent>

      <ConfirmDialog
        open={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleRevoke}
        title="Revoke session"
        description={`Revoke the session on "${revokeTarget?.device ?? ''}"? That device will be signed out immediately.`}
        confirmLabel="Revoke"
        loading={revoking}
      />
      <ConfirmDialog
        open={revokeAllOpen}
        onClose={() => setRevokeAllOpen(false)}
        onConfirm={handleRevokeAll}
        title="Log out all other sessions"
        description="This will sign you out of every device except this one. Continue?"
        confirmLabel="Log out all"
        loading={revokeAllSaving}
      />
    </Card>
  );
}

// ----------------------------------------------------------------- providers
function ProvidersSection({
  providers,
  refresh,
}: {
  providers: ProviderInfo[];
  refresh: () => Promise<void>;
}) {
  const [testingId, setTestingId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ProviderInfo | null>(null);
  const [removing, setRemoving] = useState(false);
  const [keyFor, setKeyFor] = useState<ProviderInfo | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [keySaving, setKeySaving] = useState(false);

  const handleTest = async (p: ProviderInfo) => {
    setTestingId(p.id);
    try {
      const res = await testProviderConnection(p.id);
      toast(res.ok ? 'Connection successful' : 'Connection failed', {
        desc: res.message,
        tone: res.ok ? 'success' : 'error',
      });
    } catch (e) {
      toast('Connection test failed', { desc: errMsg(e), tone: 'error' });
    } finally {
      setTestingId(null);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await removeProviderCredential(removeTarget.id);
      toast('API key removed', { tone: 'success' });
      setRemoveTarget(null);
      await refresh();
    } catch (e) {
      toast('Failed to remove API key', { desc: errMsg(e), tone: 'error' });
    } finally {
      setRemoving(false);
    }
  };

  const handleSaveKey = async () => {
    if (!keyFor) return;
    if (!apiKey.trim()) {
      toast('API key is required', { tone: 'error' });
      return;
    }
    setKeySaving(true);
    try {
      await saveProviderCredential(keyFor.id, apiKey.trim());
      toast('API key saved', { tone: 'success' });
      setKeyFor(null);
      setApiKey('');
      await refresh();
    } catch (e) {
      toast('Failed to save API key', { desc: errMsg(e), tone: 'error' });
    } finally {
      setKeySaving(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="AI Providers"
        description="Connect provider API keys to run evaluations against real models."
      />
      <CardContent>
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {providers.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{p.name}</p>
                  {p.freeTier && <Badge tone="success">Free</Badge>}
                  <Badge tone={p.connected ? 'success' : 'default'}>
                    {p.connected ? 'Connected' : 'Not connected'}
                  </Badge>
                  <a
                    href={p.signupUrl ?? p.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                  >
                    {p.freeTier ? 'Get a free key' : 'Docs'}
                  </a>
                </div>
                <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">
                  {p.maskedKey ?? '—'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => handleTest(p)} loading={testingId === p.id}>
                  Test
                </Button>
                <Button variant="outline" size="sm" onClick={() => setKeyFor(p)}>
                  Add/Update key
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                  onClick={() => setRemoveTarget(p)}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>

      <Modal
        open={keyFor !== null}
        onClose={() => {
          setKeyFor(null);
          setApiKey('');
        }}
        title={keyFor ? `${keyFor.name} API key` : 'API key'}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setKeyFor(null);
                setApiKey('');
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveKey} loading={keySaving}>
              Save key
            </Button>
          </>
        }
      >
        <Field
          label="API key"
          htmlFor="provider-api-key"
          hint="Stored encrypted server-side; never displayed again."
        >
          <Input
            id="provider-api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste your API key"
            autoComplete="off"
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemove}
        title="Remove API key"
        description={`Remove the stored API key for ${removeTarget?.name ?? ''}? Evaluations will no longer use this provider.`}
        confirmLabel="Remove"
        loading={removing}
      />
    </Card>
  );
}

// -------------------------------------------------------------- preferences
const MODES = ['quick', 'consistency', 'deep', 'adversarial'] as const;

function PreferencesSection({
  initial,
  onSaved,
}: {
  initial: UserSettings['preferences'];
  onSaved: (s: UserSettings) => void;
}) {
  const [runs, setRuns] = useState(initial.defaultRuns);
  const [mode, setMode] = useState(initial.defaultMode);
  const [domains, setDomains] = useState<string[]>(initial.defaultDomains);
  const [saving, setSaving] = useState(false);

  const toggleDomain = (d: string) => {
    setDomains((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const save = async () => {
    const clampedRuns = Math.min(10, Math.max(1, Math.round(Number(runs) || 1)));
    setRuns(clampedRuns);
    setSaving(true);
    try {
      const updated = await updateSettings({
        preferences: { defaultRuns: clampedRuns, defaultMode: mode, defaultDomains: domains },
      });
      onSaved(updated);
      toast('Preferences saved', { tone: 'success' });
    } catch (e) {
      toast('Failed to save preferences', { desc: errMsg(e), tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Evaluation Preferences" description="Defaults applied to new evaluations." />
      <CardContent className="space-y-4">
        <Field label="Default runs" htmlFor="pref-runs" hint="Number of repeated runs per model (1–10).">
          <Input
            id="pref-runs"
            type="number"
            min={1}
            max={10}
            value={runs}
            onChange={(e) => setRuns(e.target.valueAsNumber)}
            className="max-w-32"
          />
        </Field>
        <Field label="Default mode" htmlFor="pref-mode">
          <Select id="pref-mode" value={mode} onChange={(e) => setMode(e.target.value)} className="max-w-64">
            {MODES.map((m) => (
              <option key={m} value={m}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset>
          <legend className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
            Default domains
          </legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {DOMAINS.map((d) => (
              <Checkbox key={d} label={d} checked={domains.includes(d)} onChange={() => toggleDomain(d)} />
            ))}
          </div>
        </fieldset>
        <Button onClick={save} loading={saving}>
          Save preferences
        </Button>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------- weights
const WEIGHT_FIELDS: { key: keyof ScoringWeights; label: string }[] = [
  { key: 'accuracy', label: 'Accuracy' },
  { key: 'consistency', label: 'Consistency' },
  { key: 'relevance', label: 'Relevance' },
  { key: 'completeness', label: 'Completeness' },
  { key: 'grounding', label: 'Grounding' },
  { key: 'instructionFollowing', label: 'Instruction following' },
];

function WeightsSection({
  initial,
  onSaved,
}: {
  initial: ScoringWeights;
  onSaved: (s: UserSettings) => void;
}) {
  const [weights, setWeights] = useState<ScoringWeights>(initial);
  const [saving, setSaving] = useState(false);

  const total = WEIGHT_FIELDS.reduce((a, f) => a + weights[f.key], 0);
  const valid = total === 100;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const updated = await updateSettings({ scoringWeights: weights });
      onSaved(updated);
      toast('Scoring weights saved', { tone: 'success' });
    } catch (e) {
      toast('Failed to save scoring weights', { desc: errMsg(e), tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Scoring Weights"
        description="How each dimension contributes to the overall reliability score."
      />
      <CardContent className="space-y-5">
        {WEIGHT_FIELDS.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor={`weight-${f.key}`}
                className="text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                {f.label}
              </label>
              <span className="font-mono text-sm text-slate-900 dark:text-white">{weights[f.key]}%</span>
            </div>
            <Slider
              id={`weight-${f.key}`}
              min={0}
              max={100}
              step={1}
              value={weights[f.key]}
              onChange={(e) => setWeights({ ...weights, [f.key]: Number(e.target.value) })}
              aria-label={`${f.label} weight`}
            />
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-800">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Total</p>
          <p className={`font-mono text-sm font-semibold ${valid ? 'text-slate-900 dark:text-white' : 'text-red-600 dark:text-red-400'}`}>
            {total}%
          </p>
        </div>
        {!valid && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            Weights must total 100% (currently {total}%)
          </p>
        )}
        <Button onClick={save} loading={saving} disabled={!valid}>
          Save weights
        </Button>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------- notifications
function NotificationsSection({
  initial,
  onSaved,
}: {
  initial: UserSettings['notifications'];
  onSaved: (s: UserSettings) => void;
}) {
  const [emailOnComplete, setEmailOnComplete] = useState(initial.emailOnComplete);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await updateSettings({
        notifications: { emailOnComplete, emailOnConflict: false, weeklyDigest: false },
      });
      onSaved(updated);
      toast('Notifications saved', { tone: 'success' });
    } catch (e) {
      toast('Failed to save notifications', { desc: errMsg(e), tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Notifications" description="Choose what you want to be notified about." />
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-white">Email on completion</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Get notified when an evaluation finishes.
            </p>
          </div>
          <Switch
            aria-label="Email on completion"
            checked={emailOnComplete}
            onChange={(e) => setEmailOnComplete(e.target.checked)}
          />
        </div>
        <Button onClick={save} loading={saving}>
          Save notifications
        </Button>
      </CardContent>
    </Card>
  );
}

// --------------------------------------------------------------- appearance
type ThemeId = 'light' | 'dark' | 'system';

const THEME_OPTIONS: { id: ThemeId; label: string; icon: 'sun' | 'moon' | 'gear' }[] = [
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
  { id: 'system', label: 'System', icon: 'gear' },
];

function AppearanceSection({
  initial,
  onSaved,
}: {
  initial: UserSettings['appearance'];
  onSaved: (s: UserSettings) => void;
}) {
  const [theme, setTheme] = useState<ThemeId>(initial.theme);
  const [saving, setSaving] = useState(false);

  const select = (t: ThemeId) => {
    setTheme(t);
    applyTheme(t);
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated = await updateSettings({ appearance: { theme } });
      onSaved(updated);
      toast('Appearance saved', { tone: 'success' });
    } catch (e) {
      toast('Failed to save appearance', { desc: errMsg(e), tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Appearance" description="Choose how Consistency Guard looks." />
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Theme">
          {THEME_OPTIONS.map((o) => (
            <Button
              key={o.id}
              variant={theme === o.id ? 'secondary' : 'outline'}
              onClick={() => select(o.id)}
              aria-pressed={theme === o.id}
            >
              <Icon name={o.icon} className="h-4 w-4" /> {o.label}
            </Button>
          ))}
        </div>
        <Button onClick={save} loading={saving}>
          Save appearance
        </Button>
      </CardContent>
    </Card>
  );
}

// --------------------------------------------------------------------- data
function DataSection() {
  const [exporting, setExporting] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [delSaving, setDelSaving] = useState(false);
  const [delPassword, setDelPassword] = useState('');
  const [delError, setDelError] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      const json = await exportUserData();
      downloadTextFile('consistency-guard-export.json', json, 'application/json');
      toast('Data exported', { tone: 'success' });
    } catch (e) {
      toast('Export failed', { desc: errMsg(e), tone: 'error' });
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!delPassword) {
      setDelError('Enter your password to confirm.');
      return;
    }
    setDelError(null);
    setDelSaving(true);
    try {
      await deleteAccount(delPassword);
      toast('Account deleted', { tone: 'success' });
      setDelOpen(false);
      setDelPassword('');
    } catch (e) {
      setDelError(errMsg(e));
    } finally {
      setDelSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Data Management" description="Export a copy of your data or delete your account." />
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-white">Export my data</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Download a JSON archive of your evaluations, reports, and settings.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport} loading={exporting}>
            <Icon name="download" className="h-4 w-4" /> Export my data
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-white">Delete account</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Permanently delete your account and all associated data. This cannot be undone.
            </p>
          </div>
          <Button variant="danger" size="sm" onClick={() => setDelOpen(true)}>
            <Icon name="trash" className="h-4 w-4" /> Delete account
          </Button>
        </div>
      </CardContent>

      <Modal
        open={delOpen}
        onClose={() => {
          setDelOpen(false);
          setDelPassword('');
          setDelError(null);
        }}
        title="Delete account"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setDelOpen(false);
                setDelPassword('');
                setDelError(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={delSaving}>
              Delete account
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This permanently deletes your account and all associated data — evaluations, reports,
            benchmarks, and settings. This cannot be undone.
          </p>
          <Field label="Confirm with your password" htmlFor="del-password">
            <Input
              id="del-password"
              type="password"
              value={delPassword}
              onChange={(e) => setDelPassword(e.target.value)}
              placeholder="Your current password"
              autoComplete="current-password"
            />
          </Field>
          {delError && <p className="text-sm text-red-600 dark:text-red-400">{delError}</p>}
        </div>
      </Modal>
    </Card>
  );
}

// -------------------------------------------------------------------- page
export default function Settings() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setSettings(await getSettings());
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const refresh = async () => {
    try {
      setSettings(await getSettings());
    } catch (e) {
      toast('Failed to refresh settings', { desc: errMsg(e), tone: 'error' });
    }
  };

  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage your profile, security, AI providers, and evaluation defaults."
      />
      {loading ? (
        <LoadingState label="Loading settings…" />
      ) : error || !settings ? (
        <ErrorState message={error ?? 'Failed to load settings.'} onRetry={load} />
      ) : (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <ProfileSection initial={settings.profile} onSaved={setSettings} />
          <SecuritySection />
          <ProvidersSection providers={settings.providers} refresh={refresh} />
          <PreferencesSection initial={settings.preferences} onSaved={setSettings} />
          <WeightsSection initial={settings.scoringWeights} onSaved={setSettings} />
          <NotificationsSection initial={settings.notifications} onSaved={setSettings} />
          <AppearanceSection initial={settings.appearance} onSaved={setSettings} />
          <DataSection />
        </div>
      )}
    </>
  );
}
