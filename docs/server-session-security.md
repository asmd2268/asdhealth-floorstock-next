# Server-verified session transport

This foundation protects App Router pages and APIs with an opaque server session. It is not deployed by this repository.

## Trust boundaries

Firebase Authentication proves identity only. The browser sends a freshly force-refreshed Firebase ID token to the operation-specific session endpoint. Firebase Admin verifies its signature, expiry, and revocation state and rejects disabled or missing Firebase users. Custom claims, email domains, UI state, browser storage, request parameters, and editable cookies are not authorization sources.

After identity verification, server-only repositories load and validate `userProfiles/{uid}`, `userRoleAssignments/{uid}/assignments/*`, and the profile-selected `tenantDirectories/{tenantId}`. The existing deterministic resolver enforces account status, tenant and facility relationships, scoped roles, explicit deny precedence, and complete feature flags. This resolution runs before session creation and again on every protected page or API request, so authorization and feature changes are not cached in the browser session.

The current application transport establishes a session only when the freshly resolved user can read the dashboard/shell at their active facility. The public-page redirect, protected `/app` page, and protected dashboard API each repeat that server-side permission check. Roles with no default access, including `external_pharmacy_supervisor`, cannot enter a redirect loop or receive an application session.

## Session record

`serverSessions/{sessionId}` is an Admin-only record:

```text
schemaVersion: 2
sessionId: 43-character random base64url identifier
uid: validated Firebase UID
activeFacilityId: canonical requested context, revalidated on every use
credentialHash: domain-separated SHA-256 hash of a separate 256-bit random secret
firebaseAuthTimeSeconds: Firebase authentication time used for revocation checks
createdAtMilliseconds: integer
expiresAtMilliseconds: integer, eight hours after creation
revokedAtMilliseconds: integer | null
```

The cookie contains only `sessionId.secret`; it contains no profile, tenant, facility, role, permission, override, or feature flag. Only the secret hash is stored. The Admin-only record's active-facility ID is non-authoritative context and is revalidated against current trusted records on every use. Production uses the `__Host-asdhealth_session` name with `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, explicit `Max-Age` and `Expires`, and no `Domain`. Local HTTP development uses `asdhealth_session` without `Secure` because browsers reject secure cookies on local HTTP.

Schema-version 1 records have no active-facility context and are treated as an unauthenticated session miss. They are never upgraded or assigned a fallback facility. Unknown or malformed records fail validation.

`sessionTokenExchanges/{domainSeparatedSha256(idToken)}` is created in the same Firestore transaction as the session. It stores only the resulting session ID and expiry, never the raw Firebase token. Session-secret and Firebase-token digests use different versioned domains, so equal inputs cannot be confused across record types. An existing fingerprint makes a concurrent or repeated exchange fail closed. These short-lived markers require an operational retention policy after their expiry.

The browser rules explicitly deny every read and write to `serverSessions` and `sessionTokenExchanges`. Rules remain undeployed.

## Request protections

- Session creation accepts a strict JSON body containing only a bounded Firebase ID token. The token must have been issued within five minutes and its hashed fingerprint may be consumed only once.
- Mutating session requests require the exact `SERVER_SESSION_ALLOWED_ORIGIN`, `Sec-Fetch-Site: same-origin`, and an operation-specific custom header that cross-origin forms cannot submit. The strict same-site cookie supplies an additional browser CSRF barrier.
- No endpoint accepts a redirect target, tenant, role, permission, or feature flag from the client. The facility-switch endpoint accepts a facility ID only as an untrusted requested target and independently validates it.
- Cookie headers are bounded, and missing cookies are distinguished from malformed, duplicate, oversized, or ambiguous session-cookie values. Invalid session cookies fail closed.
- Creating a replacement session uses new random credentials. Replay-marker creation, replacement-session creation, and revocation of a secret-verified prior session occur in one Firestore transaction. An attacker-controlled session ID without its matching secret cannot select a record for rotation.
- Sign-out validates the opaque session credential and revokes its server record without requiring the account to remain authorized. This allows disabled users to invalidate their own session. Cookie deletion repeats the production cookie's `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, no-`Domain`, and `__Host-` attributes.
- Cookie secrets use constant-time comparisons. Invalid inputs and provider failures return bounded normalized codes without tokens, records, stack traces, or provider details.
- Protected APIs declare a concrete resource and action and call the permission engine after fresh trusted resolution. Navigation is not an authorization source.

## Active facility selection and switching

Initial session creation uses the trusted profile's `activeFacilityId` when present. If the trusted profile intentionally has no default, the resolver sorts its already validated canonical facility memberships by ID and selects the first. Browser ordering, display labels, query strings, and browser storage never participate. A malformed or out-of-membership trusted default fails closed rather than silently broadening access.

`POST /api/auth/session/facility` accepts only a bounded canonical facility ID. The value is a requested target, not authorization. The endpoint proves possession of the current opaque secret and applies the same exact-Origin, request-origin, Fetch Metadata, custom-header, duplicate-key-rejecting JSON, and streaming body-size protections as other session mutations. The route checks the mutation preflight before it can clear an invalid cookie and repeats it inside the handler. It additionally requires an exact bounded `Content-Length`. The service reloads current Firebase identity plus profile, assignments, tenant directory, account and tenant status, facility membership and parent organization, overrides, and feature flags. The requested facility must also have current dashboard/shell permission at its facility scope.

A successful switch generates a new random session ID and secret before entering the retryable Firestore transaction. The Admin transaction verifies the previous UID and secret hash, then re-reads the UID profile, matching bounded assignment query, and selected tenant directory. It validates those records through the same resolver and dashboard permission engine and compares a domain-separated fingerprint of the complete authorization result seen before the transaction. A status, membership, scope, role, override, feature flag, or tenant/facility relationship change therefore retries or aborts the rotation before any write. The transaction creates the replacement and revokes the old session atomically. It does not create a Firebase-token replay marker because no identity token is exchanged. Concurrent switches from the same credential permit at most one winner. A failed transaction leaves the old session usable and creates no partial replacement.

Random credentials and the rotation timestamp are created outside the Firestore transaction callback. Firestore retries reuse that same candidate, and `create` targets the same new document ID, so the credential returned by the service always matches the committed record and a retry cannot create abandoned live sessions. Every callback attempt also compares a fresh server clock to the predecessor's absolute expiry immediately before writes, preventing a near-expiry retry from committing after the deadline. The trusted assignment query may require a production composite index for `uid` plus `tenantId`; no index is deployed by this repository.

Facility switching preserves the previous record's absolute `expiresAtMilliseconds`. Repeated switches therefore cannot extend the original eight-hour session lifetime. The replacement cookie uses the remaining lifetime rather than resetting `Max-Age`. If the selected facility is later removed, moved, malformed, deleted, or made cross-tenant, the next protected request fails closed; it does not fall back to another facility.

The production page separately reloads the validated tenant directory and sends the client only canonical facility IDs plus bounded safe display labels, falling back to the canonical ID when no optional label is provisioned. These values drive presentation only. The switch endpoint independently repeats authorization, and server-rendered navigation is recomputed after confirmed rotation. Demo switching remains physically separate and cannot invoke the production facility transport.

The browser locks the switch control before dispatch and uses a small keepalive request. It never aborts a rotation merely because a UI timer elapsed: aborting after the server committed could discard the replacement cookie and strand the browser with the revoked predecessor. A delayed request is announced as unconfirmed and remains locked until a definitive response or page refresh. The client never applies an optimistic active-facility change.

Rotation revokes the predecessor immediately. Requests that already resolved it may complete, while parallel requests that reach session resolution after the commit receive the normal unauthenticated result. This is the documented one-winner behavior; it does not select a fallback facility or weaken authorization.

## Remaining operational responsibilities

The Admin credentials, exact allowed origin, production indexes, retention/deletion policy for expired session records, incident-response revocation tooling, monitoring, and rate limiting must be configured in the deployment environment. The facility endpoint requires an exact `Content-Length`; deployment infrastructure must preserve a canonical value and reject HTTP framing ambiguity before Next.js. The Fetch `Headers` boundary normalizes optional outer whitespace, so the application cannot distinguish it from a canonical decimal value; signs, leading zeroes, decimals, exponents, combined values, overflow, and byte mismatches are rejected.

Firestore trusted records are transactionally fresh at rotation commit. Firebase Authentication account state is verified immediately before that transaction but cannot participate atomically in a Firestore transaction; disabling the Firebase account in that narrow interval remains a provider-level race. The replacement is still only an inert server-session selector, never a business-data write, and every subsequent use re-verifies Firebase identity and all trusted authorization. A stolen live bearer cookie can be used until it expires or is revoked; TLS, short expiry, `__Host-`, `HttpOnly`, strict same-site enforcement, and server revocation reduce but cannot eliminate that browser-session risk.
