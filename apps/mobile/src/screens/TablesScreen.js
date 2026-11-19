// Plan de salle (M5) — toutes les tables ACTIVES de la carte locale, groupées
// par salle. Une table occupée affiche sa commande en cours (total figé) et
// rouvre la même commande ; une table libre en crée une.
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { colors, font, radius, space } from "../ui/theme";
import { formatEuros } from "../core/money";

export default function TablesScreen({
  tables, openOrders, menuEmpty, busy, error, poste, user,
  onBack, onLock, onOpenTable, onComptoir, onSync, onActivity, appVersion,
}) {
  const salles = [];
  const bySalle = new Map();
  for (const t of tables) {
    const key = t.salle || "Salle 1";
    if (!bySalle.has(key)) {
      bySalle.set(key, []);
      salles.push(key);
    }
    bySalle.get(key).push(t);
  }
  const occupied = tables.filter((t) => openOrders[t.id]).length;

  return (
    <View
      style={styles.root}
      onStartShouldSetResponder={() => {
        if (onActivity) onActivity();
        return false;
      }}
    >
      <StatusBar style="dark" />
      <View style={styles.topbar}>
        <View style={styles.topbarLeft}>
          <Pressable onPress={onBack} style={styles.back} hitSlop={8} testID="tables-back">
            <Text style={styles.backText}>‹ Accueil</Text>
          </Pressable>
          <View>
            <Text style={styles.title}>Plan de salle</Text>
            <Text style={styles.subtitle}>
              {poste ? `${poste} · ` : ""}{tables.length} table{tables.length > 1 ? "s" : ""} · {occupied} occupée{occupied > 1 ? "s" : ""}
            </Text>
          </View>
        </View>
        <View style={styles.topbarRight}>
          {user && (
            <View style={styles.userBox}>
              <Text style={styles.userName} numberOfLines={1}>{user.nom}</Text>
              <Text style={styles.userRole}>{user.matricule}</Text>
            </View>
          )}
          <Pressable onPress={onSync} style={styles.ghostButton} testID="tables-sync">
            <Text style={styles.ghostText}>Synchroniser</Text>
          </Pressable>
          <Pressable onPress={onLock} style={styles.ghostButton} testID="tables-lock">
            <Text style={styles.ghostText}>Verrouiller</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {busy && (
          <View style={styles.busyRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.busyText}>Ouverture de la commande…</Text>
          </View>
        )}

        {error ? (
          <View style={styles.errorBox} testID="tables-error">
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {menuEmpty && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Carte locale vide</Text>
            <Text style={styles.emptyText}>
              Synchronisez avec le back-office avant de prendre une commande : les
              tables et les articles doivent être présents sur la tablette.
            </Text>
          </View>
        )}

        <Pressable
          onPress={onComptoir}
          disabled={busy || menuEmpty}
          style={({ pressed }) => [styles.comptoir, pressed && styles.comptoirPressed, (busy || menuEmpty) && styles.disabled]}
          testID="open-comptoir"
        >
          <View>
            <Text style={styles.comptoirTitle}>Comptoir / à emporter</Text>
            <Text style={styles.comptoirText}>Nouvelle commande sans table</Text>
          </View>
          <Text style={styles.comptoirCta}>Ouvrir ›</Text>
        </Pressable>

        {salles.map((salle) => (
          <View key={salle} style={styles.salle}>
            <Text style={styles.salleTitle}>{salle}</Text>
            <View style={styles.grid}>
              {bySalle.get(salle).map((t) => {
                const order = openOrders[t.id];
                const occupiedTable = Boolean(order);
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => onOpenTable(t)}
                    disabled={busy || menuEmpty}
                    style={({ pressed }) => [
                      styles.tableCard,
                      occupiedTable && styles.tableCardBusy,
                      pressed && styles.tableCardPressed,
                      (busy || menuEmpty) && styles.disabled,
                    ]}
                    testID={`table-${t.nom}`}
                  >
                    <View style={styles.tableHead}>
                      <Text style={styles.tableName} numberOfLines={1}>{t.nom}</Text>
                      <View style={[styles.badge, occupiedTable ? styles.badgeBusy : styles.badgeFree]}>
                        <Text style={[styles.badgeText, { color: occupiedTable ? colors.warning : colors.success }]}>
                          {occupiedTable ? "Occupée" : "Libre"}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.tableMeta}>{t.places} place{t.places > 1 ? "s" : ""}</Text>
                    {occupiedTable ? (
                      <>
                        <Text style={styles.tableTotal}>{formatEuros(order.totalTtcCents)}</Text>
                        <Text style={styles.tableOrder}>
                          {order.statut === "ENVOYEE" ? "En cuisine" : "Brouillon"} · {order.createdByNom}
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.tableAction}>Prendre la commande ›</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        {!tables.length && !menuEmpty && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Aucune table active</Text>
            <Text style={styles.emptyText}>
              Créez les tables dans le back-office puis synchronisez. En attendant,
              utilisez « Comptoir / à emporter ».
            </Text>
          </View>
        )}

        <Text style={styles.footer}>
          Version {appVersion} · catalogue et prix figés à l&apos;ajout (aucune écriture
          fiscale avant l&apos;envoi en cuisine).
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space(4),
    paddingHorizontal: space(5),
    paddingVertical: space(3),
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topbarLeft: { flexDirection: "row", alignItems: "center", gap: space(4) },
  back: { paddingVertical: space(2), paddingRight: space(2) },
  backText: { fontSize: 15, fontWeight: "700", color: colors.primaryPressed },
  title: { ...font.h2 },
  subtitle: { ...font.small, marginTop: 1 },
  topbarRight: { flexDirection: "row", alignItems: "center", gap: space(3) },
  userBox: { alignItems: "flex-end", maxWidth: 180 },
  userName: { fontSize: 14, fontWeight: "700", color: colors.text },
  userRole: { fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  ghostButton: {
    height: 34,
    paddingHorizontal: space(3),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  ghostText: { fontSize: 13, fontWeight: "700", color: colors.text },
  scroll: { padding: space(5), gap: space(5) },
  busyRow: { flexDirection: "row", alignItems: "center", gap: space(2) },
  busyText: { ...font.body, color: colors.muted },
  errorBox: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: "#FECDD3",
    borderRadius: radius.md,
    padding: space(3),
  },
  errorText: { fontSize: 13, color: "#9F1239", lineHeight: 19 },
  emptyBox: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space(4),
    backgroundColor: colors.surface,
  },
  emptyTitle: { ...font.h3, fontSize: 14 },
  emptyText: { ...font.small, marginTop: space(1), lineHeight: 17 },
  comptoir: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: radius.lg,
    paddingHorizontal: space(5),
    paddingVertical: space(4),
  },
  comptoirPressed: { backgroundColor: "#DBEAFE" },
  comptoirTitle: { fontSize: 16, fontWeight: "700", color: colors.primaryPressed },
  comptoirText: { ...font.small, marginTop: 2 },
  comptoirCta: { fontSize: 14, fontWeight: "700", color: colors.primaryPressed },
  salle: { gap: space(3) },
  salleTitle: { ...font.label, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, color: colors.muted },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space(3) },
  tableCard: {
    width: 190,
    minHeight: 128,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space(4),
    justifyContent: "space-between",
  },
  tableCardBusy: { borderColor: "#FDE68A", backgroundColor: "#FFFBEB" },
  tableCardPressed: { backgroundColor: colors.primarySoft },
  disabled: { opacity: 0.5 },
  tableHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space(2) },
  tableName: { fontSize: 17, fontWeight: "700", color: colors.text, flexShrink: 1 },
  badge: { paddingHorizontal: space(2), paddingVertical: 2, borderRadius: radius.pill },
  badgeFree: { backgroundColor: colors.successSoft },
  badgeBusy: { backgroundColor: colors.warningSoft },
  badgeText: { fontSize: 11, fontWeight: "700" },
  tableMeta: { ...font.small, marginTop: space(1) },
  tableTotal: { fontSize: 18, fontWeight: "800", color: colors.text, marginTop: space(2) },
  tableOrder: { ...font.small, marginTop: 2 },
  tableAction: { fontSize: 12, fontWeight: "700", color: colors.primaryPressed, marginTop: space(2) },
  footer: { ...font.small, marginTop: space(2) },
});
