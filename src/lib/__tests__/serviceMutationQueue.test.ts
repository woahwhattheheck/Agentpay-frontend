import { apiGet, apiPatch, apiPost } from "@/lib/apiClient";
import {
  SERVICE_MUTATION_QUEUE_STORAGE_KEY,
  flushServiceMutationQueue,
  getServiceMutationQueueSnapshot,
  runServiceMutation,
} from "@/lib/serviceMutationQueue";

jest.mock("@/lib/apiClient", () => ({
  apiGet: jest.fn(),
  apiPatch: jest.fn(),
  apiPost: jest.fn(),
}));

const apiGetMock = apiGet as jest.MockedFunction<typeof apiGet>;
const apiPatchMock = apiPatch as jest.MockedFunction<typeof apiPatch>;
const apiPostMock = apiPost as jest.MockedFunction<typeof apiPost>;

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

describe("serviceMutationQueue", () => {
  beforeEach(() => {
    localStorage.clear();
    apiGetMock.mockReset();
    apiPatchMock.mockReset();
    apiPostMock.mockReset();
    global.fetch = jest.fn();
    setOnline(true);
  });

  it("persists an offline mutation across a reload-shaped storage read", async () => {
    setOnline(false);
    const result = await runServiceMutation({
      kind: "service.create",
      serviceId: "offline-svc",
      path: "/api/v1/services",
      body: { serviceId: "offline-svc", priceStroops: 10 },
    });

    expect(result.queued).toBe(true);
    expect(JSON.parse(localStorage.getItem(SERVICE_MUTATION_QUEUE_STORAGE_KEY)!)).toHaveLength(1);
    expect(getServiceMutationQueueSnapshot()).toMatchObject({ pending: 1, conflicts: 0, total: 1 });
  });

  it("flushes queued mutations in creation order", async () => {
    setOnline(false);
    await runServiceMutation({
      kind: "service.price.update",
      serviceId: "svc-a",
      path: "/api/v1/services/svc-a/price",
      body: { priceStroops: 20 },
      basePriceStroops: 10,
    });
    await runServiceMutation({
      kind: "service.price.update",
      serviceId: "svc-b",
      path: "/api/v1/services/svc-b/price",
      body: { priceStroops: 30 },
      basePriceStroops: 15,
    });

    setOnline(true);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
    apiGetMock
      .mockResolvedValueOnce({ serviceId: "svc-a", priceStroops: 10 } as never)
      .mockResolvedValueOnce({ serviceId: "svc-a", priceStroops: 20 } as never)
      .mockResolvedValueOnce({ serviceId: "svc-b", priceStroops: 15 } as never)
      .mockResolvedValueOnce({ serviceId: "svc-b", priceStroops: 30 } as never);

    await flushServiceMutationQueue();

    expect((global.fetch as jest.Mock).mock.calls.map(([url]) => url)).toEqual([
      "http://localhost:3001/api/v1/services/svc-a/price",
      "http://localhost:3001/api/v1/services/svc-b/price",
    ]);
    expect(getServiceMutationQueueSnapshot().total).toBe(0);
  });

  it("coalesces duplicate queue requests and single-flights duplicate flushes", async () => {
    setOnline(false);
    const mutation = {
      kind: "service.create" as const,
      serviceId: "once",
      path: "/api/v1/services",
      body: { serviceId: "once", priceStroops: 40 },
    };
    await runServiceMutation(mutation);
    await runServiceMutation(mutation);

    setOnline(true);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
    apiGetMock
      .mockRejectedValueOnce(new Error("not found"))
      .mockResolvedValue({ serviceId: "once", priceStroops: 40 } as never);

    await Promise.all([flushServiceMutationQueue(), flushServiceMutationQueue()]);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(getServiceMutationQueueSnapshot().total).toBe(0);
  });

  it("surfaces a server conflict instead of replaying past it", async () => {
    setOnline(false);
    await runServiceMutation({
      kind: "service.create",
      serviceId: "conflicted",
      path: "/api/v1/services",
      body: { serviceId: "conflicted", priceStroops: 50 },
    });

    setOnline(true);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 409,
      statusText: "Conflict",
      json: async () => ({ message: "already exists" }),
    });
    apiGetMock.mockRejectedValueOnce(new Error("not found"));
    apiGetMock.mockResolvedValue({ serviceId: "conflicted", priceStroops: 99 } as never);

    await flushServiceMutationQueue();

    expect(getServiceMutationQueueSnapshot()).toMatchObject({ pending: 0, conflicts: 1, total: 1 });
    const stored = JSON.parse(localStorage.getItem(SERVICE_MUTATION_QUEUE_STORAGE_KEY)!);
    expect(stored[0]).toMatchObject({ state: "conflict", errorCode: "server_conflict" });
  });

  it("keeps an edit as a conflict when the server price changed while offline", async () => {
    setOnline(false);
    await runServiceMutation({
      kind: "service.price.update",
      serviceId: "changed",
      path: "/api/v1/services/changed/price",
      body: { priceStroops: 20 },
      basePriceStroops: 10,
    });
    setOnline(true);
    apiGetMock.mockResolvedValue({ serviceId: "changed", priceStroops: 15 } as never);

    await flushServiceMutationQueue();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(getServiceMutationQueueSnapshot()).toMatchObject({ conflicts: 1, total: 1 });
  });

  it("retains a confirmed write until readback can verify its server state", async () => {
    setOnline(false);
    await runServiceMutation({
      kind: "service.price.update",
      serviceId: "retry",
      path: "/api/v1/services/retry/price",
      body: { priceStroops: 20 },
      basePriceStroops: 10,
    });
    setOnline(true);
    apiGetMock
      .mockResolvedValueOnce({ serviceId: "retry", priceStroops: 10 } as never)
      .mockRejectedValueOnce(new Error("read unavailable"))
      .mockResolvedValueOnce({ serviceId: "retry", priceStroops: 20 } as never);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

    await flushServiceMutationQueue();
    expect(getServiceMutationQueueSnapshot().pending).toBe(1);
    await flushServiceMutationQueue();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(getServiceMutationQueueSnapshot().total).toBe(0);
  });

  it("does not collapse A -> B -> A into a duplicate pending edit", async () => {
    setOnline(false);
    for (const [basePriceStroops, price] of [[10, 20], [20, 30], [30, 20]]) {
      await runServiceMutation({
        kind: "service.price.update",
        serviceId: "sequence",
        path: "/api/v1/services/sequence/price",
        body: { priceStroops: price },
        basePriceStroops,
      });
    }
    expect(getServiceMutationQueueSnapshot().total).toBe(3);
  });
  it("preserves persisted FIFO order even when createdAt moves backwards", async () => {
    setOnline(false);
    await runServiceMutation({
      kind: "service.price.update",
      serviceId: "first",
      path: "/api/v1/services/first/price",
      body: { priceStroops: 20 },
      basePriceStroops: 10,
    });
    await runServiceMutation({
      kind: "service.price.update",
      serviceId: "second",
      path: "/api/v1/services/second/price",
      body: { priceStroops: 30 },
      basePriceStroops: 15,
    });

    const stored = JSON.parse(localStorage.getItem(SERVICE_MUTATION_QUEUE_STORAGE_KEY)!);
    stored[0].createdAt = 2_000;
    stored[1].createdAt = 1_000;
    localStorage.setItem(SERVICE_MUTATION_QUEUE_STORAGE_KEY, JSON.stringify(stored));

    setOnline(true);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
    apiGetMock
      .mockResolvedValueOnce({ serviceId: "first", priceStroops: 10 } as never)
      .mockResolvedValueOnce({ serviceId: "first", priceStroops: 20 } as never)
      .mockResolvedValueOnce({ serviceId: "second", priceStroops: 15 } as never)
      .mockResolvedValueOnce({ serviceId: "second", priceStroops: 30 } as never);

    await flushServiceMutationQueue();

    expect((global.fetch as jest.Mock).mock.calls.map(([url]) => url)).toEqual([
      "http://localhost:3001/api/v1/services/first/price",
      "http://localhost:3001/api/v1/services/second/price",
    ]);
    expect(getServiceMutationQueueSnapshot().total).toBe(0);
  });

  it("keeps HTTP 429 work pending instead of misclassifying it as a conflict", async () => {
    setOnline(false);
    await runServiceMutation({
      kind: "service.price.update",
      serviceId: "rate-limited",
      path: "/api/v1/services/rate-limited/price",
      body: { priceStroops: 20 },
      basePriceStroops: 10,
    });

    setOnline(true);
    apiGetMock.mockResolvedValueOnce({
      serviceId: "rate-limited",
      priceStroops: 10,
    } as never);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    });

    await flushServiceMutationQueue();

    expect(getServiceMutationQueueSnapshot()).toMatchObject({
      pending: 1,
      conflicts: 0,
      total: 1,
    });
  });

});

