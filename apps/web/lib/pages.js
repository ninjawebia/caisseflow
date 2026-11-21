// Shared server-side data helpers for protected pages.
import { cookies } from "next/headers";
import { getSessionUser, can } from "./auth";
import { pool } from "./db";
import { LoginRequired } from "../components/ui";

export async function pageUser() {
  const user = await getSessionUser(await cookies());
  return user;
}

// Loads page context + licence pill state. Returns {user, licence} where user is
// null when unauthenticated (pages render an explicit login-required state).
export async function pageContext(permission) {
  const user = await pageUser();
  if (!user) return { user: null, licence: null, denied: false };
  const denied = permission ? !can(user.role, permission) : false;
  if (denied) return { user, licence: null, denied: true };
  let licence = null;
  if (user.restaurantId) {
    const r = await pool.query(
      "SELECT etat FROM licences WHERE restaurant_id = $1", [user.restaurantId]
    );
    const etat = r.rows[0]?.etat || "active";
    const map = {
      active: { tone: "success", label: "Licence active" },
      grace1: { tone: "warning", label: "Licence — rappel" },
      grace2: { tone: "warning", label: "Licence — fonctions cloud suspendues" },
      bloquee: { tone: "danger", label: "Licence bloquée" },
    };
    licence = map[etat];
  }
  return { user, licence, denied };
}

export { LoginRequired };
