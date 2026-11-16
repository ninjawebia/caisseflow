"use client";
import { useState } from "react";

// Login screen (S-01). Demo accounts: see HANDOFF / PRD 13.2.
export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, pwd, totp }),
      });
      const data = await r.json();
      if (r.ok) {
        window.location.href = "/dashboard";
      } else {
        setError(data.error || "Connexion impossible");
      }
    } catch {
      setError("Serveur indisponible — réessayez");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" data-form="login">
      <div>
        <label htmlFor="email" className="block text-xs font-semibold text-slate-700 mb-1">Adresse e-mail</label>
        <input id="email" type="email" required autoComplete="username" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-10 w-full px-3 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow"
          placeholder="vous@restaurant.fr" />
      </div>
      <div>
        <label htmlFor="pwd" className="block text-xs font-semibold text-slate-700 mb-1">Mot de passe</label>
        <input id="pwd" type="password" required autoComplete="current-password" value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          className="h-10 w-full px-3 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow"
          placeholder="••••••••••••" />
      </div>
      <div>
        <label htmlFor="totp" className="block text-xs font-semibold text-slate-700 mb-1">Code 2FA <span className="font-normal text-slate-500">(facultatif — profils sensibles)</span></label>
        <input id="totp" type="text" inputMode="numeric" value={totp}
          onChange={(e) => setTotp(e.target.value)}
          className="h-10 w-full px-3 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow"
          placeholder="000000" />
      </div>
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm p-3 rounded-xl">{error}</div>
      )}
      <button type="submit" disabled={loading}
        className="h-10 px-4 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-medium rounded-lg transition-[transform,colors] duration-150 inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none">
        {loading ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
