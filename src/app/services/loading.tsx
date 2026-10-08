import { PageShell } from "@/components/PageShell";
import { ServicesDashboardSkeleton } from "./ServicesDashboardSkeleton";

export default function Loading() {
  return (
    <PageShell>
      <header
        aria-hidden="true"
        className="flex items-baseline justify-between"
      >
        <div className="h-9 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-9 w-28 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
      </header>
      <ServicesDashboardSkeleton />
    </PageShell>
  );
}
