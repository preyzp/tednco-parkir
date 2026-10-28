// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ThemeProvider } from "./theme-provider";
import { ThemeSwitcher } from "./theme-switcher";

let systemDark = false;
const listeners = new Set<(event: { matches: boolean }) => void>();
beforeEach(() => {
  localStorage.clear(); document.documentElement.className = ""; systemDark = false; listeners.clear();
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ media: query, matches: systemDark, addListener: (fn: (event: { matches: boolean }) => void) => listeners.add(fn), removeListener: (fn: (event: { matches: boolean }) => void) => listeners.delete(fn), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(), onchange: null })));
  // jsdom lacks the layout APIs Radix Popper uses to position the menu.
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.documentElement.className = ""; });

const trigger = () => screen.getByRole("button", { name: /^Tema tampilan:/ });
async function choose(user: ReturnType<typeof userEvent.setup>, label: string) {
  trigger().focus();
  await user.keyboard("{Enter}");
  await user.click(await screen.findByRole("menuitemradio", { name: label }));
}

it("server render and first client render show System to avoid hydration mismatch", () => {
  localStorage.setItem("tednco-theme", "dark");
  const html = renderToString(<ThemeProvider><ThemeSwitcher /></ThemeProvider>);
  expect(html).toContain("Tema tampilan: Sistem");
  expect(html).not.toContain("Gelap");
});

it("is icon-only on mobile (label from sm up) while keeping a 44px target and a full accessible name", () => {
  render(<ThemeProvider><ThemeSwitcher /></ThemeProvider>);
  const button = trigger();
  expect(button.className).toMatch(/\bsize-11\b/);
  expect(button.className).toMatch(/\bsm:w-auto\b/);
  expect(button.querySelector("svg")).not.toBeNull();
  expect(button.querySelector("span")!.className).toBe("hidden sm:inline");
  expect(button.getAttribute("aria-label")).toBe("Tema tampilan: Sistem");
});

it("defaults to System and follows OS light/dark changes", async () => {
  render(<ThemeProvider><ThemeSwitcher /></ThemeProvider>);
  expect(trigger().getAttribute("aria-label")).toBe("Tema tampilan: Sistem");
  await waitFor(() => expect(document.documentElement.classList.contains("light")).toBe(true));
  await act(async () => { systemDark = true; listeners.forEach((listener) => listener({ matches: true })); });
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  await act(async () => { systemDark = false; listeners.forEach((listener) => listener({ matches: false })); });
  expect(document.documentElement.classList.contains("light")).toBe(true);
});

it("opens with the keyboard and marks the active option with icons and a checked state", async () => {
  render(<ThemeProvider><ThemeSwitcher /></ThemeProvider>); const user = userEvent.setup();
  trigger().focus();
  await user.keyboard("{Enter}");
  const items = await screen.findAllByRole("menuitemradio");
  expect(items.map((item) => item.textContent)).toEqual(["Terang", "Gelap", "Sistem"]);
  expect(items.map((item) => item.getAttribute("aria-checked"))).toEqual(["false", "false", "true"]);
  for (const item of items) expect(item.querySelector("svg")).not.toBeNull();
  expect(screen.getByRole("menu").textContent).toContain("Tema tampilan");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  expect(document.activeElement).toBe(trigger());
});

it("switches Light/Dark/System and persists only the selected theme", async () => {
  render(<ThemeProvider><ThemeSwitcher /></ThemeProvider>); const user = userEvent.setup();
  await choose(user, "Gelap");
  expect(document.documentElement.classList.contains("dark")).toBe(true); expect(localStorage.getItem("tednco-theme")).toBe("dark");
  expect(trigger().getAttribute("aria-label")).toBe("Tema tampilan: Gelap");
  await act(async () => { listeners.forEach((listener) => listener({ matches: false })); });
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  await choose(user, "Terang"); expect(document.documentElement.classList.contains("light")).toBe(true);
  await choose(user, "Sistem"); expect(localStorage.getItem("tednco-theme")).toBe("system");
  expect(localStorage.length).toBe(1);
});

it("restores a previously selected dark preference", async () => {
  localStorage.setItem("tednco-theme", "dark");
  render(<ThemeProvider><ThemeSwitcher /></ThemeProvider>);
  await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
  await waitFor(() => expect(trigger().getAttribute("aria-label")).toBe("Tema tampilan: Gelap"));
});
