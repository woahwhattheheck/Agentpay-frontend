type ServicesDashboardSkeletonProps = {
  rows?: number;
};

/**
 * Mirrors the service-row footprint so loading-to-content swaps keep the
 * dashboard geometry stable while the status region announces progress.
 */
export function ServicesDashboardSkeleton({
  rows = 5,
}: ServicesDashboardSkeletonProps) {
  const rowCount = Math.max(1, Math.floor(rows));

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="space-y-3"
    >
      <span className="sr-only">Loading services</span>
      <ul
        aria-hidden="true"
        className="divide-y divide-zinc-200 dark:divide-zinc-800"
      >
        {Array.from({ length: rowCount }, (_, index) => (
          <li
            key={index}
            data-testid="service-row-skeleton"
            className="-mx-4 flex min-h-12 items-center justify-between px-4 py-3"
          >
            <div className="h-4 w-40 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-4 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          </li>
        ))}
      </ul>
    </div>
  );
}
