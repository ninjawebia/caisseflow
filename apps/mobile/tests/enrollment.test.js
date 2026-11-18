"use strict";
// TC-M1-ENR — enrôlement : preuve du jeton par un vrai pull, erreurs typées (M1).
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { enroll, checkConnection } = require("../src/core/enrollment");

const TOKEN = crypto.randomBytes(32).toString("base64url");
const SERVER = "192.168.1.10:3000";

const pullPayload = {
  categories: [{ id: "c1" }, { id: "c2" }],
  articles: [{ id: "a1" }],
  users: [{ matricule: "G01", pinHash: "$2b$12$x" }],
  tables: [],
  licence: { etat: "active" },
  minAppVersion: "0.5.0",
};

// Réponse HTTP simulée (mêmes propriétés que `fetch` : status/ok/text()).
function res(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

function mockFetch(handler) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    return handler(url, opts);
  };
  fn.calls = calls;
  return fn;
}

test("enrôlement réussi : jeton prouvé, licence et compteurs remontés", async () => {
  const fetchImpl = mockFetch(() => res(200, pullPayload));
  const out = await enroll({ serverUrl: SERVER, token: TOKEN, appVersion: "0.5.0", fetchImpl });

  assert.equal(out.serverUrl, "http://192.168.1.10:3000");
  assert.equal(out.token, TOKEN);
  assert.equal(out.licence, "active");
  assert.equal(out.licenceLabel, "Licence active");
  assert.deepEqual(out.counts, { categories: 2, articles: 1, users: 1, tables: 0 });

  assert.equal(fetchImpl.calls.length, 1);
  const { url, opts } = fetchImpl.calls[0];
  assert.equal(url, "http://192.168.1.10:3000/api/sync/pull");
  assert.equal(opts.method, "POST");
  assert.equal(opts.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(opts.body, "{}");
});

test("jeton refusé → code TOKEN (révocation)", async () => {
  const fetchImpl = mockFetch(() => res(401, { error: "Jeton d'appareil invalide" }));
  await assert.rejects(
    enroll({ serverUrl: SERVER, token: TOKEN, appVersion: "0.5.0", fetchImpl }),
    (e) => e.code === "TOKEN" && /révoqué/.test(e.message)
  );
});

test("licence bloquée → code LICENCE avec le motif serveur", async () => {
  const fetchImpl = mockFetch(() => res(403, { error: "Licence expirée" }));
  await assert.rejects(
    enroll({ serverUrl: SERVER, token: TOKEN, appVersion: "0.5.0", fetchImpl }),
    (e) => e.code === "LICENCE" && e.message.includes("Licence expirée")
  );
});

test("erreur serveur → code SERVER", async () => {
  const fetchImpl = mockFetch(() => res(500, { error: "boom" }));
  await assert.rejects(
    enroll({ serverUrl: SERVER, token: TOKEN, appVersion: "0.5.0", fetchImpl }),
    (e) => e.code === "SERVER"
  );
});

test("réponse illisible → code SERVER", async () => {
  const fetchImpl = mockFetch(() => res(200, "<html>proxy</html>"));
  await assert.rejects(
    enroll({ serverUrl: SERVER, token: TOKEN, appVersion: "0.5.0", fetchImpl }),
    (e) => e.code === "SERVER" && /illisible/.test(e.message)
  );
});

test("réseau indisponible → code NETWORK", async () => {
  const fetchImpl = mockFetch(() => { throw new Error("Network request failed"); });
  await assert.rejects(
    enroll({ serverUrl: SERVER, token: TOKEN, appVersion: "0.5.0", fetchImpl }),
    (e) => e.code === "NETWORK" && /injoignable/.test(e.message)
  );
});

test("délai dépassé → code NETWORK", async () => {
  const hanging = (url, opts) => new Promise((_, reject) => {
    opts.signal.addEventListener("abort", () => {
      const e = new Error("aborted");
      e.name = "AbortError";
      reject(e);
    });
  });
  await assert.rejects(
    enroll({ serverUrl: SERVER, token: TOKEN, appVersion: "0.5.0", fetchImpl: hanging, timeoutMs: 20 }),
    (e) => e.code === "NETWORK" && /Délai dépassé/.test(e.message)
  );
});

test("jeton mal formé : refusé AVANT tout appel réseau", async () => {
  const fetchImpl = mockFetch(() => res(200, pullPayload));
  await assert.rejects(
    enroll({ serverUrl: SERVER, token: "trop-court", appVersion: "0.5.0", fetchImpl }),
    (e) => e.code === "TOKEN"
  );
  assert.equal(fetchImpl.calls.length, 0);
});

test("adresse invalide → code SERVER sans appel réseau", async () => {
  const fetchImpl = mockFetch(() => res(200, pullPayload));
  await assert.rejects(
    enroll({ serverUrl: "ftp://x", token: TOKEN, appVersion: "0.5.0", fetchImpl }),
    (e) => e.code === "SERVER"
  );
  assert.equal(fetchImpl.calls.length, 0);
});

test("version trop ancienne → code VERSION (SEC-2)", async () => {
  const fetchImpl = mockFetch(() => res(200, { ...pullPayload, minAppVersion: "9.0.0" }));
  await assert.rejects(
    enroll({ serverUrl: SERVER, token: TOKEN, appVersion: "0.5.0", fetchImpl }),
    (e) => e.code === "VERSION" && /9\.0\.0/.test(e.message)
  );
});

test("contrôle de connexion d'une tablette enrôlée", async () => {
  const ok = mockFetch(() => res(200, pullPayload));
  const out = await checkConnection({ serverUrl: SERVER, token: TOKEN, fetchImpl: ok });
  assert.equal(out.licence, "active");
  assert.equal(out.counts.articles, 1);

  const revoked = mockFetch(() => res(401, { error: "Jeton d'appareil invalide" }));
  await assert.rejects(
    checkConnection({ serverUrl: SERVER, token: TOKEN, fetchImpl: revoked }),
    (e) => e.code === "TOKEN"
  );
});

test("libellés de licence", async () => {
  for (const [etat, label] of [
    ["grace1", "Licence — rappel"],
    ["grace2", "Licence — cloud suspendu"],
    ["bloquee", "Licence bloquée"],
  ]) {
    const fetchImpl = mockFetch(() => res(200, { ...pullPayload, licence: { etat } }));
    const out = await checkConnection({ serverUrl: SERVER, token: TOKEN, fetchImpl });
    assert.equal(out.licenceLabel, label);
  }
});
