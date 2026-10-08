import {
  failedServices,
  loadingServices,
  resolveServices,
} from "./servicesFetchState";

describe("services fetch state machine", () => {
  it("starts loading without data or hidden error payloads", () => {
    expect(loadingServices()).toEqual({ status: "loading" });
  });

  it("maps an empty response exclusively to empty", () => {
    expect(resolveServices({ services: [], page: 1, pageCount: 2 }, 1)).toEqual({
      status: "empty", page: 1, pageCount: 2,
    });
  });

  it("maps service rows to a success-only payload and clamps pagination", () => {
    const services = [{ serviceId: "svc-123", priceStroops: 12 }];
    expect(resolveServices({ items: services, page: 100, pageCount: 2 }, 2)).toEqual({
      status: "success", services, page: 2, pageCount: 2,
    });
  });

  it("fails closed on malformed payloads rather than rendering invalid rows", () => {
    expect(resolveServices({ services: [{}] } as never, 1)).toEqual(failedServices());
    expect(resolveServices({ services: [null] } as never, 1)).toEqual(failedServices());
  });

  it("uses a stable typed public error without propagating server internals", () => {
    expect(failedServices()).toEqual({
      status: "error",
      error: {
        code: "SERVICES_FETCH_FAILED",
        message: "Services are temporarily unavailable. Please try again.",
      },
    });
  });
});
