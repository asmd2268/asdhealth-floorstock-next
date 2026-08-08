# Operational readiness gate

This gate is a pre-production checklist. It does not connect to or deploy any
Firebase or application environment.

## Required controls

- Run `npm run format:check`, `npm run lint`, `npm run typecheck`, the full
  application suite, the Firestore emulator suite, and `npm run build`.
- Run `npm run preflight:production` and `npm run preflight:operations`.
- Configure a distributed rate-limit provider before production. The checked-in
  limiter is process-local and is suitable for development, emulator, and
  single-instance staging only; it must not be treated as a multi-instance
  production control.
- Export structured errors and audit events to the selected monitoring system,
  with alerts for repeated authorization failures, transaction failures,
  reconciliation anomalies, and elevated 429 responses.
- Verify daily Firestore backups, restore procedure, retention, and access
  ownership in staging before production approval.
- Record a rollback owner, rollback commit, database compatibility assessment,
  and a smoke-test result for every release.

## Release evidence

The release ticket must include the exact commit SHA, CI run, emulator result,
preflight output, backup verification, monitoring alert test, and explicit
approval for any Firebase rules/index/application deployment. No deployment is
implied by this repository gate.
