import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionUser } from "../lib/auth";
import LoginScreen from "../components/LoginScreen";

// "/" — home. With an active session: go to the dashboard. Otherwise: render
// the login screen directly (no bare redirect) so the home page IS the login
// page visually and functionally.
export default async function Home() {
  const user = await getSessionUser(await cookies());
  if (user) redirect("/dashboard");
  return <LoginScreen />;
}
