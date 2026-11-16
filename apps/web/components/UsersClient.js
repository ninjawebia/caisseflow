"use client";
import { useState } from "react";

// Users & rights (S-04, BO-2). Web accounts (e-mail + role) and mobile
// staff (matricule + PIN hashed with bcrypt, never stored or sent in clear).
export default function UsersClient({ webUsers, mobileUsers }) {
  const [web, setWeb] = useState(webUsers);
  const [mobile, setMobile] = useState(mobileUsers);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ matricule: "", nom: "", role: "serveur", pin: "" });

  async function send(url, method, body) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) { setMsg({ tone: "danger", text: data.error || "Opération refusée" }); return null; }
      return data;
    } catch {
      setMsg({ tone: "danger", text: "Serveur indisponible — réessayez" });
      return null;
    } finally { setBusy(false); }
  }

  async function toggleWeb(u) {
    const res = await send(`/api/users-web/${u.id}`, "PATCH", { actif: !u.actif });
    if (!res) return;
    setWeb((prev) => prev.map((x) => (x.id === u.id ? { ...x, actif: res.user.actif } : x)));
    setMsg({ tone: "success", text: res.user.actif ? "Compte réactivé" : "Compte désactivé" });
  }

  async function createMobile(e) {
    e.preventDefault();
    const res = await send("/api/users-mobile", "POST", form);
    if (!res) return;
    setMobile((prev) => [...prev, res.user]);
    setMsg({ tone: "success", text: "Matricule créé — PIN hashé (Argon2/bcrypt), jamais transmis en clair" });
    setForm({ matricule: "", nom: "", role: "serveur", pin: "" });
  }

  async function disableMobile(u) {
    const res = await send(`/api/users-mobile/${u.id}`, "DELETE", {});
    if (!res) return;
    setMobile((prev) => prev.map((x) => (x.id === u.id ? { ...x, actif: false } : x)));
    setMsg({ tone: "success", text: "Matricule désactivé (tracé, jamais supprimé)" });
  }

  return (
    <div className="flex flex-col gap-6">
      {msg && <div className={`text-sm p-3 rounded-xl border ${msg.tone === "danger" ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-emerald-50 border-emerald-200 text-emerald-700"}`}>{msg.text}</div>}

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Comptes back-office (e-mail + mot de passe)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-4">Nom</th><th className="py-2 pr-4">E-mail</th><th className="py-2 pr-4">Rôle</th><th className="py-2 pr-4 text-center">État</th><th className="py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {web.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                  <td className="py-2 pr-4 text-slate-900">{u.nom}</td>
                  <td className="py-2 pr-4 text-slate-500">{u.email}</td>
                  <td className="py-2 pr-4">{u.role}</td>
                  <td className="py-2 pr-4 text-center">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${u.actif ? "bg-emerald-50 text-emerald-700 border-emerald-200/60" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${u.actif ? "bg-emerald-500" : "bg-slate-400"}`} />{u.actif ? "Actif" : "Désactivé"}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <button onClick={() => toggleWeb(u)} data-action={`toggle-web-${u.id}`} disabled={busy}
                      className="px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">{u.actif ? "Désactiver" : "Réactiver"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <section className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Nouveau matricule (tablette caisse / terminaux)</h2>
          <form onSubmit={createMobile} className="flex flex-col gap-4" data-form="mobile-user">
            <div>
              <label htmlFor="m-mat" className="block text-xs font-semibold text-slate-700 mb-1">Matricule <span className="text-rose-600">*</span></label>
              <input id="m-mat" value={form.matricule} onChange={(e) => setForm({ ...form, matricule: e.target.value.toUpperCase() })} required maxLength={8}
                className="h-10 w-full px-3 bg-white border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow" placeholder="S08" />
            </div>
            <div>
              <label htmlFor="m-nom" className="block text-xs font-semibold text-slate-700 mb-1">Nom <span className="text-rose-600">*</span></label>
              <input id="m-nom" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} required
                className="h-10 w-full px-3 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow" />
            </div>
            <div>
              <label htmlFor="m-role" className="block text-xs font-semibold text-slate-700 mb-1">Rôle</label>
              <select id="m-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="h-10 w-full px-3 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow">
                {["gerant", "second", "serveur", "cuisine"].map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="m-pin" className="block text-xs font-semibold text-slate-700 mb-1">PIN (4–6 chiffres) <span className="text-rose-600">*</span></label>
              <input id="m-pin" type="password" inputMode="numeric" pattern="[0-9]{4,6}" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/[^0-9]/g, "").slice(0, 6) })} required
                className="h-10 w-full px-3 bg-white border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow" />
              <p className="text-xs text-slate-500 mt-1">Stocké hashé localement (bcrypt), jamais transmis au cloud en clair (PRD A8.2).</p>
            </div>
            <button type="submit" disabled={busy} data-action="create-mobile"
              className="h-10 px-4 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-medium rounded-lg transition-[transform,colors] duration-150 disabled:opacity-50 disabled:pointer-events-none">
              {busy ? "Création…" : "Créer le matricule"}
            </button>
          </form>
        </section>

        <section className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Matricules mobiles ({mobile.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-4">Matricule</th><th className="py-2 pr-4">Nom</th><th className="py-2 pr-4">Rôle</th><th className="py-2 pr-4">Version</th><th className="py-2 pr-4 text-center">État</th><th className="py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {mobile.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                    <td className="py-2 pr-4 font-mono">{u.matricule}</td>
                    <td className="py-2 pr-4 text-slate-900">{u.nom}</td>
                    <td className="py-2 pr-4">{u.role}</td>
                    <td className="py-2 pr-4 font-mono tabular-nums text-slate-500">v{u.version}</td>
                    <td className="py-2 pr-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${u.actif ? "bg-emerald-50 text-emerald-700 border-emerald-200/60" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${u.actif ? "bg-emerald-500" : "bg-slate-400"}`} />{u.actif ? "Actif" : "Désactivé"}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      {u.actif && <button onClick={() => disableMobile(u)} data-action={`disable-mobile-${u.id}`} disabled={busy}
                        className="px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-lg transition-colors">Désactiver</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
