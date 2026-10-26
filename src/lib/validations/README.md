# Shared server validation

Import schemas from `@/lib/validations`. All modules are server-only and use the
existing Zod dependency. Nothing connects to a database or executes a workflow.
Validate the original payload as a whole; do not first pick known fields, since
that would hide unexpected input from strict-object validation.

Use `safeParse(unknownInput)` and only use `result.data` on success. No number,
boolean or date coercion is performed. Future FormData/query adapters must parse
their explicit transport types before validation, without silently dropping
unrecognized fields or accepting duplicate parameter keys.

## Inputs and outputs

- Vehicle entry: `plateNumber`, `type`, optional `customerName`, `phone`, `notes`.
  Plate display is trimmed and uppercased with internal spacing preserved;
  `normalizedPlate` is derived by removing whitespace. Updates accept a nonempty
  partial payload of those fields; normalization is recomputed if the plate is
  supplied. The client cannot submit normalizedPlate itself. No regional plate
  regex is invented. Duplicate active sessions still require server/index checks.
- Cancellation: `cancellationReason` from the five labels in BUSINESS_RULE.md
  section 4; `cancellationNote` required and nonblank for `Lainnya` (other).
- Tariff configuration: `vehicleType`, `tariffType`, `amount`. Currency is server
  constant IDR, not caller input; rate is a positive safe integer.
- Checkout: explicit `tariffType`, one `paymentMethod`, `nightCount` required for
  overnight, optional `cashReceived` for cash. Night count is a positive safe
  integer. A regular request with nightCount or a noncash request with
  cashReceived is rejected rather than silently ignoring stale fields. No default
  tariff or automatic overnight selection. No total/paid/balance/status fields.
- Prepaid registration: vehicle entry fields plus `amount` (initial deposit) and
  `paymentMethod` (cash/qris). Deposit: `amount`, `paymentMethod`. Amounts are
  positive safe integer IDR. Refund request: `amount`, nonblank `reason` only.
- Shared monetary primitives: zero allowed by nonNegativeIdrSchema, forbidden by
  positiveIdrSchema. All reject fractional, negative, nonfinite and unsafe values.
  Cash received is nonnegative; sufficiency against the calculated bill is a
  future business check. Safe operands do not guarantee a safe multiplication
  result; future server calculations must validate resulting totals as well.
- Pagination: explicit positive safe integer `page` and `pageSize`, no defaults.
  Date range: required ISO calendar dates `from`/`to`, with from <= to. Parking
  search: optional trimmed `search`, `type`, parking `status`. Empty search means
  no search term; query escaping/normalized partial plate matching belongs to
  repositories. No tenant/location filter may establish authorization.

All operation/filter objects are strict: unknown tenantId, locationId, staffId,
timestamps, actor IDs, totals, prepaid balances, status, split payments and QRIS
confirmation flags are rejected unless explicitly part of that specific schema.
Omission and undefined are optional where declared; null is never a synonym.
Optional text stays a trimmed string, including empty string; no null/delete
semantics are introduced. Required plate/reason/note cannot be whitespace-only.

## Safe errors

```ts
const publicFields = ["plateNumber", "type", "customerName", "phone", "notes"] as const;
const result = vehicleEntrySchema.safeParse(input);
if (!result.success) {
  const failure = toValidationError(result.error, publicFields);
  const response = normalizeError(failure, publicFields); // from @/lib/errors
  // Future route: Response.json(response.body, { status: response.status }).
  // Future action: return response.body as expected failure state.
}
```

Pass server-owned allowlists at both boundaries. The converter includes only
single-segment allowlisted paths and fixed reason codes, deduplicated. Root-level
unknown keys/nested paths produce a generic validation failure, never key names
or input values. Zod messages, input, limits and enum payloads are not returned or
logged. Raw Zod errors still become INTERNAL_ERROR through normalizeError unless
explicitly converted. Missing/type errors map to INVALID; conditional required
fields use REQUIRED, lower/upper bounds use TOO_SMALL/TOO_LARGE. No schema issue
message text is parsed.

## Specification gaps and remaining server checks

- Domain types have no cancellation machine-code union. Label strings above
  follow the documented options; English `other` or invented codes are not
  accepted. Agree on a stable code convention before a future transport migration.
- Refund transfer is permitted by business rules but absent from ledger payment
  enum. Request validation intentionally stops at amount/reason; method, transfer
  details/status and full-versus-partial refund policy require a schema/workflow
  decision. A parsed refund does not mean refund is authorized or executable.
- No numeric max for text/plate length, phone format, pagination sizes/defaults,
  or maximum night count is specified (besides safe integers). Do not imply these
  are final production abuse limits. Set reviewed request-size/page-size/text
  limits before exposing endpoints; no arbitrary product limits are imposed here.
- `page`/`pageSize`, `search`, `from`/`to` and initial deposit `amount` are minimal
  input conventions, not new persisted fields. No routes currently consume them.
  Named date presets and end-date inclusivity/timezone boundaries are deferred;
  future queries must use the authorized location/business timezone, never assume
  the client/server timezone. This module only validates calendar order.
- Resource target IDs are not in these bodies. Future routes must separately
  validate resource identifiers and authorize the retrieved tenant/location.
  Vehicle-update empty text handling is not a database unset policy.

Before writes: authenticate/authorize membership and location, read authoritative
tariffs/session/account state, enforce permissions and active/unpaid cancellation,
check cash/prepaid/refund sufficiency and QRIS verification, and preserve audit,
idempotency and atomic financial persistence. Registration parsing does not
activate prepaid or post a deposit. Never accept a client confirmation as proof,
retry financial writes automatically or report success before persistence.
