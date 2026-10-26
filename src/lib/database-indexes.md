# Controlled database index setup

`setupDatabaseIndexes()` in `database-indexes.ts` is a server-only, explicit
maintenance function. Nothing calls it automatically. It uses `getDb()` directly,
separately from application authorization/CRUD. The DAL remains closed pending
Phase 2. Names are shared with the DAL in `collection-names.ts`.

## Coverage

All explicit core indexes in DATABASE_SCHEMA.md sections 4–14 are included:
tenant slug/status; location tenant/status/name; user unique email/status;
membership tenant/user uniqueness and lookup; vehicle tenant/plate/type;
session location/status/entry history, plate/entry history and transaction lookup;
tariff lookup; transaction payment/history lookup; prepaid account uniqueness
and balance lookup; ledger account/location/reference lookup; audit lookup.
Section 15 adds unique idempotency tenant/actor/operation/key. There is no TTL
because retention has not been decided. Subscription indexes remain deferred:
no explicit definitions exist in the schema. No unrequested indexes are inferred.

## Uniqueness and schema choices

- Active sessions: unique `(tenantId, locationId, normalizedPlateSnapshot)` with
  `partialFilterExpression: { status: "active" }`. Completed/canceled history is
  excluded; other tenants/locations have separate keys. This matches persisted
  fields and states exactly. No active-session schema mismatch was found.
- Transactions: unique `(tenantId, parkingSessionId)` only when `completed`.
  Section 11 makes unconditional uniqueness conditional on a one-final-document
  model, which is not selected yet. Partial uniqueness enforces one successful
  payment without deciding storage of pending/voided payment attempts.
- Posted parking debits: unique `(tenantId, referenceId)` when type is
  `parking_debit`, status `posted`, referenceType `parking_transaction`, as
  permitted by section 13. A required transaction reference must be validated
  on writes; malformed missing references are not silently filtered out.
- Unique email assumes future server normalization. User index mapping may
  require a reviewed migration after auth-library selection. Idempotency has
  schema fields but no shared persistence type or DAL accessor yet; this task
  adds only its documented index/name, not CRUD or a new domain model.

Indexes do not normalize plates/email, authorize tenants, enforce balance or
guarantee multi-document atomicity. No tariff uniqueness rule is invented.

## Controlled staging/production deployment

1. Review definitions, target environment/database and existing `listIndexes()`.
   Use dedicated deployment credentials with index-creation privileges. Provide
   existing MONGODB_URI/MONGODB_DB_NAME securely; never log their values.
2. Securely inspect existing data for duplicate slugs/emails/memberships, active
   plate groups, completed session payments, prepaid vehicle groups, posted
   parking debit references and idempotency keys. Validate IDs, required
   normalized values and references. A unique index build can fail on existing
   duplicates. Correct data through a separately reviewed procedure; never
   automatically delete financial history. Take backups, control concurrent
   writes, schedule a maintenance window and monitor build resource use.
3. In a trusted Node.js server deployment runner capable of loading the project's
   server-only TypeScript modules, explicitly import and await:

   ```ts
   import { setupDatabaseIndexes } from "./src/lib/database-indexes";
   await setupDatabaseIndexes();
   ```

   No CLI runner, endpoint, startup hook or normal-request integration is wired
   by this milestone. Do not import this module from the application's DAL barrel.
   Apply in staging first; verify names/key order/unique/partial options via
   `listIndexes()` and test concurrency on isolated staging fixtures. Then apply
   the same reviewed setup to production in controlled deployment.
4. Identical specifications are safe to rerun using MongoDB `createIndexes`.
   Conflicting definitions or equivalent indexes with different names may fail;
   stop and review, without dropping/recreating existing indexes. There is no
   syncIndexes, collMod, TTL, destructive repair or automatic retry. Earlier
   collections may already have indexes after failure: setup is not an atomic
   multi-collection migration. Resolve the issue securely and rerun; do not
   mark deployment successful on failure.
5. Failures include only a fixed message and collection name, not driver errors,
   duplicate data or secrets. Investigate through a secure maintenance session.
   Setup leaves the shared MongoClient open; the deployment runner owns process
   lifecycle and may close it when all maintenance work has finished.

MongoDB behavior: [createIndexes reference](https://www.mongodb.com/docs/manual/reference/method/db.collection.createindexes/).
Mock tests verify definitions/options, not live enforcement or query performance.
No database was contacted while implementing this milestone. Creating indexes
can implicitly create absent collections when this function is deliberately run.
