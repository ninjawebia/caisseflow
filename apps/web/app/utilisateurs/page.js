import { pool } from "../../lib/db";
import { pageContext, LoginRequired } from "../../lib/pages";
import { Shell } from "../../components/Shell";
import { PageHeader } from "../../components/ui";
import UsersClient from "../../components/UsersClient";

// S-04 — Users & rights (BO-2). Gérant only.
export default async function UsersPage() {
  const { user, licence, denied } = await pageContext("users");
  if (!user || denied) return (
    <main className="min-h-screen px-4"><LoginRequired denied={denied} /></main>
  );

  const web = await pool.query(
    `SELECT id, email, nom, role, actif, totp_enabled FROM users_web
     WHERE restaurant_id IS NULL OR restaurant_id=$1 ORDER BY created_at`, [user.restaurantId]
  );
  const mobile = await pool.query(
    `SELECT id, matricule, nom, role, actif, version FROM users_mobile
     WHERE restaurant_id=$1 ORDER BY matricule`, [user.restaurantId]
  );

  return (
    <Shell user={user} active="/utilisateurs" licence={licence}>
      <PageHeader title="Utilisateurs & droits" subtitle="Comptes back-office, matricules mobiles, PIN hashés, blocage après 5 échecs (BO-2, SEC-5/6)" />
      <UsersClient webUsers={web.rows} mobileUsers={mobile.rows} />
    </Shell>
  );
}
