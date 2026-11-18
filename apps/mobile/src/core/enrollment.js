"use strict";
// Enrôlement d'une tablette (M1) : jeton + adresse serveur → validation réelle
// par un pull de référence, puis persistance sécurisée côté appelant.
// Le serveur ne renvoie le jeton qu'UNE fois (POST /api/devices) : la tablette
// le prouve en appelant /api/sync/pull (Bearer) — un jeton révoqué répond 401.

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

// Enrôlement : valide l'adresse + le jeton, puis prouve le jeton par un pull.
async function enroll({ serverUrl, token, appVersion, fetchImpl, timeoutMs }) {
  let base;
  try {
    base = normalizeServerUrl(serverUrl);
  } catch (e) {
    throw new CaisseError(CODES.SERVER, e.message);
  }

  const clean = normalizeToken(token);
  if (!clean) throw new CaisseError(CODES.TOKEN, "Jeton d'enrôlement obligatoire");
  if (!isValidDeviceToken(clean)) {
    throw new CaisseError(CODES.TOKEN, "Jeton invalide — 43 caractères attendus (copiez-le depuis l'écran « Appareils »)");
  }

  const { status, ok, data } = await postJson({
    url: apiUrl(base, "/api/sync/pull"),
    body: {},
    headers: { Authorization: `Bearer ${clean}` },
    fetchImpl,
    timeoutMs,
  });

  if (status === 401) {
    throw new CaisseError(CODES.TOKEN, "Jeton refusé — il a peut-être été révoqué (ré-enrôlez la tablette)", { status });
  }
  assertLicenceAllowsPull(status, data);
  if (!ok) {
    throw new CaisseError(CODES.SERVER, `Le serveur a refusé la demande (HTTP ${status})`, { status });
  }

  const minAppVersion = (data && data.minAppVersion) || null;
  const currentVersion = appVersion || APP_VERSION_FALLBACK;
  if (minAppVersion && isBelowVersion(currentVersion, minAppVersion)) {
    throw new CaisseError(CODES.VERSION,
      `Mise à jour obligatoire : version ${minAppVersion} minimum (installée : ${currentVersion})`,
      { minAppVersion, appVersion: currentVersion });
  }

  return {
    serverUrl: base,
    token: clean,
    licence: (data && data.licence && data.licence.etat) || "active",
    licenceLabel: licenceLabel((data && data.licence && data.licence.etat) || "active"),
    minAppVersion,
    counts: summarize(data),
  };
}

// Contrôle de connexion d'une tablette déjà enrôlée (même contrat que le pull).
async function checkConnection({ serverUrl, token, fetchImpl, timeoutMs }) {
  let base;
  try {
    base = normalizeServerUrl(serverUrl);
  } catch (e) {
    throw new CaisseError(CODES.SERVER, e.message);
  }
  const clean = normalizeToken(token);
  if (!isValidDeviceToken(clean)) throw new CaisseError(CODES.TOKEN, "Jeton d'appareil invalide");

  const { status, ok, data } = await postJson({
    url: apiUrl(base, "/api/sync/pull"),
    body: {},
    headers: { Authorization: `Bearer ${clean}` },
    fetchImpl,
    timeoutMs,
  });
  if (status === 401) throw new CaisseError(CODES.TOKEN, "Jeton révoqué — ré-enrôlez la tablette", { status });
  assertLicenceAllowsPull(status, data);
  if (!ok) throw new CaisseError(CODES.SERVER, `Le serveur a refusé la demande (HTTP ${status})`, { status });

  const etat = (data && data.licence && data.licence.etat) || "active";
  return { licence: etat, licenceLabel: licenceLabel(etat), counts: summarize(data) };
}

module.exports = { enroll, checkConnection, summarize, licenceLabel, APP_VERSION_FALLBACK };
