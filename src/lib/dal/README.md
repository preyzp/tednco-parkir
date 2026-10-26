# DAL foundation

Server runtime only. Import accessors from `@/lib/dal`; never import database
helpers into Client Components. All 11 core collection names and document types
are typed in `collections.ts`, with names shared in `../collection-names.ts`.
`getDb()` is called lazily after
authorization; acquiring a collection handle does not create collections/indexes.

## Platform tenant directory (P3.2)

`platform-tenants.ts` is the first narrow read-only repository: `getPlatformOverview()`
and `listPlatformTenants(query)` call `requirePlatformAccess()` before any query,
read only `tenants` (projection `_id,name,status,createdAt`) and per-tenant
`locations` counts, and return string/number DTOs. No operational collections,
no writes. Add future platform reads here with the same guard-first shape.

## Scope boundaries

- `getTenantCollection`: tenants (matched by `_id`), locations, memberships,
  vehicles, tenant audit logs. Uses an authorized tenant from server state.
- `getLocationCollection`: locations (matched by `_id` plus tenantId), parking
  sessions, tariffs, transactions, prepaid accounts/ledger, location audit logs.
  Always includes both tenant and location constraints.
- `getPlatformCollection`: tenants, global user identities, platform audit logs.
  Requires separate platform authorization. Platform audit logs must lack both
  tenantId and locationId; tenant operational collections are not available here.
  Tenant membership lookup is not a global users listing.

Supporting subscription/idempotency collections are deferred until their typed
documents and feature scope are implemented. No untyped collection fallback.

Accessors return opaque typed handles exposing `collectionName` and
`scopedFilter(criteria)`, not raw MongoDB Collection/Db. Criteria is combined with
scope using `$and`, never spread over it. Scope identifiers are snapshotted and
fresh ObjectIds are returned per filter, so mutating one filter cannot change
subsequent scope. No CRUD execution or generic query callback is implemented.

## Phase 2 authorization integration (currently closed)

Every function in `authorization.ts` currently throws before database access.
There is no fake session, default tenant, caller-provided context, public context
issuer, or auth bypass flag. Tests mock that module; production must not do so.
Replace these integration points with trusted server authorization in Phase 2:
authenticate, verify active user/membership/tenant, location ownership and access,
and the permission required by the repository operation. Do not merely turn a
browser tenant/location ID into an authorized context. Do not cache a user's
authorization in the shared connection cache.
Tenant-wide access must be authorized explicitly; location-restricted staff must
not receive it merely by having an active membership. Such repositories must
use a location-scoped path and enforce membership/location restrictions.

This is a closed foundation, not working authentication or database row-level
security. Session validation, permissions, platform policy and request context
resolution are not implemented. Existing low-level `getDb()` remains available
for infrastructure; importing it directly bypasses DAL safeguards and must not
be done in future feature repositories or UI code.

## Future repositories

Add narrowly scoped operations inside the handle implementation (or an internal
module that preserves the same private boundary), always applying its scope at
execution. Do not expose the private Collection, caller-supplied pipelines or
callbacks. Do not implement reads as returning a filter for callers to execute
against their own raw collection. The current filter method is preparatory;
this milestone intentionally cannot execute reads/writes.

Build criteria from validated, allowlisted fields, never accept client MongoDB
filters. Check permissions for the specific action. For future writes, enforce
scope on inserted documents and prevent updates to tenant/location identifiers;
filters alone do not protect writes. Preserve financial transactions, sessions,
audit and idempotency requirements. Return explicit minimal DTOs with secrets
removed, not persistence documents or collection handles. Reauthorize each
protected operation; indexes (P1.5) do not replace authorization.
