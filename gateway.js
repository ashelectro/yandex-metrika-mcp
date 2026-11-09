import http from "node:http";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const PORT = Number(process.env.PORT || 10000);
const INNER = 3000;
const ACCESS = process.env.MCP_ACCESS_TOKEN || "";

if (!ACCESS) console.error("MCP_ACCESS_TOKEN не задан: все запросы будут отклонены");

const child = spawn(
  process.execPath,
  ["dist/index.js", "--http", `--port=${INNER}`],
  { stdio: "inherit", env: process.env }
);
child.on("exit", (code) => {
  console.error("Внутренний сервер остановился, код:", code);
  process.exit(1);
});

const sha = (s) => crypto.createHash("sha256").update(s).digest();
const allowed = (header) =>
  ACCESS !== "" &&
  crypto.timingSafeEqual(sha(header || ""), sha(`Bearer ${ACCESS}`));

http
  .createServer((req, res) => {
    if (!allowed(req.headers.authorization)) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end('{"error":"unauthorized"}');
      return;
    }
    const proxy = http.request(
      {
        host: "127.0.0.1",
        port: INNER,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${INNER}` },
      },
      (r) => {
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res);
      }
    );
    proxy.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end("bad gateway");
    });
    req.pipe(proxy);
  })
  .listen(PORT, "0.0.0.0");
