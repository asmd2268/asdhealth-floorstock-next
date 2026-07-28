import { describe, expect, it, vi } from "vitest";

import type { ServerSessionService } from "@/server/session/types";
import type { TrustedAdministratorPrincipalResolver } from "@/server/provisioning/principal-resolver";
import {
  resolveAdministrationContext,
  type AdministrationContextDependencies,
} from "./context";

const principal = {
  kind: "tenant_admin",
  scope: "unrestricted",
  uid: "admin-1",
  platformId: "platform-1",
  tenantId: "tenant-1",
} as const;
const trusted = {
  ok: true as const,
  value: {
    record: {
      schemaVersion: 2 as const,
      sessionId: "x",
      uid: "admin-1",
      activeFacilityId: "facility-1",
      credentialHash: "hash",
      firebaseAuthTimeSeconds: 1,
      createdAtMilliseconds: 1,
      expiresAtMilliseconds: 2,
      revokedAtMilliseconds: null,
    },
    trusted: {
      ok: true as const,
      user: {
        uid: "admin-1",
        email: null,
        displayName: null,
        tenantId: "tenant-1",
        platformId: "platform-1",
        organizationId: "org-1",
        facilityIds: ["facility-1"],
        activeFacilityId: "facility-1",
        activeScope: {
          kind: "facility" as const,
          platformId: "platform-1",
          organizationId: "org-1",
          facilityId: "facility-1",
        },
        roleAssignments: [],
        explicitPermissionOverrides: [],
        accountStatus: "active" as const,
      },
      featureFlags: {
        announcements: false,
        zebra_labels: false,
        new_request: false,
        controlled_medicines: false,
      },
    },
  },
};

function dependencies(
  sessionResult: unknown = trusted,
  principalResult: unknown = { ok: true, principal },
): AdministrationContextDependencies {
  const sessionService = {
    resolve: vi.fn().mockResolvedValue(sessionResult),
  } as unknown as ServerSessionService;
  const principalResolver = {
    resolveUid: vi.fn().mockResolvedValue(principalResult),
    resolve: vi.fn(),
  } as unknown as TrustedAdministratorPrincipalResolver;
  return {
    production: false,
    sessionService: () => sessionService,
    principalResolver: () => principalResolver,
  };
}

const cookie = `asdhealth_session=${"a".repeat(43)}.${"b".repeat(43)}`;

describe("administration context", () => {
  it("binds trusted administrator authority to the current server session", async () => {
    await expect(
      resolveAdministrationContext(cookie, dependencies()),
    ).resolves.toEqual({
      ok: true,
      value: {
        principal,
        tenantId: "tenant-1",
        platformId: "platform-1",
        sessionUid: "admin-1",
      },
    });
  });

  it("binds a platform owner to the server-session tenant instead of accepting tenant selection", async () => {
    const platformOwner = {
      kind: "platform_owner",
      uid: "admin-1",
      platformId: "platform-1",
    } as const;
    const result = await resolveAdministrationContext(
      `${cookie}; tenantId=tenant-attacker`,
      dependencies(trusted, { ok: true, principal: platformOwner }),
    );
    expect(result).toEqual({
      ok: true,
      value: {
        principal: platformOwner,
        tenantId: "tenant-1",
        platformId: "platform-1",
        sessionUid: "admin-1",
      },
    });
  });

  it("fails closed for absent, duplicate, malformed, or ambiguous cookies", async () => {
    for (const header of [
      null,
      "asdhealth_session=bad",
      `${cookie}; ${cookie}`,
      ` asdhealth_session =${"a".repeat(43)}.${"b".repeat(43)}`,
    ]) {
      await expect(
        resolveAdministrationContext(header, dependencies()),
      ).resolves.toEqual({ ok: false, code: "unauthenticated" });
    }
  });

  it("rejects missing principals and cross-tenant or cross-platform authority", async () => {
    await expect(
      resolveAdministrationContext(
        cookie,
        dependencies(trusted, { ok: false, code: "forbidden" }),
      ),
    ).resolves.toEqual({ ok: false, code: "forbidden" });
    await expect(
      resolveAdministrationContext(
        cookie,
        dependencies(trusted, {
          ok: true,
          principal: { ...principal, tenantId: "tenant-2" },
        }),
      ),
    ).resolves.toEqual({ ok: false, code: "forbidden" });
    await expect(
      resolveAdministrationContext(
        cookie,
        dependencies(trusted, {
          ok: true,
          principal: { ...principal, platformId: "platform-2" },
        }),
      ),
    ).resolves.toEqual({ ok: false, code: "forbidden" });
  });

  it("does not accept authority values from browser state or Firebase custom claims", async () => {
    const result = await resolveAdministrationContext(
      `${cookie}; tenantId=attacker; role=master`,
      dependencies(),
    );
    expect(result).toMatchObject({
      ok: true,
      value: { tenantId: "tenant-1", principal },
    });
  });
});
