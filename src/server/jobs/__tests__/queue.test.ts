import { describe, it, expect } from "vitest";
import {
  getRetryDelay,
  isReadyForRetry,
  MAX_RETRIES,
  RETRY_BACKOFF_MS,
  STALE_JOB_TIMEOUT_MINUTES,
} from "../queue";

describe("getRetryDelay", () => {
  it("returns 0 for first attempt (retryCount 0)", () => {
    expect(getRetryDelay(0)).toBe(0);
  });

  it("returns 5s for first retry", () => {
    expect(getRetryDelay(1)).toBe(5_000);
  });

  it("returns 30s for second retry", () => {
    expect(getRetryDelay(2)).toBe(30_000);
  });

  it("returns 5min for third retry", () => {
    expect(getRetryDelay(3)).toBe(300_000);
  });

  it("caps at max backoff for retries beyond the schedule", () => {
    expect(getRetryDelay(10)).toBe(300_000);
  });

  it("returns 0 for negative retry count", () => {
    expect(getRetryDelay(-1)).toBe(0);
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
    // First retry backoff is 5s, set lastAttemptedAt to 1s ago
    const oneSecondAgo = new Date(now.getTime() - 1_000);
    expect(isReadyForRetry(1, oneSecondAgo)).toBe(false);
  });

  it("returns true when backoff has elapsed", () => {
    const now = new Date();
    // First retry backoff is 5s, set lastAttemptedAt to 10s ago
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

  it("respects third retry backoff (5min)", () => {
    const now = new Date();
    const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
    expect(isReadyForRetry(3, twoMinutesAgo)).toBe(false);

    const sixMinutesAgo = new Date(now.getTime() - 6 * 60 * 1000);
    expect(isReadyForRetry(3, sixMinutesAgo)).toBe(true);
  });
});

describe("constants", () => {
  it("MAX_RETRIES is 3", () => {
    expect(MAX_RETRIES).toBe(3);
  });

  it("RETRY_BACKOFF_MS has 3 entries", () => {
    expect(RETRY_BACKOFF_MS).toHaveLength(3);
    expect(RETRY_BACKOFF_MS[0]).toBe(5_000);
    expect(RETRY_BACKOFF_MS[1]).toBe(30_000);
    expect(RETRY_BACKOFF_MS[2]).toBe(300_000);
  });

  it("STALE_JOB_TIMEOUT_MINUTES is 60", () => {
    expect(STALE_JOB_TIMEOUT_MINUTES).toBe(60);
  });
});
