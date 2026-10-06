import {
  buildServiceExport,
  escapeCsvCell,
  serializeServicesCsv,
  serializeServicesJson,
  type ServiceExportRow,
} from "./serviceExport";

const rows: ServiceExportRow[] = [
  { serviceId: "svc-b", priceStroops: 20, createdAt: 200 },
  { serviceId: "svc-a", priceStroops: 10, createdAt: "100" },
];

describe("serviceExport", () => {
  it("exports only the supplied current view and preserves its display order", () => {
    const filteredAndSorted = [rows[1]];

    expect(JSON.parse(serializeServicesJson(filteredAndSorted))).toEqual([
      rows[1],
    ]);
  });

  it("quotes commas, quotes and newlines in CSV cells", () => {
    const csv = serializeServicesCsv([
      {
        serviceId: 'svc,"quoted"\nline',
        priceStroops: 10,
        createdAt: null,
      },
    ]);

    expect(csv).toContain('"svc,""quoted""\nline"');
  });

  it.each(["=2+3", "+2+3", "-2+3", "@SUM(A1:A2)"])(
    "neutralizes spreadsheet formula trigger %s",
    (value) => {
      expect(escapeCsvCell(value)).toBe(`"'${value}"`);
    },
  );

  it("produces a valid empty CSV export", () => {
    expect(serializeServicesCsv([])).toBe(
      "serviceId,priceStroops,createdAt\r\n",
    );
  });

  it("round-trips JSON data", () => {
    expect(JSON.parse(serializeServicesJson(rows))).toEqual(rows);
  });

  it("builds predictable client download metadata", () => {
    expect(buildServiceExport(rows, "csv")).toMatchObject({
      filename: "services-current-view.csv",
      mimeType: "text/csv;charset=utf-8",
    });
    expect(buildServiceExport(rows, "json")).toMatchObject({
      filename: "services-current-view.json",
      mimeType: "application/json;charset=utf-8",
    });
  });
});
