import "server-only";

/**
 * Validates JSON structure while rejecting duplicate object member names.
 * JSON.parse intentionally accepts duplicates using last-value-wins semantics,
 * which is unsuitable at an authorization-changing request boundary.
 */
export function parseJsonWithoutDuplicateKeys(text: string): unknown {
  let index = 0;

  const skipWhitespace = () => {
    while (/\s/u.test(text[index] ?? "")) index += 1;
  };

  const consumeString = (): string => {
    const start = index;
    if (text[index] !== '"') throw new SyntaxError("Expected JSON string.");
    index += 1;
    while (index < text.length) {
      const character = text[index];
      if (character === '"') {
        index += 1;
        return JSON.parse(text.slice(start, index)) as string;
      }
      if (character === "\\") {
        index += 1;
        if (text[index] === "u") {
          if (!/^[0-9a-fA-F]{4}$/u.test(text.slice(index + 1, index + 5))) {
            throw new SyntaxError("Invalid JSON Unicode escape.");
          }
          index += 5;
          continue;
        }
        if (!'"\\/bfnrt'.includes(text[index] ?? "")) {
          throw new SyntaxError("Invalid JSON escape.");
        }
        index += 1;
        continue;
      }
      if ((character?.charCodeAt(0) ?? 0) < 0x20) {
        throw new SyntaxError("Invalid JSON string character.");
      }
      index += 1;
    }
    throw new SyntaxError("Unterminated JSON string.");
  };

  const consumeValue = (): void => {
    skipWhitespace();
    const character = text[index];
    if (character === '"') {
      consumeString();
      return;
    }
    if (character === "{") {
      index += 1;
      skipWhitespace();
      const keys = new Set<string>();
      if (text[index] === "}") {
        index += 1;
        return;
      }
      while (index < text.length) {
        const key = consumeString();
        if (keys.has(key)) throw new SyntaxError("Duplicate JSON member.");
        keys.add(key);
        skipWhitespace();
        if (text[index] !== ":") throw new SyntaxError("Expected colon.");
        index += 1;
        consumeValue();
        skipWhitespace();
        if (text[index] === "}") {
          index += 1;
          return;
        }
        if (text[index] !== ",") throw new SyntaxError("Expected comma.");
        index += 1;
        skipWhitespace();
      }
      throw new SyntaxError("Unterminated JSON object.");
    }
    if (character === "[") {
      index += 1;
      skipWhitespace();
      if (text[index] === "]") {
        index += 1;
        return;
      }
      while (index < text.length) {
        consumeValue();
        skipWhitespace();
        if (text[index] === "]") {
          index += 1;
          return;
        }
        if (text[index] !== ",") throw new SyntaxError("Expected comma.");
        index += 1;
      }
      throw new SyntaxError("Unterminated JSON array.");
    }

    const remaining = text.slice(index);
    const primitive =
      /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/u.exec(
        remaining,
      )?.[0];
    if (!primitive) throw new SyntaxError("Invalid JSON value.");
    index += primitive.length;
  };

  consumeValue();
  skipWhitespace();
  if (index !== text.length) throw new SyntaxError("Trailing JSON content.");
  return JSON.parse(text) as unknown;
}
