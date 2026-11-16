import { cookies } from "next/headers";
import { getSessionUser } from "../../lib/auth";
import LoginScreen from "../../components/LoginScreen";
import { Card } from "../../components/ui";

// S-01 — /login. Same screen as "/" when logged out; an explicit
// "already connected" state with a working logout when a session is active.
export default async function LoginPage() {
  const user = await getSessionUser(await cookies());
  if (user) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <Card className="p-10 max-w-lg w-full text-center">
          <h1 className="text-xl font-semibold text-slate-900">Déjà connecté</h1>
          <p className="text-sm text-slate-500 mt-1">Session active : {user.email}</p>
          <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-center">
            <a href="/dashboard" className="h-10 px-4 inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors">Ouvrir le back-office</a>
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="h-10 px-4 inline-flex items-center justify-center border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded-lg transition-colors" data-action="logout">Se déconnecter</button>
            </form>
          </div>
        </Card>
      </main>
    );
  }
  return <LoginScreen />;
}
