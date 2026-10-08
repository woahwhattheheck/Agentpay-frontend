import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ServicesPage from "./page";
import { apiGet } from "../../lib/apiClient";
import { ToastProvider } from "../../components/ToastProvider";

jest.mock("../../lib/apiClient", () => ({ apiGet: jest.fn() }));
const request = apiGet as jest.MockedFunction<typeof apiGet>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function mount() {
  return render(
    <ToastProvider><ServicesPage /></ToastProvider>
  );
}

describe("services async rendering and retry", () => {
  beforeEach(() => {
    request.mockReset();
    window.history.replaceState(null, "", "/services");
  });

  it("renders only the loader while a request is pending", () => {
    request.mockReturnValueOnce(new Promise(() => undefined) as never);
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("Loading services");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("No services registered yet.")).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("renders only the empty state when there are no results", async () => {
    request.mockResolvedValueOnce({ services: [], page: 1, pageCount: 1 } as never);
    mount();
    expect(await screen.findByText("No services registered yet.")).toBeInTheDocument();
    expect(screen.getByText("No services available")).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading services")).not.toBeInTheDocument();
  });

  it("renders a sanitized typed error with retry but no stale content", async () => {
    request.mockRejectedValueOnce(new Error("SECRET_INTERNAL_DATABASE_DETAILS"));
    mount();
    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("SERVICES_FETCH_FAILED");
    expect(error).not.toHaveTextContent("SECRET_INTERNAL_DATABASE_DETAILS");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("retry returns to loading and then shows success without error", async () => {
    const next = deferred<{ services: { serviceId: string; priceStroops: number }[] }>();
    request.mockRejectedValueOnce(new Error("network"));
    request.mockReturnValueOnce(next.promise as never);
    mount();
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByRole("status")).toHaveTextContent("Loading services");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await act(async () => next.resolve({ services: [{ serviceId: "recovered", priceStroops: 1 }] }));
    expect(await screen.findByRole("link", { name: /recovered/i })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("renders only success data and live announcement", async () => {
    request.mockResolvedValueOnce({
      services: [{ serviceId: "ready", priceStroops: 4 }],
      page: 1, pageCount: 1,
    } as never);
    mount();
    expect(await screen.findByRole("link", { name: /ready/i })).toBeInTheDocument();
    expect(screen.getByText("Loaded 1 services")).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("No services registered yet.")).not.toBeInTheDocument();
  });

  it("drops previous page content before the next page has resolved", async () => {
    const next = deferred<{ services: { serviceId: string; priceStroops: number }[]; page: number; pageCount: number }>();
    request.mockResolvedValueOnce({
      services: [{ serviceId: "old", priceStroops: 4 }],
      page: 1, pageCount: 2,
    } as never).mockReturnValueOnce(next.promise as never);
    mount();
    await screen.findByRole("link", { name: /old/i });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("status")).toHaveTextContent("Loading services");
    expect(screen.queryByRole("link", { name: /old/i })).not.toBeInTheDocument();
    await act(async () => next.resolve({
      services: [{ serviceId: "new", priceStroops: 5 }], page: 2, pageCount: 2,
    }));
    expect(await screen.findByRole("link", { name: /new/i })).toBeInTheDocument();
    await waitFor(() => expect(request).toHaveBeenLastCalledWith("/api/v1/services?page=2&limit=25"));
  });
});
