/** Whole Rupiah amounts, never fractional currency. Runtime integer/range
 * validation belongs at the server boundary; TypeScript number cannot enforce it. */
export type IdrAmount = number;

export type TenantStatus = "active" | "suspended" | "archived";
export type LocationStatus = "active" | "inactive";
export type UserStatus = "active" | "inactive" | "locked";
export type MembershipStatus = "active" | "inactive";
export type PlatformRole = "platform_admin";
export type TenantRole = "owner" | "admin" | "staff";
export type Role = PlatformRole | TenantRole;

/** Names from AUTH_AND_TENANCY.md section 9. No default grants implied.
 * The documented list is illustrative; extend centrally when auth is specified. */
export type Permission =
  | "vehicle.create"
  | "vehicle.read"
  | "vehicle.update_active"
  | "parking.checkout"
  | "parking.cancel"
  | "parking.read_history"
  | "tariff.read"
  | "tariff.manage"
  | "prepaid.read"
  | "prepaid.register"
  | "prepaid.deposit"
  | "prepaid.toggle_status"
  | "prepaid.refund"
  | "prepaid.adjust_balance"
  | "reports.read_operational"
  | "reports.read_financial"
  | "transactions.correct"
  | "memberships.manage"
  | "locations.manage"
  | "subscription.manage";

export type VehicleType = "motor" | "mobil";
export type ParkingStatus = "active" | "completed" | "canceled";
export type TariffType = "regular" | "overnight";
export type TariffStatus = "active" | "inactive";
export type PaymentMethod = "cash" | "qris" | "prepaid";
export type ParkingTransactionStatus = "pending" | "completed" | "voided";
export type PrepaidAccountStatus = "active" | "inactive";
export type LedgerEntryType = "deposit" | "parking_debit" | "refund" | "adjustment";
export type LedgerStatus = "pending" | "posted" | "reversed";
export type LedgerReferenceType = "parking_transaction" | "deposit" | "refund" | "adjustment";
