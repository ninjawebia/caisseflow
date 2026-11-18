"use strict";
// TC-M2-HASH — SHA-256 JS pur : équivalence octet pour octet avec `node:crypto`.
// Les vecteurs couvrent ASCII, UTF-8 accentué, emoji (paire de substitution),
// chaîne longue (> 55 octets → blocs multiples) et JSON canonique.
const test = require("node:test");
const assert = require("node:assert/strict");
const nodeCrypto = require("node:crypto");
const { sha256hex, utf8Bytes } = require("../src/core/sha256");
const { canonical, nextHash, GENESIS_ANCHOR, verifyChain } = require("../src/core/hash");

const ref = (s) => nodeCrypto.createHash("sha256").update(s, "utf8").digest("hex");

test("vecteurs connus", () => {
  assert.equal(sha256hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(sha256hex("GENESIS"), ref("GENESIS"));
});

test("équivalence avec node:crypto (ASCII, accents, emoji, longueurs variées)", () => {
  const samples = [
    "",
    "a",
    "CaisseFlow",
    "journal fiscal — café, thé, glace à l'italienne",
    "🧾💳🍽️",
    "x".repeat(55),
    "x".repeat(56),
    "x".repeat(63),
    "x".repeat(64),
    "x".repeat(65),
    "x".repeat(1000),
    JSON.stringify({ type: "VENTE", total: 12.5, lignes: [{ nom: "Café", qte: 2 }] }),
  ];
  for (const s of samples) assert.equal(sha256hex(s), ref(s), `échec sur ${JSON.stringify(s).slice(0, 40)}`);
});

test("encodage UTF-8 : accents sur 2 octets, emoji sur 4", () => {
  assert.deepEqual(utf8Bytes("é"), [0xc3, 0xa9]);
  assert.deepEqual(utf8Bytes("€"), [0xe2, 0x82, 0xac]);
  assert.deepEqual(utf8Bytes("🧾"), [0xf0, 0x9f, 0xa7, 0xbe]);
});

test("payload canonique identique au serveur (clés triées)", () => {
  assert.equal(canonical({ b: 1, a: { d: 4, c: [3, 2] } }), '{"a":{"c":[3,2],"d":4},"b":1}');
  assert.equal(canonical({ z: null, a: true, s: "é'\"\n" }), '{"a":true,"s":"é\'\\"\\n","z":null}');
});

test("chaînage : hash suivant = SHA-256(hash_prev || payload canonique)", () => {
  const h1 = nextHash(GENESIS_ANCHOR, { a: 1 });
  assert.equal(h1, ref(GENESIS_ANCHOR + canonical({ a: 1 })));
  const h2 = nextHash(h1, { a: 2 });
  assert.equal(h2, ref(h1 + canonical({ a: 2 })));
});

test("vérification : chaîne valide, altération payload/hash, ancre erronée", () => {
  const p1 = { a: 1 };
  const p2 = { a: 2 };
  const h1 = nextHash(GENESIS_ANCHOR, p1);
  const h2 = nextHash(h1, p2);
  const entries = [
    { seq: 1, hashPrev: GENESIS_ANCHOR, hashSelf: h1, payload: p1 },
    { seq: 2, hashPrev: h1, hashSelf: h2, payload: p2 },
  ];
  assert.equal(verifyChain(entries).ok, true);

  const badPayload = [{ ...entries[0], payload: { a: 9 } }, entries[1]];
  assert.deepEqual(
    { ok: verifyChain(badPayload).ok, seq: verifyChain(badPayload).brokenSeq },
    { ok: false, seq: 1 }
  );

  const badHash = [entries[0], { ...entries[1], hashSelf: "0".repeat(64) }];
  assert.equal(verifyChain(badHash).brokenSeq, 2);

  const badAnchor = [{ ...entries[0], hashPrev: "GENESIS" }];
  assert.equal(verifyChain(badAnchor).reason, "hash_prev_mismatch");
});

test("vérification stricte : un trou de séquence est une rupture (journal local)", () => {
  const h1 = nextHash(GENESIS_ANCHOR, { a: 1 });
  const entries = [{ seq: 2, hashPrev: GENESIS_ANCHOR, hashSelf: h1, payload: { a: 1 } }];
  assert.equal(verifyChain(entries, { continuous: true }).reason, "seq_non_continue");
  assert.equal(verifyChain(entries).ok, true, "sans l'option stricte (réplique cloud), le hash seul suffit");
});
