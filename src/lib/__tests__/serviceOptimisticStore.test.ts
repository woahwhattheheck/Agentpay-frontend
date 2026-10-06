import {
  __resetServiceOptimisticStoreForTests,
  getOptimisticService,
  hydrateServiceSnapshot,
  runOptimisticServiceMutation,
  ServiceMutationError,
} from "../serviceOptimisticStore";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function service(serviceId: string, priceStroops: number) {
  return { serviceId, priceStroops };
}

describe("serviceOptimisticStore", () => {
  beforeEach(() => {
    __resetServiceOptimisticStoreForTests();
  });

  it("shows the optimistic value immediately and replaces it with canonical server state", async () => {
    hydrateServiceSnapshot(service("svc-a", 100));
    const write = deferred<void>();
    const reconcile = deferred<ReturnType<typeof service>>();

    const operation = runOptimisticServiceMutation({
      serviceId: "svc-a",
      current: service("svc-a", 100),
      optimistic: service("svc-a", 200),
      mutate: () => write.promise,
      reconcile: () => reconcile.promise,
    });

    expect(getOptimisticService("svc-a")).toEqual(service("svc-a", 200));

    write.resolve();
    reconcile.resolve(service("svc-a", 225));

    await expect(operation).resolves.toEqual(service("svc-a", 225));
    expect(getOptimisticService("svc-a")).toEqual(service("svc-a", 225));
  });

  it("rolls back exactly and returns a typed stable error when the write fails", async () => {
    hydrateServiceSnapshot(service("svc-a", 100));
    const write = deferred<void>();

    const operation = runOptimisticServiceMutation({
      serviceId: "svc-a",
      current: service("svc-a", 100),
      optimistic: service("svc-a", 200),
      mutate: () => write.promise,
      reconcile: async () => service("svc-a", 200),
      failureMessage:
        "Could not update the service. Your previous price was restored.",
    });

    expect(getOptimisticService("svc-a")).toEqual(service("svc-a", 200));

    write.reject(new Error("database internals that must not escape"));

    await expect(operation).rejects.toMatchObject({
      name: "ServiceMutationError",
      code: "SERVICE_WRITE_FAILED",
      serviceId: "svc-a",
      message: "Could not update the service. Your previous price was restored.",
    });
    expect(getOptimisticService("svc-a")).toEqual(service("svc-a", 100));
  });

  it("does not let an older response overwrite a newer successful edit", async () => {
    hydrateServiceSnapshot(service("svc-a", 100));

    const firstWrite = deferred<void>();
    const firstReconcile = deferred<ReturnType<typeof service>>();
    const secondWrite = deferred<void>();
    const secondReconcile = deferred<ReturnType<typeof service>>();

    const first = runOptimisticServiceMutation({
      serviceId: "svc-a",
      current: service("svc-a", 100),
      optimistic: service("svc-a", 200),
      mutate: () => firstWrite.promise,
      reconcile: () => firstReconcile.promise,
    });
    const second = runOptimisticServiceMutation({
      serviceId: "svc-a",
      current: service("svc-a", 100),
      optimistic: service("svc-a", 300),
      mutate: () => secondWrite.promise,
      reconcile: () => secondReconcile.promise,
    });

    expect(getOptimisticService("svc-a")).toEqual(service("svc-a", 300));

    secondWrite.resolve();
    secondReconcile.resolve(service("svc-a", 300));
    await second;
    expect(getOptimisticService("svc-a")).toEqual(service("svc-a", 300));

    firstWrite.resolve();
    firstReconcile.resolve(service("svc-a", 200));
    await first;

    expect(getOptimisticService("svc-a")).toEqual(service("svc-a", 300));
  });

  it("keeps unrelated service updates independent while one mutation rolls back", async () => {
    hydrateServiceSnapshot(service("svc-a", 100));
    hydrateServiceSnapshot(service("svc-b", 500));

    const firstWrite = deferred<void>();
    const secondWrite = deferred<void>();
    const secondReconcile = deferred<ReturnType<typeof service>>();

    const first = runOptimisticServiceMutation({
      serviceId: "svc-a",
      current: service("svc-a", 100),
      optimistic: service("svc-a", 200),
      mutate: () => firstWrite.promise,
      reconcile: async () => service("svc-a", 200),
    });
    const second = runOptimisticServiceMutation({
      serviceId: "svc-b",
      current: service("svc-b", 500),
      optimistic: service("svc-b", 600),
      mutate: () => secondWrite.promise,
      reconcile: () => secondReconcile.promise,
    });

    expect(getOptimisticService("svc-a")).toEqual(service("svc-a", 200));
    expect(getOptimisticService("svc-b")).toEqual(service("svc-b", 600));

    firstWrite.reject(new Error("svc-a failed"));
    await expect(first).rejects.toBeInstanceOf(ServiceMutationError);

    expect(getOptimisticService("svc-a")).toEqual(service("svc-a", 100));
    expect(getOptimisticService("svc-b")).toEqual(service("svc-b", 600));

    secondWrite.resolve();
    secondReconcile.resolve(service("svc-b", 650));
    await second;

    expect(getOptimisticService("svc-b")).toEqual(service("svc-b", 650));
  });
});
