import { cookies } from "next/headers";
import { getSessionUser, can } from "../../../lib/auth";
import { pool } from "../../../lib/db";
import { assertSameOrigin, json, audit } from "../../../lib/http";
import { sha256hex } from "../../../lib/fiscal";
import fs from "fs";
import path from "path";

// Exports fiscaux écrits sur l'hôte (bind-mount ./output/exports, UID 1000),
// surchargeable par EXPORT_DIR (prod : volume dédié). cwd = /repo/apps/web.
const EXPORT_DIR = process.env.EXPORT_DIR || path.resolve(process.cwd(), "..", "..", "output", "exports");

function csvEscape(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function rowsToCsv(rows) {
  if (rows.length === 0) return "aucune_donnee\n";
  const head = Object.keys(rows[0]);
  const lines = [head.join(";")];
  for (const r of rows) lines.push(head.map((h) => csvEscape(r[h])).join(";"));
  return lines.join("\n") + "\n";
}

function periodOf(sp) {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from || "") ? sp.from : null;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to || "") ? sp.to : null;
  return [from, to];
}

function toRows(type, jRows, zRows) {
  const j = jRows.map((r) => ({
    ref: r.ref, type: r.type, timestamp: new Date(r.timestamp).toISOString(),
    user_matricule: r.user_matricule, validator_matricule: r.validator_matricule,
    motif: r.motif, hash_prev: r.hash_prev, hash_self: r.hash_self, payload: JSON.stringify(r.payload),
  }));
  if (type === "journal") return j;
  if (type === "ventes") return jRows.filter((r) => r.type === "VENTE" || r.type === "PAIEMENT").map((r) => ({
    ref: r.ref, type: r.type, timestamp: new Date(r.timestamp).toISOString(),
    user_matricule: r.user_matricule, montant: r.payload.montant ?? r.payload.total ?? "",
  }));
  if (type === "clotures") return zRows.map((z) => ({
    date_service: z.date_service, poste: z.poste, totals: JSON.stringify(z.totals),
    nb_tickets: z.nb_tickets, first_seq: z.first_seq, last_seq: z.last_seq,
    last_hash: z.last_hash, seal_signature: z.seal_signature,
  }));
  return [
    ...j,
    ...zRows.map((z) => ({
      ref: "CLOTURE_Z/" + z.date_service + "/" + z.poste, type: "CLOTURE_Z",
      timestamp: z.date_service, user_matricule: "-", motif: "cloture signée",
      hash_prev: "-", hash_self: z.last_hash, payload: JSON.stringify(z.totals) + " seal=" + z.seal_signature,
    })),
  ];
}

// POST /api/exports — generate a signed export file (BO-5, A10 §18-19).
// The SHA-256 fingerprint is computed on the payload, then appended as a final
// EMPREINTE line; the accountant re-computes it on the payload to verify.
export async function POST(req) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "exports") || !user.restaurantId) return json({ error: "Accès refusé" }, 403);

  const body = await req.json().catch(() => null);
  const type = ["journal", "clotures", "ventes", "complet"].includes(body?.type) ? body.type : null;
  const format = ["csv", "json"].includes(body?.format) ? body.format : null;
  if (!type || !format) return json({ error: "Type ou format invalide" }, 400);
  const [from, to] = periodOf(body || {});

  // Period filter: parameterized only (no interpolation in SQL strings).
  const params = [user.restaurantId];
  let where = "restaurant_id=$1";
  if (from) { params.push(from); where += " AND \"timestamp\" >= $" + (params.length) + "::date"; }
  if (to) { params.push(to); where += " AND \"timestamp\" < ($" + (params.length) + "::date + interval '1 day')"; }

  const jRows = type === "clotures" ? [] : (
    await pool.query(
      "SELECT ref, type, \"timestamp\", user_matricule, validator_matricule, motif, hash_prev, hash_self, payload FROM journal_replica WHERE " + where + " ORDER BY \"timestamp\"",
      params
    )
  ).rows;
  const zRows = type === "ventes" ? [] : (
    await pool.query(
      "SELECT date_service, poste, totals, nb_tickets, first_seq, last_seq, last_hash, seal_signature FROM clotures WHERE restaurant_id=$1 ORDER BY date_service",
      [user.restaurantId]
    )
  ).rows;

  const rows = toRows(type, jRows, zRows);
  let payload;
  let mime;
  if (format === "csv") {
    payload = rowsToCsv(rows);
    mime = "text/csv; charset=utf-8";
  } else {
    payload = JSON.stringify({ restaurant: user.restaurantId, type, from_period: from, to_period: to, generated_at: new Date().toISOString(), rows }, null, 2) + "\n";
    mime = "application/json; charset=utf-8";
  }

  const empreinte = sha256hex(payload);
  const stamped = payload + (format === "csv"
    ? "EMPREINTE_SHA256;" + empreinte + "\n"
    : "# EMPREINTE SHA-256 du contenu (hors cette ligne) : " + empreinte + "\n");

  const id = crypto.randomUUID();
  const fileName = id + "-" + type + "-" + new Date().toISOString().slice(0, 10) + "." + format;
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(EXPORT_DIR, fileName), stamped, "utf8");

  await pool.query(
    "INSERT INTO exports (id, restaurant_id, demandeur_id, type, format, from_period, to_period, fichier, empreinte) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [id, user.restaurantId, user.id, type, format, from, to, fileName, empreinte]
  );
  await audit(user, "export", "exports", id, { type, format, from, to, empreinte, nb: rows.length });

  const saved = await pool.query(
    "SELECT id, type, format, from_period, to_period, empreinte, created_at FROM exports WHERE id=$1", [id]
  );
  return json({ export: saved.rows[0] }, 201);
}
