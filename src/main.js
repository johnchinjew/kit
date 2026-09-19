import { Elm } from "./Main.elm";
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { registerSW } from "virtual:pwa-register";

import "./styles.css";

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    if (window.confirm("A new version of Kit is available. Reload now to update?")) {
      updateSW();
    }
  },
});

initializeApp({
  apiKey: "AIzaSyBhruL_bC6C7mlBlvIvT76lzFQ69VjqJis",
  authDomain: "kit-tasks.firebaseapp.com",
  projectId: "kit-tasks",
  storageBucket: "kit-tasks.firebasestorage.app",
  messagingSenderId: "723040117824",
  appId: "1:723040117824:web:6755c08fe69c16641e6ba5"
});

if (import.meta.env.DEV) {
  connectAuthEmulator(getAuth(), `http://${window.location.hostname}:9099`);
  connectFirestoreEmulator(getFirestore(), window.location.hostname, 8080);
}

Elm.Main.init({
  node: document.getElementById("app"),
});
