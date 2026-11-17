"use strict";
// Clés de licence signées (LIC, PRD ch. 8) — modèle « Office » : le logiciel
// vérifie une signature asymétrique EN LOCAL, sans serveur de licences.
//
//   Clé = "CF-" + base64url(payload JSON) + "." + base64url(signature Ed25519)
//   payload = { rid: restaurantId, exp: "AAAA-MM-JJ" (optionnel), plan: "pro" }
//
// La clé privée (génération) reste chez l'opérateur : make license-keygen →
// infra/keys/owner/ (JAMAIS commitée). La vérification n'a besoin que de la
// clé publique.
//
// ÉTAT EXPIRÉ (décision opérateur) : les ÉCRITURES sont refusées (403) mais la
// consultation, le journal et les EXPORTS FISCAUX restent accessibles (NF525 /
// LIC-4 — on ne verrouille jamais l'accès aux données fiscales).
const crypto = require("crypto");
const { pool } = require("./db");

// Clé publique DEV (commitée) : ne sert qu'en préprod/démo — toute personne
// disposant du dépôt peut forger des clés DEV. En production, définir
// LICENSE_PUBLIC_KEY avec la paire propriétaire (make license-keygen).
const DEV_PUBLIC_KEY = [
  "-----BEGIN PUBLIC KEY-----",
  "MCowBQYDK2VwAyEAX6VpmanDqdq4yF1399x6vPBb+8zc897TNPmhlQjkHuw=",
  "-----END PUBLIC KEY-----",
].join("\n");

function publicKeyPem() {
  return process.env.LICENSE_PUBLIC_KEY || DEV_PUBLIC_KEY;
}

// Signature d'un payload avec une clé privée (usage : générateur + tests).
function signLicense(payload, privatePem) {
  const raw = Buffer.from(JSON.stringify(payload), "utf8");
  const sig = crypto.sign(null, raw, crypto.createPrivateKey(privatePem));
  return `CF-${raw.toString("base64url")}.${sig.toString("base64url")}`;
}

// Vérification complète d'une clé pour un restaurant donné.
// → { ok:true, payload } | { ok:false, error }
function verifyKey(str, restaurantId) {
  const s = String(str || "").trim();
  const m = /^CF-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(s);
  if (!m) return { ok: false, error: "Format de clé invalide (attendu : CF-…)" };
  let raw, sig, payload;
  try {
    raw = Buffer.from(m[1], "base64url");
    sig = Buffer.from(m[2], "base64url");
  } catch {
    return { ok: false, error: "Format de clé invalide" };
  }
  let valid = false;
  try {
    valid = crypto.verify(null, raw, crypto.createPublicKey(publicKeyPem()), sig);
  } catch {
    return { ok: false, error: "Clé publique du logiciel invalide (LICENSE_PUBLIC_KEY)" };
  }
  if (!valid) return { ok: false, error: "Clé invalide — signature refusée" };
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return { ok: false, error: "Contenu de clé illisible" };
  }
  if (!payload || payload.rid !== restaurantId) {
    return { ok: false, error: "Cette clé appartient à un autre restaurant" };
  }
  if (payload.exp !== undefined && payload.exp !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.exp)) return { ok: false, error: "Date d'expiration illisible dans la clé" };
    const today = new Date().toISOString().slice(0, 10);
    if (payload.exp < today) return { ok: false, error: `Clé expirée le ${payload.exp}` };
  }
  if (payload.plan !== undefined && typeof payload.plan !== "string") return { ok: false, error: "Plan illisible dans la clé" };
  return { ok: true, payload };
}

// Empreinte courte d'une clé (détection de réutilisation / identification).
function fingerprint(str) {
  return crypto.createHash("sha256").update(String(str || "").trim()).digest("hex").slice(0, 16);
}

// État courant de la licence d'un restaurant :
//   { ok:true, state:"active" }            → écritures et sync autorisés
//   { ok:false, state:"expiree"|"bloquee" } → écritures refusées, lecture/exports OK
async function licenceGate(restaurantId) {
  const r = await pool.query("SELECT etat, expires_at FROM licences WHERE restaurant_id = $1", [restaurantId]);
  const row = r.rows[0];
  if (!row) return { ok: false, state: "bloquee", error: "Aucune licence enregistrée — contactez votre revendeur" };
  // Format local YYYY-MM-DD (une colonne DATE est minuit local — toISOString
  // la décalerait d'un jour selon le fuseau).
  const today = new Date().toLocaleDateString("en-CA");
  const expires = row.expires_at ? new Date(row.expires_at).toLocaleDateString("en-CA") : null;
  if (expires && expires < today) {
    return { ok: false, state: "expiree", error: `Licence expirée le ${expires} — activez une nouvelle clé (page Licence)` };
  }
  if (row.etat === "bloquee" || row.etat === "grace2") {
    return { ok: false, state: "bloquee", error: "Licence bloquée — contactez votre revendeur" };
  }
  return { ok: true, state: "active" };
}

module.exports = { verifyKey, signLicense, fingerprint, licenceGate, DEV_PUBLIC_KEY };
