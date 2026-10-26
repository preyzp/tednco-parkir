import "server-only";

export { getTenantCollection, getLocationCollection, getPlatformCollection } from "./collections";
export type { TenantCollectionName, LocationCollectionName, PlatformCollectionName } from "./collections";
export { listAuthorizedWorkspaces, requireLocationContext } from "./authorization";
export type { AuthorizedWorkspace, LocationContext } from "./authorization";
