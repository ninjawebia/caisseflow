"use client";
import { useState } from "react";

// Licence management (S-09, LIC-1..4). Reading is open to all staff; only the
// platform admin changes the state (server-side enforced). grace2/bloquee
// suspend cloud sync but NEVER block access to fiscal data (LIC-4).
export default function LicenceClient({ etat, isAdmin, phases }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function setEtat(next) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/licence", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etat: next }),
      });
      const data = await r.json();
      if (!r.ok) { setMsg({ tone: "danger", text: data.error || "Opération refusée" }); return; }
      setMsg({ tone: "success", text: "État de licence : " + data.licence.etat });
      window.location.reload();
    } catch {
      setMsg({ tone: "danger", text: "Serveur indisponible — réessayez" });
    } finally { setBusy(false); }
  }

  const tone = (t) => (t === "danger" ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-emerald-50 border-emerald-200 text-emerald-700");
  const btn = "h-10 px-4 font-medium rounded-lg transition-[transform,colors] duration-150 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]";

  return (
    <div className="flex flex-col gap-6">
      {msg && <div className={`text-sm p-3 rounded-xl border ${tone(msg.tone)}`}>{msg.text}</div>}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Cycle de vie de la licence</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className={`rounded-xl border p-4 ${etat === "active" ? "border-emerald-300 bg-emerald-50/50" : "border-slate-200"}`}>
            <p className="font-semibold text-slate-900">Active</p>
            <p className="text-xs text-slate-500 mt-1">Tout fonctionne. Impayée depuis J : rappels visibles.</p>
          </div>
          <div className={`rounded-xl border p-4 ${etat === "grace1" ? "border-amber-300 bg-amber-50/50" : "border-slate-200"}`}>
            <p className="font-semibold text-slate-900">Rappel (J+30 → J+60)</p>
            <p className="text-xs text-slate-500 mt-1">Bandeaux dans l'app, sync maintenue.</p>
          </div>
          <div className={`rounded-xl border p-4 ${etat === "grace2" ? "border-amber-300 bg-amber-50/50" : "border-slate-200"}`}>
            <p className="font-semibold text-slate-900">Cloud suspendu (J+60 → J+90)</p>
            <p className="text-xs text-slate-500 mt-1">Sync refusée (403) ; la caisse locale continue en mode dégradé.</p>
          </div>
          <div className={`rounded-xl border p-4 ${etat === "bloquee" ? "border-rose-300 bg-rose-50/50" : "border-slate-200"}`}>
            <p className="font-semibold text-slate-900">Bloquée (J+90)</p>
            <p className="text-xs text-slate-500 mt-1">Pas de nouvelles commandes ; exports des données fiscales toujours accessibles (LIC-4).</p>
          </div>
        </div>
        {phases && (phases.grace1At || phases.grace2At || phases.bloqueAt || phases.impayeeDepuis) && (
          <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-slate-600">
            <div><dt className="font-medium text-slate-500">Impayée depuis</dt><dd className="font-mono">{phases.impayeeDepuis || "—"}</dd></div>
            <div><dt className="font-medium text-slate-500">Rappel (grace1) à</dt><dd className="font-mono">{phases.grace1At ? new Date(phases.grace1At).toLocaleString("fr-FR") : "—"}</dd></div>
            <div><dt className="font-medium text-slate-500">Cloud suspendu (grace2) à</dt><dd className="font-mono">{phases.grace2At ? new Date(phases.grace2At).toLocaleString("fr-FR") : "—"}</dd></div>
            <div><dt className="font-medium text-slate-500">Blocage (J+90) à</dt><dd className="font-mono">{phases.bloqueAt ? new Date(phases.bloqueAt).toLocaleString("fr-FR") : "—"}</dd></div>
          </dl>
        )}
      </div>

      {isAdmin ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Changer l'état</h2>
          <p className="text-xs text-slate-500 mb-4">Réservé à l'administrateur plateforme — chaque changement est tracé dans le journal d'audit.</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setEtat("active")} disabled={busy} data-action="licence-active"
              className={`${btn} bg-blue-600 hover:bg-blue-700 text-white`}>Marquer active</button>
            <button onClick={() => setEtat("grace1")} disabled={busy} data-action="licence-grace1"
              className={`${btn} bg-amber-500 hover:bg-amber-600 text-white`}>Passer en rappel (grace1)</button>
            <button onClick={() => setEtat("grace2")} disabled={busy} data-action="licence-grace2"
              className={`${btn} bg-amber-600 hover:bg-amber-700 text-white`}>Suspendre le cloud (grace2)</button>
            <button onClick={() => setEtat("bloquee")} disabled={busy} data-action="licence-bloquee"
              className={`${btn} bg-rose-600 hover:bg-rose-700 text-white`}>Bloquer (J+90)</button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-sm text-slate-500">
          Lecture seule — seul l'administrateur plateforme peut changer l'état de la licence.
        </div>
      )}
    </div>
  );
}
