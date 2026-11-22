"use client";
import { useMemo, useState } from "react";
import { presetFrame } from "../lib/preset-frame";

// S-13 — Administration des styles d'image (v0.5).
// Un style (preset) décrit la PRÉSENTATION : forme, cadrage, ratio, arrondi,
// ombre et contexte. Il est réutilisable par plusieurs catégories/articles et
// par plusieurs écrans (BO, menu tablette, ticket, kiosque) : ajouter un écran
// ne demande aucune nouvelle table, seulement un nouveau contexte.
// Aperçu en direct sur une vraie photo du restaurant — ce que le gérant voit
// ici est exactement ce que la tablette affichera.

const CONTEXTES = [
  { value: "bo", label: "Back-office" },
  { value: "menu", label: "Menu tablette" },
  { value: "ticket", label: "Ticket" },
  { value: "kiosque", label: "Kiosque" },
];

const FORMES = [
  { value: "carre", label: "Carré" },
  { value: "arrondi", label: "Arrondi" },
  { value: "cercle", label: "Cercle" },
  { value: "bandeau", label: "Bandeau" },
];

const RATIOS = ["1:1", "4:3", "3:2", "16:9"];

const VIDE = {
  nom: "", forme: "arrondi", cadrage: "cover", ratio: "1:1",
  rayon: 12, ombre: false, contexte: "menu", par_defaut: false,
};

function contextLabel(value) {
  return CONTEXTES.find((c) => c.value === value)?.label || value;
}

function Apercu({ preset, photo, label }) {
  const frame = presetFrame(preset);
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="w-full max-w-[240px] overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-200"
        style={{ aspectRatio: frame.aspectRatio, borderRadius: frame.borderRadius, boxShadow: frame.boxShadow }}
      >
        {photo ? (
          <img
            src={photo}
            alt="Aperçu du style appliqué à une photo du restaurant"
            className="h-full w-full"
            style={{ objectFit: frame.objectFit }}
          />
        ) : (
          <div className="h-full w-full grid place-items-center text-slate-400 text-3xl font-bold" aria-hidden="true">C</div>
        )}
      </div>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}

export default function ApparenceClient({ presets, sample }) {
  const [items, setItems] = useState(presets || []);
  const [form, setForm] = useState(VIDE);
  const [editing, setEditing] = useState(null); // id du style en cours d'édition
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // {tone, text}
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [which, setWhich] = useState(sample?.article ? "article" : sample?.category ? "category" : null);

  // Photo d'aperçu : article choisi sinon catégorie (variante « card », jamais
  // l'original de 5 Mo — même règle que le BO et la tablette).
  const photo = useMemo(() => {
    const pick = which === "category" ? sample?.category : sample?.article;
    if (!pick) return null;
    const table = which === "category" ? "categories" : "articles";
    return `/api/${table}/${pick.id}/photo?variant=card&v=${String(pick.photo_hash || "").slice(0, 8)}`;
  }, [which, sample]);

  const parContexte = useMemo(() => {
    const map = new Map();
    for (const p of items) {
      if (!map.has(p.contexte)) map.set(p.contexte, []);
      map.get(p.contexte).push(p);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (b.par_defaut ? 1 : 0) - (a.par_defaut ? 1 : 0) || a.nom.localeCompare(b.nom));
    }
    return map;
  }, [items]);

  function setField(key, value) {
    // Un bandeau est large par nature : on propose 16:9 s'il n'a pas déjà un
    // ratio panoramique (le gérant reste libre de le changer ensuite).
    if (key === "forme" && value === "bandeau" && ["1:1", "4:3"].includes(form.ratio)) {
      setForm((f) => ({ ...f, forme: value, ratio: "16:9" }));
      return;
    }
    setForm((f) => ({ ...f, [key]: value }));
  }

  function startCreate() {
    setEditing(null);
    setForm(VIDE);
    setMsg(null);
  }

  function startEdit(p) {
    setEditing(p.id);
    setForm({
      nom: p.nom, forme: p.forme, cadrage: p.cadrage, ratio: p.ratio,
      rayon: Number(p.rayon), ombre: p.ombre === true, contexte: p.contexte,
      par_defaut: p.par_defaut === true,
    });
    setMsg(null);
    document.getElementById("preset-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function call(url, method, body) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg({ tone: "danger", text: data.error || "Opération refusée" });
        return null;
      }
      return data;
    } catch {
      setMsg({ tone: "danger", text: "Serveur indisponible — réessayez" });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    if (form.nom.trim().length < 2) {
      return setMsg({ tone: "danger", text: "Nom du style obligatoire (2–40 caractères)" });
    }
    const payload = {
      nom: form.nom.trim(),
      forme: form.forme,
      cadrage: form.cadrage,
      ratio: form.ratio,
      rayon: Number(form.rayon),
      ombre: form.ombre,
      contexte: form.contexte,
      par_defaut: form.par_defaut,
    };
    const data = editing
      ? await call(`/api/presets/${editing}`, "PATCH", payload)
      : await call("/api/presets", "POST", payload);
    if (!data) return;

    // Rechargement complet : un style par défaut peut en avoir détrôné un
    // autre dans le même contexte (l'API le garantit côté base).
    const list = await call("/api/presets", "GET");
    if (list) setItems(list.presets);
    setMsg({ tone: "success", text: editing ? "Style enregistré" : "Style créé" });
    setEditing(null);
    setForm(VIDE);
  }

  async function makeDefault(p) {
    const data = await call(`/api/presets/${p.id}`, "PATCH", {
      nom: p.nom, forme: p.forme, cadrage: p.cadrage, ratio: p.ratio,
      rayon: Number(p.rayon), ombre: p.ombre === true, contexte: p.contexte,
      par_defaut: true,
    });
    if (!data) return;
    const list = await call("/api/presets", "GET");
    if (list) setItems(list.presets);
    setMsg({ tone: "success", text: `« ${p.nom} » est désormais le style par défaut (${contextLabel(p.contexte)})` });
  }

  async function remove(p) {
    if (confirmDelete !== p.id) {
      setConfirmDelete(p.id); // double étape : le bouton devient « Confirmer »
      return;
    }
    setConfirmDelete(null);
    const data = await call(`/api/presets/${p.id}`, "DELETE");
    if (!data) return;
    setItems((prev) => prev.filter((x) => x.id !== p.id));
    if (editing === p.id) { setEditing(null); setForm(VIDE); }
    setMsg({ tone: "success", text: "Style supprimé" });
  }

  const pickCls = "h-10 w-full px-3 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow";
  const tone = (t) => (t === "danger" ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-emerald-50 border-emerald-200 text-emerald-700");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <section id="preset-form" className="lg:col-span-2 flex flex-col gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h2 className="text-lg font-semibold text-slate-900">{editing ? "Modifier le style" : "Nouveau style"}</h2>
            {editing && (
              <button type="button" onClick={startCreate} data-action="preset-cancel"
                className="text-xs font-medium text-slate-500 hover:text-slate-700">Annuler</button>
            )}
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Un style ne modifie jamais la photo : il définit la forme, le cadrage et l'arrondi
            utilisés à l'affichage. Le serveur ne sert que des images optimisées.
          </p>

          <form onSubmit={save} className="flex flex-col gap-4" data-form="preset">
            <div>
              <label htmlFor="p-nom" className="block text-xs font-semibold text-slate-700 mb-1">Nom du style <span className="text-rose-600">*</span></label>
              <input id="p-nom" value={form.nom} onChange={(e) => setField("nom", e.target.value)} maxLength={40} required
                className={pickCls} placeholder="Vignette du menu" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="p-contexte" className="block text-xs font-semibold text-slate-700 mb-1">Contexte</label>
                <select id="p-contexte" value={form.contexte} onChange={(e) => setField("contexte", e.target.value)} className={pickCls}>
                  {CONTEXTES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="p-forme" className="block text-xs font-semibold text-slate-700 mb-1">Forme</label>
                <select id="p-forme" value={form.forme} onChange={(e) => setField("forme", e.target.value)} className={pickCls}>
                  {FORMES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="p-ratio" className="block text-xs font-semibold text-slate-700 mb-1">Ratio</label>
                <select id="p-ratio" value={form.ratio} onChange={(e) => setField("ratio", e.target.value)} className={pickCls}>
                  {RATIOS.map((r) => <option key={r} value={r}>{r.replace(":", " : ")}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="p-cadrage" className="block text-xs font-semibold text-slate-700 mb-1">Cadrage</label>
                <select id="p-cadrage" value={form.cadrage} onChange={(e) => setField("cadrage", e.target.value)} className={pickCls}>
                  <option value="cover">Remplir (cover)</option>
                  <option value="contain">Entier (contain)</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="p-rayon" className="block text-xs font-semibold text-slate-700 mb-1">
                Arrondi : <span className="font-mono tabular-nums">{form.forme === "cercle" ? "cercle" : `${form.rayon} px`}</span>
              </label>
              <input id="p-rayon" type="range" min="0" max="64" step="1" value={form.rayon}
                onChange={(e) => setField("rayon", Number(e.target.value))} disabled={form.forme === "cercle"}
                className="w-full accent-blue-600" />
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.ombre} onChange={(e) => setField("ombre", e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              Ombre portée
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.par_defaut} onChange={(e) => setField("par_defaut", e.target.checked)} className="h-4 w-4 mt-0.5 rounded border-slate-300" />
              <span>
                Style par défaut du contexte
                <span className="block text-xs text-slate-500">Appliqué aux catégories et articles qui n'ont pas de style propre. Un seul défaut par contexte.</span>
              </span>
            </label>

            {msg && <div className={`text-sm p-3 rounded-xl border ${tone(msg.tone)}`} role="status">{msg.text}</div>}

            <button type="submit" disabled={busy} data-action="save-preset"
              className="h-10 px-4 self-start bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-medium rounded-lg transition-[transform,colors] duration-150 disabled:opacity-50 disabled:pointer-events-none">
              {busy ? "Enregistrement…" : editing ? "Enregistrer le style" : "Créer le style"}
            </button>
          </form>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Styles du restaurant</h2>
          <p className="text-xs text-slate-500 mb-4">Le badge « Défaut » marque le style appliqué par défaut dans chaque contexte.</p>

          {items.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">Aucun style — créez le premier ci-dessus.</p>
          ) : (
            <div className="flex flex-col gap-5">
              {[...parContexte.entries()].map(([ctx, list]) => (
                <div key={ctx}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{contextLabel(ctx)}</h3>
                  <ul className="flex flex-col divide-y divide-slate-100">
                    {list.map((p) => (
                      <li key={p.id} className={`py-2 flex items-center gap-2 ${editing === p.id ? "bg-blue-50/60 -mx-2 px-2 rounded-lg" : ""}`}>
                        <span
                          className="h-8 w-8 shrink-0 border border-slate-200 bg-gradient-to-br from-slate-100 to-slate-200"
                          style={presetFrame(p)}
                          aria-hidden="true"
                        />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm text-slate-900 truncate" title={p.nom}>{p.nom}</span>
                          <span className="block text-xs text-slate-500">
                            {p.forme} · {p.ratio} · {p.cadrage === "cover" ? "remplir" : "entier"}
                            {p.par_defaut ? "" : ` · ${Number(p.nb_categories) + Number(p.nb_articles)} utilisation(s)`}
                          </span>
                        </span>
                        {p.par_defaut ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">Défaut</span>
                        ) : (
                          <button onClick={() => makeDefault(p)} disabled={busy} data-action={`preset-default-${p.id}`}
                            className="px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">Par défaut</button>
                        )}
                        <button onClick={() => startEdit(p)} data-action={`preset-edit-${p.id}`}
                          className="px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">Modifier</button>
                        <button onClick={() => remove(p)} disabled={busy} data-action={`preset-delete-${p.id}`}
                          className={`px-2 py-1 text-xs font-medium rounded-lg transition-colors ${confirmDelete === p.id ? "bg-rose-600 text-white hover:bg-rose-700" : "text-rose-700 hover:bg-rose-50"}`}>
                          {confirmDelete === p.id ? "Confirmer ?" : "Supprimer"}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="lg:col-span-3">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 lg:sticky lg:top-24">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Aperçu en direct</h2>
          <p className="text-xs text-slate-500 mb-4">
            Le style sélectionné dans le formulaire, appliqué à une vraie photo du restaurant.
            {sample?.counts && (
              <> Photos disponibles : {sample.counts.articles} article(s), {sample.counts.categories} catégorie(s).</>
            )}
          </p>

          {sample?.article || sample?.category ? (
            <>
              <div className="flex gap-2 mb-4" role="group" aria-label="Photo d'aperçu">
                {sample?.article && (
                  <button type="button" onClick={() => setWhich("article")} data-action="preview-article"
                    className={`h-8 px-3 text-xs font-medium rounded-lg border transition-colors ${which === "article" ? "bg-blue-50 text-blue-700 border-blue-200" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
                    Photo d'article
                  </button>
                )}
                {sample?.category && (
                  <button type="button" onClick={() => setWhich("category")} data-action="preview-category"
                    className={`h-8 px-3 text-xs font-medium rounded-lg border transition-colors ${which === "category" ? "bg-blue-50 text-blue-700 border-blue-200" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
                    Photo de catégorie
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-6 place-items-start">
                <Apercu preset={form} photo={photo} label="Formulaire" />
                {items.filter((p) => p.par_defaut && p.contexte === form.contexte).map((p) => (
                  <Apercu key={p.id} preset={p} photo={photo} label={`Défaut — ${p.nom}`} />
                ))}
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-6 place-items-start">
              <Apercu preset={form} photo={null} label="Formulaire" />
              <div className="text-sm text-slate-500 self-center">
                Aucune photo pour l'instant. Téléversez une image depuis <strong>Menu &amp; TVA</strong>
                {" "}(article ou catégorie) pour voir l'aperçu sur une vraie photo.
              </div>
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Comment ça s'applique</h3>
            <ul className="text-xs text-slate-600 flex flex-col gap-1.5 list-disc pl-4">
              <li>Une catégorie ou un article sans style propre utilise le <strong>style par défaut</strong> de son contexte.</li>
              <li>Le menu tablette utilise le contexte <strong>Menu tablette</strong> ; le BO, le contexte <strong>Back-office</strong>.</li>
              <li>Trois tailles optimisées sont générées à l'envoi : vignette, carte et bandeau — l'original n'est jamais téléchargé.</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
