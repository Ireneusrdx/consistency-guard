import { Component, type ReactNode } from 'react';
import { Button, Icon } from './ui';

interface Props {
  children: ReactNode;
  /** Shown in the fallback so the user knows which page failed. */
  pageName?: string;
}

interface State {
  error: Error | null;
}

/**
 * Route-level error boundary. If a page throws during render, the whole app
 * used to unmount into a blank screen — this shows a diagnostic fallback
 * with a recovery action instead.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    // eslint-disable-next-line no-console
    console.error(`[RouteErrorBoundary${this.props.pageName ? `:${this.props.pageName}` : ''}]`, error);
  }

  private handleReset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950">
            <Icon name="alert" className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">
            Something went wrong{this.props.pageName ? ` on ${this.props.pageName}` : ''}
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            The page ran into an unexpected error and couldn&apos;t render. Your data is safe —
            try reloading the page.
          </p>
          <p className="mt-3 max-w-full break-words rounded-md bg-slate-100 px-3 py-2 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            {this.state.error.message}
          </p>
          <div className="mt-6 flex gap-2">
            <Button variant="primary" onClick={this.handleReset}>
              Try again
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Reload page
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
