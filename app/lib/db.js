"use strict";
// Database helper. The connection string lives in the project root .env
// (server-only secret, gitignored, never exposed to the client bundle).
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = { pool };
