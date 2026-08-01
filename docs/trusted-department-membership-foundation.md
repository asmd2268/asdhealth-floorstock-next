# Trusted department membership foundation

This phase introduces a trusted department identity and membership boundary. It is the prerequisite for department-owned floor-stock requests; it does not implement that workflow and does not deploy the application, Firestore rules, or indexes.

## Data model

Departments are bounded records in the tenant directory. Each has a canonical immutable ID, organization ID, facility ID, and optional safe display name. The facility must exist and its organization must match. A department ID cannot be moved to another organization or facility after creation.

User profiles carry a bounded unique department membership list and an optional active department. Every member department must belong to the user's trusted organization and facility membership. The active department must be included in the list and belong to the active facility. Existing profiles and directories remain readable through empty defaults.

The authenticated user contains only the validated membership and resolved active department. When the active facility changes, the resolver keeps the trusted preferred department only if it belongs to that facility; otherwise it selects the first canonical member department in the selected facility. An applicable `department_user` assignment without an active department denies the session rather than widening access to the facility.

## Provisioning and administration

The external trusted provisioning API adds:

    PUT /api/trusted-provisioning/tenants/{tenantId}/departments/{departmentId}

The server-session administration console adds:

    PUT /api/admin/departments/{departmentId}

Both reuse the existing exact-origin, CSRF/fetch-metadata, strict JSON, body-size, trusted-principal, transaction, audit, and idempotency protections. The administration directory filters departments through both the administrator's organization and facility scope. Membership changes update facility and department selection atomically while preserving status and explicit permission overrides. Assigning `department_user` requires an existing department membership in the role scope.

The administration UI lists and provisions departments and edits department membership plus the active department. Client bodies never supply tenant, platform, actor, roles, overrides, or authorization fingerprints.

## Session behavior

Every protected request reloads the profile, role assignments, and tenant directory, so department removal, relocation corruption, active-department changes, or role changes take effect immediately. Facility-session rotation fingerprints include the complete sorted department membership and active department. A concurrent department authority change therefore aborts rotation before any session write.

No new Firestore collection or index is introduced. Existing browser rules remain unchanged: browser writes to trusted authorization records are denied, while the existing self/tenant bootstrap reads remain subject to their current restrictions. Department membership is never accepted from browser state or Firebase custom claims.

## Deferred

- floor-stock request records, lifecycle, approval, fulfillment, and cancellation;
- department-scoped request queues and reporting;
- department deletion, merge, and historical reassignment;
- production credentials, rule/index deployment, application deployment, monitoring, and rate limiting.
