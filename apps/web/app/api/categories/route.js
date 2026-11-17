import { cookies } from "next/headers";
import { getSessionUser, can } from "../../../lib/auth";
import { pool } from "../../../lib/db";
import { assertSameOrigin, json, audit } from "../../../lib/http";
import { validateCategory } from "@caisseflow/shared";

// GET /api/categories — list with article counts (BO-1, menu permission).
// Les catégories archivées sont incluses (badge UI) ; le sync pull, lui, ne
// diffuse que les actives.
export async function GET() {
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "menu") || !user.restaurantId) return json({ error: "Accès refusé" }, 403);
  const r = await pool.query(
    `SELECT c.id, c.nom, c.position, c.actif, COUNT(a.id)::int AS nb_articles
     FROM categories c LEFT JOIN articles a ON a.categorie_id = c.id
     WHERE c.restaurant_id = $1
     GROUP BY c.id ORDER BY c.position, c.nom`,
    [user.restaurantId]
  );
  return json({ categories: r.rows });
}

// POST /api/categories — create (backlog F1, gérant only, re-validation serveur).
export async function POST(req) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "menu") || !user.restaurantId) return json({ error: "Accès refusé" }, 403);

  const body = await req.json().catch(() => null);
  const v = validateCategory(body);
  if (!v.ok) return json({ error: v.error }, 400);
  const { nom, position } = v.value;

  try {
    const r = await pool.query(
      "INSERT INTO categories (restaurant_id, nom, position) VALUES ($1,$2,$3) RETURNING id, nom, position, actif",
      [user.restaurantId, nom, position]
    );
    await audit(user, "create", "categories", r.rows[0].id, { nom, position });
    return json({ category: r.rows[0] }, 201);
  } catch (e) {
    if (e.code === "23505") return json({ error: "Une catégorie porte déjà ce nom" }, 409);
    return json({ error: "Erreur d'enregistrement" }, 500);
  }
}
