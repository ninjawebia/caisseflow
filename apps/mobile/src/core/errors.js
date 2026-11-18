"use strict";
// Erreurs métier du socle mobile (M1). Un `code` stable pilote l'affichage ;
// le `message` est déjà rédigé pour l'utilisateur (pas de jargon technique).

const CODES = {
  TOKEN: "TOKEN",       // jeton absent / refusé / révoqué
  LICENCE: "LICENCE",   // licence expirée ou bloquée (SYNC-6)
  NETWORK: "NETWORK",   // serveur injoignable, délai dépassé
  SERVER: "SERVER",     // réponse inattendue du serveur
  VERSION: "VERSION",   // version d'application trop ancienne (SEC-2)
  STORAGE: "STORAGE",   // Keystore / SQLite indisponible
};

class CaisseError extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.name = "CaisseError";
    this.code = code;
    this.detail = detail;
  }
}

function isCaisseError(e) {
  return e instanceof CaisseError || (e && typeof e.code === "string" && typeof e.message === "string");
}

module.exports = { CODES, CaisseError, isCaisseError };
