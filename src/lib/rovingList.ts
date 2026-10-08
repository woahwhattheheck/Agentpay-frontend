export type RovingNavigationKey =
  | "ArrowDown"
  | "ArrowUp"
  | "Home"
  | "End";

export function getRovingTargetIndex(
  currentIndex: number,
  itemCount: number,
  key: string
): number | null {
  if (itemCount <= 0) return null;

  const current = Math.min(Math.max(currentIndex, 0), itemCount - 1);

  switch (key) {
    case "ArrowDown":
      return (current + 1) % itemCount;
    case "ArrowUp":
      return (current - 1 + itemCount) % itemCount;
    case "Home":
      return 0;
    case "End":
      return itemCount - 1;
    default:
      return null;
  }
}

export function isRovingActivationKey(key: string): boolean {
  return key === "Enter" || key === " ";
}
