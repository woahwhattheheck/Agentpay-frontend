"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { useServiceMutationQueue } from "@/lib/useServiceMutationQueue";
import {
  discardServiceMutationConflicts,
  flushServiceMutationQueue,
  retryServiceMutationConflicts,
} from "@/lib/serviceMutationQueue";

/**
 * Global connectivity + queued-mutation status surface.
 *
 * Queued service mutations live in localStorage, so this banner can flush them
 * after a reload or navigation. Conflicts remain visible until the operator
 * explicitly retries or discards them.
 */
export function OfflineBanner() {
  const { isOnline } = useOnlineStatus();
  const queue = useServiceMutationQueue();
  const [dismissed, setDismissed] = useState(false);

  const dismiss = useCallback(() => setDismissed(true), []);

  useEffect(() => {
    setDismissed(false);
    if (isOnline) {
      void flushServiceMutationQueue();
    }
  }, [isOnline]);

  const retry = useCallback(() => {
    setDismissed(false);
    if (queue.conflicts > 0) {
      void retryServiceMutationConflicts();
    } else {
      void flushServiceMutationQueue();
    }
  }, [queue.conflicts]);

  if (dismissed) return null;
  if (isOnline && queue.total === 0 && !queue.isFlushing) return null;

  let message = "You are offline. Some features may be unavailable.";
  if (queue.conflicts > 0) {
    message = `${queue.conflicts} queued service change${queue.conflicts === 1 ? " has" : "s have"} a server conflict. Review the affected service, then retry or discard the change.`;
  } else if (!isOnline && queue.total > 0) {
    message = `You are offline. ${queue.total} service change${queue.total === 1 ? " is" : "s are"} queued and will sync when you reconnect.`;
  } else if (queue.isFlushing) {
    message = `Syncing ${queue.pending} queued service change${queue.pending === 1 ? "" : "s"}…`;
  } else if (isOnline && queue.pending > 0) {
    message = `${queue.pending} service change${queue.pending === 1 ? " is" : "s are"} waiting to sync. Retry when the connection is available.`;
  }

  return (
    <div
      role="alert"
      className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-3 bg-amber-50 px-4 py-2 text-sm text-amber-900 shadow-sm dark:bg-amber-950 dark:text-amber-200"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-4 w-4 shrink-0"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
      <span>{message}</span>
      {queue.conflictItems.slice(0, 3).map(({ serviceId, errorCode }) => (
        <Link
          key={serviceId}
          href={`/services/${encodeURIComponent(serviceId)}`}
          className="underline underline-offset-2"
        >
          {serviceId} ({errorCode})
        </Link>
      ))}
      {isOnline && queue.total > 0 && !queue.isFlushing && (
        <button
          type="button"
          onClick={retry}
          className="rounded border border-current px-2 py-1 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        >
          Retry sync
        </button>
      )}
      {queue.conflicts > 0 && (
        <button
          type="button"
          onClick={() => void discardServiceMutationConflicts()}
          className="rounded border border-current px-2 py-1 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        >
          Discard conflicted changes
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss offline notification"
        className="ml-auto rounded p-0.5 text-lg leading-none opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
      >
        <span aria-hidden="true">&times;</span>
      </button>
    </div>
  );
}
