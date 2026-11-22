// Prise de commande (M5) — catalogue local à gauche, panier à droite. Les prix
// sont ceux du moment de l'ajout (snapshot) ; tant que rien n'est envoyé, la
// commande est un brouillon. « Envoyer en cuisine » écrit la VENTE au journal
// et gèle les lignes envoyées ; un ajout ultérieur forme un complément.
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { colors, font, radius, space } from "../ui/theme";
import { formatEuros } from "../core/money";
import { presetFrame, photoUri } from "../core/preset";

export default function OrderScreen({
  order, lines, totals, menu, busy, error, notice, user, serverUrl, token,
  onBack, onLock, onAddArticle, onSetQty, onRemove, onSend, onActivity, appVersion,
}) {
  const groups = Array.isArray(menu) ? menu : [];
  const [selected, setSelected] = useState(groups.length ? groups[0].id : null);

  // La carte peut changer après une synchronisation : si la catégorie choisie
  // disparaît, on retombe sur la première disponible.
  useEffect(() => {
    if (!groups.length) {
      if (selected !== null) setSelected(null);
      return;
    }
    if (!groups.some((g) => g.id === selected)) setSelected(groups[0].id);
  }, [groups, selected]);

  const activeGroup = useMemo(
    () => groups.find((g) => g.id === selected) || groups[0] || null,
    [groups, selected]
  );

  // Images : le serveur exige le jeton d'appareil (la tablette n'a pas de
  // cookie). Aucune photo n'est téléchargée si le jeton ou l'URL manque.
  const imgHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : null),
    [token]
  );
  const imageOf = (table, id, hash, variant) => (
    imgHeaders ? photoUri(serverUrl, table, id, hash, variant) : null
  );
  const bannerUri = activeGroup
    ? imageOf("categories", activeGroup.id, activeGroup.photoHash, "full")
    : null;
  const bannerFrame = activeGroup ? presetFrame(activeGroup.preset) : null;

  const pending = (lines || []).filter((l) => Number(l.envoyee) === 0);
  const sent = (lines || []).filter((l) => Number(l.envoyee) === 1);
  const pendingQty = pending.reduce((acc, l) => acc + Number(l.qte), 0);
  const canSend = pending.length > 0 && !busy;

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
          <Pressable onPress={onBack} style={styles.back} hitSlop={8} testID="order-back">
            <Text style={styles.backText}>‹ {order && order.type === "TABLE" ? "Plan de salle" : "Accueil"}</Text>
          </Pressable>
          <View>
            <Text style={styles.title} numberOfLines={1}>
              {order ? (order.tableNom || "Comptoir / à emporter") : "Commande"}
            </Text>
            <Text style={styles.subtitle}>
              {order && order.createdByNom ? `Ouverte par ${order.createdByNom}` : ""}
              {order && order.journalRef ? ` · ${order.journalRef}` : " · brouillon local"}
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
          <Pressable onPress={onLock} style={styles.ghostButton} testID="order-lock">
            <Text style={styles.ghostText}>Verrouiller</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.menuPane}>
          {error ? (
            <View style={styles.errorBox} testID="order-error">
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          {notice ? (
            <View style={styles.noticeBox} testID="order-notice">
              <Text style={styles.noticeText}>{notice}</Text>
            </View>
          ) : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {groups.map((g) => {
              const isActive = activeGroup && g.id === activeGroup.id;
              const chipUri = imageOf("categories", g.id, g.photoHash, "thumb");
              const frame = presetFrame(g.preset);
              return (
                <Pressable
                  key={String(g.id)}
                  onPress={() => setSelected(g.id)}
                  style={[styles.chip, isActive && styles.chipActive]}
                  testID={`category-${g.nom}`}
                >
                  {chipUri ? (
                    <Image
                      source={{ uri: chipUri, headers: imgHeaders }}
                      style={[styles.chipImage, { borderRadius: Math.min(frame.borderRadius, 12) }]}
                      contentFit={frame.resizeMode}
                      transition={120}
                      testID={`category-image-${g.nom}`}
                    />
                  ) : null}
                  <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{g.nom}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {bannerUri ? (
            <View
              style={[styles.banner, { borderRadius: bannerFrame.borderRadius }]}
              testID={`category-banner-${activeGroup.nom}`}
            >
              <Image
                source={{ uri: bannerUri, headers: imgHeaders }}
                style={styles.bannerImage}
                contentFit={bannerFrame.resizeMode}
                transition={180}
              />
              <View style={styles.bannerLabel}>
                <Text style={styles.bannerLabelText} numberOfLines={1}>{activeGroup.nom}</Text>
              </View>
            </View>
          ) : null}

          <ScrollView contentContainerStyle={styles.articles}>
            {!groups.length && (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>Carte indisponible</Text>
                <Text style={styles.emptyText}>
                  Aucun article actif sur cette tablette. Synchronisez depuis le
                  back-office avant de prendre une commande.
                </Text>
              </View>
            )}
            {activeGroup && activeGroup.articles.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => onAddArticle(a)}
                disabled={busy}
                style={({ pressed }) => [styles.article, pressed && styles.articlePressed, busy && styles.disabled]}
                testID={`article-${a.nom}`}
              >
                {(() => {
                  const uri = imageOf("articles", a.id, a.photoHash, "card");
                  if (!uri) return null;
                  const frame = presetFrame(a.preset);
                  return (
                    <View style={[styles.articleImageBox, { borderRadius: frame.borderRadius }]}>
                      <Image
                        source={{ uri, headers: imgHeaders }}
                        style={styles.articleImage}
                        contentFit={frame.resizeMode}
                        transition={120}
                        testID={`article-image-${a.nom}`}
                      />
                    </View>
                  );
                })()}
                <Text style={styles.articleName} numberOfLines={2}>{a.nom}</Text>
                <View style={styles.articleFoot}>
                  <Text style={styles.articlePrice}>{formatEuros(a.prixTtcCents)}</Text>
                  <Text style={styles.articleTva}>TVA {formatTaux(a.tauxTva)}</Text>
                </View>
                <Text style={styles.articleAdd}>+ Ajouter</Text>
              </Pressable>
            ))}
            {activeGroup && activeGroup.articles.length === 0 && (
              <Text style={styles.emptyText}>Aucun article dans cette catégorie.</Text>
            )}
          </ScrollView>
        </View>

        <View style={styles.cartPane}>
          <View style={styles.cartHead}>
            <Text style={styles.cartTitle}>Commande</Text>
            <Text style={styles.cartMeta}>
              {order && order.statut === "ENVOYEE" ? "En cuisine" : "Brouillon"} · {totals ? totals.nbArticles : 0} article{(totals && totals.nbArticles) > 1 ? "s" : ""}
            </Text>
          </View>

          <ScrollView contentContainerStyle={styles.cartList}>
            {!(lines || []).length && (
              <View style={styles.cartEmpty}>
                <Text style={styles.cartEmptyTitle}>Panier vide</Text>
                <Text style={styles.emptyText}>
                  Touchez un article de la carte pour l&apos;ajouter.
                </Text>
              </View>
            )}

            {(lines || []).map((line) => {
              const isSent = Number(line.envoyee) === 1;
              return (
                <View key={line.id} style={styles.line} testID={`line-${line.nom}`}>
                  <View style={styles.lineMain}>
                    <Text style={styles.lineName} numberOfLines={2}>{line.nom}</Text>
                    <Text style={styles.lineUnit}>
                      {formatEuros(line.prixTtcCents)} · TVA {formatTaux(line.tauxTva)}
                    </Text>
                    {isSent && <Text style={styles.lineSent}>Envoyée en cuisine</Text>}
                  </View>
                  {isSent ? (
                    <Text style={styles.lineQtyStatic}>×{line.qte}</Text>
                  ) : (
                    <View style={styles.qtyControls}>
                      <Pressable
                        onPress={() => onSetQty(line.id, Number(line.qte) - 1)}
                        disabled={busy}
                        style={styles.qtyButton}
                        testID={`qty-minus-${line.nom}`}
                      >
                        <Text style={styles.qtyButtonText}>−</Text>
                      </Pressable>
                      <Text style={styles.qtyValue}>{line.qte}</Text>
                      <Pressable
                        onPress={() => onSetQty(line.id, Number(line.qte) + 1)}
                        disabled={busy}
                        style={styles.qtyButton}
                        testID={`qty-plus-${line.nom}`}
                      >
                        <Text style={styles.qtyButtonText}>+</Text>
                      </Pressable>
                    </View>
                  )}
                  <Text style={styles.lineTotal}>{formatEuros(line.qte * line.prixTtcCents)}</Text>
                  {!isSent && (
                    <Pressable onPress={() => onRemove(line.id)} disabled={busy} hitSlop={6} style={styles.remove} testID={`remove-${line.nom}`}>
                      <Text style={styles.removeText}>×</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}

            {sent.length > 0 && pending.length > 0 && (
              <Text style={styles.complementHint}>
                {sent.length} ligne{sent.length > 1 ? "s" : ""} déjà en cuisine : les nouvelles
                lignes partiront en complément.
              </Text>
            )}
          </ScrollView>

          <View style={styles.totals}>
            {totals && totals.tva.map((t) => (
              <View key={String(t.taux)} style={styles.tvaRow}>
                <Text style={styles.tvaLabel}>
                  TVA {formatTaux(t.taux)} (HT {formatEuros(t.htCents)})
                </Text>
                <Text style={styles.tvaValue}>{formatEuros(t.tvaCents)}</Text>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total TTC</Text>
              <Text style={styles.totalValue} testID="order-total">{formatEuros(totals ? totals.totalTtcCents : 0)}</Text>
            </View>

            <Pressable
              onPress={onSend}
              disabled={!canSend}
              style={({ pressed }) => [styles.send, pressed && styles.sendPressed, !canSend && styles.disabled]}
              testID="send-order"
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.sendText}>
                  Envoyer en cuisine{pendingQty ? ` (${pendingQty})` : ""}
                </Text>
              )}
            </Pressable>
            <Text style={styles.sendHint}>
              L&apos;envoi écrit une vente au journal fiscal. Les lignes envoyées ne
              sont plus modifiables ; un ajout ultérieur crée un complément.
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Version {appVersion}</Text>
        {order && (
          <Text style={styles.footerText}>
            {order.type === "TABLE" ? `Table ${order.tableNom}` : "Sans table"} · {order.poste}
          </Text>
        )}
      </View>
    </View>
  );
}

function formatTaux(taux) {
  const n = Number(taux);
  if (!Number.isFinite(n)) return "—";
  return `${String(Math.round(n * 10) / 10).replace(".", ",")}\u00A0%`;
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
  topbarLeft: { flexDirection: "row", alignItems: "center", gap: space(4), flexShrink: 1 },
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
  body: { flex: 1, flexDirection: "row" },
  menuPane: { flex: 1, paddingHorizontal: space(5), paddingTop: space(4) },
  chips: { gap: space(2), paddingBottom: space(3) },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2),
    paddingHorizontal: space(4),
    paddingVertical: space(2),
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: "700", color: colors.text },
  chipTextActive: { color: "#FFFFFF" },
  chipImage: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#E2E8F0" },
  banner: {
    height: 132,
    marginBottom: space(3),
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
  },
  bannerImage: { width: "100%", height: "100%" },
  bannerLabel: {
    position: "absolute",
    left: space(3),
    bottom: space(3),
    paddingHorizontal: space(3),
    paddingVertical: space(1),
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.92)",
    maxWidth: "80%",
  },
  bannerLabelText: { fontSize: 13, fontWeight: "800", color: colors.text },
  articles: { flexDirection: "row", flexWrap: "wrap", gap: space(3), paddingBottom: space(5) },
  article: {
    width: 176,
    minHeight: 120,
    overflow: "hidden",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space(3),
    justifyContent: "space-between",
  },
  articlePressed: { backgroundColor: colors.primarySoft, borderColor: "#BFDBFE" },
  disabled: { opacity: 0.55 },
  articleImageBox: {
    height: 92,
    marginHorizontal: -space(3),
    marginTop: -space(3),
    marginBottom: space(2),
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
  },
  articleImage: { width: "100%", height: "100%" },
  articleName: { fontSize: 14, fontWeight: "700", color: colors.text },
  articleFoot: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space(2), marginTop: space(2) },
  articlePrice: { fontSize: 15, fontWeight: "800", color: colors.text },
  articleTva: { fontSize: 11, color: colors.muted },
  articleAdd: { fontSize: 12, fontWeight: "700", color: colors.primaryPressed, marginTop: space(2) },
  cartPane: {
    width: 372,
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  cartHead: { paddingHorizontal: space(4), paddingTop: space(4), paddingBottom: space(2) },
  cartTitle: { ...font.h2, fontSize: 18 },
  cartMeta: { ...font.small, marginTop: 2 },
  cartList: { paddingHorizontal: space(4), paddingBottom: space(3), gap: space(2) },
  cartEmpty: { paddingVertical: space(6) },
  cartEmptyTitle: { ...font.h3, fontSize: 14 },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2),
    paddingVertical: space(2),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  lineMain: { flex: 1, minWidth: 0 },
  lineName: { fontSize: 13, fontWeight: "700", color: colors.text },
  lineUnit: { fontSize: 11, color: colors.muted, marginTop: 1 },
  lineSent: { fontSize: 10, fontWeight: "700", color: colors.warning, marginTop: 2, textTransform: "uppercase" },
  qtyControls: { flexDirection: "row", alignItems: "center", gap: space(1) },
  qtyButton: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  qtyButtonText: { fontSize: 15, fontWeight: "700", color: colors.text, lineHeight: 18 },
  qtyValue: { minWidth: 20, textAlign: "center", fontSize: 13, fontWeight: "700", color: colors.text },
  lineQtyStatic: { fontSize: 13, fontWeight: "700", color: colors.muted },
  lineTotal: { width: 66, textAlign: "right", fontSize: 13, fontWeight: "700", color: colors.text },
  remove: { width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  removeText: { fontSize: 17, fontWeight: "700", color: colors.danger, lineHeight: 20 },
  complementHint: { ...font.small, marginTop: space(2), lineHeight: 16 },
  totals: { borderTopWidth: 1, borderTopColor: colors.border, padding: space(4), gap: space(1) },
  tvaRow: { flexDirection: "row", justifyContent: "space-between", gap: space(2) },
  tvaLabel: { fontSize: 11, color: colors.muted },
  tvaValue: { fontSize: 11, color: colors.muted },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: space(2), marginBottom: space(2) },
  totalLabel: { fontSize: 15, fontWeight: "700", color: colors.text },
  totalValue: { fontSize: 22, fontWeight: "800", color: colors.text },
  send: {
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendPressed: { backgroundColor: colors.primaryPressed },
  sendText: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  sendHint: { ...font.small, marginTop: space(2), lineHeight: 16 },
  errorBox: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: "#FECDD3",
    borderRadius: radius.md,
    padding: space(3),
    marginBottom: space(3),
  },
  errorText: { fontSize: 13, color: "#9F1239", lineHeight: 19 },
  noticeBox: {
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    borderRadius: radius.md,
    padding: space(3),
    marginBottom: space(3),
  },
  noticeText: { fontSize: 13, color: "#065F46", lineHeight: 19 },
  emptyBox: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space(4),
    width: "100%",
  },
  emptyTitle: { ...font.h3, fontSize: 14 },
  emptyText: { ...font.small, marginTop: space(1), lineHeight: 17 },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: space(5),
    paddingVertical: space(2),
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  footerText: { ...font.small },
});
