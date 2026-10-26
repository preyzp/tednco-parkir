import "server-only";

import { ObjectId, type Collection, type Document, type Filter } from "mongodb";
import type {
  Tenant, Location, User, Membership, Vehicle, ParkingSession, Tariff,
  ParkingTransaction, PrepaidAccount, PrepaidLedgerEntry, AuditLog,
} from "../../types";
import { getDb } from "../mongodb";
import { collectionNames } from "../collection-names";
import {
  requireTenantContext, requireLocationContext, requirePlatformAccess,
} from "./authorization";
import type { AuthorizationSelection } from "./authorization";

// Core collections only (DATABASE_SCHEMA.md section 3). Supporting collections
// await their persistence types and feature scope; no implicit Document fallback.
interface CoreDocuments {
  tenants: Tenant;
  locations: Location;
  users: User;
  memberships: Membership;
  vehicles: Vehicle;
  parkingSessions: ParkingSession;
  tariffs: Tariff;
  parkingTransactions: ParkingTransaction;
  prepaidAccounts: PrepaidAccount;
  prepaidLedger: PrepaidLedgerEntry;
  auditLogs: AuditLog;
}

export type TenantCollectionName = "tenants" | "locations" | "memberships" | "vehicles" | "auditLogs";
export type LocationCollectionName = "locations" | "parkingSessions" | "tariffs" |
  "parkingTransactions" | "prepaidAccounts" | "prepaidLedger" | "auditLogs";
export type PlatformCollectionName = "tenants" | "users" | "auditLogs";

// Runtime allowlists also reject names smuggled past TypeScript at boundaries.
const tenantNames = new Set<string>(["tenants", "locations", "memberships", "vehicles", "auditLogs"]);
const locationNames = new Set<string>(["locations", "parkingSessions", "tariffs", "parkingTransactions", "prepaidAccounts", "prepaidLedger", "auditLogs"]);
const platformNames = new Set<string>(["tenants", "users", "auditLogs"]);

// A foundation handle, not a CRUD repository. Raw Collection/Db never escapes.
// Add narrowly scoped repository methods here later; do not add a raw getter,
// arbitrary callback, aggregate pipeline, or unscoped query escape hatch.
class ScopedCollection<T extends Document> {
  #collection: Collection<T>;
  #scope: () => Filter<T>;

  constructor(collection: Collection<T>, scope: () => Filter<T>) {
    this.#collection = collection;
    this.#scope = scope;
  }

  get collectionName(): string {
    return this.#collection.collectionName;
  }

  scopedFilter(criteria: Filter<T> = {}): Filter<T> {
    // Driver Filter recursively applies WithId<T> to logical operands; TS cannot
    // prove that normalization is idempotent for a generic document type.
    return { $and: [this.#scope(), criteria] } as Filter<T>;
  }
}

function checkName(name: string, allowed: Set<string>): void {
  if (!allowed.has(name)) throw new Error("Collection is not available in this database scope.");
}

function snapshotId(id: ObjectId): string {
  if (!(id instanceof ObjectId)) throw new Error("Invalid authorized database scope.");
  return id.toHexString();
}

export async function getTenantCollection<K extends TenantCollectionName>(name: K, selection?: AuthorizationSelection) {
  checkName(name, tenantNames);
  const context = await requireTenantContext(selection);
  const tenantId = snapshotId(context.tenantId);
  const db = await getDb();
  return new ScopedCollection(db.collection<CoreDocuments[K]>(collectionNames[name]), () => (
    name === "tenants" ? { _id: new ObjectId(tenantId) } : { tenantId: new ObjectId(tenantId) }
  ) as Filter<CoreDocuments[K]>);
}

export async function getLocationCollection<K extends LocationCollectionName>(name: K, selection?: AuthorizationSelection) {
  checkName(name, locationNames);
  const context = await requireLocationContext(selection);
  const tenantId = snapshotId(context.tenantId);
  const locationId = snapshotId(context.locationId);
  const db = await getDb();
  return new ScopedCollection(db.collection<CoreDocuments[K]>(collectionNames[name]), () => (
    name === "locations"
      ? { tenantId: new ObjectId(tenantId), _id: new ObjectId(locationId) }
      : { tenantId: new ObjectId(tenantId), locationId: new ObjectId(locationId) }
  ) as Filter<CoreDocuments[K]>);
}

export async function getPlatformCollection<K extends PlatformCollectionName>(name: K) {
  checkName(name, platformNames);
  await requirePlatformAccess();
  const db = await getDb();
  return new ScopedCollection(db.collection<CoreDocuments[K]>(collectionNames[name]), () => (
    // Platform audit access excludes tenant operational audit records.
    name === "auditLogs" ? { tenantId: { $exists: false }, locationId: { $exists: false } } : {}
  ) as Filter<CoreDocuments[K]>);
}
