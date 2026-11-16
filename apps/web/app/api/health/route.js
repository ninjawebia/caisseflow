import { pool } from "../../../lib/db";

// Healthcheck conteneur (HEALTHCHECK Dockerfile + docker-compose + dokploy).
// 200 = app + PostgreSQL accessibles ; 503 sinon. Aucune donnée métier exposée.
export async function GET() {
  try {
    await pool.query("SELECT 1");
    return Response.json({ ok: true, db: true }, { status: 200 });
  } catch {
    return Response.json({ ok: false, db: false }, { status: 503 });
  }
}
