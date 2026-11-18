"use strict";
// Données de référence (M4) — validation des lignes reçues par le pull
// (SYNC-3) avant tout stockage : une ligne douteuse est REJETÉE et comptée,
// jamais insérée « au mieux ». Pur → testable sans appareil.
const { isValidUuid } = require("./uuid");
const { toCents } = require("./money");

const NOM_MAX = 80;
const SALLE_MAX = 40;

function isActiveFlag(value) {
  return !(value === false || value === 0 || value === "0");
}

function cleanText(value, max) {
  return String(value === null || value === undefined ? "" : value).trim().slice(0, max);
}

function bad(reason) {
  return { reason };
}

// --- Catégories ----------------------------------------------------------
function normalizeCategory(row) {
  if (!row || typeof row !== "object") return bad("ligne");
  if (!isValidUuid(row.id)) return bad("id");
  const nom = cleanText(row.nom, NOM_MAX);
  if (!nom) return bad("nom");
  const position = row.position === undefined || row.position === null ? 0 : Number(row.position);
  if (!Number.isInteger(position) || position < 0) return bad("position");
  return {
    id: row.id,
    nom,
    position,
    actif: isActiveFlag(row.actif) ? 1 : 0,
  };
}

// --- Articles ------------------------------------------------------------
function normalizeArticle(row) {
  if (!row || typeof row !== "object") return bad("ligne");
  if (!isValidUuid(row.id)) return bad("id");
  const nom = cleanText(row.nom, NOM_MAX);
  if (!nom) return bad("nom");

  const categorieId = row.categorie_id === null || row.categorie_id === undefined ? null : String(row.categorie_id);
  if (categorieId !== null && !isValidUuid(categorieId)) return bad("categorie_id");

  let prixTtcCents;
  try {
    prixTtcCents = toCents(row.prix_ttc);
  } catch {
    return bad("prix");
  }

  const tauxTva = Number(row.taux_tva);
  if (!Number.isFinite(tauxTva) || tauxTva < 0 || tauxTva > 100) return bad("tva");
  // NUMERIC(4,1) côté serveur : une décimale au maximum.
  if (Math.abs(tauxTva * 10 - Math.round(tauxTva * 10)) > 1e-9) return bad("tva");

  // `version` pilote la règle « dernière version gagnante » : une valeur non
  // numérique est refusée plutôt que convertie au jugé.
  if (typeof row.version !== "number" || !Number.isInteger(row.version) || row.version < 1) return bad("version");
  const version = row.version;

  const photoHash = row.photo_hash ? cleanText(row.photo_hash, 128) : null;
  let updatedAt = null;
  if (row.updated_at) {
    const ms = Date.parse(row.updated_at);
    if (!Number.isNaN(ms)) updatedAt = new Date(ms).toISOString();
  }

  return {
    id: row.id,
    categorieId,
    nom,
    prixTtcCents,
    tauxTva,
    actif: isActiveFlag(row.actif) ? 1 : 0,
    version,
    photoHash,
    updatedAt,
  };
}

// --- Tables --------------------------------------------------------------
function normalizeTable(row) {
  if (!row || typeof row !== "object") return bad("ligne");
  if (!isValidUuid(row.id)) return bad("id");
  const nom = cleanText(row.nom, NOM_MAX);
  if (!nom) return bad("nom");
  const salle = cleanText(row.salle, SALLE_MAX) || "Salle 1";
  const places = Number(row.places);
  if (!Number.isInteger(places) || places < 1 || places > 20) return bad("places");
  return { id: row.id, nom, salle, places, actif: isActiveFlag(row.actif) ? 1 : 0 };
}

// Lot complet : doublons d'identifiant refusés (l'ordre du delta serveur fait
// foi, un doublon signalerait un défaut de contrat).
function normalizeBatch(rows, normalize, key = "id") {
  const out = [];
  const rejected = [];
  const seen = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const res = normalize(row);
    if (res.reason) {
      rejected.push({ id: row && row.id ? String(row.id) : null, reason: res.reason });
      continue;
    }
    if (seen.has(res[key])) {
      rejected.push({ id: res[key], reason: "doublon" });
      continue;
    }
    seen.add(res[key]);
    out.push(res);
  }
  return { rows: out, rejected };
}

function normalizeReference(payload) {
  const data = payload || {};
  const categories = normalizeBatch(data.categories, normalizeCategory);
  const articles = normalizeBatch(data.articles, normalizeArticle);
  const tables = normalizeBatch(data.tables, normalizeTable);
  return {
    categories: categories.rows,
    articles: articles.rows,
    tables: tables.rows,
    rejected: {
      categories: categories.rejected,
      articles: articles.rejected,
      tables: tables.rejected,
    },
  };
}

// Carte prête à afficher (M5) : catégories triées par position, articles
// actifs triés par nom ; les articles orphelins vont dans « Sans catégorie ».
function groupMenu(categories, articles) {
  const byCat = new Map();
  for (const c of categories || []) {
    if (Number(c.actif) !== 1) continue;
    byCat.set(c.id, { id: c.id, nom: c.nom, position: Number(c.position), articles: [] });
  }
  const orphans = [];
  for (const a of articles || []) {
    if (Number(a.actif) !== 1) continue;
    const group = a.categorieId ? byCat.get(a.categorieId) : null;
    if (group) group.articles.push(a);
    else orphans.push(a);
  }
  const groups = [...byCat.values()].sort((x, y) => x.position - y.position || x.nom.localeCompare(y.nom));
  for (const g of groups) g.articles.sort((x, y) => x.nom.localeCompare(y.nom));
  if (orphans.length) {
    orphans.sort((x, y) => x.nom.localeCompare(y.nom));
    groups.push({ id: null, nom: "Sans catégorie", position: Number.MAX_SAFE_INTEGER, articles: orphans });
  }
  return groups;
}

// Horodatage lisible pour l'accueil (jamais de `Intl` : le moteur JS Android
// peut être dépourvu des données locales). Format français : 18/11/2026 à 09:05.
function formatSyncDate(iso) {
  if (!iso) return "jamais";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "date inconnue";
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} à ${p(d.getHours())}:${p(d.getMinutes())}`;
}

module.exports = {
  NOM_MAX,
  SALLE_MAX,
  normalizeCategory,
  normalizeArticle,
  normalizeTable,
  normalizeReference,
  groupMenu,
  formatSyncDate,
};
