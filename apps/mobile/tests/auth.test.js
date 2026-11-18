"use strict";
// TC-M3-AUTH — politiques d'authentification locale : format du PIN et du
// matricule, compteur d'échecs, blocage au 5ᵉ, verrouillage d'inactivité et
// d'arrière-plan (PRD 4.1.1).
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MAX_FAILURES, LOCK_MS, SESSION_TIMEOUT_MS, BACKGROUND_LOCK_MS,
  isValidPin, normalizeMatricule, isValidMatricule,
  evaluateAttempt, onFailure, onSuccess, isSessionExpired, shouldLockOnResume,
  formatDuration, roleLabel,
} = require("../src/core/auth");

const NOW = Date.parse("2026-11-18T12:00:00.000Z");

test("PIN : 4 à 6 chiffres uniquement", () => {
  for (const ok of ["1234", "12345", "123456"]) assert.equal(isValidPin(ok), true, ok);
  for (const bad of ["123", "1234567", "12a4", " 1234", "１２３４", "", null, undefined, 1234]) {
    assert.equal(isValidPin(bad), false, JSON.stringify(bad));
  }
});

test("matricule : normalisé en majuscules, 1 à 8 alphanumériques", () => {
  assert.equal(normalizeMatricule(" mgr "), "MGR");
  assert.equal(normalizeMatricule("s08"), "S08");
  assert.equal(isValidMatricule("s08"), true);
  assert.equal(isValidMatricule("MGR"), true);
  assert.equal(isValidMatricule("A1B2C3D4"), true);
  for (const bad of ["", "TROP-LONG-9", "S 08", "S_08", "S08!", null, undefined]) {
    assert.equal(isValidMatricule(bad), false, JSON.stringify(bad));
  }
});

test("aucun verrou : tentative autorisée, compteur conservé", () => {
  assert.deepEqual(evaluateAttempt({ failures: 2, lockedUntil: null }, NOW), {
    allowed: true, reason: null, retryAfterMs: 0, failures: 2,
  });
  assert.deepEqual(evaluateAttempt(null, NOW), { allowed: true, reason: null, retryAfterMs: 0, failures: 0 });
});

test("verrou actif : refus explicite avec temps restant", () => {
  const state = { failures: 5, lockedUntil: new Date(NOW + 90000).toISOString() };
  const res = evaluateAttempt(state, NOW);
  assert.equal(res.allowed, false);
  assert.equal(res.reason, "locked");
  assert.equal(res.retryAfterMs, 90000);
});

test("verrou expiré : compteur remis à zéro (nouvelle série de 5)", () => {
  const state = { failures: 5, lockedUntil: new Date(NOW - 1000).toISOString() };
  const res = evaluateAttempt(state, NOW);
  assert.equal(res.allowed, true);
  assert.equal(res.failures, 0);
});

test("échecs : incrément, essais restants, blocage au 5ᵉ", () => {
  let state = null;
  const seen = [];
  for (let i = 1; i <= MAX_FAILURES; i += 1) {
    const next = onFailure(state, NOW);
    seen.push(next.failures);
    assert.equal(next.remaining, MAX_FAILURES - i);
    if (i < MAX_FAILURES) {
      assert.equal(next.locked, false);
      assert.equal(next.lockedUntil, null);
    } else {
      assert.equal(next.locked, true);
      assert.equal(next.lockedUntil, new Date(NOW + LOCK_MS).toISOString());
    }
    state = { failures: next.failures, lockedUntil: next.lockedUntil };
  }
  assert.deepEqual(seen, [1, 2, 3, 4, 5]);
  assert.equal(MAX_FAILURES, 5);
  assert.equal(LOCK_MS, 5 * 60 * 1000);
});

test("succès : compteur remis à zéro et verrou levé", () => {
  assert.deepEqual(onSuccess(NOW), {
    failures: 0,
    lockedUntil: null,
    lastFailureAt: null,
    lastSuccessAt: new Date(NOW).toISOString(),
  });
});

test("session : expiration après 3 minutes d'inactivité", () => {
  assert.equal(SESSION_TIMEOUT_MS, 3 * 60 * 1000);
  assert.equal(isSessionExpired(NOW, NOW + 179000), false);
  assert.equal(isSessionExpired(NOW, NOW + 180000), true);
  assert.equal(isSessionExpired(NaN, NOW), true, "activité inconnue → verrouillage");
});

test("arrière-plan : verrouillage au-delà de 30 s", () => {
  assert.equal(BACKGROUND_LOCK_MS, 30000);
  assert.equal(shouldLockOnResume(NOW, NOW + 29000), false);
  assert.equal(shouldLockOnResume(NOW, NOW + 30000), true);
  assert.equal(shouldLockOnResume(undefined, NOW), false, "jamais passé en arrière-plan");
});

test("durées lisibles et libellés de rôle", () => {
  assert.equal(formatDuration(45000), "45 s");
  assert.equal(formatDuration(60000), "1 min 00 s");
  assert.equal(formatDuration(5 * 60 * 1000), "5 min 00 s");
  assert.equal(formatDuration(-10), "0 s");
  assert.equal(roleLabel("gerant"), "Gérant");
  assert.equal(roleLabel("serveur"), "Serveur");
  assert.equal(roleLabel("inconnu"), "inconnu");
});
