"use strict";
// Réglages locaux de la tablette (M1/M4) — simple clé/valeur. Adaptateur
// CommonJS SANS dépendance native : il est exécuté tel quel sous Node par les
// tests, et importé par `db/index.js` côté application.
const KEYS = {
  lastPullAt: "last.pull.at",
  licenceEtat: "licence.etat",
};

async function getSetting(db, key) {
  const row = await db.getFirstAsync("SELECT value FROM settings WHERE key = ?", [key]);
  return row ? row.value : null;
}

async function setSetting(db, key, value) {
  await db.runAsync(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value === null || value === undefined ? null : String(value)]
  );
}

module.exports = { KEYS, getSetting, setSetting };
