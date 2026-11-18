import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { colors, font, licenceTone, radius, space } from "../ui/theme";
import { maskToken } from "../core/token";
import { roleLabel } from "../core/auth";
import { formatSyncDate } from "../core/reference";

// Accueil de la caisse (M1→M4) — prouve le socle et l'état RÉEL du poste :
// enrôlement persistant, base SQLite migrée, journal fiscal vérifié, carte
// locale disponible hors ligne (catégories, articles, tables, matricules).
// M3 ajoute l'opérateur connecté et le verrouillage de session ; la prise de
// commande arrive avec M5 (cette carte en est la source).
export default function HomeScreen({
  enrollment, schema, user, reference, syncBusy, syncError, onSync,
  onReset, onLock, onActivity, appVersion,
}) {
  function confirmReset() {
    Alert.alert(
      "Réinitialiser l'enrôlement ?",
      "Le jeton sera effacé de cette tablette. Le journal fiscal et la carte locale ne sont jamais supprimés par cette action ; un nouveau jeton sera nécessaire pour synchroniser.",
      [
        { text: "Annuler", style: "cancel" },
        { text: "Réinitialiser", style: "destructive", onPress: onReset },
      ]
    );
  }

  const counts = (reference && reference.counts) || { categories: 0, articles: 0, tables: 0, users: 0 };
  const lastPull = reference ? reference.lastPull : null;
  // La licence affichée vient du CACHE LOCAL : elle reste lisible hors ligne
  // (SYNC-6), même si le serveur est injoignable.
  const tone = licenceTone(reference ? reference.licence : null);
  const empty = counts.categories === 0 && counts.articles === 0;

  return (
    <View
      style={styles.root}
      onStartShouldSetResponder={() => {
        // Tout contact tactile remet à zéro le minuteur d'inactivité.
        if (onActivity) onActivity();
        return false;
      }}
    >
      <StatusBar style="dark" />
      <View style={styles.topbar}>
        <View>
          <Text style={styles.brand}>CaisseFlow</Text>
          <Text style={styles.topbarSub}>Poste enrôlé · version {appVersion}</Text>
        </View>
        <View style={styles.topbarRight}>
          {user && (
            <View style={styles.userBox} testID="current-user">
              <Text style={styles.userName} numberOfLines={1}>{user.nom}</Text>
              <Text style={styles.userRole}>{roleLabel(user.role)} · {user.matricule}</Text>
            </View>
          )}
          <Pressable
            onPress={onLock}
            style={({ pressed }) => [styles.lockButton, pressed && styles.lockButtonPressed]}
            testID="lock-session"
          >
            <Text style={styles.lockButtonText}>Verrouiller</Text>
          </Pressable>
          <View style={[styles.pill, { backgroundColor: tone.bg }]} testID="licence-pill">
            <View style={[styles.dot, { backgroundColor: tone.fg }]} />
            <Text style={[styles.pillText, { color: tone.fg }]}>{tone.label}</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.grid}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Cette tablette</Text>
            <Row label="Opérateur" value={user ? `${user.nom} · ${user.matricule}` : "—"} />
            <Row label="Serveur" value={enrollment.serverUrl} mono />
            <Row label="Jeton d'appareil" value={maskToken(enrollment.token)} mono />
            <Row label="Base locale" value={`schéma v${schema.version}`} />
            <Row
              label="Migrations appliquées"
              value={schema.applied.length ? schema.applied.map((v) => `v${v}`).join(", ") : "aucune (à jour)"}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Journal fiscal local</Text>
            <Row label="Écritures" value={String(schema.journal.count)} />
            <Row label="Dernière séquence" value={schema.journal.lastSeq ? `#${schema.journal.lastSeq}` : "aucune"} />
            <Row label="Dernière empreinte" value={schema.journal.lastHashShort ? `${schema.journal.lastHashShort}…` : "—"} mono />
            <Row
              label="Chaînage SHA-256"
              value={schema.journal.chain.ok ? "intact" : `RUPTURE seq ${schema.journal.chain.brokenSeq}`}
            />
            <Text style={styles.journalNote}>
              Journal Permanent append-only : aucune écriture ne peut être modifiée ni
              supprimée (triggers SQLite), chaînage vérifié à chaque démarrage.
            </Text>
          </View>

          <View style={styles.card} testID="local-cache-card">
            <Text style={styles.cardTitle}>Carte locale</Text>
            {syncBusy ? (
              <View style={styles.busyRow}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.busyText}>Synchronisation avec le serveur…</Text>
              </View>
            ) : (
              <>
                <Row label="Catégories" value={String(counts.categories)} />
                <Row label="Articles" value={String(counts.articles)} />
                <Row label="Tables" value={String(counts.tables)} />
                <Row label="Matricules" value={String(counts.users)} />
              </>
            )}
            <Row label="Dernière synchro" value={formatSyncDate(lastPull)} />

            {!syncBusy && syncError && (
              <View style={styles.errorBox} testID="sync-error">
                <Text style={styles.errorText}>{syncError}</Text>
                <Text style={styles.errorHint}>
                  La caisse reste utilisable hors ligne avec la carte enregistrée.
                </Text>
              </View>
            )}

            {!syncBusy && !syncError && empty && (
              <View style={styles.emptyBox} testID="cache-empty">
                <Text style={styles.emptyTitle}>Carte vide sur cette tablette</Text>
                <Text style={styles.emptyText}>
                  Synchronisez dès que le serveur est joignable : la carte sera ensuite
                  disponible sans réseau.
                </Text>
              </View>
            )}

            <Pressable
              onPress={onSync}
              disabled={syncBusy}
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, syncBusy && styles.buttonDisabled]}
              testID="sync-now"
            >
              <Text style={styles.buttonText}>{syncBusy ? "Synchronisation…" : "Synchroniser"}</Text>
            </Pressable>
            <Text style={styles.journalNote}>
              Articles synchronisés en delta depuis la dernière heure serveur ; catégories,
              tables et matricules en mise à jour complète. Les prix sont stockés en centimes.
            </Text>
          </View>
        </View>

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>
            Le jeton et l&apos;adresse sont conservés dans le Keystore Android.
          </Text>
          <Pressable onPress={confirmReset} hitSlop={8} testID="reset-enrollment">
            <Text style={styles.dangerLink}>Réinitialiser l&apos;enrôlement</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function Row({ label, value, mono }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.rowMono]} numberOfLines={1}>{value}</Text>
    </View>
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
  topbarRight: { flexDirection: "row", alignItems: "center", gap: space(3) },
  userBox: { alignItems: "flex-end", maxWidth: 190 },
  userName: { fontSize: 14, fontWeight: "700", color: colors.text },
  userRole: { fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 1 },
  lockButton: {
    height: 34,
    paddingHorizontal: space(3),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  lockButtonPressed: { backgroundColor: colors.primarySoft },
  lockButtonText: { fontSize: 13, fontWeight: "700", color: colors.text },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2),
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
    borderRadius: radius.pill,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontSize: 12, fontWeight: "700" },
  scroll: { padding: space(6), gap: space(5) },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space(5) },
  card: {
    flexGrow: 1,
    flexBasis: 360,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space(5),
  },
  cardTitle: { ...font.h2, marginBottom: space(3) },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: space(1.5), gap: space(3) },
  rowLabel: { ...font.small, fontSize: 13 },
  rowValue: { ...font.body, flexShrink: 1, textAlign: "right" },
  rowMono: { fontFamily: "monospace", fontSize: 13 },
  busyRow: { flexDirection: "row", alignItems: "center", gap: space(2), paddingVertical: space(3) },
  journalNote: { ...font.small, marginTop: space(3), lineHeight: 17 },
  busyText: { ...font.body, color: colors.muted },
  errorBox: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: "#FECDD3",
    borderRadius: radius.md,
    padding: space(3),
    marginVertical: space(2),
  },
  errorText: { fontSize: 13, color: "#9F1239", lineHeight: 19 },
  errorHint: { ...font.small, marginTop: space(1), lineHeight: 17 },
  emptyBox: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space(3),
    marginVertical: space(2),
  },
  emptyTitle: { ...font.h3, fontSize: 14 },
  emptyText: { ...font.small, marginTop: space(1), lineHeight: 17 },
  button: {
    marginTop: space(2),
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: { backgroundColor: "#DBEAFE" },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: 14, fontWeight: "700", color: colors.primaryPressed },
  footerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space(3),
  },
  footerText: { ...font.small },
  dangerLink: { fontSize: 13, fontWeight: "600", color: colors.danger },
});
