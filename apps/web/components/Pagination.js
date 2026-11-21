// Pagination des listes longues (BO). Deux modes, même rendu :
// - pages serveur : `basePath` + `params` → liens qui conservent les filtres ;
// - état client (ex. recherche du menu) : `onChange`.
// Tokens DESIGN-BLUEPRINT § 5.3/5.4 : cibles 32 px, focus ring bleu-600,
// aucune information portée par la couleur seule (numéro de page en texte).
import { pageHref, pageCount as countPages, rangeLabel } from "../lib/pagination";

function numbers(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const keep = new Set([1, 2, pages - 1, pages, page - 1, page, page + 1]);
  const sorted = [...keep].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const out = [];
  let previous = 0;
  for (const p of sorted) {
    if (p - previous > 1) out.push("gap");
    out.push(p);
    previous = p;
  }
  return out;
}

export default function Pagination({ page, total, limit, basePath = null, params = null, onChange = null }) {
  if (!total) return null;
  const pages = countPages(total, limit);
  const items = numbers(page, pages);

  const itemClass = "inline-flex h-8 min-w-8 items-center justify-center px-2 rounded-lg border text-xs font-medium transition-colors";
  const idle = "border-slate-300 text-slate-700 hover:bg-slate-50";
  const current = "bg-blue-600 border-blue-600 text-white";
  const disabled = "border-slate-200 text-slate-300 pointer-events-none";

  function control(target, label, content) {
    const off = target < 1 || target > pages;
    const className = `${itemClass} ${off ? disabled : idle}`;
    if (onChange) {
      return (
        <button key={label} type="button" onClick={() => onChange(target)} disabled={off}
          aria-label={label} className={className}>{content}</button>
      );
    }
    return off ? (
      <span key={label} aria-disabled="true" aria-label={label} className={className}>{content}</span>
    ) : (
      <a key={label} href={pageHref(basePath, params, target)} aria-label={label} className={className}>{content}</a>
    );
  }

  return (
    <nav aria-label="Pagination" data-pagination data-page={page} data-pages={pages}
      className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-200">
      <p className="text-xs text-slate-500 font-mono tabular-nums" data-pagination-range>{rangeLabel(page, limit, total)}</p>
      <div className="flex items-center gap-1">
        {control(page - 1, "Page précédente", "‹")}
        {items.map((item, i) => item === "gap" ? (
          <span key={`gap-${i}`} className="px-1 text-xs text-slate-400" aria-hidden="true">…</span>
        ) : item === page ? (
          <span key={item} aria-current="page" data-action="page-current"
            className={`${itemClass} ${current}`}>{item}</span>
        ) : onChange ? (
          <button key={item} type="button" onClick={() => onChange(item)} aria-label={`Page ${item}`}
            className={`${itemClass} ${idle}`}>{item}</button>
        ) : (
          <a key={item} href={pageHref(basePath, params, item)} aria-label={`Page ${item}`}
            className={`${itemClass} ${idle}`}>{item}</a>
        ))}
        {control(page + 1, "Page suivante", "›")}
      </div>
    </nav>
  );
}
