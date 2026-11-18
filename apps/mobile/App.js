// CaisseFlow — caisse tablette Android (Expo / React Native).
// Machine à états : démarrage (base + chaînage fiscal) → enrôlement (si la
// tablette n'a pas de jeton) → connexion PIN de l'opérateur → accueil.
// M3 : authentification locale (bcrypt, 5 échecs → blocage), verrouillage
// automatique après 3 min d'inactivité et au retour d'arrière-plan > 30 s.
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import appConfig from "./app.json";
import BootScreen from "./src/screens/BootScreen";
import EnrollmentScreen from "./src/screens/EnrollmentScreen";
import LoginScreen from "./src/screens/LoginScreen";
import HomeScreen from "./src/screens/HomeScreen";
import { openAndMigrate } from "./src/db";
import { assertChainIntact } from "./src/db/journal";
import { authenticate, saveStaff, listStaff, recordLockEvent } from "./src/db/auth";
import { pullReference } from "./src/core/enrollment";
import { SESSION_TIMEOUT_MS, shouldLockOnResume, formatDuration } from "./src/core/auth";
import { loadEnrollment, saveEnrollment, clearEnrollment } from "./src/storage/device";
import { colors, font, radius, space } from "./src/ui/theme";

const APP_VERSION = appConfig.expo.version;
const INACTIVITY_TICK_MS = 15000;

const LOCK_MSG_INACTIVITY = `Verrouillé automatiquement après ${formatDuration(SESSION_TIMEOUT_MS)} d'inactivité.`;
const LOCK_MSG_BACKGROUND = "Verrouillé : l'application est restée en arrière-plan.";

export default function App() {
  const [phase, setPhase] = useState("booting"); // booting | enroll | login | home | error
  const [schema, setSchema] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [staff, setStaff] = useState([]);
  const [user, setUser] = useState(null);
  const [lockReason, setLockReason] = useState(null);
  const [staffBusy, setStaffBusy] = useState(false);
  const [bootError, setBootError] = useState(null);

  const dbRef = useRef(null);
  const userRef = useRef(null);
  const phaseRef = useRef("booting");
  const enrollmentRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const backgroundAtRef = useRef(null);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { enrollmentRef.current = enrollment; }, [enrollment]);

  const markActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  // Recharge le personnel depuis le serveur (dernière version gagnante).
  const refreshStaff = useCallback(async (target) => {
    const enr = target || enrollmentRef.current;
    if (!enr || !dbRef.current) throw new Error("Tablette non enrôlée");
    setStaffBusy(true);
    try {
      const pulled = await pullReference({ serverUrl: enr.serverUrl, token: enr.token });
      await saveStaff(dbRef.current, pulled.users);
      setStaff(await listStaff(dbRef.current));
      return pulled;
    } finally {
      setStaffBusy(false);
    }
  }, []);

  const boot = useCallback(async () => {
    setPhase("booting");
    setBootError(null);
    try {
      const opened = await openAndMigrate();
      dbRef.current = opened.db;
      // FISC-7 : contrôle de chaînage complet AVANT tout service d'encaissement.
      // Une rupture bloque le démarrage (incident affiché, aucune correction).
      const journal = await assertChainIntact(opened.db);
      setSchema({ version: opened.version, latest: opened.latest, applied: opened.applied, journal });

      const saved = await loadEnrollment();
      if (!saved) {
        setPhase("enroll");
        return;
      }
      setEnrollment(saved);

      // Personnel déjà en cache (hors ligne) : la connexion PIN fonctionne
      // immédiatement. Sinon, tentative silencieuse de synchronisation.
      let list = await listStaff(opened.db);
      if (list.filter((s) => s.actif).length === 0) {
        try {
          await refreshStaff(saved);
          list = await listStaff(opened.db);
        } catch {
          // Hors ligne : l'écran de connexion propose de synchroniser.
        }
      }
      setStaff(list);
      setPhase("login");
    } catch (e) {
      setBootError(e && e.message ? e.message : "Démarrage impossible");
      setPhase("error");
    }
  }, [refreshStaff]);

  useEffect(() => { boot(); }, [boot]);

  const handleEnrolled = useCallback(async (result) => {
    // Persistance AVANT l'affichage : si le Keystore refuse, l'écran
    // d'enrôlement affiche l'erreur et rien n'est perdu.
    const saved = await saveEnrollment({ token: result.token, serverUrl: result.serverUrl });
    setEnrollment(saved);
    // Le personnel arrive avec l'enrôlement : connexion possible hors ligne.
    if (dbRef.current && Array.isArray(result.staff) && result.staff.length) {
      await saveStaff(dbRef.current, result.staff);
      setStaff(await listStaff(dbRef.current));
    }
    setLockReason(null);
    setPhase("login");
  }, []);

  const handleReset = useCallback(async () => {
    await clearEnrollment();
    setEnrollment(null);
    setStaff([]);
    setUser(null);
    setPhase("enroll");
  }, []);

  const handleAuthenticate = useCallback(async ({ matricule, pin }) => {
    if (!dbRef.current) return { ok: false, code: "STORAGE", message: "Base locale indisponible" };
    const res = await authenticate(dbRef.current, { matricule, pin });
    if (res.ok) {
      lastActivityRef.current = Date.now();
      setLockReason(null);
      setUser(res.user);
      setPhase("home");
    }
    return res;
  }, []);

  const lock = useCallback(async (reason) => {
    const current = userRef.current;
    if (dbRef.current && current) {
      // Journal local des connexions (séparé du journal fiscal).
      try {
        await recordLockEvent(dbRef.current, current.matricule, reason === "manual" ? "manual_lock" : "auto_lock");
      } catch {
        // Le verrouillage ne doit jamais être empêché par un échec d'écriture.
      }
    }
    setUser(null);
    setLockReason(reason === "manual" ? "Verrouillé manuellement." : reason === "background" ? LOCK_MSG_BACKGROUND : LOCK_MSG_INACTIVITY);
    setPhase("login");
  }, []);

  const handleManualLock = useCallback(() => lock("manual"), [lock]);

  // Inactivité : vérification périodique pendant le service (pas de minuteur
  // par frappe : un seul intervalle, remis à zéro par tout contact tactile).
  useEffect(() => {
    if (phase !== "home") return undefined;
    const timer = setInterval(() => {
      if (phaseRef.current !== "home") return;
      if (Date.now() - lastActivityRef.current >= SESSION_TIMEOUT_MS) lock("inactivity");
    }, INACTIVITY_TICK_MS);
    return () => clearInterval(timer);
  }, [phase, lock]);

  // Arrière-plan : toute sortie de l'app retient l'instant, et un retour après
  // 30 s verrouille (une tablette posée ne doit pas rester ouverte).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background" || next === "inactive") {
        backgroundAtRef.current = Date.now();
        return;
      }
      if (next === "active" && phaseRef.current === "home") {
        if (shouldLockOnResume(backgroundAtRef.current, Date.now())) lock("background");
        backgroundAtRef.current = null;
      }
    });
    return () => sub.remove();
  }, [lock]);

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

  if (phase === "enroll") {
    return <EnrollmentScreen onEnrolled={handleEnrolled} appVersion={APP_VERSION} />;
  }

  if (phase === "login") {
    return (
      <LoginScreen
        staff={staff}
        lockReason={lockReason}
        busy={staffBusy}
        onAuthenticate={handleAuthenticate}
        onRefreshStaff={refreshStaff}
        canRefresh={Boolean(enrollment)}
        appVersion={APP_VERSION}
      />
    );
  }

  // phase === "home" — sans utilisateur (verrou en cours), retour à la connexion.
  if (user && enrollment && schema) {
    return (
      <HomeScreen
        enrollment={enrollment}
        schema={schema}
        user={user}
        appVersion={APP_VERSION}
        onReset={handleReset}
        onLock={handleManualLock}
        onActivity={markActivity}
      />
    );
  }

  return (
    <LoginScreen
      staff={staff}
      lockReason={lockReason}
      busy={staffBusy}
      onAuthenticate={handleAuthenticate}
      onRefreshStaff={refreshStaff}
      canRefresh={Boolean(enrollment)}
      appVersion={APP_VERSION}
    />
  );
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
