// Journal fiscal local (M2) — adaptateur expo-sqlite : lecture de la tête de
// chaîne, écriture append-only, garde d'horloge et vérification complète.
// Aucune fonction UPDATE/DELETE n'existe ici, et les triggers SQL les refusent
// même en cas d'appel direct (FISC-1).
import * as Crypto from "expo-crypto";
import { buildEntry, guardTimestamp, verifyJournal, GENESIS_ANCHOR, checkClockSkew } from "../core/journal";
import { uuidv4FromBytes } from "../core/uuid";
import { CaisseError, CODES } from "../core/errors";
import { INSERT_SQL, insertArgs, rowToEntry, SELECT_ALL_SQL, SELECT_HEAD_SQL } from "./journal-sql";

function newUuid() {
  // Aléa natif (Keystore / CSPRNG Android) ; la logique UUID reste pure.
  return uuidv4FromBytes(Crypto.getRandomBytes(16));
}

async function head(db) {
  const row = await db.getFirstAsync(SELECT_HEAD_SQL);
  return row ? { seq: Number(row.seq), hashSelf: row.hash_self, tsLocal: row.ts_local } : null;
}

async function appendOne(db, { poste, type, user, validator, motif, data, now }) {
  const last = await head(db);
  const seq = (last ? last.seq : 0) + 1;
  const hashPrev = last ? last.hashSelf : GENESIS_ANCHOR;
  // Le module est consulté AVANT l'écriture : un recul est signalé à l'appelant.
  const clock = guardTimestamp(last ? last.tsLocal : null, now || new Date());
  const entry = buildEntry({
    poste,
    seq,
    hashPrev,
    type,
    ts: clock.ts,
    user,
    validator,
    motif,
    data,
    uuidOp: newUuid(),
  });
  await db.runAsync(INSERT_SQL, insertArgs(entry));
  return { entry, clock };
}

// Écriture métier. Si l'horloge a reculé, l'incident HORLOGE est journalisé
// AVANT l'écriture demandée (chronologie intacte, FISC-4).
export async function appendEntry(db, options) {
  const { poste, user, now } = options;
  const last = await head(db);
  const probe = guardTimestamp(last ? last.tsLocal : null, now || new Date());
  const written = [];
  let clock = probe;

  if (probe.recul) {
    const incident = await appendOne(db, {
      poste,
      type: "HORLOGE",
      user,
      motif: "Recul de l'horloge système détecté",
      data: { delta_ms: probe.deltaMs, derniere_ecriture: last.tsLocal },
      now,
    });
    written.push(incident.entry);
    clock = incident.clock;
  }

  const main = await appendOne(db, { ...options, now });
  written.push(main.entry);
  return { entry: main.entry, entries: written, clock: { ...main.clock, recul: probe.recul, deltaMs: probe.deltaMs } };
}

// Écart horloge local ↔ serveur constaté au contact (FISC-4) : au-delà du
// seuil, l'événement HORLOGE est journalisé (une fois par constat).
export async function appendServerClockEvent(db, { poste, user, skewMs, thresholdMs }) {
  const skew = checkClockSkew(0, skewMs, thresholdMs);
  if (!skew.exceeds) return null;
  const res = await appendOne(db, {
    poste,
    type: "HORLOGE",
    user,
    motif: skew.direction === "retard" ? "Horloge locale en retard sur le serveur" : "Horloge locale en avance sur le serveur",
    data: { ecart_ms: skew.skewMs, seuil_ms: skew.thresholdMs },
  });
  return res.entry;
}

// Vérification complète au démarrage / à la clôture (FISC-7).
export async function readJournalStatus(db) {
  const rows = await db.getAllAsync(SELECT_ALL_SQL);
  const entries = rows.map(rowToEntry);
  const chain = verifyJournal(entries);
  const last = rows.length ? rows[rows.length - 1] : null;
  return {
    count: rows.length,
    lastSeq: last ? Number(last.seq) : 0,
    lastHashShort: last ? String(last.hash_self).slice(0, 8) : null,
    chain,
  };
}

// Vérification bloquante du démarrage : une rupture interdit le service
// d'encaissement (aucune correction automatique possible par conception).
export async function assertChainIntact(db) {
  const status = await readJournalStatus(db);
  if (!status.chain.ok) {
    throw new CaisseError(
      CODES.STORAGE,
      `Incident de chaînage fiscal à la séquence ${status.chain.brokenSeq} (${status.chain.reason}) — service d'encaissement refusé, incident à exporter`,
      status.chain
    );
  }
  return status;
}

export { checkClockSkew };
