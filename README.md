# ASDHealth Floor Stock

ASDHealth Floor Stock is a modular Next.js App Router rebuild for hospital floor stock operations. The current foundation establishes platform identity, tenant boundaries, internationalization, permissions, authentication contracts, and a responsive application shell. It does not connect to production services or implement inventory workflows.

The production application at `floorstock-one.vercel.app` is separate and remains untouched by this repository and phase.

## Architecture

- `src/app` contains the App Router entry points and global presentation styles.
- `src/components` contains the responsive application shell and presentational icons.
- `src/config` contains the default ASDHealth white-label configuration and local demo tenant.
- `src/domain/platform` contains typed platform, organization, facility, user-scope, subscription, feature-flag, and branding models.
- `src/domain/access` contains role/resource/action identifiers and the pure central permission engine.
- `src/domain/auth` contains untrusted persistence records, the canonical authenticated-user model, typed authentication states and failures, and the pure deterministic session resolver.
- `src/i18n` contains the English and Arabic dictionaries, locale types, and direction mapping. UI components consume dictionary values rather than embedding user-facing strings.
- `src/navigation` declares permission metadata and canonical targets once, then resolves every navigation item through the permission engine.
- `src/services/contracts` defines framework-independent authentication-provider, user-profile, role-assignment, tenant-directory, session, sign-in, sign-out, and Firestore boundaries without business collections.
- `src/services/auth` exchanges browser identity for an opaque server session and coordinates auth-state changes without treating browser state as authorization.
- `src/services/firebase` validates public browser configuration with Zod, lazily initializes one named browser app plus singleton Auth and Firestore boundaries, adapts Firebase identities, and validates trusted session documents before returning application-owned types.
- `src/server/session` is physically server-only and verifies Firebase ID tokens, reads validated trusted records through Admin adapters, stores opaque revocable sessions, enforces CSRF/origin checks, and re-runs permission checks for protected operations.

The provisioning foundation separates pure administrator policy and transactional operations from server-only Firebase Admin initialization, trusted-principal resolution, Firestore adaptation, and HTTP composition. Its architecture is documented in docs/trusted-provisioning.md.

The checked-in demo represents one hospital. Its types and scope checks support platform-wide, organization/regional, and facility-specific assignments so additional hospitals and multiple roles per user can be introduced without changing the authorization model.

## Authentication and session security

Authentication state is a discriminated union: `loading`, `unauthenticated`, `authenticated`, or `error`. Errors carry typed access-denied or provider-failure reasons rather than generic exceptions.

The session resolver treats provider identity as proof of identity only. Tenant membership, organization and facility membership, role assignments, account status, explicit permission overrides, and the complete feature-flag set must come from trusted repository boundaries. It rejects disabled or incomplete profiles, unknown roles, mismatched tenants, invalid facility relationships, malformed permission overrides, invalid role scopes, and missing or incomplete tenant feature flags. It then selects a valid active facility and emits the canonical authenticated user and trusted feature flags used by the application shell.

Role assignments remain scoped and are evaluated centrally for each permission target. Explicit deny overrides explicit allow, and navigation visibility is only a presentation result of authorization—it is never an authorization source. Trusted authorization state is not stored in local storage.

The browser Firebase Authentication adapter supports current identity resolution, auth-state subscription, email/password sign-in, force-refreshed ID-token retrieval, and sign-out. Firebase identity proves identity only: the application does not read custom claims or derive tenant, facility, role, permission, account status, or feature flags from the client SDK. Raw Firebase errors are normalized before reaching UI code, and credential failures use one generic message to avoid account enumeration.

Production starts in a loading state while Firebase resolves. Signed-out identity becomes unauthenticated; a signed-in browser exchanges only a freshly issued Firebase ID token at `/api/auth/session`. Firebase Admin verifies that token and server-only repositories load the UID profile, its matching role assignments, and the profile-selected tenant directory. Authentication succeeds only after the existing domain resolver verifies account and tenant status, facility relationships, scoped roles, explicit overrides, and the complete feature-flag set. Missing, malformed, mismatched, inactive, revoked, expired, or unavailable data fails closed.

The browser receives an opaque `HttpOnly`, strict same-site session cookie, not trusted authorization state. In production it uses a `__Host-` cookie with `Secure`; local HTTP development uses a separate non-Secure cookie name. The cookie has an explicit eight-hour expiry and can be revoked. Duplicate, malformed, ambiguous, and oversized cookie headers fail closed. Every protected page and API request reloads trusted authorization records, so disabled accounts and role or feature changes take effect without waiting for cookie expiry. Production UI receives only sanitized branding and facility display context plus server-filtered navigation targets; roles, overrides, permission metadata, feature flags, and trusted records are not serialized to it. Protected APIs independently declare and re-check their required permission. Details and the threat model are in `docs/server-session-security.md`.

## Roles

The canonical role identifiers are:

- `master`
- `pharmacy_manager`
- `pharmacy_supervisor`
- `pharmacy_staff`
- `controlled_drugs_officer`
- `warehouse_manager`
- `department_user`
- `external_pharmacy_supervisor`

The role switcher is for local development/demo use only. Demo identity, demo feature flags, and the switcher require both a recognized non-production runtime and `NEXT_PUBLIC_ENABLE_DEMO_ROLE_SWITCHER=true`. Production always disables the demo path even if the public flag is accidentally enabled. Missing or malformed runtime and flag values fail closed. The same server-derived gate selects the demo session and demo-only shell; the production `AppShell` has no client prop that can enable role substitution.

Production and demo shell entry points are physically separate. The server-protected production page resolves navigation before serialization and sends the neutral shell only sanitized facility context and visible navigation declarations. `DemoAppShell` alone imports role identifiers, owns the selected demo role, and constructs substituted assignments before resolving its demo navigation. The presentational shell has no role-substitution or authorization logic, and the server loads the demo component only after the trusted demo gate succeeds.

## Permission model

Permission checks use the pure `resolvePermission`, `can`, and `canAccessFeature` functions. Every request includes a role, resource, action, subject scope, and target scope. The permission layer derives feature identity canonically from the resource, so callers cannot bypass feature gates by omitting feature metadata. Missing feature flags deny feature-backed resources.

Resolution precedence is:

1. Reject an out-of-scope tenant, organization, or facility target.
2. Reject a disabled feature.
3. Apply a matching explicit deny.
4. Apply a matching explicit allow.
5. Apply the role default.
6. Deny by default.

Announcements and Zebra labels default to the five confirmed pharmacy/master roles. New Request defaults only to `department_user`. Warehouse and department roles do not inherit pharmacy features, and `external_pharmacy_supervisor` has no navigation or feature access by default.

Controlled medicines currently has typed feature and resource identifiers only. No transfer statuses, stock movement behavior, or final workflow is defined in Phase 1.

## Internationalization and branding

English (`ltr`) and Arabic (`rtl`) are centralized in `src/i18n/dictionaries.ts`. The selected locale is restored from a same-site cookie during server rendering, so the initial document language and direction match without a hydration mismatch. The language switcher updates content, document language, direction, alignment, and Arabic typography together.

The white-label configuration is the source of truth for product name, client display name, safe logo URL, primary accent token, domain, ownership text, and enabled features. The base brand remains ASDHealth Floor Stock with the persistent ownership line “By Ali Abudahash.”

## Environment setup

Copy the example file for local development:

```bash
cp .env.example .env.local
```

Fill in the six `NEXT_PUBLIC_FIREBASE_*` values for a non-production Firebase web app when Firebase initialization is needed. These values are validated at the browser service boundary. Do not place service-account credentials, admin keys, or other secrets in `NEXT_PUBLIC_*` variables.

Server-session routes additionally require `SERVER_SESSION_ALLOWED_ORIGIN` to be the exact browser origin. HTTPS is mandatory outside `localhost` and `127.0.0.1`; missing, placeholder, path-bearing, or malformed values fail closed. Firebase Admin values remain server-only.

Firebase validation rejects example placeholders and malformed project, domain, bucket, sender, and app identifiers. Browser initialization uses a named Firebase app and refuses to reuse it if its configuration differs.

Firebase Auth and the trusted one-time Firestore reader initialize only in the browser when the production authentication boundary needs them. The reader is limited to the explicit trusted-session paths documented in `docs/trusted-session-data-model.md`; no business collection adapter or listener is added. `firestore.rules` denies all client writes to authorization records, restricts reads to the caller’s own active identity and tenant, and defaults all unspecified access to deny. These rules are a checked-in foundation and are not deployed by this work. No Admin credentials are included.

Trusted identifiers use a canonical printable-ASCII format that rejects whitespace, control/format characters, Unicode lookalikes, and path separators. Validation is bounded to 100 facility memberships, 100 explicit overrides, 250 organizations, 2,000 facilities, and 50 role assignments. Assignment queries fetch at most one overflow sentinel, and both the adapter and domain resolver independently verify UID and tenant boundaries.

Trusted administrative provisioning is exposed only through operation-specific server routes. Firebase bearer identity supplies a UID, while a separately provisioned and validated administrator record supplies platform-owner or explicitly restricted/unrestricted tenant-admin authority. Tenant administrators require an active matching trusted directory at principal resolution and again in every service transaction. Restricted administrators cannot replace tenant-wide feature flags, and facility creation never silently broadens their assigned facility set.

Every trusted-data mutation, server-ID append-only audit event, and actor-plus-tenant-scoped idempotency marker share one Firestore transaction. The validated client request ID is retained only as correlation data and cannot choose the global audit path or block another actor or tenant. Audit metadata is deterministic and bounded, rejects nested data, and removes secret-bearing keys or values. Browser clients cannot access provisioning principals, audits, or request markers. The checked-in rules and provisioning foundation remain undeployed.

## Intentionally deferred

- General administration UI and administrator-principal provisioning tooling
- Firestore rules deployment and integration validation against a real project configuration
- Password reset, registration, multi-factor authentication, and account recovery
- Production session retention cleanup, global session-management UI, rate limiting, and monitoring
- Facility selection and switching UI
- Production Firebase configuration or deployment
- Stock, controlled-medicine, and business collection workflows

## Local commands

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm run test
npm run test:run
npm run test:rules
npm run format
npm run format:check
npm run build
```

`npm run test` starts Vitest in watch mode; `npm run test:run` performs a single CI-style run.

The dedicated rules command starts only the local Firestore emulator for the fixed demo-asdhealth-floorstock-rules project. It never addresses a production Firebase project, and the checked-in rules remain undeployed.

## Local-only legacy reference

`legacy/reference/` is ignored and is for local comparison only. It is not part of the new architecture and must never be committed.
