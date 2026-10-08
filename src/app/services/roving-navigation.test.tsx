import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { apiGet } from "../../lib/apiClient";
import ServicesPage from "./page";
import { ToastProvider } from "../../components/ToastProvider";

jest.mock("../../lib/apiClient", () => ({
  apiGet: jest.fn(),
}));

const apiGetMock = apiGet as jest.MockedFunction<typeof apiGet>;

function service(serviceId: string, priceStroops: number) {
  return { serviceId, priceStroops };
}

function renderPage() {
  return render(
    <ToastProvider>
      <ServicesPage />
    </ToastProvider>
  );
}

function serviceLinks() {
  return screen
    .getAllByRole("link")
    .filter((link) => link.getAttribute("href") !== "/services/new");
}

describe("services roving keyboard navigation", () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    window.history.replaceState(null, "", "/services");
  });

  it("tabs into exactly one primary service link", async () => {
    const user = userEvent.setup();
    apiGetMock.mockResolvedValueOnce({
      services: [
        service("svc-a", 10),
        service("svc-b", 20),
        service("svc-c", 30),
      ],
      page: 1,
      pageCount: 1,
    } as never);

    renderPage();
    await screen.findByRole("link", { name: /svc-a/i });

    const links = serviceLinks();
    expect(links.map((link) => link.tabIndex)).toEqual([0, -1, -1]);
    expect(links[0].className).toContain("focus-visible:outline");

    await user.tab();
    expect(screen.getByRole("link", { name: /new service/i })).toHaveFocus();
    await user.tab();
    expect(links[0]).toHaveFocus();
  });

  it("moves focus with ArrowDown and ArrowUp while keeping one tab stop", async () => {
    apiGetMock.mockResolvedValueOnce({
      services: [
        service("svc-a", 10),
        service("svc-b", 20),
        service("svc-c", 30),
      ],
      page: 1,
      pageCount: 1,
    } as never);

    renderPage();
    await screen.findByRole("link", { name: /svc-a/i });

    let links = serviceLinks();
    links[0].focus();
    fireEvent.keyDown(links[0], { key: "ArrowDown" });

    links = serviceLinks();
    expect(document.activeElement).toBe(links[1]);
    expect(links.map((link) => link.tabIndex)).toEqual([-1, 0, -1]);

    fireEvent.keyDown(links[1], { key: "ArrowUp" });
    links = serviceLinks();
    expect(document.activeElement).toBe(links[0]);
    expect(links.map((link) => link.tabIndex)).toEqual([0, -1, -1]);
  });

  it("uses Home and End to jump to the list boundaries", async () => {
    apiGetMock.mockResolvedValueOnce({
      services: [
        service("svc-a", 10),
        service("svc-b", 20),
        service("svc-c", 30),
      ],
      page: 1,
      pageCount: 1,
    } as never);

    renderPage();
    await screen.findByRole("link", { name: /svc-a/i });

    let links = serviceLinks();
    links[0].focus();
    fireEvent.keyDown(links[0], { key: "End" });
    links = serviceLinks();
    expect(document.activeElement).toBe(links[2]);

    fireEvent.keyDown(links[2], { key: "Home" });
    links = serviceLinks();
    expect(document.activeElement).toBe(links[0]);
  });

  it("activates the focused item with Enter or Space", async () => {
    apiGetMock.mockResolvedValueOnce({
      services: [service("svc-a", 10)],
      page: 1,
      pageCount: 1,
    } as never);

    renderPage();
    const link = await screen.findByRole("link", { name: /svc-a/i });
    const click = jest.fn();
    Object.defineProperty(link, "click", {
      configurable: true,
      value: click,
    });

    fireEvent.keyDown(link, { key: "Enter" });
    fireEvent.keyDown(link, { key: " " });

    expect(click).toHaveBeenCalledTimes(2);
  });

  it("moves the tab stop to the first new item when the list is replaced", async () => {
    apiGetMock
      .mockResolvedValueOnce({
        services: [service("svc-a", 10), service("svc-b", 20)],
        page: 1,
        pageCount: 2,
      } as never)
      .mockResolvedValueOnce({
        services: [service("svc-c", 30), service("svc-d", 40)],
        page: 2,
        pageCount: 2,
      } as never);

    renderPage();
    await screen.findByRole("link", { name: /svc-a/i });

    let links = serviceLinks();
    links[0].focus();
    fireEvent.keyDown(links[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(serviceLinks()[1]);

    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(apiGetMock).toHaveBeenLastCalledWith(
        "/api/v1/services?page=2&limit=25"
      );
    });
    await screen.findByRole("link", { name: /svc-c/i });

    links = serviceLinks();
    expect(links.map((link) => link.tabIndex)).toEqual([0, -1]);
  });
});
