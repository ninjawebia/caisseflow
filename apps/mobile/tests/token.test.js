"use strict";
// TC-M1-TOK — jeton d'appareil : format, normalisation, masquage (M1).
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { normalizeToken, isValidDeviceToken, maskToken } = require("../src/core/token");

const realToken = crypto.randomBytes(32).toString("base64url");

test("jeton réel du back-office accepté", () => {
  assert.equal(realToken.length, 43);
  assert.equal(isValidDeviceToken(realToken), true);
});

test("espaces et retours à la ligne retirés (copier-coller)", () => {
  const wrapped = `${realToken.slice(0, 20)}\n  ${realToken.slice(20)} `;
  assert.equal(normalizeToken(wrapped), realToken);
  assert.equal(isValidDeviceToken(wrapped), true);
});

test("jetons invalides refusés", () => {
  for (const bad of [
    "",
    "court",
    realToken.slice(0, 42),
    `${realToken}A`,
    `${realToken.slice(0, 42)}=`,
    `${realToken.slice(0, 42)}.`,
    "é".repeat(43),
    null,
    undefined,
    42,
  ]) {
    assert.equal(isValidDeviceToken(bad), false, `devrait refuser ${JSON.stringify(bad)}`);
  }
});

test("masquage : jamais le jeton complet", () => {
  const masked = maskToken(realToken);
  assert.equal(masked, `${realToken.slice(0, 4)}…${realToken.slice(-4)}`);
  assert.equal(masked.includes(realToken.slice(4, 20)), false);
});

test("masquage d'une entrée courte", () => {
  assert.equal(maskToken("abc"), "••••");
});
