import {
  getRovingTargetIndex,
  isRovingActivationKey,
} from "./rovingList";

describe("getRovingTargetIndex", () => {
  it("moves down and wraps from the last item", () => {
    expect(getRovingTargetIndex(0, 3, "ArrowDown")).toBe(1);
    expect(getRovingTargetIndex(2, 3, "ArrowDown")).toBe(0);
  });

  it("moves up and wraps from the first item", () => {
    expect(getRovingTargetIndex(2, 3, "ArrowUp")).toBe(1);
    expect(getRovingTargetIndex(0, 3, "ArrowUp")).toBe(2);
  });

  it("jumps to the first and last items", () => {
    expect(getRovingTargetIndex(1, 4, "Home")).toBe(0);
    expect(getRovingTargetIndex(1, 4, "End")).toBe(3);
  });

  it("ignores unrelated keys and empty lists", () => {
    expect(getRovingTargetIndex(1, 3, "Tab")).toBeNull();
    expect(getRovingTargetIndex(0, 0, "ArrowDown")).toBeNull();
  });
});

describe("isRovingActivationKey", () => {
  it("accepts Enter and Space only", () => {
    expect(isRovingActivationKey("Enter")).toBe(true);
    expect(isRovingActivationKey(" ")).toBe(true);
    expect(isRovingActivationKey("Spacebar")).toBe(false);
  });
});
