import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import NewServicePage from "./page";
import { apiGet, apiPatch, apiPost } from "@/lib/apiClient";
import { SERVICE_MUTATION_QUEUE_STORAGE_KEY } from "@/lib/serviceMutationQueue";

jest.mock("@/lib/apiClient", () => ({
  apiGet: jest.fn(),
  apiPatch: jest.fn(),
  apiPost: jest.fn(),
}));

const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter() {
    return {
      push: mockPush,
      replace: jest.fn(),
      prefetch: jest.fn(),
    };
  },
}));

const apiGetMock = apiGet as jest.MockedFunction<typeof apiGet>;
const apiPatchMock = apiPatch as jest.MockedFunction<typeof apiPatch>;
const apiPostMock = apiPost as jest.MockedFunction<typeof apiPost>;

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    value,
    configurable: true,
  });
}

describe("NewServicePage offline mutation integration", () => {
  beforeEach(() => {
    localStorage.clear();
    mockPush.mockReset();
    apiGetMock.mockReset();
    apiPatchMock.mockReset();
    apiPostMock.mockReset();
    setOnline(false);
  });

  afterEach(() => {
    setOnline(true);
    localStorage.clear();
  });

  it("persists a submitted service while offline and surfaces queued UI state", async () => {
    render(<NewServicePage />);

    fireEvent.change(screen.getByLabelText("Service ID"), {
      target: { value: "offline-svc" },
    });
    fireEvent.change(screen.getByLabelText("Price (stroops / request)"), {
      target: { value: "42" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /register service/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /queued for sync/i }),
      ).toBeDisabled();
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      /saved on this device and will sync when connectivity returns/i,
    );
    expect(apiPostMock).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();

    const stored = JSON.parse(
      localStorage.getItem(SERVICE_MUTATION_QUEUE_STORAGE_KEY)!,
    );
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      kind: "service.create",
      serviceId: "offline-svc",
      path: "/api/v1/services",
      body: { serviceId: "offline-svc", priceStroops: 42 },
      state: "pending",
    });
  });
});
