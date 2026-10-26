import "server-only";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { requireAuthenticatedSession } from "../auth-session";
import { getDb } from "../mongodb";
import { AppError } from "../errors";
import { effectivePermissions, permissions } from "./permissions";
import type { User, Membership, Tenant, Location, Permission, TenantRole } from "../../types";

const bsonId = z.instanceof(ObjectId);
const hexId = z.string().regex(/^[a-f\d]{24}$/i);
const selectionSchema = z.object({ tenantId: hexId.optional(), locationId: hexId.optional() }).strict();
export type AuthorizationSelection = z.infer<typeof selectionSchema>;
export interface TenantContext {
  readonly userId: ObjectId;
  readonly tenantId: ObjectId;
  readonly role: TenantRole;
  readonly permissions: readonly Permission[];
}
export interface LocationContext extends TenantContext { readonly locationId: ObjectId }
const membershipSchema = z.object({ _id: bsonId, userId: bsonId, tenantId: bsonId, status: z.literal("active"), role: z.enum(["owner", "admin", "staff"]), locationIds: z.array(bsonId), permissions: z.array(z.enum(permissions)).optional() });
function deny(): never { throw new AppError("FORBIDDEN"); }
function same(a: ObjectId, b: ObjectId) { return a.equals(b); }

async function boundary<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); }
  catch (error) { if (error instanceof AppError) throw error; throw new AppError("SERVICE_UNAVAILABLE"); }
}
async function identity() {
  const session = await requireAuthenticatedSession();
  if (!hexId.safeParse(session.user.id).success || !Number.isFinite(Date.parse(session.session.expiresAt)) || Date.parse(session.session.expiresAt) <= Date.now()) throw new AppError("UNAUTHENTICATED");
  const userId = new ObjectId(session.user.id);
  const db = await getDb();
  const user = await db.collection<User>("users").findOne({ _id: userId, status: "active" }, { projection: { _id: 1, status: 1, platformRole: 1 } });
  if (!user || !(user._id instanceof ObjectId) || !same(user._id, userId) || user.status !== "active") throw new AppError("UNAUTHENTICATED");
  if (user.platformRole !== undefined && user.platformRole !== "platform_admin") deny();
  return { userId, user, db };
}
async function membership(selection: AuthorizationSelection) {
  const parsed = selectionSchema.safeParse(selection);
  if (!parsed.success) deny();
  const { userId, db } = await identity();
  const chosen = parsed.data.tenantId ? new ObjectId(parsed.data.tenantId) : undefined;
  const rows = await db.collection<Membership>("memberships").find({ userId, ...(chosen ? { tenantId: chosen } : { status: "active" }) }, { projection: { _id: 1, userId: 1, tenantId: 1, status: 1, role: 1, locationIds: 1, permissions: 1 } }).limit(2).toArray();
  if (rows.length !== 1) deny();
  const checked = membershipSchema.safeParse(rows[0]);
  if (!checked.success) deny();
  const member = checked.data;
  if (!same(member.userId, userId) || (chosen && !same(member.tenantId, chosen))) deny();
  if (new Set(member.locationIds.map((id) => id.toHexString())).size !== member.locationIds.length) deny();
  const tenant = await db.collection<Tenant>("tenants").findOne({ _id: member.tenantId, status: "active" }, { projection: { _id: 1, status: 1 } });
  if (!tenant || !(tenant._id instanceof ObjectId) || !same(tenant._id, member.tenantId) || tenant.status !== "active") deny();
  const context: TenantContext = Object.freeze({ userId: new ObjectId(userId), tenantId: new ObjectId(member.tenantId), role: member.role, permissions: effectivePermissions(member.role, member.permissions ?? []) });
  return { context, member, db, selected: parsed.data };
}

// Selection is untrusted input only. Identity/role/grants always come from DB.
// No cross-request caching or caller-created trusted context is accepted.
export async function requireTenantContext(selection: AuthorizationSelection = {}): Promise<TenantContext> {
  return boundary(async () => {
    const { context, selected } = await membership(selection);
    if (context.role !== "owner" || selected.locationId) deny();
    return context;
  });
}
export async function requireLocationContext(selection: AuthorizationSelection = {}): Promise<LocationContext> {
  return boundary(async () => {
    const { context, member, db, selected } = await membership(selection);
    const locationId = selected.locationId ? new ObjectId(selected.locationId) : undefined;
    if (context.role !== "owner" && (member.locationIds.length === 0 || (locationId && !member.locationIds.some((id) => same(id, locationId))))) deny();
    const rows = await db.collection<Location>("locations").find({ tenantId: context.tenantId, status: "active", ...(locationId ? { _id: locationId } : context.role === "owner" ? {} : { _id: { $in: member.locationIds } }) }, { projection: { _id: 1, tenantId: 1, status: 1 } }).limit(2).toArray();
    if (rows.length !== 1) deny();
    const location = rows[0];
    if (!(location._id instanceof ObjectId) || !(location.tenantId instanceof ObjectId) || !same(location.tenantId, context.tenantId) || location.status !== "active" || (locationId && !same(location._id, locationId)) || (context.role !== "owner" && !member.locationIds.some((id) => same(id, location._id)))) deny();
    return Object.freeze({ ...context, locationId: new ObjectId(location._id) });
  });
}
export async function requirePlatformAccess(): Promise<void> {
  return boundary(async () => { const { user } = await identity(); if (user.platformRole !== "platform_admin") deny(); });
}
export async function requirePermission(permission: Permission, selection: AuthorizationSelection = {}): Promise<LocationContext> {
  if (!(permissions as readonly string[]).includes(permission)) deny();
  const context = await requireLocationContext(selection);
  if (!context.permissions.includes(permission)) deny();
  return context;
}

// Owner-only tenant administration uses the tenant guard, never a location grant.
export async function requireTenantPermission(permission: Permission, selection: AuthorizationSelection = {}): Promise<TenantContext> {
  if (!(permissions as readonly string[]).includes(permission)) deny();
  const context = await requireTenantContext(selection);
  if (!context.permissions.includes(permission)) deny();
  return context;
}
