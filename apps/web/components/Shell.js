// Back-office shell (PRD 12.6): fixed sidebar ≥1024px, topbar, bottom nav <768px.
import Link from "next/link";
import { StatusPill } from "./ui";

const NAV = [
  { href: "/dashboard", label: "Dashboard", perm: "any" },
  { href: "/menu", label: "Menu & TVA", perm: "menu" },
  { href: "/utilisateurs", label: "Utilisateurs", perm: "users" },
  { href: "/tables", label: "Tables & salles", perm: "tables" },
  { href: "/appareils", label: "Appareils", perm: "devices" },
  { href: "/rapports", label: "Rapports", perm: "reports" },
  { href: "/journal", label: "Journal", perm: "journal" },
  { href: "/exports", label: "Exports", perm: "exports" },
  { href: "/ticket-modele", label: "Modèle de ticket", perm: "ticket" },
  { href: "/licence", label: "Licence", perm: "any" },
  { href: "/audit", label: "Audit", perm: "audit" },
];

function navVisible(item, role) {
  if (item.perm === "any") return true;
  if (role === "gerant") return true;
  if (role === "admin_plateforme") return ["licence", "audit", "reports"].includes(item.perm);
  // comptable / auditeur
  return ["reports", "journal", "exports", "audit"].includes(item.perm);
}

export function Shell({ user, active, licence, children }) {
  const items = NAV.filter((n) => navVisible(n, user.role));
  return (
    <div className="min-h-screen lg:flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden lg:flex w-64 flex-col fixed inset-y-0 left-0 bg-white border-r border-slate-200 z-30">
        <div className="flex items-center gap-2 px-6 h-16 border-b border-slate-200">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-sm">C</span>
          <span className="font-bold tracking-tight text-slate-900">CaisseFlow</span>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1" aria-label="Navigation principale">
          {items.map((item) => (
            <Link key={item.href} href={item.href}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active === item.href
                  ? "bg-blue-50 text-blue-700 border-l-2 border-blue-600"
                  : "text-slate-700 hover:bg-slate-50"
              }`}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-200 text-xs text-slate-500">
          {user.nom}<br />{user.email}
        </div>
      </aside>

      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        {/* Topbar */}
        <div className="sticky top-0 z-30 backdrop-blur-md bg-white/80 border-b border-slate-200/80">
          <div className="flex items-center justify-between gap-4 px-4 sm:px-6 h-16">
            <span className="lg:hidden font-bold tracking-tight text-slate-900">CaisseFlow</span>
            <div className="hidden lg:block text-sm font-medium text-slate-500">{user.email}</div>
            <div className="flex items-center gap-2">
              {licence && <StatusPill tone={licence.tone}>{licence.label}</StatusPill>}
              <form action="/api/auth/logout" method="post">
                <button type="submit" data-action="logout"
                  className="h-10 px-3 border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors">
                  Déconnexion
                </button>
              </form>
            </div>
          </div>
        </div>
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-6">{children}</main>
        {/* Bottom nav (mobile) */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-md border-t border-slate-200 py-2 pb-[max(8px,env(safe-area-inset-bottom))] flex justify-around" aria-label="Navigation mobile">
          {items.slice(0, 4).map((item) => (
            <Link key={item.href} href={item.href}
              className={`px-3 py-1 text-xs font-medium rounded-lg ${active === item.href ? "text-blue-700" : "text-slate-500"}`}>
              {item.label.split(" ")[0]}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
