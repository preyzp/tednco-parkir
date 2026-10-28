// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SLOW_PENDING_MS, SlowPendingNotice } from "./slow-pending-notice";

const text = /Server masih memproses/;
beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("SlowPendingNotice", () => {
  it("stays hidden for the first 10 s, then asks to wait (never to resubmit)", () => {
    render(<SlowPendingNotice pending />);
    act(() => { vi.advanceTimersByTime(SLOW_PENDING_MS - 1); });
    expect(screen.queryByText(text)).toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    const notice = screen.getByRole("status");
    expect(notice.textContent).toMatch(/Mohon tunggu dan jangan menutup atau memuat ulang/);
    expect(notice.textContent).not.toMatch(/coba lagi|ulangi|kirim ulang/i);
  });
  it("disappears as soon as the request ends and does not reappear early on the next request", () => {
    const { rerender } = render(<SlowPendingNotice pending />);
    act(() => { vi.advanceTimersByTime(SLOW_PENDING_MS); });
    expect(screen.getByText(text)).toBeTruthy();
    rerender(<SlowPendingNotice pending={false} />);
    expect(screen.queryByText(text)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    rerender(<SlowPendingNotice pending />);
    expect(screen.queryByText(text)).toBeNull(); // a fresh 10 s for the next request
    act(() => { vi.advanceTimersByTime(SLOW_PENDING_MS); });
    expect(screen.getByText(text)).toBeTruthy();
  });
  it("never shows when not pending and leaves no timer behind after unmount", () => {
    const { unmount, rerender } = render(<SlowPendingNotice pending={false} />);
    act(() => { vi.advanceTimersByTime(SLOW_PENDING_MS * 2); });
    expect(screen.queryByText(text)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    rerender(<SlowPendingNotice pending />);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
