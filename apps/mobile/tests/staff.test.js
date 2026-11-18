"use strict";
// TC-M3-STAFF — validation du personnel reçu par le pull et mappings SQL
// (aucune ligne douteuse ne doit entrer dans le cache local).
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { normalizeStaffRows, publicStaff, ROLES, BCRYPT_RE } = require("../src/core/staff");
const S = require("../src/db/staff-sql");

// Coût 4 volontairement bas : ces hashs ne servent qu'aux tests de validation.
const hash = bcrypt.hashSync("1234", 4);

test("hash bcrypt réel accepté, variantes refusées", () => {
  assert.equal(BCRYPT_RE.test(hash), true);
  assert.equal(BCRYPT_RE.test(bcrypt.hashSync("123456", 4)), true);
  for (const bad of ["1234", "", "$2b$10$tropcourt", "$1a$10$" + "a".repeat(53), `${hash}x`]) {
    assert.equal(BCRYPT_RE.test(bad), false, bad);
  }
});

test("lignes valides : normalisation matricule, actif, version", () => {
  const { rows, rejected } = normalizeStaffRows([
    { matricule: " mgr ", nom: "Camille Gérant", role: "gerant", pinHash: hash, actif: true },
    { matricule: "s07", nom: "Sofia Serveuse", role: "serveur", pinHash: hash, version: 3 },
  ]);
  assert.equal(rejected.length, 0);
  assert.deepEqual(rows[0], { matricule: "MGR", nom: "Camille Gérant", role: "gerant", pinHash: hash, actif: 1, version: 1 });
  assert.deepEqual(rows[1], { matricule: "S07", nom: "Sofia Serveuse", role: "serveur", pinHash: hash, actif: 1, version: 3 });
});

test("désactivation transmise par le serveur", () => {
  const { rows } = normalizeStaffRows([{ matricule: "K01", nom: "Karim Cuisine", role: "cuisine", pinHash: hash, actif: false }]);
  assert.equal(rows[0].actif, 0);
});

test("lignes invalides rejetées avec un motif, sans casser le lot", () => {
  const { rows, rejected } = normalizeStaffRows([
    { matricule: "", nom: "Sans Matricule", role: "serveur", pinHash: hash },
    { matricule: "TROP-LONG-99", nom: "Trop Long", role: "serveur", pinHash: hash },
    { matricule: "S01", nom: "N", role: "serveur", pinHash: hash },
    { matricule: "S02", nom: "Nom Valide", role: "inconnu", pinHash: hash },
    { matricule: "S03", nom: "Nom Valide", role: "serveur", pinHash: "pas-un-hash" },
    { matricule: "S04", nom: "Nom Valide", role: "serveur", pinHash: hash },
    { matricule: "s04", nom: "Doublon", role: "serveur", pinHash: hash },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].matricule, "S04");
  assert.deepEqual(rejected.map((r) => r.reason), ["matricule", "matricule", "nom", "role", "pin_hash", "doublon"]);
});

test("entrée non tableau : lot vide, pas d'exception", () => {
  for (const bad of [null, undefined, {}, "MGR", 42]) {
    assert.deepEqual(normalizeStaffRows(bad), { rows: [], rejected: [] });
  }
});

test("rôles autorisés = ceux du back-office", () => {
  assert.deepEqual(ROLES, ["gerant", "second", "serveur", "cuisine"]);
});

test("vue publique : jamais le hash du PIN", () => {
  const pub = publicStaff({ matricule: "MGR", nom: "Camille", role: "gerant", pin_hash: hash, actif: 1 });
  assert.deepEqual(pub, { matricule: "MGR", nom: "Camille", role: "gerant", actif: true });
  assert.equal("pin_hash" in pub, false);
  assert.equal("pinHash" in pub, false);
});

test("SQL : UPSERT personnel + désactivation des absents", () => {
  assert.match(S.UPSERT_STAFF_SQL, /ON CONFLICT\(matricule\) DO UPDATE SET/);
  assert.match(S.UPSERT_STAFF_SQL, /pin_hash = excluded\.pin_hash/);
  assert.match(S.UPSERT_STAFF_SQL, /actif = excluded\.actif/);
  assert.deepEqual(S.upsertStaffArgs({ matricule: "MGR", nom: "C", role: "gerant", pinHash: hash, actif: 1, version: 2 }),
    ["MGR", "C", "gerant", hash, 1, 2]);
  assert.equal(S.deactivateMissingSql(2), "UPDATE staff SET actif = 0 WHERE matricule NOT IN (?,?)");
  assert.equal(S.deactivateMissingSql(0), "UPDATE staff SET actif = 0 WHERE matricule NOT IN ()");
});

test("SQL : état d'authentification et journal local des connexions", () => {
  assert.match(S.UPSERT_STATE_SQL, /ON CONFLICT\(matricule\) DO UPDATE SET/);
  assert.match(S.SELECT_STATE_SQL, /FROM auth_state WHERE matricule = \?/);
  assert.match(S.INSERT_AUTH_EVENT_SQL, /INSERT INTO auth_events/);
  assert.match(S.SELECT_AUTH_EVENTS_SQL, /ORDER BY id DESC LIMIT \?/);
});
