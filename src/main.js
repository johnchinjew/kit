import { Elm } from "./Main.elm";
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

Elm.Main.init({
  node: document.getElementById("app"),
});
