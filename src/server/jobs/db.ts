/**
 * Worker-safe Prisma client — does NOT import "server-only",
 * so it can be used in standalone Node.js worker processes.
 */
import { PrismaClient } from "../../../generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const createPrismaClient = () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
};

const globalForPrisma = globalThis as unknown as {
  workerPrisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.workerPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.workerPrisma = db;
