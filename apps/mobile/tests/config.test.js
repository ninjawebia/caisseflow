"use strict";
// TC-M1-CFG — normalisation de l'adresse serveur (M1).
const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeServerUrl, apiUrl, DEFAULT_SERVER_URL } = require("../src/core/config");

test("adresse complète conservée", () => {
  assert.equal(normalizeServerUrl("http://127.0.0.1:3000"), "http://127.0.0.1:3000");
  assert.equal(normalizeServerUrl("https://caisse.exemple.fr"), "https://caisse.exemple.fr");
});

test("schéma ajouté quand absent", () => {
  assert.equal(normalizeServerUrl("192.168.1.10:3000"), "http://192.168.1.10:3000");
  assert.equal(normalizeServerUrl("  caisse.local  "), "http://caisse.local");
});

test("barres obliques finales retirées", () => {
  assert.equal(normalizeServerUrl("http://192.168.1.10:3000/"), "http://192.168.1.10:3000");
  assert.equal(normalizeServerUrl("http://192.168.1.10:3000///"), "http://192.168.1.10:3000");
  assert.equal(normalizeServerUrl("http://hote:3000/resto/"), "http://hote:3000/resto");
});

test("casse normalisée", () => {
  assert.equal(normalizeServerUrl("HTTP://Serveur.Local:3000"), "http://serveur.local:3000");
});

test("adresses refusées", () => {
  for (const bad of [
    "",
    "   ",
    "ftp://serveur",
    "http://",
    "http://user:pass@serveur:3000",
    "http://serveur:0",
    "http://serveur:70000",
    "http://serveur:3000/?x=1",
    "http://serveur:3000/#ancre",
    "http://serveur local:3000",
  ]) {
    assert.throws(() => normalizeServerUrl(bad), undefined, `devrait refuser « ${bad} »`);
  }
});

test("apiUrl compose sans double barre", () => {
  assert.equal(apiUrl("192.168.1.10:3000/", "/api/sync/pull"), "http://192.168.1.10:3000/api/sync/pull");
  assert.throws(() => apiUrl("192.168.1.10:3000", "api/sync/pull"));
});

test("valeur par défaut utilisable", () => {
  assert.equal(normalizeServerUrl(DEFAULT_SERVER_URL), DEFAULT_SERVER_URL);
});
