"use strict";
// Fiscal core (module nf525, PRD 6.1): canonical hashing and chain verification.
// The same functions are used by the seed, the sync endpoint and the journal UI,
// so every hash is verifiable everywhere.
const crypto = require("crypto");

// Deterministic JSON: sorted keys, no whitespace (PRD 9.1 canonical payload).
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
}

function sha256hex(input) {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

// hash_self = SHA-256(hash_prev || canonical(payload)) (PRD FISC-2)
function nextHash(hashPrev, payload) {
  return sha256hex(hashPrev + canonical(payload));
}

// Verify a full ordered list of entries {seq, hashPrev, hashSelf, payload}.
// Returns {ok, brokenSeq} — first broken link wins (PRD FISC-7).
function verifyChain(entries) {
  let prev = "GENESIS";
  for (const e of entries) {
    if (e.hashPrev !== prev) return { ok: false, brokenSeq: e.seq, reason: "hash_prev_mismatch" };
    const expected = nextHash(e.hashPrev, e.payload);
    if (e.hashSelf !== expected) return { ok: false, brokenSeq: e.seq, reason: "hash_self_mismatch" };
    prev = e.hashSelf;
  }
  return { ok: true, brokenSeq: null, reason: null, lastHash: prev };
}

// Short fingerprint printed on receipts (PRD IMP-5, first 8 hex chars).
function shortHash(hashSelf) {
  return hashSelf.slice(0, 8);
}

module.exports = { canonical, sha256hex, nextHash, verifyChain, shortHash };
