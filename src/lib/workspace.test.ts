import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AppError } from "./errors";
const mocks = vi.hoisted(() => ({ list: vi.fn(), guard: vi.fn(), platform: vi.fn(), get: vi.fn(), set: vi.fn(), redirect: vi.fn((path: string) => { throw new Error("redirect:" + path); }) }));
vi.mock("server-only", () => ({}));
vi.mock("./dal", () => ({ listAuthorizedWorkspaces: mocks.list, requireLocationContext: mocks.guard, hasPlatformAccess: mocks.platform }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.get, set: mocks.set }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { WORKSPACE_COOKIE, resolveActiveWorkspace } from "./workspace";
import { selectWorkspace } from "./workspace-actions";
import { proxy, config } from "../proxy";

const user = new ObjectId(); const other = new ObjectId(); const tenant = new ObjectId(); const north = new ObjectId(); const west = new ObjectId();
const hex = (id: ObjectId) => id.toHexString();
const workspace = (locations: ObjectId[]) => ({ tenantId: hex(tenant), tenantName: "Parkir Sentosa", role: "owner", locations: locations.map((id, index) => ({ locationId: hex(id), name: `Lokasi ${index}` })) });
function remembered(owner: ObjectId, location: ObjectId) { mocks.get.mockReturnValue({ value: `${hex(owner)}.${hex(tenant)}.${hex(location)}` }); }
function form(selection?: string) { const data = new FormData(); if (selection !== undefined) data.set("selection", selection); return data; }
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockReturnValue(undefined);
  mocks.list.mockResolvedValue({ userId: hex(user), workspaces: [workspace([north, west])] });
  mocks.guard.mockImplementation(async (selection: { tenantId: string; locationId: string }) => Object.freeze({ userId: user, tenantId: new ObjectId(selection.tenantId), locationId: new ObjectId(selection.locationId), role: "owner", permissions: [] }));
});

describe("active workspace resolution", () => {
  it("reports empty access without reading a selection", async () => {
    mocks.list.mockResolvedValue({ userId: hex(user), workspaces: [] });
    mocks.platform.mockResolvedValue(false);
    expect(await resolveActiveWorkspace()).toEqual({ status: "empty", platformAdmin: false });
    expect(mocks.guard).not.toHaveBeenCalled();
  });
  it("flags a platform_admin without memberships for redirect, never as a workspace", async () => {
    mocks.list.mockResolvedValue({ userId: hex(user), workspaces: [] });
    mocks.platform.mockResolvedValue(true);
    remembered(user, west);
    expect(await resolveActiveWorkspace()).toEqual({ status: "empty", platformAdmin: true });
    expect(mocks.guard).not.toHaveBeenCalled();
  });
  it("does not query platform role when the user has tenant workspaces", async () => {
    remembered(user, west);
    await resolveActiveWorkspace();
    expect(mocks.platform).not.toHaveBeenCalled();
  });
  it("auto-selects a single authorized location after the authoritative guard", async () => {
    mocks.list.mockResolvedValue({ userId: hex(user), workspaces: [workspace([north])] });
    const state = await resolveActiveWorkspace();
    expect(state).toMatchObject({ status: "active", canSwitch: false, workspace: { locationId: hex(north), tenantName: "Parkir Sentosa", role: "owner" } });
    expect(mocks.guard).toHaveBeenCalledWith({ tenantId: hex(tenant), locationId: hex(north) });
  });
  it("requires an explicit choice when several locations are allowed", async () => {
    expect(await resolveActiveWorkspace()).toMatchObject({ status: "selection_required" });
    expect(mocks.guard).not.toHaveBeenCalled();
  });
  it("uses a remembered selection only after the guard confirms it", async () => {
    remembered(user, west);
    expect(await resolveActiveWorkspace()).toMatchObject({ status: "active", canSwitch: true, workspace: { locationId: hex(west) } });
    expect(mocks.get).toHaveBeenCalledWith(WORKSPACE_COOKIE);
  });
  it("treats a remembered location that is no longer authorized as forbidden", async () => {
    remembered(user, new ObjectId());
    expect(await resolveActiveWorkspace()).toMatchObject({ status: "forbidden" });
    expect(mocks.guard).not.toHaveBeenCalled();
    remembered(user, west);
    mocks.guard.mockRejectedValueOnce(new AppError("FORBIDDEN"));
    expect(await resolveActiveWorkspace()).toMatchObject({ status: "forbidden" });
  });
  it("ignores selections remembered for another account or with a malformed value", async () => {
    remembered(other, west);
    expect(await resolveActiveWorkspace()).toMatchObject({ status: "selection_required" });
    mocks.get.mockReturnValue({ value: `${hex(user)}.${hex(tenant)}` });
    expect(await resolveActiveWorkspace()).toMatchObject({ status: "selection_required" });
  });
  it("propagates unauthenticated and unavailable errors instead of guessing a state", async () => {
    mocks.list.mockRejectedValueOnce(new AppError("UNAUTHENTICATED"));
    await expect(resolveActiveWorkspace()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    remembered(user, west);
    mocks.guard.mockRejectedValueOnce(new AppError("SERVICE_UNAVAILABLE"));
    await expect(resolveActiveWorkspace()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
});

describe("select workspace Server Action", () => {
  it("revalidates the choice on the server, remembers it with safe cookie flags and redirects", async () => {
    await expect(selectWorkspace({}, form(`${hex(tenant)}:${hex(west)}`))).rejects.toThrow("redirect:/app");
    expect(mocks.guard).toHaveBeenCalledWith({ tenantId: hex(tenant), locationId: hex(west) });
    expect(mocks.set).toHaveBeenCalledWith(WORKSPACE_COOKIE, `${hex(user)}.${hex(tenant)}.${hex(west)}`, expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }));
  });
  it.each([undefined, "", "not-an-id", `${hex(tenant)}`, `${hex(tenant)}:${hex(west)}:extra`, `${hex(tenant)}:{"$ne":null}`])("rejects malformed selection %j before any guard call", async (selection) => {
    expect(await selectWorkspace({}, form(selection))).toEqual({ error: expect.stringContaining("tidak valid") });
    expect(mocks.guard).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("does not remember forbidden or unverifiable choices", async () => {
    mocks.guard.mockRejectedValueOnce(new AppError("FORBIDDEN"));
    expect(await selectWorkspace({}, form(`${hex(tenant)}:${hex(west)}`))).toEqual({ error: "Lokasi tidak aktif, tidak ditemukan, atau di luar izin Anda." });
    mocks.guard.mockRejectedValueOnce(new Error("synthetic secret"));
    expect(await selectWorkspace({}, form(`${hex(tenant)}:${hex(west)}`))).toEqual({ error: "Layanan sementara tidak tersedia. Silakan coba lagi." });
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("sends unauthenticated callers to login", async () => {
    mocks.guard.mockRejectedValueOnce(new AppError("UNAUTHENTICATED"));
    await expect(selectWorkspace({}, form(`${hex(tenant)}:${hex(west)}`))).rejects.toThrow("redirect:/login");
    expect(mocks.set).not.toHaveBeenCalled();
  });
});

describe("optimistic route proxy", () => {
  const request = (path: string, cookie?: string) => new NextRequest(`https://parkir.example.test${path}`, { headers: cookie ? { cookie } : {} });
  it.each(["/app", "/app/pilih-lokasi", "/app/fitur-masa-depan", "/platform", "/platform/tenant"])("redirects %s without a session cookie to login", (path) => {
    const response = proxy(request(path));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
  });
  it.each(["better-auth.session_token=synthetic", "__Secure-better-auth.session_token=synthetic"])("lets requests with %s reach the server guards", (cookie) => {
    expect(proxy(request("/app", cookie)).headers.get("x-middleware-next")).toBe("1");
  });
  it("is scoped to the application segment only", () => {
    expect(config.matcher).toEqual(["/app/:path*", "/platform/:path*"]);
  });
});
