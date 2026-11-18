// Persistance de l'enrôlement (M1) — jeton d'appareil dans le Keystore Android
// via expo-secure-store (jamais en clair sur le disque ni dans les logs).
// L'adresse du serveur est stockée à côté : l'appareil doit pouvoir redémarrer
// hors ligne et retrouver son identité sans réseau.
import * as SecureStore from "expo-secure-store";
import { CaisseError, CODES } from "../core/errors";
import { isValidDeviceToken } from "../core/token";
import { normalizeServerUrl } from "../core/config";

const KEY_TOKEN = "caisseflow.device.token";
const KEY_SERVER = "caisseflow.server.url";

async function assertAvailable() {
  try {
    const ok = await SecureStore.isAvailableAsync();
    if (!ok) throw new Error("SecureStore indisponible");
  } catch (e) {
    throw new CaisseError(CODES.STORAGE, "Stockage sécurisé indisponible sur cet appareil", {
      cause: e && e.message ? e.message : String(e),
    });
  }
}

export async function saveEnrollment({ token, serverUrl }) {
  await assertAvailable();
  const base = normalizeServerUrl(serverUrl);
  if (!isValidDeviceToken(token)) throw new CaisseError(CODES.TOKEN, "Jeton d'appareil invalide");
  try {
    // L'adresse d'abord : si le jeton est écrit puis l'adresse échoue, l'app
    // resterait « enrôlée » sans serveur — l'ordre évite cet état.
    await SecureStore.setItemAsync(KEY_SERVER, base);
    await SecureStore.setItemAsync(KEY_TOKEN, token);
  } catch (e) {
    throw new CaisseError(CODES.STORAGE, "Enregistrement sécurisé impossible — réessayez", {
      cause: e && e.message ? e.message : String(e),
    });
  }
  return { token, serverUrl: base };
}

export async function loadEnrollment() {
  await assertAvailable();
  try {
    const [token, serverUrl] = await Promise.all([
      SecureStore.getItemAsync(KEY_TOKEN),
      SecureStore.getItemAsync(KEY_SERVER),
    ]);
    // État incomplet ou corrompu → on considère la tablette non enrôlée.
    if (!token || !serverUrl || !isValidDeviceToken(token)) return null;
    return { token, serverUrl: normalizeServerUrl(serverUrl) };
  } catch (e) {
    throw new CaisseError(CODES.STORAGE, "Lecture du stockage sécurisé impossible", {
      cause: e && e.message ? e.message : String(e),
    });
  }
}

export async function clearEnrollment() {
  await assertAvailable();
  await SecureStore.deleteItemAsync(KEY_TOKEN);
  await SecureStore.deleteItemAsync(KEY_SERVER);
}

export { KEY_TOKEN, KEY_SERVER };
