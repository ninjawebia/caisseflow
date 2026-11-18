"use strict";
// Versions applicatives (M1) — le pull renvoie `minAppVersion` (SEC-2) : une
// caisse trop ancienne doit être mise à jour avant de continuer à encaisser.

const VERSION_RE = /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/;

function parseVersion(input) {
  const m = VERSION_RE.exec(typeof input === "string" ? input.trim() : "");
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareVersions(a, b) {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va) throw new Error(`Version invalide : ${a}`);
  if (!vb) throw new Error(`Version invalide : ${b}`);
  for (let i = 0; i < 3; i += 1) {
    if (va[i] !== vb[i]) return va[i] < vb[i] ? -1 : 1;
  }
  return 0;
}

// true si `version` est strictement antérieure au minimum exigé.
function isBelowVersion(version, minimum) {
  return compareVersions(version, minimum) < 0;
}

module.exports = { VERSION_RE, parseVersion, compareVersions, isBelowVersion };
