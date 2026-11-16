"use strict";
// Applies SQL migrations in order. Run: npm run db:migrate
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const { pool } = require("../lib/db");

async function main() {
  // Migration ledger: applied files are skipped (idempotent re-runs).
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const done = new Set((await pool.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
  const dir = path.join(__dirname, "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (done.has(file)) { console.log("Skip (déjà appliquée)", file); continue; }
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    console.log("Applying", file, "…");
    await pool.query(sql);
    await pool.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
    console.log("OK", file);
  }
  await pool.end();
}

main().catch((e) => {
  console.error("Migration failed:", e.message);
  process.exit(1);
});
