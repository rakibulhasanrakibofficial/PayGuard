import "dotenv/config";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../worker/index.js";

// One API implementation: the same code runs on Cloudflare Workers and here (Node, Render, local).
// This file only serves the static frontend and forwards /api/* to the Worker handler.
const app = express();
const root = path.dirname(fileURLToPath(import.meta.url));
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use("/api", rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: "draft-7", legacyHeaders: false }));
app.use("/api/scam", rateLimit({ windowMs: 60_000, limit: 12, standardHeaders: "draft-7", legacyHeaders: false }));
app.use("/api/invoices/draft", rateLimit({ windowMs: 60_000, limit: 12, standardHeaders: "draft-7", legacyHeaders: false }));
app.use(express.static(path.join(root, "../public")));

app.use("/api", express.text({ type: () => true, limit: "32kb" }), async (req, res, next) => {
  try {
    const self = `${req.protocol}://${req.get("host")}`;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (!["host", "connection", "content-length", "transfer-encoding"].includes(k)) headers.set(k, Array.isArray(v) ? v.join(",") : v);
    }
    const init = { method: req.method, headers };
    if (!["GET", "HEAD"].includes(req.method) && typeof req.body === "string" && req.body) {
      init.body = req.body;
      headers.set("content-length", String(Buffer.byteLength(req.body)));
    }
    const env = { ...process.env, ALLOWED_ORIGINS: [self, process.env.ALLOWED_ORIGINS].filter(Boolean).join(",") };
    const response = await worker.fetch(new Request(`${self}${req.originalUrl}`, init), env);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.send(await response.text());
  } catch (error) { next(error); }
});
app.use((req, res) => res.status(404).json({ error: "Route not found." }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Unexpected server error. Check server logs." });
});
export default app;
