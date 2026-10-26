// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ThemeProvider } from "./theme-provider";
import { ThemeSwitcher } from "./theme-switcher";

let systemDark = false;
const listeners = new Set<(event: { matches: boolean }) => void>();
beforeEach(() => {
  localStorage.clear(); document.documentElement.className = ""; systemDark = false; listeners.clear();
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ media: query, matches: systemDark, addListener: (fn: (event: { matches: boolean }) => void) => listeners.add(fn), removeListener: (fn: (event: { matches: boolean }) => void) => listeners.delete(fn), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(), onchange: null })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.documentElement.className = ""; });

it("defaults to System and follows OS light/dark changes", async () => {
  render(<ThemeProvider><ThemeSwitcher /></ThemeProvider>);
  expect((screen.getByRole("combobox", { name: "Tema tampilan" }) as HTMLSelectElement).value).toBe("system");
  await waitFor(() => expect(document.documentElement.classList.contains("light")).toBe(true));
  await act(async () => { systemDark = true; listeners.forEach((listener) => listener({ matches: true })); });
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  await act(async () => { systemDark = false; listeners.forEach((listener) => listener({ matches: false })); });
  expect(document.documentElement.classList.contains("light")).toBe(true);
});

it("switches Light/Dark/System and persists only the selected theme", async () => {
  render(<ThemeProvider><ThemeSwitcher /></ThemeProvider>); const user = userEvent.setup();
  const select = screen.getByRole("combobox", { name: "Tema tampilan" });
  await user.selectOptions(select, "dark");
  expect(document.documentElement.classList.contains("dark")).toBe(true); expect(localStorage.getItem("tednco-theme")).toBe("dark");
  await act(async () => { listeners.forEach((listener) => listener({ matches: false })); });
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  await user.selectOptions(select, "light"); expect(document.documentElement.classList.contains("light")).toBe(true);
  await user.selectOptions(select, "system"); expect(localStorage.getItem("tednco-theme")).toBe("system");
  expect(localStorage.length).toBe(1);
});

it("restores a previously selected dark preference", async () => {
  localStorage.setItem("tednco-theme", "dark");
  render(<ThemeProvider><ThemeSwitcher /></ThemeProvider>);
  await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("dark");
});
