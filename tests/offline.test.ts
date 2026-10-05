import "fake-indexeddb/auto";
import { deleteApp, getApp, initializeApp } from "firebase/app";
import {
  connectFirestoreEmulator,
  disableNetwork,
  doc,
  enableNetwork,
  getDocFromCache,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  terminate,
  waitForPendingWrites,
} from "firebase/firestore";
import { decodeDate, today } from "../src/date";
import { expect, it, vi } from "vitest";
import { completeTask, createTask, reopenTask, setTaskDate, setTaskTitle } from "../src/userData";

vi.mock("../src/App", () => ({ default: () => null }));
vi.mock("solid-js/web", () => ({ render: vi.fn() }));
vi.mock("virtual:pwa-register", () => ({ registerSW: () => vi.fn() }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const firestore = await importOriginal<typeof import("firebase/firestore")>();
  return { ...firestore, initializeFirestore: vi.fn(firestore.initializeFirestore) };
});

it("retains offline task creation, title and date editing, completion, and reopening across restarts, then syncs", async () => {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {
    location: { hostname: "localhost" },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      key: (index: number) => [...storage.keys()][index] ?? null,
      get length() { return storage.size; },
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("document", { body: {} });
  vi.stubEnv("MODE", "test");
  // The Node SDK needs this flag to use IndexedDB and the window storage above.
  vi.stubEnv("USE_MOCK_PERSISTENCE", "YES");
  await import("../src/main");
  let app = getApp();
  let firestore = getFirestore();
  const options = app.options;
  // Reuse the startup configuration so this catches a regression to memory caching.
  const settings = vi.mocked(initializeFirestore).mock.calls[0]![1];

  try {
    connectFirestoreEmulator(firestore, "127.0.0.1", 8081, { mockUserToken: { sub: "offline-user" } });
    await disableNetwork(firestore);
    const taskId = crypto.randomUUID();
    void createTask("offline-user", taskId).catch(() => {});
    const userDocument = doc(firestore, "users", "offline-user");
    const created = await getDocFromCache(userDocument);
    expect(created.data()).toEqual({ tasks: { [taskId]: { title: "", completed: false, date: today() } } });
    void setTaskTitle("offline-user", taskId, "Buy bread").catch(() => {});
    void setTaskDate("offline-user", taskId, decodeDate("2026-10-05")).catch(() => {});
    void completeTask("offline-user", taskId).catch(() => {});
    expect((await getDocFromCache(userDocument)).data()).toEqual({
      tasks: { [taskId]: { title: "Buy bread", completed: true, date: "2026-10-05" } },
    });

    await terminate(firestore);
    await deleteApp(app);
    app = initializeApp(options);
    firestore = initializeFirestore(app, settings);
    connectFirestoreEmulator(firestore, "127.0.0.1", 8081, { mockUserToken: { sub: "offline-user" } });
    await disableNetwork(firestore);
    const restartedDocument = doc(firestore, "users", "offline-user");
    const cachedAfterRestart = await getDocFromCache(restartedDocument);
    expect(cachedAfterRestart.data()).toEqual({ tasks: { [taskId]: { title: "Buy bread", completed: true, date: "2026-10-05" } } });
    expect(cachedAfterRestart.metadata.hasPendingWrites).toBe(true);

    void reopenTask("offline-user", taskId).catch(() => {});
    expect((await getDocFromCache(restartedDocument)).data()).toEqual({
      tasks: { [taskId]: { title: "Buy bread", completed: false, date: "2026-10-05" } },
    });

    await terminate(firestore);
    await deleteApp(app);
    app = initializeApp(options);
    firestore = initializeFirestore(app, settings);
    connectFirestoreEmulator(firestore, "127.0.0.1", 8081, { mockUserToken: { sub: "offline-user" } });
    await disableNetwork(firestore);
    const finalDocument = doc(firestore, "users", "offline-user");
    const final = await getDocFromCache(finalDocument);
    expect(final.data()).toEqual({ tasks: { [taskId]: { title: "Buy bread", completed: false, date: "2026-10-05" } } });
    expect(final.metadata.hasPendingWrites).toBe(true);

    await enableNetwork(firestore);
    await waitForPendingWrites(firestore);
    expect((await getDocFromServer(finalDocument)).data()).toEqual(final.data());
  } finally {
    await terminate(firestore);
    await deleteApp(app);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
}, 20_000);
