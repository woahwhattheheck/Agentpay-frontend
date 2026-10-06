"use client";

import { apiGet, apiPatch, apiPost } from "@/lib/apiClient";
import { resolveApiBase } from "@/lib/resolveApiBase";

const STORAGE_KEY = "agentpay:services:mutation-queue:v1";
const CHANGE_EVENT = "agentpay:services:mutation-queue-change";

export type ServiceMutationKind = "service.create" | "service.price.update";
export type ServiceMutationState = "pending" | "conflict";

export type ServiceMutation = {
  id: string;
  fingerprint: string;
  kind: ServiceMutationKind;
  serviceId: string;
  path: string;
  body: Record<string, unknown>;
  /** Price seen by the editor. A reconnect must not replace a newer price. */
  basePriceStroops?: number;
  createdAt: number;
  state: ServiceMutationState;
  errorCode?: "server_conflict" | "server_rejected";
  errorMessage?: string;
};

export type ServiceMutationQueueSnapshot = {
  pending: number;
  conflicts: number;
  total: number;
  isFlushing: boolean;
  conflictItems: Array<{ serviceId: string; errorCode: "server_conflict" | "server_rejected" }>;
};

export type RunServiceMutationResult<T> =
  | { queued: false; data: T }
  | { queued: true; mutation: ServiceMutation };

let flushPromise: Promise<void> | null = null;
const FLUSH_LOCK = "agentpay:services:mutation-queue-flush";

type MutationInput = Pick<ServiceMutation, "kind" | "serviceId" | "path" | "body" | "basePriceStroops">;

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readQueue(): ServiceMutation[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is ServiceMutation => {
      if (!entry || typeof entry !== "object") return false;
      const item = entry as Partial<ServiceMutation>;
      return (
        typeof item.id === "string" &&
        typeof item.fingerprint === "string" &&
        (item.kind === "service.create" || item.kind === "service.price.update") &&
        typeof item.serviceId === "string" &&
        typeof item.path === "string" &&
        typeof item.createdAt === "number" &&
        (item.state === "pending" || item.state === "conflict") &&
        !!item.body &&
        typeof item.body === "object" &&
        !Array.isArray(item.body) &&
        (item.kind !== "service.price.update" ||
          typeof item.basePriceStroops === "number")
      );
    });
  } catch {
    return [];
  }
}

function emitChange(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

function writeQueue(queue: ServiceMutation[]): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  emitChange();
}

function stableBody(body: Record<string, unknown>): string {
  return JSON.stringify(
    Object.keys(body)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = body[key];
        return result;
      }, {}),
  );
}

function fingerprintOf(
  kind: ServiceMutationKind,
  serviceId: string,
  path: string,
  body: Record<string, unknown>,
  basePriceStroops?: number,
): string {
  return `${kind}:${serviceId}:${path}:${basePriceStroops ?? ""}:${stableBody(body)}`;
}

function newMutationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function withQueueLock<T>(work: () => T | Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  return locks ? locks.request(FLUSH_LOCK, work) : Promise.resolve().then(work);
}

function enqueueMutation(input: MutationInput): Promise<ServiceMutation> {
  return withQueueLock(() => {
    const queue = readQueue();
    const fingerprint = fingerprintOf(
      input.kind, input.serviceId, input.path, input.body, input.basePriceStroops,
    );
    // Only adjacent repeats are duplicate clicks. A -> B -> A must retain all
    // three intended changes in order.
    const last = queue.at(-1);
    if (last?.state === "pending" && last.fingerprint === fingerprint) return last;

    const mutation: ServiceMutation = {
      ...input,
      id: newMutationId(),
      fingerprint,
      createdAt: Date.now(),
      state: "pending",
    };
    writeQueue([...queue, mutation]);
    return mutation;
  });
}

function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function isNetworkFailure(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  return error instanceof TypeError || (error instanceof Error && error.name === "ApiTimeoutError");
}

async function sendMutation<T>(
  mutation: Pick<ServiceMutation, "kind" | "path" | "body">,
  signal?: AbortSignal,
): Promise<T> {
  if (mutation.kind === "service.create") {
    return signal
      ? apiPost<T>(mutation.path, mutation.body, { signal })
      : apiPost<T>(mutation.path, mutation.body);
  }
  return signal
    ? apiPatch<T>(mutation.path, mutation.body, { signal })
    : apiPatch<T>(mutation.path, mutation.body);
}


async function sendQueuedMutation(mutation: ServiceMutation): Promise<void> {
  const response = await fetch(`${resolveApiBase()}${mutation.path}`, {
    method: mutation.kind === "service.create" ? "POST" : "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mutation.body),
    signal: AbortSignal.timeout(10_000),
  });

  if (response.ok) return;

  throw Object.assign(new Error("Server rejected queued change"), { status: response.status });
}

async function serverPrice(mutation: ServiceMutation): Promise<number | null> {
  try {
    const service = await apiGet<{ serviceId: string; priceStroops: number }>(
      `/api/v1/services/${encodeURIComponent(mutation.serviceId)}`,
    );
    return service.serviceId === mutation.serviceId &&
      typeof service.priceStroops === "number" ? service.priceStroops : null;
  } catch {
    return null;
  }
}

function replaceMutation(next: ServiceMutation): void {
  const queue = readQueue();
  writeQueue(queue.map((item) => (item.id === next.id ? next : item)));
}

function removeMutation(id: string): void {
  writeQueue(readQueue().filter((item) => item.id !== id));
}

function markConflict(mutation: ServiceMutation, error: unknown): void {
  const conflict = errorStatus(error) === 409 || errorStatus(error) === 412;
  replaceMutation({
    ...mutation,
    state: "conflict",
    errorCode: conflict ? "server_conflict" : "server_rejected",
    errorMessage: conflict
      ? "Server state changed. Review the service before retrying."
      : "Server rejected the queued change.",
  });
}

/**
 * Execute a services mutation immediately while online, otherwise persist it.
 * A browser-level network/timeout failure is also converted into a durable
 * queued mutation so an in-flight disconnect does not lose the operator's edit.
 */
export async function runServiceMutation<T>(
  input: MutationInput,
  options: { signal?: AbortSignal } = {},
): Promise<RunServiceMutationResult<T>> {
  if (input.kind === "service.price.update" &&
      typeof input.basePriceStroops !== "number") {
    throw new Error("Original service price is required for offline updates");
  }
  if (options.signal?.aborted) throw options.signal.reason;
  if ((typeof navigator !== "undefined" && !navigator.onLine) ||
      readQueue().length > 0) {
    return { queued: true, mutation: await enqueueMutation(input) };
  }

  try {
    const data = await sendMutation<T>(input, options.signal);
    return { queued: false, data };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (isNetworkFailure(error)) {
      return { queued: true, mutation: await enqueueMutation(input) };
    }
    throw error;
  }
}

/**
 * Flush queued service mutations in persisted enqueue order. A conflict stops the flush to preserve causal
 * ordering; the operator can retry or discard that conflict from the banner.
 *
 * Service IDs prevent duplicate creates. A price update is sent only when the
 * server still has the price seen by the editor. The browser Web Lock prevents
 * another tab from flushing the same queue concurrently where supported.
 */
export function flushServiceMutationQueue(): Promise<void> {
  if (flushPromise) return flushPromise;

  const flush = async () => {
    for (;;) {
      if (typeof navigator !== "undefined" && !navigator.onLine) break;
      const queue = readQueue();
      const mutation = queue[0];
      if (!mutation || mutation.state === "conflict") break;

      try {
        const before = await serverPrice(mutation);
        if (before === mutation.body.priceStroops) {
          removeMutation(mutation.id);
          continue;
        }
        if (mutation.kind === "service.price.update") {
          if (before === null) break; // Cannot check the original price safely.
          if (before !== mutation.basePriceStroops) {
            markConflict(mutation, Object.assign(new Error(), { status: 409 }));
            break;
          }
        } else if (before !== null) {
          markConflict(mutation, Object.assign(new Error(), { status: 409 }));
          break;
        }

        await sendQueuedMutation(mutation);
        const after = await serverPrice(mutation);
        if (after === null) break; // Keep the write for safe readback on retry.
        if (after !== mutation.body.priceStroops) {
          markConflict(
            mutation,
            Object.assign(new Error("Server state differs from the queued change"), { status: 409 }),
          );
          break;
        }
        removeMutation(mutation.id);
      } catch (error) {
        const status = errorStatus(error);
        if (status === 409 || status === 412) {
          const after = await serverPrice(mutation);
          if (after === mutation.body.priceStroops) {
            removeMutation(mutation.id);
            continue;
          }
          markConflict(mutation, error);
          break;
        }
        if (status !== 429 && status !== null && status < 500) {
          markConflict(mutation, error);
        }
        break;
      }
    }
  };
  const work = withQueueLock(flush);
  flushPromise = work.finally(() => {
    flushPromise = null;
    emitChange();
  });
  emitChange();
  return flushPromise;
}

export async function retryServiceMutationConflicts(): Promise<void> {
  await withQueueLock(() => {
    const queue = readQueue().map((item) =>
      item.state === "conflict"
        ? { ...item, state: "pending" as const, errorCode: undefined, errorMessage: undefined }
        : item,
    );
    writeQueue(queue);
  });
  return flushServiceMutationQueue();
}

export function discardServiceMutationConflicts(): Promise<void> {
  return withQueueLock(() => {
    writeQueue(readQueue().filter((item) => item.state !== "conflict"));
  });
}

export function getServiceMutationQueueSnapshot(): ServiceMutationQueueSnapshot {
  const queue = readQueue();
  const conflicts = queue.filter((item) => item.state === "conflict").length;
  return {
    pending: queue.length - conflicts,
    conflicts,
    total: queue.length,
    isFlushing: flushPromise !== null,
    conflictItems: queue
      .filter((item) => item.state === "conflict")
      .map((item) => ({
        serviceId: item.serviceId,
        errorCode: item.errorCode ?? "server_conflict",
      })),
  };
}

export function subscribeServiceMutationQueue(callback: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) callback();
  };
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

export const SERVICE_MUTATION_QUEUE_STORAGE_KEY = STORAGE_KEY;

