"use strict";
// Substitut minimal du module `crypto` de Node pour le bundle Android.
// bcryptjs (UMD) ne l'utilise QUE pour générer des sels aléatoires
// (`hashSync`/`genSaltSync`). La tablette ne fait que VÉRIFIER des hashs
// produits par le back-office (`compareSync`) : toute tentative de génération
// lève une erreur explicite plutôt que de produire un sel non aléatoire.
// Metro n'applique pas le champ `browser` de bcryptjs → mapping explicite
// dans `metro.config.js` (`resolver.extraNodeModules.crypto`).
function unavailable() {
  throw new Error(
    "Génération de sel bcrypt indisponible sur la tablette — les PIN sont hachés par le back-office et seulement vérifiés ici"
  );
}

module.exports = {
  randomBytes: unavailable,
  randomFillSync: unavailable,
  getRandomValues: unavailable,
};
