"use strict";
// TC-IMG-PRESET — présentation des images côté tablette (v0.5) : normalisation
// des styles reçus par le pull, traduction en propriétés React Native et URL
// des variantes optimisées. Pur : aucun appareil, aucun module natif.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  FORMES, CADRAGES, RATIOS, PRESET_DEFAUT,
  normalizePreset, presetFromRow, presetFrame, photoUri,
} = require("../src/core/preset");

const DEF = { forme: "arrondi", cadrage: "cover", ratio: "1:1", rayon: 12, ombre: false };

test("preset : valeurs par défaut quand le serveur n'envoie rien", () => {
  for (const bad of [null, undefined, {}, "x", 42]) {
    assert.deepEqual(normalizePreset(bad), DEF, String(bad));
  }
  assert.deepEqual(normalizePreset({}), DEF);
  assert.deepEqual({ ...PRESET_DEFAUT }, DEF);
});

test("preset : chaque champ invalide retombe sur le défaut, jamais de rejet", () => {
  assert.deepEqual(
    normalizePreset({ forme: "losange", cadrage: "fill", ratio: "21:9", rayon: "x", ombre: "oui" }),
    DEF
  );
  // Un seul champ douteux ne fait pas perdre les autres.
  const p = normalizePreset({ forme: "cercle", cadrage: "contain", ratio: "16:9", rayon: 0, ombre: true });
  assert.deepEqual(p, { forme: "cercle", cadrage: "contain", ratio: "16:9", rayon: 0, ombre: true });
});

test("preset : arrondi borné 0–64 et arrondi à l'entier", () => {
  assert.equal(normalizePreset({ rayon: -5 }).rayon, 0);
  assert.equal(normalizePreset({ rayon: 999 }).rayon, 64);
  assert.equal(normalizePreset({ rayon: 8.6 }).rayon, 9);
});

test("preset : énumérations exposées et cohérentes avec le contrat partagé", () => {
  assert.deepEqual([...FORMES], ["carre", "arrondi", "cercle", "bandeau"]);
  assert.deepEqual([...CADRAGES], ["cover", "contain"]);
  assert.deepEqual([...RATIOS], ["1:1", "4:3", "3:2", "16:9"]);
});

test("preset : colonnes SQLite reconstruites (preset_*)", () => {
  assert.deepEqual(
    presetFromRow({ preset_forme: "bandeau", preset_cadrage: "cover", preset_ratio: "3:2", preset_rayon: 6, preset_ombre: 1 }),
    { forme: "bandeau", cadrage: "cover", ratio: "3:2", rayon: 6, ombre: true }
  );
  // Anciennes lignes (colonnes NULL) → défaut du menu, menu toujours lisible.
  assert.deepEqual(presetFromRow({ preset_forme: null, preset_rayon: null }), DEF);
  assert.deepEqual(presetFromRow(null), DEF);
});

test("preset : géométrie React Native (ratio, arrondi, cadrage, ombre)", () => {
  assert.equal(presetFrame({ ratio: "1:1" }).aspectRatio, 1);
  assert.equal(presetFrame({ ratio: "4:3" }).aspectRatio, 4 / 3);
  assert.equal(presetFrame({ ratio: "3:2" }).aspectRatio, 1.5);
  assert.equal(presetFrame({ ratio: "16:9" }).aspectRatio, 16 / 9);

  // Cercle : l'arrondi l'emporte toujours.
  assert.equal(presetFrame({ forme: "cercle", rayon: 4 }).borderRadius, 9999);
  // Carré : arrondi discret plafonné à 8.
  assert.equal(presetFrame({ forme: "carre", rayon: 40 }).borderRadius, 8);
  assert.equal(presetFrame({ forme: "arrondi", rayon: 20 }).borderRadius, 20);

  assert.equal(presetFrame({ cadrage: "contain" }).resizeMode, "contain");
  assert.equal(presetFrame({ cadrage: "cover" }).resizeMode, "cover");

  assert.equal(presetFrame({ ombre: false }).elevation, undefined);
  const shadow = presetFrame({ ombre: true });
  assert.equal(shadow.elevation > 0, true);
  assert.ok(shadow.shadowRadius > 0);
});

test("preset : URL de variante avec jeton de cache, jamais d'URL nue", () => {
  const hash = "4ab98c6afd601f41a0307d515d8a6a07";
  const url = photoUri("http://10.0.0.5:3000/", "categories", "abc", hash, "thumb");
  assert.equal(url, "http://10.0.0.5:3000/api/categories/abc/photo?variant=thumb&v=4ab98c6a");
  assert.match(photoUri("http://h:3000", "articles", "id", hash), /variant=thumb/);
  // Données incomplètes → aucune requête (pas d'URL relative qui échouerait).
  assert.equal(photoUri(null, "articles", "id", hash), null);
  assert.equal(photoUri("http://h:3000", "articles", null, hash), null);
  assert.equal(photoUri("http://h:3000", "articles", "id", null), null);
});
