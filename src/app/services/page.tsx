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

type Service = { serviceId: string; priceStroops: number; createdAt?: number | string | null };
type ServicesResponse = {
  services?: Service[];
  items?: Service[];
  page?: number;
  pageCount?: number;
};

type SortKey = "name" | "price" | "created" | "";
type SortDir = "asc" | "desc";
type PriceFilter = "all" | "free" | "paid";
type ViewState = {
  page: number;
  sortKey: SortKey;
  sortDir: SortDir;
  query: string;
  priceFilter: PriceFilter;
};

const PAGE_SIZE = 25;
const FILTER_DEBOUNCE_MS = 300;
const VALID_SORT_KEYS: Exclude<SortKey, "">[] = ["name", "price", "created"];
const VALID_PRICE_FILTERS: PriceFilter[] = ["all", "free", "paid"];

const COLUMNS: { key: Exclude<SortKey, "">; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "price", label: "Price" },
  { key: "created", label: "Created" },
];

function parsePage(value: string | null): number {
  if (value === null) return 1;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function readServicesViewState(
  search = typeof window === "undefined" ? "" : window.location.search
): ViewState {
  const params = new URLSearchParams(search);
  const rawSort = params.get("sort");
  const sortKey = VALID_SORT_KEYS.includes(rawSort as Exclude<SortKey, "">)
    ? (rawSort as Exclude<SortKey, "">)
    : "";
  const rawDir = params.get("dir");
  const sortDir: SortDir =
    sortKey && (rawDir === "asc" || rawDir === "desc") ? rawDir : "asc";
  const rawPrice = params.get("price");
  const priceFilter = VALID_PRICE_FILTERS.includes(rawPrice as PriceFilter)
    ? (rawPrice as PriceFilter)
    : "all";

  return {
    page: parsePage(params.get("page")),
    sortKey,
    sortDir,
    query: params.get("q") ?? "",
    priceFilter,
  };
}

export function servicesViewSearch(state: ViewState): string {
  const params = new URLSearchParams();
  if (state.page > 1) params.set("page", String(state.page));
  if (state.sortKey) {
    params.set("sort", state.sortKey);
    params.set("dir", state.sortDir);
  }
  if (state.query) params.set("q", state.query);
  if (state.priceFilter !== "all") params.set("price", state.priceFilter);
  const search = params.toString();
  return search ? "?" + search : "";
}

function replaceServicesViewUrl(state: ViewState) {
  if (typeof window === "undefined") return;
  window.history.replaceState(
    null,
    "",
    window.location.pathname + servicesViewSearch(state) + window.location.hash
  );
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

export function filterServices(
  services: Service[] | null,
  query: string,
  priceFilter: PriceFilter
): Service[] | null {
  if (!services) return services;
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return services.filter((service) => {
    const textMatches =
      normalizedQuery.length === 0 ||
      service.serviceId.toLocaleLowerCase().includes(normalizedQuery);
    const priceMatches =
      priceFilter === "all" ||
      (priceFilter === "free"
        ? service.priceStroops === 0
        : service.priceStroops > 0);
    return textMatches && priceMatches;
  });
}

function useVisibleServices(
  services: Service[] | null,
  query: string,
  priceFilter: PriceFilter,
  sortKey: SortKey,
  sortDir: SortDir
): Service[] | null {
  return useMemo(() => {
    const filtered = filterServices(services, query, priceFilter);
    return sortServices(filtered, sortKey, sortDir);
  }, [services, query, priceFilter, sortKey, sortDir]);
}

function formatCreatedAt(createdAt?: number | string | null) {
  if (createdAt == null) return "—";
  const numeric = Number(createdAt);
  const date = Number.isFinite(numeric)
    ? new Date(numeric)
    : new Date(String(createdAt));
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
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
  const initialView = useMemo(() => readServicesViewState(), []);
  const [services, setServices] = useState<Service[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(initialView.page);
  const [requestedPage, setRequestedPage] = useState(initialView.page);
  const [pageCount, setPageCount] = useState(1);
  const [view, setView] = useState<ViewState>(initialView);
  const [filterDraft, setFilterDraft] = useState(initialView.query);

  const visibleServices = useVisibleServices(
    services,
    view.query,
    view.priceFilter,
    view.sortKey,
    view.sortDir
  );

  const handleSort = (key: Exclude<SortKey, "">) => {
    let sortKey: SortKey = key;
    let sortDir: SortDir = "asc";

    if (view.sortKey === key && view.sortDir === "asc") {
      sortDir = "desc";
    } else if (view.sortKey === key && view.sortDir === "desc") {
      sortKey = "";
    }

    const next = { ...view, sortKey, sortDir };
    setView(next);
    replaceServicesViewUrl(next);
  };

  useEffect(() => {
    const handlePopState = () => {
      const next = readServicesViewState();
      setView(next);
      setFilterDraft(next.query);
      setLoading(true);
      setError(null);
      setServices(null);
      setRequestedPage(next.page);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (filterDraft === view.query) return;

    const timeout = window.setTimeout(() => {
      const next = { ...view, query: filterDraft, page: 1 };
      setView(next);
      replaceServicesViewUrl(next);
      if (requestedPage !== 1) {
        setLoading(true);
        setError(null);
        setServices(null);
        setRequestedPage(1);
      }
    }, FILTER_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [filterDraft, requestedPage, view]);

  const handlePriceFilter = (priceFilter: PriceFilter) => {
    const next = { ...view, priceFilter, page: 1 };
    setView(next);
    replaceServicesViewUrl(next);
    if (requestedPage !== 1) {
      setLoading(true);
      setError(null);
      setServices(null);
      setRequestedPage(1);
    }
  };

  const clearFilters = () => {
    setFilterDraft("");
    const next = { ...view, query: "", priceFilter: "all" as PriceFilter, page: 1 };
    setView(next);
    replaceServicesViewUrl(next);
    if (requestedPage !== 1) {
      setLoading(true);
      setError(null);
      setServices(null);
      setRequestedPage(1);
    }
  };

  const onPageChange = (nextPage: number) => {
    const next = { ...view, page: nextPage };
    setView(next);
    replaceServicesViewUrl(next);
    setLoading(true);
    setError(null);
    setServices(null);
    setRequestedPage(nextPage);
  };

  useEffect(() => {
    let cancelled = false;

    apiGet<ServicesResponse>(
      `/api/v1/services?page=${requestedPage}&limit=${PAGE_SIZE}`
    )
      .then((body) => {
        if (cancelled) return;

        const nextServices = body.services ?? body.items ?? [];
        const nextPageCount = Math.max(body.pageCount ?? 1, 1);
        const nextPage = Math.min(
          Math.max(body.page ?? requestedPage, 1),
          nextPageCount
        );

        setServices(nextServices);
        setPageCount(nextPageCount);
        setPage(nextPage);
        if (nextPage !== requestedPage) {
          setView((current) => {
            const next = { ...current, page: nextPage };
            replaceServicesViewUrl(next);
            return next;
          });
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message ?? "failed to load");
        setPageCount(1);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [requestedPage]);

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
      <ErrorMessage title="Failed to load services" detail={error} />

      <div className="grid gap-3 rounded-xl border border-zinc-200 p-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto] dark:border-zinc-800">
        <label className="grid gap-1 text-sm font-medium">
          <span>Filter services</span>
          <input
            type="search"
            value={filterDraft}
            onChange={(event) => setFilterDraft(event.target.value)}
            placeholder="Service ID"
            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 font-normal outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-700"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          <span>Price type</span>
          <select
            value={view.priceFilter}
            onChange={(event) =>
              handlePriceFilter(event.target.value as PriceFilter)
            }
            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 font-normal outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-700"
          >
            <option value="all">All prices</option>
            <option value="free">Free</option>
            <option value="paid">Paid</option>
          </select>
        </label>
        <button
          type="button"
          onClick={clearFilters}
          disabled={
            filterDraft.length === 0 &&
            view.query.length === 0 &&
            view.priceFilter === "all"
          }
          className="self-end rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700"
        >
          Clear filters
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-10">
          <Spinner label="Loading services" />
        </div>
      )}

      {!loading && services && services.length === 0 && (
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
      )}

      {!loading &&
        services &&
        services.length > 0 &&
        visibleServices &&
        visibleServices.length === 0 && (
          <div
            role="status"
            className="rounded-xl border border-dashed border-zinc-300 px-6 py-10 text-center dark:border-zinc-700"
          >
            <p className="font-medium">No services match these filters.</p>
            <p className="mt-1 text-sm text-zinc-500">
              Clear or adjust the current filters to see this page&apos;s services.
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium dark:border-zinc-700"
            >
              Clear filters
            </button>
          </div>
        )}

      {!loading && visibleServices && visibleServices.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full border-collapse" aria-label="Services">
            <thead className="bg-zinc-50 text-left text-sm dark:bg-zinc-900">
              <tr>
                {COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={getAriaSort(
                      column.key,
                      view.sortKey,
                      view.sortDir
                    )}
                    className="px-4 py-3 font-medium"
                  >
                    <button
                      type="button"
                      onClick={() => handleSort(column.key)}
                      className="inline-flex items-center gap-1 rounded px-1 py-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                      aria-label={"Sort by " + column.label}
                    >
                      {column.label}
                      <span aria-hidden="true">
                        {view.sortKey === column.key
                          ? view.sortDir === "asc"
                            ? "↑"
                            : "↓"
                          : "↕"}
                      </span>
                    </button>
                  </th>
                ))}
                <th scope="col" className="px-4 py-3 font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {visibleServices.map((service) => (
                <tr
                  key={service.serviceId}
                  className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={"/services/" + encodeURIComponent(service.serviceId)}
                      className="inline-flex rounded-lg font-mono text-sm hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:hover:bg-zinc-900"
                      title={service.serviceId}
                      aria-label={service.serviceId}
                    >
                      {truncateMiddle(service.serviceId)}
                      <span className="sr-only">
                        {" " + service.priceStroops + " stroops / request"}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                    {service.priceStroops} stroops / request
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                    {formatCreatedAt(service.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ServiceCopyButton serviceId={service.serviceId} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && services && services.length > 0 && (
        <Pagination
          page={page}
          pageCount={pageCount}
          onChange={onPageChange}
        />
      )}
    </PageShell>
  );
}

