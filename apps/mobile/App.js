// CaisseFlow — caisse tablette Android (Expo / React Native).
// Machine à états : démarrage (base + chaînage fiscal) → enrôlement (si la
// tablette n'a pas de jeton) → connexion PIN de l'opérateur → accueil.
// M3 : authentification locale (bcrypt, 5 échecs → blocage), verrouillage
// automatique après 3 min d'inactivité et au retour d'arrière-plan > 30 s.
// M4 : données de référence locales (carte, tables, personnel) et synchronisation
// delta — la caisse affiche la carte et reste exploitable sans réseau.
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import appConfig from "./app.json";
import BootScreen from "./src/screens/BootScreen";
import EnrollmentScreen from "./src/screens/EnrollmentScreen";
import LoginScreen from "./src/screens/LoginScreen";
import HomeScreen from "./src/screens/HomeScreen";
import TablesScreen from "./src/screens/TablesScreen";
import OrderScreen from "./src/screens/OrderScreen";
import { openAndMigrate } from "./src/db";
import { assertChainIntact } from "./src/db/journal";
import { newUuid } from "./src/native/random";
import { authenticate, saveStaff, listStaff, recordLockEvent } from "./src/db/auth";
import {
  saveReference, readReferenceCounts, getLastPull, setLastPull, setLicence, readLicence,
  readMenu, readTables, setDevicePoste, readDevicePoste,
} from "./src/db/reference";
import {
  createOrder, getOrder, openOrdersByTable,
  addArticle, setLineQty, removeLine, sendOrder,
} from "./src/db/orders";
import { pullReference, assertAppVersion } from "./src/core/enrollment";
import { SESSION_TIMEOUT_MS, shouldLockOnResume, formatDuration } from "./src/core/auth";
import { loadEnrollment, saveEnrollment, clearEnrollment } from "./src/storage/device";
import { colors, font, radius, space } from "./src/ui/theme";

const APP_VERSION = appConfig.expo.version;
const INACTIVITY_TICK_MS = 15000;
// Phases pendant lesquelles la session opérateur est active (verrouillage auto).
const SERVICE_PHASES = ["home", "tables", "order"];

const LOCK_MSG_INACTIVITY = `Verrouillé automatiquement après ${formatDuration(SESSION_TIMEOUT_MS)} d'inactivité.`;
const LOCK_MSG_BACKGROUND = "Verrouillé : l'application est restée en arrière-plan.";

const EMPTY_REFERENCE = {
  counts: { categories: 0, articles: 0, tables: 0, users: 0 },
  lastPull: null,
  licence: null,
};

export default function App() {
  const [phase, setPhase] = useState("booting"); // booting | enroll | login | home | error
  const [schema, setSchema] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [staff, setStaff] = useState([]);
  const [user, setUser] = useState(null);
  const [lockReason, setLockReason] = useState(null);
  const [staffBusy, setStaffBusy] = useState(false);
  const [bootError, setBootError] = useState(null);
  const [reference, setReference] = useState(EMPTY_REFERENCE);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [poste, setPoste] = useState(null);
  const [menu, setMenu] = useState([]);
  const [tables, setTables] = useState([]);
  const [openOrders, setOpenOrders] = useState({});
  const [active, setActive] = useState(null); // { order, lines, totals }
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderError, setOrderError] = useState(null);
  const [orderNotice, setOrderNotice] = useState(null);

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

  // État de la carte locale (compteurs, dernière synchro, licence en cache).
  const loadReferenceState = useCallback(async (db) => {
    if (!db) return;
    const [counts, lastPull, licence] = await Promise.all([
      readReferenceCounts(db),
      getLastPull(db),
      readLicence(db),
    ]);
    setReference({ counts, lastPull, licence });
  }, []);

  // État de service (M5) : identifiant de poste (préfixe fiscal), carte
  // groupée, tables actives et occupation locale.
  const loadServiceState = useCallback(async (db) => {
    if (!db) return;
    const [posteValue, groups, tableList] = await Promise.all([
      readDevicePoste(db),
      readMenu(db),
      readTables(db),
    ]);
    setPoste(posteValue || null);
    setMenu(groups);
    setTables(tableList);
    setOpenOrders(posteValue ? await openOrdersByTable(db, posteValue) : {});
  }, []);

  // Synchronisation complète : articles en DELTA (`since` = heure serveur du
  // dernier pull réussi), catégories/tables/personnel en pull complet. La carte
  // locale et le cache du personnel ne sont remplacés qu'en cas de succès.
  const syncNow = useCallback(async ({ silent = false, enrollment: target } = {}) => {
    const enr = target || enrollmentRef.current;
    const db = dbRef.current;
    if (!enr || !db) throw new Error("Tablette non enrôlée");
    if (!silent) {
      setSyncBusy(true);
      setSyncError(null);
    }
    try {
      const since = await getLastPull(db);
      const pulled = await pullReference({
        serverUrl: enr.serverUrl,
        token: enr.token,
        since: since || undefined,
      });
      // Version minimale imposée par le serveur : une caisse trop ancienne
      // n'écrit pas de données fiscales (mise à jour obligatoire).
      assertAppVersion(APP_VERSION, pulled.minAppVersion);

      await saveReference(db, {
        categories: pulled.categories,
        articles: pulled.articles,
        tables: pulled.tables,
      });
      await saveStaff(db, pulled.users);

      const at = pulled.serverTime || new Date().toISOString();
      await setLastPull(db, at);
      await setLicence(db, pulled.licence);
      // Le poste est figé sur le jeton côté serveur : il préfixe la
      // numérotation fiscale locale (`POSTE-01-000001`).
      await setDevicePoste(db, pulled.poste);

      setReference({
        counts: await readReferenceCounts(db),
        lastPull: at,
        licence: pulled.licence,
      });
      setStaff(await listStaff(db));
      await loadServiceState(db);
      return pulled;
    } catch (e) {
      if (!silent) setSyncError(e && e.message ? e.message : "Synchronisation impossible");
      throw e;
    } finally {
      if (!silent) setSyncBusy(false);
    }
  }, [loadServiceState]);

  // Bouton « Synchroniser » de l'écran de connexion : même chemin, indicateur
  // de chargement local au personnel.
  const refreshStaff = useCallback(async (target) => {
    setStaffBusy(true);
    try {
      return await syncNow({ silent: true, enrollment: target });
    } finally {
      setStaffBusy(false);
    }
  }, [syncNow]);

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

      // La carte et le personnel déjà en cache permettent de travailler hors
      // ligne immédiatement ; la synchronisation tente ensuite une mise à jour
      // silencieuse (son échec ne bloque jamais le service).
      await loadReferenceState(opened.db);
      await loadServiceState(opened.db);
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
      syncNow({ silent: true, enrollment: saved }).catch(() => {
        // Hors ligne au démarrage : la carte locale reste celle du dernier pull.
      });
    } catch (e) {
      setBootError(e && e.message ? e.message : "Démarrage impossible");
      setPhase("error");
    }
  }, [loadReferenceState, loadServiceState, refreshStaff, syncNow]);

  useEffect(() => { boot(); }, [boot]);

  const handleEnrolled = useCallback(async (result) => {
    // Persistance AVANT l'affichage : si le Keystore refuse, l'écran
    // d'enrôlement affiche l'erreur et rien n'est perdu.
    const saved = await saveEnrollment({ token: result.token, serverUrl: result.serverUrl });
    setEnrollment(saved);
    const db = dbRef.current;
    if (db) {
      // L'enrôlement a déjà téléchargé la référence : on la stocke sans
      // second appel réseau, la carte est disponible hors ligne aussitôt.
      if (result.reference) {
        await saveReference(db, result.reference);
        await setLastPull(db, result.serverTime || new Date().toISOString());
      }
      if (result.licence) await setLicence(db, result.licence);
      await setDevicePoste(db, result.poste);
      if (Array.isArray(result.staff) && result.staff.length) {
        await saveStaff(db, result.staff);
      }
      await loadReferenceState(db);
      await loadServiceState(db);
      setStaff(await listStaff(db));
    }
    setLockReason(null);
    setPhase("login");
  }, [loadReferenceState, loadServiceState]);

  const handleReset = useCallback(async () => {
    await clearEnrollment();
    setEnrollment(null);
    setStaff([]);
    setUser(null);
    setReference(EMPTY_REFERENCE);
    setSyncError(null);
    setPoste(null);
    setMenu([]);
    setTables([]);
    setOpenOrders({});
    setActive(null);
    setOrderError(null);
    setOrderNotice(null);
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
    setActive(null);
    setOrderError(null);
    setOrderNotice(null);
    setLockReason(reason === "manual" ? "Verrouillé manuellement." : reason === "background" ? LOCK_MSG_BACKGROUND : LOCK_MSG_INACTIVITY);
    setPhase("login");
  }, []);

  const handleManualLock = useCallback(() => lock("manual"), [lock]);

  const message = (e, fallback) => (e && e.message ? e.message : fallback);

  // --- M5 : prise de commande -------------------------------------------
  const refreshOpenOrders = useCallback(async () => {
    const db = dbRef.current;
    if (!db || !poste) return;
    setOpenOrders(await openOrdersByTable(db, poste));
  }, [poste]);

  const openTables = useCallback(async () => {
    setOrderError(null);
    setOrderNotice(null);
    setOrderBusy(true);
    try {
      const db = dbRef.current;
      if (db) {
        const [groups, tableList] = await Promise.all([readMenu(db), readTables(db)]);
        setMenu(groups);
        setTables(tableList);
        await refreshOpenOrders();
      }
      setPhase("tables");
    } catch (e) {
      setOrderError(message(e, "Plan de salle indisponible"));
    } finally {
      setOrderBusy(false);
    }
  }, [refreshOpenOrders]);

  const openOrder = useCallback(async (table) => {
    const db = dbRef.current;
    const current = userRef.current;
    if (!db || !current) return;
    setOrderBusy(true);
    setOrderError(null);
    setOrderNotice(null);
    try {
      let view = null;
      const existing = table ? openOrders[table.id] : null;
      if (existing) {
        view = await getOrder(db, existing.id);
      } else {
        const created = await createOrder(db, {
          poste,
          type: table ? "TABLE" : "COMPTOIR",
          table,
          user: current,
          uuidOp: newUuid,
        });
        view = {
          order: created,
          lines: [],
          totals: { totalTtcCents: 0, nbArticles: 0, nbLignes: 0, tva: [] },
        };
      }
      setActive(view);
      setPhase("order");
      await refreshOpenOrders();
    } catch (e) {
      setOrderError(message(e, "Commande impossible"));
    } finally {
      setOrderBusy(false);
    }
  }, [openOrders, poste, refreshOpenOrders]);

  const leaveOrder = useCallback(() => {
    const type = active && active.order ? active.order.type : null;
    setActive(null);
    setOrderError(null);
    setOrderNotice(null);
    setPhase(type === "TABLE" ? "tables" : "home");
  }, [active]);

  const handleAddArticle = useCallback(async (article) => {
    const db = dbRef.current;
    if (!db || !active) return;
    setOrderBusy(true);
    setOrderError(null);
    setOrderNotice(null);
    try {
      const res = await addArticle(db, {
        orderId: active.order.id,
        article,
        qte: 1,
        uuidOp: newUuid,
      });
      setActive({ order: res.order, lines: res.lines, totals: res.totals });
    } catch (e) {
      setOrderError(message(e, "Article non ajouté"));
    } finally {
      setOrderBusy(false);
    }
  }, [active]);

  const handleSetQty = useCallback(async (lineId, qte) => {
    const db = dbRef.current;
    if (!db || !active) return;
    setOrderBusy(true);
    setOrderError(null);
    setOrderNotice(null);
    try {
      if (qte <= 0) {
        const res = await removeLine(db, { orderId: active.order.id, lineId });
        setActive({ order: { ...active.order, totalTtcCents: res.totals.totalTtcCents }, lines: res.lines, totals: res.totals });
      } else {
        const res = await setLineQty(db, { orderId: active.order.id, lineId, qte });
        setActive({ order: { ...active.order, totalTtcCents: res.totals.totalTtcCents }, lines: res.lines, totals: res.totals });
      }
    } catch (e) {
      setOrderError(message(e, "Quantité non modifiée"));
    } finally {
      setOrderBusy(false);
    }
  }, [active]);

  const handleRemoveLine = useCallback(async (lineId) => {
    if (!dbRef.current || !active) return;
    setOrderBusy(true);
    setOrderError(null);
    setOrderNotice(null);
    try {
      const res = await removeLine(dbRef.current, { orderId: active.order.id, lineId });
      setActive({ order: { ...active.order, totalTtcCents: res.totals.totalTtcCents }, lines: res.lines, totals: res.totals });
    } catch (e) {
      setOrderError(message(e, "Ligne non supprimée"));
    } finally {
      setOrderBusy(false);
    }
  }, [active]);

  const handleSendOrder = useCallback(async () => {
    const db = dbRef.current;
    const current = userRef.current;
    if (!db || !current || !active) return;
    setOrderBusy(true);
    setOrderError(null);
    setOrderNotice(null);
    try {
      const res = await sendOrder(db, { orderId: active.order.id, user: current, uuidOp: newUuid });
      setActive({ order: res.order, lines: res.lines, totals: res.totals });
      setOrderNotice(
        `${res.complement ? "Complément" : "Commande"} envoyé${res.complement ? "" : "e"} en cuisine · écriture ${res.entry.ref}`
      );
      await refreshOpenOrders();
      // Le compteur du journal a changé : on rafraîchit l'état affiché.
      if (dbRef.current) {
        const journal = await assertChainIntact(dbRef.current);
        setSchema((prev) => (prev ? { ...prev, journal } : prev));
      }
    } catch (e) {
      setOrderError(message(e, "Envoi en cuisine impossible"));
    } finally {
      setOrderBusy(false);
    }
  }, [active, refreshOpenOrders]);

  // Inactivité : vérification périodique pendant le service (pas de minuteur
  // par frappe : un seul intervalle, remis à zéro par tout contact tactile).
  useEffect(() => {
    if (!SERVICE_PHASES.includes(phase)) return undefined;
    const timer = setInterval(() => {
      if (!SERVICE_PHASES.includes(phaseRef.current)) return;
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
      if (next === "active" && SERVICE_PHASES.includes(phaseRef.current)) {
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
  if (user && enrollment && schema && phase === "tables") {
    return (
      <TablesScreen
        tables={tables}
        openOrders={openOrders}
        menuEmpty={menu.length === 0 || menu.every((g) => !g.articles.length)}
        busy={orderBusy}
        error={orderError}
        poste={poste}
        user={user}
        onBack={() => { setOrderError(null); setPhase("home"); }}
        onLock={handleManualLock}
        onOpenTable={openOrder}
        onComptoir={() => openOrder(null)}
        onSync={() => syncNow({ silent: false }).catch(() => {})}
        onActivity={markActivity}
        appVersion={APP_VERSION}
      />
    );
  }

  if (user && enrollment && schema && phase === "order" && active) {
    return (
      <OrderScreen
        order={active.order}
        lines={active.lines}
        totals={active.totals}
        menu={menu}
        busy={orderBusy}
        error={orderError}
        notice={orderNotice}
        user={user}
        serverUrl={enrollment.serverUrl}
        token={enrollment.token}
        onBack={leaveOrder}
        onLock={handleManualLock}
        onAddArticle={handleAddArticle}
        onSetQty={handleSetQty}
        onRemove={handleRemoveLine}
        onSend={handleSendOrder}
        onActivity={markActivity}
        appVersion={APP_VERSION}
      />
    );
  }

  if (user && enrollment && schema) {
    return (
      <HomeScreen
        enrollment={enrollment}
        schema={schema}
        user={user}
        reference={reference}
        syncBusy={syncBusy}
        syncError={syncError}
        onSync={() => syncNow({ silent: false })}
        appVersion={APP_VERSION}
        onReset={handleReset}
        onLock={handleManualLock}
        onActivity={markActivity}
        onNewOrder={openTables}
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
