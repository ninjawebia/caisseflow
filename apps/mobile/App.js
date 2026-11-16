// CaisseFlow mobile — squelette minimal (livrable documenté PRD ch. 4, phase 2).
// Sert d'entrée expo prebuild pour le build APK conteneurisé ; l'implémentation
// complète (caisse offline-first, TERM, KDS) suivra les exigences FISC/POS/SYNC.
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>CaisseFlow</Text>
      <Text style={styles.sub}>App caisse — implémentation Phase 2 (PRD ch. 4)</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc", alignItems: "center", justifyContent: "center", gap: 8 },
  title: { fontSize: 28, fontWeight: "700", color: "#0f172a" },
  sub: { fontSize: 14, color: "#64748b" },
});
