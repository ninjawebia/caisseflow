"use strict";
// TC-M2-JRN — journal fiscal : construction, numérotation, garde d'horloge,
// chaînage, refus des écritures anonymes (FISC-1..4, FISC-7).
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  TYPES, MOTIF_REQUIRED, entryRef, buildEntry, guardTimestamp, checkClockSkew,
  verifyJournal, GENESIS_ANCHOR, nextHash,
} = require("../src/core/journal");
const { uuidv4FromBytes, isValidUuid } = require("../src/core/uuid");

const UUID = "3f2b8c1e-9d4a-4c7b-8e21-5a6f0b9c2d13";
const USER = { matricule: "S08", nom: "Sarah Martin" };
const base = {
  poste: "POSTE-01",
  seq: 1,
  hashPrev: GENESIS_ANCHOR,
  type: "VENTE",
  ts: "2026-11-18T12:00:00.000Z",
  user: USER,
  uuidOp: UUID,
  data: { total: 12.5 },
};

test("types d'événements conformes au PRD et au CHECK SQL", () => {
  assert.deepEqual(TYPES, [
    "VENTE", "PAIEMENT", "TICKET", "ANNULATION", "REMISE", "CHANGEMENT_PRIX",
    "SESSION", "HORLOGE", "CLOTURE_Z", "IMPRESSION",
  ]);
  assert.deepEqual(MOTIF_REQUIRED, ["ANNULATION", "REMISE", "CHANGEMENT_PRIX"]);
});

test("numérotation POSTE-XX-000001 continue (sans troncature)", () => {
  assert.equal(entryRef("POSTE-01", 1), "POSTE-01-000001");
  assert.equal(entryRef("POSTE-12", 42), "POSTE-12-000042");
  assert.equal(entryRef("POSTE-99", 999999), "POSTE-99-999999");
  assert.equal(entryRef("POSTE-01", 1000000), "POSTE-01-1000000");
  assert.throws(() => entryRef("POSTE-1", 1), /Poste invalide/);
  assert.throws(() => entryRef("POSTE-01", 0), /Séquence invalide/);
  assert.throws(() => entryRef("POSTE-01", 1.5), /Séquence invalide/);
});

test("écriture complète : hash calculé sur un payload auto-porteur", () => {
  const e = buildEntry(base);
  assert.equal(e.ref, "POSTE-01-000001");
  assert.equal(e.tsLocal, "2026-11-18T12:00:00.000Z");
  assert.equal(e.hashPrev, GENESIS_ANCHOR);
  assert.equal(e.hashSelf, nextHash(GENESIS_ANCHOR, e.payload));
  assert.deepEqual(e.payload.user, { matricule: "S08", nom: "Sarah Martin" });
  assert.equal(e.payload.type, "VENTE");
  assert.equal(e.payload.poste, "POSTE-01");
  assert.equal(e.payload.ref, "POSTE-01-000001");
  assert.deepEqual(e.payload.data, { total: 12.5 });
  assert.equal(e.validatorMatricule, null);
  assert.equal(e.motif, null);
  assert.equal(isValidUuid(e.uuidOp), true);
});

test("écriture anonyme refusée (FISC-3)", () => {
  assert.throws(() => buildEntry({ ...base, user: { nom: "Sans Matricule" } }), /anonyme/);
  assert.throws(() => buildEntry({ ...base, user: { matricule: "S08" } }), /anonyme/);
  assert.throws(() => buildEntry({ ...base, user: { matricule: "  ", nom: "X Y" } }), /anonyme/);
});

test("types et paramètres invalides refusés", () => {
  assert.throws(() => buildEntry({ ...base, type: "INCONNU" }), /Type d'événement inconnu/);
  assert.throws(() => buildEntry({ ...base, hashPrev: "trop-court" }), /hash_precedent invalide/);
  assert.throws(() => buildEntry({ ...base, ts: "hier" }), /Horodatage invalide/);
  assert.throws(() => buildEntry({ ...base, uuidOp: "pas-un-uuid" }), /UUID v4/);
  assert.throws(() => buildEntry({ ...base, data: [1, 2] }), /Données d'événement invalides/);
  assert.throws(() => buildEntry({ ...base, seq: 0 }), /Séquence invalide/);
});

test("motif et second obligatoires pour annulation / remise / changement de prix", () => {
  for (const type of MOTIF_REQUIRED) {
    assert.throws(() => buildEntry({ ...base, type }), /Motif obligatoire/, `${type} sans motif`);
    assert.throws(() => buildEntry({ ...base, type, motif: "erreur serveur" }), /second obligatoire/, `${type} sans validateur`);
  }
  const e = buildEntry({ ...base, type: "ANNULATION", motif: "erreur serveur", validator: "MGR" });
  assert.equal(e.motif, "erreur serveur");
  assert.equal(e.validatorMatricule, "MGR");
  assert.equal(e.payload.validator, "MGR");
});

test("garde monotone : l'horloge ne recule jamais (FISC-4)", () => {
  const t0 = "2026-11-18T12:00:00.000Z";
  assert.deepEqual(guardTimestamp(t0, "2026-11-18T12:00:05.000Z"), {
    ts: "2026-11-18T12:00:05.000Z", recul: false, adjusted: false, deltaMs: 0,
  });

  const back = guardTimestamp(t0, "2026-11-18T11:59:00.000Z");
  assert.equal(back.ts, t0, "horodatage conservé au dernier connu");
  assert.equal(back.recul, true);
  assert.equal(back.deltaMs, -60000);

  const same = guardTimestamp(t0, t0);
  assert.equal(same.ts, "2026-11-18T12:00:00.001Z", "même instant → +1 ms (ordre préservé)");
  assert.equal(same.adjusted, true);
  assert.equal(same.recul, false);

  assert.equal(guardTimestamp(null, t0).ts, t0);
  assert.throws(() => guardTimestamp(t0, "n'importe quoi"), /Horodatage invalide/);
});

test("contrôle d'écart serveur : seuil 60 s (FISC-4)", () => {
  const local = Date.parse("2026-11-18T12:00:00.000Z");
  assert.equal(checkClockSkew(local, local + 59000).exceeds, false);
  const retard = checkClockSkew(local, local + 61000);
  assert.equal(retard.exceeds, true);
  assert.equal(retard.direction, "retard");
  assert.equal(retard.skewMs, 61000);
  const avance = checkClockSkew(local, local - 61000);
  assert.equal(avance.direction, "avance");
  assert.equal(checkClockSkew(local, local).direction, "ok");
});

test("chaîne construite par buildEntry : vérifiée, puis rupture détectée", () => {
  let prev = GENESIS_ANCHOR;
  const entries = [];
  for (let seq = 1; seq <= 4; seq += 1) {
    const e = buildEntry({ ...base, seq, hashPrev: prev, uuidOp: uuidv4FromBytes(Array.from({ length: 16 }, (_, i) => seq + i)) });
    entries.push({ seq: e.seq, hashPrev: e.hashPrev, hashSelf: e.hashSelf, payload: e.payload });
    prev = e.hashSelf;
  }
  assert.equal(verifyJournal(entries).ok, true);
  assert.equal(verifyJournal(entries).lastSeq, 4);

  const altered = entries.map((e, i) => (i === 2 ? { ...e, payload: { ...e.payload, data: { total: 999 } } } : e));
  const res = verifyJournal(altered);
  assert.equal(res.ok, false);
  assert.equal(res.brokenSeq, 3);

  const gap = [entries[0], entries[2], entries[3]];
  assert.equal(verifyJournal(gap).reason, "seq_non_continue");
});

test("UUID v4 : bits de version/variante posés, format validé", () => {
  const id = uuidv4FromBytes([...Array(16).keys()]);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(isValidUuid(id), true);
  assert.equal(isValidUuid("6f1c0e7a-0000-1000-8000-000000000000"), false, "version 1 refusée");
  assert.throws(() => uuidv4FromBytes([1, 2, 3]), /16 octets/);
});
