// Socle SQLite (M1) — base locale de la caisse, WAL activé (reprise après
// crash, SYNC-5), migrations versionnées via PRAGMA user_version.
import * as SQLite from "expo-sqlite";
import { planMigrations, latestVersion } from "../core/migrations";
import { CaisseError, CODES } from "../core/errors";
import { getSetting, setSetting } from "./settings";

const DB_NAME = "caisseflow.db";

// Ouvre la base, applique les migrations manquantes et renvoie l'état du schéma.
// Une migration = une transaction : jamais de schéma à moitié appliqué.
export async function openAndMigrate() {
  let db;
  try {
    db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync("PRAGMA journal_mode = WAL;");
    await db.execAsync("PRAGMA foreign_keys = ON;");
  } catch (e) {
    throw new CaisseError(CODES.STORAGE, "Base locale illisible — réinstallez l'application", {
      cause: e && e.message ? e.message : String(e),
    });
  }

  const row = await db.getFirstAsync("PRAGMA user_version");
  const current = Number((row && row.user_version) || 0);
  const pending = planMigrations(current);

  for (const migration of pending) {
    await db.withTransactionAsync(async () => {
      for (const statement of migration.statements) {
        await db.execAsync(statement);
      }
      await db.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
  }

  const after = Number(((await db.getFirstAsync("PRAGMA user_version")) || {}).user_version || 0);
  return {
    db,
    version: after,
    latest: latestVersion(),
    applied: pending.map((m) => m.version),
  };
}

// Les réglages vivent dans un module CommonJS sans natif (`./settings`) pour
// être testables sous Node ; on les ré-exporte ici pour les appelants de l'app.
export { getSetting, setSetting };

export { DB_NAME };
