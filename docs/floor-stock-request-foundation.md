# Floor-stock request foundation

This phase adds a server-mediated request workflow between a department and the
facility pharmacy. It does not deploy Firestore rules or indexes, connect a
production Firebase project, or deploy the application.

## Lifecycle and authority

The strict lifecycle is:

`draft → submitted → approved → fulfilling → ready → delivered`

A submitted request may instead become `rejected`. Its creating department user
may cancel only a `draft` or `submitted` request. A department user creates,
submits, and cancels only requests bound to the trusted active department and
only when that user created the request. Pharmacy reviewers may approve or
reject submitted requests. Pharmacy fulfillment roles may start fulfillment,
mark all approved lines ready, and confirm delivery. Invalid transitions fail
with a conflict and cannot skip lifecycle states.

Approval currently accepts the requested quantities in full. Completion records
the approved quantity as fulfilled for every line. Partial approval, partial
fulfillment, substitutions, back orders, and department-side receipt
acknowledgement are deferred.

## Trust boundary

Tenant, platform, organization, active facility, active department, UID, roles,
permission overrides, the `new_request` feature flag, and authorization
fingerprint come only from the opaque server session and trusted Firestore
records. The browser can submit only configuration IDs, whole-unit quantities,
an optional bounded note, a target request ID in the route, and an independent
correlation ID.

Authorization is checked at the HTTP boundary and repeated inside the Firestore
transaction. Transactional revalidation reloads the trusted user profile, role
assignments, tenant directory, department membership, active facility, feature
flags, overrides, and authorization fingerprint. Account, membership, role,
scope, deny override, or feature changes fail closed before any write.

Create operations validate each referenced active floor-stock configuration,
active medication item, and active department location against the trusted
tenant, organization, facility, and department. Requested quantities are exact
positive integers and cannot exceed the trusted configured maximum. Duplicate
configuration lines are rejected.

## Storage and atomicity

- `floorStockRequests/{requestId}` stores the versioned request header and
  lifecycle timestamps.
- `floorStockRequests/{requestId}/lines/{lineId}` stores immutable configuration,
  item, location, unit, and requested-quantity identity plus approval and
  fulfillment quantities.
- `floorStockRequestKeys/{namespaceId}` stores payload-bound idempotency markers
  scoped by actor, tenant, operation, and correlation ID.
- `floorStockRequestAuditEvents/{eventId}` stores append-only sanitized lifecycle
  audit events.

Every operation reads before writing, then commits the header, affected lines,
audit event, and idempotency marker in one Firestore transaction. Audit failure
rolls the complete operation back. Replays revalidate current authority before
returning the existing request, and altered-payload reuse conflicts.

All four collection paths, including nested request lines, are explicitly denied
to browser reads and writes. Server directory reads are schema-validated,
facility-scoped, optionally department-scoped, capped at 25 returned requests,
and use canonical independent document cursors. Configuration selection reads
are bounded with an overflow sentinel.

## HTTP and interface

The lifecycle uses operation-specific POST endpoints under
`/api/floor-stock-requests`. Each request requires exact same-origin checks,
same-origin Fetch Metadata, exact JSON content type, the operation-specific CSRF
header, a canonical correlation ID, exact bounded content length, UTF-8 JSON,
and duplicate-key rejection. Safe errors do not disclose whether an inaccessible
request exists.

The protected Arabic/English page at `/app/requests` shows only server-filtered
requests. Mutation controls are filtered by the current server-derived
capabilities and request status, while every API independently reauthorizes the
operation.

## Explicitly deferred

Request fulfillment does not yet create inventory issue/transfer ledger entries
or decrement balances. Lot/expiry selection and atomic linkage to an inventory
transaction are required before that integration can be safe. Operational users
must not treat a `delivered` request as an inventory ledger posting in this
phase.

Also deferred: partial quantities, substitutions, shortage reasons, back orders,
request editing, line-level history, receiver signatures, notifications,
printing, service-level timers, reporting, reconciliation, retention, rate
limiting, monitoring, and every production deployment.
