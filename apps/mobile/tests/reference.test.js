"use strict";
// TC-M4-REF — validation des données de référence reçues par le pull (SYNC-3)
// et mise en forme de la carte. Pur : aucune base, aucun module natif.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  NOM_MAX, SALLE_MAX,
  normalizeCategory, normalizeArticle, normalizeTable,
  normalizeReference, groupMenu, formatSyncDate,
} = require("../src/core/reference");
const { MAX_CENTS, toCents, fromCents, formatEuros, sumLines } = require("../src/core/money");
const S = require("../src/db/reference-sql");

const CAT = "11111111-1111-4111-8111-111111111111";
const CAT2 = "22222222-2222-4222-8222-222222222222";
const ART = "33333333-3333-4333-8333-333333333333";
const ART2 = "44444444-4444-4444-8444-444444444444";
const TABLE = "55555555-5555-4555-8555-555555555555";

// --- Montants -------------------------------------------------------------
test("montants : conversion exacte en centimes entiers", () => {
  assert.equal(toCents(12.5), 1250);
  assert.equal(toCents("0.07"), 7);
  assert.equal(toCents(0), 0);
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents(MAX_CENTS / 100), MAX_CENTS);
  assert.equal(fromCents(1250), 12.5);
});

test("montants : refus des valeurs non finies ou hors bornes", () => {
  for (const bad of [NaN, Infinity, -1, 10000.01, "abc", null, undefined]) {
    assert.throws(() => toCents(bad), /Montant/, String(bad));
  }
  assert.throws(() => fromCents(12.5), /entier/);
});

test("montants : affichage français sans dépendre d'Intl", () => {
  assert.equal(formatEuros(1250), "12,50\u00A0€");
  assert.equal(formatEuros(123456), "1\u00A0234,56\u00A0€");
  assert.equal(formatEuros(0), "0,00\u00A0€");
  assert.equal(formatEuros(-1250), "-12,50\u00A0€");
  assert.equal(formatEuros(NaN), "—");
});

test("montants : somme de lignes en centimes (aucun flottant)", () => {
  assert.equal(sumLines([
    { prix_ttc_cents: 1250, qte: 2 },
    { prix_ttc_cents: 350, qte: 3 },
  ]), 3550);
  assert.equal(sumLines([]), 0);
  assert.equal(sumLines(null), 0);
  assert.throws(() => sumLines([{ prix_ttc_cents: 100, qte: 0 }]), /Quantité/);
  assert.throws(() => sumLines([{ prix_ttc_cents: 10.5, qte: 1 }]), /Prix/);
});

// --- Catégories -----------------------------------------------------------
test("catégorie valide : normalisée, actif explicite", () => {
  assert.deepEqual(normalizeCategory({ id: CAT, nom: "  Entrées  ", position: 2, actif: true }),
    {
      id: CAT, nom: "Entrées", position: 2, actif: 1,
      photoHash: null, photoUpdatedAt: null,
      preset: { forme: "arrondi", cadrage: "cover", ratio: "1:1", rayon: 12, ombre: false },
    });
  assert.deepEqual(normalizeCategory({ id: CAT, nom: "Entrées", actif: 0 }),
    {
      id: CAT, nom: "Entrées", position: 0, actif: 0,
      photoHash: null, photoUpdatedAt: null,
      preset: { forme: "arrondi", cadrage: "cover", ratio: "1:1", rayon: 12, ombre: false },
    });
});

test("catégorie invalide : motif explicite", () => {
  assert.equal(normalizeCategory(null).reason, "ligne");
  assert.equal(normalizeCategory({ id: "pas-un-uuid", nom: "X" }).reason, "id");
  assert.equal(normalizeCategory({ id: CAT, nom: "   " }).reason, "nom");
  assert.equal(normalizeCategory({ id: CAT, nom: "X".repeat(NOM_MAX + 20) }).nom.length, NOM_MAX);
  assert.equal(normalizeCategory({ id: CAT, nom: "X", position: -1 }).reason, "position");
  assert.equal(normalizeCategory({ id: CAT, nom: "X", position: 1.5 }).reason, "position");
});

// --- Articles -------------------------------------------------------------
test("article valide : prix en centimes, TVA à une décimale", () => {
  assert.deepEqual(normalizeArticle({
    id: ART, categorie_id: CAT, nom: "Burger", prix_ttc: 12.5, taux_tva: 10,
    actif: true, version: 3, photo_hash: "abc", updated_at: "2026-11-18T10:00:00.000Z",
  }), {
    id: ART, categorieId: CAT, nom: "Burger", prixTtcCents: 1250, tauxTva: 10,
    actif: 1, version: 3, photoHash: "abc", updatedAt: "2026-11-18T10:00:00.000Z",
    preset: { forme: "arrondi", cadrage: "cover", ratio: "1:1", rayon: 12, ombre: false },
  });
  // Sans catégorie (article orphelin) : accepté.
  assert.equal(normalizeArticle({ id: ART, nom: "Eau", prix_ttc: 2, taux_tva: 5.5, version: 1 }).categorieId, null);
});

test("article invalide : motif explicite, jamais inséré au mieux", () => {
  const base = { id: ART, nom: "Burger", prix_ttc: 10, taux_tva: 10, version: 1 };
  assert.equal(normalizeArticle({ ...base, id: "x" }).reason, "id");
  assert.equal(normalizeArticle({ ...base, nom: "" }).reason, "nom");
  assert.equal(normalizeArticle({ ...base, categorie_id: "pas-un-uuid" }).reason, "categorie_id");
  assert.equal(normalizeArticle({ ...base, prix_ttc: -2 }).reason, "prix");
  assert.equal(normalizeArticle({ ...base, prix_ttc: 10001 }).reason, "prix");
  assert.equal(normalizeArticle({ ...base, taux_tva: 101 }).reason, "tva");
  assert.equal(normalizeArticle({ ...base, taux_tva: 10.25 }).reason, "tva");
  assert.equal(normalizeArticle({ ...base, version: 0 }).reason, "version");
  assert.equal(normalizeArticle({ ...base, version: "3" }).reason, "version");
  // Date illisible : on garde la ligne, curseur delta à null (jamais de date inventée).
  assert.equal(normalizeArticle({ ...base, updated_at: "hier" }).updatedAt, null);
});

// --- Tables ---------------------------------------------------------------
test("table valide / invalide", () => {
  assert.deepEqual(normalizeTable({ id: TABLE, nom: "T1", salle: "Terrasse", places: 4, actif: true }),
    { id: TABLE, nom: "T1", salle: "Terrasse", places: 4, actif: 1 });
  assert.deepEqual(normalizeTable({ id: TABLE, nom: "T1", places: 2 }),
    { id: TABLE, nom: "T1", salle: "Salle 1", places: 2, actif: 1 });
  assert.equal(normalizeTable({ id: TABLE, nom: "T1", places: 0 }).reason, "places");
  assert.equal(normalizeTable({ id: TABLE, nom: "T1", places: 21 }).reason, "places");
  assert.equal(normalizeTable({ id: TABLE, nom: "T1", places: 2.5 }).reason, "places");
  assert.equal(normalizeTable({ id: TABLE, nom: "T1", places: 2, salle: "S".repeat(200) }).salle.length, SALLE_MAX);
});

// --- Lot complet ----------------------------------------------------------
test("lot : doublons d'identifiant rejetés, les autres lignes passent", () => {
  const res = normalizeReference({
    categories: [
      { id: CAT, nom: "Entrées", position: 1 },
      { id: CAT, nom: "Entrées bis", position: 2 },
      { id: "x", nom: "Invalide" },
    ],
    articles: [{ id: ART, nom: "Burger", prix_ttc: 10, taux_tva: 10, version: 1 }],
    tables: [{ id: TABLE, nom: "T1", places: 4 }],
  });
  assert.equal(res.categories.length, 1);
  assert.deepEqual(res.rejected.categories.map((r) => r.reason), ["doublon", "id"]);
  assert.equal(res.articles.length, 1);
  assert.equal(res.tables.length, 1);
  assert.deepEqual(res.rejected.articles, []);
});

test("lot : entrée absente ou non tableau → aucun rejet, aucun crash", () => {
  for (const bad of [null, undefined, {}, "x", 42]) {
    assert.deepEqual(normalizeReference(bad), {
      categories: [], articles: [], tables: [],
      rejected: { categories: [], articles: [], tables: [] },
    });
  }
});

// --- Carte groupée --------------------------------------------------------
function art(id, nom, cat, actif = 1) {
  return { id, categorieId: cat, nom, prixTtcCents: 1000, tauxTva: 10, actif, version: 1 };
}

test("carte : catégories ordonnées, articles triés, inactifs masqués", () => {
  const groups = groupMenu(
    [
      { id: CAT2, nom: "Desserts", position: 2, actif: 1 },
      { id: CAT, nom: "Entrées", position: 1, actif: 1 },
      { id: "66666666-6666-4666-8666-666666666666", nom: "Archivée", position: 0, actif: 0 },
    ],
    [
      art(ART2, "Zeste", CAT),
      art(ART, "Avocat", CAT),
      art("77777777-7777-4777-8777-777777777777", "Caché", CAT, 0),
      art("88888888-8888-4888-8888-888888888888", "Sans famille", null),
    ]
  );
  assert.deepEqual(groups.map((g) => g.nom), ["Entrées", "Desserts", "Sans catégorie"]);
  assert.deepEqual(groups[0].articles.map((a) => a.nom), ["Avocat", "Zeste"]);
  assert.deepEqual(groups[2].articles.map((a) => a.nom), ["Sans famille"]);
});

test("carte : article dont la catégorie est inactive → « Sans catégorie »", () => {
  const groups = groupMenu(
    [{ id: CAT, nom: "Archivée", position: 1, actif: 0 }],
    [art(ART, "Burger", CAT)]
  );
  assert.deepEqual(groups.map((g) => g.nom), ["Sans catégorie"]);
});

test("carte : photo et style de catégorie transmis au rendu (et repli)", () => {
  const groups = groupMenu(
    [
      {
        id: CAT, nom: "Sandwich", position: 1, actif: 1, photoHash: "abc123",
        preset: { forme: "carre", cadrage: "cover", ratio: "4:3", rayon: 8, ombre: true },
      },
    ],
    [{
      ...art(ART, "Chawarma", CAT),
      photoHash: "def456",
      preset: { forme: "cercle", cadrage: "contain", ratio: "1:1", rayon: 40, ombre: false },
    }]
  );
  assert.equal(groups[0].photoHash, "abc123");
  assert.deepEqual(groups[0].preset, { forme: "carre", cadrage: "cover", ratio: "4:3", rayon: 8, ombre: true });
  assert.equal(groups[0].articles[0].photoHash, "def456");
  assert.equal(groups[0].articles[0].preset.forme, "cercle");

  // Une catégorie sans style explicite reçoit le défaut du menu, jamais null.
  const plain = groupMenu([{ id: CAT2, nom: "Plats", position: 2, actif: 1 }], []);
  assert.deepEqual(plain[0].preset, { forme: "arrondi", cadrage: "cover", ratio: "1:1", rayon: 12, ombre: false });
  assert.equal(plain[0].photoHash, null);
});

test("carte vide : aucun groupe, aucune exception", () => {
  assert.deepEqual(groupMenu(null, null), []);
  assert.deepEqual(groupMenu([], []), []);
});

// --- Horodatage -----------------------------------------------------------
test("dernière synchro : format français lisible", () => {
  assert.equal(formatSyncDate(null), "jamais");
  assert.equal(formatSyncDate(""), "jamais");
  assert.equal(formatSyncDate("hier"), "date inconnue");
  const local = new Date(2026, 10, 18, 9, 5, 0);
  assert.equal(formatSyncDate(local.toISOString()), "18/11/2026 à 09:05");
});

// --- SQL ------------------------------------------------------------------
test("SQL : UPSERT catégories/articles/tables et désactivation des absents", () => {
  assert.match(S.UPSERT_CATEGORY_SQL, /ON CONFLICT\(id\) DO UPDATE SET/);
  assert.match(S.UPSERT_ARTICLE_SQL, /prix_ttc_cents = excluded\.prix_ttc_cents/);
  assert.match(S.UPSERT_TABLE_SQL, /ON CONFLICT\(id\) DO UPDATE SET/);
  assert.deepEqual(
    S.upsertCategoryArgs({
      id: CAT, nom: "E", position: 1, actif: 1, photoHash: "h", photoUpdatedAt: null,
      preset: { forme: "carre", cadrage: "contain", ratio: "4:3", rayon: 4, ombre: true },
    }),
    [CAT, "E", 1, 1, "h", null, "carre", "contain", "4:3", 4, 1]
  );
  assert.deepEqual(S.upsertTableArgs({ id: TABLE, nom: "T1", salle: "Salle 1", places: 4, actif: 1 }),
    [TABLE, "T1", "Salle 1", 4, 1]);
  assert.equal(S.deactivateMissingCategoriesSql(2), "UPDATE categories SET actif = 0 WHERE id NOT IN (?,?)");
  assert.equal(S.deactivateMissingTablesSql(1), "UPDATE tables_resto SET actif = 0 WHERE id NOT IN (?)");
  // Le delta articles ne désactive JAMAIS les absents : aucun SQL de ce type.
  assert.equal(Object.keys(S).some((k) => /deactivateMissingArticles/i.test(k)), false);
});
