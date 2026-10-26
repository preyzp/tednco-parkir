import type {
  Tenant, Location, User, Membership, Vehicle, ParkingSession, Tariff,
  ParkingTransaction, PrepaidAccount, PrepaidLedgerEntry, AuditLog,
} from "./documents";

// JSON boundary conventions: ObjectId.toHexString() and Date.toISOString().
// These declarations do not serialize or authorize data; explicit mapping and
// field selection must happen on the server before exposing a DTO.
export type TenantDto = Omit<Tenant, "_id" | "createdAt" | "updatedAt"> & {
  _id: string; createdAt: string; updatedAt: string;
};

export type LocationDto = Omit<Location, "_id" | "tenantId" | "createdAt" | "updatedAt"> & {
  _id: string; tenantId: string; createdAt: string; updatedAt: string;
};

export type UserDto = Omit<User, "_id" | "passwordHash" | "createdAt" | "updatedAt" | "lastLoginAt"> & {
  _id: string; createdAt: string; updatedAt: string; lastLoginAt?: string;
};

export type MembershipDto = Omit<Membership, "_id" | "tenantId" | "userId" | "locationIds" | "createdAt" | "updatedAt"> & {
  _id: string; tenantId: string; userId: string; locationIds: string[];
  createdAt: string; updatedAt: string;
};

export type VehicleDto = Omit<Vehicle, "_id" | "tenantId" | "createdAt" | "updatedAt"> & {
  _id: string; tenantId: string; createdAt: string; updatedAt: string;
};

export type ParkingSessionDto = Omit<ParkingSession,
  "_id" | "tenantId" | "locationId" | "vehicleId" | "entryAt" | "exitAt" |
  "enteredBy" | "completedBy" | "canceledBy" | "canceledAt" | "transactionId" |
  "createdAt" | "updatedAt"
> & {
  _id: string; tenantId: string; locationId: string; vehicleId: string;
  entryAt: string; exitAt?: string;
  enteredBy: string; completedBy?: string; canceledBy?: string;
  canceledAt?: string; transactionId?: string;
  createdAt: string; updatedAt: string;
};

export type TariffDto = Omit<Tariff, "_id" | "tenantId" | "locationId" | "updatedBy" | "createdAt" | "updatedAt"> & {
  _id: string; tenantId: string; locationId: string; updatedBy: string;
  createdAt: string; updatedAt: string;
};

export type ParkingTransactionDto = Omit<ParkingTransaction,
  "_id" | "tenantId" | "locationId" | "parkingSessionId" | "processedBy" |
  "paymentAt" | "createdAt" | "updatedAt"
> & {
  _id: string; tenantId: string; locationId: string; parkingSessionId: string;
  processedBy: string; paymentAt?: string; createdAt: string; updatedAt: string;
};

export type PrepaidAccountDto = Omit<PrepaidAccount,
  "_id" | "tenantId" | "locationId" | "vehicleId" | "createdBy" | "updatedBy" | "createdAt" | "updatedAt"
> & {
  _id: string; tenantId: string; locationId: string; vehicleId: string;
  createdBy: string; updatedBy: string; createdAt: string; updatedAt: string;
};

export type PrepaidLedgerEntryDto = Omit<PrepaidLedgerEntry,
  "_id" | "tenantId" | "locationId" | "prepaidAccountId" | "referenceId" | "performedBy" | "createdAt" | "postedAt"
> & {
  _id: string; tenantId: string; locationId: string; prepaidAccountId: string;
  referenceId?: string; performedBy: string; createdAt: string; postedAt?: string;
};
export type PrepaidLedgerDto = PrepaidLedgerEntryDto;

// Audit snapshots require explicit JSON-safe projection and redaction, since
// the persistence schema deliberately allows unknown values.
export type AuditSnapshotValue = string | number | boolean | null |
  AuditSnapshotValue[] | { [key: string]: AuditSnapshotValue };

export type AuditLogDto = Omit<AuditLog,
  "_id" | "tenantId" | "locationId" | "actorId" | "entityId" | "before" | "after" | "createdAt"
> & {
  _id: string; tenantId?: string; locationId?: string;
  actorId: string; entityId: string; createdAt: string;
  before?: Record<string, AuditSnapshotValue>;
  after?: Record<string, AuditSnapshotValue>;
};
