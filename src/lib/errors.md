# Server error handling

Import `AppError` and `normalizeError` from `@/lib/errors` in server code only.
No endpoints, actions, logging framework or automatic retry are installed.

| Code | HTTP |
| --- | --- |
| VALIDATION_ERROR | 400 |
| UNAUTHENTICATED | 401 |
| FORBIDDEN | 403 |
| RESOURCE_NOT_FOUND | 404 |
| CONFLICT | 409 |
| BUSINESS_RULE_VIOLATION | 422 |
| SERVICE_UNAVAILABLE | 503 |
| INTERNAL_ERROR | 500 |

`new AppError(code)` represents a known application failure. All client messages
come from a fixed Indonesian catalog. No custom message/cause option is provided:
raw driver and validation causes may contain secrets and are not retained here.
Do not put raw errors in responses or logs. If future diagnostics need causes,
retain only explicitly reviewed, sanitized metadata in a separate internal path.

`normalizeError(error, publicFields?)` returns `{ status, body }`, where body is
`{ ok: false, error: { code, message, fieldErrors? } }`. Unknown values, raw Zod
errors and all raw MongoDB errors (including duplicate keys) become generic 500
responses. They are not automatically considered safe conflicts. A repository
may map a known duplicate index to `CONFLICT` after checking its business context;
never expose key values/index errors. Known errors are registered internally;
objects claiming a known code or mutating an error's public properties cannot
inject client messages. Only the normalized body is suitable for serialization.

## Field validation and future boundaries

```ts
const failure = new AppError("VALIDATION_ERROR", [
  { field: "plateNumber", code: "REQUIRED" },
]);
const { status, body } = normalizeError(failure, ["plateNumber", "type"]);
// Future Route Handler failure branch: Response.json(body, { status }).
// Future Server Action expected-error branch: return body as action state.
```

Allowed field reasons: REQUIRED, INVALID, TOO_SMALL, TOO_LARGE. Messages are fixed;
no input values, dynamic limits or raw schema issue messages are serialized.
Pass static server-owned public field names, not names/paths supplied by a
request. Without an allowlist, all field details are omitted. Validation schemas
and the mapping from Zod issues to these safe reasons belong to P1.7; do not pass
Zod errors/flattened messages directly. Future UI may import response *types*
with `import type`; runtime imports remain server-only.

For future routes, catch narrowly around application work and use one result:

```ts
const normalized = normalizeError(error);
return Response.json(normalized.body, { status: normalized.status });
```

For actions, model expected failures as returned state,
as the local Next.js guide recommends. Do not return an Error object. A catch
used at a boundary may normalize unexpected application failures to safe state,
but it must not swallow framework control-flow exceptions. Keep redirect(),
notFound() and framework calls outside the application catch; do not install
a blanket wrapper around an entire route/action. Successful results must only
be returned after persistence confirms success.

## Financial operations

No error category implies successful checkout/deposit/refund, rollback or
definitive failure to commit. Unknown/timeout outcomes may already have committed.
Never automatically retry a financial mutation or return success in a catch.
Use the future idempotency/transaction design to check the persisted operation
status before any explicitly authorized retry. Reconcile uncertain outcomes on
the server, and audit required financial actions without secrets. This module
does not implement transactions, reconciliation, idempotency or business rules.

Existing env/MongoDB/DAL/index modules retain their current errors. Until their
future integration maps a failure explicitly, normalization treats them as 500;
do not infer codes from English message text. Phase 2 must produce authenticated
authorization decisions, not merely replace an unimplemented gate with 401.
Tenant resource lookup should consistently use the documented not-found/forbidden
policy without leaking whether another tenant's object exists. No new auth or
CRUD behavior is implemented by this milestone.
