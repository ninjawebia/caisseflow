"use client";
import { useState } from "react";

// S-11 — Ticket template (S-11 / IMP-4). Free fields (logo text, footer
// mentions) are editable; the legal mentions required by NF525 are locked and
// always printed by the caisse app (they are NOT configurable).
export default function TicketClient({ template, legal }) {
  const [form, setForm] = useState({ logo_text: template.logo_text || "", mentions: template.mentions || "" });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/ticket-template", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await r.json();
      if (!r.ok) { setMsg({ tone: "danger", text: data.error || "Enregistrement refusé" }); return; }
      setMsg({ tone: "success", text: "Modèle enregistré — synchronisé vers la tablette caisse" });
    } catch {
      setMsg({ tone: "danger", text: "Serveur indisponible — réessayez" });
    } finally { setBusy(false); }
  }

  const tone = (t) => (t === "danger" ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-emerald-50 border-emerald-200 text-emerald-700");
  const inputCls = "h-10 w-full px-3 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Champs libres</h2>
        <form onSubmit={save} className="flex flex-col gap-4" data-form="ticket-template">
          <div>
            <label htmlFor="t-logo" className="block text-xs font-semibold text-slate-700 mb-1">Texte du logo (nom commercial)</label>
            <input id="t-logo" value={form.logo_text} onChange={(e) => setForm({ ...form, logo_text: e.target.value })} maxLength={40}
              className={inputCls} placeholder="Le Petit Bistrot" />
          </div>
          <div>
            <label htmlFor="t-mentions" className="block text-xs font-semibold text-slate-700 mb-1">Mentions de pied de ticket</label>
            <textarea id="t-mentions" value={form.mentions} onChange={(e) => setForm({ ...form, mentions: e.target.value })} rows={3} maxLength={200}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow" placeholder="Merci de votre visite…" />
          </div>
          {msg && <div className={`text-sm p-3 rounded-xl border ${tone(msg.tone)}`}>{msg.text}</div>}
          <button type="submit" disabled={busy} data-action="save-ticket-template"
            className="h-10 px-4 self-start bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-medium rounded-lg transition-[transform,colors] duration-150 disabled:opacity-50 disabled:pointer-events-none">
            {busy ? "Enregistrement…" : "Enregistrer le modèle"}
          </button>
        </form>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-1">Mentions légales verrouillées</h2>
        <p className="text-xs text-slate-500 mb-4">Imposées par la NF525 — non modifiables, toujours imprimées par l'application caisse.</p>
        <ul className="flex flex-col gap-2 text-sm">
          {legal.map((l) => (
            <li key={l.label} className="flex items-center justify-between border-b border-slate-100 py-2">
              <span className="text-slate-700">{l.label}</span>
              <span className="font-mono text-xs text-slate-500 max-w-56 truncate text-right" title={l.value}>{l.value}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500 mt-4">
          Impression : ESC/POS sur imprimante Bluetooth / USB / TCP 9100 (module IMP) — l'impression ne conditionne
          jamais l'écriture fiscale : l'entrée est chaînée d'abord, le ticket n'est qu'un support (IMP-5).
        </p>
      </section>
    </div>
  );
}
