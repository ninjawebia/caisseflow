"use strict";
// Transport HTTP minimal (M1) — injectable (`fetchImpl`) pour être testé sous
// Node sans réseau, et sans dépendance : `fetch` + `AbortController` existent
// dans React Native 0.76 / Hermes.

const { CaisseError, CODES } = require("./errors");

const DEFAULT_TIMEOUT_MS = 15000;

async function postJson({ url, body = {}, headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl }) {
  const doFetch = fetchImpl || globalThis.fetch;
  if (typeof doFetch !== "function") throw new CaisseError(CODES.NETWORK, "Client réseau indisponible");

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  let timedOut = false;
  const timer = controller
    ? setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs)
    : null;

  try {
    const res = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller ? controller.signal : undefined,
    });

    const text = await res.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); }
      catch { throw new CaisseError(CODES.SERVER, "Réponse illisible du serveur", { status: res.status }); }
    }
    return { status: res.status, ok: res.ok, data };
  } catch (e) {
    if (e instanceof CaisseError) throw e;
    if (timedOut || (e && e.name === "AbortError")) {
      throw new CaisseError(CODES.NETWORK, "Délai dépassé — le serveur ne répond pas");
    }
    throw new CaisseError(CODES.NETWORK, "Serveur injoignable — vérifiez l'adresse et le réseau du restaurant", {
      cause: e && e.message ? e.message : String(e),
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

module.exports = { postJson, DEFAULT_TIMEOUT_MS };
