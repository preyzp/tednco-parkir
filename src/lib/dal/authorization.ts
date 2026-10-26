import "server-only";

import type { ObjectId } from "mongodb";

export interface TenantContext {
  readonly tenantId: ObjectId;
}

export interface LocationContext extends TenantContext {
  readonly locationId: ObjectId;
}

// Phase 2 integration points. Resolve these from authenticated server state,
// validating membership, tenant status, location ownership/access and permission.
// Tenant-wide access must itself be authorized; do not grant it to a location-
// restricted user merely because their tenant membership is active.
// Intentionally no caller-supplied IDs, context factory or permissive fallback.
export async function requireTenantContext(): Promise<TenantContext> {
  throw new Error("Database authorization is not implemented.");
}

export async function requireLocationContext(): Promise<LocationContext> {
  throw new Error("Database authorization is not implemented.");
}

export async function requirePlatformAccess(): Promise<void> {
  throw new Error("Database authorization is not implemented.");
}
