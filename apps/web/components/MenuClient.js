"use client";
import { useState } from "react";

// Menu management (S-03). Gérant only (PRD 3.2). All mutations go through the
// API which re-validates server-side and writes the audit trail (BO-1).
export default function MenuClient({ categories, articles }) {
  const [items, setItems] = useState(articles);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState(null); // {tone, text}
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ nom: "", prix: "", tva: "10", categorie: categories[0]?.id || "", actif: true });

  function resetForm() {
    setForm({ nom: "", prix: "", tva: "10", categorie: categories[0]?.id || "", actif: true });
    setEditing(null);
  }

  async function send(url, method, body) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) {
        setMsg({ tone: "danger", text: data.error || "Opération refusée" });
        return false;
      }
      return data;
    } catch {
      setMsg({ tone: "danger", text: "Serveur indisponible — réessayez" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    const payload = {
      nom: form.nom.trim(),
      prix_ttc: Number(form.prix),
      taux_tva: Number(form.tva),
      categorie_id: form.categorie || null,
      actif: form.actif,
    };
    if (!payload.nom || payload.nom.length < 2) return setMsg({ tone: "danger", text: "Nom obligatoire (2 caractères min.)" });
    if (!(payload.prix_ttc > 0 && payload.prix_ttc <= 10000)) return setMsg({ tone: "danger", text: "Prix invalide (0–10 000 €)" });

    const res = editing ? await send(`/api/articles/${editing}`, "PATCH", payload) : await send("/api/articles", "POST", payload);
    if (!res) return;
    setItems((prev) => editing ? prev.map((a) => (a.id === editing ? res.article : a)) : [...prev, res.article]);
    setMsg({ tone: "success", text: editing ? "Article modifié" : "Article créé" });
    resetForm();
  }

  async function remove(id) {
    const res = await send(`/api/articles/${id}`, "DELETE", {});
    if (!res) return;
    setItems((prev) => prev.filter((a) => a.id !== id));
    setMsg({ tone: "success", text: "Article désactivé" });
  }

  function startEdit(a) {
    setEditing(a.id);
    setForm({ nom: a.nom, prix: String(a.prix_ttc), tva: String(a.taux_tva), categorie: a.categorie_id || "", actif: a.actif });
    setMsg(null);
    document.getElementById("article-form").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <section id="article-form" className="lg:col-span-2">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">{editing ? "Modifier l'article" : "Nouvel article"}</h2>
          <form onSubmit={save} className="flex flex-col gap-4" data-form="article">
            <div>
              <label htmlFor="a-nom" className="block text-xs font-semibold text-slate-700 mb-1">Nom de l'article <span className="text-rose-600">*</span></label>
              <input id="a-nom" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} required
                className="h-10 w-full px-3 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="a-prix" className="block text-xs font-semibold text-slate-700 mb-1">Prix TTC (€) <span className="text-rose-600">*</span></label>
                <input id="a-prix" type="number" step="0.01" min="0" max="10000" value={form.prix} onChange={(e) => setForm({ ...form, prix: e.target.value })} required
                  className="h-10 w-full px-3 bg-white border border-slate-300 rounded-lg text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow" />
              </div>
              <div>
                <label htmlFor="a-tva" className="block text-xs font-semibold text-slate-700 mb-1">Taux TVA</label>
                <select id="a-tva" value={form.tva} onChange={(e) => setForm({ ...form, tva: e.target.value })}
                  className="h-10 w-full px-3 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow">
                  {["0", "5.5", "10", "20"].map((t) => <option key={t} value={t}>{t} %</option>)}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="a-cat" className="block text-xs font-semibold text-slate-700 mb-1">Catégorie</label>
              <select id="a-cat" value={form.categorie} onChange={(e) => setForm({ ...form, categorie: e.target.value })}
                className="h-10 w-full px-3 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow">
                <option value="">— Aucune —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.actif} onChange={(e) => setForm({ ...form, actif: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
              Article actif (visible sur la caisse)
            </label>
            {msg && <div className={`text-sm p-3 rounded-xl border ${msg.tone === "danger" ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-emerald-50 border-emerald-200 text-emerald-700"}`}>{msg.text}</div>}
            <div className="flex gap-2">
              <button type="submit" disabled={busy} data-action="save-article"
                className="h-10 px-4 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-medium rounded-lg transition-[transform,colors] duration-150 disabled:opacity-50 disabled:pointer-events-none">
                {busy ? "Enregistrement…" : editing ? "Enregistrer" : "Créer l'article"}
              </button>
              {editing && (
                <button type="button" onClick={resetForm} data-action="cancel-edit"
                  className="h-10 px-4 border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded-lg transition-colors">Annuler</button>
              )}
            </div>
          </form>
        </div>
      </section>

      <section className="lg:col-span-3">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Carte du restaurant ({items.length})</h2>
          {items.length === 0 ? (
            <div className="py-12 text-center">
              <div className="bg-slate-100 rounded-full p-6 mb-4 inline-flex" aria-hidden="true">🍽️</div>
              <h3 className="text-base font-semibold text-slate-900">Aucun article</h3>
              <p className="text-sm text-slate-500 mt-1">Créez votre premier article avec le formulaire.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-4">Article</th>
                    <th className="py-2 pr-4">Catégorie</th>
                    <th className="py-2 pr-4 text-right">Prix TTC</th>
                    <th className="py-2 pr-4 text-right">TVA</th>
                    <th className="py-2 pr-4 text-center">État</th>
                    <th className="py-2 text-right w-20">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a) => (
                    <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 pr-4 text-slate-900">{a.nom}</td>
                      <td className="py-2 pr-4 text-slate-500">{a.categorie_nom || "—"}</td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums">{Number(a.prix_ttc).toFixed(2)} €</td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums">{Number(a.taux_tva)} %</td>
                      <td className="py-2 pr-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${a.actif ? "bg-emerald-50 text-emerald-700 border-emerald-200/60" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${a.actif ? "bg-emerald-500" : "bg-slate-400"}`} />
                          {a.actif ? "Actif" : "Inactif"}
                        </span>
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <button onClick={() => startEdit(a)} data-action={`edit-${a.id}`} className="px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">Modifier</button>
                        <button onClick={() => remove(a.id)} data-action={`remove-${a.id}`} className="px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-lg transition-colors">Désactiver</button>
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
