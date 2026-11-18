// Jetons de design de la caisse (M1) — même langage visuel que le back-office
// (slate/bleu), mode clair uniquement (pas de thème sombre, PRD 12).
// Aucune dépendance : uniquement des valeurs, consommées par les écrans.
export const colors = {
  bg: "#F8FAFC",
  surface: "#FFFFFF",
  border: "#E2E8F0",
  borderStrong: "#CBD5E1",
  text: "#0F172A",
  muted: "#64748B",
  primary: "#2563EB",
  primaryPressed: "#1D4ED8",
  primarySoft: "#EFF6FF",
  danger: "#E11D48",
  dangerPressed: "#BE123C",
  dangerSoft: "#FFF1F2",
  success: "#047857",
  successSoft: "#ECFDF5",
  warning: "#B45309",
  warningSoft: "#FFFBEB",
  overlay: "rgba(15,23,42,0.45)",
};

export const space = (n) => n * 4;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const font = {
  h1: { fontSize: 28, fontWeight: "700", color: colors.text, letterSpacing: -0.3 },
  h2: { fontSize: 20, fontWeight: "700", color: colors.text },
  h3: { fontSize: 16, fontWeight: "600", color: colors.text },
  body: { fontSize: 15, color: colors.text },
  label: { fontSize: 13, fontWeight: "600", color: colors.text },
  small: { fontSize: 12, color: colors.muted },
  mono: { fontSize: 14, fontFamily: "monospace", color: colors.text },
};

// Couleur d'une pastille de licence (mêmes tons que le back-office).
export function licenceTone(etat) {
  switch (etat) {
    case "active":
      return { fg: colors.success, bg: colors.successSoft, label: "Licence active" };
    case "grace1":
      return { fg: colors.warning, bg: colors.warningSoft, label: "Licence — rappel" };
    case "grace2":
      return { fg: colors.warning, bg: colors.warningSoft, label: "Licence — cloud suspendu" };
    case "bloquee":
      return { fg: colors.danger, bg: colors.dangerSoft, label: "Licence bloquée" };
    default:
      return { fg: colors.muted, bg: "#F1F5F9", label: "Licence inconnue" };
  }
}
