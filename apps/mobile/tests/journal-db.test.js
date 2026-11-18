"use strict";
// TC-M2-DB — journal fiscal sur une VRAIE base SQLite (node:sqlite, mémoire) :
// migrations réelles, triggers append-only, continuité de séquence, CHECK de
// type/hash, relecture et vérification du chaînage. C'est la preuve exécutable
// que « aucune UPDATE/DELETE n'est possible », pas seulement une intention.
const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { MIGRATIONS, latestVersion } = require("../src/core/migrations");
const { buildEntry, GENESIS_ANCHOR, verifyJournal } = require("../src/core/journal");
const { canonical } = require("../src/core/hash");
const { INSERT_SQL, insertArgs, rowToEntry, SELECT_ALL_SQL } = require("../src/db/journal-sql");

const UUID1 = "3f2b8c1e-9d4a-4c7b-8e21-5a6f0b9c2d13";
const UUID2 = "8a1d4e2f-6b3c-4f5a-9d7e-2c8b1a0f3e56";
const USER = { matricule: "MGR", nom: "Nadia Chef" };

function migrate() {
  const db = new DatabaseSync(":memory:");
  for (const m of MIGRATIONS) for (const s of m.statements) db.exec(s);
  db.exec(`PRAGMA user_version = ${MIGRATIONS[MIGRATIONS.length - 1].version}`);
  return db;
}

function makeEntry(seq, hashPrev, overrides = {}) {
  return buildEntry({
    poste: "POSTE-01",
    seq,
    hashPrev,
    type: "VENTE",
    ts: `2026-11-18T12:00:0${seq}.000Z`,
    user: USER,
    uuidOp: seq === 1 ? UUID1 : UUID2,
    data: { total: 10 + seq },
    ...overrides,
  });
}

function insert(db, entry) {
  db.prepare(INSERT_SQL).run(...insertArgs(entry));
}

test("migrations : tables attendues et user_version à jour", () => {
  const db = migrate();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name);
  assert.ok(tables.includes("settings"));
  assert.ok(tables.includes("journal"));
  assert.equal(db.prepare("PRAGMA user_version").get().user_version, latestVersion());
  const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all().map((r) => r.name);
  for (const t of ["journal_seq_continue", "journal_no_update", "journal_no_delete"]) assert.ok(triggers.includes(t), t);
});

test("insertion + relecture : payload stocké canonique, chaîne vérifiée", () => {
  const db = migrate();
  const e1 = makeEntry(1, GENESIS_ANCHOR);
  const e2 = makeEntry(2, e1.hashSelf, { uuidOp: UUID2 });
  insert(db, e1);
  insert(db, e2);

  const rows = db.prepare(SELECT_ALL_SQL).all();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].ref, "POSTE-01-000001");
  assert.equal(rows[0].payload, canonical(e1.payload));
  assert.equal(rows[1].ref, "POSTE-01-000002");

  const status = verifyJournal(rows.map(rowToEntry));
  assert.equal(status.ok, true);
  assert.equal(status.lastSeq, 2);
});

test("UPDATE interdit par trigger (y compris SQL direct)", () => {
  const db = migrate();
  insert(db, makeEntry(1, GENESIS_ANCHOR));
  assert.throws(() => db.exec("UPDATE journal SET motif = 'falsifié'"), /UPDATE interdit/);
  assert.throws(() => db.exec("UPDATE journal SET hash_self = '" + "a".repeat(64) + "'"), /UPDATE interdit/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM journal").get().n, 1);
});

test("DELETE interdit par trigger (y compris SQL direct)", () => {
  const db = migrate();
  insert(db, makeEntry(1, GENESIS_ANCHOR));
  assert.throws(() => db.exec("DELETE FROM journal"), /DELETE interdit/);
  assert.throws(() => db.exec("DELETE FROM journal WHERE seq = 1"), /DELETE interdit/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM journal").get().n, 1);
});

test("séquence continue : un saut est refusé", () => {
  const db = migrate();
  insert(db, makeEntry(1, GENESIS_ANCHOR));
  const e3 = makeEntry(3, makeEntry(2, GENESIS_ANCHOR).hashSelf, { uuidOp: UUID2 });
  assert.throws(() => insert(db, e3), /séquence non continue/);
  // Rejouer la séquence 1 est aussi refusé (clé primaire + continuité).
  assert.throws(() => insert(db, makeEntry(1, GENESIS_ANCHOR, { uuidOp: UUID2 })));
});

test("CHECK : type inconnu, hash mal formé, écriture anonyme refusés", () => {
  const db = migrate();
  const good = makeEntry(1, GENESIS_ANCHOR);

  assert.throws(() => insert(db, { ...good, type: "INCONNU" }), /CHECK constraint failed/);
  assert.throws(() => insert(db, { ...good, hashSelf: "abc" }), /CHECK constraint failed/);
  assert.throws(() => insert(db, { ...good, hashPrev: "G".repeat(64) }), /CHECK constraint failed/);
  assert.throws(() => insert(db, { ...good, userNom: "   " }), /CHECK constraint failed/);
  assert.throws(() => insert(db, { ...good, userMatricule: "" }), /CHECK constraint failed/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM journal").get().n, 0);
});

test("unicité : même UUID d'opération rejoué → refus (idempotence côté serveur)", () => {
  const db = migrate();
  insert(db, makeEntry(1, GENESIS_ANCHOR));
  assert.throws(() => insert(db, makeEntry(2, GENESIS_ANCHOR, { uuidOp: UUID1 })), /UNIQUE constraint failed/);
});

test("altération impossible à dissimuler : la relecture détecte une incohérence de hash", () => {
  // On ne peut pas modifier une ligne (triggers) : on vérifie que la
  // vérification détecte bien une base forgée hors application.
  const db = migrate();
  const e1 = makeEntry(1, GENESIS_ANCHOR);
  insert(db, e1);
  // Écriture forgée hors application : hash_prev bidon (la vraie app utilise
  // toujours le hash courant de la tête de chaîne).
  insert(db, makeEntry(2, "f".repeat(64), { uuidOp: UUID2 }));
  const res = verifyJournal(db.prepare(SELECT_ALL_SQL).all().map(rowToEntry));
  assert.equal(res.ok, false);
  assert.equal(res.brokenSeq, 2);
  assert.equal(res.reason, "hash_prev_mismatch");
});
