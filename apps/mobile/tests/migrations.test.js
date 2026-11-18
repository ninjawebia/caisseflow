"use strict";
// TC-M1-MIG — planificateur de migrations SQLite (M1) : contiguïté, idempotence,
// refus d'une base écrite par une version plus récente de l'application.
const test = require("node:test");
const assert = require("node:assert/strict");
const { MIGRATIONS, latestVersion, planMigrations, assertMigrationSet } = require("../src/core/migrations");

test("inventaire cohérent et version courante", () => {
  assert.doesNotThrow(assertMigrationSet);
  assert.equal(latestVersion(), MIGRATIONS[MIGRATIONS.length - 1].version);
  assert.equal(MIGRATIONS[0].version, 1);
});

test("base neuve : toutes les migrations", () => {
  const plan = planMigrations(0);
  assert.equal(plan.length, MIGRATIONS.length);
  assert.deepEqual(plan.map((m) => m.version), [1]);
});

test("base à jour : aucune migration", () => {
  assert.deepEqual(planMigrations(latestVersion()), []);
});

test("base plus récente que l'application : refus explicite", () => {
  assert.throws(() => planMigrations(latestVersion() + 1), (e) => e.code === "STORAGE" && /plus récente/.test(e.message));
});

test("versions invalides refusées", () => {
  assert.throws(() => planMigrations(-1), (e) => e.code === "STORAGE");
  assert.throws(() => planMigrations("abc"), (e) => e.code === "STORAGE");
  assert.throws(() => planMigrations(null), (e) => e.code === "STORAGE");
});

test("migration 1 : socle réglages (table settings)", () => {
  const sql = MIGRATIONS[0].statements.join("\n");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS settings/);
  assert.match(sql, /device\.poste/);
  assert.doesNotMatch(sql, /\bjournal\b/i, "le journal fiscal arrive en M2, pas en M1");
});
