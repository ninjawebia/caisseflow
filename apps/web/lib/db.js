"use strict";
// Database helper. The connection string lives in the project root .env
// (server-only secret, gitignored, never exposed to the client bundle).
// The bundler rewrites __dirname, so candidates are probed explicitly.
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const candidates = [
  process.env.DATABASE_URL && null, // already loaded — nothing to do
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "..", ".env"),
  path.resolve(__dirname, "..", "..", ".env"),
].filter(Boolean);
for (const p of candidates) {
  if (fs.existsSync(p)) { require("dotenv").config({ path: p, quiet: true }); break; }
}

if (!process.env.DATABASE_URL) {
  // Fail fast with an explicit message (never a blurred SQL error).
  throw new Error("DATABASE_URL introuvable — créez le fichier .env à la racine du projet (voir .env.example)");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = { pool };
