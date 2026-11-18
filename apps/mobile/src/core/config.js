"use strict";
// Configuration réseau de la caisse (M1). Volontairement SANS `new URL()` :
// le polyfill URL de React Native/Hermes est partiel — on valide par expression
// régulière pour un comportement identique sur l'appareil et sous Node (tests).

// Adresse par défaut : le back-office tourne sur le réseau local du restaurant
// (le cloud n'est qu'un réplica, PRD SYNC-1). Modifiable à l'enrôlement.
const DEFAULT_SERVER_URL = "http://192.168.1.10:3000";

// http(s)://hôte[:port][/chemin] — pas d'identifiants, pas de query, pas de hash.
const URL_RE = /^(https?):\/\/([A-Za-z0-9.\-]+|\[[0-9A-Fa-f:.]+\])(?::(\d{1,5}))?(\/[A-Za-z0-9._~\-\/]*)?$/i;

function normalizeServerUrl(input) {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) throw new Error("Adresse du serveur obligatoire");
  const withScheme = /^[a-z]+:\/\//i.test(raw) ? raw : `http://${raw}`;
  const candidate = withScheme.replace(/\/+$/, "");
  const m = URL_RE.exec(candidate);
  if (!m) throw new Error("Adresse invalide — attendu http://serveur:3000");
  const protocol = m[1].toLowerCase();
  const port = m[3] ? Number(m[3]) : null;
  if (port !== null && (port < 1 || port > 65535)) throw new Error("Port invalide (1–65535)");
  const path = (m[4] || "").replace(/\/+$/, "");
  return `${protocol}://${m[2].toLowerCase()}${port ? `:${port}` : ""}${path}`;
}

// Origine utilisée pour les appels API (le back-office n'accepte pas de proxy).
function apiUrl(serverUrl, route) {
  const base = normalizeServerUrl(serverUrl);
  if (typeof route !== "string" || !route.startsWith("/")) throw new Error("Route API invalide");
  return `${base}${route}`;
}

module.exports = { DEFAULT_SERVER_URL, normalizeServerUrl, apiUrl, URL_RE };
