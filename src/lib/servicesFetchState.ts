/** Isolated loading state shared by the services dashboard and its focused tests.
 * A single tagged union makes loading / empty / error / success exclusive.
 * No raw response, token or server error is exposed in the error state.
 */
export type ServiceRow = {
  serviceId: string;
  priceStroops: number;
  createdAt?: number | string | null;
};

export type ServicesFetchResponse = {
  services?: ServiceRow[];
  items?: ServiceRow[];
  page?: number;
  pageCount?: number;
};

type LoadedPage = { page: number; pageCount: number };

export type ServicesFetchState =
  | { status: "loading" }
  | { status: "empty" } & LoadedPage
  | { status: "error"; error: { code: "SERVICES_FETCH_FAILED"; message: string } }
  | ({ status: "success"; services: ServiceRow[] } & LoadedPage);

export function loadingServices(): ServicesFetchState {
  return { status: "loading" };
}

export function failedServices(): ServicesFetchState {
  return {
    status: "error",
    error: {
      code: "SERVICES_FETCH_FAILED",
      message: "Services are temporarily unavailable. Please try again.",
    },
  };
}

function positivePage(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && Number(value) > 0
    ? Number(value)
    : fallback;
}

export function resolveServices(
  response: ServicesFetchResponse,
  requestedPage: number
): ServicesFetchState {
  const rows = response?.services ?? response?.items ?? [];
  if (!Array.isArray(rows) || !rows.every(
    (row) => row && typeof row.serviceId === "string" &&
      typeof row.priceStroops === "number" && Number.isFinite(row.priceStroops)
  )) {
    return failedServices();
  }

  const pageCount = positivePage(response.pageCount, 1);
  const page = Math.min(positivePage(response.page, positivePage(requestedPage, 1)), pageCount);
  return rows.length === 0
    ? { status: "empty", page, pageCount }
    : { status: "success", services: rows, page, pageCount };
}
