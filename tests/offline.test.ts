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
import { expect, it, vi } from "vitest";
import { createTask } from "../src/userData";

vi.mock("../src/App", () => ({ default: () => null }));
vi.mock("solid-js/web", () => ({ render: vi.fn() }));
vi.mock("virtual:pwa-register", () => ({ registerSW: () => vi.fn() }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const firestore = await importOriginal<typeof import("firebase/firestore")>();
  return { ...firestore, initializeFirestore: vi.fn(firestore.initializeFirestore) };
});

it("retains offline task creation across a restart, then syncs", async () => {
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
    void createTask("offline-user", { title: "Buy milk" }).catch(() => {});
    const userDocument = doc(firestore, "users", "offline-user");
    const created = await getDocFromCache(userDocument);
    const taskId = Object.keys(created.data()!.tasks)[0]!;

    await terminate(firestore);
    await deleteApp(app);
    app = initializeApp(options);
    firestore = initializeFirestore(app, settings);
    connectFirestoreEmulator(firestore, "127.0.0.1", 8081, { mockUserToken: { sub: "offline-user" } });
    await disableNetwork(firestore);
    const restoredDocument = doc(firestore, "users", "offline-user");
    const restored = await getDocFromCache(restoredDocument);
    expect(restored.data()).toEqual({ tasks: { [taskId]: { title: "Buy milk" } } });
    expect(restored.metadata.hasPendingWrites).toBe(true);

    await enableNetwork(firestore);
    await waitForPendingWrites(firestore);
    expect((await getDocFromServer(restoredDocument)).data()).toEqual(restored.data());
  } finally {
    await terminate(firestore);
    await deleteApp(app);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
}, 20_000);
