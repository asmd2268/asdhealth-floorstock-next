import { describe, expect, it } from "vitest";

import { parseFirebaseAdminEnvironment } from "./environment";

const validEnvironment = {
  FIREBASE_ADMIN_PROJECT_ID: "asdhealth-floorstock",
  FIREBASE_ADMIN_CLIENT_EMAIL:
    "firebase-adminsdk-abcde@asdhealth-floorstock.iam.gserviceaccount.com",
  FIREBASE_ADMIN_PRIVATE_KEY:
    "-----BEGIN PRIVATE KEY-----\\nabc123+/=\\n-----END PRIVATE KEY-----\\n",
  TRUSTED_PROVISIONING_ALLOWED_ORIGIN: "https://admin.asdhealth.example",
};

describe("Firebase Admin server environment", () => {
  it("normalizes a complete server-only configuration", () => {
    expect(parseFirebaseAdminEnvironment(validEnvironment)).toEqual({
      projectId: "asdhealth-floorstock",
      clientEmail:
        "firebase-adminsdk-abcde@asdhealth-floorstock.iam.gserviceaccount.com",
      privateKey:
        "-----BEGIN PRIVATE KEY-----\nabc123+/=\n-----END PRIVATE KEY-----\n",
      allowedOrigin: "https://admin.asdhealth.example",
    });
  });

  it.each([
    {},
    { ...validEnvironment, FIREBASE_ADMIN_PROJECT_ID: "replace-project" },
    { ...validEnvironment, FIREBASE_ADMIN_PROJECT_ID: "INVALID" },
    { ...validEnvironment, FIREBASE_ADMIN_CLIENT_EMAIL: "user@example.com" },
    { ...validEnvironment, FIREBASE_ADMIN_PRIVATE_KEY: "not-a-private-key" },
    {
      ...validEnvironment,
      TRUSTED_PROVISIONING_ALLOWED_ORIGIN:
        "https://admin.asdhealth.example/path",
    },
    {
      ...validEnvironment,
      TRUSTED_PROVISIONING_ALLOWED_ORIGIN: "http://admin.asdhealth.example",
    },
    {
      ...validEnvironment,
      TRUSTED_PROVISIONING_ALLOWED_ORIGIN:
        "https://replace-with-admin-origin.example",
    },
  ])("fails closed for missing or malformed configuration", (environment) => {
    expect(() => parseFirebaseAdminEnvironment(environment)).toThrow();
  });
});
