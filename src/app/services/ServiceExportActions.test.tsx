import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ServiceExportActions } from "./ServiceExportActions";

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
let clickSpy: jest.SpyInstance;

beforeEach(() => {
  URL.createObjectURL = jest.fn(() => "blob:services-export");
  URL.revokeObjectURL = jest.fn();
  clickSpy = jest
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation();
});

afterEach(() => {
  clickSpy.mockRestore();
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

describe("ServiceExportActions", () => {
  const displayedServices = [
    { serviceId: "svc-filtered", priceStroops: 7, createdAt: 123 },
  ];

  it("downloads the displayed service rows as CSV", async () => {
    render(<ServiceExportActions services={displayedServices} />);

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    await waitFor(() => {
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    const blob = (URL.createObjectURL as jest.Mock).mock.calls[0][0] as Blob;
    expect(blob.type).toBe("text/csv;charset=utf-8");

    const link = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(link.download).toBe("services-current-view.csv");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Exported 1 service as CSV.",
    );
  });

  it("allows a valid empty-view export", async () => {
    render(<ServiceExportActions services={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Export JSON" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Exported 0 services as JSON.",
    );
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("surfaces a stable typed download error", async () => {
    URL.createObjectURL = jest.fn(() => {
      throw new Error("blocked");
    });

    render(<ServiceExportActions services={displayedServices} />);

    fireEvent.click(screen.getByRole("button", { name: "Export JSON" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "EXPORT_DOWNLOAD_UNAVAILABLE",
    );
  });
});
