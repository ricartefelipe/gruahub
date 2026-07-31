import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`gh-surface border-dashed p-8 text-center ${className}`}>
      <p className="font-medium text-[color:var(--text)]">{title}</p>
      {description ? <p className="mt-1 text-sm text-[color:var(--text-soft)]">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
