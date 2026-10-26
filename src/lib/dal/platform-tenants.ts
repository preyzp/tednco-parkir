import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "../mongodb";
import { AppError } from "../errors";
import { requirePlatformAccess } from "./authorization";
import type { Location, Membership, Tenant, TenantStatus, User } from "../../types";

// Narrow, read-only platform repository. Every exported query authorizes the
// caller as platform_admin first, reads only tenant directory fields, location
// names/counts and Owner contacts, and returns plain DTOs. No tenant operational collections
// (vehicles, sessions, transactions, prepaid) are reachable from here.

export const tenantStatuses = ["active", "suspended", "archived"] as const satisfies readonly TenantStatus[];
export type TenantRowStatus = TenantStatus | "unknown";
export interface PlatformTenantRow {
  readonly id: string;
  readonly name: string;
  readonly status: TenantRowStatus;
  readonly locationCount: number;
  readonly createdAt: string | null;
}
export interface PlatformOverview {
  readonly totalTenants: number;
  readonly activeTenants: number;
  readonly inactiveTenants: number;
  readonly totalLocations: number;
  readonly recentTenants: readonly PlatformTenantRow[];
}
export interface TenantListQuery {
  readonly q?: string;
  readonly status?: TenantStatus;
  readonly page: number;
}
export interface TenantListResult {
  readonly rows: readonly PlatformTenantRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
}

export const tenantPageSize = 20;
const recentLimit = 5;
const maxSearchLength = 100;
const maxPage = 10_000;

// Untrusted URL input: unknown values fall back to safe defaults, never errors.
export function parseTenantListQuery(params: Record<string, string | string[] | undefined>): TenantListQuery {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const q = first(params.q)?.trim().slice(0, maxSearchLength) || undefined;
  const rawStatus = first(params.status);
  const status = (tenantStatuses as readonly string[]).includes(rawStatus ?? "") ? (rawStatus as TenantStatus) : undefined;
  const parsedPage = Number(first(params.page));
  const page = Number.isInteger(parsedPage) && parsedPage >= 1 ? Math.min(parsedPage, maxPage) : 1;
  return { ...(q ? { q } : {}), ...(status ? { status } : {}), page };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function toRow(tenant: Partial<Tenant>, counts: Map<string, number>): PlatformTenantRow {
  const id = tenant._id instanceof ObjectId ? tenant._id.toHexString() : "";
  const status: TenantRowStatus = (tenantStatuses as readonly string[]).includes(String(tenant.status)) ? (tenant.status as TenantStatus) : "unknown";
  const createdAt = tenant.createdAt instanceof Date && Number.isFinite(tenant.createdAt.getTime()) ? tenant.createdAt.toISOString() : null;
  return Object.freeze({ id, name: typeof tenant.name === "string" && tenant.name.trim() ? tenant.name : "Tanpa nama", status, locationCount: counts.get(id) ?? 0, createdAt });
}
const tenantProjection = { projection: { _id: 1, name: 1, status: 1, createdAt: 1 } } as const;
const newestFirst = { createdAt: -1, _id: -1 } as const;

async function readOnly<T>(work: () => Promise<T>): Promise<T> {
  await requirePlatformAccess();
  try { return await work(); }
  catch { throw new AppError("SERVICE_UNAVAILABLE"); }
}
async function locationCounts(tenantIds: ObjectId[]): Promise<Map<string, number>> {
  if (tenantIds.length === 0) return new Map();
  const db = await getDb();
  const rows = await db.collection<Location>("locations").aggregate<{ _id: unknown; count: number }>([
    { $match: { tenantId: { $in: tenantIds } } },
    { $group: { _id: "$tenantId", count: { $sum: 1 } } },
  ]).toArray();
  return new Map(rows.flatMap((row) => (row._id instanceof ObjectId && Number.isInteger(row.count) ? [[row._id.toHexString(), row.count] as const] : [])));
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  return readOnly(async () => {
    const db = await getDb();
    const tenants = db.collection<Tenant>("tenants");
    const totalTenants = await tenants.countDocuments({});
    const activeTenants = await tenants.countDocuments({ status: "active" });
    const totalLocations = await db.collection<Location>("locations").countDocuments({});
    const recent = await tenants.find({}, tenantProjection).sort(newestFirst).limit(recentLimit).toArray();
    const counts = await locationCounts(recent.flatMap((tenant) => (tenant._id instanceof ObjectId ? [tenant._id] : [])));
    return Object.freeze({ totalTenants, activeTenants, inactiveTenants: Math.max(totalTenants - activeTenants, 0), totalLocations, recentTenants: Object.freeze(recent.map((tenant) => toRow(tenant, counts))) });
  });
}

export interface PlatformTenantDetail {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status: TenantRowStatus;
  readonly timezone: string;
  readonly createdAt: string | null;
  readonly locations: readonly { readonly id: string; readonly name: string; readonly address?: string; readonly status: "active" | "inactive" | "unknown" }[];
  readonly owners: readonly { readonly userId: string; readonly name: string; readonly email: string; readonly accountStatus: string; readonly membershipStatus: string }[];
}
const maxDetailLocations = 100;
const maxDetailOwners = 10;

// Directory detail only: tenant profile, its locations and Owner contacts.
// Invalid or unknown ids return null after authorization (no existence leak).
export async function getPlatformTenantDetail(tenantId: string): Promise<PlatformTenantDetail | null> {
  return readOnly(async () => {
    if (!/^[a-f\d]{24}$/i.test(tenantId)) return null;
    const _id = new ObjectId(tenantId);
    const db = await getDb();
    const tenant = await db.collection<Tenant>("tenants").findOne({ _id }, { projection: { _id: 1, name: 1, slug: 1, status: 1, timezone: 1, createdAt: 1 } });
    if (!tenant) return null;
    const base = toRow(tenant, new Map());
    const locations = await db.collection<Location>("locations").find({ tenantId: _id }, { projection: { _id: 1, name: 1, address: 1, status: 1 } }).sort({ name: 1 }).limit(maxDetailLocations).toArray();
    const memberships = await db.collection<Membership>("memberships").find({ tenantId: _id, role: "owner" }, { projection: { userId: 1, status: 1 } }).limit(maxDetailOwners).toArray();
    const userIds = memberships.flatMap((member) => (member.userId instanceof ObjectId ? [member.userId] : []));
    const users = userIds.length ? await db.collection<User>("users").find({ _id: { $in: userIds } }, { projection: { _id: 1, name: 1, email: 1, status: 1 } }).limit(maxDetailOwners).toArray() : [];
    return Object.freeze({
      id: base.id, name: base.name, status: base.status,
      slug: typeof tenant.slug === "string" ? tenant.slug : "",
      timezone: typeof tenant.timezone === "string" ? tenant.timezone : "",
      createdAt: base.createdAt,
      locations: Object.freeze(locations.map((location) => Object.freeze({
        id: location._id.toHexString(), name: typeof location.name === "string" ? location.name : "Tanpa nama",
        ...(typeof location.address === "string" && location.address ? { address: location.address } : {}),
        status: location.status === "active" || location.status === "inactive" ? location.status : "unknown" as const,
      }))),
      owners: Object.freeze(memberships.flatMap((member) => {
        const user = users.find((row) => member.userId instanceof ObjectId && row._id.equals(member.userId));
        return user ? [Object.freeze({ userId: user._id.toHexString(), name: typeof user.name === "string" ? user.name : "Tanpa nama", email: typeof user.email === "string" ? user.email : "", accountStatus: String(user.status), membershipStatus: String(member.status) })] : [];
      })),
    });
  });
}

export async function listPlatformTenants(query: TenantListQuery): Promise<TenantListResult> {
  return readOnly(async () => {
    const db = await getDb();
    const tenants = db.collection<Tenant>("tenants");
    const filter = { ...(query.q ? { name: { $regex: escapeRegex(query.q), $options: "i" } } : {}), ...(query.status ? { status: query.status } : {}) };
    const total = await tenants.countDocuments(filter);
    const pageCount = Math.max(Math.ceil(total / tenantPageSize), 1);
    const page = Math.min(query.page, pageCount);
    const rows = await tenants.find(filter, tenantProjection).sort(newestFirst).skip((page - 1) * tenantPageSize).limit(tenantPageSize).toArray();
    const counts = await locationCounts(rows.flatMap((tenant) => (tenant._id instanceof ObjectId ? [tenant._id] : [])));
    return Object.freeze({ rows: Object.freeze(rows.map((tenant) => toRow(tenant, counts))), total, page, pageSize: tenantPageSize, pageCount });
  });
}
