"use strict";
// Schéma local SQLite versionné (M1). Chaque module ajoute SA migration, jamais
// de modification d'une migration déjà livrée : une tablette en production ne
// peut pas être migrée en réécrivant l'histoire. `PRAGMA user_version` porte le
// numéro appliqué ; le planificateur (`planMigrations`) est pur et testé.

const { CaisseError, CODES } = require("./errors");

// Migration 1 — socle : réglages locaux de la tablette uniquement.
// Le journal fiscal (M2) et les données de référence (M4) viendront dans des
// migrations séparées, avec leurs propres garanties (triggers append-only).
const MIGRATIONS = [
  {
    version: 1,
    name: "socle",
    statements: [
      `CREATE TABLE IF NOT EXISTS settings (
         key TEXT PRIMARY KEY,
         value TEXT,
         updated_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
      `INSERT OR IGNORE INTO settings (key, value) VALUES
         ('device.poste', NULL),
         ('device.label', NULL),
         ('last.pull.at', NULL)`,
    ],
  },
];

function latestVersion() {
  return MIGRATIONS.length ? MIGRATIONS[MIGRATIONS.length - 1].version : 0;
}

// Valide l'inventaire (une seule fois par appel — coût négligeable).
function assertMigrationSet() {
  let previous = 0;
  for (const m of MIGRATIONS) {
    if (!Number.isInteger(m.version) || m.version !== previous + 1) {
      throw new CaisseError(CODES.STORAGE, `Migrations incohérentes : version ${m.version} après ${previous}`);
    }
    if (!Array.isArray(m.statements) || m.statements.length === 0) {
      throw new CaisseError(CODES.STORAGE, `Migration ${m.version} vide`);
    }
    if (m.statements.some((s) => typeof s !== "string" || !s.trim())) {
      throw new CaisseError(CODES.STORAGE, `Migration ${m.version} : instruction SQL vide`);
    }
    previous = m.version;
  }
}

// Plan des migrations à appliquer depuis `current` (PRAGMA user_version).
// - base neuve (0) → toutes les migrations ;
// - base à jour → aucune ;
// - base plus récente que l'app → refus explicite (aucune écriture, l'appareil
//   doit être mis à jour : jamais de rétrogradation silencieuse).
function planMigrations(current) {
  assertMigrationSet();
  if (current === null || current === undefined || current === "" || typeof current === "boolean") {
    throw new CaisseError(CODES.STORAGE, `Version de schéma invalide : ${current}`);
  }
  const from = Number(current);
  if (!Number.isInteger(from) || from < 0) {
    throw new CaisseError(CODES.STORAGE, `Version de schéma invalide : ${current}`);
  }
  const latest = latestVersion();
  if (from > latest) {
    throw new CaisseError(CODES.STORAGE,
      `Base locale écrite par une version plus récente de l'application (schéma ${from} > ${latest}) — mettez l'application à jour`);
  }
  return MIGRATIONS.filter((m) => m.version > from);
}

module.exports = { MIGRATIONS, latestVersion, planMigrations, assertMigrationSet };
