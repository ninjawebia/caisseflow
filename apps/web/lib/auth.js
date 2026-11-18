"use strict";
// Authentication helpers (server-side only). Sessions are opaque random tokens
// stored hashed in the database — instant revocation (PRD BO-8 / 10.2).
const crypto = require("crypto");
const { pool } = require("./db");

const SESSION_COOKIE = "cf_session";
const SESSION_TTL_MS = 24 * 3600 * 1000; // 24 h max (PRD 10.2)

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function newSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function createSession(userId) {
  const token = newSessionToken();
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  const r = await pool.query(
    "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1,$2,$3) RETURNING id",
    [userId, hashToken(token), expires]
  );
  return { token, expires, sessionId: r.rows[0].id };
}

async function getSessionUser(cookies) {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const r = await pool.query(
    `SELECT u.id, u.email, u.role, u.nom, u.restaurant_id, u.totp_enabled, s.expires_at, s.revoked
     FROM sessions s JOIN users_web u ON u.id = s.user_id
     WHERE s.token_hash = $1`,
    [hashToken(token)]
  );
  const row = r.rows[0];
  if (!row) return null;
  if (row.revoked || new Date(row.expires_at) < new Date()) return null;
  return { id: row.id, email: row.email, role: row.role, nom: row.nom, restaurantId: row.restaurant_id, totpEnabled: row.totp_enabled };
}

async function revokeSession(cookies) {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token) await pool.query("UPDATE sessions SET revoked = true WHERE token_hash = $1", [hashToken(token)]);
}

function cookieOptions() {
  // Set-Cookie flags: HttpOnly, SameSite=Lax, Secure (in production over TLS).
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  };
}

// Role gate for pages/routes. Roles: gerant, expert_comptable, auditeur,
// admin_plateforme (PRD 3.2 RBAC matrix).
function can(role, permission) {
  const matrix = {
    gerant: ["reports", "menu", "users", "tables", "journal", "exports", "ticket", "licence_read", "licence_admin", "audit", "devices"],
    expert_comptable: ["reports", "journal", "exports", "audit"],
    auditeur: ["reports", "journal", "exports", "audit"],
    admin_plateforme: ["licence", "audit", "reports"],
  };
  return (matrix[role] || []).includes(permission);
}

module.exports = { SESSION_COOKIE, createSession, getSessionUser, revokeSession, cookieOptions, can, hashToken };
