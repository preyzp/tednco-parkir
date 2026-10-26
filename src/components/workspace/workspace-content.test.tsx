import { ObjectId } from "mongodb";
import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppError } from "../../lib/errors";
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), picker: vi.fn(), redirect: vi.fn((path: string) => { throw new Error("redirect:" + path); }) }));
vi.mock("server-only", () => ({}));
vi.mock("../../lib/workspace", () => ({ resolveActiveWorkspace: mocks.resolve }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../auth/logout-button", () => ({ LogoutButton: () => "[Keluar]" }));
vi.mock("./location-picker", () => ({ LocationPicker: (props: unknown) => { mocks.picker(props); return "[Picker]"; } }));
import { WorkspaceHome, WorkspacePicker } from "./workspace-content";

const contextId = new ObjectId();
const workspaces = [{ tenantId: "a".repeat(24), tenantName: "Parkir Sentosa", role: "staff", locations: [{ locationId: "b".repeat(24), name: "Lokasi Utara" }] }];
const active = { status: "active", canSwitch: true, workspaces, workspace: { tenantId: "a".repeat(24), tenantName: "Parkir Sentosa", locationId: "b".repeat(24), locationName: "Lokasi Utara", role: "staff" }, context: { userId: contextId, tenantId: contextId, locationId: contextId, role: "staff", permissions: ["vehicle.read"] } };
const html = async (component: () => Promise<React.ReactElement>) => renderToStaticMarkup(await component());
beforeEach(() => vi.clearAllMocks());

it.each([[WorkspaceHome], [WorkspacePicker]])("redirects unauthenticated visitors to login (%#)", async (component) => {
  mocks.resolve.mockRejectedValue(new AppError("UNAUTHENTICATED"));
  await expect(component()).rejects.toThrow("redirect:/login");
});
it.each([[WorkspaceHome], [WorkspacePicker]])("renders a safe unavailable state without internal details (%#)", async (component) => {
  mocks.resolve.mockRejectedValue(new Error("synthetic secret connection"));
  const markup = await html(component);
  expect(markup).toContain("Layanan belum tersedia");
  expect(markup).not.toContain("synthetic");
});
it.each([[WorkspaceHome], [WorkspacePicker]])("renders the empty access state with logout (%#)", async (component) => {
  mocks.resolve.mockResolvedValue({ status: "empty", platformAdmin: false });
  const markup = await html(component);
  expect(markup).toContain("Belum ada akses lokasi");
  expect(markup).toContain("[Keluar]");
});
it.each([[WorkspaceHome], [WorkspacePicker]])("sends a platform_admin without memberships to /platform instead of tenant UI (%#)", async (component) => {
  mocks.resolve.mockResolvedValue({ status: "empty", platformAdmin: true });
  await expect(component()).rejects.toThrow("redirect:/platform");
  expect(mocks.picker).not.toHaveBeenCalled();
});
it("home shows a forbidden state with a way to choose again", async () => {
  mocks.resolve.mockResolvedValue({ status: "forbidden", workspaces });
  const markup = await html(WorkspaceHome);
  expect(markup).toContain("Akses lokasi ditolak");
  expect(markup).toContain('href="/app/pilih-lokasi"');
  expect(markup).not.toContain("Lokasi Utara");
});
it("home sends users with several options to the location picker", async () => {
  mocks.resolve.mockResolvedValue({ status: "selection_required", workspaces });
  await expect(WorkspaceHome()).rejects.toThrow("redirect:/app/pilih-lokasi");
});
it("home shows the verified active location, tenant and role without identifiers or grants", async () => {
  mocks.resolve.mockResolvedValue(active);
  const markup = await html(WorkspaceHome);
  for (const text of ["Lokasi aktif", "Lokasi Utara", "Parkir Sentosa", "Staf", "Ganti lokasi"]) expect(markup).toContain(text);
  for (const hidden of ["a".repeat(24), "b".repeat(24), contextId.toHexString(), "vehicle.read"]) expect(markup).not.toContain(hidden);
  mocks.resolve.mockResolvedValue({ ...active, canSwitch: false });
  expect(await html(WorkspaceHome)).not.toContain("Ganti lokasi");
});
it("picker forwards only display options, never the trusted context", async () => {
  mocks.resolve.mockResolvedValue(active);
  await html(WorkspacePicker);
  expect(mocks.picker).toHaveBeenLastCalledWith({ workspaces, activeLocationId: "b".repeat(24), staleSelection: false });
  mocks.resolve.mockResolvedValue({ status: "forbidden", workspaces });
  await html(WorkspacePicker);
  expect(mocks.picker).toHaveBeenLastCalledWith({ workspaces, activeLocationId: undefined, staleSelection: true });
  expect(JSON.stringify(mocks.picker.mock.calls)).not.toContain(contextId.toHexString());
});
