-- 0009_image_presentation.sql — Presets de présentation d'images (v0.5).
-- Un preset décrit COMMENT une image est affichée (forme, cadrage, ratio,
-- arrondi, ombre, contexte) — jamais le contenu. Réutilisable par le BO, le
-- menu de la tablette, le futur ticket et le kiosque : un seul modèle.
-- `par_defaut` : au plus UN preset par (restaurant, contexte) — index partiel.
-- Les entités (catégories, articles) portent un `preset_id` optionnel :
-- NULL = preset par défaut du contexte, résolu à l'affichage.
-- Idempotent, appliquée par le ledger (make migrate).

CREATE TABLE IF NOT EXISTS image_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    nom TEXT NOT NULL,
    forme TEXT NOT NULL DEFAULT 'arrondi' CHECK (forme IN ('carre','arrondi','cercle','bandeau')),
    cadrage TEXT NOT NULL DEFAULT 'cover' CHECK (cadrage IN ('cover','contain')),
    ratio TEXT NOT NULL DEFAULT '1:1' CHECK (ratio IN ('1:1','4:3','3:2','16:9')),
    rayon SMALLINT NOT NULL DEFAULT 12 CHECK (rayon BETWEEN 0 AND 64),
    ombre BOOLEAN NOT NULL DEFAULT false,
    contexte TEXT NOT NULL DEFAULT 'menu' CHECK (contexte IN ('bo','menu','ticket','kiosque')),
    par_defaut BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (restaurant_id, nom)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_preset_defaut
    ON image_presets (restaurant_id, contexte) WHERE par_defaut;

-- Photos de catégories : même contrat que les articles (fichier + hash).
ALTER TABLE categories ADD COLUMN IF NOT EXISTS photo_file TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS photo_hash TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS photo_updated_at TIMESTAMPTZ;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS preset_id UUID
    REFERENCES image_presets(id) ON DELETE SET NULL;

ALTER TABLE articles ADD COLUMN IF NOT EXISTS preset_id UUID
    REFERENCES image_presets(id) ON DELETE SET NULL;

-- Presets par défaut pour les restaurants existants (le seed fait de même
-- pour un nouveau restaurant). Ordre : BO puis menu.
INSERT INTO image_presets (restaurant_id, nom, forme, cadrage, ratio, rayon, ombre, contexte, par_defaut)
SELECT r.id, 'BO — vignette', 'carre', 'cover', '1:1', 8, false, 'bo', true
FROM restaurants r
WHERE NOT EXISTS (
    SELECT 1 FROM image_presets p
    WHERE p.restaurant_id = r.id AND p.contexte = 'bo' AND p.par_defaut
);

INSERT INTO image_presets (restaurant_id, nom, forme, cadrage, ratio, rayon, ombre, contexte, par_defaut)
SELECT r.id, 'Menu — arrondi', 'arrondi', 'cover', '1:1', 12, false, 'menu', true
FROM restaurants r
WHERE NOT EXISTS (
    SELECT 1 FROM image_presets p
    WHERE p.restaurant_id = r.id AND p.contexte = 'menu' AND p.par_defaut
);
