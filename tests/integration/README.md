# Opt-in MongoDB foundation verification

This suite is **live-verified on Atlas (2026-10-18): 4/4 passed**. Normal `pnpm test` discovers only
`*.test.ts` / `*.spec.ts`; the four live checks are named `*.integration.ts` and
selected only by `vitest.integration.config.mts`. Production build typechecks
these files but never executes them. The normal suite tests the safety guard
offline in `target.test.ts`.

The Atlas **development read-only ping** was verified separately through getDb().
That result alone did not verify indexes/concurrent writes. Subsequently the
owner explicitly approved reusing the Atlas connection for index/fixture writes
only in a new random test database. All four checks passed there, with no writes
or index setup on the development database. This is not authorization for future
unattended live runs: obtain explicit approval for each live verification task.

## Approval and isolation

Do not run a live write without explicit owner approval. After approval, use an
isolated, disposable **local** MongoDB test service, preferably on port 27018.
Local mode rejects remote hosts, credentials, database paths, arbitrary URI
options and application database variables. Separately approved Atlas mode uses
only MONGODB_URI/MONGODB_DB_NAME parsed from `.env.local` when the exact Atlas
opt-in token is set. It requires mongodb+srv and a hostname ending .mongodb.net,
strips the URI's application database path, and overrides the helper database with
a random test name. Caller-supplied database-name overrides are never accepted.
Credentials remain in memory and are not logged. The application file is not
modified; source development records/indexes are never used by the live suite.

The harness generates a new `tednco_parkir_test_<32 hex UUID>` database for local
mode, or `tpk_t_<32 hex UUID>` for Atlas mode (38 ASCII bytes, full UUID entropy).
Atlas Free has a [38-byte database-name limit](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/).
Both modes generate a fresh name each run;
callers cannot select a development/production database. Before index creation
it verifies the namespace has no collections. All subsequent indexes and writes
use that exact database. In local mode only loopback URIs with explicit port and an optional
replicaSet name are accepted. Use an isolated service rather than a forwarded
production port; URI syntax cannot prove which server is behind a local tunnel.

There is **no automatic dropDatabase, dropCollection, deletion, index removal or
financial workflow**. Synthetic fixtures and created indexes remain in the fresh
test database for inspection. The client is closed in afterAll, even after a
failed verification, and environment stubs are restored. Retained databases use
disk space; any later cleanup is a separate, explicitly approved operator task.

## Commands (only after approval)

### Atlas (separate explicit approval)

The existing `.env.local` must contain valid Atlas configuration. Do not print or
copy its credentials into a command. After explicit approval for test-only writes:

```powershell
$env:RUN_MONGODB_INTEGRATION = 'I_APPROVE_ATLAS_TEST_WRITES'
try { pnpm test:integration --reporter=verbose --silent=false }
finally { Remove-Item Env:RUN_MONGODB_INTEGRATION -ErrorAction SilentlyContinue }
```

Only after a successful empty-namespace check does the runner print the generated
test database name (not URI/credentials), then initialize indexes and fixtures.
The Atlas account must be permitted to create/read/write that isolated database.
Do not widen account permissions automatically if authorization fails.

### Local

Start the approved disposable MongoDB service yourself. In a dedicated shell
with no application database variables, set only:

```powershell
$env:RUN_MONGODB_INTEGRATION = 'I_APPROVE_LOCAL_TEST_WRITES'
$env:MONGODB_TEST_URI = 'mongodb://127.0.0.1:27018/'
pnpm test:integration
```

For an already-configured local replica set, the supported URI is
`mongodb://127.0.0.1:27018/?replicaSet=rs0`. Remove the opt-in variable when done;
do not leave it in a shared developer/CI environment. Neither URI contains
credentials. Tests never print credentials, raw driver causes or connection
strings. Failure diagnostics are intentionally generic; inspect the dedicated
service securely. No real URI/secret is committed in fixtures.

Running `pnpm test:integration` without the exact opt-in **fails** in beforeAll
before client acquisition. It does not report a green skipped integration run.
The earlier local review exercised this disabled-guard path only. Later approved
Atlas verification used the distinct Atlas token and passed all four live checks.

## What the live suite will verify

1. Real connection helper reuse; controlled initialization creates 31 named
   indexes across 12 collections. Repeating initialization leaves listIndexes
   unchanged, including the active-session partial unique definition.
2. Two genuinely concurrent inserts of the same active normalized plate within
   tenant/location produce one successful insert and one duplicate-key 11000;
   another tenant/location and completed/canceled histories are permitted.
3. Concurrent completed payments per session and posted parking debit references
   produce one success/one 11000. Pending records are outside those partial
   constraints. These synthetic fixtures test indexes, not valid financial
   lifecycle execution or ledger reconciliation.
4. Prepaid account tenant/location/vehicle uniqueness and idempotency
   tenant/actor/operation/key uniqueness hold under concurrent inserts, with
   differing location/actor permitted.

The suite directly uses MongoDB fixture writes, not application repositories.
It does not test authentication, DAL execution, actual financial transactions,
idempotent business responses, rollback, query performance, or snapshot safety.
Those require implemented operations and (for transactions) a replica set.
Index conflict propagation is mock-tested without destructive server index
migrations. Live foundation results are now recorded in HANDOFF.md and
TESTING_STRATEGY.md. Before production deployment additionally verify staging data/index
compatibility using `src/lib/database-indexes.md`. Never claim live checks passed
from a green offline test count.

## Verified Atlas run

- Date: 2026-10-18; database `tpk_t_fddf793a3e2e4ec1b0ffc6001a8fc81a`.
- Result: 4 tests passed, 0 failed; 1 file; 6.39 seconds total.
- Before that successful run, two attempts stopped at empty-namespace preflight
  before index setup or fixture writes. The original long test name exceeded
  the Atlas Free limit; the short Atlas prefix preserves the full random UUID.
- 31 explicit indexes across 12 collections, repeat initialization unchanged,
  active/history scope behavior, and concurrent duplicate rejection verified.
- Shared test connection closed and opt-in environment restored. Database,
  indexes and fixtures retained; no automatic cleanup or development writes.
