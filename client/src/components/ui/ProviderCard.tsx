import { useState } from 'react';
import type { Provider } from '../../types';
import { cn } from '../../lib/utils';
import { Badge } from './Badge';
import { Button } from './Button';
import { Card } from './Card';
import { Input } from './Input';

export interface ProviderCardProps {
  provider: Provider;
  onSave: (key: string) => Promise<void>;
  onTest: () => Promise<{ ok: boolean; message: string }>;
  onRemove: () => Promise<void>;
}

type Busy = 'save' | 'test' | 'remove' | null;

export function ProviderCard({ provider, onSave, onTest, onRemove }: ProviderCardProps) {
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; message: string } | null>(null);

  const initials = provider.name
    .split(/\s+/)
    .map((word) => word.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleSave = async () => {
    if (!keyInput.trim()) {
      setError('API key is required.');
      return;
    }
    setError(undefined);
    setTestMsg(null);
    setBusy('save');
    try {
      await onSave(keyInput.trim());
      setKeyInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save key.');
    } finally {
      setBusy(null);
    }
  };

  const handleTest = async () => {
    setBusy('test');
    try {
      const result = await onTest();
      setTestMsg(result);
    } catch (err) {
      setTestMsg({ ok: false, message: err instanceof Error ? err.message : 'Test failed.' });
    } finally {
      setBusy(null);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm(`Remove the API key for ${provider.name}?`)) return;
    setBusy('remove');
    try {
      await onRemove();
      setTestMsg(null);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 font-bold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
          >
            {initials}
          </div>
          <div>
            <h3 className="font-semibold text-stone-900 dark:text-stone-100">{provider.name}</h3>
            <a
              href={provider.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
            >
              Documentation
            </a>
          </div>
        </div>
        {provider.connected ? (
          <Badge variant="success">Connected</Badge>
        ) : (
          <Badge>Not connected</Badge>
        )}
      </div>

      {provider.connected ? (
        <div className="mt-4 space-y-3">
          <code className="block truncate rounded-lg bg-stone-100 px-3 py-2 font-mono text-sm text-stone-700 dark:bg-stone-800 dark:text-stone-300">
            {provider.maskedKey ?? '••••••••'}
          </code>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" loading={busy === 'test'} onClick={handleTest}>
              Test Connection
            </Button>
            <Button
              variant="ghost"
              size="sm"
              loading={busy === 'remove'}
              onClick={handleRemove}
              className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              Remove
            </Button>
          </div>
          {testMsg && (
            <p
              role="status"
              className={cn(
                'text-sm',
                testMsg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
              )}
            >
              {testMsg.message}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="relative">
            <Input
              label="API key"
              type={showKey ? 'text' : 'password'}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Enter API key"
              error={error}
              className="pr-16"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              aria-label={showKey ? 'Hide API key' : 'Show API key'}
              className="absolute right-2 top-[29px] rounded-md px-2 py-1 text-xs font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <Button variant="primary" size="sm" loading={busy === 'save'} onClick={handleSave}>
            Save Key
          </Button>
        </div>
      )}
    </Card>
  );
}
