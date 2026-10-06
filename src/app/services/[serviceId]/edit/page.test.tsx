import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import EditServicePage from "./page";
import { apiGet, apiPatch } from "@/lib/apiClient";
import { ToastProvider } from "@/components/ToastProvider";
import {
  __resetServiceOptimisticStoreForTests,
  getOptimisticService,
} from "@/lib/serviceOptimisticStore";

jest.mock("@/lib/apiClient", () => ({
  apiGet: jest.fn(),
  apiPatch: jest.fn(),
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

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter() {
    return { push: mockPush, replace: jest.fn(), prefetch: jest.fn() };
  },
}));

const mockApiGet = apiGet as jest.MockedFunction<typeof apiGet>;
const mockApiPatch = apiPatch as jest.MockedFunction<typeof apiPatch>;

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderPage(serviceId: string) {
  const params = Promise.resolve({ serviceId }) as Promise<{
    serviceId: string;
  }> & {
    _value: { serviceId: string };
  };
  params._value = { serviceId };
  return render(<ToastProvider><EditServicePage params={params} /></ToastProvider>);
}


describe("EditServicePage", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPatch.mockReset();
    mockPush.mockReset();
    __resetServiceOptimisticStoreForTests();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── Prefill state ──────────────────────────────────────────────

  it("shows a Spinner while the prefill GET is in flight", () => {
    mockApiGet.mockReturnValue(new Promise<never>(() => {}));
    renderPage("svc-1");

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading service details",
    );
  });

  it("surfaces prefill fetch failures as a role=alert", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("Backend offline"));
    renderPage("svc-1");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Backend offline");
    expect(screen.queryByLabelText("Price (stroops / request)")).not.toBeInTheDocument();
  });

  it("renders the form when prefill succeeds", async () => {
    mockApiGet.mockResolvedValueOnce({
      serviceId: "svc-1",
      priceStroops: 5000,
    } as never);
    renderPage("svc-1");

    expect(await screen.findByLabelText("Price (stroops / request)")).toHaveValue("5000");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  // ── Dirty guard: beforeunload ─────────────────────────────────

  it("does not register beforeunload when price is unchanged", async () => {
    const addListenerSpy = jest.spyOn(window, "addEventListener");
    mockApiGet.mockResolvedValueOnce({
      serviceId: "svc-1",
      priceStroops: 1000,
    } as never);
    renderPage("svc-1");
    await screen.findByLabelText("Price (stroops / request)");

    await waitFor(() => {
      const calls = addListenerSpy.mock.calls.filter(
        ([type]) => type === "beforeunload",
      );
      expect(calls).toHaveLength(0);
    });
    addListenerSpy.mockRestore();
  });

  it("registers beforeunload after editing the price", async () => {
    const addListenerSpy = jest.spyOn(window, "addEventListener");
    mockApiGet.mockResolvedValueOnce({
      serviceId: "svc-1",
      priceStroops: 1000,
    } as never);
    renderPage("svc-1");
    const input = await screen.findByLabelText("Price (stroops / request)");

    fireEvent.change(input, { target: { value: "2000" } });

    await waitFor(() => {
      const calls = addListenerSpy.mock.calls.filter(
        ([type]) => type === "beforeunload",
      );
      expect(calls).toHaveLength(1);
    });
    addListenerSpy.mockRestore();
  });

  it("prevents default on beforeunload when form is dirty", async () => {
    mockApiGet.mockResolvedValueOnce({
      serviceId: "svc-1",
      priceStroops: 1000,
    } as never);
    renderPage("svc-1");
    const input = await screen.findByLabelText("Price (stroops / request)");

    fireEvent.change(input, { target: { value: "2000" } });

    await waitFor(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });
  });

  // ── Dirty guard: Back link confirm ────────────────────────────

  it("shows confirm on Back link when dirty and stays on page if cancelled", async () => {
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(false);
    mockApiGet.mockResolvedValueOnce({
      serviceId: "svc-1",
      priceStroops: 1000,
    } as never);
    renderPage("svc-1");
    const input = await screen.findByLabelText("Price (stroops / request)");
    fireEvent.change(input, { target: { value: "2000" } });

    fireEvent.click(screen.getByRole("link", { name: /back to service/i }));

    expect(confirmSpy).toHaveBeenCalledWith(
      "You have unsaved changes. Are you sure you want to leave?",
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("navigates on Back link when dirty and confirmed", async () => {
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
    mockApiGet.mockResolvedValueOnce({
      serviceId: "svc-1",
      priceStroops: 1000,
    } as never);
    renderPage("svc-1");
    const input = await screen.findByLabelText("Price (stroops / request)");
    fireEvent.change(input, { target: { value: "2000" } });

    fireEvent.click(screen.getByRole("link", { name: /back to service/i }));

    expect(confirmSpy).toHaveBeenCalledWith(
      "You have unsaved changes. Are you sure you want to leave?",
    );
  });

  it("skips confirm on Back link when form is clean", async () => {
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(false);
    mockApiGet.mockResolvedValueOnce({
      serviceId: "svc-1",
      priceStroops: 1000,
    } as never);
    renderPage("svc-1");
    await screen.findByLabelText("Price (stroops / request)");

    fireEvent.click(screen.getByRole("link", { name: /back to service/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
  });

  // ── Validation ────────────────────────────────────────────────

  it("shows validation error for invalid price and does not call PATCH", async () => {
    mockApiGet.mockResolvedValueOnce({
      serviceId: "svc-1",
      priceStroops: 1000,
    } as never);
    renderPage("svc-1");
    const input = await screen.findByLabelText("Price (stroops / request)");
    fireEvent.change(input, { target: { value: "-5" } });

    fireEvent.submit(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(input).toHaveAttribute("aria-invalid", "true");
    });
    expect(mockApiPatch).not.toHaveBeenCalled();
  });

  // ── Submit: success ───────────────────────────────────────────

  it("calls PATCH, shows success toast, clears dirty, and redirects on valid submit", async () => {
    mockApiGet
      .mockResolvedValueOnce({
        serviceId: "svc-1",
        priceStroops: 1000,
      } as never)
      .mockResolvedValueOnce({
        serviceId: "svc-1",
        priceStroops: 2100,
      } as never);
    mockApiPatch.mockResolvedValueOnce({} as never);
    renderPage("svc-1");
    const input = await screen.findByLabelText("Price (stroops / request)");
    fireEvent.change(input, { target: { value: "2000" } });

    fireEvent.submit(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith(
        "/api/v1/services/svc-1/price",
        { priceStroops: 2000 },
      );
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/services/svc-1");
    });

    // Toast should appear with "Price updated."
    expect(screen.getByText("Price updated.")).toBeInTheDocument();

    // Dirty should be cleared: beforeunload should not fire after save
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  // ── Submit: failure ───────────────────────────────────────────

  it("serializes rapid edits and rolls a failed newer edit back to the first canonical result", async () => {
    const firstWrite = deferred<void>();

    mockApiGet
      .mockResolvedValueOnce({
        serviceId: "svc-1",
        priceStroops: 1000,
      } as never)
      .mockResolvedValueOnce({
        serviceId: "svc-1",
        priceStroops: 2250,
      } as never);
    mockApiPatch
      .mockReturnValueOnce(firstWrite.promise as never)
      .mockRejectedValueOnce(new Error("newer edit failed"));

    renderPage("svc-1");
    const input = await screen.findByLabelText("Price (stroops / request)");

    fireEvent.change(input, { target: { value: "2000" } });
    fireEvent.submit(screen.getByRole("button"));

    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledTimes(1);
      expect(getOptimisticService("svc-1")?.priceStroops).toBe(2000);
    });

    fireEvent.change(input, { target: { value: "3000" } });
    fireEvent.submit(screen.getByRole("button"));

    await waitFor(() => {
      expect(getOptimisticService("svc-1")?.priceStroops).toBe(3000);
    });
    expect(mockApiPatch).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue("3000");

    await act(async () => {
      firstWrite.resolve();
      await firstWrite.promise;
    });

    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledTimes(2);
      expect(getOptimisticService("svc-1")?.priceStroops).toBe(2250);
      expect(input).toHaveValue("2250");
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("rolls back failed PATCH state and announces a safe message politely", async () => {
    mockApiGet.mockResolvedValueOnce({
      serviceId: "svc-1",
      priceStroops: 1000,
    } as never);
    mockApiPatch.mockRejectedValueOnce(
      new Error("database table internals must stay private"),
    );
    renderPage("svc-1");
    const input = await screen.findByLabelText("Price (stroops / request)");
    fireEvent.change(input, { target: { value: "2000" } });

    fireEvent.submit(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(getOptimisticService("svc-1")?.priceStroops).toBe(1000);
    });

    const liveRegion = await screen.findByRole("status");
    expect(liveRegion).toHaveAttribute("aria-live", "polite");
    expect(liveRegion).toHaveTextContent(
      "Could not update the service. Your previous price was restored.",
    );
    expect(input).toHaveValue("1000");
    expect(
      screen.queryByText("database table internals must stay private"),
    ).not.toBeInTheDocument();
  });
});
