/**
 * Entry point for the background job worker process.
 * Run with: pnpm worker
 *
 * This runs as a standalone Node.js process, separate from the
 * Next.js server. It polls the database for pending jobs and
 * processes them.
 */

// Load environment variables
import "dotenv/config";

console.log(
  "[Worker] ENV check — PINATA_JWT set:",
  !!process.env.PINATA_JWT,
  "PINATA_GATEWAY_URL set:",
  !!process.env.PINATA_GATEWAY_URL,
);

// Import handlers to register them
import "./handlers";

import { startWorker } from "./worker";

const worker = startWorker({
  pollIntervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS) || 5_000,
});

// Graceful shutdown on SIGINT (Ctrl+C) and SIGTERM
process.on("SIGINT", () => {
  console.log("\n[Worker] Received SIGINT");
  worker.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("[Worker] Received SIGTERM");
  worker.stop();
  process.exit(0);
});

console.log("[Worker] Background job worker is running. Press Ctrl+C to stop.");
