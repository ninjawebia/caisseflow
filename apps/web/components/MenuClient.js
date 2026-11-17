"use client";
import { useState, useMemo } from "react";
import MediaPicker from "./MediaPicker";

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
  // Prix saisi en HT — le TTC est calculé et affiché en temps réel.
  const [form, setForm] = useState({ nom: "", prix: "", tva: "10", categorie: categories[0]?.id || "", actif: true });
  // Recherche (🔍) + tri de la liste d'articles.
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(null); // null = ordre serveur | {key:"nom"|"cat", dir:"asc"|"desc"}

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

  // Prix TTC calculé en direct depuis le HT saisi et le taux TVA choisi.
  const ttcLive = useMemo(() => {
    const ht = Number(form.prix) || 0;
    return Math.round(ht * (1 + Number(form.tva) / 100) * 100) / 100;
  }, [form.prix, form.tva]);

  function resetForm() {
    setForm({ nom: "", prix: "", tva: "10", categorie: categories[0]?.id || "", actif: true });
    setEditing(null);
    setPendingPhoto(null);
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
    // Prix saisi en HT → TTC = HT × (1 + TVA/100), arrondi au centime.
    const ttc = Math.round((Number(form.prix) || 0) * (1 + Number(form.tva) / 100) * 100) / 100;
    const payload = {
      nom: form.nom.trim(),
      prix_ttc: ttc,
      taux_tva: Number(form.tva),
      categorie_id: form.categorie || null,
      actif: form.actif,
    };
    if (!payload.nom || payload.nom.length < 2) return setMsg({ tone: "danger", text: "Nom obligatoire (2 caractères min.)" });
    if (!(payload.prix_ttc > 0 && payload.prix_ttc <= 10000)) return setMsg({ tone: "danger", text: "Prix invalide (0–10 000 €)" });

    const res = editing ? await send(`/api/articles/${editing}`, "PATCH", payload) : await send("/api/articles", "POST", payload);
    if (!res) return;
    const article = res.article;
    setItems((prev) => editing ? prev.map((a) => (a.id === editing ? article : a)) : [...prev, article]);

    // Photo choisie AVANT la création : fichier (upload direct) ou média de
    // la bibliothèque (assignation) — envoyée tout de suite au nouvel article.
    let suffixe = "";
    if (pendingPhoto?.file) {
      const up = await uploadTo(article.id, pendingPhoto.file);
      if (up.ok) {
        setItems((prev) => prev.map((a) => (a.id === article.id ? { ...a, photo_hash: up.hash } : a)));
        suffixe = " avec sa photo";
      }
    } else if (pendingPhoto?.mediaId) {
      const ok = await assignMedia(article.id, pendingPhoto.mediaId, pendingPhoto.hash);
      if (ok) suffixe = " avec sa photo";
    }
    setMsg({ tone: "success", text: (editing ? "Article modifié" : "Article créé") + suffixe });
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
  // Photo sélectionnée pendant la CRÉATION (l'article n'existe pas encore) —
  // stockée côté client avec un aperçu, envoyée juste après le POST de création.
  const [pendingPhoto, setPendingPhoto] = useState(null); // {file, url}

  // Envoi réel du fichier vers /api/articles/<id>/photo.
  async function uploadTo(articleId, file) {
    setPhotoBusy(true);
    setPhotoMsg(null);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const r = await fetch(`/api/articles/${articleId}/photo`, { method: "POST", body: fd });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setPhotoMsg({ tone: "danger", text: data.error || "Téléversement refusé" });
        return { ok: false };
      }
      setPhotoMsg({ tone: "success", text: "Photo enregistrée" });
      return { ok: true, hash: data.hash };
    } catch {
      setPhotoMsg({ tone: "danger", text: "Serveur indisponible — réessayez" });
      return { ok: false };
    } finally {
      setPhotoBusy(false);
    }
  }

  // En édition : envoi immédiat. En création : stocké en attente (aperçu local).
  function pickPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // réutilisable
    if (!file) return;
    if (editing) uploadTo(editing, file);
    else setPendingPhoto((p) => { if (p?.url) URL.revokeObjectURL(p.url); return { file, url: URL.createObjectURL(file) }; });
  }

  function dropPendingPhoto() {
    setPendingPhoto((p) => { if (p?.url) URL.revokeObjectURL(p.url); return null; });
  }

  // --- Bibliothèque média (v0.4) — réutiliser une image déjà téléversée ---
  const [libOpen, setLibOpen] = useState(false);

  // Assignation d'un asset de la bibliothèque à un article (PATCH JSON).
  async function assignMedia(articleId, mediaId, hash) {
    setPhotoBusy(true);
    setPhotoMsg(null);
    try {
      const r = await fetch(`/api/articles/${articleId}/photo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ media_id: mediaId }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setPhotoMsg({ tone: "danger", text: data.error || "Assignation refusée" });
        return false;
      }
      setItems((prev) => prev.map((a) => (a.id === articleId ? { ...a, photo_hash: data.hash || hash } : a)));
      setPhotoMsg({ tone: "success", text: "Photo mise à jour" });
      return true;
    } catch {
      setPhotoMsg({ tone: "danger", text: "Serveur indisponible — réessayez" });
      return false;
    } finally { setPhotoBusy(false); }
  }

  // Sélection dans la modale : édition → assignation immédiate ; création →
  // stockée en attente (comme un fichier), assignée juste après le POST.
  function pickFromLibrary(media) {
    if (editing) assignMedia(editing, media.id, media.hash);
    else setPendingPhoto((p) => { if (p?.url) URL.revokeObjectURL(p.url); return { mediaId: media.id, hash: media.hash, url: `/api/media/${media.id}/photo?v=${media.hash.slice(0, 8)}` }; });
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
    // Champ prix = HT (le TTC affiché en direct est recalculé à l'identique).
    const ht = Math.round((Number(a.prix_ttc) / (1 + Number(a.taux_tva) / 100)) * 100) / 100;
    setForm({ nom: a.nom, prix: String(ht), tva: String(a.taux_tva), categorie: a.categorie_id || "", actif: a.actif });
    setPendingPhoto(null);
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

  // Liste filtrée (recherche 🔍, accents ignorés) puis triée (en-têtes cliquables).
  const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const visibleItems = useMemo(() => {
    const q = norm(query.trim());
    let list = items.filter((a) => !q || norm(a.nom).includes(q) || norm(a.categorie_nom).includes(q));
    if (sort) {
      const dir = sort.dir === "asc" ? 1 : -1;
      list = [...list].sort((x, y) => {
        const kx = sort.key === "nom" ? norm(x.nom) : norm(x.categorie_nom);
        const ky = sort.key === "nom" ? norm(y.nom) : norm(y.categorie_nom);
        return kx < ky ? -dir : kx > ky ? dir : 0;
      });
    }
    return list;
  }, [items, query, sort]);

  // Clic sur l'en-tête : asc → desc → retour à l'ordre serveur.
  function toggleSort(key) {
    setSort((s) => (s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <MediaPicker open={libOpen} onClose={() => setLibOpen(false)} onSelect={pickFromLibrary}
        currentHash={editing ? items.find((a) => a.id === editing)?.photo_hash : pendingPhoto?.hash} />
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
                <label htmlFor="a-prix" className="block text-xs font-semibold text-slate-700 mb-1">Prix HT (€) <span className="text-rose-600">*</span></label>
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
            {/* Prix TTC calculé en temps réel pendant la saisie (HT × TVA) */}
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-blue-50 border border-blue-100">
              <span className="text-sm font-medium text-slate-600">Prix TTC (calculé)</span>
              <span data-testid="ttc-live" className="text-lg font-semibold text-blue-700 font-mono tabular-nums">{ttcLive.toFixed(2).replace(".", ",")} €</span>
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

            {/* Photo de l'article (F2) — ajout possible dès la création (aperçu
                local, upload automatique juste après l'enregistrement). */}
            <div>
              <span className="block text-xs font-semibold text-slate-700 mb-1">Photo de l'article</span>
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 shrink-0 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden grid place-items-center" aria-hidden="true">
                  {editing && items.find((a) => a.id === editing)?.photo_hash ? (
                    <img src={`/api/articles/${editing}/photo?v=${items.find((a) => a.id === editing)?.photo_hash?.slice(0, 8)}`} alt="" className="h-16 w-16 object-cover" />
                  ) : pendingPhoto?.url ? (
                    <img src={pendingPhoto.url} alt="" className="h-16 w-16 object-cover" />
                  ) : (
                    <span className="text-slate-400 text-lg font-semibold">{(form.nom || "?").charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap gap-1">
                    <label className={`inline-flex items-center justify-center h-8 px-3 text-xs font-medium rounded-lg border transition-colors ${photoBusy ? "opacity-50 pointer-events-none border-slate-200 text-slate-400" : "border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"}`}>
                      {photoBusy ? "Envoi…" : editing && items.find((a) => a.id === editing)?.photo_hash ? "Téléverser" : "Téléverser une image"}
                      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickPhoto} disabled={photoBusy} className="sr-only" data-action="photo-input" />
                    </label>
                    <button type="button" onClick={() => setLibOpen(true)} disabled={photoBusy} data-action="photo-library"
                      className="h-8 px-3 text-xs font-medium text-blue-700 border border-blue-200 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50 disabled:pointer-events-none">
                      Choisir dans la bibliothèque
                    </button>
                  </div>
                  {editing && items.find((a) => a.id === editing)?.photo_hash && (
                    <button type="button" onClick={deletePhoto} disabled={photoBusy} data-action="photo-delete"
                      className="h-8 px-3 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-lg transition-colors text-left">Supprimer la photo</button>
                  )}
                  {!editing && pendingPhoto?.url && (
                    <button type="button" onClick={dropPendingPhoto} disabled={photoBusy} data-action="photo-drop"
                      className="h-8 px-3 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-lg transition-colors text-left">Retirer</button>
                  )}
                  <span className="text-xs text-slate-400">JPEG, PNG ou WebP — 2 Mo max, 2048 px max</span>
                </div>
              </div>
              {photoMsg && <div className={`text-xs p-2 mt-2 rounded-lg border ${photoMsg.tone === "danger" ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-emerald-50 border-emerald-200 text-emerald-700"}`} role="status">{photoMsg.text}</div>}
            </div>
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
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-lg font-semibold text-slate-900 whitespace-nowrap">Carte du restaurant ({items.length})</h2>
            {/* Recherche 🔍 — filtre temps réel sur le nom et la catégorie */}
            <div className="relative flex-1 max-w-xs">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
              </span>
              <input id="article-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un article…" aria-label="Rechercher un article"
                className="h-10 w-full pl-9 pr-3 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow" />
            </div>
          </div>
          {items.length === 0 ? (
            <div className="py-12 text-center">
              <div className="bg-slate-100 rounded-full p-6 mb-4 inline-flex" aria-hidden="true">🍽️</div>
              <h3 className="text-base font-semibold text-slate-900">Aucun article</h3>
              <p className="text-sm text-slate-500 mt-1">Créez votre premier article avec le formulaire.</p>
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="py-12 text-center">
              <div className="bg-slate-100 rounded-full p-6 mb-4 inline-flex" aria-hidden="true">🔍</div>
              <h3 className="text-base font-semibold text-slate-900">Aucun résultat</h3>
              <p className="text-sm text-slate-500 mt-1">Aucun article ne correspond à « {query} ».</p>
              <button onClick={() => setQuery("")} data-action="clear-search"
                className="mt-3 h-9 px-3 border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors">Effacer la recherche</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-4 w-14"><span className="sr-only">Photo</span></th>
                    <th className="py-2 pr-4" aria-sort={sort?.key === "nom" ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                      <button onClick={() => toggleSort("nom")} data-action="sort-nom"
                        className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors">
                        Article
                        <span className="text-slate-400" aria-hidden="true">{sort?.key === "nom" ? (sort.dir === "asc" ? "▲" : "▼") : "⇅"}</span>
                      </button>
                    </th>
                    <th className="py-2 pr-4" aria-sort={sort?.key === "cat" ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                      <button onClick={() => toggleSort("cat")} data-action="sort-cat"
                        className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors">
                        Catégorie
                        <span className="text-slate-400" aria-hidden="true">{sort?.key === "cat" ? (sort.dir === "asc" ? "▲" : "▼") : "⇅"}</span>
                      </button>
                    </th>
                    <th className="py-2 pr-4 text-right">Prix TTC</th>
                    <th className="py-2 pr-4 text-right">TVA</th>
                    <th className="py-2 pr-4 text-center">État</th>
                    <th className="py-2 text-right w-20">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((a) => (
                    <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 pr-4">
                        {a.photo_hash ? (
                          <img src={`/api/articles/${a.id}/photo?v=${a.photo_hash.slice(0, 8)}`} alt={`Photo de ${a.nom}`}
                            className="h-12 w-12 rounded-xl object-cover border border-slate-200 shadow-sm" />
                        ) : (
                          <span className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-200 text-slate-400 text-sm font-semibold shadow-inner" aria-hidden="true">{a.nom.charAt(0).toUpperCase()}</span>
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
