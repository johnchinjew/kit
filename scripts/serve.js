import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = await realpath(fileURLToPath(new URL("../dist/", import.meta.url)));
const port = Number(process.env.PORT ?? 8000);
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const server = createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  const reply = (status, message) => {
    response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(request.method === "HEAD" ? undefined : message);
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    reply(405, "Method not allowed");
    return;
  }

  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (pathname.includes("\0")) throw new URIError("Invalid path");
    const path = await realpath(resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`));
    if (!path.startsWith(root + sep)) {
      reply(403, "Forbidden");
      return;
    }
    const body = await readFile(path);
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(path)] ?? "application/octet-stream",
      "Content-Length": body.length,
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    if (error instanceof URIError) {
      reply(400, "Bad request");
    } else if (["ENOENT", "ENOTDIR", "EISDIR"].includes(error.code)) {
      reply(404, "Not found");
    } else {
      console.error(error);
      reply(500, "Internal server error");
    }
  }
});

server.on("error", (error) => {
  console.error(`Server failed: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Listening: http://localhost:${server.address().port}`);
});
