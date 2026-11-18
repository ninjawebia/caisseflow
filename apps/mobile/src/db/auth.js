// Authentification locale de la caisse (M3) — vérification bcrypt 100 % locale
// (le PIN ne quitte jamais l'appareil, PRD 4.1.1), compteur d'échecs, blocage
// temporaire après 5 échecs, journal local des connexions (table `auth_events`,
// SÉPARÉE du journal fiscal : une connexion n'est pas un événement fiscal).
"use strict";
const bcrypt = require("bcryptjs");
const {
  MAX_FAILURES, normalizeMatricule, isValidMatricule, isValidPin,
  evaluateAttempt, onFailure, onSuccess, formatDuration,
} = require("../core/auth");
const { normalizeStaffRows } = require("../core/staff");
const S = require("./staff-sql");

// Hash factice (mot de passe non devinable) : vérifié quand le matricule est
// inconnu/inactif, pour que le temps de réponse ne révèle pas son existence.
const DUMMY_HASH = "$2b$10$3n4ZdV75iliaUyEawaWFROcj/YQoz6VQnElgekUpfwOb34Ml0tKHC";

function verifyPin(pinHash, pin) {
  try {
    return bcrypt.compareSync(String(pin), String(pinHash)) === true;
  } catch {
    return false;
  }
}

function iso(ms) {
  return new Date(ms).toISOString();
}

async function recordEvent(db, matricule, event, detail) {
  await db.runAsync(S.INSERT_AUTH_EVENT_SQL, [new Date().toISOString(), matricule, event, detail ? JSON.stringify(detail) : null]);
}

// Remplace le cache du personnel par le pull courant (dernière version gagnante).
async function saveStaff(db, users) {
  const { rows, rejected } = normalizeStaffRows(users);
  for (const row of rows) {
    await db.runAsync(S.UPSERT_STAFF_SQL, S.upsertStaffArgs(row));
  }
  if (rows.length) {
    await db.runAsync(S.deactivateMissingSql(rows.length), rows.map((r) => r.matricule));
  }
  await recordEvent(db, "*", "staff_sync", { recus: rows.length, rejetes: rejected.length });
  return { saved: rows.length, rejected };
}

async function listStaff(db) {
  const rows = await db.getAllAsync(S.SELECT_STAFF_ALL_SQL);
  return rows.map((r) => ({ matricule: r.matricule, nom: r.nom, role: r.role, actif: Number(r.actif) === 1 }));
}

async function staffCount(db) {
  const row = await db.getFirstAsync("SELECT COUNT(*) AS n FROM staff WHERE actif = 1");
  return Number((row && row.n) || 0);
}

// Tentative de connexion. Retourne un résultat explicite (jamais d'exception
// métier) : l'écran affiche `message`, et `code` pilote l'UI.
async function authenticate(db, { matricule, pin, now = Date.now() }) {
  const mat = normalizeMatricule(matricule);
  if (!isValidMatricule(mat)) {
    return { ok: false, code: "MATRICULE", message: "Matricule invalide (1 à 8 caractères alphanumériques)" };
  }
  if (!isValidPin(pin)) {
    return { ok: false, code: "PIN", message: "PIN attendu : 4 à 6 chiffres" };
  }

  const stateRow = await db.getFirstAsync(S.SELECT_STATE_SQL, [mat]);
  const state = stateRow
    ? { failures: Number(stateRow.failures), lockedUntil: stateRow.locked_until, lastSuccessAt: stateRow.last_success_at }
    : null;

  const gate = evaluateAttempt(state, now);
  if (!gate.allowed) {
    return {
      ok: false,
      code: "LOCKED",
      message: `Trop d'échecs — réessayez dans ${formatDuration(gate.retryAfterMs)}`,
      retryAfterMs: gate.retryAfterMs,
    };
  }

  const staff = await db.getFirstAsync(S.SELECT_STAFF_ONE_SQL, [mat]);
  const active = Boolean(staff) && Number(staff.actif) === 1;
  // Toujours un bcrypt coûteux, même pour un matricule inconnu (anti-énumération).
  const match = verifyPin(active ? staff.pin_hash : DUMMY_HASH, pin);

  if (!active || !match) {
    const next = onFailure({ failures: gate.failures, lockedUntil: null }, now);
    await db.runAsync(S.UPSERT_STATE_SQL, [
      mat, next.failures, next.lockedUntil, next.lastFailureAt, state ? state.lastSuccessAt || null : null,
    ]);
    await recordEvent(db, mat, "login_fail", { essais_restants: next.remaining });
    if (next.locked) await recordEvent(db, mat, "lockout", { jusqu_a: next.lockedUntil, seuil: MAX_FAILURES });

    return {
      ok: false,
      code: next.locked ? "LOCKED" : "INVALID",
      message: next.locked
        ? `Compte bloqué ${formatDuration(5 * 60 * 1000)} après ${MAX_FAILURES} échecs — incident journalisé`
        : `Matricule ou PIN incorrect — ${next.remaining} essai(s) avant blocage`,
      remaining: next.remaining,
      retryAfterMs: next.locked ? 5 * 60 * 1000 : 0,
    };
  }

  const success = onSuccess(now);
  await db.runAsync(S.UPSERT_STATE_SQL, [mat, success.failures, success.lockedUntil, success.lastFailureAt, success.lastSuccessAt]);
  await recordEvent(db, mat, "login_ok", { role: staff.role });

  return {
    ok: true,
    user: { matricule: staff.matricule, nom: staff.nom, role: staff.role },
  };
}

// Libellé d'état de verrouillage pour l'écran (compte bloqué ou non).
async function lockStatus(db, matricule, now = Date.now()) {
  const mat = normalizeMatricule(matricule);
  const row = await db.getFirstAsync(S.SELECT_STATE_SQL, [mat]);
  if (!row) return { locked: false, retryAfterMs: 0 };
  const gate = evaluateAttempt({ failures: Number(row.failures), lockedUntil: row.locked_until }, now);
  return { locked: !gate.allowed, retryAfterMs: gate.retryAfterMs, failures: Number(row.failures) };
}

async function recordLockEvent(db, matricule, event) {
  await recordEvent(db, normalizeMatricule(matricule) || "*", event, null);
}

async function recentAuthEvents(db, limit = 20) {
  return db.getAllAsync(S.SELECT_AUTH_EVENTS_SQL, [limit]);
}

module.exports = {
  DUMMY_HASH,
  verifyPin,
  iso,
  saveStaff,
  listStaff,
  staffCount,
  authenticate,
  lockStatus,
  recordLockEvent,
  recentAuthEvents,
};
