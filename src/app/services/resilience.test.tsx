import { act, fireEvent, render, screen } from "@testing-library/react";
import { apiGet } from "../../lib/apiClient";
import { ToastProvider } from "../../components/ToastProvider";
import ServicesPage from "./page";
import { ServicesDashboardSkeleton } from "./ServicesDashboardSkeleton";
import {
  SERVICES_SECTION_ERROR_CODES,
  ServicesSectionBoundary,
} from "./ServicesSectionBoundary";

jest.mock("../../lib/apiClient", () => ({
  apiGet: jest.fn(),
}));

const apiGetMock = apiGet as jest.MockedFunction<typeof apiGet>;

function renderServicesPage() {
  return render(
    <ToastProvider>
      <ServicesPage />
    </ToastProvider>
  );
}

describe("services dashboard resilience", () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    window.history.replaceState(null, "", "/services");
  });

  it("announces loading and swaps equal-height skeleton rows for content", async () => {
    let resolveRequest:
      | ((value: {
          services: Array<{ serviceId: string; priceStroops: number }>;
          page: number;
          pageCount: number;
        }) => void)
      | undefined;

    apiGetMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }) as never
    );

    renderServicesPage();

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-busy", "true");

    const skeletonRows = screen.getAllByTestId("service-row-skeleton");
    expect(skeletonRows).toHaveLength(5);
    skeletonRows.forEach((row) => {
      expect(row.className).toContain("min-h-12");
    });

    await act(async () => {
      resolveRequest?.({
        services: [{ serviceId: "svc-live", priceStroops: 42 }],
        page: 1,
        pageCount: 1,
      });
    });

    const serviceLink = await screen.findByRole("link", {
      name: /svc-live/i,
    });
    expect(serviceLink.closest("li")?.className).toContain("min-h-12");
    expect(screen.queryByTestId("service-row-skeleton")).not.toBeInTheDocument();
  });

  it("renders the requested number of skeleton rows", () => {
    render(<ServicesDashboardSkeleton rows={2} />);

    expect(screen.getAllByTestId("service-row-skeleton")).toHaveLength(2);
  });

  it("contains a render crash to one section and logs it", () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    function BrokenSection(): never {
      throw new Error("render exploded");
    }

    render(
      <>
        <div>Healthy dashboard sibling</div>
        <ServicesSectionBoundary
          sectionName="Service list"
          errorCode={SERVICES_SECTION_ERROR_CODES.serviceList}
        >
          <BrokenSection />
        </ServicesSectionBoundary>
      </>
    );

    expect(screen.getByText("Healthy dashboard sibling")).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Service list unavailable.");
    expect(alert).toHaveTextContent(
      `Reference: ${SERVICES_SECTION_ERROR_CODES.serviceList}`
    );
    expect(alert).not.toHaveTextContent("render exploded");
    expect(consoleError).toHaveBeenCalledWith(
      "Services dashboard section failed",
      expect.objectContaining({
        code: SERVICES_SECTION_ERROR_CODES.serviceList,
        section: "Service list",
        error: expect.any(Error),
        componentStack: expect.any(String),
      })
    );

    consoleError.mockRestore();
  });

  it("re-renders only the failed section when retry is requested", () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    let shouldThrow = true;

    function FlakySection() {
      if (shouldThrow) {
        throw new Error("temporary render failure");
      }
      return <div>Recovered service list</div>;
    }

    render(
      <ServicesSectionBoundary
        sectionName="Service list"
        errorCode={SERVICES_SECTION_ERROR_CODES.serviceList}
      >
        <FlakySection />
      </ServicesSectionBoundary>
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(
      screen.getByRole("button", { name: "Retry section" })
    );

    expect(screen.getByText("Recovered service list")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    consoleError.mockRestore();
  });
});
