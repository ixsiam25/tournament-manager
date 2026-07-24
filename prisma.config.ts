import fs from "node:fs";
import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

// Next.js loads .env.local automatically; the Prisma CLI does not, so load it
// explicitly here (falls back to .env if .env.local isn't present).
dotenv.config({ path: fs.existsSync(".env.local") ? ".env.local" : ".env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations need Neon's direct (unpooled) connection, not the pooled
    // one the app uses at runtime via PrismaNeon.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
