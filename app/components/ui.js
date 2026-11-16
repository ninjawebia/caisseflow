// Shared UI primitives — tokens from DESIGN-BLUEPRINT.md (3-tier, Rule 6/20).
export function StatusPill({ tone, children }) {
  const map = {
    success: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
    warning: "bg-amber-50 text-amber-700 border-amber-200/60",
    danger: "bg-rose-50 text-rose-700 border-rose-200/60",
    info: "bg-sky-50 text-sky-700 border-sky-200/60",
    neutral: "bg-slate-50 text-slate-700 border-slate-200",
  };
  const dot = {
    success: "bg-emerald-500", warning: "bg-amber-500",
    danger: "bg-rose-500", info: "bg-sky-500", neutral: "bg-slate-400",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${map[tone] || map.neutral}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot[tone] || dot.neutral}`} />
      {children}
    </span>
  );
}

export function Card({ children, className = "" }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </header>
  );
}

export function EmptyState({ icon = "📭", title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="bg-slate-100 rounded-full p-6 mb-4 text-3xl" aria-hidden="true">{icon}</div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="text-sm text-slate-500 mt-1 max-w-prose">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message, onRetryHref = null }) {
  return (
    <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm p-4 rounded-xl flex items-center justify-between gap-4">
      <span>{message}</span>
      {onRetryHref && <a href={onRetryHref} className="underline font-medium">Réessayer</a>}
    </div>
  );
}

export function KpiCard({ label, value, hint, tone = "neutral" }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="text-3xl font-bold tracking-tight text-slate-900 mt-2 font-mono tabular-nums">{value}</p>
      {hint && <div className="mt-2"><StatusPill tone={tone}>{hint}</StatusPill></div>}
    </Card>
  );
}

// Rendered by protected pages when no valid session exists (PRD 4-state:
// unauthenticated state served with HTTP 200 + explicit call to action).
// Variante "denied" pour les accès RBAC refusés (PRD 3.2 → 403).
export function LoginRequired({ denied = false }) {
  return (
    <Card className="p-10 max-w-lg mx-auto mt-16 text-center">
      <div className="bg-slate-100 rounded-full p-6 mb-4 inline-flex" aria-hidden="true">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-slate-900">{denied ? "Accès refusé (403)" : "Session requise"}</h2>
      <p className="text-sm text-slate-500 mt-1">
        {denied ? "Votre profil n'a pas les droits nécessaires pour cette page." : "Connectez-vous au back-office pour accéder à cette page."}
      </p>
      <a href="/login" className="mt-4 inline-flex h-10 px-4 items-center justify-center bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-medium rounded-lg transition-[transform,colors] duration-150">Aller à la connexion</a>
    </Card>
  );
}
