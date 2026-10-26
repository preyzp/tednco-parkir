import { expectTypeOf, test } from "vitest";
import type { ObjectId } from "mongodb";
import type {
  Tenant, Location, User, Membership, Vehicle, ParkingSession, Tariff,
  ParkingTransaction, PrepaidAccount, PrepaidLedgerEntry, AuditLog,
  TenantDto, LocationDto, UserDto, MembershipDto, VehicleDto,
  ParkingSessionDto, TariffDto, ParkingTransactionDto, PrepaidAccountDto,
  PrepaidLedgerEntryDto, AuditLogDto, AuditSnapshotValue, TenantRole, PlatformRole,
  ParkingStatus, VehicleType, TariffType, PaymentMethod, LedgerEntryType,
} from "./index";

test("persistence identifiers and timestamps stay distinct from DTO values", () => {
  type Documents = Tenant | Location | User | Membership | Vehicle |
    ParkingSession | Tariff | ParkingTransaction | PrepaidAccount |
    PrepaidLedgerEntry | AuditLog;
  expectTypeOf<Documents["_id"]>().toEqualTypeOf<ObjectId>();
  expectTypeOf<Documents["createdAt"]>().toEqualTypeOf<Date>();
  expectTypeOf<MembershipDto["locationIds"]>().toEqualTypeOf<string[]>();
  expectTypeOf<ParkingSessionDto["exitAt"]>().toEqualTypeOf<string | undefined>();
  expectTypeOf<ParkingSessionDto["transactionId"]>().toEqualTypeOf<string | undefined>();
  expectTypeOf<AuditLogDto["tenantId"]>().toEqualTypeOf<string | undefined>();
});

test("all DTOs are JSON-compatible, including audit snapshots", () => {
  type Dtos = TenantDto | LocationDto | UserDto | MembershipDto | VehicleDto |
    ParkingSessionDto | TariffDto | ParkingTransactionDto | PrepaidAccountDto |
    PrepaidLedgerEntryDto | AuditLogDto;
  expectTypeOf<Dtos>().toExtend<AuditSnapshotValue>();
  expectTypeOf<Dtos["_id"]>().toEqualTypeOf<string>();
  expectTypeOf<Dtos["createdAt"]>().toEqualTypeOf<string>();
  expectTypeOf<Date>().not.toExtend<AuditSnapshotValue>();
  expectTypeOf<ObjectId>().not.toExtend<AuditSnapshotValue>();
  expectTypeOf<UserDto>().not.toHaveProperty("passwordHash");
});

test("platform role cannot be used as a tenant membership role", () => {
  expectTypeOf<Membership["role"]>().toEqualTypeOf<TenantRole>();
  expectTypeOf<PlatformRole>().not.toExtend<TenantRole>();
  expectTypeOf<User["platformRole"]>().toEqualTypeOf<PlatformRole | undefined>();
});

test("operational unions retain the specified vocabulary", () => {
  expectTypeOf<VehicleType>().toEqualTypeOf<"motor" | "mobil">();
  expectTypeOf<ParkingStatus>().toEqualTypeOf<"active" | "completed" | "canceled">();
  expectTypeOf<TariffType>().toEqualTypeOf<"regular" | "overnight">();
  expectTypeOf<PaymentMethod>().toEqualTypeOf<"cash" | "qris" | "prepaid">();
  expectTypeOf<LedgerEntryType>().toEqualTypeOf<"deposit" | "parking_debit" | "refund" | "adjustment">();
});
