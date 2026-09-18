import { cp, mkdir, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

await cp("public", "dist", { recursive: true });

execFileSync(
  "npx",
  ["elm", "make", "src/Main.elm", "--optimize", "--output=dist/elm.js"],
  { stdio: "inherit" }
);

execFileSync(
  "npx",
  ["@tailwindcss/cli", "-i", "src/styles.css", "-o", "dist/styles.css", "--minify"],
  { stdio: "inherit" }
);
