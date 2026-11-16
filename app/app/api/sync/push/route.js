import { deviceAuth, syncAllowed } from "../../../../lib/device";
import { pool } from "../../../../lib/db";
import { json } from "../../../../lib/http";
import { verifyChain, nextHash } from "../../../../lib/fiscal";

// POST /api/sync/push — append-only replication of the local fiscal journal
// (PRD 7.3 SYNC-1/2, 9.2 endpoint 1). Idempotent on (restaurant_id, uuid_op):
// replaying the same batch never duplicates an entry (SYNC-1).
export async function POST(req) {
  const device = await deviceAuth(req);
  if (!device) return json({ error: "Jeton d'appareil invalide" }, 401);

  if (!syncAllowed(device.licence)) {
    // Licence suspended (grace2/bloquee): local caisse keeps working, cloud sync
    // is suspended (PRD LIC-3). No fiscal data is ever deleted or blocked.
    return json({ error: "Synchronisation suspendue — état de licence", licence: { etat: device.licence } }, 403);
  }

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.entries)) return json({ error: "Requête invalide" }, 400);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Current chain head for this restaurant + poste.
    const head = await client.query(
      `SELECT seq, hash_self FROM journal_replica
       WHERE restaurant_id=$1 AND poste=$2 ORDER BY seq DESC LIMIT 1`,
      [device.restaurantId, device.poste]
    );
    let expectedSeq = head.rows[0] ? head.rows[0].seq + 1 : 1;
    let prevHash = head.rows[0] ? head.rows[0].hash_self : nextHash("", {}) && null;
    if (!head.rows[0]) prevHash = null; // genesis handled below

    // Sort entries by seq (batch order preserved, SYNC-7).
    const entries = [...body.entries].sort((a, b) => a.seq - b.seq);
    let accepted = 0, duplicates = 0, rejected = 0;
    const rejects = [];

    for (const e of entries) {
      const uuidOp = String(e.uuidOp || "");
      if (!/^[0-9a-f-]{36}$/i.test(uuidOp)) { rejected++; rejects.push({ seq: e.seq, reason: "uuid_invalide" }); continue; }
      if (!Number.isInteger(e.seq) || e.seq < 1 || e.seq > 100000000) { rejected++; rejects.push({ seq: e.seq, reason: "seq_invalide" }); continue; }
      if (!e.hashSelf || !e.hashPrev || !/^[0-9a-f]{64}$/.test(e.hashSelf)) { rejected++; rejects.push({ seq: e.seq, reason: "hash_invalide" }); continue; }

      // Idempotence: same operation UUID already replicated → count, skip.
      const dup = await client.query(
        "SELECT 1 FROM journal_replica WHERE restaurant_id=$1 AND uuid_op=$2",
        [device.restaurantId, uuidOp]
      );
      if (dup.rowCount > 0) { duplicates++; continue; }

      // Continuity: seq must extend the local head (numbering stays continuous).
      if (e.seq !== expectedSeq) {
        // Already-known seq (e.g. re-push of an old entry) → idempotent duplicate.
        const known = await client.query(
          "SELECT 1 FROM journal_replica WHERE restaurant_id=$1 AND poste=$2 AND seq=$3",
          [device.restaurantId, device.poste, e.seq]
        );
        if (known.rowCount > 0) { duplicates++; continue; }
        rejected++; rejects.push({ seq: e.seq, reason: "seq_non_continue", attendu: expectedSeq });
        continue;
      }

      // Chain verification (FISC-2): hash_prev must match the current head, and
      // hash_self must be SHA-256(hash_prev || canonical payload).
      const genesis = expectedSeq === 1;
      const prevCheck = genesis ? e.hashPrev === require("../../../../lib/fiscal").sha256hex("GENESIS") : e.hashPrev === prevHash;
      const selfCheck = e.hashSelf === nextHash(e.hashPrev, e.payload);
      if (!prevCheck || !selfCheck) {
        rejected++; rejects.push({ seq: e.seq, reason: prevCheck ? "chaînage_invalide" : "hash_invalide" });
        continue;
      }

      const types = ["VENTE", "PAIEMENT", "TICKET", "ANNULATION", "REMISE", "CHANGEMENT_PRIX", "SESSION", "HORLOGE", "CLOTURE_Z", "IMPRESSION"];
      if (!types.includes(e.type)) { rejected++; rejects.push({ seq: e.seq, reason: "type_inconnu" }); continue; }

      await client.query(
        `INSERT INTO journal_replica
         (restaurant_id, poste, seq, ref, uuid_op, type, "timestamp", user_matricule, validator_matricule, motif, payload, hash_prev, hash_self)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [device.restaurantId, device.poste, e.seq, e.ref || `POSTE-${e.seq}`,
          uuidOp, e.type, e.timestamp ? new Date(e.timestamp) : new Date(),
          String(e.userMatricule || "?"), e.validatorMatricule || null, e.motif || null,
          JSON.stringify(e.payload), e.hashPrev, e.hashSelf]
      );
      accepted++;
      expectedSeq = e.seq + 1;
      prevHash = e.hashSelf;
    }

    // Z closings: insert with dedupe on (restaurant_id, poste, date_service).
    let zAccepted = 0;
    for (const z of body.clotures || []) {
      const dupZ = await client.query(
        "SELECT 1 FROM clotures WHERE restaurant_id=$1 AND poste=$2 AND date_service=$3",
        [device.restaurantId, device.poste, String(z.date).slice(0, 10)]
      );
      if (dupZ.rowCount > 0) { duplicates++; continue; }
      await client.query(
        `INSERT INTO clotures (restaurant_id, date_service, poste, totals, nb_tickets, first_seq, last_seq, last_hash, seal_signature)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [device.restaurantId, String(z.date).slice(0, 10), device.poste,
          JSON.stringify(z.totals || {}), Number(z.nbTickets || 0),
          Number(z.firstSeq || 0), Number(z.lastSeq || 0), String(z.lastHash || ""), String(z.sealSignature || "")]
      );
      zAccepted++;
    }

    await client.query(
      `INSERT INTO sync_logs (restaurant_id, poste, accepted, duplicates, rejected, chain_verified)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [device.restaurantId, device.poste, accepted, duplicates, rejected, rejects.length === 0]
    );

    await client.query("COMMIT");

    // The server never rewrites or corrects the journal (PRD SYNC-2): it either
    // accepts verified entries or rejects the batch with an explicit incident.
    return json({
      accepted, duplicates, rejected, zAccepted,
      chainVerified: rejects.length === 0,
      rejectedDetails: rejects.slice(0, 10),
      licence: { etat: device.licence },
    });
  } catch (e) {
    await client.query("ROLLBACK");
    return json({ error: "Erreur de réplication — lot rejeté" }, 500);
  } finally {
    client.release();
  }
}
