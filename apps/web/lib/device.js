"use strict";
// Device authentication for the sync endpoints (tablet caisse only, PRD 6.2).
const crypto = require("crypto");
const { pool } = require("./db");

// Authorization: Bearer <device token> — token stored hashed at rest.
async function deviceAuth(req) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  const r = await pool.query(
    `SELECT d.id, d.restaurant_id, d.poste, l.etat
     FROM device_tokens d
     JOIN licences l ON l.restaurant_id = d.restaurant_id
     WHERE d.token_hash = $1 AND d.actif = true`,
    [crypto.createHash("sha256").update(token).digest("hex")]
  );
  const row = r.rows[0];
  if (!row) return null;
  return { deviceId: row.id, restaurantId: row.restaurant_id, poste: row.poste, licence: row.etat };
}

// Sync availability per licence state (PRD LIC-2/3/4):
// active/grace1 → sync OK ; grace2/bloquee → cloud functions suspended.
function syncAllowed(licenceEtat) {
  return licenceEtat === "active" || licenceEtat === "grace1";
}

module.exports = { deviceAuth, syncAllowed };
