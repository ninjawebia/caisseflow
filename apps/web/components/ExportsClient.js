"use client";
import { useState } from "react";
import { formatDateTime } from "../lib/format";

// S-08 — Exports (BO-5, A10 §18-19). The requester (demandeur) is recorded for
// every export; each file carries a SHA-256 fingerprint (empreinte) that the
// accountant can verify against the downloaded bytes.
export default function ExportsClient({ initial }) {
  const [items, setItems] = useState(initial);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ type: "journal", format: "csv", from: "", to: "" });

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await r.json();
      if (!r.ok) {
        setMsg({ tone: "danger", text: data.error || "Export refusé" });
        return;
      }
      setItems((prev) => [data.export, ...prev]);
      setMsg({ tone: "success", text: "Export généré — empreinte " + data.export.empreinte.slice(0, 12) + "… Téléchargement lancé." });
      window.location.href = "/api/exports/" + data.export.id;
    } catch {
      setMsg({ tone: "danger", text: "Serveur indisponible — réessayez" });
    } finally {
      setBusy(false);
    }
  }

  const tone = (t) => (t === "danger" ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-emerald-50 border-emerald-200 text-emerald-700");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <section className="lg:col-span-2">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Nouvel export signé</h2>
          <form onSubmit={create} className="flex flex-col gap-4" data-form="export">
            <div>
              <label htmlFor="x-type" className="block text-xs font-semibold text-slate-700 mb-1">Contenu</label>
              <select id="x-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="h-10 w-full px-3 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow">
                <option value="journal">Journal fiscal complet</option>
                <option value="clotures">Clôtures Z signées</option>
                <option value="ventes">Ventes (totaux + TVA)</option>
                <option value="complet">Archive complète (journal + Z)</option>
              </select>
            </div>
            <div>
              <label htmlFor="x-format" className="block text-xs font-semibold text-slate-700 mb-1">Format</label>
              <select id="x-format" value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}
                className="h-10 w-full px-3 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow">
                <option value="csv">CSV (expert-comptable)</option>
                <option value="json">JSON (réimportable)</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="x-from" className="block text-xs font-semibold text-slate-700 mb-1">Du</label>
                <input id="x-from" type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })}
                  className="h-10 w-full px-3 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow" />
              </div>
              <div>
                <label htmlFor="x-to" className="block text-xs font-semibold text-slate-700 mb-1">Au</label>
                <input id="x-to" type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })}
                  className="h-10 w-full px-3 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow" />
              </div>
            </div>
            {msg && <div className={`text-sm p-3 rounded-xl border ${tone(msg.tone)}`}>{msg.text}</div>}
            <button type="submit" disabled={busy} data-action="create-export"
              className="h-10 px-4 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-medium rounded-lg transition-[transform,colors] duration-150 disabled:opacity-50 disabled:pointer-events-none">
              {busy ? "Génération…" : "Générer et télécharger"}
            </button>
            <p className="text-xs text-slate-500">
              Chaque fichier porte une empreinte SHA-256 calculée sur son contenu (dernière ligne <span className="font-mono">EMPREINTE</span>).
              L'export est conservé dans le registre avec le nom du demandeur — conformité NF525 / contrôle fiscal (BO-5).
            </p>
          </form>
        </div>
      </section>

      <section className="lg:col-span-3">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Registre des exports ({items.length})</h2>
          {items.length === 0 ? (
            <div className="py-12 text-center">
              <div className="bg-slate-100 rounded-full p-6 mb-4 inline-flex" aria-hidden="true">📦</div>
              <h3 className="text-base font-semibold text-slate-900">Aucun export</h3>
              <p className="text-sm text-slate-500 mt-1">Générez le premier export pour l'expert-comptable ou l'auditeur.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Format</th>
                    <th className="py-2 pr-4">Période</th>
                    <th className="py-2 pr-4">Empreinte</th>
                    <th className="py-2 text-right">Fichier</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((x) => (
                    <tr key={x.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 pr-4 text-slate-500 text-xs">{formatDateTime(x.created_at)}</td>
                      <td className="py-2 pr-4">{x.type}</td>
                      <td className="py-2 pr-4 font-mono uppercase">{x.format}</td>
                      <td className="py-2 pr-4 text-xs text-slate-500">{x.from_period || "…"} → {x.to_period || "…"}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-slate-400" title={x.empreinte}>{x.empreinte.slice(0, 10)}</td>
                      <td className="py-2 text-right">
                        <a href={"/api/exports/" + x.id} data-action={"download-" + x.id}
                          className="px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">Télécharger</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
