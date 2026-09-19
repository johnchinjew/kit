import { spawn } from "node:child_process";
import process from "node:process";

const npmCli = process.env.npm_execpath;

if (!npmCli) {
  throw new Error("Run this script through npm run dev.");
}

const children = new Set();
let stopping = false;
let exitCode = 0;

function stop(signal = "SIGTERM") {
  if (stopping) return;

  stopping = true;
  for (const child of children) child.kill(signal);
}

function start(script) {
  const child = spawn(process.execPath, [npmCli, "run", script], {
    stdio: "inherit",
  });
  children.add(child);

  child.on("error", (error) => {
    console.error(`Could not start ${script}: ${error.message}`);
    exitCode = 1;
    stop();
  });

  child.on("close", (code) => {
    children.delete(child);

    if (!stopping) {
      exitCode = code ?? 1;
      stop();
    }

    if (children.size === 0) process.exitCode = exitCode;
  });
}

process.on("SIGINT", () => {
  exitCode = 130;
  stop("SIGINT");
});

process.on("SIGTERM", () => {
  exitCode = 143;
  stop("SIGTERM");
});

start("dev:build");
start("dev:emulators");
