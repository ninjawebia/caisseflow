"use strict";
// Jeton d'appareil (M1) — 32 octets aléatoires générés par le back-office et
// encodés en base64url (43 caractères), cf. POST /api/devices (SYNC-4).
// Le jeton ne quitte JAMAIS l'appareil après l'enrôlement : il est conservé
// dans le Keystore Android (expo-secure-store) et jamais journalisé.

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

// Les tablettes sont souvent alimentées par copier-coller depuis le
// back-office : on retire tous les espaces/retours à la ligne avant validation.
function normalizeToken(input) {
  return typeof input === "string" ? input.replace(/\s+/g, "") : "";
}

function isValidDeviceToken(input) {
  return TOKEN_RE.test(normalizeToken(input));
}

// Affichage : jamais le jeton complet à l'écran après saisie.
function maskToken(input) {
  const t = normalizeToken(input);
  if (t.length <= 8) return "••••";
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

module.exports = { TOKEN_RE, normalizeToken, isValidDeviceToken, maskToken };
