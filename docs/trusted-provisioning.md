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
- tenant_admin: UID, platform ID, tenant ID, allowed organization IDs, and allowed facility IDs.

Platform owners may create tenants and assign platform-scoped roles only within their platform. Tenant administrators may mutate only their tenant. Organization and facility restrictions are enforced for profiles, accounts, overrides, and roles. Administrators cannot modify their own profile, account status, or role assignments through this service.

Administrator records are not managed by the public API and browser clients cannot read or write them.

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

## Transactions and audit

Every mutation and its audit event are written in the same Firestore transaction. Failed validation, authorization, parent lookup, document creation, or audit creation commits nothing.

Audit records are created at:

    provisioningAuditEvents/{requestId}

The correlation ID is also the event ID, so reuse fails instead of overwriting an earlier event. Events contain the validated actor principal, action, target type and ID, tenant, timestamp, request ID, and bounded sanitized metadata. Passwords, tokens, credentials, private keys, cookies, authorization headers, nested objects, and raw provider errors are never accepted as audit metadata.

Browser reads and all browser writes to audit records are denied. Audit provisioning is append-only at both the service and rules boundaries.

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

- general administrator UI;
- administrator-principal provisioning and break-glass tooling;
- multi-party approval workflows;
- audit export, retention, and SIEM integration;
- production Firebase credentials, rules deployment, and application deployment;
- inventory, stock movement, and controlled-medicine workflows.
