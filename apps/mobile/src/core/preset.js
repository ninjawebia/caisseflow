"use strict";
// Présentation des images (v0.5) — logique PURE, testable sans appareil.
// Le serveur transmet, avec chaque catégorie/article, un style déjà résolu
// (style explicite sinon défaut du contexte). La tablette ne décide jamais du
// style : elle ne fait que traduire ces valeurs en propriétés React Native.
// Mêmes règles que le back-office (apps/web/lib/preset-frame.js) : une seule
// sémantique, deux systèmes de rendu.

// Valeurs autorisées — miroir de @caisseflow/shared (l'API rejette le reste).
const FORMES = Object.freeze(["carre", "arrondi", "cercle", "bandeau"]);
const CADRAGES = Object.freeze(["cover", "contain"]);
const RATIOS = Object.freeze(["1:1", "4:3", "3:2", "16:9"]);

// Repli si le serveur n'a pas transmis de style (ancienne version du pull ou
// ligne douteuse) : le menu reste lisible, il n'est jamais bloqué pour un
// détail de présentation.
const PRESET_DEFAUT = Object.freeze({
  forme: "arrondi", cadrage: "cover", ratio: "1:1", rayon: 12, ombre: false,
});

const RATIO_VALUES = Object.freeze({ "1:1": 1, "4:3": 4 / 3, "3:2": 3 / 2, "16:9": 16 / 9 });

function clampRayon(value) {
  // `null`/absent = colonne jamais renseignée → défaut (un vrai 0 reste 0).
  if (value === null || value === undefined || value === "") return PRESET_DEFAUT.rayon;
  const n = Number(value);
  if (!Number.isFinite(n)) return PRESET_DEFAUT.rayon;
  return Math.min(64, Math.max(0, Math.round(n)));
}

// Un style invalide ne rejette JAMAIS la ligne métier : on retombe sur le
// défaut (une erreur d'affichage ne doit pas retirer un article de la vente).
function normalizePreset(raw) {
  if (!raw || typeof raw !== "object") return { ...PRESET_DEFAUT };
  return {
    forme: FORMES.includes(raw.forme) ? raw.forme : PRESET_DEFAUT.forme,
    cadrage: CADRAGES.includes(raw.cadrage) ? raw.cadrage : PRESET_DEFAUT.cadrage,
    ratio: RATIOS.includes(raw.ratio) ? raw.ratio : PRESET_DEFAUT.ratio,
    rayon: clampRayon(raw.rayon),
    ombre: raw.ombre === true || raw.ombre === 1,
  };
}

// Reconstruit un preset depuis les colonnes SQLite (préfixe `preset_`).
function presetFromRow(row) {
  if (!row) return { ...PRESET_DEFAUT };
  return normalizePreset({
    forme: row.preset_forme,
    cadrage: row.preset_cadrage,
    ratio: row.preset_ratio,
    rayon: row.preset_rayon,
    ombre: row.preset_ombre === 1 || row.preset_ombre === true,
  });
}

// Style React Native dérivé du preset. `rayon` est déjà en points (dp) : la
// tablette et le BO utilisent la même échelle de 0 à 64.
function presetFrame(preset) {
  const p = normalizePreset(preset);
  const borderRadius = p.forme === "cercle"
    ? 9999
    : p.forme === "carre"
      ? Math.min(p.rayon, 8)
      : p.rayon;
  return {
    aspectRatio: RATIO_VALUES[p.ratio],
    borderRadius,
    resizeMode: p.cadrage,
    ...(p.ombre
      ? {
        shadowColor: "#0F172A",
        shadowOpacity: 0.18,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 4,
      }
      : null),
  };
}

// URL d'une variante optimisée. `v` (préfixe du hash) change avec la photo :
// l'URL change donc aussi, ce qui invalide le cache d'image sans purge.
function photoUri(serverUrl, table, id, hash, variant = "thumb") {
  if (!serverUrl || !id || !hash) return null;
  const base = String(serverUrl).replace(/\/+$/, "");
  return `${base}/api/${table}/${id}/photo?variant=${variant}&v=${String(hash).slice(0, 8)}`;
}

module.exports = {
  FORMES, CADRAGES, RATIOS, PRESET_DEFAUT,
  normalizePreset, presetFromRow, presetFrame, photoUri,
};
