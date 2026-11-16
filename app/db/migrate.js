"use strict";
// Applies SQL migrations in order. Run: npm run db:migrate
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const { pool } = require("../lib/db");

async function main() {
  const dir = path.join(__dirname, "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    console.log("Applying", file, "…");
    await pool.query(sql);
    console.log("OK", file);
  }
  await pool.end();
}

main().catch((e) => {
  console.error("Migration failed:", e.message);
  process.exit(1);
});
