"use strict";
// Formatage des dates du back-office — DÉTERMINISTE entre le serveur (UTC dans
// le conteneur) et le navigateur (fuseau local). Un `toLocaleString()` direct
// rendait « 21/11/2026 00:38 » côté serveur et « 21/11/2026 01:38 » côté
// client → erreur d'hydratation React. On force le fuseau du restaurant et on
// assemble les parties NUMÉRIQUES (stables quelles que soient les versions ICU).

const TIME_ZONE = "Europe/Paris";

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

const DATE_ONLY = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric", month: "2-digit", day: "2-digit",
});

function partsOf(formatter, value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const out = {};
  for (const part of formatter.formatToParts(d)) {
    if (part.type !== "literal") out[part.type] = part.value;
  }
  return out;
}

// « 21/11/2026 01:38 » — fuseau Europe/Paris, heures 00–23.
function formatDateTime(value) {
  const p = partsOf(DATE_TIME, value);
  if (!p) return "—";
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

// « 21/11/2026 » — même fuseau, pour les échéances (licence).
function formatDate(value) {
  const p = partsOf(DATE_ONLY, value);
  if (!p) return "—";
  return `${p.day}/${p.month}/${p.year}`;
}

module.exports = { formatDateTime, formatDate };
