// CaisseFlow — caisse tablette Android (Expo / React Native).
// Socle M1 : ouverture + migration de la base SQLite locale, enrôlement de la
// tablette (jeton d'appareil dans le Keystore), écran d'accueil de contrôle.
// Navigation volontairement minimale (machine à états) : deux écrans seulement
// au M1 ; la pile d'écrans de la caisse sera introduite avec les modules POS.
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import appConfig from "./app.json";
import BootScreen from "./src/screens/BootScreen";
import EnrollmentScreen from "./src/screens/EnrollmentScreen";
import HomeScreen from "./src/screens/HomeScreen";
import { openAndMigrate } from "./src/db";
import { loadEnrollment, saveEnrollment, clearEnrollment } from "./src/storage/device";
import { colors, font, radius, space } from "./src/ui/theme";

const APP_VERSION = appConfig.expo.version;

export default function App() {
  const [phase, setPhase] = useState("booting"); // booting | enroll | home | error
  const [schema, setSchema] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [bootError, setBootError] = useState(null);

  const boot = useCallback(async () => {
    setPhase("booting");
    setBootError(null);
    try {
      const db = await openAndMigrate();
      setSchema({ version: db.version, latest: db.latest, applied: db.applied });
      const saved = await loadEnrollment();
      if (saved) {
        setEnrollment(saved);
        setPhase("home");
      } else {
        setPhase("enroll");
      }
    } catch (e) {
      setBootError(e && e.message ? e.message : "Démarrage impossible");
      setPhase("error");
    }
  }, []);

  useEffect(() => { boot(); }, [boot]);

  const handleEnrolled = useCallback(async (result) => {
    // Persistance AVANT l'affichage de l'accueil : si le Keystore refuse,
    // l'écran d'enrôlement affiche l'erreur et rien n'est perdu.
    const saved = await saveEnrollment({ token: result.token, serverUrl: result.serverUrl });
    setEnrollment(saved);
    setPhase("home");
  }, []);

  const handleReset = useCallback(async () => {
    await clearEnrollment();
    setEnrollment(null);
    setPhase("enroll");
  }, []);

  if (phase === "booting") return <BootScreen />;

  if (phase === "error") {
    return (
      <View style={styles.errorRoot}>
        <StatusBar style="dark" />
        <Text style={styles.errorTitle}>La caisse n&apos;a pas pu démarrer</Text>
        <Text style={styles.errorText}>{bootError}</Text>
        <Pressable onPress={boot} style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}>
          <Text style={styles.retryText}>Réessayer</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === "home" && enrollment && schema) {
    return (
      <HomeScreen
        enrollment={enrollment}
        schema={schema}
        appVersion={APP_VERSION}
        onReset={handleReset}
      />
    );
  }

  return <EnrollmentScreen onEnrolled={handleEnrolled} appVersion={APP_VERSION} />;
}

const styles = StyleSheet.create({
  errorRoot: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: space(8),
  },
  errorTitle: { ...font.h2, textAlign: "center" },
  errorText: { ...font.body, color: colors.danger, marginTop: space(3), textAlign: "center", maxWidth: 520 },
  retry: {
    marginTop: space(5),
    height: 46,
    paddingHorizontal: space(6),
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  retryPressed: { backgroundColor: colors.primaryPressed },
  retryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
});
