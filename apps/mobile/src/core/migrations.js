"use strict";
// Schéma local SQLite versionné (M1). Chaque module ajoute SA migration, jamais
// de modification d'une migration déjà livrée : une tablette en production ne
// peut pas être migrée en réécrivant l'histoire. `PRAGMA user_version` porte le
// numéro appliqué ; le planificateur (`planMigrations`) est pur et testé.

const { CaisseError, CODES } = require("./errors");

// Migration 1 — socle : réglages locaux de la tablette uniquement.
// Le journal fiscal (M2) et les données de référence (M4) viendront dans des
// migrations séparées, avec leurs propres garanties (triggers append-only).
const MIGRATIONS = [
  {
    version: 1,
    name: "socle",
    statements: [
      `CREATE TABLE IF NOT EXISTS settings (
         key TEXT PRIMARY KEY,
         value TEXT,
         updated_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
      `INSERT OR IGNORE INTO settings (key, value) VALUES
         ('device.poste', NULL),
         ('device.label', NULL),
         ('last.pull.at', NULL)`,
    ],
  },
  {
    version: 2,
    name: "journal",
    statements: [
      // Journal Permanent local : append-only par construction (FISC-1).
      `CREATE TABLE IF NOT EXISTS journal (
         seq INTEGER PRIMARY KEY,
         uuid_op TEXT NOT NULL UNIQUE,
         ref TEXT NOT NULL UNIQUE,
         type TEXT NOT NULL CHECK (type IN
           ('VENTE','PAIEMENT','TICKET','ANNULATION','REMISE','CHANGEMENT_PRIX',
            'SESSION','HORLOGE','CLOTURE_Z','IMPRESSION')),
         ts_local TEXT NOT NULL,
         user_matricule TEXT NOT NULL CHECK (length(trim(user_matricule)) BETWEEN 1 AND 16),
         user_nom TEXT NOT NULL CHECK (length(trim(user_nom)) BETWEEN 1 AND 60),
         validator_matricule TEXT,
         motif TEXT,
         payload TEXT NOT NULL,
         hash_prev TEXT NOT NULL CHECK (length(hash_prev) = 64 AND hash_prev NOT GLOB '*[^0-9a-f]*'),
         hash_self TEXT NOT NULL CHECK (length(hash_self) = 64 AND hash_self NOT GLOB '*[^0-9a-f]*'),
         created_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
      // La séquence ne peut pas sauter ni reculer (numérotation continue).
      `CREATE TRIGGER IF NOT EXISTS journal_seq_continue
         BEFORE INSERT ON journal
         WHEN NEW.seq != (SELECT COALESCE(MAX(seq), 0) + 1 FROM journal)
       BEGIN
         SELECT RAISE(ABORT, 'Journal Permanent : séquence non continue');
       END`,
      // Aucune modification, aucune suppression — même par SQL direct.
      `CREATE TRIGGER IF NOT EXISTS journal_no_update
         BEFORE UPDATE ON journal
       BEGIN
         SELECT RAISE(ABORT, 'Journal Permanent : UPDATE interdit (append-only)');
       END`,
      `CREATE TRIGGER IF NOT EXISTS journal_no_delete
         BEFORE DELETE ON journal
       BEGIN
         SELECT RAISE(ABORT, 'Journal Permanent : DELETE interdit (append-only)');
       END`,
      `CREATE INDEX IF NOT EXISTS idx_journal_type ON journal(type)`,
      `CREATE INDEX IF NOT EXISTS idx_journal_ts ON journal(ts_local)`,
    ],
  },
  {
    version: 3,
    name: "auth",
    statements: [
      // Personnel autorisé sur cette tablette (données de RÉFÉRENCE : dernière
      // version serveur gagnante, pas de caractère fiscal). Le PIN ne circule
      // que sous forme de hash bcrypt — la validation reste 100 % locale.
      `CREATE TABLE IF NOT EXISTS staff (
         matricule TEXT PRIMARY KEY,
         nom TEXT NOT NULL,
         role TEXT NOT NULL CHECK (role IN ('gerant','second','serveur','cuisine')),
         pin_hash TEXT NOT NULL,
         actif INTEGER NOT NULL DEFAULT 1,
         version INTEGER NOT NULL DEFAULT 1,
         synced_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
      // Compteur d'échecs et verrouillage (5 échecs → blocage temporaire).
      `CREATE TABLE IF NOT EXISTS auth_state (
         matricule TEXT PRIMARY KEY,
         failures INTEGER NOT NULL DEFAULT 0,
         locked_until TEXT,
         last_failure_at TEXT,
         last_success_at TEXT
       )`,
      // Journal local des connexions (séparé du journal FISCAL : une connexion
      // n'est pas un événement fiscal et ne doit pas polluer le chaînage).
      `CREATE TABLE IF NOT EXISTS auth_events (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         ts TEXT NOT NULL,
         matricule TEXT NOT NULL,
         event TEXT NOT NULL CHECK (event IN
           ('login_ok','login_fail','lockout','auto_lock','manual_lock','staff_sync')),
         detail TEXT
       )`,
      `CREATE INDEX IF NOT EXISTS idx_auth_events_ts ON auth_events(ts)`,
    ],
  },
  {
    version: 4,
    name: "reference",
    statements: [
      // Données de RÉFÉRENCE (SYNC-3) : cache local, dernière version serveur
      // gagnante. Aucun caractère fiscal : le journal reste la seule source de
      // vérité des ventes.
      `CREATE TABLE IF NOT EXISTS categories (
         id TEXT PRIMARY KEY,
         nom TEXT NOT NULL,
         position INTEGER NOT NULL DEFAULT 0,
         actif INTEGER NOT NULL DEFAULT 1,
         synced_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
      // Prix en CENTIMES (entier) : aucun flottant dans les montants. Un
      // article peut arriver avant sa catégorie (pull delta) → pas de FK.
      `CREATE TABLE IF NOT EXISTS articles (
         id TEXT PRIMARY KEY,
         categorie_id TEXT,
         nom TEXT NOT NULL,
         prix_ttc_cents INTEGER NOT NULL
           CHECK (typeof(prix_ttc_cents) = 'integer' AND prix_ttc_cents BETWEEN 0 AND 1000000),
         taux_tva REAL NOT NULL CHECK (taux_tva BETWEEN 0 AND 100),
         actif INTEGER NOT NULL DEFAULT 1,
         version INTEGER NOT NULL DEFAULT 1,
         photo_hash TEXT,
         updated_at TEXT,
         synced_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
      `CREATE INDEX IF NOT EXISTS idx_articles_categorie ON articles(categorie_id)`,
      `CREATE TABLE IF NOT EXISTS tables_resto (
         id TEXT PRIMARY KEY,
         nom TEXT NOT NULL,
         salle TEXT NOT NULL DEFAULT 'Salle 1',
         places INTEGER NOT NULL
           CHECK (typeof(places) = 'integer' AND places BETWEEN 1 AND 20),
         actif INTEGER NOT NULL DEFAULT 1,
         synced_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
    ],
  },
  {
    version: 5,
    name: "commandes",
    statements: [
      // Commandes en cours (M5). Ce sont des BROUILLONS locaux : rien n'entre
      // au journal avant l'envoi en cuisine (POS-3), qui écrit une VENTE.
      `CREATE TABLE IF NOT EXISTS commandes (
         id TEXT PRIMARY KEY,
         poste TEXT NOT NULL CHECK (length(trim(poste)) BETWEEN 1 AND 16),
         type TEXT NOT NULL CHECK (type IN ('TABLE','COMPTOIR')),
         table_id TEXT,
         table_nom TEXT,
         statut TEXT NOT NULL DEFAULT 'OUVERTE' CHECK (statut IN ('OUVERTE','ENVOYEE','ENCAISSEE')),
         total_ttc_cents INTEGER NOT NULL DEFAULT 0
           CHECK (typeof(total_ttc_cents) = 'integer' AND total_ttc_cents BETWEEN 0 AND 100000000),
         created_by TEXT NOT NULL,
         created_by_nom TEXT NOT NULL,
         created_at TEXT NOT NULL,
         sent_at TEXT,
         journal_ref TEXT,
         CHECK ((type = 'TABLE' AND table_id IS NOT NULL AND table_nom IS NOT NULL)
             OR (type = 'COMPTOIR' AND table_id IS NULL))
       )`,
      // Une table = UNE commande active au maximum (POS-1) : garanti par la base,
      // pas seulement par l'écran. Une commande envoyée occupe encore la table
      // jusqu'à l'encaissement.
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_commandes_table_active
         ON commandes(poste, table_id)
         WHERE statut IN ('OUVERTE','ENVOYEE') AND table_id IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_commandes_active
         ON commandes(poste, statut)`,
      // Lignes : prix FIGÉ à l'ajout (snapshot, POS-2). Aucun lien de prix vers
      // `articles` : un changement de prix au back-office ne réécrit jamais une
      // commande en cours.
      `CREATE TABLE IF NOT EXISTS commande_lignes (
         id TEXT PRIMARY KEY,
         commande_id TEXT NOT NULL REFERENCES commandes(id) ON DELETE RESTRICT,
         article_id TEXT NOT NULL,
         nom TEXT NOT NULL,
         prix_ttc_cents INTEGER NOT NULL
           CHECK (typeof(prix_ttc_cents) = 'integer' AND prix_ttc_cents BETWEEN 0 AND 1000000),
         taux_tva REAL NOT NULL CHECK (taux_tva BETWEEN 0 AND 100),
         qte INTEGER NOT NULL CHECK (typeof(qte) = 'integer' AND qte BETWEEN 1 AND 99),
         envoyee INTEGER NOT NULL DEFAULT 0 CHECK (envoyee IN (0,1)),
         created_at TEXT NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS idx_commande_lignes_cmd ON commande_lignes(commande_id)`,
    ],
  },
  {
    version: 6,
    name: "images",
    statements: [
      // Présentation des images (v0.5). Les photos restent des FICHIERS
      // servis par le serveur : seule leur empreinte est stockée ici (aucun
      // binaire dans SQLite). Un style résolu accompagne chaque ligne — un
      // article/catégorie sans style propre reçoit le défaut du menu.
      `ALTER TABLE categories ADD COLUMN photo_hash TEXT`,
      `ALTER TABLE categories ADD COLUMN photo_updated_at TEXT`,
      `ALTER TABLE categories ADD COLUMN preset_forme TEXT`,
      `ALTER TABLE categories ADD COLUMN preset_cadrage TEXT`,
      `ALTER TABLE categories ADD COLUMN preset_ratio TEXT`,
      `ALTER TABLE categories ADD COLUMN preset_rayon INTEGER`,
      `ALTER TABLE categories ADD COLUMN preset_ombre INTEGER`,
      `ALTER TABLE articles ADD COLUMN preset_forme TEXT`,
      `ALTER TABLE articles ADD COLUMN preset_cadrage TEXT`,
      `ALTER TABLE articles ADD COLUMN preset_ratio TEXT`,
      `ALTER TABLE articles ADD COLUMN preset_rayon INTEGER`,
      `ALTER TABLE articles ADD COLUMN preset_ombre INTEGER`,
    ],
  },
];

function latestVersion() {
  return MIGRATIONS.length ? MIGRATIONS[MIGRATIONS.length - 1].version : 0;
}

// Valide l'inventaire (une seule fois par appel — coût négligeable).
function assertMigrationSet() {
  let previous = 0;
  for (const m of MIGRATIONS) {
    if (!Number.isInteger(m.version) || m.version !== previous + 1) {
      throw new CaisseError(CODES.STORAGE, `Migrations incohérentes : version ${m.version} après ${previous}`);
    }
    if (!Array.isArray(m.statements) || m.statements.length === 0) {
      throw new CaisseError(CODES.STORAGE, `Migration ${m.version} vide`);
    }
    if (m.statements.some((s) => typeof s !== "string" || !s.trim())) {
      throw new CaisseError(CODES.STORAGE, `Migration ${m.version} : instruction SQL vide`);
    }
    previous = m.version;
  }
}

// Plan des migrations à appliquer depuis `current` (PRAGMA user_version).
// - base neuve (0) → toutes les migrations ;
// - base à jour → aucune ;
// - base plus récente que l'app → refus explicite (aucune écriture, l'appareil
//   doit être mis à jour : jamais de rétrogradation silencieuse).
function planMigrations(current) {
  assertMigrationSet();
  if (current === null || current === undefined || current === "" || typeof current === "boolean") {
    throw new CaisseError(CODES.STORAGE, `Version de schéma invalide : ${current}`);
  }
  const from = Number(current);
  if (!Number.isInteger(from) || from < 0) {
    throw new CaisseError(CODES.STORAGE, `Version de schéma invalide : ${current}`);
  }
  const latest = latestVersion();
  if (from > latest) {
    throw new CaisseError(CODES.STORAGE,
      `Base locale écrite par une version plus récente de l'application (schéma ${from} > ${latest}) — mettez l'application à jour`);
  }
  return MIGRATIONS.filter((m) => m.version > from);
}

module.exports = { MIGRATIONS, latestVersion, planMigrations, assertMigrationSet };
