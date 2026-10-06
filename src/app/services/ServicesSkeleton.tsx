import { PageShell } from "@/components/PageShell";

export const SERVICE_ROW_LAYOUT_CLASS =
  "-mx-4 flex min-h-14 items-center justify-between rounded-lg px-4 py-3";

export function ServicesListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading services"
    >
      <span className="sr-only">Loading…</span>
      <ul
        aria-hidden="true"
        className="divide-y divide-zinc-200 dark:divide-zinc-800"
      >
        {Array.from({ length: rows }, (_, index) => (
          <li
            key={index}
            data-testid="services-skeleton-row"
            className={SERVICE_ROW_LAYOUT_CLASS}
          >
            <span className="h-4 w-40 animate-pulse rounded bg-zinc-200 motion-reduce:animate-none dark:bg-zinc-800" />
            <div className="flex items-center gap-3">
              <span className="h-4 w-28 animate-pulse rounded bg-zinc-200 motion-reduce:animate-none dark:bg-zinc-800" />
              <span className="h-7 w-16 animate-pulse rounded border border-zinc-200 bg-zinc-100 motion-reduce:animate-none dark:border-zinc-800 dark:bg-zinc-900" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ServicesPageSkeleton() {
  return (
    <PageShell>
      <header
        aria-hidden="true"
        className="flex items-baseline justify-between"
      >
        <span className="h-9 w-32 animate-pulse rounded bg-zinc-200 motion-reduce:animate-none dark:bg-zinc-800" />
        <span className="h-9 w-28 animate-pulse rounded-full bg-zinc-200 motion-reduce:animate-none dark:bg-zinc-800" />
      </header>
      <ServicesListSkeleton />
    </PageShell>
  );
}
