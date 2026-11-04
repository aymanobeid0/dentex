import { beforeAll, afterAll, vi } from "vitest";

// jsdom has no scrolling layout; Radix still exercises real focus/keyboard code.
const original = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
);
const originalResize = Object.getOwnPropertyDescriptor(
  globalThis,
  "ResizeObserver",
);
beforeAll(() => {
  if (!original)
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  if (!originalResize)
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    });
});
afterAll(() => {
  if (!original)
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  if (!originalResize) Reflect.deleteProperty(globalThis, "ResizeObserver");
});
