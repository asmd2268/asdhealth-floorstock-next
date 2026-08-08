import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const checks = [];
const failures = [];
function check(name, condition, detail) {
  checks.push({
    name,
    status: condition ? "pass" : "fail",
    ...(condition ? {} : { detail }),
  });
  if (!condition) failures.push({ name, detail });
}
check(
  "operations-runbook",
  existsSync(join(root, "docs/operational-readiness.md")),
  "Operations runbook is missing.",
);
check(
  "rate-limit-module",
  existsSync(join(root, "src/server/security/rate-limit.ts")),
  "Server rate-limit module is missing.",
);
const inventoryHttp = readFileSync(
  join(root, "src/server/inventory/http.ts"),
  "utf8",
);
const requestsHttp = readFileSync(
  join(root, "src/server/requests/http.ts"),
  "utf8",
);
check(
  "inventory-rate-limit",
  /INVENTORY_RATE_LIMITER/.test(inventoryHttp),
  "Inventory mutation boundary has no rate limiter.",
);
check(
  "request-rate-limit",
  /FLOOR_STOCK_REQUEST_RATE_LIMITER/.test(requestsHttp),
  "Request mutation boundary has no rate limiter.",
);
const result = {
  status: failures.length ? "fail" : "pass",
  checks,
  note: "Static operational readiness checks only; no deployment was performed.",
};
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
