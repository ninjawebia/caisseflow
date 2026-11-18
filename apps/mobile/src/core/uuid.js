"use strict";
// UUID v4 (M2) — identifiant d'opération idempotent (SYNC-1). L'aléa est
// injecté (16 octets du Keystore/crypto natif) : le module reste pur, donc
// testable, et l'unicité ne dépend pas de `Math.random`.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function uuidv4FromBytes(bytes) {
  if (!bytes || typeof bytes.length !== "number" || bytes.length < 16) {
    throw new Error("16 octets aléatoires requis pour un UUID v4");
  }
  const b = Array.from(bytes).slice(0, 16).map((x) => Number(x) & 0xff);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant RFC 4122
  const hex = b.map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isValidUuid(value) {
  return UUID_RE.test(String(value));
}

module.exports = { UUID_RE, uuidv4FromBytes, isValidUuid };
