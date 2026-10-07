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

export function filterServicesForView<T extends ServiceExportRow>(
  services: readonly T[],
  query: string,
): T[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return services.slice();

  return services.filter((service) =>
    service.serviceId.toLowerCase().includes(normalizedQuery),
  );
}

const CSV_HEADER = "serviceId,priceStroops,createdAt";

const SPREADSHEET_FORMULA_PREFIX = /^[\t\r\n ]*[=+\-@]/;

export function escapeCsvCell(value: string): string {
  // Spreadsheet importers may ignore leading whitespace/control characters
  // before deciding that a cell is a formula. Prefix the original value so it
  // stays inert without trimming or otherwise changing user data.
  const neutralized = SPREADSHEET_FORMULA_PREFIX.test(value)
    ? `'${value}`
    : value;
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
