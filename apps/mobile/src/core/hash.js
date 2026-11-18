"use strict";
// Payload canonique + chaînage (M2) — copie EXACTE du contrat serveur
// (`apps/web/lib/fiscal.js`) : clés triées, aucun espace, SHA-256 hexadécimal.
// Toute divergence rendrait les écritures locales invérifiables par le cloud.

const { sha256hex } = require("./sha256");

// JSON déterministe : clés triées, aucune espace (PRD 9.1).
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
}

// hash_courant = SHA-256(hash_precedent || payload canonique) (FISC-2)
function nextHash(hashPrev, payload) {
  return sha256hex(hashPrev + canonical(payload));
}

// Ancre de genèse du premier enregistrement d'un poste (identique au serveur).
const GENESIS_ANCHOR = sha256hex("GENESIS");

// Vérifie une chaîne ordonnée. `continuous` exige seq 1,2,3… sans trou
// (journal local : la séquence est la clé primaire, elle ne peut pas sauter).
function verifyChain(entries, { anchor = GENESIS_ANCHOR, continuous = false } = {}) {
  let prev = anchor;
  let expectedSeq = 1;
  for (const e of entries) {
    if (continuous && e.seq !== expectedSeq) {
      return { ok: false, brokenSeq: e.seq, reason: "seq_non_continue", expectedSeq };
    }
    if (e.hashPrev !== prev) return { ok: false, brokenSeq: e.seq, reason: "hash_prev_mismatch" };
    const expected = nextHash(e.hashPrev, e.payload);
    if (e.hashSelf !== expected) return { ok: false, brokenSeq: e.seq, reason: "hash_self_mismatch" };
    prev = e.hashSelf;
    expectedSeq += 1;
  }
  return { ok: true, brokenSeq: null, reason: null, lastHash: prev, lastSeq: expectedSeq - 1 };
}

module.exports = { canonical, nextHash, GENESIS_ANCHOR, verifyChain };
