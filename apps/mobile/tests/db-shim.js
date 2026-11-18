"use strict";
// Adaptateur de test : `node:sqlite` (synchrone) présenté avec l'interface
// asynchrone d'`expo-sqlite` (getFirstAsync / getAllAsync / runAsync /
// execAsync / withTransactionAsync). Permet d'exécuter les adaptateurs RÉELS
// de l'application (`src/db/*.js`) sous Node, sans appareil ni module natif.
const { DatabaseSync } = require("node:sqlite");

// node:sqlite n'accepte ni `undefined` ni les booléens comme paramètres.
function clean(params) {
  return (params || []).map((v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v));
}

function openShim(raw) {
  const db = raw || new DatabaseSync(":memory:");
  return {
    __raw: db,
    async execAsync(sql) {
      db.exec(sql);
    },
    async runAsync(sql, params = []) {
      const res = db.prepare(sql).run(...clean(params));
      return { changes: Number(res.changes || 0), lastInsertRowid: Number(res.lastInsertRowid || 0) };
    },
    async getFirstAsync(sql, params = []) {
      const row = db.prepare(sql).get(...clean(params));
      return row === undefined ? null : row;
    },
    async getAllAsync(sql, params = []) {
      return db.prepare(sql).all(...clean(params));
    },
    async withTransactionAsync(fn) {
      db.exec("BEGIN");
      try {
        await fn();
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}

module.exports = { openShim, clean };
