"use strict";
// Validation d'entrées partagée par les routes API. Une valeur mal formée
// (identifiant, date) doit produire une réponse explicite (404/400) et JAMAIS
// un 500 PostgreSQL (`invalid input syntax for type uuid` / `date/time`).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

module.exports = { isUuid };
