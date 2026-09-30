import { createRoot } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNotice } from "../src/notice";

describe("Notice", () => {
  let dispose: () => void;
  let controller: ReturnType<typeof createNotice>;

  beforeEach(() => {
    vi.useFakeTimers();
    createRoot((disposeRoot) => {
      dispose = disposeRoot;
      controller = createNotice();
    });
  });

  afterEach(() => {
    dispose();
    vi.useRealTimers();
  });

  it("starts empty", () => {
    expect(controller.notice()).toBeNull();
  });

  it("shows a notice for six seconds", () => {
    controller.showNotice("First");
    vi.advanceTimersByTime(5999);
    expect(controller.notice()).toBe("First");
    vi.advanceTimersByTime(1);
    expect(controller.notice()).toBeNull();
  });

  it("gives a replacement notice its own six seconds", () => {
    controller.showNotice("First");
    vi.advanceTimersByTime(3000);
    controller.showNotice("Second");
    vi.advanceTimersByTime(3000);
    expect(controller.notice()).toBe("Second");
    vi.advanceTimersByTime(3000);
    expect(controller.notice()).toBeNull();
  });

  it("restarts expiration even when the message is unchanged", () => {
    controller.showNotice("First");
    vi.advanceTimersByTime(3000);
    controller.showNotice("First");
    vi.advanceTimersByTime(3000);
    expect(controller.notice()).toBe("First");
    vi.advanceTimersByTime(3000);
    expect(controller.notice()).toBeNull();
  });

  it("clears the expiration timer on disposal", () => {
    controller.showNotice("First");
    dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
