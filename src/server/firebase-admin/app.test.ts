import type { App, AppOptions } from "firebase-admin/app";
import { describe, expect, it, vi } from "vitest";

import type { FirebaseAdminEnvironment } from "./environment";
import {
  createFirebaseAdminAppResolver,
  type FirebaseAdminAppSdk,
} from "./app";

const environment: FirebaseAdminEnvironment = {
  projectId: "asdhealth-floorstock",
  clientEmail:
    "firebase-adminsdk-abcde@asdhealth-floorstock.iam.gserviceaccount.com",
  privateKey: "private-key",
  allowedOrigin: "https://admin.asdhealth.example",
};

function app(name: string, projectId = environment.projectId): App {
  return {
    name,
    options: { projectId },
  } as App;
}

describe("Firebase Admin app initialization", () => {
  it("initializes lazily and exactly once", () => {
    const initializedApp = app("asdhealth-floorstock-admin");
    const sdk: FirebaseAdminAppSdk = {
      getApps: vi.fn(() => []),
      createOptions: vi.fn(
        () => ({ projectId: environment.projectId }) as AppOptions,
      ),
      initializeApp: vi.fn(() => initializedApp),
    };
    const resolve = createFirebaseAdminAppResolver(sdk, () => environment);

    expect(sdk.initializeApp).not.toHaveBeenCalled();
    expect(resolve()).toBe(initializedApp);
    expect(resolve()).toBe(initializedApp);
    expect(sdk.initializeApp).toHaveBeenCalledOnce();
  });

  it("reuses only the matching named app", () => {
    const existing = app("asdhealth-floorstock-admin");
    const sdk: FirebaseAdminAppSdk = {
      getApps: vi.fn(() => [app("[DEFAULT]"), existing]),
      createOptions: vi.fn(),
      initializeApp: vi.fn(),
    };

    expect(createFirebaseAdminAppResolver(sdk, () => environment)()).toBe(
      existing,
    );
    expect(sdk.initializeApp).not.toHaveBeenCalled();
  });

  it("fails closed instead of reusing a mismatched app", () => {
    const sdk: FirebaseAdminAppSdk = {
      getApps: vi.fn(() => [
        app("asdhealth-floorstock-admin", "different-project"),
      ]),
      createOptions: vi.fn(),
      initializeApp: vi.fn(),
    };

    expect(() =>
      createFirebaseAdminAppResolver(sdk, () => environment)(),
    ).toThrow("configuration mismatch");
  });
});
