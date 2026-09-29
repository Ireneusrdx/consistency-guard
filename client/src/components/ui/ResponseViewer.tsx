import { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { Card } from './Card';

export interface ResponseViewerProps {
  title?: string;
  text: string;
  maxHeight?: number;
}

export function ResponseViewer({ title = 'Response', text, maxHeight = 320 }: ResponseViewerProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
    }
    timer.current = window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card
      title={title}
      actions={
        <Button variant="ghost" size="sm" onClick={handleCopy} aria-live="polite">
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M6 6H4.5a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V10.5M9.5 3.5h2a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-2"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      }
    >
      <pre
        className="overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-stone-700 dark:text-stone-300"
        style={{ maxHeight }}
      >
        {text}
      </pre>
    </Card>
  );
}
