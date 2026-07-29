# Inventory provisioning foundation

This phase adds protected provisioning for the medication catalog, facility
locations, lots, and floor-stock threshold configurations. It does not add a
generic document editor, browser Firestore access, production credentials, or
deployment.

## Protected operations

- `PUT /api/inventory/catalog/items/{itemId}`
- `PUT /api/inventory/locations/{locationId}`
- `PUT /api/inventory/lots/{lotId}`
- `PUT /api/inventory/floor-stock-configurations/{configurationId}`

Every route requires the server-session origin, same-origin fetch metadata,
exact JSON content type, a bounded body with an exact content length, a
canonical request ID, and the operation-specific
`x-asdhealth-inventory-provisioning-action` header. Duplicate JSON keys and
malformed UTF-8 are rejected. Not-found details are normalized at the HTTP
boundary.

The browser submits only record identifiers and operation-specific descriptive
fields. Tenant, platform, organization, facility, actor, roles, overrides,
feature flags, authorization fingerprints, audit identifiers, and idempotency
namespaces are derived on the server.

## Authority and scope

The `inventory` feature flag must be enabled. Medication item and location
management use the existing `inventory_item:manage` and
`inventory_location:manage` permissions. Lots and floor-stock configuration
have separate `inventory_lot:manage` and
`floor_stock_configuration:manage` resources.

`master` and `pharmacy_manager` receive the four management permissions.
Catalog items are tenant-wide records, so item provisioning additionally
requires a qualifying organization- or platform-scoped assignment or override;
a facility-only manager cannot alter the tenant catalog. Locations, lots, and
threshold configurations are bound to the active facility.

The server resolves trusted session state before parsing the mutation and
re-reads the profile, assignments, and tenant directory inside the Firestore
transaction. It compares the complete trusted authorization fingerprint and
fails closed if account, tenant, feature, facility, role, scope, or override
state changed.

## Transactional invariants

All reads occur before writes. The target record, sanitized audit event, and
payload-bound idempotency marker commit together or roll back together.
Idempotency is isolated by actor, tenant, provisioning operation, and request
ID. Reusing a request ID with a different target or payload returns a conflict,
and current authority is revalidated before a replay is accepted.

- Item codes are unique within a tenant. Base unit, item code, and lot/expiry
  identity cannot change after inventory activity exists.
- Location ancestors are validated for scope, department compatibility, cycles,
  active-parent requirements, and the eight-level depth bound. Department,
  parent, and kind cannot change after activity.
- Lots require an active lot-controlled item, are unique by
  facility/item/lot-number, and lock item, lot number, and expiry after
  activity.
- Floor-stock configurations require an active matching department location
  and item, an exact supported unit, unique semantic identity, and integer
  `minimum <= reorder <= maximum` thresholds.

All records remain explicitly denied to browser Firestore reads and writes.

## Index and deployment status

The checked-in index file adds only the equality-query foundations required for
uniqueness and post-activity checks. Rules and indexes remain undeployed and
must be validated against the target Firebase project before any future
production deployment.

## Deferred

Bulk import, deletion, department membership, facility-local expiry time zones,
multi-party approval, rate limiting, monitoring, reconciliation, reservations,
costing, replenishment, floor-stock requests, cabinet/shelf workflows, crash
carts, controlled medicines, public QR pages, printing, and production
deployment remain separate phases.
