"use strict";
// HTTP helpers: JSON responses, CSRF mitigation, rate limiting.
const { pool } = require("./db");

function json(data, status = 200) {
  return Response.json(data, { status });
}

// CSRF mitigation (PRD 10.2): SameSite=Lax session cookie + strict same-origin
// check on every state-changing request. Rejects cross-site POST/PUT/PATCH/DELETE.
function assertSameOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin) return null; // same-origin fetch may omit Origin for GET-style
  try {
    const host = req.headers.get("host");
    if (new URL(origin).host !== host) return json({ error: "Origine non autorisée" }, 403);
  } catch {
    return json({ error: "Origine invalide" }, 403);
  }
  return null;
}

// In-memory sliding-window limiter (single-instance dev). The database-side
// lockout below is the durable control (SEC-6 / brute-force rule 18).
const buckets = new Map();
function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const b = buckets.get(key) || { count: 0, reset: now + windowMs };
  if (b.reset < now) { b.count = 0; b.reset = now + windowMs; }
  b.count += 1;
  buckets.set(key, b);
  return b.count <= limit;
}

// Durable account lockout after 5 failed logins (PRD SEC-6 pattern, web side).
async function registerLoginFailure(email) {
  const r = await pool.query(
    `UPDATE users_web SET failed_attempts = failed_attempts + 1
     WHERE email = $1 AND failed_attempts < 5 RETURNING failed_attempts`, [email]
  );
  if (r.rows[0] && r.rows[0].failed_attempts >= 5) {
    await pool.query(
      `UPDATE users_web SET locked_until = now() + interval '15 minutes' WHERE email = $1`, [email]
    );
  }
  await pool.query(
    "INSERT INTO audit_log (actor_email, action, entity, diff_summary) VALUES ($1,$2,$3,$4)",
    [email, "login_failure", "users_web", JSON.stringify({ reason: "bad_credentials" })]
  );
}

async function clearLoginFailures(id) {
  await pool.query(
    "UPDATE users_web SET failed_attempts = 0, locked_until = NULL WHERE id = $1", [id]
  );
}

// Audit trail writer (PRD 10.5 — append-only).
async function audit(actor, action, entity, entityId, diff) {
  await pool.query(
    "INSERT INTO audit_log (actor_id, actor_email, action, entity, entity_id, diff_summary) VALUES ($1,$2,$3,$4,$5,$6)",
    [actor.id, actor.email, action, entity, entityId || null, JSON.stringify(diff || {})]
  );
}

module.exports = { json, assertSameOrigin, rateLimit, registerLoginFailure, clearLoginFailures, audit };
