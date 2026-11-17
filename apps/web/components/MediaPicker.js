"use client";
import { useEffect, useRef, useState } from "react";

// Sélecteur de média (bibliothèque, v0.4 — pattern standard type WordPress/
// media picker mobile) : grille de vignettes avec badge « Utilisée ×n »,
// recherche locale, téléversement possible depuis la modale, sélection →
// onSelect({id, hash}). La modale est fermable par Échap et clic sur le fond.
export default function MediaPicker({ open, onClose, onSelect, currentHash, restaurantName }) {
  const [items, setItems] = useState(null); // null = chargement
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setErr(null);
    load();
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function load() {
    setBusy(true);
    setItems(null);
    try {
      const r = await fetch("/api/media");
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(data.error || "Bibliothèque indisponible"); return; }
      setItems(data.media || []);
    } catch {
      setErr("Serveur indisponible — réessayez");
    } finally { setBusy(false); }
  }

  async function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/media", { method: "POST", body: fd });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(data.error || "Téléversement refusé"); return; }
      setItems((prev) => {
        if (data.dedup) return prev; // déjà dans la bibliothèque
        return [{ ...data.media, nb_articles: 0 }, ...(prev || [])];
      });
      onSelect({ id: data.media.id, hash: data.media.hash }); // sélection immédiate
      onClose();
    } catch {
      setErr("Serveur indisponible — réessayez");
    } finally { setBusy(false); }
  }

  if (!open) return null;
  const norm = (s) => (s || "").toLowerCase();
  const visible = (items || []).filter((m) => !query.trim() || norm(m.hash).includes(norm(query.trim())));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Bibliothèque d'images">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-4 p-5 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Bibliothèque d'images</h2>
            <p className="text-xs text-slate-500">Images du restaurant — réutilisables sur tous les articles.</p>
          </div>
          <button onClick={onClose} data-action="media-close" aria-label="Fermer"
            className="h-9 w-9 grid place-items-center rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-slate-100">
          <div className="relative flex-1 min-w-40">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            </span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher (empreinte…)"
              aria-label="Rechercher dans la bibliothèque"
              className="h-9 w-full pl-9 pr-3 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" />
          </div>
          <label className={`inline-flex items-center gap-2 h-9 px-3 text-xs font-medium rounded-lg border transition-colors ${busy ? "opacity-50 pointer-events-none" : "border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            Téléverser une nouvelle image
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={busy} className="sr-only" data-action="media-upload" />
          </label>
        </div>

        <div className="p-5 overflow-y-auto grow">
          {err ? (
            <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{err}</p>
          ) : items === null ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3" aria-hidden="true">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-square rounded-xl bg-slate-100 animate-pulse" />)}
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center">
              <div className="bg-slate-100 rounded-full p-6 mb-4 inline-flex" aria-hidden="true">🖼️</div>
              <h3 className="text-base font-semibold text-slate-900">Bibliothèque vide</h3>
              <p className="text-sm text-slate-500 mt-1">Téléversez votre première image ci-dessus — elle sera réutilisable.</p>
            </div>
          ) : visible.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">Aucun résultat pour « {query} ».</p>
          ) : (
            <ul className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {visible.map((m) => (
                <li key={m.id}>
                  <button onClick={() => { onSelect({ id: m.id, hash: m.hash }); onClose(); }} data-action={`media-pick-${m.id}`}
                    className={`block w-full group relative rounded-xl overflow-hidden border transition-[colors,transform] duration-150 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-blue-600 ${currentHash === m.hash ? "border-blue-600 ring-2 ring-blue-600/30" : "border-slate-200 hover:border-blue-400"}`}>
                    <img src={`/api/media/${m.id}/photo?v=${m.hash.slice(0, 8)}`} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                    {currentHash === m.hash && (
                      <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-blue-600 text-white">Active</span>
                    )}
                    <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-slate-900/70 text-white">
                      {m.nb_articles > 0 ? `×${m.nb_articles}` : "—"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400 flex items-center justify-between">
          <span>{items ? `${items.length} image(s) — JPEG, PNG, WebP · 2 Mo max` : ""}</span>
          <span>Échap ou clic extérieur pour fermer</span>
        </div>
      </div>
    </div>
  );
}
