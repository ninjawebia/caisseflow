import { pool } from "../../lib/db";
import { pageContext, LoginRequired } from "../../lib/pages";
import { Shell } from "../../components/Shell";
import { PageHeader, StatusPill } from "../../components/ui";
import LicenceClient from "../../components/LicenceClient";

// S-09 — Licence (LIC-1..4). State pill + lifecycle; mutations admin-only.
export default async function LicencePage() {
  const { user, licence, denied } = await pageContext(null);
  if (!user || denied) return (
    <main className="min-h-screen px-4"><LoginRequired denied={denied} /></main>
  );

  // Resolve the licence row: restaurant staff use their own restaurant; the
  // platform admin (no restaurant) sees the pilot restaurant.
  let restaurantId = user.restaurantId;
  if (!restaurantId && user.role === "admin_plateforme") {
    const first = await pool.query("SELECT id FROM restaurants ORDER BY created_at LIMIT 1");
    restaurantId = first.rows[0]?.id || null;
  }
  const r = await pool.query(
    "SELECT etat, impayee_depuis, grace1_at, grace2_at, bloque_at FROM licences WHERE restaurant_id=$1",
    [restaurantId]
  );
  const row = r.rows[0] || {};
  const phases = {
    impayeeDepuis: row.impayee_depuis || null,
    grace1At: row.grace1_at || null,
    grace2At: row.grace2_at || null,
    bloqueAt: row.bloque_at || null,
  };

  return (
    <Shell user={user} active="/licence" licence={licence}>
      <PageHeader title="Licence" subtitle="États : active → rappel (J+30) → cloud suspendu (J+60) → bloquée (J+90) — l'accès aux données fiscales n'est jamais interrompu (LIC-4)">
        <StatusPill tone={licence?.tone || "neutral"}>{licence?.label || "—"}</StatusPill>
      </PageHeader>
      <LicenceClient etat={row.etat || "active"} isAdmin={user.role === "admin_plateforme"} phases={phases} />
    </Shell>
  );
}
