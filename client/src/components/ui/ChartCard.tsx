import type * as React from 'react';
import { Card } from './Card';

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  height?: number;
}

export function ChartCard({ title, subtitle, children, footer, height = 280 }: ChartCardProps) {
  return (
    <Card title={title} subtitle={subtitle}>
      <div style={{ height }}>{children}</div>
      {footer && (
        <div className="mt-4 border-t border-stone-200 pt-4 dark:border-stone-800">{footer}</div>
      )}
    </Card>
  );
}
