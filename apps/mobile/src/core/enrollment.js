"use strict";
// Enrôlement d'une tablette (M1) + pull de référence (M3/M4) : jeton + adresse
// serveur → validation réelle par un pull, puis persistance sécurisée côté
// appelant. Le serveur ne renvoie le jeton qu'UNE fois (POST /api/devices) : la
// tablette le prouve en appelant /api/sync/pull (Bearer) — révoqué ⇒ 401.

const { CaisseError, CODES } = require("./errors");
const { normalizeServerUrl, apiUrl } = require("./config");
const { normalizeToken, isValidDeviceToken } = require("./token");
const { postJson } = require("./http");
const { isBelowVersion } = require("./version");

const APP_VERSION_FALLBACK = "0.0.0";

function licenceLabel(etat) {
  const labels = {
    active: "Licence active",
    grace1: "Licence — rappel",
    grace2: "Licence — cloud suspendu",
    bloquee: "Licence bloquée",
  };
  return labels[etat] || `Licence : ${etat || "inconnue"}`;
}

function summarize(data) {
  const arr = (v) => (Array.isArray(v) ? v.length : 0);
  return {
    categories: arr(data && data.categories),
    articles: arr(data && data.articles),
    users: arr(data && data.users),
    tables: arr(data && data.tables),
  };
}

function assertLicenceAllowsPull(status, data) {
  if (status === 403) {
    const raison = (data && data.error) || "licence expirée ou bloquée";
    throw new CaisseError(CODES.LICENCE, `Synchronisation refusée : ${raison}`, { status });
  }
}

// Pull de référence brut (menu, TVA, personnel, tables) — contrat SYNC-3.
// `since` (ISO) permet le delta sur les articles (M4).
async function pullReference({ serverUrl, token, since, fetchImpl, timeoutMs }) {
  let base;
  try {
    base = normalizeServerUrl(serverUrl);
  } catch (e) {
    throw new CaisseError(CODES.SERVER, e.message);
  }
  const clean = normalizeToken(token);
  if (!isValidDeviceToken(clean)) throw new CaisseError(CODES.TOKEN, "Jeton d'appareil invalide");

  const suffix = since ? `?since=${encodeURIComponent(since)}` : "";
  const { status, ok, data } = await postJson({
    url: apiUrl(base, `/api/sync/pull${suffix}`),
    body: {},
    headers: { Authorization: `Bearer ${clean}` },
    fetchImpl,
    timeoutMs,
  });

  if (status === 401) {
    throw new CaisseError(CODES.TOKEN, "Jeton refusé — il a peut-être été révoqué (ré-enrôlez la tablette)", { status });
  }
  assertLicenceAllowsPull(status, data);
  if (!ok) throw new CaisseError(CODES.SERVER, `Le serveur a refusé la demande (HTTP ${status})`, { status });

  const minAppVersion = (data && data.minAppVersion) || null;
  const etat = (data && data.licence && data.licence.etat) || "active";

  return {
    serverUrl: base,
    token: clean,
    poste: (data && data.poste) || null,
    licence: etat,
    licenceLabel: licenceLabel(etat),
    minAppVersion,
    serverTime: (data && data.serverTime) || null,
    categories: (data && data.categories) || [],
    articles: (data && data.articles) || [],
    users: (data && data.users) || [],
    tables: (data && data.tables) || [],
  };
}

function assertAppVersion(appVersion, minAppVersion) {
  const currentVersion = appVersion || APP_VERSION_FALLBACK;
  if (minAppVersion && isBelowVersion(currentVersion, minAppVersion)) {
    throw new CaisseError(CODES.VERSION,
      `Mise à jour obligatoire : version ${minAppVersion} minimum (installée : ${currentVersion})`,
      { minAppVersion, appVersion: currentVersion });
  }
}

// Enrôlement : valide l'adresse + le jeton, puis prouve le jeton par un pull.
async function enroll({ serverUrl, token, appVersion, fetchImpl, timeoutMs }) {
  const clean = normalizeToken(token);
  if (!clean) throw new CaisseError(CODES.TOKEN, "Jeton d'enrôlement obligatoire");
  if (!isValidDeviceToken(clean)) {
    throw new CaisseError(CODES.TOKEN, "Jeton invalide — 43 caractères attendus (copiez-le depuis l'écran « Appareils »)");
  }

  const pulled = await pullReference({ serverUrl, token: clean, fetchImpl, timeoutMs });
  assertAppVersion(appVersion, pulled.minAppVersion);

  return {
    serverUrl: pulled.serverUrl,
    token: pulled.token,
    poste: pulled.poste,
    licence: pulled.licence,
    licenceLabel: pulled.licenceLabel,
    minAppVersion: pulled.minAppVersion,
    serverTime: pulled.serverTime,
    counts: {
      categories: pulled.categories.length,
      articles: pulled.articles.length,
      users: pulled.users.length,
      tables: pulled.tables.length,
    },
    // La carte téléchargée à l'enrôlement est persistée telle quelle : la
    // tablette doit pouvoir prendre une commande hors ligne dès la première
    // connexion (aucun second appel réseau, M4).
    reference: {
      categories: pulled.categories,
      articles: pulled.articles,
      tables: pulled.tables,
    },
    // Le personnel est persisté dès l'enrôlement : la connexion PIN doit
    // fonctionner hors ligne immédiatement après (M3).
    staff: pulled.users,
  };
}

// Contrôle de connexion d'une tablette déjà enrôlée (même contrat que le pull).
async function checkConnection({ serverUrl, token, fetchImpl, timeoutMs }) {
  const pulled = await pullReference({ serverUrl, token, fetchImpl, timeoutMs });
  return {
    licence: pulled.licence,
    licenceLabel: pulled.licenceLabel,
    serverTime: pulled.serverTime,
    counts: {
      categories: pulled.categories.length,
      articles: pulled.articles.length,
      users: pulled.users.length,
      tables: pulled.tables.length,
    },
  };
}

module.exports = { enroll, checkConnection, pullReference, summarize, licenceLabel, assertAppVersion, APP_VERSION_FALLBACK };
