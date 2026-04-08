import { describe, it, expect } from "vitest";
import {
  getRetryDelay,
  getMaxRetries,
  isReadyForRetry,
  DEFAULT_MAX_RETRIES,
  DEFAULT_BACKOFF_MS,
  BLOCKCHAIN_MAX_RETRIES,
  BLOCKCHAIN_BACKOFF_MS,
  STALE_JOB_TIMEOUT_MINUTES,
} from "../queue";

describe("getRetryDelay", () => {
  it("returns 0 for first attempt (retryCount 0)", () => {
    expect(getRetryDelay(0)).toBe(0);
  });

  it("returns 5s for first retry (default)", () => {
    expect(getRetryDelay(1)).toBe(5_000);
  });

  it("returns 30s for second retry (default)", () => {
    expect(getRetryDelay(2)).toBe(30_000);
  });

  it("returns 5min for third retry (default)", () => {
    expect(getRetryDelay(3)).toBe(300_000);
  });

  it("caps at max backoff for retries beyond the default schedule", () => {
    expect(getRetryDelay(10)).toBe(300_000);
  });

  it("returns 0 for negative retry count", () => {
    expect(getRetryDelay(-1)).toBe(0);
  });

  it("uses blockchain backoff schedule for blockchain job types", () => {
    expect(getRetryDelay(1, "PUBLISH_SURVEY")).toBe(5_000);
    expect(getRetryDelay(2, "PUBLISH_SURVEY")).toBe(15_000);
    expect(getRetryDelay(3, "SUBMIT_RESPONSE")).toBe(30_000);
    expect(getRetryDelay(7, "CLOSE_SURVEY")).toBe(600_000);
    expect(getRetryDelay(8, "PUBLISH_SURVEY")).toBe(1_800_000);
  });

  it("caps at max blockchain backoff for retries beyond the schedule", () => {
    expect(getRetryDelay(20, "PUBLISH_SURVEY")).toBe(1_800_000);
  });

  it("uses default schedule for non-blockchain job types", () => {
    expect(getRetryDelay(1, "SEND_EMAIL")).toBe(5_000);
    expect(getRetryDelay(3, "SEND_EMAIL")).toBe(300_000);
  });
});

describe("getMaxRetries", () => {
  it("returns 10 for blockchain job types", () => {
    expect(getMaxRetries("PUBLISH_SURVEY")).toBe(10);
    expect(getMaxRetries("SUBMIT_RESPONSE")).toBe(10);
    expect(getMaxRetries("CLOSE_SURVEY")).toBe(10);
  });

  it("returns 3 for non-blockchain job types", () => {
    expect(getMaxRetries("SEND_EMAIL")).toBe(3);
    expect(getMaxRetries("GENERATE_AI_SUMMARY")).toBe(3);
  });
});

describe("isReadyForRetry", () => {
  it("returns true for first attempt (retryCount 0)", () => {
    expect(isReadyForRetry(0, null)).toBe(true);
  });

  it("returns true when no lastAttemptedAt is set", () => {
    expect(isReadyForRetry(1, null)).toBe(true);
  });

  it("returns false when backoff has not elapsed", () => {
    const now = new Date();
    const oneSecondAgo = new Date(now.getTime() - 1_000);
    expect(isReadyForRetry(1, oneSecondAgo)).toBe(false);
  });

  it("returns true when backoff has elapsed", () => {
    const now = new Date();
    const tenSecondsAgo = new Date(now.getTime() - 10_000);
    expect(isReadyForRetry(1, tenSecondsAgo)).toBe(true);
  });

  it("respects second retry backoff (30s)", () => {
    const now = new Date();
    const twentySecondsAgo = new Date(now.getTime() - 20_000);
    expect(isReadyForRetry(2, twentySecondsAgo)).toBe(false);

    const fortySecondsAgo = new Date(now.getTime() - 40_000);
    expect(isReadyForRetry(2, fortySecondsAgo)).toBe(true);
  });

  it("uses blockchain backoff when job type is provided", () => {
    const now = new Date();
    // Blockchain retry 2 backoff is 15s
    const tenSecondsAgo = new Date(now.getTime() - 10_000);
    expect(isReadyForRetry(2, tenSecondsAgo, "PUBLISH_SURVEY")).toBe(false);

    const twentySecondsAgo = new Date(now.getTime() - 20_000);
    expect(isReadyForRetry(2, twentySecondsAgo, "PUBLISH_SURVEY")).toBe(true);
  });
});

describe("constants", () => {
  it("DEFAULT_MAX_RETRIES is 3", () => {
    expect(DEFAULT_MAX_RETRIES).toBe(3);
  });

  it("BLOCKCHAIN_MAX_RETRIES is 10", () => {
    expect(BLOCKCHAIN_MAX_RETRIES).toBe(10);
  });

  it("DEFAULT_BACKOFF_MS has 3 entries", () => {
    expect(DEFAULT_BACKOFF_MS).toHaveLength(3);
    expect(DEFAULT_BACKOFF_MS[0]).toBe(5_000);
    expect(DEFAULT_BACKOFF_MS[1]).toBe(30_000);
    expect(DEFAULT_BACKOFF_MS[2]).toBe(300_000);
  });

  it("BLOCKCHAIN_BACKOFF_MS has 8 entries", () => {
    expect(BLOCKCHAIN_BACKOFF_MS).toHaveLength(8);
    expect(BLOCKCHAIN_BACKOFF_MS[0]).toBe(5_000);
    expect(BLOCKCHAIN_BACKOFF_MS[7]).toBe(1_800_000);
  });

  it("STALE_JOB_TIMEOUT_MINUTES is 60", () => {
    expect(STALE_JOB_TIMEOUT_MINUTES).toBe(60);
  });
});
