import type { ObjectId } from "mongodb";
import type {
  IdrAmount, TenantStatus, LocationStatus, UserStatus, MembershipStatus,
  PlatformRole, TenantRole, Permission, VehicleType, ParkingStatus, TariffType,
  TariffStatus, PaymentMethod, ParkingTransactionStatus, PrepaidAccountStatus,
  LedgerEntryType, LedgerStatus, LedgerReferenceType,
} from "./shared";

// Persistence-facing documents from DATABASE_SCHEMA.md sections 4–14.
// All timestamps are BSON Dates representing UTC instants, not local strings.
export interface Tenant {
  _id: ObjectId;
  name: string;
  slug: string;
  status: TenantStatus;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Location {
  _id: ObjectId;
  tenantId: ObjectId;
  name: string;
  address?: string;
  timezone: string;
  operatingHours?: {
    [day: string]: { open: string; close: string; isClosed: boolean };
  };
  status: LocationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  _id: ObjectId;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  status: UserStatus;
  platformRole?: PlatformRole;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

export interface Membership {
  _id: ObjectId;
  tenantId: ObjectId;
  userId: ObjectId;
  role: TenantRole;
  status: MembershipStatus;
  locationIds: ObjectId[];
  permissions?: Permission[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Vehicle {
  _id: ObjectId;
  tenantId: ObjectId;
  plateNumber: string;
  normalizedPlate: string;
  type: VehicleType;
  customerName?: string;
  phone?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ParkingSession {
  _id: ObjectId;
  tenantId: ObjectId;
  locationId: ObjectId;
  vehicleId: ObjectId;
  plateNumberSnapshot: string;
  normalizedPlateSnapshot: string;
  vehicleTypeSnapshot: VehicleType;
  customerNameSnapshot?: string;
  phoneSnapshot?: string;
  notes?: string;
  entryAt: Date;
  exitAt?: Date;
  status: ParkingStatus;
  enteredBy: ObjectId;
  completedBy?: ObjectId;
  canceledBy?: ObjectId;
  canceledAt?: Date;
  cancellationReason?: string;
  cancellationNote?: string;
  transactionId?: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface Tariff {
  _id: ObjectId;
  tenantId: ObjectId;
  locationId: ObjectId;
  vehicleType: VehicleType;
  tariffType: TariffType;
  amount: IdrAmount;
  currency: "IDR";
  status: TariffStatus;
  createdAt: Date;
  updatedAt: Date;
  updatedBy: ObjectId;
}

export interface ParkingTransaction {
  _id: ObjectId;
  tenantId: ObjectId;
  locationId: ObjectId;
  parkingSessionId: ObjectId;
  plateNumberSnapshot: string;
  vehicleTypeSnapshot: VehicleType;
  tariffSnapshot: {
    tariffType: TariffType;
    amountPerUnit: IdrAmount;
    nightCount?: number;
    totalAmount: IdrAmount;
    currency: "IDR";
  };
  paymentMethod: PaymentMethod;
  amountDue: IdrAmount;
  amountPaid: IdrAmount;
  cashReceived?: IdrAmount;
  changeAmount?: IdrAmount;
  status: ParkingTransactionStatus;
  processedBy: ObjectId;
  paymentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PrepaidAccount {
  _id: ObjectId;
  tenantId: ObjectId;
  locationId: ObjectId;
  vehicleId: ObjectId;
  normalizedPlate: string;
  plateNumberSnapshot: string;
  balance: IdrAmount;
  status: PrepaidAccountStatus;
  createdAt: Date;
  updatedAt: Date;
  createdBy: ObjectId;
  updatedBy: ObjectId;
}

export interface PrepaidLedgerEntry {
  _id: ObjectId;
  tenantId: ObjectId;
  locationId: ObjectId;
  prepaidAccountId: ObjectId;
  type: LedgerEntryType;
  amount: IdrAmount;
  balanceBefore: IdrAmount;
  balanceAfter: IdrAmount;
  status: LedgerStatus;
  paymentMethod?: PaymentMethod;
  referenceType?: LedgerReferenceType;
  referenceId?: ObjectId;
  reason?: string;
  performedBy: ObjectId;
  createdAt: Date;
  postedAt?: Date;
}

/** One document in prepaidLedger; schema calls it PrepaidLedgerEntry. */
export type PrepaidLedger = PrepaidLedgerEntry;

export interface AuditLog {
  _id: ObjectId;
  tenantId?: ObjectId;
  locationId?: ObjectId;
  actorId: ObjectId;
  action: string;
  entityType: string;
  entityId: ObjectId;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string;
  requestId?: string;
  createdAt: Date;
}
