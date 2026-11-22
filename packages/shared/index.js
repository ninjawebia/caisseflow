"use strict";
// @caisseflow/shared — source unique de vérité partagée entre le back-office web
// (apps/web) et les applications React Native (apps/mobile, à venir).
// 1) Types/codes des événements NF525 (journal append-only, PRD 7.1 FISC-1).
// 2) DTO API : validation côté serveur, réutilisée côté client pour le feedback
//    immédiat — mêmes règles, une seule définition (PRD 9, contrats API).

// --- Événements du journal NF525 (FISC-1) — INSERT seul, seq continu ---
const NF525_EVENT_TYPES = Object.freeze([
  "VENTE",           // envoi cuisine / pré-encaissement (POS-3)
  "PAIEMENT",        // encaissement, tous modes (POS-4)
  "TICKET",          // impression/réimpression de ticket (POS-5, IMP-4/7)
  "ANNULATION",      // annulation article ou commande — nouvelle écriture (POS-6)
  "REMISE",          // remise avec motif + validateur (POS-7)
  "CHANGEMENT_PRIX", // changement de prix en cours de service (POS-7)
  "SESSION_OUVERTURE", // login matricule+PIN (FISC-3)
  "SESSION_FERMETURE", // logout / verrouillage inactivité (SEC-5)
  "CHANGEMENT_HEURE",  // contrôle d'horloge (FISC-4)
  "CLOTURE_Z",       // clôture journalière scellée (FISC-5)
  "IMPRESSION",      // statuts d'impression (IMP-4)
]);

// Écritures exigeant un motif + validateur (second) — POS-6/7.
const EVENT_TYPES_WITH_VALIDATOR = Object.freeze(["ANNULATION", "REMISE", "CHANGEMENT_PRIX"]);

// Taux de TVA restauratifs autorisés (BO-1, IMP-5).
const TAUX_TVA = Object.freeze([0, 5.5, 10, 20]);

// Bornes de prix (DTO article).
const PRIX_MIN = 0.01;
const PRIX_MAX = 10000;

// --- DTO article (BO-1) — identique en validation serveur et client ---
// Retour : { ok: true, value } | { ok: false, error } (jamais d'exception).
function validateArticle(body) {
  const nom = String(body?.nom || "").trim();
  const prix = Number(body?.prix_ttc);
  const tva = Number(body?.taux_tva);
  if (nom.length < 2 || nom.length > 80) return { ok: false, error: "Nom obligatoire (2–80 caractères)" };
  if (!(prix >= PRIX_MIN && prix <= PRIX_MAX)) return { ok: false, error: "Prix invalide (0–10 000 €)" };
  if (!TAUX_TVA.includes(tva)) return { ok: false, error: "Taux de TVA invalide" };
  return { ok: true, value: { nom, prix_ttc: prix, taux_tva: tva } };
}

// --- DTO table (BO-3) ---
function validateTable(body) {
  const nom = String(body?.nom || "").trim();
  const salle = String(body?.salle || "").trim();
  const places = Number(body?.places);
  if (nom.length < 1 || nom.length > 20) return { ok: false, error: "Nom de table obligatoire (1–20 caractères)" };
  if (salle.length < 1 || salle.length > 40) return { ok: false, error: "Salle obligatoire (1–40 caractères)" };
  if (!(Number.isInteger(places) && places >= 1 && places <= 30)) return { ok: false, error: "Places invalides (1–30)" };
  return { ok: true, value: { nom, salle, places } };
}

// --- DTO utilisateur mobile (BO-2, TERM-1) — le PIN n'est jamais transmis en clair après hash ---
function validateUserMobile(body) {
  const matricule = String(body?.matricule || "").trim().toUpperCase();
  const nom = String(body?.nom || "").trim();
  const role = String(body?.role || "");
  const pin = String(body?.pin || "");
  if (!/^[A-Z0-9]{2,6}$/.test(matricule)) return { ok: false, error: "Matricule invalide (2–6 alphanumériques)" };
  if (nom.length < 2 || nom.length > 60) return { ok: false, error: "Nom obligatoire (2–60 caractères)" };
  if (!["gerant", "second", "serveur", "cuisine"].includes(role)) return { ok: false, error: "Rôle invalide" };
  if (!/^\d{4}$/.test(pin)) return { ok: false, error: "PIN invalide (4 chiffres)" };
  return { ok: true, value: { matricule, nom, role, pin } };
}

// --- DTO catégorie (BO-1, backlog F1) ---
function validateCategory(body) {
  const nom = String(body?.nom || "").trim();
  const position = body?.position === undefined ? 0 : Number(body.position);
  if (nom.length < 2 || nom.length > 40) return { ok: false, error: "Nom de catégorie obligatoire (2–40 caractères)" };
  if (!(Number.isInteger(position) && position >= 0 && position <= 999)) return { ok: false, error: "Position invalide (entier 0–999)" };
  return { ok: true, value: { nom, position } };
}

// --- DTO présentation d'image (presets BO / menu / ticket / kiosque) ---
// Une seule définition pour le back-office, l'API, le sync et la tablette :
// forme, cadrage, ratio, rayon et ombre sont validés partout de la même façon.
const IMAGE_FORMES = Object.freeze(["carre", "arrondi", "cercle", "bandeau"]);
const IMAGE_CADRAGES = Object.freeze(["cover", "contain"]);
const IMAGE_RATIOS = Object.freeze(["1:1", "4:3", "3:2", "16:9"]);
const PRESET_CONTEXTES = Object.freeze(["bo", "menu", "ticket", "kiosque"]);

const PRESET_DEFAUT = Object.freeze({
  bo: Object.freeze({ nom: "BO — vignette", forme: "carre", cadrage: "cover", ratio: "1:1", rayon: 8, ombre: false }),
  menu: Object.freeze({ nom: "Menu — arrondi", forme: "arrondi", cadrage: "cover", ratio: "1:1", rayon: 12, ombre: false }),
});

function validatePreset(body) {
  const nom = String(body?.nom || "").trim();
  const forme = String(body?.forme || "arrondi");
  const cadrage = String(body?.cadrage || "cover");
  const ratio = String(body?.ratio || "1:1");
  const rayon = body?.rayon === undefined || body?.rayon === null ? 12 : Number(body.rayon);
  const ombre = body?.ombre === true;
  const contexte = String(body?.contexte || "menu");
  const parDefaut = body?.par_defaut === true;
  if (nom.length < 2 || nom.length > 40) return { ok: false, error: "Nom du style obligatoire (2–40 caractères)" };
  if (!IMAGE_FORMES.includes(forme)) return { ok: false, error: "Forme invalide (carre, arrondi, cercle, bandeau)" };
  if (!IMAGE_CADRAGES.includes(cadrage)) return { ok: false, error: "Cadrage invalide (cover, contain)" };
  if (!IMAGE_RATIOS.includes(ratio)) return { ok: false, error: "Ratio invalide (1:1, 4:3, 3:2, 16:9)" };
  if (!(Number.isInteger(rayon) && rayon >= 0 && rayon <= 64)) return { ok: false, error: "Arrondi invalide (0–64)" };
  if (!PRESET_CONTEXTES.includes(contexte)) return { ok: false, error: "Contexte invalide (bo, menu, ticket, kiosque)" };
  return {
    ok: true,
    value: { nom, forme, cadrage, ratio, rayon, ombre, contexte, par_defaut: parDefaut },
  };
}

module.exports = {
  NF525_EVENT_TYPES,
  EVENT_TYPES_WITH_VALIDATOR,
  TAUX_TVA,
  PRIX_MIN,
  PRIX_MAX,
  IMAGE_FORMES,
  IMAGE_CADRAGES,
  IMAGE_RATIOS,
  PRESET_CONTEXTES,
  PRESET_DEFAUT,
  validateArticle,
  validateTable,
  validateUserMobile,
  validateCategory,
  validatePreset,
};
