// Configuration Metro de la caisse (Expo SDK 52).
// Seul écart au défaut : bcryptjs (UMD) importe `crypto` de Node, absent de
// React Native. Le paquet déclare `browser: { "crypto": false }`, que Metro
// n'applique pas pour la plateforme android → on fournit un substitut local
// qui échoue explicitement si une génération de sel était tentée (la tablette
// ne fait que vérifier des hashs).
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  crypto: path.resolve(__dirname, "src/shims/crypto.js"),
};

module.exports = config;
