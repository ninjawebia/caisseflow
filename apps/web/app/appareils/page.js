import { pool } from "../../lib/db";
import { pageContext, LoginRequired } from "../../lib/pages";
import { Shell } from "../../components/Shell";
import { PageHeader } from "../../components/ui";
import DevicesClient from "../../components/DevicesClient";

// S-13 — Appareils (tablettes caisse) : enrôlement one-time token (PRD 4.1.10,
// SYNC-4). Gérant only — le jeton en clair n'est affiché qu'une seule fois.
export default async function DevicesPage() {
  const { user, licence, denied } = await pageContext("devices");
  if (!user || denied) return (
    <main className="min-h-screen px-4"><LoginRequired denied={denied} /></main>
  );

  const devices = await pool.query(
    `SELECT d.id, d.poste, d.actif, d.created_at,
            EXISTS (SELECT 1 FROM journal_replica j
                    WHERE j.restaurant_id = d.restaurant_id AND j.poste = d.poste LIMIT 1) AS a_synchronise
     FROM device_tokens d WHERE d.restaurant_id = $1
     ORDER BY d.actif DESC, d.poste`,
    [user.restaurantId]
  );

  return (
    <Shell user={user} active="/appareils" licence={licence}>
      <PageHeader
        title="Appareils"
        subtitle="Enrôlement des tablettes caisse — jeton affiché une seule fois, révocable à tout moment (SYNC-4)"
      />
      <DevicesClient devices={devices.rows} />
    </Shell>
  );
}
