import { deviceAuth } from "../../../../lib/device";
import { pool } from "../../../../lib/db";
import { json } from "../../../../lib/http";

// GET /api/licence/status — licence state for the device (PRD LIC-1).
export async function GET(req) {
  const device = await deviceAuth(req);
  if (!device) return json({ error: "Jeton d'appareil invalide" }, 401);
  const r = await pool.query(
    `SELECT etat, impayee_depuis, grace1_at, grace2_at, bloque_at FROM licences WHERE restaurant_id=$1`,
    [device.restaurantId]
  );
  const lic = r.rows[0];
  return json({
    restaurantId: device.restaurantId,
    poste: device.poste,
    etat: lic?.etat || "active",
    phases: lic ? {
      impayeeDepuis: lic.impayee_depuis,
      grace1At: lic.grace1_at,
      grace2At: lic.grace2_at,
      bloqueAt: lic.bloque_at,
    } : null,
    // LIC-4: even when blocked, fiscal data always remains exportable — the
    // local extraction path is documented in the app (never cloud-blocked).
    fiscalDataAccess: "toujours_disponible",
  });
}
