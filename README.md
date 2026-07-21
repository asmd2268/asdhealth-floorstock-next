# ASDHealth Floor Stock

ASDHealth Floor Stock is a modular Next.js App Router rebuild for hospital floor stock operations. Phase 1 establishes the platform identity, tenant boundaries, internationalization, permissions, Firebase boundary, and responsive application shell. It does not connect to production services or implement inventory workflows.

The production application at `floorstock-one.vercel.app` is separate and remains untouched by this repository and phase.

## Architecture

- `src/app` contains the App Router entry points and global presentation styles.
- `src/components` contains the responsive application shell and presentational icons.
- `src/config` contains the default ASDHealth white-label configuration and local demo tenant.
- `src/domain/platform` contains typed platform, organization, facility, user-scope, subscription, feature-flag, and branding models.
- `src/domain/access` contains role/resource/action identifiers and the pure central permission engine.
- `src/i18n` contains the English and Arabic dictionaries, locale types, and direction mapping. UI components consume dictionary values rather than embedding user-facing strings.
- `src/navigation` declares permission metadata and canonical targets once, then resolves every navigation item through the permission engine.
- `src/services/contracts` defines framework-independent auth and Firestore boundaries without business collections.
- `src/services/firebase` validates public browser configuration with Zod and lazily initializes Firebase only when a browser caller requests it.

The checked-in demo represents one hospital. Its types and scope checks support platform-wide, organization/regional, and facility-specific access so additional hospitals can be introduced without changing the authorization model.

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

The role switcher is for development/demo use only. It is disabled by default and appears only when `NEXT_PUBLIC_ENABLE_DEMO_ROLE_SWITCHER=true`. It is not an authentication control; without that explicit flag, the shell role and scope come from its authenticated-user boundary.

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

Phase 1 does not initialize Firebase during page rendering, write data, define business collections, or connect to production.

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
