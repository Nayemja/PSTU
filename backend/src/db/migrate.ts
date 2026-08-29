import { readFile } from "node:fs/promises";
import path from "node:path";

import { pool } from "./pool";

async function runMigration(): Promise<void> {
  try {
    const migrationPath = path.join(
      __dirname,
      "migrations",
      "001_initial_schema.sql",
    );
    const migrationSql = await readFile(migrationPath, "utf8");

    await pool.query(migrationSql);
    console.log("Database migration completed successfully.");
  } catch (error) {
    console.error("Database migration failed.", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void runMigration();
