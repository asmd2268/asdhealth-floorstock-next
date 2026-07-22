import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("Firebase Admin client boundary", () => {
  it("keeps Firebase Admin imports inside server-only modules", () => {
    const files = sourceFiles(join(process.cwd(), "src"));
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (file.includes(join("src", "server")) && !file.endsWith(".test.ts")) {
        expect(source).toContain('import "server-only"');
      }
      if (
        !file.endsWith(".test.ts") &&
        /from ["']firebase-admin|import ["']firebase-admin/.test(source)
      ) {
        expect(file).toContain(join("src", "server"));
        expect(source).toContain('import "server-only"');
      }
      if (/^["']use client["'];/m.test(source)) {
        expect(source).not.toMatch(/firebase-admin|@\/server\//);
      }
    }
  });
});
