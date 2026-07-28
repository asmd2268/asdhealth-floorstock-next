# Trusted provisioning foundation

This foundation provides narrowly scoped server-side mutations for trusted authorization data. It is not an end-user administration interface, is not deployed, and does not connect this repository to production Firebase.

## Server boundary

Firebase Admin imports exist only under src/server. Those modules carry the server-only marker, initialize one named Admin app lazily, and use server environment variables that are separate from the browser Firebase configuration. Missing, placeholder, or malformed server configuration fails closed when a provisioning request reaches the boundary.

A route request must have:

- the configured exact Origin header;
- a non-cross-site fetch context;
- JSON content no larger than 32 KiB;
- a canonical X-Request-ID correlation identifier; and
- a Firebase bearer ID token verified by Firebase Admin.

The bearer identity proves UID only. Email, domain, custom claims, query strings, browser storage, and request bodies provide no administrative authority.

## Administrator principal

Administrative authority is provisioned out of band in:

    provisioningAdministrators/{uid}

The document UID must match the verified Firebase UID and must validate as one of:

- platform_owner: UID and platform ID;
- unrestricted tenant_admin: UID, platform ID, tenant ID, and explicit unrestricted scope; or
- restricted tenant_admin: UID, platform ID, tenant ID, and explicit allowed organization and facility IDs.

Tenant administrators are usable only while their trusted tenant directory exists, validates, is active, and matches their platform and tenant. This is enforced during principal resolution and again inside each service transaction; failures return only `forbidden`. Platform owners retain the action matrix's platform-level authority, including administration of inactive tenants, and remain platform-bound.

Restricted tenant administrators may administer only users, roles, overrides, and existing facilities inside both their assigned organization and facility sets. They may create a facility inside an assigned organization, but creation does not mutate their principal or automatically add the new facility to their manageable facility set. Tenant-wide feature-flag replacement requires an unrestricted tenant administrator or platform owner. Unrestricted tenant administrators remain limited to their own active tenant and platform. Administrators cannot modify their own profile, account status, or role assignments through this service.

Administrator records are not managed by the public API and browser clients cannot read or write them.

The server-session-backed console uses the same service with transactional principal revalidation enabled. The transaction re-reads `provisioningAdministrators/{actorUid}` and requires it to match the just-resolved principal, so stale removal or scope changes fail before any target or audit write. Tenant administrators are also forbidden from changing profiles, account status, membership, or roles for any user who has an administrator-principal record. See `trusted-administration-console.md`.

### Authorization matrix

| Action                       | Platform owner                                   | Unrestricted tenant admin | Restricted tenant admin                                    |
| ---------------------------- | ------------------------------------------------ | ------------------------- | ---------------------------------------------------------- |
| Create tenant                | Same platform                                    | Denied                    | Denied                                                     |
| Add/update facility          | Same platform                                    | Own active tenant         | Own active tenant and assigned organization/facility rules |
| Create/update profile        | Same platform                                    | Own active tenant         | Own active tenant and assigned organization/facility rules |
| Activate/deactivate account  | Same platform                                    | Own active tenant         | Own active tenant and assigned organization/facility rules |
| Assign/revoke role           | Same platform; assignment requires active tenant | Own active tenant         | Own active tenant and assigned organization/facility rules |
| Replace tenant feature flags | Same platform                                    | Own active tenant         | Denied                                                     |

Platform-owner maintenance access to inactive tenants remains intentional, but new role assignment is denied until the tenant is active; tenant creation always creates a new active tenant. Tenant administrators are denied for every operation unless their directory is active.

## Operations and routes

Each route exposes one typed operation rather than a generic document writer:

- POST /api/trusted-provisioning/tenants
- PUT /api/trusted-provisioning/tenants/{tenantId}/facilities/{facilityId}
- PUT /api/trusted-provisioning/users/{uid}/profile
- PATCH /api/trusted-provisioning/users/{uid}/account-status
- PUT /api/trusted-provisioning/users/{uid}/roles/{assignmentId}
- DELETE /api/trusted-provisioning/users/{uid}/roles/{assignmentId}
- PUT /api/trusted-provisioning/tenants/{tenantId}/feature-flags

All path parameters, bodies, trusted records, roles, scopes, statuses, and features are validated before writes. Existing canonical identifier rules and trusted-session collection limits apply. Parent tenant, organization, facility, and profile records must already exist where required. Identity and tenant fields are immutable.

The console adds a transactional membership operation which changes only organization IDs, facility IDs, and the active facility while preserving account status and explicit permission overrides. Semantic duplicate role assignments are rejected even when a caller proposes a different assignment document ID.

## Transactions and audit

Every mutation and its audit event are written in the same Firestore transaction. Failed validation, authorization, parent lookup, document creation, or audit creation commits nothing.

Audit records are created at:

    provisioningAuditEvents/{serverGeneratedEventId}

The validated client correlation ID remains an audit field but never controls the audit document path. A separate request marker uses a collision-resistant hash of trusted actor UID, target tenant, and correlation ID. Reuse by that same actor and tenant returns a conflict; another actor or tenant cannot reserve the namespace. The mutation, generated audit event, and request marker commit in one transaction, so audit or marker failure rolls back every write.

Audit metadata accepts only top-level string, finite number, boolean, or null values. It stores at most 20 fields, 64 characters per key, and 128 characters per string after inspecting up to 4,096 characters for forbidden content; keys are sorted deterministically. Sensitive key names and secret-bearing free text—including bearer authorization, private-key blocks, cookies, session/access/refresh tokens, passwords, and credentials—are omitted. Nested values, Error objects, provider errors, and stack structures are never recorded. Each operation supplies its own small structured metadata object rather than accepting audit metadata from the request body.

Browser reads and all browser writes to audit records and request markers are denied. Audit provisioning is append-only at both the service and rules boundaries.

## Server environment

The following runtime variables are required only when a provisioning request is handled:

    FIREBASE_ADMIN_PROJECT_ID
    FIREBASE_ADMIN_CLIENT_EMAIL
    FIREBASE_ADMIN_PRIVATE_KEY
    TRUSTED_PROVISIONING_ALLOWED_ORIGIN

Real values belong in the deployment secret manager or untracked local environment, never in source control or NEXT_PUBLIC variables.

## Deployment prerequisites

Before production use:

1. provision a least-privilege Firebase service account through the deployment secret manager;
2. provision the initial platform-owner record through a separately controlled break-glass process;
3. review and deploy Firestore rules through an approved release process;
4. configure the exact trusted administration origin;
5. validate indexes, retention, monitoring, audit export, and incident procedures;
6. add rate limiting and operational approval controls at the hosting edge.

The checked-in rules and adapters remain undeployed.

## Intentionally deferred

- administrator-principal provisioning and break-glass tooling;
- multi-party approval workflows;
- audit export, retention, and SIEM integration;
- production Firebase credentials, rules deployment, and application deployment;
- inventory, stock movement, and controlled-medicine workflows.
