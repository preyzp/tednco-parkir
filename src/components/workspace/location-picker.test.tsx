// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("../../lib/workspace-actions", () => ({ selectWorkspace: mocks.select }));
import { LocationPicker, type PickerWorkspace } from "./location-picker";

const t1 = "a".repeat(24); const t2 = "c".repeat(24); const north = "b".repeat(24); const west = "d".repeat(24); const east = "e".repeat(24);
const workspaces: PickerWorkspace[] = [
  { tenantId: t1, tenantName: "Parkir Sentosa", role: "owner", locations: [{ locationId: north, name: "Lokasi Utara" }, { locationId: west, name: "Lokasi Barat" }] },
  { tenantId: t2, tenantName: "Parkir Mitra", role: "staff", locations: [{ locationId: east, name: "Lokasi Timur" }] },
];
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

it("groups allowed locations by tenant with role labels in text, not color alone", () => {
  render(<LocationPicker workspaces={workspaces} activeLocationId={north} />);
  expect(screen.getByRole("heading", { level: 1, name: "Pilih lokasi kerja" })).toBeTruthy();
  expect(screen.getByRole("region", { name: "Parkir Sentosa" }).textContent).toContain("Peran: Pemilik");
  expect(screen.getByRole("region", { name: "Parkir Mitra" }).textContent).toContain("Peran: Staf");
  const current = screen.getByRole("button", { name: /Lokasi Utara/ });
  expect(current.getAttribute("aria-current")).toBe("true");
  expect(current.textContent).toContain("Aktif");
  expect(screen.getByRole("button", { name: /Lokasi Timur/ }).getAttribute("aria-current")).toBeNull();
  expect(screen.getByRole("link", { name: "Kembali ke ruang kerja" }).getAttribute("href")).toBe("/app");
});
it("submits only the chosen tenant:location pair and disables choices while the server checks", async () => {
  let finish!: (value: { error?: string }) => void;
  mocks.select.mockReturnValue(new Promise((done) => { finish = done; }));
  render(<LocationPicker workspaces={workspaces} />);
  await userEvent.click(screen.getByRole("button", { name: /Lokasi Timur/ }));
  await waitFor(() => expect(mocks.select).toHaveBeenCalledOnce());
  expect((mocks.select.mock.calls[0][1] as FormData).get("selection")).toBe(`${t2}:${east}`);
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Memeriksa izin lokasi..."));
  for (const button of screen.getAllByRole("button")) expect((button as HTMLButtonElement).disabled).toBe(true);
  finish({ error: "Lokasi tidak aktif, tidak ditemukan, atau di luar izin Anda." });
  const alert = await screen.findByText("Lokasi tidak aktif, tidak ditemukan, atau di luar izin Anda.");
  expect(alert.closest("[role=alert]")?.textContent).toContain("Lokasi belum dapat dipilih");
  expect((screen.getByRole("button", { name: /Lokasi Timur/ }) as HTMLButtonElement).disabled).toBe(false);
});
it("explains a stale or revoked selection without exposing identifiers", () => {
  render(<LocationPicker workspaces={workspaces} staleSelection />);
  expect(screen.getByRole("alert").textContent).toContain("Akses lokasi ditolak");
  expect(document.body.textContent).not.toContain(t1);
  expect(screen.queryByRole("link", { name: "Kembali ke ruang kerja" })).toBeNull();
});
