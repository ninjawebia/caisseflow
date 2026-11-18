"use strict";
// SQL du personnel et de l'authentification locale (M3) — texte et mappings
// PURS, partagés par l'adaptateur expo-sqlite et les tests `node:sqlite`.

const UPSERT_STAFF_SQL = `INSERT INTO staff (matricule, nom, role, pin_hash, actif, version, synced_at)
  VALUES (?,?,?,?,?,?,datetime('now'))
  ON CONFLICT(matricule) DO UPDATE SET
    nom = excluded.nom,
    role = excluded.role,
    pin_hash = excluded.pin_hash,
    actif = excluded.actif,
    version = excluded.version,
    synced_at = excluded.synced_at`;

function upsertStaffArgs(row) {
  return [row.matricule, row.nom, row.role, row.pinHash, row.actif, row.version];
}

// Un matricule absent du pull est désactivé (jamais supprimé : traçabilité).
function deactivateMissingSql(count) {
  return `UPDATE staff SET actif = 0 WHERE matricule NOT IN (${Array.from({ length: count }, () => "?").join(",")})`;
}

const SELECT_STAFF_ALL_SQL = `SELECT matricule, nom, role, actif, version FROM staff ORDER BY actif DESC, nom`;
const SELECT_STAFF_ONE_SQL = `SELECT matricule, nom, role, pin_hash, actif, version FROM staff WHERE matricule = ?`;

const UPSERT_STATE_SQL = `INSERT INTO auth_state (matricule, failures, locked_until, last_failure_at, last_success_at)
  VALUES (?,?,?,?,?)
  ON CONFLICT(matricule) DO UPDATE SET
    failures = excluded.failures,
    locked_until = excluded.locked_until,
    last_failure_at = excluded.last_failure_at,
    last_success_at = excluded.last_success_at`;

const SELECT_STATE_SQL = `SELECT failures, locked_until, last_failure_at, last_success_at
  FROM auth_state WHERE matricule = ?`;

const INSERT_AUTH_EVENT_SQL = `INSERT INTO auth_events (ts, matricule, event, detail) VALUES (?,?,?,?)`;

const SELECT_AUTH_EVENTS_SQL = `SELECT ts, matricule, event, detail FROM auth_events ORDER BY id DESC LIMIT ?`;

module.exports = {
  UPSERT_STAFF_SQL,
  upsertStaffArgs,
  deactivateMissingSql,
  SELECT_STAFF_ALL_SQL,
  SELECT_STAFF_ONE_SQL,
  UPSERT_STATE_SQL,
  SELECT_STATE_SQL,
  INSERT_AUTH_EVENT_SQL,
  SELECT_AUTH_EVENTS_SQL,
};
