import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import {
  findCompanyByTicker,
  getFilingText,
  getRecentFilings
} from "./secClient.js";
import { analyzeFilings, buildContext } from "./analyst.js";

const root = normalize(join(fileURLToPath(new URL(".", import.meta.url)), ".."));
const publicDir = join(root, "public");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body ? JSON.parse(body) : {}));
    req.on("error", reject);
  });
}

async function handleApi(req, res) {
  if (req.method === "GET" && req.url === "/api/health") {
    return json(res, 200, {
      ok: true,
      aiProvider: config.groqApiKey ? "groq" : config.openAiApiKey ? "openai" : "rules",
      groqConfigured: Boolean(config.groqApiKey),
      openAiConfigured: Boolean(config.openAiApiKey),
      groqModel: config.groqModel,
      groqCooldownSeconds: config.groqCooldownSeconds,
      openAiModel: config.openAiModel
    });
  }

  if (req.method === "GET" && req.url.startsWith("/api/company")) {
    const url = new URL(req.url, "http://localhost");
    const company = await findCompanyByTicker(url.searchParams.get("ticker"));
    return json(res, 200, { company });
  }

  if (req.method === "POST" && req.url === "/api/analyze") {
    const body = await readBody(req);
    const ticker = String(body.ticker || "").trim().toUpperCase();
    const forms = Array.isArray(body.forms) && body.forms.length
      ? body.forms.map((form) => String(form).toUpperCase())
      : ["10-K", "10-Q", "8-K"];
    const question = String(body.question || "").slice(0, 700);

    const company = await findCompanyByTicker(ticker);
    const filings = await getRecentFilings(company, forms);
    if (!filings.length) {
      return json(res, 404, { error: "No matching recent filings found." });
    }

    const selected = filings.slice(0, 3);
    const filingTexts = await Promise.all(
      selected.map(async (filing) => ({
        filing,
        text: await getFilingText(filing)
      }))
    );
    const context = buildContext(company, selected, filingTexts, question);
    const analysis = await analyzeFilings(context);

    return json(res, 200, {
      company,
      filings: selected,
      analysis,
      cooldownSeconds: config.groqApiKey ? config.groqCooldownSeconds : 0,
      generatedAt: new Date().toISOString(),
      disclaimer:
        "Educational research only. Not personalized investment, tax, legal, or fiduciary advice."
    });
  }

  return json(res, 404, { error: "API route not found." });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(join(publicDir, requested));

  if (!safePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(safePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[extname(safePath)] || "application/octet-stream"
    });
    res.end(file);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) {
      await handleApi(req, res);
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    json(res, 500, { error: error.message || "Unexpected server error." });
  }
});

server.listen(config.port, () => {
  console.log(`Filing Advisor Agent running on http://localhost:${config.port}`);
});
