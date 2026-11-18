"use strict";
// TC-M3-DB — authentification locale sur une VRAIE base SQLite (node:sqlite via
// le shim asynchrone) : cache du personnel, vérification bcrypt réelle,
// compteur d'échecs, blocage après 5 essais, journal local des connexions,
// et écriture du journal fiscal avec identifiant d'opération INJECTÉ.
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { openShim } = require("./db-shim");
const { MIGRATIONS, latestVersion } = require("../src/core/migrations");
const {
  saveStaff, listStaff, staffCount, authenticate, lockStatus,
  recordLockEvent, recentAuthEvents, verifyPin, DUMMY_HASH,
} = require("../src/db/auth");
const { appendEntry, readJournalStatus, assertChainIntact } = require("../src/db/journal");
const { verifyJournal } = require("../src/core/journal");
const { uuidv4FromBytes } = require("../src/core/uuid");

const NOW = Date.parse("2026-11-18T12:00:00.000Z");
// Coût 4 : hashs de test uniquement (le back-office produit du coût 10).
const fastHash = (pin) => bcrypt.hashSync(pin, 4);

async function freshDb() {
  const db = openShim();
  for (const m of MIGRATIONS) for (const s of m.statements) await db.execAsync(s);
  await db.execAsync(`PRAGMA user_version = ${latestVersion()}`);
  return db;
}

const DEMO = [
  { matricule: "MGR", nom: "Camille Gérant", role: "gerant", pinHash: fastHash("1234"), actif: 1, version: 1 },
  { matricule: "S07", nom: "Sofia Serveuse", role: "serveur", pinHash: fastHash("3456"), actif: 1, version: 1 },
  { matricule: "K01", nom: "Karim Cuisine", role: "cuisine", pinHash: fastHash("4567"), actif: 1, version: 1 },
];

function counter() {
  let n = 0;
  return () => {
    n += 1;
    return uuidv4FromBytes(Array.from({ length: 16 }, (_, i) => (n * 7 + i) & 0xff));
  };
}

test("migration 3 : tables du personnel et de l'authentification", async () => {
  const db = await freshDb();
  const tables = (await db.getAllAsync("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")).map((r) => r.name);
  for (const t of ["auth_events", "auth_state", "journal", "settings", "staff"]) assert.ok(tables.includes(t), t);
  assert.equal((await db.getFirstAsync("PRAGMA user_version")).user_version, 3);
  const cols = (await db.getAllAsync("PRAGMA table_info(staff)")).map((c) => c.name);
  assert.deepEqual(cols, ["matricule", "nom", "role", "pin_hash", "actif", "version", "synced_at"]);
});

test("hash factice anti-énumération : bcrypt coût 10, jamais un PIN connu", () => {
  assert.match(DUMMY_HASH, /^\$2[aby]\$10\$[./A-Za-z0-9]{53}$/);
  for (const pin of ["1234", "2345", "3456", "4567", "0000", "123456"]) {
    assert.equal(verifyPin(DUMMY_HASH, pin), false, pin);
  }
  const real = bcrypt.hashSync("1234", 10);
  assert.equal(verifyPin(real, "1234"), true);
  assert.equal(verifyPin(real, "1235"), false);
  assert.equal(verifyPin("pas-un-hash", "1234"), false, "hash corrompu → false, pas d'exception");
});

test("saveStaff : UPSERT (dernière version gagnante) et désactivation des absents", async () => {
  const db = await freshDb();
  const first = await saveStaff(db, DEMO.map((u) => ({ ...u, actif: true })));
  assert.equal(first.saved, 3);
  assert.equal(await staffCount(db), 3);

  // Le serveur renomme et change le PIN de MGR ; K01 disparaît du pull.
  const newPin = fastHash("9999");
  await saveStaff(db, [
    { matricule: "MGR", nom: "Camille Gérant-Remplaçant", role: "gerant", pinHash: newPin, actif: true, version: 2 },
    { matricule: "S07", nom: "Sofia Serveuse", role: "serveur", pinHash: fastHash("3456"), actif: true, version: 1 },
  ]);

  const list = await listStaff(db);
  const mgr = list.find((s) => s.matricule === "MGR");
  assert.equal(mgr.nom, "Camille Gérant-Remplaçant");
  assert.equal(mgr.actif, true);
  assert.equal(list.find((s) => s.matricule === "K01").actif, false, "absent du pull → désactivé, jamais supprimé");
  assert.equal(await staffCount(db), 2, "seuls les actifs sont comptés");

  const row = await db.getFirstAsync("SELECT pin_hash, version FROM staff WHERE matricule='MGR'");
  assert.equal(row.pin_hash, newPin);
  assert.equal(row.version, 2);
  // Le PIN en clair n'est JAMAIS stocké.
  assert.equal(row.pin_hash.includes("9999"), false);

  const events = await recentAuthEvents(db, 10);
  assert.equal(events.filter((e) => e.event === "staff_sync").length, 2);
});

test("connexion : PIN correct accepté, mauvais PIN refusé, compteur incrémenté", async () => {
  const db = await freshDb();
  await saveStaff(db, DEMO.map((u) => ({ ...u, actif: true })));

  const ok = await authenticate(db, { matricule: "s07", pin: "3456", now: NOW });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.user, { matricule: "S07", nom: "Sofia Serveuse", role: "serveur" });
  assert.equal("pin_hash" in ok.user, false);
  assert.equal("pinHash" in ok.user, false);

  const ko = await authenticate(db, { matricule: "S07", pin: "0000", now: NOW + 1000 });
  assert.equal(ko.ok, false);
  assert.equal(ko.code, "INVALID");
  assert.equal(ko.remaining, 4);
  assert.match(ko.message, /4 essai/);

  const state = await db.getFirstAsync("SELECT failures FROM auth_state WHERE matricule='S07'");
  assert.equal(state.failures, 1);

  const events = (await recentAuthEvents(db, 5)).filter((e) => e.event.startsWith("login_"));
  assert.deepEqual(events.map((e) => e.event).sort(), ["login_fail", "login_ok"]);
});

test("5 échecs : blocage 5 minutes, refus sans vérifier le PIN, puis réouverture", async () => {
  const db = await freshDb();
  await saveStaff(db, DEMO.map((u) => ({ ...u, actif: true })));

  const results = [];
  for (let i = 1; i <= 5; i += 1) {
    results.push(await authenticate(db, { matricule: "MGR", pin: "0000", now: NOW + i * 1000 }));
  }
  assert.deepEqual(results.map((r) => r.remaining), [4, 3, 2, 1, 0]);
  assert.equal(results[4].code, "LOCKED");
  assert.equal(results[4].retryAfterMs, 5 * 60 * 1000);
  assert.match(results[4].message, /Compte bloqué/);

  // Pendant le blocage : refus immédiat, même avec le BON PIN.
  const during = await authenticate(db, { matricule: "MGR", pin: "1234", now: NOW + 120000 });
  assert.equal(during.ok, false);
  assert.equal(during.code, "LOCKED");
  assert.equal(during.retryAfterMs, 185000, "blocage posé au 5ᵉ essai (NOW + 5 s) + 5 min");

  // Après expiration : le bon PIN passe et remet le compteur à zéro.
  const after = await authenticate(db, { matricule: "MGR", pin: "1234", now: NOW + 5 * 60 * 1000 + 5000 });
  assert.equal(after.ok, true);
  const state = await db.getFirstAsync("SELECT failures, locked_until FROM auth_state WHERE matricule='MGR'");
  assert.equal(state.failures, 0);
  assert.equal(state.locked_until, null);

  const events = await recentAuthEvents(db, 20);
  assert.equal(events.filter((e) => e.event === "lockout").length, 1);
  assert.equal(events.filter((e) => e.event === "login_ok").length, 1);
});

test("matricule inconnu : même coût bcrypt, échec compté sous ce matricule", async () => {
  const db = await freshDb();
  await saveStaff(db, DEMO.map((u) => ({ ...u, actif: true })));

  const res = await authenticate(db, { matricule: "ZZ9", pin: "1234", now: NOW });
  assert.equal(res.ok, false);
  assert.equal(res.code, "INVALID");
  assert.match(res.message, /Matricule ou PIN incorrect/);

  const row = await db.getFirstAsync("SELECT failures FROM auth_state WHERE matricule='ZZ9'");
  assert.equal(row.failures, 1, "l'échec est tracé (aucune révélation d'existence)");
  assert.equal((await db.getFirstAsync("SELECT COUNT(*) n FROM staff WHERE matricule='ZZ9'")).n, 0);
});

test("compte désactivé : connexion refusée même avec le bon PIN", async () => {
  const db = await freshDb();
  await saveStaff(db, [{ ...DEMO[1], actif: 0 }]);
  const res = await authenticate(db, { matricule: "S07", pin: "3456", now: NOW });
  assert.equal(res.ok, false);
  assert.equal(res.code, "INVALID");
});

test("validation d'entrée : matricule et PIN mal formés refusés avant tout accès", async () => {
  const db = await freshDb();
  await saveStaff(db, DEMO.map((u) => ({ ...u, actif: true })));
  const badMat = await authenticate(db, { matricule: "S 07", pin: "3456", now: NOW });
  assert.equal(badMat.code, "MATRICULE");
  const badPin = await authenticate(db, { matricule: "S07", pin: "12", now: NOW });
  assert.equal(badPin.code, "PIN");
  assert.equal((await db.getFirstAsync("SELECT COUNT(*) n FROM auth_state")).n, 0, "aucun état créé sur entrée invalide");
});

test("lockStatus : état de blocage lisible par l'écran", async () => {
  const db = await freshDb();
  await saveStaff(db, DEMO.map((u) => ({ ...u, actif: true })));
  assert.deepEqual(await lockStatus(db, "MGR", NOW), { locked: false, retryAfterMs: 0 });

  for (let i = 0; i < 5; i += 1) await authenticate(db, { matricule: "MGR", pin: "0000", now: NOW + i });
  const locked = await lockStatus(db, "MGR", NOW + 1000);
  assert.equal(locked.locked, true);
  assert.ok(locked.retryAfterMs > 0 && locked.retryAfterMs <= 5 * 60 * 1000);
  assert.equal((await lockStatus(db, "MGR", NOW + 6 * 60 * 1000)).locked, false);
});

test("verrouillages explicites : manual_lock / auto_lock dans le journal local", async () => {
  const db = await freshDb();
  await recordLockEvent(db, "s07", "manual_lock");
  await recordLockEvent(db, "S07", "auto_lock");
  const events = await recentAuthEvents(db, 5);
  assert.deepEqual(events.map((e) => e.event), ["auto_lock", "manual_lock"]);
  assert.deepEqual(events.map((e) => e.matricule), ["S07", "S07"]);
});

test("journal fiscal : écriture réelle avec uuidOp injecté + incident d'horloge", async () => {
  const db = await freshDb();
  const uuidOp = counter();
  const user = { matricule: "S07", nom: "Sofia Serveuse" };
  const T0 = "2026-11-18T12:00:00.000Z";

  const first = await appendEntry(db, {
    poste: "POSTE-01", type: "VENTE", user, data: { total: 12.5 }, now: T0, uuidOp,
  });
  assert.equal(first.entry.seq, 1);
  assert.equal(first.entry.ref, "POSTE-01-000001");
  assert.equal(first.clock.recul, false);

  // Horloge qui recule de 2 minutes : l'incident HORLOGE est écrit AVANT.
  const second = await appendEntry(db, {
    poste: "POSTE-01", type: "VENTE", user, data: { total: 8 }, now: "2026-11-18T11:58:00.000Z", uuidOp,
  });
  assert.equal(second.clock.recul, true);
  assert.deepEqual(second.entries.map((e) => e.type), ["HORLOGE", "VENTE"]);
  assert.equal(second.entry.seq, 3);

  const status = await readJournalStatus(db);
  assert.equal(status.count, 3);
  assert.equal(status.chain.ok, true);
  assert.equal(status.chain.lastSeq, 3);

  const rows = await db.getAllAsync("SELECT seq, type, ts_local, hash_prev, hash_self, payload FROM journal ORDER BY seq");
  assert.deepEqual(rows.map((r) => r.type), ["VENTE", "HORLOGE", "VENTE"]);
  // Le temps ne recule jamais dans la base.
  assert.equal(rows[2].ts_local, rows[1].ts_local, "gelé à l'horodatage connu le plus récent");
  assert.equal(verifyJournal(rows.map((r) => ({
    seq: Number(r.seq), hashPrev: r.hash_prev, hashSelf: r.hash_self, payload: JSON.parse(r.payload),
  }))).ok, true);

  const intact = await assertChainIntact(db);
  assert.equal(intact.count, 3);
});

test("journal fiscal : uuidOp manquant → refus explicite (aucune écriture)", async () => {
  const db = await freshDb();
  await assert.rejects(
    appendEntry(db, { poste: "POSTE-01", type: "VENTE", user: { matricule: "S07", nom: "Sofia" }, now: NOW }),
    (e) => e.code === "STORAGE" && /uuidOp/.test(e.message)
  );
  assert.equal((await db.getFirstAsync("SELECT COUNT(*) n FROM journal")).n, 0);
});
