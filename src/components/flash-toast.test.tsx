// @vitest-environment jsdom
import { StrictMode } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
import { FlashToast } from "./flash-toast";

const params = ["dibuat", "diperbarui"] as const;
beforeEach(() => { vi.resetAllMocks(); window.history.replaceState({ marker: "router-state" }, "", "/platform/tenants/abc?diperbarui=nama&tab=info#lokasi"); });
afterEach(cleanup);

it("fires exactly once even under StrictMode double effects and re-renders", () => {
  const view = render(<StrictMode><FlashToast id="tenant-nama-abc" kind="success" title="Nama usaha diperbarui." clearParams={params} /></StrictMode>);
  view.rerender(<StrictMode><FlashToast id="tenant-nama-abc" kind="success" title="Nama usaha diperbarui." clearParams={params} /></StrictMode>);
  expect(mocks.success).toHaveBeenCalledTimes(1);
  expect(mocks.success).toHaveBeenCalledWith("Nama usaha diperbarui.", { id: "tenant-nama-abc", description: undefined });
  expect(mocks.error).not.toHaveBeenCalled();
});

it("removes only the outcome flag from the URL, keeping other params, hash and router state", () => {
  render(<FlashToast id="x" kind="success" title="Lokasi diperbarui." clearParams={params} />);
  expect(window.location.pathname + window.location.search + window.location.hash).toBe("/platform/tenants/abc?tab=info#lokasi");
  expect(window.history.state).toEqual({ marker: "router-state" });
});

it("after the flag is removed, a refresh renders no outcome and so cannot toast again", () => {
  render(<FlashToast id="x" kind="success" title="Lokasi diperbarui." clearParams={params} />);
  expect(new URL(window.location.href).searchParams.has("diperbarui")).toBe(false);
  // The server page only renders FlashToast when the flag is present.
  cleanup();
  expect(mocks.success).toHaveBeenCalledTimes(1);
});

it("supports error toasts with a description and renders nothing visible itself", () => {
  const { container } = render(<FlashToast id="y" kind="error" title="Gagal." description="Detail aman." clearParams={params} />);
  expect(mocks.error).toHaveBeenCalledWith("Gagal.", { id: "y", description: "Detail aman." });
  expect(container.innerHTML).toBe("");
});
