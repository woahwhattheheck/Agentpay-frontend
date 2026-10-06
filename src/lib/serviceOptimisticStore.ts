"use client";

import { useEffect, useSyncExternalStore } from "react";

export type ServiceRecord = {
  serviceId: string;
  priceStroops: number;
  createdAt?: number | string | null;
};

export type ServiceMutationErrorCode =
  | "SERVICE_WRITE_FAILED"
  | "SERVICE_RECONCILE_FAILED";

export class ServiceMutationError extends Error {
  readonly code: ServiceMutationErrorCode;
  readonly serviceId: string;

  constructor(
    code: ServiceMutationErrorCode,
    serviceId: string,
    message: string,
  ) {
    super(message);
    this.name = "ServiceMutationError";
    this.code = code;
    this.serviceId = serviceId;
  }
}

type ServiceEntry = {
  base: ServiceRecord | null;
  baseRevision: number;
  pending: Map<number, ServiceRecord>;
};

type OptimisticServiceMutationOptions = {
  serviceId: string;
  current?: ServiceRecord | null;
  optimistic: ServiceRecord;
  mutate: () => Promise<unknown>;
  reconcile: () => Promise<ServiceRecord>;
  failureMessage?: string;
  reconcileMessage?: string;
};

const entries = new Map<string, ServiceEntry>();
const listeners = new Set<() => void>();
let storeVersion = 0;
let nextMutationRevision = 0;

const DEFAULT_FAILURE_MESSAGE =
  "Could not save the service change. The previous value was restored.";
const DEFAULT_RECONCILE_MESSAGE =
  "The service was saved, but its latest server value could not be confirmed. Refresh before editing again.";

function cloneService(service: ServiceRecord): ServiceRecord {
  return { ...service };
}

function sameService(
  first: ServiceRecord | null,
  second: ServiceRecord,
): boolean {
  return (
    first?.serviceId === second.serviceId &&
    first.priceStroops === second.priceStroops &&
    first.createdAt === second.createdAt
  );
}

function getOrCreateEntry(serviceId: string): ServiceEntry {
  let entry = entries.get(serviceId);
  if (!entry) {
    entry = {
      base: null,
      baseRevision: 0,
      pending: new Map<number, ServiceRecord>(),
    };
    entries.set(serviceId, entry);
  }
  return entry;
}

function emitChange() {
  storeVersion += 1;
  for (const listener of listeners) {
    listener();
  }
}

function visibleValue(entry: ServiceEntry): ServiceRecord | null {
  let newestRevision = -1;
  let newest: ServiceRecord | null = null;

  for (const [revision, service] of entry.pending) {
    if (revision > newestRevision) {
      newestRevision = revision;
      newest = service;
    }
  }

  return newest ?? entry.base;
}

function removePending(
  serviceId: string,
  entry: ServiceEntry,
  revision: number,
) {
  entry.pending.delete(revision);
  if (entry.base === null && entry.pending.size === 0) {
    entries.delete(serviceId);
  }
}

export function subscribeServiceOptimisticStore(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getServiceOptimisticStoreVersion() {
  return storeVersion;
}

export function hydrateServiceSnapshot(service: ServiceRecord) {
  const entry = getOrCreateEntry(service.serviceId);
  if (sameService(entry.base, service)) {
    return;
  }

  entry.base = cloneService(service);
  emitChange();
}

export function hydrateServiceSnapshots(services: ServiceRecord[]) {
  let changed = false;

  for (const service of services) {
    const entry = getOrCreateEntry(service.serviceId);
    if (sameService(entry.base, service)) {
      continue;
    }

    entry.base = cloneService(service);
    changed = true;
  }

  if (changed) {
    emitChange();
  }
}

export function getOptimisticService(
  serviceId: string,
): ServiceRecord | null {
  const entry = entries.get(serviceId);
  return entry ? visibleValue(entry) : null;
}

export function useOptimisticService(
  serviceId: string,
  serverService: ServiceRecord | null,
): ServiceRecord | null {
  const version = useSyncExternalStore(
    subscribeServiceOptimisticStore,
    getServiceOptimisticStoreVersion,
    getServiceOptimisticStoreVersion,
  );

  useEffect(() => {
    if (serverService) {
      hydrateServiceSnapshot(serverService);
    }
  }, [serverService]);

  void version;
  return getOptimisticService(serviceId) ?? serverService;
}

export function useOptimisticServices(
  serverServices: ServiceRecord[] | null,
): ServiceRecord[] | null {
  const version = useSyncExternalStore(
    subscribeServiceOptimisticStore,
    getServiceOptimisticStoreVersion,
    getServiceOptimisticStoreVersion,
  );

  useEffect(() => {
    if (serverServices) {
      hydrateServiceSnapshots(serverServices);
    }
  }, [serverServices]);

  void version;

  if (!serverServices) {
    return null;
  }

  return serverServices.map(
    (service) => getOptimisticService(service.serviceId) ?? service,
  );
}

/**
 * Apply one service mutation immediately and reconcile it with canonical
 * server state after the write succeeds.
 *
 * Each service has its own revision ledger. Older responses can update the
 * hidden base only when no newer successful mutation has already committed,
 * while the newest pending optimistic value always stays visible. A failed
 * mutation removes only its own revision, revealing the newest remaining
 * value or the exact pre-mutation base.
 */
export async function runOptimisticServiceMutation(
  options: OptimisticServiceMutationOptions,
): Promise<ServiceRecord> {
  if (options.optimistic.serviceId !== options.serviceId) {
    throw new Error("optimistic service id does not match mutation key");
  }

  const entry = getOrCreateEntry(options.serviceId);
  if (entry.base === null && options.current) {
    entry.base = cloneService(options.current);
  }

  const revision = ++nextMutationRevision;
  entry.pending.set(revision, cloneService(options.optimistic));
  emitChange();

  try {
    await options.mutate();
  } catch {
    removePending(options.serviceId, entry, revision);
    emitChange();
    throw new ServiceMutationError(
      "SERVICE_WRITE_FAILED",
      options.serviceId,
      options.failureMessage ?? DEFAULT_FAILURE_MESSAGE,
    );
  }

  let canonical: ServiceRecord;
  try {
    canonical = await options.reconcile();
    if (canonical.serviceId !== options.serviceId) {
      throw new Error("reconciled service id does not match mutation key");
    }
  } catch {
    if (revision >= entry.baseRevision) {
      entry.base = cloneService(options.optimistic);
      entry.baseRevision = revision;
    }
    removePending(options.serviceId, entry, revision);
    emitChange();
    throw new ServiceMutationError(
      "SERVICE_RECONCILE_FAILED",
      options.serviceId,
      options.reconcileMessage ?? DEFAULT_RECONCILE_MESSAGE,
    );
  }

  if (revision >= entry.baseRevision) {
    entry.base = cloneService(canonical);
    entry.baseRevision = revision;
  }

  removePending(options.serviceId, entry, revision);
  emitChange();
  return canonical;
}

export function __resetServiceOptimisticStoreForTests() {
  entries.clear();
  nextMutationRevision = 0;
  emitChange();
}
