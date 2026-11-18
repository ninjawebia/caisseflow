"use strict";
// Journal Permanent fiscal (M2) — logique PURE : construction d'une écriture,
// numérotation `POSTE-XX-000001`, chaînage, garde d'horloge (FISC-1..4, FISC-7).
// Le SQL (triggers append-only) vit dans `src/db/journal-sql.js`, les appels
// natifs dans `src/db/journal.js`. Aucune écriture n'est modifiable : ce module
// n'expose AUCUNE fonction de mise à jour ou de suppression.

const { canonical, nextHash, verifyChain, GENESIS_ANCHOR } = require("./hash");
const { isValidUuid } = require("./uuid");

// Types d'événements acceptés (identiques au CHECK SQL et au serveur).
const TYPES = [
  "VENTE",
  "PAIEMENT",
  "TICKET",
  "ANNULATION",
  "REMISE",
  "CHANGEMENT_PRIX",
  "SESSION",
  "HORLOGE",
  "CLOTURE_Z",
  "IMPRESSION",
];

// Un motif est OBLIGATOIRE pour ces événements (PRD 4.1.4 : motif + matricule
// + PIN + validation du second pour toute correction).
const MOTIF_REQUIRED = ["ANNULATION", "REMISE", "CHANGEMENT_PRIX"];

const POSTE_RE = /^POSTE-\d{2}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const CLOCK_SKEW_THRESHOLD_MS = 60000; // FISC-4 : saut > 60 s

function fail(message) {
  const e = new Error(message);
  e.code = "JOURNAL_INVALID";
  return e;
}

// Référence d'écriture : POSTE-01-000001 (6 chiffres minimum, jamais tronquée).
function entryRef(poste, seq) {
  if (!POSTE_RE.test(String(poste || ""))) throw fail(`Poste invalide : ${poste}`);
  if (!Number.isInteger(seq) || seq < 1) throw fail(`Séquence invalide : ${seq}`);
  return `${poste}-${String(seq).padStart(6, "0")}`;
}

function normalizeUser(user) {
  const matricule = String((user && user.matricule) || "").trim();
  const nom = String((user && user.nom) || "").trim();
  if (!matricule) throw fail("Écriture anonyme interdite : matricule requis (FISC-3)");
  if (matricule.length > 16) throw fail("Matricule trop long (16 caractères maximum)");
  if (!nom) throw fail("Écriture anonyme interdite : nom de l'utilisateur requis (FISC-3)");
  if (nom.length > 60) throw fail("Nom trop long (60 caractères maximum)");
  return { matricule, nom };
}

// Construit une écriture complète et calcule son hash. Le payload est
// AUTO-PORTEUR : type, référence, horodatage, poste, utilisateur, validateur et
// motif y figurent, donc le hash couvre aussi les métadonnées (au-delà du
// minimum FISC-2 qui ne cite que « payload »).
function buildEntry({ poste, seq, hashPrev, type, ts, user, validator, motif, data, uuidOp }) {
  if (!POSTE_RE.test(String(poste || ""))) throw fail(`Poste invalide : ${poste}`);
  if (!Number.isInteger(seq) || seq < 1) throw fail(`Séquence invalide : ${seq}`);
  if (!HASH_RE.test(String(hashPrev || ""))) throw fail("hash_precedent invalide (64 hexadécimaux)");
  if (!TYPES.includes(type)) throw fail(`Type d'événement inconnu : ${type}`);

  const who = normalizeUser(user);
  const tsMs = Date.parse(ts);
  if (Number.isNaN(tsMs)) throw fail(`Horodatage invalide : ${ts}`);
  const tsLocal = new Date(tsMs).toISOString();

  const cleanMotif = motif === null || motif === undefined ? null : String(motif).trim();
  if (MOTIF_REQUIRED.includes(type) && !cleanMotif) throw fail(`Motif obligatoire pour un événement ${type}`);
  if (cleanMotif && cleanMotif.length > 200) throw fail("Motif trop long (200 caractères maximum)");

  const cleanValidator = validator ? String(validator).trim() : null;
  if (cleanValidator && cleanValidator.length > 16) throw fail("Matricule du validateur trop long (16 caractères)");
  if (MOTIF_REQUIRED.includes(type) && !cleanValidator) {
    throw fail(`Validation par un second obligatoire pour un événement ${type}`);
  }

  if (data !== undefined && (data === null || typeof data !== "object" || Array.isArray(data))) {
    throw fail("Données d'événement invalides (objet attendu)");
  }

  if (!isValidUuid(uuidOp)) throw fail("Identifiant d'opération invalide (UUID v4)");

  const ref = entryRef(poste, seq);
  const payload = {
    type,
    ref,
    ts: tsLocal,
    poste,
    user: { matricule: who.matricule, nom: who.nom },
    validator: cleanValidator,
    motif: cleanMotif,
    data: data || {},
  };
  const hashSelf = nextHash(hashPrev, payload);

  return {
    seq,
    uuidOp,
    ref,
    type,
    tsLocal,
    userMatricule: who.matricule,
    userNom: who.nom,
    validatorMatricule: cleanValidator,
    motif: cleanMotif,
    payload,
    hashPrev,
    hashSelf,
  };
}

// Garde monotone (FISC-4) : un horodatage ne peut jamais reculer.
// - horloge en arrière  → conservé au dernier horodatage, `recul: true`
//   (l'appelant journalise l'incident HORLOGE) ;
// - horloge identique   → +1 ms pour préserver l'ordre.
function guardTimestamp(previousTs, now) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (Number.isNaN(nowMs)) throw fail(`Horodatage invalide : ${now}`);
  if (!previousTs) return { ts: new Date(nowMs).toISOString(), recul: false, adjusted: false, deltaMs: 0 };

  const lastMs = Date.parse(previousTs);
  if (Number.isNaN(lastMs)) throw fail(`Horodatage précédent invalide : ${previousTs}`);

  if (nowMs < lastMs) {
    return { ts: new Date(lastMs).toISOString(), recul: true, adjusted: true, deltaMs: nowMs - lastMs };
  }
  if (nowMs === lastMs) {
    return { ts: new Date(lastMs + 1).toISOString(), recul: false, adjusted: true, deltaMs: 0 };
  }
  return { ts: new Date(nowMs).toISOString(), recul: false, adjusted: false, deltaMs: 0 };
}

// Contrôle d'horloge au contact serveur (FISC-4) : écart local ↔ serveur.
function checkClockSkew(localMs, serverMs, thresholdMs = CLOCK_SKEW_THRESHOLD_MS) {
  const skewMs = Number(serverMs) - Number(localMs);
  return {
    skewMs,
    exceeds: Math.abs(skewMs) > thresholdMs,
    direction: skewMs > 0 ? "retard" : skewMs < 0 ? "avance" : "ok",
    thresholdMs,
  };
}

// Vérification du journal local complet (FISC-7) : chaînage + continuité.
function verifyJournal(entries) {
  return verifyChain(entries, { anchor: GENESIS_ANCHOR, continuous: true });
}

module.exports = {
  TYPES,
  MOTIF_REQUIRED,
  CLOCK_SKEW_THRESHOLD_MS,
  POSTE_RE,
  entryRef,
  normalizeUser,
  buildEntry,
  guardTimestamp,
  checkClockSkew,
  verifyJournal,
  canonical,
  nextHash,
  GENESIS_ANCHOR,
};
