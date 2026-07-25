# Server-verified session transport

This foundation protects App Router pages and APIs with an opaque server session. It is not deployed by this repository.

## Trust boundaries

Firebase Authentication proves identity only. The browser sends a freshly force-refreshed Firebase ID token to the operation-specific session endpoint. Firebase Admin verifies its signature, expiry, and revocation state and rejects disabled or missing Firebase users. Custom claims, email domains, UI state, browser storage, request parameters, and editable cookies are not authorization sources.

After identity verification, server-only repositories load and validate `userProfiles/{uid}`, `userRoleAssignments/{uid}/assignments/*`, and the profile-selected `tenantDirectories/{tenantId}`. The existing deterministic resolver enforces account status, tenant and facility relationships, scoped roles, explicit deny precedence, and complete feature flags. This resolution runs before session creation and again on every protected page or API request, so authorization and feature changes are not cached in the browser session.

The current application transport establishes a session only when the freshly resolved user can read the dashboard/shell at their active facility. The public-page redirect, protected `/app` page, and protected dashboard API each repeat that server-side permission check. Roles with no default access, including `external_pharmacy_supervisor`, cannot enter a redirect loop or receive an application session.

## Session record

`serverSessions/{sessionId}` is an Admin-only record:

```text
schemaVersion: 1
sessionId: 43-character random base64url identifier
uid: validated Firebase UID
credentialHash: domain-separated SHA-256 hash of a separate 256-bit random secret
firebaseAuthTimeSeconds: Firebase authentication time used for revocation checks
createdAtMilliseconds: integer
expiresAtMilliseconds: integer, eight hours after creation
revokedAtMilliseconds: integer | null
```

The cookie contains only `sessionId.secret`; it contains no profile, tenant, facility, role, permission, override, or feature flag. Only the secret hash is stored. Production uses the `__Host-asdhealth_session` name with `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, explicit `Max-Age` and `Expires`, and no `Domain`. Local HTTP development uses `asdhealth_session` without `Secure` because browsers reject secure cookies on local HTTP.

`sessionTokenExchanges/{domainSeparatedSha256(idToken)}` is created in the same Firestore transaction as the session. It stores only the resulting session ID and expiry, never the raw Firebase token. Session-secret and Firebase-token digests use different versioned domains, so equal inputs cannot be confused across record types. An existing fingerprint makes a concurrent or repeated exchange fail closed. These short-lived markers require an operational retention policy after their expiry.

The browser rules explicitly deny every read and write to `serverSessions` and `sessionTokenExchanges`. Rules remain undeployed.

## Request protections

- Session creation accepts a strict JSON body containing only a bounded Firebase ID token. The token must have been issued within five minutes and its hashed fingerprint may be consumed only once.
- Mutating session requests require the exact `SERVER_SESSION_ALLOWED_ORIGIN`, `Sec-Fetch-Site: same-origin`, and an operation-specific custom header that cross-origin forms cannot submit. The strict same-site cookie supplies an additional browser CSRF barrier.
- No endpoint accepts a redirect target, tenant, role, facility, permission, or feature flag from the client.
- Cookie headers are bounded, and missing cookies are distinguished from malformed, duplicate, oversized, or ambiguous session-cookie values. Invalid session cookies fail closed.
- Creating a replacement session uses new random credentials. Replay-marker creation, replacement-session creation, and revocation of a secret-verified prior session occur in one Firestore transaction. An attacker-controlled session ID without its matching secret cannot select a record for rotation.
- Sign-out validates the opaque session credential and revokes its server record without requiring the account to remain authorized. This allows disabled users to invalidate their own session. Cookie deletion repeats the production cookie's `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, no-`Domain`, and `__Host-` attributes.
- Cookie secrets use constant-time comparisons. Invalid inputs and provider failures return bounded normalized codes without tokens, records, stack traces, or provider details.
- Protected APIs declare a concrete resource and action and call the permission engine after fresh trusted resolution. Navigation is not an authorization source.

## Remaining operational responsibilities

The Admin credentials, exact allowed origin, production indexes, retention/deletion policy for expired session records, incident-response revocation tooling, monitoring, and rate limiting must be configured in the deployment environment. A stolen live bearer cookie can be used until it expires or is revoked; TLS, short expiry, `__Host-`, `HttpOnly`, strict same-site enforcement, and server revocation reduce but cannot eliminate that browser-session risk.
