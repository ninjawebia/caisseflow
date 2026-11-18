// Aléa natif (M2/M3) — seul point de contact avec `expo-crypto`.
// Les modules de logique restent purs : ils reçoivent l'aléa en paramètre.
import * as Crypto from "expo-crypto";
import { uuidv4FromBytes } from "../core/uuid";

export function randomBytes(length) {
  return Crypto.getRandomBytes(length);
}

export function newUuid() {
  return uuidv4FromBytes(Crypto.getRandomBytes(16));
}
