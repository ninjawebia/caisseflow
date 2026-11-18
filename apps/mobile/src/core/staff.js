"use strict";
// Personnel autorisé (M3) — validation des lignes reçues par le pull avant
// stockage local. Une ligne invalide est IGNORÉE et comptée : jamais un compte
// construit sur un hash douteux. Pur, donc testé sans appareil.

const ROLES = ["gerant", "second", "serveur", "cuisine"];
// bcrypt : $2a$/$2b$/$2y$ + coût 2 chiffres + 53 caractères base64.
const BCRYPT_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const MATRICULE_RE = /^[A-Z0-9]{1,8}$/;

function normalizeStaffRows(users) {
  const rows = [];
  const rejected = [];
  const seen = new Set();

  for (const u of Array.isArray(users) ? users : []) {
    const matricule = String((u && u.matricule) || "").trim().toUpperCase();
    const nom = String((u && u.nom) || "").trim();
    const role = String((u && u.role) || "");
    const pinHash = String((u && u.pinHash) || "");

    if (!MATRICULE_RE.test(matricule)) { rejected.push({ matricule, reason: "matricule" }); continue; }
    if (seen.has(matricule)) { rejected.push({ matricule, reason: "doublon" }); continue; }
    if (nom.length < 2 || nom.length > 60) { rejected.push({ matricule, reason: "nom" }); continue; }
    if (!ROLES.includes(role)) { rejected.push({ matricule, reason: "role" }); continue; }
    if (!BCRYPT_RE.test(pinHash)) { rejected.push({ matricule, reason: "pin_hash" }); continue; }

    const version = Number.isInteger(u.version) && u.version > 0 ? u.version : 1;
    rows.push({
      matricule,
      nom,
      role,
      pinHash,
      // Le serveur renvoie un booléen ; on accepte aussi 0/1 (SQLite/JSON) —
      // seul un marqueur explicite d'inactivité désactive le compte.
      actif: u.actif === false || u.actif === 0 || u.actif === "0" ? 0 : 1,
      version,
    });
    seen.add(matricule);
  }

  return { rows, rejected };
}

// Vue « affichage » : jamais de hash de PIN dans l'UI.
function publicStaff(row) {
  return { matricule: row.matricule, nom: row.nom, role: row.role, actif: Number(row.actif) === 1 };
}

module.exports = { ROLES, BCRYPT_RE, MATRICULE_RE, normalizeStaffRows, publicStaff };
