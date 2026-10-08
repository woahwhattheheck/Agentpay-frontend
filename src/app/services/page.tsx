"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/apiClient";
import { ErrorMessage } from "@/components/ErrorMessage";
import { EmptyState } from "@/components/EmptyState";
import { PageShell } from "@/components/PageShell";
import { Pagination } from "@/components/Pagination";
import { Spinner } from "@/components/Spinner";
import { truncateMiddle } from "@/lib/format";
import { useToast } from "@/components/ToastProvider";
import { useClipboard } from "@/lib/useClipboard";
import {
  type ServiceRow as Service,
  type ServicesFetchResponse,
  type ServicesFetchState,
  loadingServices,
  resolveServices,
  failedServices,
} from "@/lib/servicesFetchState";

type SortKey = "name" | "price" | "created" | "";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 25;
const VALID_SORT_KEYS: SortKey[] = ["name", "price", "created"];

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "price", label: "Price" },
  { key: "created", label: "Created" },
];

function getInitialSort(): { key: SortKey; dir: SortDir } {
  if (typeof window === "undefined") return { key: "", dir: "asc" };
  const params = new URLSearchParams(window.location.search);
  const s = params.get("sort") as SortKey | null;
  const d = params.get("dir") as SortDir | null;
  const key = s && (VALID_SORT_KEYS as string[]).includes(s) ? s : "";
  const dir = d === "asc" || d === "desc" ? d : "asc";
  return { key, dir };
}

function getAriaSort(key: SortKey, sortKey: SortKey, sortDir: SortDir): "ascending" | "descending" | "none" {
  if (key !== sortKey || !sortKey) return "none";
  return sortDir === "asc" ? "ascending" : "descending";
}

export function sortServices(
  services: Service[] | null,
  sortKey: SortKey,
  sortDir: SortDir
): Service[] | null {
  if (!services || services.length === 0 || !sortKey) {
    return services;
  }

  return services
    .map((service, index) => ({ service, index }))
    .sort((a, b) => {
      let comparison = 0;

      switch (sortKey) {
        case "name":
          comparison = a.service.serviceId.localeCompare(
            b.service.serviceId
          );
          break;

        case "price":
          comparison =
            a.service.priceStroops - b.service.priceStroops;
          break;

        case "created": {
          const firstCreatedAt =
            a.service.createdAt != null
              ? Number(a.service.createdAt)
              : null;

          const secondCreatedAt =
            b.service.createdAt != null
              ? Number(b.service.createdAt)
              : null;

          if (
            firstCreatedAt === null &&
            secondCreatedAt === null
          ) {
            comparison = 0;
          } else if (firstCreatedAt === null) {
            comparison = sortDir === "asc" ? 1 : -1;
          } else if (secondCreatedAt === null) {
            comparison = sortDir === "asc" ? -1 : 1;
          } else {
            comparison = firstCreatedAt - secondCreatedAt;
          }

          break;
        }
      }

      if (comparison !== 0) {
        return sortDir === "asc"
          ? comparison
          : -comparison;
      }

      return a.index - b.index;
    })
    .map(({ service }) => service);
}

function useSorted(
  services: Service[] | null,
  sortKey: SortKey,
  sortDir: SortDir
): Service[] | null {
  return useMemo(
    () => sortServices(services, sortKey, sortDir),
    [services, sortKey, sortDir]
  );
}

export function ServiceCopyButton({ serviceId }: { serviceId: string }) {
  const { copy, copied } = useClipboard({ timeout: 1500 });
  const { push } = useToast();

  const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const success = await copy(serviceId);
    if (success) {
      push("Service ID copied to clipboard", "info");
    } else {
      push("Failed to copy service ID", "error");
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={`Copy service ID for ${serviceId}`}
      title={`Copy service ID for ${serviceId}`}
      aria-live="polite"
      className="ml-3 inline-flex items-center gap-1.5 rounded border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
    >
      {copied ? (
        <span>Copied</span>
      ) : (
        <>
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.1"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 15.75s1.5 0 1.5 1.5V6a2.25 2.25 0 0 1 2.25-2.25h6.375A2.25 2.25 0 0 1 21 6v11.25a2.25 2.25 0 0 1-2.25 2.25H9z"
            />
          </svg>
          <span>Copy ID</span>
        </>
      )}
    </button>
  );
}

export default function ServicesPage() {
  // One discriminated union prevents stale content appearing behind errors/loading.
  const [servicesState, setServicesState] = useState<ServicesFetchState>(loadingServices);
  const [requestedPage, setRequestedPage] = useState(1);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [{ key: sortKey, dir: sortDir }, setSort] = useState<{ key: SortKey; dir: SortDir }>(
    getInitialSort
  );

  const sortedServices = useSorted(
    servicesState.status === "success" ? servicesState.services : null,
    sortKey,
    sortDir
  );

  const handleSort = (key: SortKey) => {
    const next: { key: SortKey; dir: SortDir } =
      key === sortKey
        ? { key, dir: sortDir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" };
    setSort(next);
    const params = new URLSearchParams(window.location.search);
    params.set("sort", next.key);
    params.set("dir", next.dir);
    window.history.replaceState(null, "", `?${params.toString()}`);
  };

  useEffect(() => {
    const handlePopState = () => {
      const { key, dir } = getInitialSort();
      setSort({ key, dir });
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const onPageChange = (nextPage: number) => {
    if (!Number.isSafeInteger(nextPage) || nextPage < 1) return;
    setServicesState(loadingServices());
    setRequestedPage(nextPage);
  };

  const retry = () => {
    // Refetch even when the requested page has not changed.
    setServicesState(loadingServices());
    setRetryGeneration((generation) => generation + 1);
  };

  useEffect(() => {
    // Cancellation keeps an older request from committing after page/retry.
    let cancelled = false;
    setServicesState(loadingServices());

    apiGet<ServicesFetchResponse>(
      `/api/v1/services?page=${requestedPage}&limit=${PAGE_SIZE}`
    )
      .then((body) => {
        if (!cancelled) setServicesState(resolveServices(body, requestedPage));
      })
      .catch(() => {
        // Do not expose network/server exceptions or internal endpoints to users.
        if (!cancelled) setServicesState(failedServices());
      });

    return () => {
      cancelled = true;
    };
  }, [requestedPage, retryGeneration]);

  return (
    <PageShell>
      <header className="flex items-baseline justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Services</h1>
        <Link
          href="/services/new"
          className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:bg-white dark:text-black"
        >
          New service
        </Link>
      </header>
      {servicesState.status === "error" && (
        <ErrorMessage
          title="Failed to load services"
          detail={`${servicesState.error.code}: ${servicesState.error.message}`}
          onRetry={retry}
        />
      )}
      {servicesState.status === "loading" && (
        <div className="flex justify-center py-10">
          <Spinner label="Loading services" />
        </div>
      )}
      {servicesState.status === "empty" && (
        <>
          <span aria-live="polite" aria-atomic="true" className="sr-only">
            No services available
          </span>
          <EmptyState
            title="No services registered yet."
            description="Create the first service to start tracking request pricing."
            action={
              <Link
                href="/services/new"
                className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:bg-white dark:text-black"
              >
                New service
              </Link>
            }
          />
        </>
      )}
      {servicesState.status === "success" && (
        <>
          <span aria-live="polite" aria-atomic="true" className="sr-only">
            { `Loaded ${servicesState.services.length} services` }
          </span>
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {sortedServices?.map((s) => (
            <li
              key={s.serviceId}
              className="-mx-4 flex items-center justify-between rounded-lg px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
            >
              <Link
                href={`/services/${encodeURIComponent(s.serviceId)}`}
                className="flex flex-1 items-center justify-between rounded-lg hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:hover:bg-zinc-900"
              >
                <span
                  className="font-mono text-sm"
                  title={s.serviceId}
                  aria-label={s.serviceId}
                >
                  {truncateMiddle(s.serviceId)}
                </span>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {s.priceStroops} stroops / request
                </span>
              </Link>
              <ServiceCopyButton serviceId={s.serviceId} />
            </li>
          ))}
        </ul>
        </>
      )}
      {(servicesState.status === "success" || servicesState.status === "empty") && (
        <Pagination
          page={servicesState.page}
          pageCount={servicesState.pageCount}
          onChange={onPageChange}
        />
      )}
    </PageShell>
  );
}

