"use strict";
// Presets de présentation d'images — accès base partagé par les routes API,
// le sync mobile et le back-office. Un preset ne décrit que l'AFFICHAGE
// (forme, cadrage, ratio, rayon, ombre, contexte) ; le contenu reste l'asset
// média. `preset_id = NULL` sur une catégorie/article = preset par défaut du
// contexte, résolu ici (jamais dupliqué côté client).
const { pool } = require("./db");
const { PRESET_DEFAUT } = require("@caisseflow/shared");
const { isUuid } = require("./validate");

// Crée les presets par défaut d'un restaurant s'ils manquent (idempotent).
// Appelé par le seed, la page /apparence et le pull mobile (défense en
// profondeur : un restaurant créé hors seed a quand même ses styles).
async function ensureDefaults(restaurantId) {
  for (const [contexte, preset] of Object.entries(PRESET_DEFAUT)) {
    await pool.query(
      `INSERT INTO image_presets
         (restaurant_id, nom, forme, cadrage, ratio, rayon, ombre, contexte, par_defaut)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, true
       WHERE NOT EXISTS (
         SELECT 1 FROM image_presets
         WHERE restaurant_id = $1 AND contexte = $8 AND par_defaut
       )
       ON CONFLICT (restaurant_id, nom) DO NOTHING`,
      [restaurantId, preset.nom, preset.forme, preset.cadrage, preset.ratio, preset.rayon, preset.ombre, contexte]
    );
  }
}

const PRESET_COLUMNS = "id, nom, forme, cadrage, ratio, rayon, ombre, contexte, par_defaut, created_at, updated_at";

async function listPresets(restaurantId) {
  const r = await pool.query(
    `SELECT p.id, p.nom, p.forme, p.cadrage, p.ratio, p.rayon, p.ombre,
            p.contexte, p.par_defaut, p.created_at, p.updated_at,
            (SELECT COUNT(*)::int FROM categories c WHERE c.preset_id = p.id) AS nb_categories,
            (SELECT COUNT(*)::int FROM articles a WHERE a.preset_id = p.id) AS nb_articles
     FROM image_presets p
     WHERE p.restaurant_id = $1
     ORDER BY p.contexte, p.par_defaut DESC, p.nom`,
    [restaurantId]
  );
  return r.rows;
}

// Résolution d'affichage : preset explicite (même restaurant) sinon défaut du
// contexte sinon premier preset du restaurant. Jamais null si des presets
// existent, sinon constantes partagées (défense en profondeur).
async function resolvePreset(restaurantId, presetId, contexte = "menu") {
  if (presetId) {
    const own = await pool.query(
      `SELECT ${PRESET_COLUMNS} FROM image_presets WHERE id = $1 AND restaurant_id = $2`,
      [presetId, restaurantId]
    );
    if (own.rows[0]) return own.rows[0];
  }
  const fallback = await pool.query(
    `SELECT ${PRESET_COLUMNS} FROM image_presets
     WHERE restaurant_id = $1 AND contexte = $2
     ORDER BY par_defaut DESC, nom LIMIT 1`,
    [restaurantId, contexte]
  );
  if (fallback.rows[0]) return fallback.rows[0];
  const constant = PRESET_DEFAUT[contexte] || PRESET_DEFAUT.menu;
  return { ...constant, rayon: constant.rayon, ombre: constant.ombre, contexte };
}

// Vérifie qu'un preset appartient bien au restaurant (jamais cross-tenant).
// `null`/absent = preset par défaut (valeur légitime, pas une erreur).
async function validPresetId(restaurantId, value) {
  if (value === null || value === undefined || value === "") return { ok: true, id: null };
  if (!isUuid(value)) return { ok: false, error: "Style d'image invalide" };
  const r = await pool.query(
    "SELECT id FROM image_presets WHERE id = $1 AND restaurant_id = $2",
    [value, restaurantId]
  );
  return r.rows[0] ? { ok: true, id: value } : { ok: false, error: "Style d'image introuvable" };
}

// Contrat transmis au mobile (identique à celui du BO) : pas d'id interne.
function publicPreset(row) {
  if (!row) return null;
  return {
    forme: row.forme,
    cadrage: row.cadrage,
    ratio: row.ratio,
    rayon: Number(row.rayon),
    ombre: row.ombre === true,
  };
}

// SQL réutilisable : preset effectif d'une entité, sinon défaut du contexte.
// `alias` = alias de la table entité (c ou a), `ctx` = contexte visé.
function presetJoin(alias, ctx = "menu") {
  return `
    LEFT JOIN image_presets p${alias} ON p${alias}.id = ${alias}.preset_id
    LEFT JOIN image_presets d${alias} ON d${alias}.restaurant_id = ${alias}.restaurant_id
      AND d${alias}.contexte = '${ctx}' AND d${alias}.par_defaut`;
}

function presetColumns(alias) {
  return `
    COALESCE(p${alias}.forme, d${alias}.forme, 'arrondi') AS preset_forme,
    COALESCE(p${alias}.cadrage, d${alias}.cadrage, 'cover') AS preset_cadrage,
    COALESCE(p${alias}.ratio, d${alias}.ratio, '1:1') AS preset_ratio,
    COALESCE(p${alias}.rayon, d${alias}.rayon, 12) AS preset_rayon,
    COALESCE(p${alias}.ombre, d${alias}.ombre, false) AS preset_ombre`;
}

module.exports = { ensureDefaults, listPresets, resolvePreset, publicPreset, validPresetId, presetJoin, presetColumns };
