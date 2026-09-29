import { Elm } from "./Main.elm";
import { initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  doc,
  getFirestore,
  onSnapshot,
} from "firebase/firestore";
import { registerSW } from "virtual:pwa-register";
import { setDoc } from "./firestore.js";

import "./styles.css";

if (window.location.hostname === "kit-tasks.firebaseapp.com") {
  const url = new URL(window.location.href);
  url.hostname = "kit-tasks.web.app";
  window.location.replace(url.href);
}

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    if (window.confirm("A new version of Kit is available. Update now?")) {
      updateSW();
    }
  },
});

initializeApp({
  apiKey: "AIzaSyBhruL_bC6C7mlBlvIvT76lzFQ69VjqJis",
  authDomain: "kit-tasks.web.app",
  projectId: "kit-tasks",
  storageBucket: "kit-tasks.firebasestorage.app",
  messagingSenderId: "723040117824",
  appId: "1:723040117824:web:6755c08fe69c16641e6ba5"
});

if (import.meta.env.MODE === "emulator") {
  connectAuthEmulator(getAuth(), `http://${window.location.hostname}:9099`);
  connectFirestoreEmulator(getFirestore(), window.location.hostname, 8080);
}

const app = Elm.Main.init();

try {
  await getRedirectResult(getAuth());
} catch (error) {
  app.ports.signInFailed.send(error.code || "auth/unknown");
}

let unsubscribeUserData = null;

onAuthStateChanged(getAuth(), (user) => {
  if (unsubscribeUserData) {
    unsubscribeUserData();
    unsubscribeUserData = null;
  }

  if (!user) {
    app.ports.authChanged.send(null);
    return;
  }

  app.ports.authChanged.send({ photoUrl: user.photoURL });

  unsubscribeUserData = onSnapshot(
    doc(getFirestore(), "users", user.uid),
    (snapshot) => {
      app.ports.userDataChanged.send(snapshot.exists() ? snapshot.data() : null);
    },
    (error) => {
      app.ports.userDataFailed.send(error.code || "unknown");
    },
  );
});

app.ports.signIn.subscribe(async () => {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithRedirect(getAuth(), provider);
  } catch (error) {
    app.ports.signInFailed.send(error.code || "auth/unknown");
  }
});

app.ports.signOut.subscribe(async () => {
  try {
    await signOut(getAuth());
  } catch (error) {
    app.ports.signOutFailed.send(error.code || "auth/unknown");
  }
});

app.ports.generateUuid.subscribe(() => {
  let uuid;
  try {
    uuid = crypto.randomUUID();
  } catch {
    app.ports.uuidFailed.send("unknown");
    return;
  }

  app.ports.uuidGenerated.send(uuid);
});

app.ports.setDoc.subscribe(async (write) => {
  const userId = getAuth().currentUser?.uid;

  if (!userId) {
    app.ports.setDocFailed.send("auth/not-signed-in");
    return;
  }

  try {
    await setDoc(
      doc(getFirestore(), "users", userId),
      write,
    );
  } catch (error) {
    if (getAuth().currentUser?.uid === userId) {
      app.ports.setDocFailed.send(error.code || "unknown");
    }
  }
});
