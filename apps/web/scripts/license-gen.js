#!/usr/bin/env node
"use strict";
// Générateur de clés de licence CaisseFlow (opérateur uniquement).
//
//   node scripts/license-gen.js --rid <UUID restaurant> [--exp AAAA-MM-JJ] [--plan pro]
//
// Utilise infra/keys/owner/private.pem (paire propriétaire, JAMAIS commitée —
// make license-keygen) ; à défaut, la clé DEV de préprod avec un AVERTISSEMENT.
// Sans dépendance externe : node:crypto Ed25519.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..", ".."); // racine du mono-repo
const OWNER_KEY = path.join(ROOT, "infra", "keys", "owner", "private.pem");
const DEV_KEY = path.join(ROOT, "infra", "keys", "dev", "private.pem");

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const rid = arg("--rid");
if (!rid || !/^[0-9a-f-]{36}$/i.test(rid)) {
  console.error("Usage: node scripts/license-gen.js --rid <UUID restaurant> [--exp AAAA-MM-JJ] [--plan pro]");
  process.exit(1);
}
const exp = arg("--exp");
if (exp && !/^\d{4}-\d{2}-\d{2}$/.test(exp)) {
  console.error("--exp attendu au format AAAA-MM-JJ");
  process.exit(1);
}
const plan = arg("--plan") || "pro";

const keyPath = fs.existsSync(OWNER_KEY) ? OWNER_KEY : DEV_KEY;
if (keyPath === DEV_KEY) {
  console.error("⚠  Clé DEV de préprod utilisée (infra/keys/dev) — ne pas déployer en production.\n" +
    "   Générez la paire propriétaire : make license-keygen, puis réessayez.");
}
const privatePem = fs.readFileSync(keyPath, "utf8");

const payload = { rid };
if (exp) payload.exp = exp;
payload.plan = plan;

const raw = Buffer.from(JSON.stringify(payload), "utf8");
const sig = crypto.sign(null, raw, crypto.createPrivateKey(privatePem));
console.log(`CF-${raw.toString("base64url")}.${sig.toString("base64url")}`);
