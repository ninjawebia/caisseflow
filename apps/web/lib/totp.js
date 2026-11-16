"use strict";
// RFC 6238 TOTP (SHA-1, 6 digits, 30 s window ±1) — web 2FA (PRD A8.2).
const crypto = require("crypto");

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input) {
  let bits = "";
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  for (const ch of clean) bits += B32.indexOf(ch).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function totpCode(secretB32, counter) {
  const key = base32Decode(secretB32);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0xf;
  const bin = ((hmac[off] & 0x7f) << 24) | (hmac[off + 1] << 16) | (hmac[off + 2] << 8) | hmac[off + 3];
  return String(bin % 1000000).padStart(6, "0");
}

function verifyTotp(secretB32, code) {
  if (!secretB32 || !/^[0-9]{6}$/.test(code)) return false;
  const counter = Math.floor(Date.now() / 30000);
  for (const drift of [-1, 0, 1]) {
    if (totpCode(secretB32, counter + drift) === code) return true;
  }
  return false;
}

function generateSecret() {
  const bytes = crypto.randomBytes(20);
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

module.exports = { verifyTotp, generateSecret, totpCode };
