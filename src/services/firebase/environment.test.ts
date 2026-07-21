import { describe, expect, it } from "vitest";

import { parseFirebaseEnvironment } from "./environment";

const validConfiguration = {
  apiKey: "AIzaSyExamplePublicBrowserKey123456789",
  authDomain: "asdhealth-demo.firebaseapp.com",
  projectId: "asdhealth-demo1",
  storageBucket: "asdhealth-demo.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456",
};

describe("Firebase environment validation", () => {
  it("accepts a valid browser configuration", () => {
    expect(parseFirebaseEnvironment(validConfiguration)).toEqual(
      validConfiguration,
    );
  });

  it("rejects missing configuration", () => {
    expect(() => parseFirebaseEnvironment({})).toThrow();
  });

  it.each([
    ["authDomain", "https://asdhealth-demo.firebaseapp.com/path"],
    ["projectId", "Invalid_Project"],
    ["storageBucket", "not/a/bucket"],
    ["messagingSenderId", "sender-id"],
    ["appId", "not-an-app-id"],
  ] as const)("rejects malformed %s", (field, value) => {
    expect(() =>
      parseFirebaseEnvironment({ ...validConfiguration, [field]: value }),
    ).toThrow();
  });

  it.each(Object.keys(validConfiguration))(
    "rejects placeholder value for %s",
    (field) => {
      expect(() =>
        parseFirebaseEnvironment({
          ...validConfiguration,
          [field]: `replace-with-${field}`,
        }),
      ).toThrow();
    },
  );
});
