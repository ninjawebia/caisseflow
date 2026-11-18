"use strict";
// SQL du journal fiscal (M2) — texte et mapping d'arguments PURS, partagés par
// l'adaptateur expo-sqlite (appareil) et par les tests `node:sqlite`
// (migration réelle, triggers append-only, continuité de séquence).

const { canonical } = require("../core/hash");

const INSERT_SQL = `INSERT INTO journal
  (seq, uuid_op, ref, type, ts_local, user_matricule, user_nom,
   validator_matricule, motif, payload, hash_prev, hash_self)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`;

function insertArgs(entry) {
  return [
    entry.seq,
    entry.uuidOp,
    entry.ref,
    entry.type,
    entry.tsLocal,
    entry.userMatricule,
    entry.userNom,
    entry.validatorMatricule,
    entry.motif,
    canonical(entry.payload), // payload stocké sous forme canonique (hashable tel quel)
    entry.hashPrev,
    entry.hashSelf,
  ];
}

// Ligne SQLite → entrée vérifiable par `verifyJournal`.
function rowToEntry(row) {
  return {
    seq: Number(row.seq),
    hashPrev: row.hash_prev,
    hashSelf: row.hash_self,
    payload: JSON.parse(row.payload),
  };
}

const SELECT_ALL_SQL = `SELECT seq, uuid_op, ref, type, ts_local, user_matricule, user_nom,
  validator_matricule, motif, payload, hash_prev, hash_self
  FROM journal ORDER BY seq`;

const SELECT_HEAD_SQL = `SELECT seq, hash_self, ts_local FROM journal ORDER BY seq DESC LIMIT 1`;

module.exports = { INSERT_SQL, insertArgs, rowToEntry, SELECT_ALL_SQL, SELECT_HEAD_SQL };
