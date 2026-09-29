export interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message }: LoadingStateProps) {
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-3 py-12">
      <svg
        className="h-8 w-8 animate-spin text-primary-600 dark:text-primary-400"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
        />
      </svg>
      {message && (
        <p className="text-sm text-stone-500 dark:text-stone-400">{message}</p>
      )}
    </div>
  );
}
