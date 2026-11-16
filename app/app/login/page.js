import { getSessionUser } from "../../lib/auth";
import LoginForm from "../../components/LoginForm";
import { Card } from "../../components/ui";

// S-01 — Login screen (PRD 12.4). Demo credentials documented in PRD 13.2.
export default async function LoginPage() {
  const user = await getSessionUser(await (await import("next/headers")).cookies());
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
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-lg">C</span>
            <span className="text-xl font-bold tracking-tight text-slate-900">CaisseFlow</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Back-office</h1>
          <p className="text-sm text-slate-500 mt-1">Caisse de restaurant conforme NF525</p>
        </div>
        <Card className="p-6 sm:p-8">
          <LoginForm />
        </Card>
        <p className="text-xs text-slate-500 text-center mt-4">
          Comptes de démonstration : gerant@local.test / comptable@local.test / auditeur@local.test / admin@local.test
        </p>
      </div>
    </main>
  );
}
