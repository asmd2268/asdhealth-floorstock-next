import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const failures = [];
const checks = [];

function pass(name) {
  checks.push({ name, status: "pass" });
}

function requireCheck(condition, name, detail) {
  if (!condition) failures.push({ name, detail });
  else pass(name);
}

const rulesPath = join(root, "firestore.rules");
const indexesPath = join(root, "firestore.indexes.json");
requireCheck(
  existsSync(rulesPath),
  "rules-file",
  "firestore.rules is missing.",
);
requireCheck(
  existsSync(indexesPath),
  "indexes-file",
  "firestore.indexes.json is missing.",
);

const rules = readFileSync(rulesPath, "utf8");
const indexes = JSON.parse(readFileSync(indexesPath, "utf8"));
const requiredCollections = [
  "inventoryItems",
  "inventoryLocations",
  "inventoryLots",
  "floorStockConfigurations",
  "inventoryBalances",
  "inventoryTransactions",
  "inventoryRequestKeys",
  "inventoryAuditEvents",
  "floorStockRequests",
  "floorStockRequestKeys",
  "floorStockRequestAuditEvents",
];
for (const collection of requiredCollections) {
  const pattern = new RegExp(
    `match \\/${collection}\\/\\{[^}]+\\}[^\\n]*\\{[^}]*allow (?:read, write|read|write): if false`,
    "s",
  );
  requireCheck(
    pattern.test(rules),
    `rules-deny-${collection}`,
    `No explicit browser deny rule was found for ${collection}.`,
  );
}
requireCheck(
  /match \/\{document=\*\*\}[^]*allow read, write: if false/u.test(rules),
  "rules-default-deny",
  "The Firestore wildcard fallback must deny reads and writes.",
);

const indexRows = Array.isArray(indexes.indexes) ? indexes.indexes : [];
function hasIndex(collectionGroup, fields) {
  return indexRows.some((index) => {
    if (index.collectionGroup !== collectionGroup) return false;
    const actual = (index.fields ?? []).map((field) => field.fieldPath);
    return fields.every((field) => actual.includes(field));
  });
}
requireCheck(
  hasIndex("inventoryBalances", ["tenantId", "facilityId", "locationId"]),
  "index-balances-location",
  "The bounded location-filter balance index is missing.",
);
requireCheck(
  hasIndex("inventoryBalances", ["tenantId", "facilityId", "itemId"]),
  "index-balances-item",
  "The bounded item-filter balance index is missing.",
);
requireCheck(
  hasIndex("inventoryTransactions", ["tenantId", "facilityId", "type"]),
  "index-transactions-type",
  "The bounded transaction-type index is missing.",
);

const trackedFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);
const credentialFile = trackedFiles.find((file) =>
  /(service-account|firebase-adminsdk|private-key|credentials?\.json)/iu.test(
    file,
  ),
);
requireCheck(
  !credentialFile,
  "no-tracked-credentials",
  credentialFile
    ? `Tracked credential-like file: ${credentialFile}`
    : "No credential-like file is tracked.",
);

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.(tsx?|jsx?)$/u.test(entry.name) ? [path] : [];
  });
}
const clientFiles = walk(join(root, "src")).filter((file) =>
  /^\s*["']use client["']/mu.test(readFileSync(file, "utf8")),
);
for (const file of clientFiles) {
  const source = readFileSync(file, "utf8");
  const relativePath = relative(root, file);
  requireCheck(
    !/(?:firebase-admin|server-only|@\/server\/)/u.test(source),
    `client-boundary-${relativePath}`,
    "A client module imports server-only code.",
  );
}

if (failures.length) {
  console.error(JSON.stringify({ status: "fail", checks, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(
      {
        status: "pass",
        checks,
        note: "Static readiness checks passed; no Firebase deployment was performed.",
      },
      null,
      2,
    ),
  );
}
