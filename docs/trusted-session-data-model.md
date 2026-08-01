# Trusted session data model

This document describes the Firestore records consumed by the authentication session foundation. The included rules are a local foundation and are not deployed by this repository.

## Provisioning boundary

Authorization records must be provisioned by a trusted administrative system using privileged server credentials outside this browser application. Browser clients cannot create, update, or delete profiles, tenant membership, account status, role assignments, tenant directories, facility relationships, or feature flags. Firebase Authentication identity and custom claims are not provisioning sources and are not used for application authorization.

## Collections

Every trusted identifier uses the same canonical format: 1–128 printable ASCII characters, beginning with an alphanumeric character and continuing only with letters, digits, period, underscore, colon, at sign, plus, or hyphen. Leading/trailing whitespace, path separators, control characters, Unicode format characters, and non-ASCII lookalikes are rejected. The adapter applies this validation both to document paths and parsed record fields.

### `userProfiles/{uid}`

```text
uid: string                         // must equal the Firebase Auth lookup UID
tenantId: string
organizationId: string | null
facilityIds: string[]               // 1–100, unique
activeFacilityId: string | null
departmentIds: string[]             // 0–250, unique
activeDepartmentId: string | null   // included above and in active facility
accountStatus: active | disabled | pending | suspended
explicitPermissionOverrides: Array<{ // at most 100
  effect: allow | deny
  resource: canonical resource identifier
  action: read | create | edit | delete | approve
  scope: canonical platform, organization, or facility scope
}>
```

### `userRoleAssignments/{uid}/assignments/{assignmentId}`

```text
uid: string                         // must equal the UID in the collection path
tenantId: string                    // must equal the validated profile tenant
roleId: canonical role identifier
scope: canonical platform, organization, or facility scope
```

Every assignment document is validated independently. The one-time collection query constrains both `uid` and the already validated profile `tenantId`, matching the security-rule predicates rather than relying on rules as filters. An empty assignment collection denies the session. Unknown roles, mismatched UIDs or tenants, and scopes outside the validated tenant/facility relationships deny the session.

### `tenantDirectories/{tenantId}`

```text
tenantId: string                    // must equal the document ID
status: active | inactive
platformId: string
organizations: Array<{ id: string }> // 1–250
facilities: Array<{                  // 1–2,000
  id: string
  organizationId: string            // must reference an organization above
  displayName?: string               // 1–120 chars, trimmed, no Unicode category C
}>
departments: Array<{                 // 0–10,000
  id: string
  organizationId: string
  facilityId: string                // references a matching facility above
  displayName?: string              // 1–120 chars, trimmed, no Unicode category C
}>
featureFlags: {
  announcements: boolean
  zebra_labels: boolean
  new_request: boolean
  controlled_medicines: boolean
}
```

Organization, facility, and department identifiers must be unique. Every department must reference a facility whose organization matches. A profile department must be in that user's trusted organization and facility membership; its active department must be in the active facility. A session with an applicable `department_user` role and no active department is denied. Every feature flag is required; omitted, extra, or malformed flags reject the record. Inactive tenants deny session resolution.

At most 50 role assignments are accepted. The Firestore query is bounded to 51 records so the repository can detect overflow and fail closed. Including the profile and tenant directory singleton reads, one resolved session accepts at most 52 trusted records.

## Read model and rules

- A signed-in user may get only `userProfiles/{theirUid}`.
- A signed-in user with an active profile may read only assignments under `userRoleAssignments/{theirUid}` whose UID and tenant match that profile.
- A signed-in user may get only the active, self-consistent tenant directory named by their own active profile.
- Tenant directories cannot be listed.
- Browser clients cannot write any trusted authorization record, including their own.
- All unspecified reads and all browser writes are denied.

### `serverSessions/{sessionId}`

Opaque server sessions are a separate Admin-only transport record. They contain a Firebase UID, one canonical active-facility selector, random credential hash, bounded timestamps, and revocation state—but never tenant, role, permission, override, or feature-flag data. The active facility is non-authoritative and is revalidated against current trusted records on every request. Browser reads, lists, creates, updates, and deletes are all denied. See `docs/server-session-security.md` for the record, rotation, absolute-lifetime, and request-boundary details.

`sessionTokenExchanges/{domainSeparatedSha256(idToken)}` is an Admin-only, non-secret replay marker created atomically with a session. Browser access is denied. It contains the resulting session ID and expiry but never the source token or authorization data. Its digest domain differs from the opaque session-secret digest domain.

The rules do not grant access to server sessions, inventory, or other business collections. Deploying and testing these rules against a real Firebase project is intentionally deferred.

## Local rules emulator

Run the rules suite with:

    npm run test:rules

The command always starts the Firestore emulator with the fixed demo-asdhealth-floorstock-rules project ID. Firebase reserves the demo- prefix for emulator-only projects without live resources. Tests seed data only while rules are disabled inside the local test environment, then verify least-privilege reads, immutable authorization records, cross-tenant isolation, and default deny. The checked-in rules remain undeployed.
