"use strict";
// Pagination partagée par les pages serveur — source unique du calcul
// page / limit / offset, des bornes affichées et des liens de navigation.
// Une valeur `?page=` invalide (négative, texte, absente) retombe sur la page 1,
// et une page au-delà de la dernière est ramenée à la dernière : jamais d'écran
// vide sur un lien périmé.

const DEFAULT_LIMIT = 20;

function parsePage(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

function pageCount(total, limit) {
  const n = Number(total) || 0;
  const size = Number(limit) || DEFAULT_LIMIT;
  return Math.max(1, Math.ceil(n / size));
}

function clampPage(page, total, limit) {
  return Math.min(Math.max(1, Number(page) || 1), pageCount(total, limit));
}

function rangeLabel(page, limit, total) {
  const n = Number(total) || 0;
  if (n === 0) return "Aucun résultat";
  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, n);
  return `${first}–${last} sur ${n}`;
}

// Lien de pagination : conserve les filtres actifs, omet `page=1` (URL propre).
function pageHref(basePath, params, page) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (key === "page" || value === null || value === undefined || value === "") continue;
    qs.set(key, String(value));
  }
  if (page > 1) qs.set("page", String(page));
  const query = qs.toString();
  return query ? `${basePath}?${query}` : basePath;
}

module.exports = {
  parsePage,
  pageCount,
  clampPage,
  rangeLabel,
  pageHref,
};
