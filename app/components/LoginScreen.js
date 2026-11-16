// S-01 — Login screen, shared by "/" (home) and "/login" (PRD 12.4).
// Demo credentials documented in PRD 13.2.
import LoginForm from "./LoginForm";
import { Card } from "./ui";

export default function LoginScreen() {
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
