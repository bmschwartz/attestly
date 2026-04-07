import { describe, it, expect, vi } from "vitest";
import { registerHandler, getHandler, hasHandler } from "../handlers";

describe("handler registry", () => {
  it("registers and retrieves a handler", () => {
    const handler = vi.fn();
    registerHandler("TEST_TYPE", handler);
    expect(getHandler("TEST_TYPE")).toBe(handler);
  });

  it("returns undefined for unregistered type", () => {
    expect(getHandler("NONEXISTENT_TYPE")).toBeUndefined();
  });

  it("hasHandler returns true for registered types", () => {
    expect(hasHandler("SEND_EMAIL")).toBe(true);
    expect(hasHandler("GENERATE_AI_SUMMARY")).toBe(true);
  });

  it("hasHandler returns false for unregistered types", () => {
    expect(hasHandler("DOES_NOT_EXIST")).toBe(false);
  });

  it("overwrites existing handler on re-register", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    registerHandler("OVERWRITE_TEST", handler1);
    registerHandler("OVERWRITE_TEST", handler2);
    expect(getHandler("OVERWRITE_TEST")).toBe(handler2);
  });

  it("all 6 placeholder handlers are registered", () => {
    const jobTypes = [
      "PUBLISH_SURVEY",
      "SUBMIT_RESPONSE",
      "CLOSE_SURVEY",
      "VERIFY_RESPONSES",
      "SEND_EMAIL",
      "GENERATE_AI_SUMMARY",
    ];
    for (const type of jobTypes) {
      expect(hasHandler(type)).toBe(true);
      expect(getHandler(type)).toBeTypeOf("function");
    }
  });
});
