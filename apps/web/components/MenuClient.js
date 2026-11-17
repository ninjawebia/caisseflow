"use client";
import { useState, useMemo } from "react";

// Menu management (S-03). Gérant only (PRD 3.2). All mutations go through the
// API which re-validates server-side and writes the audit trail (BO-1).
// Backlog F1 : panneau catégories (créer / renommer / archiver / supprimer si
// vide) — BLUEPRINT § 9.1 ; suppression refusée par l'API si catégorie non vide.
export default function MenuClient({ categories, articles }) {
  const [items, setItems] = useState(articles);
  const [cats, setCats] = useState(categories);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState(null); // {tone, text}
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ nom: "", prix: "", tva: "10", categorie: categories[0]?.id || "", actif: true });

  // --- État du panneau catégories (F1) ---
  const [catBusy, setCatBusy] = useState(false);
  const [catMsg, setCatMsg] = useState(null);
  const [newCat, setNewCat] = useState("");
  const [catEditing, setCatEditing] = useState(null); // {id, nom}
  const [catConfirm, setCatConfirm] = useState(null); // id en attente de confirmation

  // Compteurs d'articles recalculés localement (source : items en cours).
  const counts = useMemo(
    () => items.reduce((m, a) => { if (a.categorie_id) m[a.categorie_id] = (m[a.categorie_id] || 0) + 1; return m; }, {}),
    [items]
  );

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

  // --- Photo d'article (backlog F2, BLUEPRINT § 9.2) — gérant, multipart ---
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMsg, setPhotoMsg] = useState(null);

  async function uploadPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // réutilisable
    if (!file || !editing) return;
    setPhotoBusy(true);
    setPhotoMsg(null);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const r = await fetch(`/api/articles/${editing}/photo`, { method: "POST", body: fd });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setPhotoMsg({ tone: "danger", text: data.error || "Téléversement refusé" });
        return;
      }
      setItems((prev) => prev.map((a) => (a.id === editing ? { ...a, photo_hash: data.hash } : a)));
      setPhotoMsg({ tone: "success", text: "Photo enregistrée" });
    } catch {
      setPhotoMsg({ tone: "danger", text: "Serveur indisponible — réessayez" });
    } finally {
      setPhotoBusy(false);
    }
  }

  async function deletePhoto() {
    setPhotoBusy(true);
    setPhotoMsg(null);
    try {
      const r = await fetch(`/api/articles/${editing}/photo`, { method: "DELETE", headers: { "Content-Type": "application/json" } });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setPhotoMsg({ tone: "danger", text: data.error || "Suppression refusée" });
        return;
      }
      setItems((prev) => prev.map((a) => (a.id === editing ? { ...a, photo_hash: null } : a)));
      setPhotoMsg({ tone: "success", text: "Photo supprimée" });
    } catch {
      setPhotoMsg({ tone: "danger", text: "Serveur indisponible — réessayez" });
    } finally {
      setPhotoBusy(false);
    }
  }

  function startEdit(a) {
    setEditing(a.id);
    setForm({ nom: a.nom, prix: String(a.prix_ttc), tva: String(a.taux_tva), categorie: a.categorie_id || "", actif: a.actif });
    setMsg(null);
    document.getElementById("article-form").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // --- Actions catégories (F1) ---
  async function catSend(url, method, body) {
    setCatBusy(true);
    setCatMsg(null);
    try {
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) {
        setCatMsg({ tone: "danger", text: data.error || "Opération refusée" });
        return false;
      }
      return data;
    } catch {
      setCatMsg({ tone: "danger", text: "Serveur indisponible — réessayez" });
      return false;
    } finally {
      setCatBusy(false);
    }
  }

  async function createCat(e) {
    e.preventDefault();
    const res = await catSend("/api/categories", "POST", { nom: newCat.trim() });
    if (!res) return;
    setCats((prev) => [...prev, { ...res.category, nb_articles: 0 }]);
    setNewCat("");
    setCatMsg({ tone: "success", text: "Catégorie créée" });
  }

  async function renameCat(e) {
    e.preventDefault();
    if (!catEditing) return;
    const nom = catEditing.nom.trim();
    if (nom.length < 2) return setCatMsg({ tone: "danger", text: "Nom de catégorie obligatoire (2–40 caractères)" });
    const res = await catSend(`/api/categories/${catEditing.id}`, "PATCH", { nom });
    if (!res) return;
    setCats((prev) => prev.map((c) => (c.id === catEditing.id ? res.category : c)));
    setCatEditing(null);
    setCatMsg({ tone: "success", text: "Catégorie renommée" });
  }

  async function toggleArchive(c) {
    const res = await catSend(`/api/categories/${c.id}`, "PATCH", { actif: !c.actif });
    if (!res) return;
    setCats((prev) => prev.map((x) => (x.id === c.id ? res.category : x)));
    setCatMsg({ tone: "success", text: res.category.actif ? "Catégorie restaurée" : "Catégorie archivée" });
  }

  async function deleteCat(c) {
    if (catConfirm !== c.id) {
      setCatConfirm(c.id); // double-étape : le bouton devient « Confirmer »
      return;
    }
    setCatConfirm(null);
    const res = await catSend(`/api/categories/${c.id}`, "DELETE", {});
    if (!res) return;
    setCats((prev) => prev.filter((x) => x.id !== c.id));
    if (form.categorie === c.id) setForm((f) => ({ ...f, categorie: "" }));
    setCatMsg({ tone: "success", text: "Catégorie supprimée" });
  }

  // Sélecteur d'article : catégories actives + celle de l'article en cours d'édition.
  const selectableCats = cats.filter((c) => c.actif || c.id === form.categorie);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <section id="article-form" className="lg:col-span-2 flex flex-col gap-6">
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
                {selectableCats.map((c) => <option key={c.id} value={c.id}>{c.nom}{!c.actif ? " (archivée)" : ""}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.actif} onChange={(e) => setForm({ ...form, actif: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
              Article actif (visible sur la caisse)
            </label>

            {/* Photo de l'article (F2) — disponible une fois l'article enregistré */}
            {editing ? (
              <div>
                <span className="block text-xs font-semibold text-slate-700 mb-1">Photo de l'article</span>
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 shrink-0 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden grid place-items-center" aria-hidden="true">
                    {items.find((a) => a.id === editing)?.photo_hash ? (
                      <img src={`/api/articles/${editing}/photo?v=${items.find((a) => a.id === editing)?.photo_hash?.slice(0, 8)}`} alt="" className="h-16 w-16 object-cover" />
                    ) : (
                      <span className="text-slate-400 text-lg font-semibold">{(form.nom || "?").charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={`inline-flex items-center justify-center h-8 px-3 text-xs font-medium rounded-lg border transition-colors ${photoBusy ? "opacity-50 pointer-events-none border-slate-200 text-slate-400" : "border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"}`}>
                      {photoBusy ? "Envoi…" : "Remplacer / Ajouter"}
                      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadPhoto} disabled={photoBusy} className="sr-only" data-action="photo-input" />
                    </label>
                    {items.find((a) => a.id === editing)?.photo_hash && (
                      <button type="button" onClick={deletePhoto} disabled={photoBusy} data-action="photo-delete"
                        className="h-8 px-3 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-lg transition-colors text-left">Supprimer la photo</button>
                    )}
                    <span className="text-xs text-slate-400">JPEG, PNG ou WebP — 2 Mo max, 2048 px max</span>
                  </div>
                </div>
                {photoMsg && <div className={`text-xs p-2 mt-2 rounded-lg border ${photoMsg.tone === "danger" ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-emerald-50 border-emerald-200 text-emerald-700"}`} role="status">{photoMsg.text}</div>}
              </div>
            ) : (
              <p className="text-xs text-slate-400 -mt-1">💡 Enregistrez l'article pour pouvoir lui ajouter une photo.</p>
            )}
            {msg && <div className={`text-sm p-3 rounded-xl border ${msg.tone === "danger" ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-emerald-50 border-emerald-200 text-emerald-700"}`} role="status">{msg.text}</div>}
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

        {/* --- Panneau catégories (backlog F1, BLUEPRINT § 9.1) --- */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900">Catégories</h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">Organisation de la carte — propagée aux tablettes au prochain sync.</p>
          <form onSubmit={createCat} className="flex gap-2 mb-4" data-form="category">
            <label htmlFor="cat-nom" className="sr-only">Nouvelle catégorie</label>
            <input id="cat-nom" value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Nouvelle catégorie…"
              maxLength={40} required
              className="h-10 flex-1 px-3 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow" />
            <button type="submit" disabled={catBusy || newCat.trim().length < 2} data-action="create-category"
              className="h-10 px-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:pointer-events-none">+</button>
          </form>

          {cats.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">Aucune catégorie — créez la première ci-dessus.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-slate-100">
              {cats.map((c) => (
                <li key={c.id} className={`py-2 flex items-center gap-2 ${!c.actif ? "opacity-50" : ""}`}>
                  {catEditing?.id === c.id ? (
                    <form onSubmit={renameCat} className="flex-1 flex gap-2">
                      <label htmlFor={`cat-edit-${c.id}`} className="sr-only">Renommer la catégorie</label>
                      <input id={`cat-edit-${c.id}`} autoFocus value={catEditing.nom}
                        onChange={(e) => setCatEditing({ ...catEditing, nom: e.target.value })} maxLength={40} required
                        className="h-8 flex-1 px-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" />
                      <button type="submit" disabled={catBusy} data-action="save-category"
                        className="px-2 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">Enregistrer</button>
                      <button type="button" onClick={() => setCatEditing(null)}
                        className="px-2 text-xs font-medium text-slate-500 hover:bg-slate-50 rounded-lg transition-colors">Annuler</button>
                    </form>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-slate-900 truncate" title={c.nom}>{c.nom}</span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 tabular-nums" title={`${counts[c.id] || 0} article(s) rattaché(s)`}>
                        {counts[c.id] || 0}
                      </span>
                      {!c.actif && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">Archivée</span>}
                      <button onClick={() => setCatEditing({ id: c.id, nom: c.nom })} data-action={`cat-edit-${c.id}`}
                        className="px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">Modifier</button>
                      <button onClick={() => toggleArchive(c)} data-action={`cat-archive-${c.id}`}
                        className="px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 rounded-lg transition-colors">
                        {c.actif ? "Archiver" : "Restaurer"}
                      </button>
                      <button onClick={() => deleteCat(c)} data-action={`cat-delete-${c.id}`}
                        className={`px-2 py-1 text-xs font-medium rounded-lg transition-colors ${catConfirm === c.id ? "bg-rose-600 text-white hover:bg-rose-700" : "text-rose-700 hover:bg-rose-50"}`}>
                        {catConfirm === c.id ? "Confirmer ?" : "Supprimer"}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {catMsg && <div className={`text-sm p-3 mt-3 rounded-xl border ${catMsg.tone === "danger" ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-emerald-50 border-emerald-200 text-emerald-700"}`} role="status">{catMsg.text}</div>}
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
                    <th className="py-2 pr-4 w-12"><span className="sr-only">Photo</span></th>
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
                      <td className="py-2 pr-4">
                        {a.photo_hash ? (
                          <img src={`/api/articles/${a.id}/photo?v=${a.photo_hash.slice(0, 8)}`} alt="" className="h-10 w-10 rounded-lg object-cover border border-slate-200" />
                        ) : (
                          <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 border border-slate-200 text-slate-400 text-sm font-semibold" aria-hidden="true">{a.nom.charAt(0).toUpperCase()}</span>
                        )}
                      </td>
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
