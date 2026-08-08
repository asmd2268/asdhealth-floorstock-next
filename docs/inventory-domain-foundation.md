# Inventory domain foundation

This phase introduces medication inventory primitives and server-mediated posting. It does not deploy Firestore rules or indexes and does not connect a production Firebase project.

## Trust boundary

Firebase Authentication proves only the UID. An opaque HttpOnly server session is resolved on every inventory page and mutation. Tenant, platform, organization, active facility, scoped role assignments, explicit overrides, and the `inventory` feature flag come from validated trusted records. The browser may submit only an operation-specific location ID, item/lot input, exact integer quantity, unit, and request ID. It cannot submit trusted scope or authorization data.

The posting service repeats trusted session resolution inside the Firestore transaction and compares the authorization fingerprint captured by the protected request boundary. Any account, tenant, facility, role, override, or feature change rejects the transaction. Explicit deny retains precedence. Every location, item, lot, and existing balance is then schema-validated and matched to the resolved tenant and active facility.

The current trusted identity model has no department-membership record. Consequently, `department_user` receives no inventory read or posting default in this phase; granting facility-wide inventory visibility would leak other departments. Pharmacy and warehouse roles operate only within the revalidated active facility, and any movement between two department-bound locations must use the explicit transfer operation. A future department-membership boundary is required before department-user inventory access can be enabled.

## Collections and limits

- `inventoryItems/{itemId}`: tenant medication catalog with exact integer unit conversions and stock policies.
- `inventoryLocations/{locationId}`: active-facility hierarchy with platform, organization, facility, optional department, parent, and kind. Ancestry is cycle-checked to eight levels.
- `inventoryLots/{lotId}`: facility/item-bound lot number and strict `YYYY-MM-DD` expiry.
- `floorStockConfigurations/{configurationId}`: department/location/item minimum, maximum, and reorder thresholds in one exact unit.
- `inventoryBalances/{balanceId}`: materialized base-unit balance keyed by a domain-separated identity hash.
- `inventoryTransactions/{transactionId}` and `/lines/{lineId}`: immutable posted movement and lines.
- `inventoryRequestKeys/{namespaceId}`: actor, tenant, operation, and request-scoped idempotency marker.
- `inventoryAuditEvents/{eventId}`: append-only, bounded, sanitized audit event.

Browser reads and writes are explicitly denied. Directory pages fetch 26 and return at most 25 records. Posting accepts at most 100 lines, each entered quantity is a positive integer no greater than 1,000,000,000, and balances are bounded to ±9,000,000,000,000 safe-integer base units. Trusted identifiers use the existing canonical printable-ASCII format.

## Posting invariants

`receive`, `issue`, `adjust/increase`, `adjust/decrease`, and `transfer` have separate endpoints. Permission is checked before request handling and again transactionally. All reads precede writes; the header, lines, balances, audit, and idempotency marker commit together or not at all.

Item conversions are exact positive integers. Lot-controlled items require a validated active lot and matching date; non-lot-controlled items reject lot data. Expired stock cannot be received, issued, increased, or transferred. A decrease adjustment may remove expired stock. Negative balances are rejected unless the trusted item explicitly permits them. Duplicate request markers return the original transaction only after current authority is revalidated.

Expiry eligibility currently uses a documented UTC calendar boundary: a date remains usable through that date in UTC. A future trusted facility-time-zone field may replace this policy if regional operations require local-midnight semantics; the browser cannot choose the time zone.

Catalog, location, lot, and floor-stock records now have separate protected
server provisioning operations documented in
`inventory-provisioning-foundation.md`; no generic document-write API exists.
`firestore.indexes.json` declares the bounded directory and provisioning
invariant queries, plus the bounded transaction-type filter, and remains
undeployed.

The protected inventory page now supports bounded item, location, and transaction
type filters. It also runs reconciliation over a capped facility window, checking
deterministic balance identities, last-transaction references, transaction line
counts, parent identities, and contiguous line numbering. An overflow or data
parse failure is surfaced as unavailable rather than treated as a clean report.

## Deferred

Inventory-linked fulfillment of floor-stock requests, cabinet/shelf workflows,
crash carts, public QR expiry pages, controlled medicines, printing, bulk import,
deletion, replenishment, reservation, costing, advanced reporting, and deployment
remain out of scope.
