import path from "path";
import * as dotenv from "dotenv";
import { defineConfig } from "@prisma/config";

// Load .env from the monorepo root (one level up from api/)
dotenv.config({ path: path.resolve(__dirname, "../.env") });

export default defineConfig({
  migrations: {
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
