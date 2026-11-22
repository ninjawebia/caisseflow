"use strict";
// SQL des données de référence (M4) — texte et mappings PURS, partagés par
// l'adaptateur expo-sqlite et les tests `node:sqlite`.

function placeholders(count) {
  return Array.from({ length: count }, () => "?").join(",");
}

// --- Catégories (pull COMPLET : un absent est désactivé) ------------------
const UPSERT_CATEGORY_SQL = `INSERT INTO categories
    (id, nom, position, actif, photo_hash, photo_updated_at,
     preset_forme, preset_cadrage, preset_ratio, preset_rayon, preset_ombre, synced_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
  ON CONFLICT(id) DO UPDATE SET
    nom = excluded.nom,
    position = excluded.position,
    actif = excluded.actif,
    photo_hash = excluded.photo_hash,
    photo_updated_at = excluded.photo_updated_at,
    preset_forme = excluded.preset_forme,
    preset_cadrage = excluded.preset_cadrage,
    preset_ratio = excluded.preset_ratio,
    preset_rayon = excluded.preset_rayon,
    preset_ombre = excluded.preset_ombre,
    synced_at = excluded.synced_at`;

function upsertCategoryArgs(row) {
  const p = row.preset || {};
  return [
    row.id, row.nom, row.position, row.actif, row.photoHash, row.photoUpdatedAt,
    p.forme, p.cadrage, p.ratio, p.rayon, p.ombre ? 1 : 0,
  ];
}

function deactivateMissingCategoriesSql(count) {
  return `UPDATE categories SET actif = 0 WHERE id NOT IN (${placeholders(count)})`;
}

// --- Articles (pull DELTA : aucun absent n'est désactivé localement) ------
// Un article désactivé côté serveur arrive avec `actif = false` dans le delta ;
// un article simplement inchangé est absent du lot et doit rester actif.
const UPSERT_ARTICLE_SQL = `INSERT INTO articles
    (id, categorie_id, nom, prix_ttc_cents, taux_tva, actif, version, photo_hash, updated_at,
     preset_forme, preset_cadrage, preset_ratio, preset_rayon, preset_ombre, synced_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
  ON CONFLICT(id) DO UPDATE SET
    categorie_id = excluded.categorie_id,
    nom = excluded.nom,
    prix_ttc_cents = excluded.prix_ttc_cents,
    taux_tva = excluded.taux_tva,
    actif = excluded.actif,
    version = excluded.version,
    photo_hash = excluded.photo_hash,
    updated_at = excluded.updated_at,
    preset_forme = excluded.preset_forme,
    preset_cadrage = excluded.preset_cadrage,
    preset_ratio = excluded.preset_ratio,
    preset_rayon = excluded.preset_rayon,
    preset_ombre = excluded.preset_ombre,
    synced_at = excluded.synced_at`;

function upsertArticleArgs(row) {
  const p = row.preset || {};
  return [
    row.id, row.categorieId, row.nom, row.prixTtcCents, row.tauxTva,
    row.actif, row.version, row.photoHash, row.updatedAt,
    p.forme, p.cadrage, p.ratio, p.rayon, p.ombre ? 1 : 0,
  ];
}

// --- Tables (pull COMPLET) ------------------------------------------------
const UPSERT_TABLE_SQL = `INSERT INTO tables_resto (id, nom, salle, places, actif, synced_at)
  VALUES (?,?,?,?,?,datetime('now'))
  ON CONFLICT(id) DO UPDATE SET
    nom = excluded.nom,
    salle = excluded.salle,
    places = excluded.places,
    actif = excluded.actif,
    synced_at = excluded.synced_at`;

function upsertTableArgs(row) {
  return [row.id, row.nom, row.salle, row.places, row.actif];
}

function deactivateMissingTablesSql(count) {
  return `UPDATE tables_resto SET actif = 0 WHERE id NOT IN (${placeholders(count)})`;
}

// --- Lectures -------------------------------------------------------------
const SELECT_REFERENCE_COUNTS_SQL = `SELECT
    (SELECT COUNT(*) FROM categories WHERE actif = 1) AS categories,
    (SELECT COUNT(*) FROM articles WHERE actif = 1) AS articles,
    (SELECT COUNT(*) FROM tables_resto WHERE actif = 1) AS tables,
    (SELECT COUNT(*) FROM staff WHERE actif = 1) AS staff`;

const SELECT_MENU_CATEGORIES_SQL = `SELECT
    id, nom, position, actif, photo_hash, photo_updated_at,
    preset_forme, preset_cadrage, preset_ratio, preset_rayon, preset_ombre
  FROM categories ORDER BY position, nom`;

const SELECT_MENU_ARTICLES_SQL = `SELECT
    id, categorie_id, nom, prix_ttc_cents, taux_tva, actif, version, photo_hash,
    preset_forme, preset_cadrage, preset_ratio, preset_rayon, preset_ombre
  FROM articles ORDER BY nom`;

const SELECT_TABLES_SQL = `SELECT id, nom, salle, places FROM tables_resto WHERE actif = 1 ORDER BY salle, nom`;

module.exports = {
  placeholders,
  UPSERT_CATEGORY_SQL,
  upsertCategoryArgs,
  deactivateMissingCategoriesSql,
  UPSERT_ARTICLE_SQL,
  upsertArticleArgs,
  UPSERT_TABLE_SQL,
  upsertTableArgs,
  deactivateMissingTablesSql,
  SELECT_REFERENCE_COUNTS_SQL,
  SELECT_MENU_CATEGORIES_SQL,
  SELECT_MENU_ARTICLES_SQL,
  SELECT_TABLES_SQL,
};
