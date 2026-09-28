import { createApp } from "./app";

const app = createApp();
const requestedPort = process.env.PORT ? Number(process.env.PORT) : 0;
const server = Bun.serve({ fetch: app.fetch, port: requestedPort });

console.log(`kimaj-se running at http://localhost:${server.port}`);

if (!process.env.KIMAJ_SE_NO_OPEN) {
  const opener =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  Bun.spawn([opener, `http://localhost:${server.port}`]);
}
