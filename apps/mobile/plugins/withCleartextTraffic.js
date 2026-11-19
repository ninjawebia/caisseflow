// Plugin Expo local — autorise le HTTP en clair dans l'APK release.
//
// Pourquoi : le back-office tourne sur le réseau du restaurant en
// `http://<ip-lan>:3000` (PRD : déploiement local, aucune dépendance cloud).
// Depuis Android 9 (targetSdk >= 28), `usesCleartextTraffic` vaut `false` par
// défaut : une build RELEASE refuse tout appel HTTP et l'app affiche
// « Serveur injoignable » alors que le serveur répond. Le gabarit Expo ne pose
// cet attribut que sur le manifeste de DEBUG.
//
// Portée : l'attribut est posé sur la balise `<application>` du manifeste
// généré par `expo prebuild`. En production exposée sur Internet, le serveur
// doit passer en HTTPS et ce plugin être retiré.
const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withCleartextTraffic(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const applications = manifest.application || [];
    for (const application of applications) {
      application.$ = application.$ || {};
      application.$["android:usesCleartextTraffic"] = "true";
    }
    return cfg;
  });
};
