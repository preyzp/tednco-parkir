# Shared domain types

Use `import type { ... } from "@/types"`. All exports are types; no runtime
MongoDB import or connection is introduced.

- `shared.ts`: explicit domain unions and `IdrAmount` (whole integer IDR).
- `documents.ts`: persistence-facing interfaces matching `DATABASE_SCHEMA.md`
  sections 4–14, including ObjectId references and UTC BSON Date timestamps.
- `dtos.ts`: JSON-facing representations with hex string identifiers and UTC
  ISO 8601 timestamp strings; field names and optionality are preserved.
  User has no password field; credentials belong only to the library account
  model. Audit snapshots accept only JSON values.
- `auth.ts`: BSON projections of Better Auth account/session/verification/rate
  limit types, with ObjectId primary and referenced user identifiers. No DTOs
  exposing auth credentials or session tokens are exported.

DTO declarations do not transform, redact, authorize, or validate runtime data.
Server mapping must explicitly select safe fields: assigning a document to a
type or using a type assertion does not remove secrets. Format timestamps in the
location/business timezone only for display. Operating hours remain local clock
strings as specified by the schema.

`IdrAmount` is a number alias documenting whole Rupiah, not fractional currency.
TypeScript cannot enforce integer values, positive night counts, safe numeric
ranges, nonnegative balances, or lifecycle transitions. Enforce those in future
server validation/business logic, without treating these types as input schemas.
Optional lifecycle fields follow the documented interfaces without inventing
additional persisted states or required fields.

Known specification gaps (no behavior introduced here):

- The business rules file is named `BUSINESS_RULE.md` on disk, although its title
  and other documents refer to `BUSINESS_RULES.md`.
- Permission names in `AUTH_AND_TENANCY.md` section 9 are examples. `Permission`
  lists those names centrally, with no default grants or authorization policy.
  Entry-time correction is mentioned but has no dedicated permission key yet.
- Ledger adjustment amount sign/direction and reversal linkage are not fully
  specified. No direction or reversal-reference fields have been invented.
- Refund rules allow transfer, but ledger `paymentMethod` only specifies cash,
  qris, prepaid. The documented enum is preserved pending a schema decision.
- User persistence follows Better Auth with `emailVerified` and optional image.
  Legacy users/password hashes require a separately reviewed migration; no
  migration or database writes are performed by type declarations.
