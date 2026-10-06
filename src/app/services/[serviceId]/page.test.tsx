import { render, screen, fireEvent } from "@testing-library/react";
import ServiceDetailPage from "./page";
import { apiGet } from "@/lib/apiClient";
import { __resetServiceOptimisticStoreForTests } from "@/lib/serviceOptimisticStore";

jest.mock("@/lib/apiClient", () => ({
  apiGet: jest.fn(),
}));

jest.mock("react", () => {
  const originalReact = jest.requireActual("react");
  return {
    ...originalReact,
    use: (usable: unknown) => {
      const u = usable as { _value?: unknown } | null | undefined;
      if (u && u._value) {
        return u._value;
      }
      return originalReact.use(usable);
    },
  };
});

jest.mock("next/navigation", () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
    };
  },
  usePathname() {
    return "/services/test-service";
  },
}));

const mockApiGet = apiGet as jest.MockedFunction<typeof apiGet>;

describe("ServiceDetailPage", () => {
  const originalClipboard = { ...global.navigator.clipboard };

  beforeEach(() => {
    mockApiGet.mockReset();
    __resetServiceOptimisticStoreForTests();
    // Mock navigator.clipboard
    Object.defineProperty(global.navigator, "clipboard", {
      value: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(global.navigator, "clipboard", {
      value: originalClipboard,
      writable: true,
      configurable: true,
    });
  });

  function renderPage(serviceId: string) {
    const params = Promise.resolve({ serviceId }) as Promise<{
      serviceId: string;
    }> & {
      _value: { serviceId: string };
    };
    params._value = { serviceId };
    return render(<ServiceDetailPage params={params} />);
  }

  it("renders service details and usage rollup when both requests succeed", async () => {
    mockApiGet
      .mockResolvedValueOnce({
        serviceId: "svc-1",
        priceStroops: 15000000,
      } as never)
      .mockResolvedValueOnce({
        serviceId: "svc-1",
        total: 150,
        agents: 12,
      } as never);

    renderPage("svc-1");

    // Verify service ID heading
    expect(
      await screen.findByRole("heading", { name: "svc-1" }),
    ).toBeInTheDocument();

    // Verify Price row value
    expect(
      await screen.findByText("1.50 XLM (15000000 stroops)"),
    ).toBeInTheDocument();

    // Verify Usage row badge and rollup details
    expect(screen.getByText("available")).toBeInTheDocument();
    expect(screen.getByText("150 / 12")).toBeInTheDocument();

    // Verify copy button is present
    const copyBtn = screen.getByRole("button", { name: /copy/i });
    expect(copyBtn).toBeInTheDocument();

    // Test clipboard copy action
    fireEvent.click(copyBtn);
    expect(global.navigator.clipboard.writeText).toHaveBeenCalledWith("svc-1");

    // Wait for copied state feedback
    await screen.findByRole("button", { name: /copied/i });

    // Verify links
    const editLink = screen.getByRole("link", { name: /edit price/i });
    expect(editLink).toHaveAttribute("href", "/services/svc-1/edit");

    const agentsLink = screen.getByRole("link", { name: /top agents/i });
    expect(agentsLink).toHaveAttribute("href", "/services/svc-1/agents");
  });

  it("swallows rollup fetch failure and displays absent badge", async () => {
    mockApiGet
      .mockResolvedValueOnce({
        serviceId: "svc-1",
        priceStroops: 25000000,
      } as never)
      .mockRejectedValueOnce(new Error("Failed to fetch usage rollup"));

    renderPage("svc-1");

    // Verify service ID heading
    expect(
      await screen.findByRole("heading", { name: "svc-1" }),
    ).toBeInTheDocument();

    // Verify Price row value
    expect(
      await screen.findByText("2.50 XLM (25000000 stroops)"),
    ).toBeInTheDocument();

    // Verify absent badge
    expect(screen.getByText("absent")).toBeInTheDocument();
    expect(screen.queryByText("available")).not.toBeInTheDocument();

    // Verify no error alert is rendered for rollup failure
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("surfaces service fetch failures as a role=alert", async () => {
    mockApiGet
      .mockRejectedValueOnce(new Error("Backend service offline"))
      .mockResolvedValueOnce({
        serviceId: "svc-1",
        total: 10,
        agents: 2,
      } as never);

    renderPage("svc-1");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Backend service offline");
    expect(screen.queryByText("Price")).not.toBeInTheDocument();
  });

  it("correctly handles zero price formatting", async () => {
    mockApiGet
      .mockResolvedValueOnce({
        serviceId: "svc-zero",
        priceStroops: 0,
      } as never)
      .mockResolvedValueOnce({
        serviceId: "svc-zero",
        total: 0,
        agents: 0,
      } as never);

    renderPage("svc-zero");

    expect(await screen.findByText("0 XLM (0 stroops)")).toBeInTheDocument();
  });

  it("correctly handles sub-cent price formatting", async () => {
    mockApiGet
      .mockResolvedValueOnce({
        serviceId: "svc-subcent",
        priceStroops: 50000,
      } as never)
      .mockResolvedValueOnce({
        serviceId: "svc-subcent",
        total: 1,
        agents: 1,
      } as never);

    renderPage("svc-subcent");

    expect(
      await screen.findByText("50,000 stroops (50000 stroops)"),
    ).toBeInTheDocument();
  });

  it("correctly handles standard cent price formatting", async () => {
    mockApiGet
      .mockResolvedValueOnce({
        serviceId: "svc-cent",
        priceStroops: 100000,
      } as never)
      .mockResolvedValueOnce({
        serviceId: "svc-cent",
        total: 5,
        agents: 2,
      } as never);

    renderPage("svc-cent");

    expect(
      await screen.findByText("0.01 XLM (100000 stroops)"),
    ).toBeInTheDocument();
  });
});
