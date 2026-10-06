"use client";

import { useState } from "react";
import {
  buildServiceExport,
  ServiceExportError,
  type ServiceExportFormat,
  type ServiceExportRow,
} from "./serviceExport";

type Props = {
  services: readonly ServiceExportRow[];
};

type ExportFailure = Readonly<{
  code: string;
  message: string;
}>;

function downloadPayload(content: string, mimeType: string, filename: string) {
  if (
    typeof document === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    throw new ServiceExportError(
      "EXPORT_DOWNLOAD_UNAVAILABLE",
      "Downloads are unavailable in this browser.",
    );
  }

  const blobUrl = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  link.rel = "noopener";

  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
}

export function ServiceExportActions({ services }: Props) {
  const [exporting, setExporting] = useState<ServiceExportFormat | null>(null);
  const [failure, setFailure] = useState<ExportFailure | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const startExport = async (format: ServiceExportFormat) => {
    setExporting(format);
    setFailure(null);
    setStatus(null);

    // Yield once before serializing. The current view is page-bounded, so this
    // keeps interaction responsive without inventing a server-side export path.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

    try {
      const payload = buildServiceExport(services, format);
      downloadPayload(payload.content, payload.mimeType, payload.filename);
      setStatus(
        `Exported ${services.length} service${services.length === 1 ? "" : "s"} as ${format.toUpperCase()}.`,
      );
    } catch (error) {
      const typed =
        error instanceof ServiceExportError
          ? error
          : new ServiceExportError(
              "EXPORT_DOWNLOAD_UNAVAILABLE",
              "Could not download the current services view.",
            );

      setFailure({ code: typed.code, message: typed.message });
    } finally {
      setExporting(null);
    }
  };

  return (
    <section
      aria-labelledby="services-export-heading"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div>
        <h2 id="services-export-heading" className="text-sm font-medium">
          Export current view
        </h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Downloads the services shown on this page in their current display
          order.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={exporting !== null}
          aria-busy={exporting === "csv" || undefined}
          onClick={() => void startExport("csv")}
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-zinc-700"
        >
          {exporting === "csv" ? "Exporting CSV..." : "Export CSV"}
        </button>
        <button
          type="button"
          disabled={exporting !== null}
          aria-busy={exporting === "json" || undefined}
          onClick={() => void startExport("json")}
          className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:bg-white dark:text-black"
        >
          {exporting === "json" ? "Exporting JSON..." : "Export JSON"}
        </button>
      </div>

      {status && (
        <p role="status" aria-live="polite" className="w-full text-xs text-zinc-600 dark:text-zinc-400">
          {status}
        </p>
      )}
      {failure && (
        <p role="alert" className="w-full text-xs text-rose-600">
          {failure.code}: {failure.message}
        </p>
      )}
    </section>
  );
}
