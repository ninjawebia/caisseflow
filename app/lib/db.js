"use strict";
// Database helper. The connection string lives in .env (server-only secret,
// never exposed to the client bundle).
const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = { pool };
