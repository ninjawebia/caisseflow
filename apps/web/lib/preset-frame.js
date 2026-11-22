// Géométrie d'un preset d'image → style CSS du back-office (pur, sans base).
// Source unique côté web : l'aperçu d'/apparence et les vignettes du menu
// utilisent exactement les mêmes règles, donc ce que le gérant voit est ce
// que la tablette affichera (mêmes formes, même cadrage, même arrondi).
//
// La tablette (React Native) applique les mêmes règles dans
// apps/mobile/src/core/preset.js — deux systèmes de style distincts, une seule
// sémantique validée par @caisseflow/shared.

const RATIOS = Object.freeze({
  "1:1": "1 / 1",
  "4:3": "4 / 3",
  "3:2": "3 / 2",
  "16:9": "16 / 9",
});

// Arrondi effectif : un cercle ignore `rayon` (toujours 50 %).
function presetRadius(preset) {
  const forme = preset?.forme || "arrondi";
  if (forme === "cercle") return "9999px";
  if (forme === "carre") return `${Math.min(Number(preset?.rayon) || 0, 8)}px`;
  return `${Number(preset?.rayon) || 0}px`;
}

function presetFrame(preset) {
  const ratio = RATIOS[preset?.ratio] || RATIOS["1:1"];
  return {
    aspectRatio: ratio,
    borderRadius: presetRadius(preset),
    objectFit: preset?.cadrage === "contain" ? "contain" : "cover",
    boxShadow: preset?.ombre ? "0 10px 24px -12px rgba(15, 23, 42, 0.45)" : "none",
  };
}

module.exports = { RATIOS, presetRadius, presetFrame };
