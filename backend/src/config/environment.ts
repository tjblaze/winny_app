import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(__dirname, "../../.env") });

if (!process.env.DATABASE_URL) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL must be configured before starting the API in production.");
  }
  process.env.DATABASE_URL = "file:./dev.db";
  console.info("DATABASE_URL is not set. Using the local SQLite database at backend/prisma/dev.db.");
}
