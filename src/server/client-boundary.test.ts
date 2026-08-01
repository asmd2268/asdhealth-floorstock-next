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

  it("keeps server environment names, session internals, and secrets out of client modules", () => {
    const clientFiles = sourceFiles(join(process.cwd(), "src")).filter((file) =>
      /^['\"]use client['\"];/m.test(readFileSync(file, "utf8")),
    );
    for (const file of clientFiles) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(
        /FIREBASE_ADMIN_|SERVER_SESSION_ALLOWED_ORIGIN|PRIVATE_KEY|credentialHash|@\/server\//,
      );
    }
  });

  it("uses server repositories for production sessions and does not import browser authorization adapters", () => {
    const productionClient = readFileSync(
      join(process.cwd(), "src/services/auth/firebase-client.ts"),
      "utf8",
    );
    const serverComposition = readFileSync(
      join(process.cwd(), "src/server/session/composition.ts"),
      "utf8",
    );
    expect(productionClient).not.toContain("trusted-session-repositories");
    expect(productionClient).not.toContain(
      "createIdentitySessionResolutionService",
    );
    expect(serverComposition).toContain("getServerTrustedRepositoryAdapters");
    expect(serverComposition).toContain(
      "createIdentitySessionResolutionService",
    );
  });

  it("does not serialize trusted authorization inputs through the production shell", () => {
    const productionShell = readFileSync(
      join(process.cwd(), "src/components/server-authenticated-app.tsx"),
      "utf8",
    );
    expect(productionShell).not.toMatch(
      /AuthenticatedUser|FeatureFlagSet|roleAssignments|explicitPermissionOverrides|tenantId|organizationId|sessionId|credentialHash/,
    );
    expect(productionShell).toContain("readonly ShellNavigationItem[]");
    expect(productionShell).toContain("readonly FacilityDisplayOption[]");
    expect(productionShell).not.toMatch(
      /branding:\s*BrandingConfiguration|import type \{ BrandingConfiguration \}/,
    );
    const protectedPage = readFileSync(
      join(process.cwd(), "src/app/app/page.tsx"),
      "utf8",
    );
    expect(protectedPage).toContain(
      ".map(({ id, targetId, href }) => ({ id, targetId, href }))",
    );
    expect(protectedPage).not.toContain("branding={baseBrand}");
    expect(protectedPage).toContain("getServerSessionService().authorize");
    const publicPage = readFileSync(
      join(process.cwd(), "src/app/page.tsx"),
      "utf8",
    );
    expect(publicPage).toContain("getServerSessionService().authorize");
  });

  it("keeps facility switching operation-specific and server-authorized", () => {
    const route = readFileSync(
      join(process.cwd(), "src/app/api/auth/session/facility/route.ts"),
      "utf8",
    );
    expect(route).toContain("readUniqueSessionCookie");
    expect(route).toContain("handleSwitchFacilityRequest");
    expect(route).not.toMatch(/tenantId|roleAssignments|featureFlags|returnTo/);

    const clientSwitcher = readFileSync(
      join(process.cwd(), "src/components/facility-switcher.tsx"),
      "utf8",
    );
    expect(clientSwitcher).not.toMatch(
      /AuthenticatedUser|tenantId|organizationId|roleAssignments|explicitPermissionOverrides|featureFlags|sessionId|credentialHash/,
    );
    const demoShell = readFileSync(
      join(process.cwd(), "src/components/demo-app-shell.tsx"),
      "utf8",
    );
    expect(demoShell).not.toContain("FacilitySwitcher");
    expect(demoShell).not.toContain("switchFacility");
  });

  it("keeps the administration client presentational and free of trusted principals", () => {
    const clientFiles = sourceFiles(
      join(process.cwd(), "src/components/administration"),
    ).filter((file) =>
      /^['\"]use client['\"];/m.test(readFileSync(file, "utf8")),
    );
    for (const file of clientFiles) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(
        /AdministratorPrincipal|provisioningAdministrators|tenantId|sessionId|credentialHash|explicitPermissionOverrides|firebase-admin|@\/server\//,
      );
      expect(source).not.toMatch(
        /localStorage|sessionStorage|NEXT_PUBLIC_ENABLE_DEMO/,
      );
    }
    const adminRoutes = sourceFiles(
      join(process.cwd(), "src/app/api/admin"),
    ).map((file) => readFileSync(file, "utf8"));
    expect(adminRoutes).toHaveLength(7);
    for (const source of adminRoutes) {
      expect(source).toContain("handleAdministrationMutation");
      expect(source).toContain("getAdministrationProvisioningService");
      expect(source).toContain("admin.tenantId");
      expect(source).not.toContain("getTrustedProvisioningService");
      expect(source).not.toMatch(
        /authorizationHeader|customClaims|emailDomain/,
      );
    }
    const routeSchemas = readFileSync(
      join(process.cwd(), "src/server/administration/route-schemas.ts"),
      "utf8",
    );
    expect(routeSchemas).not.toMatch(/tenantId|platformId|actor|principal/);
    const featureRoute = readFileSync(
      join(process.cwd(), "src/app/api/admin/features/route.ts"),
      "utf8",
    );
    expect(featureRoute).toContain(
      "expectedFeatureFlags: body.expectedFeatureFlags",
    );
  });

  it("keeps inventory UI free of trusted scope and server modules", () => {
    const clientFiles = sourceFiles(
      join(process.cwd(), "src/components/inventory"),
    ).filter((file) =>
      /^['\"]use client['\"];/m.test(readFileSync(file, "utf8")),
    );
    for (const file of clientFiles) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(
        /tenantId|organizationId|facilityId|roleAssignments|featureFlags|explicitPermissionOverrides|trustedStateFingerprint|firebase-admin|@\/server\//,
      );
      expect(source).not.toMatch(/localStorage|sessionStorage|customClaims/);
    }
  });

  it("keeps the request client free of trusted authority inputs", () => {
    const clientFiles = sourceFiles(
      join(process.cwd(), "src/components/requests"),
    ).filter((file) =>
      /^['\"]use client['\"];/m.test(readFileSync(file, "utf8")),
    );
    for (const file of clientFiles) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(
        /actorUid|tenantId|organizationId|facilityId|activeDepartmentId|roleAssignments|featureFlags|explicitPermissionOverrides|trustedStateFingerprint|firebase-admin|@\/server\//,
      );
      expect(source).not.toMatch(
        /floorStockRequestKeys|floorStockRequestAuditEvents|localStorage|sessionStorage|customClaims/,
      );
    }
  });
});
