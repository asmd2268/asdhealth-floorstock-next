# Trusted session data model

This document describes the Firestore records consumed by the authentication session foundation. The included rules are a local foundation and are not deployed by this repository.

## Provisioning boundary

Authorization records must be provisioned by a trusted administrative system using privileged server credentials outside this browser application. Browser clients cannot create, update, or delete profiles, tenant membership, account status, role assignments, tenant directories, facility relationships, or feature flags. Firebase Authentication identity and custom claims are not provisioning sources and are not used for application authorization.

## Collections

### `userProfiles/{uid}`

```text
uid: string                         // must equal the Firebase Auth lookup UID
tenantId: string
organizationId: string | null
facilityIds: string[]               // non-empty and unique
activeFacilityId: string | null
accountStatus: active | disabled | pending | suspended
explicitPermissionOverrides: Array<{
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
organizations: Array<{ id: string }>
facilities: Array<{
  id: string
  organizationId: string            // must reference an organization above
}>
featureFlags: {
  announcements: boolean
  zebra_labels: boolean
  new_request: boolean
  controlled_medicines: boolean
}
```

Organization and facility identifiers must be unique. Every feature flag is required; omitted, extra, or malformed flags reject the record. Inactive tenants deny session resolution.

## Read model and rules

- A signed-in user may get only `userProfiles/{theirUid}`.
- A signed-in user with an active profile may read only assignments under `userRoleAssignments/{theirUid}` whose UID and tenant match that profile.
- A signed-in user may get only the active, self-consistent tenant directory named by their own active profile.
- Tenant directories cannot be listed.
- Browser clients cannot write any trusted authorization record, including their own.
- All unspecified reads and all browser writes are denied.

The rules do not grant access to inventory or other business collections. Deploying and testing these rules against a real Firebase project is intentionally deferred.
