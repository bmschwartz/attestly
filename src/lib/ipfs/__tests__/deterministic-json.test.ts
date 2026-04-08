import { describe, it, expect } from "vitest";
import { canonicalize } from "../deterministic-json";

describe("canonicalize (deterministic JSON)", () => {
  it("sorts object keys alphabetically", () => {
    expect(canonicalize({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it("sorts nested object keys", () => {
    expect(canonicalize({ z: { b: 2, a: 1 }, a: 1 })).toBe(
      '{"a":1,"z":{"a":1,"b":2}}',
    );
  });

  it("produces no whitespace", () => {
    const result = canonicalize({ key: "value", num: 42 });
    expect(result).not.toMatch(/\s/);
  });

  it("preserves array order", () => {
    expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
  });

  it("sorts keys inside objects within arrays", () => {
    expect(canonicalize([{ b: 2, a: 1 }])).toBe('[{"a":1,"b":2}]');
  });

  it("serializes null", () => {
    expect(canonicalize(null)).toBe("null");
  });

  it("serializes booleans", () => {
    expect(canonicalize(true)).toBe("true");
    expect(canonicalize(false)).toBe("false");
  });

  it("handles strings with special characters", () => {
    const result = canonicalize({ msg: 'hello "world"\nnewline' });
    expect(result).toBe('{"msg":"hello \\"world\\"\\nnewline"}');
  });

  it("serializes empty objects", () => {
    expect(canonicalize({})).toBe("{}");
  });

  it("serializes empty arrays", () => {
    expect(canonicalize([])).toBe("[]");
  });

  it("converts negative zero to 0", () => {
    expect(canonicalize(-0)).toBe("0");
  });

  it("serializes integers", () => {
    expect(canonicalize(42)).toBe("42");
    expect(canonicalize(-1)).toBe("-1");
  });

  it("serializes floats", () => {
    expect(canonicalize(1.5)).toBe("1.5");
  });

  it("throws on Infinity", () => {
    expect(() => canonicalize(Infinity)).toThrow();
  });

  it("throws on NaN", () => {
    expect(() => canonicalize(NaN)).toThrow();
  });

  it("skips undefined values in objects", () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("produces deterministic output", () => {
    const obj = { z: 1, a: 2, m: 3 };
    const first = canonicalize(obj);
    const second = canonicalize(obj);
    expect(first).toBe(second);
  });

  it("produces identical output regardless of key insertion order", () => {
    const obj1 = { a: 1, b: 2, c: 3 };
    const obj2 = { c: 3, a: 1, b: 2 };
    expect(canonicalize(obj1)).toBe(canonicalize(obj2));
  });

  it("handles a realistic survey JSON payload", () => {
    const survey = {
      version: "1",
      title: "Customer Satisfaction",
      description: "Please rate our service",
      creator: "0x1234567890abcdef1234567890abcdef12345678",
      slug: "customer-satisfaction",
      isPrivate: false,
      accessMode: "open",
      resultsVisibility: "public",
      questions: [
        {
          text: "How satisfied are you?",
          questionType: "RATING",
          position: 0,
          required: true,
          minRating: 1,
          maxRating: 5,
        },
      ],
    };

    const result = canonicalize(survey);
    expect(result).toBeDefined();
    // Verify it's valid JSON
    expect(() => JSON.parse(result!)).not.toThrow();
    // Verify determinism
    expect(canonicalize(survey)).toBe(result);
    // Keys should be sorted at every level
    const parsed = JSON.parse(result!) as Record<string, unknown>;
    const topKeys = Object.keys(parsed);
    expect(topKeys).toEqual([...topKeys].sort());
  });
});
