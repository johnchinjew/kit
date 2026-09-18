import { rm } from "node:fs/promises";

await Promise.all(
  [ "dist", "elm-stuff" ].map((path) =>
    rm(path, { force: true, recursive: true })
  )
);
