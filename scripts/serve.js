// Local static server for dist/. Run: bun run dev  (add --lan to reach it from a phone)
// Note: browsers only enable the service worker (install/offline) on https or localhost.
import { networkInterfaces } from "node:os";
import { join, normalize } from "node:path";

const dist = join(import.meta.dir, "..", "dist");
const lan = process.argv.includes("--lan");
const portArg = process.argv.indexOf("--port");
const port = portArg > 0 ? Number(process.argv[portArg + 1]) : 37041;

const server = Bun.serve({
  hostname: lan ? "0.0.0.0" : "127.0.0.1",
  port,
  async fetch(req) {
    let path = decodeURIComponent(new URL(req.url).pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = Bun.file(join(dist, normalize(path).replace(/^(\.\.[/\\])+/, "")));
    return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 });
  },
});

console.log(`http://localhost:${server.port}/`);
if (lan) {
  for (const nets of Object.values(networkInterfaces()))
    for (const n of nets ?? []) if (n.family === "IPv4" && !n.internal) console.log(`http://${n.address}:${server.port}/`);
}
