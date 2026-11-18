import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { colors, font, radius, space } from "../ui/theme";
import { MAX_FAILURES, roleLabel } from "../core/auth";

// Connexion de l'opérateur (M3) — PRD 4.1.1 : matricule + PIN 4 à 6 chiffres,
// validation 100 % locale (le PIN ne part jamais au cloud). Pavé numérique
// tactile (pas de clavier système : tablette en cuisine, doigts mouillés).
// Après 5 échecs le compte est bloqué temporairement (compte à rebours affiché).

export default function LoginScreen({
  staff = [],
  lockReason,
  busy = false,
  onAuthenticate,
  onRefreshStaff,
  canRefresh = false,
  appVersion,
}) {
  const [matricule, setMatricule] = useState(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [lockMs, setLockMs] = useState(0);

  const actifs = useMemo(() => staff.filter((s) => s.actif !== false), [staff]);
  const selected = actifs.find((s) => s.matricule === matricule) || null;

  // Compte à rebours du blocage (5 min) : décompte seconde par seconde.
  useEffect(() => {
    if (lockMs <= 0) return undefined;
    const timer = setInterval(() => {
      setLockMs((prev) => (prev <= 1000 ? 0 : prev - 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [lockMs]);

  // Changer d'opérateur efface la saisie et le message d'erreur.
  function selectStaff(mat) {
    if (submitting || lockMs > 0) return;
    setMatricule(mat);
    setPin("");
    setError(null);
  }

  function pressDigit(d) {
    if (submitting || lockMs > 0 || !selected) return;
    if (pin.length >= 6) return;
    setPin((prev) => prev + d);
    setError(null);
  }

  async function refreshStaff() {
    if (!onRefreshStaff || busy) return;
    setError(null);
    try {
      await onRefreshStaff();
    } catch (e) {
      setError(e && e.message ? e.message : "Synchronisation impossible — vérifiez le réseau");
    }
  }

  function backspace() {
    if (submitting || lockMs > 0) return;
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  }

  async function submit() {
    if (!selected || submitting || lockMs > 0) return;
    if (pin.length < 4) {
      setError("PIN incomplet — 4 chiffres minimum.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await onAuthenticate({ matricule: selected.matricule, pin });
      if (res && res.ok) {
        setPin("");
        return;
      }
      setPin("");
      setError((res && res.message) || "Connexion refusée");
      if (res && res.retryAfterMs > 0) setLockMs(res.retryAfterMs);
    } catch (e) {
      setPin("");
      setError(e && e.message ? e.message : "Connexion impossible — réessayez");
    } finally {
      setSubmitting(false);
    }
  }

  const seconds = Math.ceil(lockMs / 1000);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.topbar}>
        <View>
          <Text style={styles.brand}>CaisseFlow</Text>
          <Text style={styles.topbarSub}>Version {appVersion} · connexion locale</Text>
        </View>
        <View style={styles.pill}>
          <View style={styles.pillDot} />
          <Text style={styles.pillText}>Hors ligne · PIN local</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {lockReason ? (
          <View style={styles.noticeBox} testID="lock-reason">
            <Text style={styles.noticeText}>{lockReason}</Text>
          </View>
        ) : null}

        <View style={styles.grid}>
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>1 · Qui êtes-vous ?</Text>
              {canRefresh && (
                <Pressable onPress={refreshStaff} hitSlop={8} disabled={busy} testID="refresh-staff">
                  <Text style={[styles.link, busy && { opacity: 0.5 }]}>
                    {busy ? "Synchronisation…" : "Synchroniser"}
                  </Text>
                </Pressable>
              )}
            </View>

            {actifs.length === 0 ? (
              <View style={styles.empty} testID="staff-empty">
                <Text style={styles.emptyTitle}>Aucun matricule sur cette tablette</Text>
                <Text style={styles.emptyText}>
                  Le personnel est téléchargé à l&apos;enrôlement et lors des synchronisations.
                  Vérifiez l&apos;adresse du serveur et la connexion au réseau du restaurant.
                </Text>
              </View>
            ) : (
              <View style={styles.chips}>
                {actifs.map((s) => {
                  const active = s.matricule === matricule;
                  return (
                    <Pressable
                      key={s.matricule}
                      onPress={() => selectStaff(s.matricule)}
                      style={({ pressed }) => [
                        styles.chip,
                        active && styles.chipActive,
                        pressed && !active && styles.chipPressed,
                      ]}
                      testID={`staff-${s.matricule}`}
                    >
                      <Text style={[styles.chipMat, active && styles.chipTextActive]}>{s.matricule}</Text>
                      <Text style={[styles.chipNom, active && styles.chipTextActive]} numberOfLines={1}>
                        {s.nom}
                      </Text>
                      <Text style={[styles.chipRole, active && styles.chipRoleActive]}>{roleLabel(s.role)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>2 · Saisissez votre PIN</Text>

            <View style={styles.pinRow} testID="pin-dots">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <View key={i} style={[styles.pinDot, i < pin.length && styles.pinDotFilled]} />
              ))}
            </View>

            <Text style={styles.pinHint}>
              {selected
                ? `${selected.nom} — ${pin.length} chiffre(s) saisi(s) sur 4 à 6`
                : "Choisissez d'abord votre matricule"}
            </Text>

            {error ? (
              <View style={styles.errorBox} testID="login-error">
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {lockMs > 0 ? (
              <View style={styles.lockBox} testID="lock-countdown">
                <Text style={styles.lockTitle}>Compte bloqué après {MAX_FAILURES} échecs</Text>
                <Text style={styles.lockTime}>
                  Réessayez dans {mm}:{ss}
                </Text>
                <Text style={styles.lockHint}>
                  L&apos;incident est journalisé localement. Faites valider par le gérant si le
                  blocage se répète.
                </Text>
              </View>
            ) : null}

            <View style={styles.keypad}>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <Key key={d} label={d} onPress={() => pressDigit(d)} disabled={!selected || submitting} testID={`key-${d}`} />
              ))}
              <Key label="⌫" onPress={backspace} disabled={!selected || submitting || pin.length === 0} testID="key-back" muted />
              <Key label="0" onPress={() => pressDigit("0")} disabled={!selected || submitting} testID="key-0" />
              <Key
                label={submitting ? "…" : "✓"}
                onPress={submit}
                disabled={!selected || submitting || pin.length < 4 || lockMs > 0}
                primary
                testID="key-submit"
              />
            </View>

            {submitting && (
              <View style={styles.busyRow}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.busyText}>Vérification du PIN…</Text>
              </View>
            )}
          </View>
        </View>

        <Text style={styles.footer}>
          Le PIN est vérifié sur l&apos;appareil (bcrypt) et n&apos;est jamais transmis. Verrouillage
          automatique après 3 minutes d&apos;inactivité.
        </Text>
      </ScrollView>
    </View>
  );
}

function Key({ label, onPress, disabled, primary, muted, testID }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={({ pressed }) => [
        styles.key,
        primary && styles.keyPrimary,
        muted && styles.keyMuted,
        pressed && !disabled && (primary ? styles.keyPrimaryPressed : styles.keyPressed),
        disabled && styles.keyDisabled,
      ]}
    >
      <Text style={[styles.keyLabel, primary && styles.keyLabelPrimary, muted && styles.keyLabelMuted]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space(6),
    paddingVertical: space(4),
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brand: { fontSize: 18, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  topbarSub: { ...font.small, marginTop: 2 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2),
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
    borderRadius: radius.pill,
    backgroundColor: colors.successSoft,
  },
  pillDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  pillText: { fontSize: 12, fontWeight: "700", color: colors.success },
  scroll: { padding: space(6), gap: space(4) },
  noticeBox: {
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: radius.md,
    padding: space(3),
  },
  noticeText: { fontSize: 13, color: "#92400E", lineHeight: 19 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space(5) },
  card: {
    flexGrow: 1,
    flexBasis: 380,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space(5),
  },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space(3) },
  cardTitle: { ...font.h2, marginBottom: space(3) },
  link: { fontSize: 13, fontWeight: "600", color: colors.primary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space(2.5) },
  chip: {
    minWidth: 132,
    flexGrow: 1,
    flexBasis: 132,
    maxWidth: 220,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#FFFFFF",
    borderRadius: radius.md,
    paddingVertical: space(2.5),
    paddingHorizontal: space(3),
    gap: 2,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipPressed: { backgroundColor: colors.primarySoft, borderColor: "#BFDBFE" },
  chipMat: { fontSize: 15, fontWeight: "800", color: colors.text, fontFamily: "monospace" },
  chipNom: { fontSize: 13, color: colors.text },
  chipRole: { fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  chipTextActive: { color: "#FFFFFF" },
  chipRoleActive: { color: "#DBEAFE" },
  empty: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space(4),
  },
  emptyTitle: { ...font.h3 },
  emptyText: { ...font.small, marginTop: space(1), lineHeight: 17 },
  pinRow: { flexDirection: "row", gap: space(2.5), justifyContent: "center", marginVertical: space(3) },
  pinDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: "#FFFFFF",
  },
  pinDotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
  pinHint: { ...font.small, textAlign: "center", marginBottom: space(2) },
  errorBox: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: "#FECDD3",
    borderRadius: radius.md,
    padding: space(2.5),
    marginBottom: space(3),
  },
  errorText: { fontSize: 13, color: "#9F1239", lineHeight: 19 },
  lockBox: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: "#FECDD3",
    borderRadius: radius.md,
    padding: space(3),
    marginBottom: space(3),
  },
  lockTitle: { fontSize: 13, fontWeight: "700", color: "#9F1239" },
  lockTime: { fontSize: 24, fontWeight: "800", color: "#9F1239", marginVertical: space(1), fontVariant: ["tabular-nums"] },
  lockHint: { ...font.small, lineHeight: 17 },
  keypad: { flexDirection: "row", flexWrap: "wrap", gap: space(2.5), justifyContent: "center" },
  key: {
    width: 84,
    height: 62,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  keyPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  keyMuted: { backgroundColor: "#F1F5F9" },
  keyPressed: { backgroundColor: colors.primarySoft },
  keyPrimaryPressed: { backgroundColor: colors.primaryPressed },
  keyDisabled: { opacity: 0.4 },
  keyLabel: { fontSize: 22, fontWeight: "700", color: colors.text },
  keyLabelPrimary: { color: "#FFFFFF" },
  keyLabelMuted: { fontSize: 18, color: colors.muted },
  busyRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space(2), marginTop: space(3) },
  busyText: { ...font.small },
  footer: { ...font.small, textAlign: "center", marginTop: space(2), lineHeight: 17 },
});
