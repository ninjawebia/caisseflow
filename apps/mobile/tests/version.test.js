"use strict";
// TC-M1-VER — comparaison de versions (minAppVersion, SEC-2).
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseVersion, compareVersions, isBelowVersion } = require("../src/core/version");

test("analyse des versions", () => {
  assert.deepEqual(parseVersion("0.5.0"), [0, 5, 0]);
  assert.deepEqual(parseVersion(" 12.34.56 "), [12, 34, 56]);
  assert.equal(parseVersion("1.2"), null);
  assert.equal(parseVersion("1.2.3.4"), null);
  assert.equal(parseVersion("v1.2.3"), null);
  assert.equal(parseVersion(null), null);
});

test("comparaison numérique (pas lexicographique)", () => {
  assert.equal(compareVersions("0.4.0", "0.5.0"), -1);
  assert.equal(compareVersions("0.5.0", "0.4.0"), 1);
  assert.equal(compareVersions("0.5.0", "0.5.0"), 0);
  assert.equal(compareVersions("0.10.0", "0.9.0"), 1);
  assert.equal(compareVersions("1.0.0", "0.99.99"), 1);
});

test("versions invalides rejetées", () => {
  assert.throws(() => compareVersions("nope", "1.0.0"));
  assert.throws(() => compareVersions("1.0.0", null));
});

test("seuil minimum", () => {
  assert.equal(isBelowVersion("0.4.0", "0.5.0"), true);
  assert.equal(isBelowVersion("0.5.0", "0.5.0"), false);
  assert.equal(isBelowVersion("0.6.0", "0.5.0"), false);
});
