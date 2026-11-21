"use strict";
// Emplacement unique des fichiers d'export fiscal. La génération (POST) et le
// téléchargement (GET) DOIVENT lire la même constante : deux chemins différents
// produisaient « Fichier d'export indisponible » alors que le fichier existait.
// Le bind-mount compose monte ./output/exports (UID 1000) ; EXPORT_DIR permet de
// surcharger (prod).
const path = require("path");

const EXPORT_DIR = process.env.EXPORT_DIR
  || path.resolve(process.cwd(), "..", "..", "output", "exports");

// Chemin sûr d'un fichier d'export : nom de base uniquement, jamais de
// traversée hors du répertoire (une valeur DB compromise ne doit pas lire /etc).
function exportFilePath(fileName) {
  const base = path.basename(String(fileName || ""));
  if (!base || base === "." || base === "..") return null;
  const root = path.resolve(EXPORT_DIR);
  const target = path.resolve(root, base);
  if (target !== path.join(root, base)) return null;
  return target;
}

module.exports = { EXPORT_DIR, exportFilePath };
