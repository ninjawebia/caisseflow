"use strict";
// TC-M4-DB — données de référence sur une VRAIE base SQLite (node:sqlite via le
// shim asynchrone) : migration 4, UPSERT, désactivation des absents pour les
// pulls complets, conservation des articles hors delta, compteurs, carte
// groupée, tables actives et métadonnées de synchronisation.
const test = require("node:test");
const assert = require("node:assert/strict");
const { openShim } = require("./db-shim");
const { MIGRATIONS, latestVersion } = require("../src/core/migrations");
const {
  saveReference, readReferenceCounts, readMenu, readTables,
  getLastPull, setLastPull, setLicence, readLicence,
} = require("../src/db/reference");
const { KEYS } = require("../src/db/settings");

const CAT_A = "11111111-1111-4111-8111-111111111111";
const CAT_B = "22222222-2222-4222-8222-222222222222";
const CAT_C = "33333333-3333-4333-8333-333333333333";
const ART_A = "44444444-4444-4444-8444-444444444444";
const ART_B = "55555555-5555-4555-8555-555555555555";
const ART_C = "66666666-6666-4666-8666-666666666666";
const T1 = "77777777-7777-4777-8777-777777777777";
const T2 = "88888888-8888-4888-8888-888888888888";
const T3 = "99999999-9999-4999-8999-999999999999";

async function freshDb() {
  const db = openShim();
  for (const m of MIGRATIONS) for (const s of m.statements) await db.execAsync(s);
  await db.execAsync(`PRAGMA user_version = ${latestVersion()}`);
  return db;
}

const cat = (id, nom, position, actif) => ({ id, nom, position, actif });
const article = (id, nom, catId, prix, extra = {}) => ({
  id, categorie_id: catId, nom, prix_ttc: prix, taux_tva: 10, actif: true, version: 1, ...extra,
});
const table = (id, nom, salle, places, actif = true) => ({ id, nom, salle, places, actif });

function firstPull() {
  return {
    categories: [cat(CAT_A, "Entrées", 1, true), cat(CAT_B, "Plats", 2, true)],
    articles: [
      article(ART_A, "Soupe", CAT_A, 7.5),
      article(ART_B, "Burger", CAT_B, 12.5),
    ],
    tables: [table(T1, "T1", "Salle", 4), table(T2, "T2", "Terrasse", 2)],
  };
}

test("migration 4 : tables de référence, contraintes de prix et de places", async () => {
  const db = await freshDb();
  const tables = (await db.getAllAsync("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")).map((r) => r.name);
  for (const t of ["articles", "categories", "tables_resto"]) assert.ok(tables.includes(t), t);
  assert.equal((await db.getFirstAsync("PRAGMA user_version")).user_version, latestVersion());

  // Prix en centimes ENTIERS : ni flottant, ni hors plafond.
  await assert.rejects(() => db.runAsync(
    `INSERT INTO articles (id, nom, prix_ttc_cents, taux_tva, version) VALUES (?,?,?,?,?)`,
    [ART_A, "Flottant", 12.5, 10, 1]
  ), /CHECK/);
  await assert.rejects(() => db.runAsync(
    `INSERT INTO articles (id, nom, prix_ttc_cents, taux_tva, version) VALUES (?,?,?,?,?)`,
    [ART_A, "Trop cher", 1000001, 10, 1]
  ), /CHECK/);
  await assert.rejects(() => db.runAsync(
    `INSERT INTO tables_resto (id, nom, places) VALUES (?,?,?)`, [T1, "T", 0]
  ), /CHECK/);
});

test("premier pull : catégories, articles, tables et compteurs", async () => {
  const db = await freshDb();
  const res = await saveReference(db, firstPull());
  assert.deepEqual(res.saved, { categories: 2, articles: 2, tables: 2 });
  assert.deepEqual(res.rejected, { categories: [], articles: [], tables: [] });

  assert.deepEqual(await readReferenceCounts(db), { categories: 2, articles: 2, tables: 2, users: 0 });
  const row = await db.getFirstAsync("SELECT prix_ttc_cents, taux_tva, actif FROM articles WHERE id=?", [ART_B]);
  assert.equal(row.prix_ttc_cents, 1250);
  assert.equal(row.taux_tva, 10);
  assert.equal(row.actif, 1);
});

test("pull complet : catégorie et table absentes désactivées, jamais supprimées", async () => {
  const db = await freshDb();
  await saveReference(db, firstPull());

  // CAT_B archivée côté serveur (donc absente du lot), T2 retirée du plan.
  await saveReference(db, {
    categories: [cat(CAT_A, "Entrées", 1, true)],
    articles: [],
    tables: [table(T1, "T1", "Salle", 4)],
  });

  const cats = await db.getAllAsync("SELECT id, actif FROM categories ORDER BY id");
  assert.equal(cats.length, 2, "aucune ligne supprimée");
  assert.equal(cats.find((c) => c.id === CAT_B).actif, 0);
  assert.equal(cats.find((c) => c.id === CAT_A).actif, 1);

  const tbl = await db.getAllAsync("SELECT id, actif FROM tables_resto ORDER BY id");
  assert.equal(tbl.find((t) => t.id === T2).actif, 0);
  assert.deepEqual(await readReferenceCounts(db), { categories: 1, articles: 2, tables: 1, users: 0 });
  assert.deepEqual((await readTables(db)).map((t) => t.nom), ["T1"]);
});

test("pull delta articles : un article absent du lot RESTE actif", async () => {
  const db = await freshDb();
  await saveReference(db, firstPull());

  // Delta : seul ART_B a changé (prix). ART_A n'est pas dans le lot.
  await saveReference(db, {
    categories: [cat(CAT_A, "Entrées", 1, true), cat(CAT_B, "Plats", 2, true)],
    articles: [article(ART_B, "Burger", CAT_B, 13.9, { version: 2 })],
    tables: [],
  });

  const a = await db.getFirstAsync("SELECT prix_ttc_cents, actif, version FROM articles WHERE id=?", [ART_A]);
  assert.equal(a.actif, 1, "un article inchangé n'est jamais désactivé par un delta");
  const b = await db.getFirstAsync("SELECT prix_ttc_cents, version, synced_at FROM articles WHERE id=?", [ART_B]);
  assert.equal(b.prix_ttc_cents, 1390);
  assert.equal(b.version, 2);
  assert.ok(b.synced_at);
  assert.deepEqual(await readReferenceCounts(db), { categories: 2, articles: 2, tables: 2, users: 0 });
});

test("article désactivé côté serveur : transmis explicitement en delta", async () => {
  const db = await freshDb();
  await saveReference(db, firstPull());
  await saveReference(db, {
    categories: [],
    articles: [article(ART_A, "Soupe", CAT_A, 7.5, { actif: false, version: 2 })],
    tables: [],
  });
  assert.equal((await db.getFirstAsync("SELECT actif FROM articles WHERE id=?", [ART_A])).actif, 0);
  assert.deepEqual(await readReferenceCounts(db), { categories: 2, articles: 1, tables: 2, users: 0 });
});

test("lignes invalides rejetées : les autres lignes du lot sont enregistrées", async () => {
  const db = await freshDb();
  const res = await saveReference(db, {
    categories: [cat(CAT_A, "Entrées", 1, true), { id: "pas-un-uuid", nom: "Zombie" }],
    articles: [
      article(ART_A, "Soupe", CAT_A, 7.5),
      article(ART_B, "Prix faux", CAT_A, -3),
      article(ART_C, "TVA fausse", CAT_A, 5, { taux_tva: 33.33 }),
    ],
    tables: [table(T1, "T1", "Salle", 4), { id: T2, nom: "Trop de places", places: 99 }],
  });
  assert.deepEqual(res.saved, { categories: 1, articles: 1, tables: 1 });
  assert.deepEqual(res.rejected.categories.map((r) => r.reason), ["id"]);
  assert.deepEqual(res.rejected.articles.map((r) => r.reason), ["prix", "tva"]);
  assert.deepEqual(res.rejected.tables.map((r) => r.reason), ["places"]);
  assert.equal((await db.getFirstAsync("SELECT COUNT(*) n FROM articles")).n, 1);
  assert.equal((await db.getFirstAsync("SELECT COUNT(*) n FROM articles WHERE nom='Prix faux'")).n, 0);
});

test("carte groupée : seules les catégories et articles actifs sont servis", async () => {
  const db = await freshDb();
  await saveReference(db, {
    categories: [cat(CAT_A, "Entrées", 2, true), cat(CAT_B, "Plats", 1, true), cat(CAT_C, "Archivée", 3, false)],
    articles: [
      article(ART_A, "Soupe", CAT_A, 7.5),
      article(ART_B, "Burger", CAT_B, 12.5),
      article(ART_C, "Plat du jour", CAT_A, 15, { actif: false }),
    ],
    tables: [],
  });

  const menu = await readMenu(db);
  assert.deepEqual(menu.map((g) => g.nom), ["Plats", "Entrées"]);
  assert.deepEqual(menu[1].articles.map((a) => a.nom), ["Soupe"]);
  assert.equal(menu[1].articles[0].prixTtcCents, 750);
  assert.equal(menu[1].articles[0].tauxTva, 10);
  assert.equal("actif" in menu[1].articles[0], true);
});

test("migration 6 : photo et style de catégorie/article persistés puis relus", async () => {
  const db = await freshDb();
  const cols = (await db.getAllAsync("PRAGMA table_info(categories)")).map((c) => c.name);
  for (const c of ["photo_hash", "photo_updated_at", "preset_forme", "preset_rayon", "preset_ombre"]) {
    assert.ok(cols.includes(c), `colonne ${c}`);
  }

  const presetCat = { forme: "carre", cadrage: "contain", ratio: "4:3", rayon: 8, ombre: true };
  const presetArt = { forme: "cercle", cadrage: "cover", ratio: "1:1", rayon: 64, ombre: false };
  await saveReference(db, {
    categories: [{
      id: CAT_A, nom: "Sandwich", position: 1, actif: true,
      photo_hash: "abc123", photo_updated_at: "2026-11-21T10:00:00.000Z", preset: presetCat,
    }],
    articles: [article(ART_A, "Chawarma", CAT_A, 10, { photo_hash: "def456", preset: presetArt })],
    tables: [],
  });

  const [group] = await readMenu(db);
  assert.equal(group.photoHash, "abc123");
  assert.deepEqual(group.preset, presetCat);
  assert.equal(group.articles[0].photoHash, "def456");
  assert.deepEqual(group.articles[0].preset, presetArt);

  // Repli : une ligne écrite sans style (ancienne version) reste affichable.
  await db.runAsync("UPDATE articles SET preset_forme = NULL, preset_rayon = NULL WHERE id = ?", [ART_A]);
  const [reloaded] = await readMenu(db);
  assert.deepEqual(reloaded.articles[0].preset,
    { forme: "arrondi", cadrage: "cover", ratio: "1:1", rayon: 12, ombre: false });
});

test("métadonnées : dernière synchro (heure serveur) et licence en cache", async () => {
  const db = await freshDb();
  assert.equal(await getLastPull(db), null, "aucun pull au premier démarrage");
  assert.equal(await readLicence(db), null);

  const serverTime = "2026-11-18T22:41:07.000Z";
  await setLastPull(db, serverTime);
  await setLicence(db, "grace1");
  assert.equal(await getLastPull(db), serverTime);
  assert.equal(await readLicence(db), "grace1");
  assert.equal((await db.getFirstAsync("SELECT value FROM settings WHERE key=?", [KEYS.lastPullAt])).value, serverTime);

  // Mise à jour : une seule ligne de réglage par clé.
  await setLastPull(db, "2026-11-19T08:00:00.000Z");
  assert.equal((await db.getFirstAsync("SELECT COUNT(*) n FROM settings WHERE key=?", [KEYS.lastPullAt])).n, 1);
  assert.equal(await getLastPull(db), "2026-11-19T08:00:00.000Z");
});

test("compteurs : le personnel actif entre dans les compteurs de l'accueil", async () => {
  const db = await freshDb();
  const bcrypt = require("bcryptjs");
  const { saveStaff } = require("../src/db/auth");
  await saveStaff(db, [
    { matricule: "MGR", nom: "Camille", role: "gerant", pinHash: bcrypt.hashSync("1234", 4), actif: true },
    { matricule: "S07", nom: "Sofia", role: "serveur", pinHash: bcrypt.hashSync("3456", 4), actif: true },
  ]);
  assert.equal((await readReferenceCounts(db)).users, 2);
});
