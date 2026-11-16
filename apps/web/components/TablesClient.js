"use client";
import { useState } from "react";

// Tables & rooms (S-05, BO-3). Gérant only. Deletion is avoided by design:
// a table used in past orders is disabled instead (trace kept).
export default function TablesClient({ initial }) {
  const [items, setItems] = useState(initial);
  const [form, setForm] = useState({ nom: "", salle: "Salle 1", places: "2" });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function send(url, method, body) {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) { setMsg({ tone: "danger", text: data.error || "Opération refusée" }); return null; }
      return data;
    } catch { setMsg({ tone: "danger", text: "Serveur indisponible — réessayez" }); return null; }
    finally { setBusy(false); }
  }

  async function create(e) {
    e.preventDefault();
    const res = await send("/api/tables", "POST", { ...form, places: Number(form.places) });
    if (!res) return;
    setItems((p) => [...p, res.table]);
    setMsg({ tone: "success", text: "Table créée" });
    setForm({ nom: "", salle: "Salle 1", places: "2" });
  }

  async function remove(id) {
    const res = await send(`/api/tables/${id}`, "DELETE", {});
    if (!res) return;
    setItems((p) => p.map((t) => (t.id === id ? { ...t, actif: false } : t)));
    setMsg({ tone: "success", text: "Table désactivée" });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <section className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Nouvelle table</h2>
        <form onSubmit={create} className="flex flex-col gap-4" data-form="table">
          <div>
            <label htmlFor="t-nom" className="block text-xs font-semibold text-slate-700 mb-1">Nom <span className="text-rose-600">*</span></label>
            <input id="t-nom" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} required maxLength={10}
              className="h-10 w-full px-3 bg-white border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow" placeholder="T9" />
          </div>
          <div>
            <label htmlFor="t-salle" className="block text-xs font-semibold text-slate-700 mb-1">Salle</label>
            <input id="t-salle" value={form.salle} onChange={(e) => setForm({ ...form, salle: e.target.value })} required maxLength={30}
              className="h-10 w-full px-3 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow" />
          </div>
          <div>
            <label htmlFor="t-places" className="block text-xs font-semibold text-slate-700 mb-1">Places (1–20)</label>
            <input id="t-places" type="number" min="1" max="20" value={form.places} onChange={(e) => setForm({ ...form, places: e.target.value })} required
              className="h-10 w-full px-3 bg-white border border-slate-300 rounded-lg text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow" />
          </div>
          {msg && <div className={`text-sm p-3 rounded-xl border ${msg.tone === "danger" ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-emerald-50 border-emerald-200 text-emerald-700"}`}>{msg.text}</div>}
          <button type="submit" disabled={busy} data-action="create-table"
            className="h-10 px-4 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-medium rounded-lg transition-[transform,colors] duration-150 disabled:opacity-50 disabled:pointer-events-none">
            {busy ? "Création…" : "Créer la table"}
          </button>
        </form>
      </section>

      <section className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Plan de salle ({items.filter((t) => t.actif).length} actives)</h2>
        {items.length === 0 ? (
          <div className="py-12 text-center">
            <div className="bg-slate-100 rounded-full p-6 mb-4 inline-flex" aria-hidden="true">🪑</div>
            <h3 className="text-base font-semibold text-slate-900">Aucune table</h3>
            <p className="text-sm text-slate-500 mt-1">Créez la première table pour le plan de salle de la caisse.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {items.map((t) => (
              <div key={t.id} className={`rounded-xl border p-4 ${t.actif ? "bg-white border-slate-200" : "bg-slate-50 border-slate-200 opacity-60"}`}>
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-900">{t.nom}</span>
                  <span className="text-xs text-slate-500">{t.places} pl.</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">{t.salle}</p>
                {t.actif && (
                  <button onClick={() => remove(t.id)} data-action={`disable-table-${t.id}`} disabled={busy}
                    className="mt-3 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-lg transition-colors">Désactiver</button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
