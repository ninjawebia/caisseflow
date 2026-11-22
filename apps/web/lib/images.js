"use strict";
// Dérivés d'images (v0.5) — le serveur génère des WebP optimisés à partir de
// l'original (5 Mo max) et ne sert QUE ces dérivés au BO et à la tablette :
// recommandations web (poids réduit, dimensions adaptées, métadonnées
// supprimées, orientation EXIF corrigée).
// Source unique des tailles : VARIANTS. Le fichier dérivé vit à côté de
// l'original (`<base>-thumb.webp`), donc aucun état en base à maintenir.
const fs = require("fs");
const sharp = require("sharp");
const { pathOf, variantPathOf } = require("./uploads");

// thumb : puces de catégories et tableaux du BO · card : cartes article ·
// full : bandeau de catégorie (jamais l'original de 5 Mo).
const VARIANTS = Object.freeze({
  thumb: { width: 160, height: 160, fit: "cover" },
  card: { width: 480, height: 480, fit: "cover" },
  full: { width: 1200, fit: "inside" },
});

const QUALITY = 82;

async function buildVariant(buffer, name) {
  const spec = VARIANTS[name];
  if (!spec) return null;
  const resize = spec.height
    ? { width: spec.width, height: spec.height, fit: spec.fit, position: "centre" }
    : { width: spec.width, fit: "inside", withoutEnlargement: true };
  return sharp(buffer)
    .rotate() // applique l'orientation EXIF puis la retire
    .resize(resize)
    .webp({ quality: QUALITY })
    .toBuffer();
}

// Génère (ou vérifie) les trois dérivés d'un fichier déjà stocké.
// Retourne { ok, generated: [...] } ; ne lève jamais pour un dérivé isolé.
async function ensureVariants(file) {
  const src = pathOf(file);
  if (!fs.existsSync(src)) return { ok: false, error: "Original introuvable" };
  const missing = Object.keys(VARIANTS).filter((v) => !fs.existsSync(variantPathOf(file, v)));
  if (missing.length === 0) return { ok: true, generated: [] };
  const buffer = fs.readFileSync(src);
  const generated = [];
  for (const name of missing) {
    try {
      const out = await buildVariant(buffer, name);
      if (!out) continue;
      fs.writeFileSync(variantPathOf(file, name), out);
      generated.push(name);
    } catch {
      // Un dérivé impossible (format exotique) ne doit pas casser l'upload :
      // le fichier original reste servi en repli.
    }
  }
  return { ok: true, generated };
}

// Chemin du dérivé demandé, régénéré à la demande s'il manque (photos d'avant
// la v0.5) ; `null` si l'original n'existe pas.
async function variantPath(file, variant) {
  if (!VARIANTS[variant]) return { path: pathOf(file), type: null };
  const target = variantPathOf(file, variant);
  if (!fs.existsSync(target)) {
    const res = await ensureVariants(file);
    if (!res.ok) return { path: null, type: null };
  }
  if (!fs.existsSync(target)) return { path: pathOf(file), type: null };
  return { path: target, type: "image/webp" };
}

module.exports = { VARIANTS, ensureVariants, variantPath };
