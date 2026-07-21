import { describe, expect, it } from "vitest";

import { firebaseOptionsMatch } from "./browser";

const configuration = {
  apiKey: "AIzaSyExamplePublicBrowserKey123456789",
  authDomain: "asdhealth-demo.firebaseapp.com",
  projectId: "asdhealth-demo1",
  storageBucket: "asdhealth-demo.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456",
};

describe("named Firebase browser app matching", () => {
  it("accepts the same configuration", () => {
    expect(firebaseOptionsMatch(configuration, configuration)).toBe(true);
  });

  it("rejects an unrelated app configuration", () => {
    expect(
      firebaseOptionsMatch(
        { ...configuration, projectId: "different-project" },
        configuration,
      ),
    ).toBe(false);
  });
});
