// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ theme: "dark" as string | undefined, props: vi.fn() }));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: mocks.theme }) }));
vi.mock("sonner", () => ({ Toaster: (props: Record<string, unknown>) => { mocks.props(props); return null; } }));
import { Toaster } from "./sonner";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it.each([["dark", "dark"], ["light", "light"], ["system", "system"], [undefined, "system"]])("follows the next-themes choice %s", (theme, expected) => {
  mocks.theme = theme;
  render(<Toaster />);
  expect(mocks.props.mock.calls[0][0].theme).toBe(expected);
});
it("colors toasts by type (success green, error red, warning yellow, info blue) from theme tokens", () => {
  render(<Toaster />);
  const props = mocks.props.mock.calls[0][0];
  expect(props.richColors).toBe(true);
  for (const type of ["success", "error", "warning", "info"]) for (const part of ["bg", "border", "text"]) {
    expect(props.style[`--${type}-${part}`]).toBe(`var(--toast-${type}-${part})`);
  }
});
it("auto-dismisses toasts after 3 seconds by default", () => {
  render(<Toaster />);
  expect(mocks.props.mock.calls[0][0].duration).toBe(3000);
});
it("uses the shared popover/border tokens so Light/Dark palettes apply", () => {
  render(<Toaster position="top-center" closeButton containerAriaLabel="Notifikasi" />);
  const props = mocks.props.mock.calls[0][0];
  expect(props.style).toMatchObject({ "--normal-bg": "var(--popover)", "--normal-text": "var(--popover-foreground)", "--normal-border": "var(--border)" });
  expect(props).toMatchObject({ position: "top-center", closeButton: true, containerAriaLabel: "Notifikasi" });
});
