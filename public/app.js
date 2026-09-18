const key = "kit.tasks.v1";

// Calendar days avoid timezone and daylight-saving shifts in repeat schedules.
function today() {
  const now = new Date();
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
}

let data = null;
let error = "";
try {
  data = JSON.parse(localStorage.getItem(key));
} catch {
  error = "Unable to read saved tasks.";
}

const app = Elm.Main.init({
  node: document.getElementById("app"),
  flags: { today: today(), data, error },
});

app.ports.persist.subscribe(({ data, message }) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    app.ports.saved.send({ message, ok: true });
  } catch {
    app.ports.saved.send({
      message: "Couldn’t save to this device. Keep this tab open and check that browser storage is available.",
      ok: false,
    });
  }
});

let lastDay = today();
function refreshDay() {
  const day = today();
  if (day !== lastDay) {
    lastDay = day;
    app.ports.dayChanged.send(day);
  }
}

setInterval(refreshDay, 30000);
document.addEventListener("visibilitychange", refreshDay);
window.addEventListener("focus", refreshDay);
window.addEventListener("storage", (event) => {
  if (event.key === key || event.key === null) {
    try {
      app.ports.storageChanged.send(JSON.parse(event.newValue));
    } catch {
      app.ports.storageChanged.send({ invalid: true });
    }
  }
});
