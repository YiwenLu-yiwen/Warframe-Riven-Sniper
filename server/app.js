import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { health, listHits, listLiveWeapons, listStats } from "./domain.js";
import { fetchMarketHits, fetchMarketWeaponFamilies } from "./market.js";
import { createRiven, deleteRiven, listRivens } from "./store.js";

const root = resolve(".");
const htmlPath = join(root, "public", "index.html");

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function sendError(res, status, code, message) {
  sendJson(res, status, { error: { code, message } });
}

function sendNoContent(res) {
  res.writeHead(204);
  res.end();
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function contentType(pathname) {
  const ext = extname(pathname);
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

async function sendFile(res, pathname) {
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = pathname === "/" ? htmlPath : join(root, safePath);
  if (!filePath.startsWith(root)) return sendError(res, 403, "FORBIDDEN", "Path is outside the project.");
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return sendError(res, 404, "NOT_FOUND", "File not found.");
    res.writeHead(200, { "content-type": contentType(filePath) });
    createReadStream(filePath).pipe(res);
  } catch {
    sendError(res, 404, "NOT_FOUND", "File not found.");
  }
}

export async function handleRequest(req, res) {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/api/health" && req.method === "GET") return sendJson(res, 200, { data: await health() });

  if (url.pathname === "/api/weapons" && req.method === "GET") {
    return sendJson(res, 200, {
      data: await listLiveWeapons({
        lang: url.searchParams.get("lang") || "en",
        query: url.searchParams.get("query") || ""
      })
    });
  }

  if (url.pathname === "/api/stats" && req.method === "GET") {
    const weapon = url.searchParams.get("weapon") || "Rubico";
    const data = listStats({
      weapon,
      polarity: url.searchParams.get("polarity") || "positive",
      lang: url.searchParams.get("lang") || "en"
    });
    if (!data) return sendError(res, 404, "WEAPON_NOT_FOUND", `No Riven-capable weapon family named ${weapon}.`);
    return sendJson(res, 200, { data });
  }

  if (url.pathname === "/api/rivens" && req.method === "GET") return sendJson(res, 200, { data: listRivens() });

  if (url.pathname === "/api/rivens" && req.method === "POST") {
    try {
      const body = await readJson(req);
      return sendJson(res, 201, { data: createRiven(body) });
    } catch (error) {
      if (error.code === "VALIDATION_ERROR") return sendError(res, 422, "VALIDATION_ERROR", error.message);
      return sendError(res, 400, "INVALID_JSON", "Request body must be valid JSON.");
    }
  }

  const rivenDeleteMatch = url.pathname.match(/^\/api\/rivens\/([^/]+)$/);
  if (rivenDeleteMatch && req.method === "DELETE") {
    const deleted = deleteRiven(decodeURIComponent(rivenDeleteMatch[1]));
    if (!deleted) return sendError(res, 404, "RIVEN_NOT_FOUND", "Riven watch not found.");
    return sendNoContent(res);
  }

  if (url.pathname === "/api/hits" && req.method === "GET") {
    try {
      const result = await listHits({
        scope: url.searchParams.get("scope") || "online",
        rivenId: url.searchParams.get("rivenId") || undefined,
        force: url.searchParams.get("force") === "true"
      });
      return sendJson(res, 200, result);
    } catch (error) {
      return sendError(res, 502, "MARKET_UNAVAILABLE", error.message);
    }
  }

  if (url.pathname === "/api/market/hits" && req.method === "GET") {
    try {
      const data = await fetchMarketHits({
        weapon: url.searchParams.get("weapon") || "Rubico",
        scope: url.searchParams.get("scope") || "online",
        limit: url.searchParams.get("limit") || 50
      });
      return sendJson(res, 200, { data });
    } catch (error) {
      return sendError(res, 502, "MARKET_UNAVAILABLE", error.message);
    }
  }

  if (url.pathname === "/api/market/weapons" && req.method === "GET") {
    try {
      const data = await fetchMarketWeaponFamilies({
        scope: url.searchParams.get("scope") || "all",
        limit: url.searchParams.get("limit") || 500
      });
      return sendJson(res, 200, { data });
    } catch (error) {
      return sendError(res, 502, "MARKET_UNAVAILABLE", error.message);
    }
  }

  if (url.pathname.startsWith("/api/")) return sendError(res, 405, "METHOD_NOT_ALLOWED", "Method is not supported for this API endpoint.");

  if (req.method !== "GET") return sendError(res, 405, "METHOD_NOT_ALLOWED", "Only GET is supported for static files.");

  return sendFile(res, url.pathname);
}
