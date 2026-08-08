# Production readiness gate

This repository now has a local, non-deploying preflight gate:

```text
npm run preflight:production
```

The gate checks that:

- `firestore.rules` and `firestore.indexes.json` exist and are parseable;
- every server-mediated inventory and floor-stock collection has an explicit
  browser-deny rule plus the wildcard default deny;
- bounded inventory location, item, and transaction-type queries have their
  checked-in composite indexes;
- no credential-like service-account or private-key file is tracked;
- client modules do not import Firebase Admin, `server-only`, or server modules.

The gate is static and intentionally does not connect to a production Firebase
project, deploy rules, deploy indexes, deploy hosting, or inspect production
secrets. It is a repository invariant check and must be paired with environment
configuration review, edge rate limiting, monitoring, retention policy, backup
and restore testing, and an explicit deployment approval.

On 2026-08-08 the gate passed. The local application suite passed 588 tests,
the Firestore emulator suite passed 18 rules tests, and the production build
completed successfully. The first emulator attempt encountered a transient
local port collision; the isolated rerun passed after the port was released.
