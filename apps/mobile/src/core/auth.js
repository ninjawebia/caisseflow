"use strict";
// Authentification locale (M3) — PRD 4.1.1 : matricule + PIN 4–6 chiffres,
// validation 100 % locale (le PIN ne part JAMAIS au cloud), blocage après
// 5 échecs, verrouillage automatique après inactivité. Logique PURE : le hash
// bcrypt est vérifié dans l'adaptateur (`src/db/auth.js`).

const PIN_RE = /^\d{4,6}$/;
const MATRICULE_RE = /^[A-Z0-9]{1,8}$/;

const MAX_FAILURES = 5;
const LOCK_MS = 5 * 60 * 1000;            // blocage temporaire après 5 échecs
const SESSION_TIMEOUT_MS = 3 * 60 * 1000; // inactivité → verrouillage (2–5 min)
const BACKGROUND_LOCK_MS = 30 * 1000;     // app en arrière-plan → verrouillage

function isValidPin(pin) {
  // Chaîne uniquement : le pavé numérique produit une chaîne, un nombre 1234
  // ne doit pas être accepté silencieusement (perte des zéros initiaux).
  return typeof pin === "string" && PIN_RE.test(pin);
}

function normalizeMatricule(input) {
  return String(input || "").trim().toUpperCase();
}

function isValidMatricule(value) {
  return MATRICULE_RE.test(normalizeMatricule(value));
}

// État courant : peut-on tenter une authentification ?
function evaluateAttempt(state, nowMs) {
  const failures = Number((state && state.failures) || 0);
  const lockedUntilMs = state && state.lockedUntil ? Date.parse(state.lockedUntil) : null;

  if (lockedUntilMs && nowMs < lockedUntilMs) {
    return { allowed: false, reason: "locked", retryAfterMs: lockedUntilMs - nowMs, failures };
  }
  // Verrou expiré : le compteur repart de zéro (nouvelle série de 5 essais).
  return { allowed: true, reason: null, retryAfterMs: 0, failures: lockedUntilMs ? 0 : failures };
}

// Échec : incrémente, verrouille au 5ᵉ.
function onFailure(state, nowMs) {
  const lockedUntilMs = state && state.lockedUntil ? Date.parse(state.lockedUntil) : null;
  const base = lockedUntilMs && nowMs >= lockedUntilMs ? 0 : Number((state && state.failures) || 0);
  const failures = base + 1;
  const locked = failures >= MAX_FAILURES;
  return {
    failures,
    locked,
    lockedUntil: locked ? new Date(nowMs + LOCK_MS).toISOString() : (state && state.lockedUntil) || null,
    remaining: Math.max(0, MAX_FAILURES - failures),
    lastFailureAt: new Date(nowMs).toISOString(),
  };
}

// Succès : compteur remis à zéro, verrou levé.
function onSuccess(nowMs) {
  return { failures: 0, lockedUntil: null, lastFailureAt: null, lastSuccessAt: new Date(nowMs).toISOString() };
}

// Verrouillage d'inactivité : le dernier contact utilisateur est-il trop ancien ?
function isSessionExpired(lastActivityMs, nowMs, timeoutMs = SESSION_TIMEOUT_MS) {
  if (!Number.isFinite(lastActivityMs)) return true;
  return nowMs - lastActivityMs >= timeoutMs;
}

// Retour au premier plan : verrouille si l'app est restée en arrière-plan.
function shouldLockOnResume(backgroundAtMs, nowMs, limitMs = BACKGROUND_LOCK_MS) {
  if (!Number.isFinite(backgroundAtMs)) return false;
  return nowMs - backgroundAtMs >= limitMs;
}

function formatDuration(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m} min ${String(s).padStart(2, "0")} s` : `${s} s`;
}

// Libellé métier d'un rôle (identique dans les écrans de connexion et d'accueil).
const ROLE_LABEL = {
  gerant: "Gérant",
  second: "Second",
  serveur: "Serveur",
  cuisine: "Cuisine",
};

function roleLabel(role) {
  return ROLE_LABEL[role] || String(role || "—");
}

module.exports = {
  PIN_RE,
  MATRICULE_RE,
  MAX_FAILURES,
  LOCK_MS,
  SESSION_TIMEOUT_MS,
  BACKGROUND_LOCK_MS,
  ROLE_LABEL,
  isValidPin,
  normalizeMatricule,
  isValidMatricule,
  evaluateAttempt,
  onFailure,
  onSuccess,
  isSessionExpired,
  shouldLockOnResume,
  formatDuration,
  roleLabel,
};
