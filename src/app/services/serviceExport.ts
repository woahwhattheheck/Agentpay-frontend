export type ServiceExportRow = Readonly<{
  serviceId: string;
  priceStroops: number;
  createdAt?: number | string | null;
}>;

export type ServiceExportFormat = "csv" | "json";

export type ServiceExportErrorCode =
  | "EXPORT_SERIALIZATION_FAILED"
  | "EXPORT_DOWNLOAD_UNAVAILABLE";

export class ServiceExportError extends Error {
  readonly code: ServiceExportErrorCode;

  constructor(code: ServiceExportErrorCode, message: string) {
    super(message);
    this.name = "ServiceExportError";
    this.code = code;
  }
}

const CSV_HEADER = "serviceId,priceStroops,createdAt";

export function escapeCsvCell(value: string): string {
  // Prefix spreadsheet formula triggers before CSV quoting so exported data is inert.
  const neutralized = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

export function serializeServicesCsv(
  services: readonly ServiceExportRow[],
): string {
  const rows = services.map((service) =>
    [
      service.serviceId,
      String(service.priceStroops),
      service.createdAt == null ? "" : String(service.createdAt),
    ]
      .map(escapeCsvCell)
      .join(","),
  );

  return [CSV_HEADER, ...rows].join("\r\n") + "\r\n";
}

export function serializeServicesJson(
  services: readonly ServiceExportRow[],
): string {
  return `${JSON.stringify(services, null, 2)}\n`;
}

export type ServiceExportPayload = Readonly<{
  content: string;
  mimeType: string;
  filename: string;
}>;

export function buildServiceExport(
  services: readonly ServiceExportRow[],
  format: ServiceExportFormat,
): ServiceExportPayload {
  try {
    if (format === "csv") {
      return {
        content: serializeServicesCsv(services),
        mimeType: "text/csv;charset=utf-8",
        filename: "services-current-view.csv",
      };
    }

    return {
      content: serializeServicesJson(services),
      mimeType: "application/json;charset=utf-8",
      filename: "services-current-view.json",
    };
  } catch {
    throw new ServiceExportError(
      "EXPORT_SERIALIZATION_FAILED",
      "Could not prepare the current services view for export.",
    );
  }
}
