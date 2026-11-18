import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { colors, font, space } from "../ui/theme";

// Écran de démarrage : ouverture/migration de la base locale + lecture du
// Keystore. Aucun écran de caisse ne s'affiche avant que le socle soit prêt.
export default function BootScreen() {
  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <Text style={styles.brand}>CaisseFlow</Text>
      <Text style={styles.tag}>Caisse restaurant · journal fiscal local</Text>
      <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
      <Text style={styles.hint}>Préparation de la caisse…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: space(8),
  },
  brand: { fontSize: 34, fontWeight: "800", color: colors.text, letterSpacing: -0.8 },
  tag: { ...font.body, color: colors.muted, marginTop: space(1), textAlign: "center" },
  spinner: { marginTop: space(8) },
  hint: { ...font.small, marginTop: space(4) },
});
