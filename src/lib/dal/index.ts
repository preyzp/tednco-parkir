import "server-only";

export { getTenantCollection, getLocationCollection, getPlatformCollection } from "./collections";
export type { TenantCollectionName, LocationCollectionName, PlatformCollectionName } from "./collections";
export { hasPlatformAccess, listAuthorizedWorkspaces, requireLocationContext, requirePlatformAccess } from "./authorization";
export type { AuthorizedWorkspace, LocationContext } from "./authorization";
export { getPlatformOverview, getPlatformTenantDetail, listPlatformTenants, parseTenantListQuery } from "./platform-tenants";
export type { PlatformOverview, PlatformTenantDetail, PlatformTenantRow, TenantListQuery, TenantListResult, TenantRowStatus } from "./platform-tenants";
export { createTenantWithOwner } from "./platform-tenant-create";
export type { CreateTenantResult } from "./platform-tenant-create";
export { changeTenantStatus, renameTenant } from "./platform-tenant-update";
export type { UpdateTenantResult } from "./platform-tenant-update";
export { changeTenantLocationStatus, createTenantLocation, renameTenantOwner, updateTenantLocation } from "./platform-tenant-resources";
export type { TenantResourceResult } from "./platform-tenant-resources";
