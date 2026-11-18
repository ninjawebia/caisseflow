import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { colors, font, radius, space } from "../ui/theme";
import { enroll } from "../core/enrollment";
import { isValidDeviceToken } from "../core/token";
import { DEFAULT_SERVER_URL } from "../core/config";

// Enrôlement de la tablette (M1) — jeton généré par le gérant dans
// Back-office → Appareils. Le jeton est affiché UNE SEULE FOIS côté serveur :
// il est ici contrôlé par un vrai pull, puis conservé dans le Keystore.
export default function EnrollmentScreen({ onEnrolled, appVersion }) {
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fieldError, setFieldError] = useState(null);

  const canSubmit = serverUrl.trim().length > 0 && token.trim().length > 0 && !busy;

  async function submit() {
    if (!canSubmit) return;
    setFieldError(null);
    setError(null);
    if (!isValidDeviceToken(token)) {
      setFieldError("Jeton invalide — 43 caractères attendus (copiez-le depuis l'écran « Appareils »).");
      return;
    }
    setBusy(true);
    try {
      const result = await enroll({ serverUrl, token, appVersion });
      await onEnrolled(result);
    } catch (e) {
      setError(e && e.message ? e.message : "Enrôlement impossible — réessayez");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.brand}>CaisseFlow</Text>
          <Text style={styles.title}>Enrôler cette tablette</Text>
          <Text style={styles.subtitle}>
            Reliez la caisse au back-office du restaurant. La tablette garde ensuite
            son journal fiscal localement et fonctionne hors ligne.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.field}>
            <Text style={styles.label}>Adresse du serveur</Text>
            <TextInput
              style={styles.input}
              value={serverUrl}
              onChangeText={setServerUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="http://192.168.1.10:3000"
              placeholderTextColor="#94A3B8"
              editable={!busy}
              testID="field-server-url"
            />
            <Text style={styles.help}>
              Adresse du back-office sur le réseau du restaurant (http://serveur:port).
            </Text>
          </View>

          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Jeton d&apos;enrôlement</Text>
              <Pressable onPress={() => setShowToken((v) => !v)} hitSlop={8} testID="toggle-token">
                <Text style={styles.link}>{showToken ? "Masquer" : "Afficher"}</Text>
              </Pressable>
            </View>
            <TextInput
              style={[styles.input, styles.mono]}
              value={token}
              onChangeText={setToken}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!showToken}
              placeholder="43 caractères"
              placeholderTextColor="#94A3B8"
              editable={!busy}
              testID="field-token"
            />
            <Text style={styles.help}>
              Généré par le gérant dans Back-office → Appareils. Il n&apos;est affiché
              qu&apos;une seule fois : conservez-le sur cette tablette.
            </Text>
          </View>

          {fieldError && <Text style={styles.fieldError}>{fieldError}</Text>}

          {error && (
            <View style={styles.errorBox} testID="enrollment-error">
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              !canSubmit && styles.buttonDisabled,
            ]}
            testID="submit-enrollment"
          >
            {busy ? (
              <View style={styles.buttonBusy}>
                <ActivityIndicator color="#FFFFFF" />
                <Text style={styles.buttonText}>Vérification…</Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>Enrôler cette tablette</Text>
            )}
          </Pressable>

          <Text style={styles.legal}>
            Version {appVersion} · le jeton ne quitte pas l&apos;appareil (Keystore Android)
            et n&apos;est jamais journalisé.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: "center", padding: space(6) },
  header: { marginBottom: space(5) },
  brand: { fontSize: 18, fontWeight: "800", color: colors.primary, letterSpacing: 0.4 },
  title: { ...font.h1, marginTop: space(2) },
  subtitle: { ...font.body, color: colors.muted, marginTop: space(2), maxWidth: 680, lineHeight: 22 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(5),
    maxWidth: 680,
    width: "100%",
    alignSelf: "center",
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  field: { marginBottom: space(4) },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { ...font.label, marginBottom: space(1.5) },
  link: { fontSize: 13, fontWeight: "600", color: colors.primary },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: space(3),
    backgroundColor: "#FFFFFF",
    ...font.body,
  },
  mono: { fontFamily: "monospace", fontSize: 14 },
  help: { ...font.small, marginTop: space(1.5), lineHeight: 17 },
  fieldError: { fontSize: 13, color: colors.danger, marginBottom: space(3) },
  errorBox: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: "#FECDD3",
    borderRadius: radius.md,
    padding: space(3),
    marginBottom: space(4),
  },
  errorText: { fontSize: 13, color: "#9F1239", lineHeight: 19 },
  button: {
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: { backgroundColor: colors.primaryPressed },
  buttonDisabled: { opacity: 0.45 },
  buttonBusy: { flexDirection: "row", alignItems: "center", gap: space(2) },
  buttonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  legal: { ...font.small, marginTop: space(4), lineHeight: 17 },
});
