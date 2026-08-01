# Trusted administration console

The console is a server-protected operational surface over the existing trusted provisioning service. It does not grant browser access to Firestore and is not a generic data editor. This foundation is checked in but not deployed or connected to production Firebase.

## Trust boundary

The browser supplies only an opaque session cookie, operation-specific form values, and an idempotency correlation ID. The server re-resolves the Firebase identity and all trusted session records, then loads `provisioningAdministrators/{uid}` by that verified UID. The administrator principal must match the session platform; tenant administrators must also match the session tenant. The session tenant is the only tenant used by console queries and mutations.

Console mutations additionally re-read the complete administrator principal inside the Firestore transaction and compare it to the previously resolved principal. A removed, malformed, or changed scope therefore denies the transaction. Target profiles, tenant directories, facilities, assignments, and scope relationships are re-read in the same transaction before the mutation, audit event, and idempotency marker commit.

No application authorization is accepted from custom claims, email or domain, query strings, client props, browser storage, hidden controls, or navigation visibility. Production and demo shells remain separate, and demo code never selects the production console.

## Authority matrix

| Capability                                       | Platform owner                          | Unrestricted tenant admin                   | Restricted tenant admin                                                                              |
| ------------------------------------------------ | --------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| View tenant users/facilities/departments/audit   | Current session tenant on same platform | Own active tenant                           | Own active tenant, filtered to assigned organizations/facilities                                     |
| Activate/deactivate users                        | Same-platform current tenant; not self  | Own active tenant; not self/admin principal | In-scope users only; not self/admin principal                                                        |
| Edit membership                                  | Same-platform current tenant; not self  | Own active tenant; not self/admin principal | Existing and requested membership must remain entirely in assigned scope                             |
| Assign/revoke canonical roles                    | Same-platform current tenant; not self  | Own active tenant; not self/admin principal | Target profile and role scope must remain entirely in assigned scope                                 |
| Create/update facility                           | Existing platform-owner policy          | Own active tenant                           | Assigned organization; existing facility must also be assigned; creation never expands the principal |
| Create/update department                         | Existing platform-owner policy          | Own active tenant                           | Assigned organization and facility; creation never expands the principal                             |
| View/replace complete feature flags              | Allowed                                 | Allowed in own active tenant                | Denied                                                                                               |
| Create tenant or manage administrator principals | Not exposed                             | Not exposed                                 | Not exposed                                                                                          |

Tenant administrators cannot modify any user who has an administrator-principal record. Administrator-principal and break-glass management remain out of band.

## Pages and reads

The namespace contains `/app/admin`, `/app/admin/users`, `/app/admin/users/{uid}`, `/app/admin/facilities`, `/app/admin/features`, and `/app/admin/audit`. The layout and every page independently resolve the server session and administrator principal. Restricted feature navigation is omitted only as presentation; direct page access is still denied server-side.

User and audit reads use a page size of 25 and scan primary trusted records in batches of at most 51, with an absolute 103-record scan cap per page request. Restricted filtering therefore cannot trigger an unbounded query. User scans can add one administrator-principal lookup per primary record plus the single tenant directory. Only the last record actually returned to the caller may become a continuation cursor; filtered user or audit identifiers are never serialized. A fully filtered batch is followed within the same bounded scan instead of prematurely ending the listing. Role reads fail closed at the 51-record overflow sentinel, below the trusted assignment maximum. Every raw Admin-SDK document is validated before a minimal view model is rendered. Provider errors, tokens, sessions, credentials, principal records, request markers, and raw trusted records are never serialized.

Restricted audit views expose only facility events whose immutable facility target is assigned to the principal. Tenant-wide events and all department, user, account, profile, and role events are conservatively hidden because the current audit schema does not preserve an immutable historical target-scope snapshot; filtering those events by current membership would risk historical cross-scope disclosure. Unrestricted administrators and platform owners can view the tenant-bound event set. Audit metadata is validated and passed through the secret-removing sanitizer again before rendering. Audit is read-only and exposes no arbitrary query controls.

## Mutation boundary

Console endpoints are operation-specific:

- `PATCH /api/admin/users/{uid}/account-status`
- `PATCH /api/admin/users/{uid}/membership`
- `POST /api/admin/users/{uid}/roles`
- `DELETE /api/admin/users/{uid}/roles/{assignmentId}`
- `PUT /api/admin/facilities/{facilityId}`
- `PUT /api/admin/departments/{departmentId}`
- `PUT /api/admin/features`

They require the exact `SERVER_SESSION_ALLOWED_ORIGIN` matching the request URL origin, `Sec-Fetch-Site: same-origin`, the `x-asdhealth-admin-action: 1` anti-CSRF header, exact `application/json`, a canonical request ID, and an exact bounded content length. The separate trusted-provisioning origin remains exclusive to the external bearer-token provisioning API. Bodies are streamed to a 16 KiB limit, decoded as strict UTF-8, parsed with duplicate object keys rejected, and validated with strict schemas. Errors are normalized, contain no record-existence detail, and carry `Cache-Control: no-store`.

Role identifiers and scopes come from server-owned enumerations. Role assignment IDs are generated on the server. Duplicate semantic assignments are rejected. Membership edits preserve account status and explicit permission overrides transactionally, validate department parents, require the active department to belong to the active facility, and reject a move that would leave a preserved override or role assignment outside the new membership. A `department_user` role cannot be assigned until an in-scope department membership exists. Feature replacement carries the complete previously rendered flag set as a transactional optimistic-concurrency precondition, preventing a stale console page from overwriting a newer update. Deactivation is confirmed in the UI and takes effect on the next protected request because server sessions re-resolve the current profile; this phase does not enumerate and revoke all of that user's stored session documents.

## Firestore queries and indexes

No custom composite index is expected for the current equality-filter-plus-document-ID queries when Firestore's default automatic single-field indexes and index merging are enabled. Firestore automatically includes the final document-name ordering in an index. This assumption must still be validated against the target project's actual index exemptions before deployment; if Firestore reports a missing index, use its generated definition rather than guessing a production index here.

No index, rule, credential, or application deployment is performed by this work. Browser rules remain default-deny for principals, profiles, assignments, tenant directories, audit events, request markers, and server sessions.

## Client minimization and accessibility

Server components pass only the labels and safe records each control needs. No principal, tenant authority, session detail, permission override, or complete feature configuration is sent to unrelated pages. Forms have labels, keyboard-operable controls, live status announcements, immediate in-flight locking, destructive confirmation, and refresh only after a server-confirmed mutation. English and Arabic use the existing cookie-backed locale and correct LTR/RTL direction.

## Deferred

- administrator-principal and break-glass management;
- tenant creation in the console;
- explicit-permission-override editing;
- department/facility deletion and organization management;
- user identity-provider metadata and user creation;
- session enumeration/global revocation, rate limiting, multi-party approval, audit export/retention/SIEM integration;
- production indexes, rules, credentials, configuration, and deployment;
- inventory and controlled-medicine workflows.
