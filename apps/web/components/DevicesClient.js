"use client";
import { useState } from "react";
import { formatDateTime } from "../lib/format";

// Appareils (S-13) — enrôlement des tablettes caisse. Le jeton est généré côté
// serveur (256 bits, stocké HASHÉ) et n'est affiché qu'UNE seule fois ici : il
// est ensuite conservé par la tablette dans son Keystore (PRD 4.1.10, SYNC-4).
export default function DevicesClient({ devices }) {
  const [list, setList] = useState(devices);
  const [poste, setPoste] = useState("");
  const [token, setToken] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  async function send(url, method, body) {
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

  async function enroll(e) {
    e.preventDefault();
    const res = await send("/api/devices", "POST", { poste });
    if (!res) return;
    setList((prev) => [{ ...res.device, actif: true, a_synchronise: false }, ...prev]);
    setToken({ value: res.token, poste: res.device.poste });
    setCopied(false);
    setPoste("");
    setMsg({ tone: "success", text: `Poste ${res.device.poste} enrôlé — copiez le jeton maintenant` });
  }

  async function revoke(d) {
    const res = await send(`/api/devices/${d.id}`, "DELETE");
    if (!res) return;
    setList((prev) => prev.map((x) => (x.id === d.id ? { ...x, actif: false } : x)));
    setConfirmId(null);
    if (token && token.poste === d.poste) setToken(null);
    setMsg({ tone: "success", text: `Poste ${d.poste} révoqué — ses synchronisations sont refusées (401)` });
  }

  async function copyToken() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token.value);
      setCopied(true);
    } catch {
      setCopied(false);
      setMsg({ tone: "danger", text: "Copie automatique impossible — sélectionnez le jeton et copiez-le à la main" });
    }
  }

  const actives = list.filter((d) => d.actif).length;

  return (
    <div className="flex flex-col gap-6">
      {msg && (
        <div
          role="status"
          className={`text-sm p-3 rounded-xl border ${msg.tone === "danger" ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-emerald-50 border-emerald-200 text-emerald-700"}`}
        >
          {msg.text}
        </div>
      )}

      {token && (
        <section className="bg-amber-50 border border-amber-300 rounded-2xl p-6" data-block="token-once">
          <h2 className="text-lg font-semibold text-amber-900">Jeton d&apos;enrôlement — {token.poste}</h2>
          <p className="text-sm text-amber-800 mt-1">
            Ce jeton n&apos;est affiché <strong>qu&apos;une seule fois</strong> et n&apos;est plus jamais relisible
            (seul son hash est stocké). Saisissez-le sur la tablette à l&apos;écran d&apos;enrôlement,
            puis conservez-le : il ne quittera pas l&apos;appareil.
          </p>
          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <code
              data-field="device-token"
              className="flex-1 min-w-0 select-all break-all bg-white border border-amber-300 rounded-lg px-3 py-2 text-sm font-mono text-slate-900"
            >
              {token.value}
            </code>
            <button
              type="button"
              onClick={copyToken}
              data-action="copy-token"
              className="h-10 px-4 shrink-0 bg-amber-600 hover:bg-amber-700 active:scale-[0.98] text-white font-medium rounded-lg transition-[transform,colors] duration-150"
            >
              {copied ? "Copié ✓" : "Copier"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setToken(null)}
            data-action="hide-token"
            className="mt-3 text-xs font-medium text-amber-900 underline underline-offset-2"
          >
            J&apos;ai enregistré le jeton — le masquer
          </button>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <section className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Enrôler une tablette</h2>
          <form onSubmit={enroll} className="flex flex-col gap-4" data-form="enroll-device">
            <div>
              <label htmlFor="d-poste" className="block text-xs font-semibold text-slate-700 mb-1">
                Identifiant du poste <span className="text-rose-600">*</span>
              </label>
              <input
                id="d-poste"
                value={poste}
                onChange={(e) => setPoste(e.target.value.toUpperCase())}
                required
                maxLength={8}
                pattern="POSTE-[0-9]{2}"
                placeholder="POSTE-01"
                className="h-10 w-full px-3 bg-white border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow"
              />
              <p className="text-xs text-slate-500 mt-1">
                Format <code className="font-mono">POSTE-01</code> à{" "}
                <code className="font-mono">POSTE-99</code>. Il préfixe la numérotation
                fiscale continue du journal (SYNC-4) et ne peut pas être réutilisé par
                deux tablettes actives.
              </p>
            </div>
            <button
              type="submit"
              disabled={busy || !poste}
              data-action="create-device"
              className="h-10 px-4 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-medium rounded-lg transition-[transform,colors] duration-150 disabled:opacity-50 disabled:pointer-events-none"
            >
              {busy ? "Génération…" : "Générer le jeton"}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-500 flex flex-col gap-1">
            <p>
              <strong className="text-slate-700">{actives}</strong> tablette{actives > 1 ? "s" : ""}{" "}
              active{actives > 1 ? "s" : ""} sur {list.length} enrôlement{list.length > 1 ? "s" : ""}.
            </p>
            <p>Révocation immédiate : les synchronisations de l&apos;appareil répondent 401.</p>
          </div>
        </section>

        <section className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Tablettes enrôlées ({list.length})</h2>

          {list.length === 0 ? (
            <div className="text-center py-10 px-4 border border-dashed border-slate-200 rounded-xl" data-state="empty">
              <p className="text-3xl" aria-hidden="true">📱</p>
              <p className="mt-2 text-sm font-medium text-slate-900">Aucune tablette enrôlée</p>
              <p className="mt-1 text-xs text-slate-500">
                Générez un jeton puis saisissez-le sur la tablette : l&apos;app caisse se connecte
                et télécharge son menu.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-4">Poste</th>
                    <th className="py-2 pr-4">Enrôlé le</th>
                    <th className="py-2 pr-4 text-center">Sync</th>
                    <th className="py-2 pr-4 text-center">État</th>
                    <th className="py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((d) => (
                    <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 pr-4 font-mono text-slate-900">{d.poste}</td>
                      <td className="py-2 pr-4 text-slate-500 tabular-nums">
                        {formatDateTime(d.created_at)}
                      </td>
                      <td className="py-2 pr-4 text-center">
                        <span className={`text-xs font-medium ${d.a_synchronise ? "text-emerald-700" : "text-slate-400"}`}>
                          {d.a_synchronise ? "reçue" : "jamais"}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${d.actif ? "bg-emerald-50 text-emerald-700 border-emerald-200/60" : "bg-slate-50 text-slate-500 border-slate-200"}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${d.actif ? "bg-emerald-500" : "bg-slate-400"}`} />
                          {d.actif ? "Actif" : "Révoqué"}
                        </span>
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        {!d.actif ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : confirmId === d.id ? (
                          <span className="inline-flex items-center gap-1">
                            <button
                              onClick={() => revoke(d)}
                              disabled={busy}
                              data-action={`confirm-revoke-${d.poste}`}
                              className="px-2 py-1 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors disabled:opacity-50"
                            >
                              Confirmer
                            </button>
                            <button
                              onClick={() => setConfirmId(null)}
                              data-action="cancel-revoke"
                              className="px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                              Annuler
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmId(d.id)}
                            disabled={busy}
                            data-action={`revoke-${d.poste}`}
                            className="px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            Révoquer
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
