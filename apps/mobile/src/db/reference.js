"use strict";
// Données de référence locales (M4) — carte (catégories + articles + tables) et
// métadonnées de synchronisation. La caisse doit pouvoir AFFICHER la carte et
// PRENDRE une commande sans réseau (PRD SYNC-3/SYNC-5) : ce module est le seul
// à écrire les tables de référence, sur des lignes déjà normalisées.
//
// Règles du contrat :
//  - catégories et tables = pull COMPLET → un identifiant absent est DÉSACTIVÉ
//    (jamais supprimé : une commande passée peut y faire référence) ;
//  - articles = pull DELTA (`since`) → aucun absent n'est désactivé, un article
//    désactivé arrive explicitement avec `actif = false`.
const { normalizeReference, groupMenu } = require("../core/reference");
const { KEYS, getSetting, setSetting } = require("./settings");
const S = require("./reference-sql");

async function saveReference(db, payload) {
  const { categories, articles, tables, rejected } = normalizeReference(payload);

  // Une seule transaction : une carte à moitié écrite serait pire que pas de
  // mise à jour du tout (la tablette garderait un menu incohérent).
  await db.withTransactionAsync(async () => {
    for (const row of categories) {
      await db.runAsync(S.UPSERT_CATEGORY_SQL, S.upsertCategoryArgs(row));
    }
    if (categories.length) {
      await db.runAsync(S.deactivateMissingCategoriesSql(categories.length), categories.map((c) => c.id));
    }

    for (const row of articles) {
      await db.runAsync(S.UPSERT_ARTICLE_SQL, S.upsertArticleArgs(row));
    }

    for (const row of tables) {
      await db.runAsync(S.UPSERT_TABLE_SQL, S.upsertTableArgs(row));
    }
    if (tables.length) {
      await db.runAsync(S.deactivateMissingTablesSql(tables.length), tables.map((t) => t.id));
    }
  });

  return {
    saved: {
      categories: categories.length,
      articles: articles.length,
      tables: tables.length,
    },
    rejected,
  };
}

// Compteurs affichés sur l'accueil : uniquement ce qui est UTILISABLE.
async function readReferenceCounts(db) {
  const row = await db.getFirstAsync(S.SELECT_REFERENCE_COUNTS_SQL);
  return {
    categories: Number((row && row.categories) || 0),
    articles: Number((row && row.articles) || 0),
    tables: Number((row && row.tables) || 0),
    users: Number((row && row.staff) || 0),
  };
}

// Carte groupée pour l'écran de prise de commande (M5) : catégories actives
// triées par position, articles actifs triés par nom, orphelins regroupés.
async function readMenu(db) {
  const categories = await db.getAllAsync(S.SELECT_MENU_CATEGORIES_SQL);
  const articles = await db.getAllAsync(S.SELECT_MENU_ARTICLES_SQL);
  return groupMenu(
    categories.map((c) => ({ id: c.id, nom: c.nom, position: Number(c.position), actif: Number(c.actif) })),
    articles.map((a) => ({
      id: a.id,
      categorieId: a.categorie_id,
      nom: a.nom,
      prixTtcCents: Number(a.prix_ttc_cents),
      tauxTva: Number(a.taux_tva),
      actif: Number(a.actif),
      version: Number(a.version),
      photoHash: a.photo_hash,
    }))
  );
}

async function readTables(db) {
  const rows = await db.getAllAsync(S.SELECT_TABLES_SQL);
  return rows.map((t) => ({ id: t.id, nom: t.nom, salle: t.salle, places: Number(t.places) }));
}

// `last.pull.at` porte l'heure SERVEUR du dernier pull réussi : c'est elle qui
// sert de curseur `since` au prochain delta (jamais l'heure locale, qui peut
// être fausse — FISC-4).
async function getLastPull(db) {
  return getSetting(db, KEYS.lastPullAt);
}

async function setLastPull(db, isoServerTime) {
  await setSetting(db, KEYS.lastPullAt, isoServerTime);
}

async function setLicence(db, etat) {
  await setSetting(db, KEYS.licenceEtat, etat || null);
}

// Licence en cache : la caisse doit connaître son état hors ligne (SYNC-6).
async function readLicence(db) {
  return getSetting(db, KEYS.licenceEtat);
}

// Identifiant de poste (`POSTE-01`) renvoyé par le pull : il est figé sur le
// jeton d'appareil côté serveur et sert de préfixe à la numérotation fiscale.
async function setDevicePoste(db, poste) {
  if (poste) await setSetting(db, KEYS.devicePoste, poste);
}

async function readDevicePoste(db) {
  return getSetting(db, KEYS.devicePoste);
}

module.exports = {
  saveReference,
  readReferenceCounts,
  readMenu,
  readTables,
  getLastPull,
  setLastPull,
  setLicence,
  readLicence,
  setDevicePoste,
  readDevicePoste,
};
