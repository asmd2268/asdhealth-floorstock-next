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
- `src/services/auth` composes provider identity with trusted session resolution and coordinates auth-state changes without mixing authentication with authorization. Trusted production profile, role, and tenant repositories remain intentionally unconfigured and fail closed.
- `src/services/firebase` validates public browser configuration with Zod, lazily initializes one named browser app and Auth instance, and adapts Firebase identities and failures into application-owned types.

The checked-in demo represents one hospital. Its types and scope checks support platform-wide, organization/regional, and facility-specific assignments so additional hospitals and multiple roles per user can be introduced without changing the authorization model.

## Authentication and session security

Authentication state is a discriminated union: `loading`, `unauthenticated`, `authenticated`, or `error`. Errors carry typed access-denied or provider-failure reasons rather than generic exceptions.

The session resolver treats provider identity as proof of identity only. Tenant membership, organization and facility membership, role assignments, account status, explicit permission overrides, and the complete feature-flag set must come from trusted repository boundaries. It rejects disabled or incomplete profiles, unknown roles, mismatched tenants, invalid facility relationships, malformed permission overrides, invalid role scopes, and missing or incomplete tenant feature flags. It then selects a valid active facility and emits the canonical authenticated user and trusted feature flags used by the application shell.

Role assignments remain scoped and are evaluated centrally for each permission target. Explicit deny overrides explicit allow, and navigation visibility is only a presentation result of authorization—it is never an authorization source. Trusted authorization state is not stored in local storage.

The browser Firebase Authentication adapter supports current identity resolution, auth-state subscription, email/password sign-in, and sign-out. Firebase identity proves identity only: the application does not read custom claims or derive tenant, facility, role, permission, account status, or feature flags from the client SDK. Raw Firebase errors are normalized before reaching UI code, and credential failures use one generic message to avoid account enumeration.

Production starts in a loading state while Firebase resolves. Signed-out identity becomes unauthenticated; signed-in identity is passed to the trusted session boundary. Because the production profile and role repositories are intentionally unconfigured in this phase, a signed-in Firebase identity fails closed with access denied rather than receiving demo or inferred authorization.

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

Firebase validation rejects example placeholders and malformed project, domain, bucket, sender, and app identifiers. Browser initialization uses a named Firebase app and refuses to reuse it if its configuration differs.

Firebase Auth initializes only in the browser when the production authentication boundary subscribes or performs an operation. This phase does not initialize Firestore, write data, define business collections, or add Admin credentials. Future profile and role implementations must remain behind trusted service boundaries and resolve authorization data outside client-controlled state.

## Intentionally deferred

- Trusted production profile, role-assignment, tenant, and subscription repository adapters
- Server-verified session transport for protected APIs and routes
- Password reset, registration, multi-factor authentication, and account recovery
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
npm run format
npm run format:check
npm run build
```

`npm run test` starts Vitest in watch mode; `npm run test:run` performs a single CI-style run.

## Local-only legacy reference

`legacy/reference/` is ignored and is for local comparison only. It is not part of the new architecture and must never be committed.
