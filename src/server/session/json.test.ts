import { describe, expect, it } from "vitest";

import { parseJsonWithoutDuplicateKeys } from "./json";

describe("strict JSON parser", () => {
  it("parses valid nested JSON", () => {
    expect(
      parseJsonWithoutDuplicateKeys(
        '{"facilityId":"facility-2","nested":{"enabled":true},"list":[1,null]}',
      ),
    ).toEqual({
      facilityId: "facility-2",
      nested: { enabled: true },
      list: [1, null],
    });
  });

  it.each([
    '{"facilityId":"facility-1","facilityId":"facility-2"}',
    '{"facilityId":"facility-1","facility\\u0049d":"facility-2"}',
    '{"nested":{"value":1,"value":2}}',
  ])("rejects duplicate member names in %s", (input) => {
    expect(() => parseJsonWithoutDuplicateKeys(input)).toThrow(
      "Duplicate JSON member",
    );
  });

  it.each([
    '{"facilityId":"facility-2"} trailing',
    '{"facilityId":"facility-2",}',
    "[1,]",
    '{"unterminated":',
    '"bad\\xescape"',
  ])("rejects malformed or trailing JSON in %s", (input) => {
    expect(() => parseJsonWithoutDuplicateKeys(input)).toThrow();
  });
});
