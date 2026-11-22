import { pool } from "../../lib/db";
import { pageContext, LoginRequired } from "../../lib/pages";
import { Shell } from "../../components/Shell";
import { PageHeader } from "../../components/ui";
import { ensureDefaults, listPresets } from "../../lib/presets";
import ApparenceClient from "../../components/ApparenceClient";

// S-13 — Apparence des images (v0.5). Gérant only : les styles sont partagés
// par le BO et la tablette (contexte « menu »), donc leur administration suit
// exactement la permission du menu (BO-1).
export default async function ApparencePage() {
  const { user, licence, denied } = await pageContext("menu");
  if (!user || denied) return (
    <main className="min-h-screen px-4"><LoginRequired denied={denied} /></main>
  );

  // Défense en profondeur : un restaurant sans presets reçoit ses deux styles
  // par défaut à la première ouverture de la page (idempotent).
  await ensureDefaults(user.restaurantId);
  const presets = await listPresets(user.restaurantId);

  // Échantillon réel pour l'aperçu : la dernière photo d'article et de
  // catégorie disponibles. Aucune photo → aperçu sur un dégradé neutre.
  const sampleArticle = await pool.query(
    `SELECT id, photo_hash FROM articles
     WHERE restaurant_id = $1 AND photo_file IS NOT NULL
     ORDER BY updated_at DESC LIMIT 1`,
    [user.restaurantId]
  );
  const sampleCategory = await pool.query(
    `SELECT id, photo_hash FROM categories
     WHERE restaurant_id = $1 AND photo_file IS NOT NULL
     ORDER BY photo_updated_at DESC NULLS LAST LIMIT 1`,
    [user.restaurantId]
  );
  const photos = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM articles WHERE restaurant_id = $1 AND photo_file IS NOT NULL) AS articles,
       (SELECT COUNT(*)::int FROM categories WHERE restaurant_id = $1 AND photo_file IS NOT NULL) AS categories`,
    [user.restaurantId]
  );

  return (
    <Shell user={user} active="/apparence" licence={licence}>
      <PageHeader
        title="Apparence des images"
        subtitle="Styles réutilisables — appliqués au back-office et à la tablette (vignettes, bandeaux, puces)"
      />
      <ApparenceClient
        presets={presets.map((p) => ({ ...p, created_at: String(p.created_at), updated_at: String(p.updated_at) }))}
        sample={{
          article: sampleArticle.rows[0] || null,
          category: sampleCategory.rows[0] || null,
          counts: photos.rows[0] || { articles: 0, categories: 0 },
        }}
      />
    </Shell>
  );
}
