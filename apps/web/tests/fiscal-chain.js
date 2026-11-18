"use strict";
// Batterie « chaînage fiscal » — ancre de genèse, chaînage INDÉPENDANT par
// poste, et rendu de la page /journal (FISC-2/FISC-7).
// Régression : verifyChain partait de la chaîne littérale « GENESIS » alors que
// la graine et le push utilisent SHA-256("GENESIS") → fausse rupture à la
// séquence 1 ; et plusieurs postes étaient chaînés comme une seule chaîne.
const { canonical, sha256hex, nextHash, verifyChain, verifyChainsByPoste, GENESIS_ANCHOR } = require("../lib/fiscal");

const B = "http://127.0.0.1:3000";
let pass = 0, fail = 0;
function check(id, cond, detail = "") {
  if (cond) { pass += 1; console.log(`  PASS ${id}${detail ? " — " + detail : ""}`); }
  else { fail += 1; console.error(`  FAIL ${id}${detail ? " — " + detail : ""}`); }
}

// 1 ré-essai sur 5xx : artefact HMR de `next dev` au démarrage à froid.
async function fetchR(url, opts = {}) {
  let r = await fetch(url, opts);
  if (r.status >= 500) {
    await new Promise((res) => setTimeout(res, 300));
    r = await fetch(url, opts);
  }
  return r;
}

async function login(email, pwd) {
  const r = await fetchR(`${B}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: B },
    body: JSON.stringify({ email, pwd }),
  });
  if (r.status !== 200) throw new Error(`login ${email} → ${r.status}`);
  return (r.headers.get("set-cookie") || "").split(";")[0];
}

function chain(poste, payloads, startSeq = 1) {
  let prev = GENESIS_ANCHOR;
  const out = [];
  payloads.forEach((payload, i) => {
    const hashSelf = nextHash(prev, payload);
    out.push({ poste, seq: startSeq + i, hashPrev: prev, hashSelf, payload });
    prev = hashSelf;
  });
  return out;
}

async function main() {
  console.log("— Batterie TC-CHAIN (chaînage fiscal) —");

  check("CHAIN-001", GENESIS_ANCHOR === sha256hex("GENESIS") && /^[0-9a-f]{64}$/.test(GENESIS_ANCHOR),
    'ancre de genèse = SHA-256("GENESIS")');

  const one = chain("POSTE-01", [{ b: 2, a: 1 }]);
  check("CHAIN-002", verifyChain(one).ok === true, 'première écriture ancrée sur SHA-256("GENESIS") acceptée');
  check("CHAIN-003", verifyChain([{ ...one[0], hashPrev: "GENESIS" }]).ok === false,
    'l\'ancienne ancre littérale « GENESIS » est bien une rupture (comportement corrigé)');

  const three = chain("POSTE-01", [{ a: 1 }, { a: 2 }, { a: 3 }]);
  check("CHAIN-004", verifyChain(three).ok === true, "chaîne de 3 écritures valide");

  const tamperedSelf = three.map((e, i) => (i === 1 ? { ...e, hashSelf: "0".repeat(64) } : e));
  const r1 = verifyChain(tamperedSelf);
  check("CHAIN-005", r1.ok === false && r1.brokenSeq === 2 && r1.reason === "hash_self_mismatch",
    `hash altéré détecté (seq ${r1.brokenSeq}, ${r1.reason})`);

  const tamperedPayload = three.map((e, i) => (i === 2 ? { ...e, payload: { a: 99 } } : e));
  const r2 = verifyChain(tamperedPayload);
  check("CHAIN-006", r2.ok === false && r2.brokenSeq === 3, `payload altéré détecté (seq ${r2.brokenSeq})`);

  const tamperedPrev = three.map((e, i) => (i === 2 ? { ...e, hashPrev: "f".repeat(64) } : e));
  check("CHAIN-007", verifyChain(tamperedPrev).reason === "hash_prev_mismatch", "hash_prev altéré détecté");

  // Deux postes : chaque poste a SA chaîne (départ à sa propre séquence 1).
  const poste1 = chain("POSTE-01", [{ p: "a" }, { p: "b" }]);
  const poste2 = chain("POSTE-02", [{ p: "c" }]);
  const mixed = [...poste1, ...poste2];
  check("CHAIN-008", verifyChainsByPoste(mixed).ok === true, "deux postes vérifiés séparément : chaînes intactes");
  check("CHAIN-009", verifyChain(mixed).ok === false, "chaîner les postes ensemble produirait une fausse rupture (justifie le correctif)");

  const brokenPoste2 = mixed.map((e) => (e.poste === "POSTE-02" ? { ...e, payload: { p: "x" } } : e));
  const r3 = verifyChainsByPoste(brokenPoste2);
  check("CHAIN-010", r3.ok === false && r3.poste === "POSTE-02" && r3.brokenSeq === 1,
    `rupture localisée sur ${r3.poste}, seq ${r3.brokenSeq}`);

  check("CHAIN-011", verifyChain([]).ok === true && verifyChainsByPoste([]).ok === true, "journal vide : chaîne valide");

  check("CHAIN-012", canonical({ b: [2, { d: 4, c: 3 }], a: 1 }) === '{"a":1,"b":[2,{"c":3,"d":4}]}',
    "canonicalisation identique à celle du serveur");
  check("CHAIN-013", nextHash(GENESIS_ANCHOR, {}) === sha256hex(GENESIS_ANCHOR + "{}"),
    "nextHash = SHA-256(hash_prev || payload canonique)");

  // --- Bout en bout : la page /journal ne signale plus de fausse rupture ---
  const jar = await login("gerant@local.test", "Gerant123!");
  const page = await fetchR(`${B}/journal`, { headers: { Cookie: jar } });
  const html = await page.text();
  check("CHAIN-014", page.status === 200 && html.includes("Chaînage SHA-256 vérifié"),
    `page /journal → ${page.status}, chaînage annoncé vérifié`);
  check("CHAIN-015", !html.includes("Incident de chaînage détecté"),
    "aucun faux incident de chaînage affiché sur le journal répliqué");

  console.log(`\nTC-CHAIN : ${pass} PASS, ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
