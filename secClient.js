import { config } from "./config.js";

const SEC_ARCHIVE = "https://www.sec.gov/Archives/edgar/data";
const SEC_DATA = "https://data.sec.gov";
const SEC_TICKERS =
  "https://www.sec.gov/files/company_tickers_exchange.json";

const cache = new Map();

function cacheKey(url) {
  return url.toLowerCase();
}

async function secFetch(url, as = "json") {
  const key = cacheKey(url);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < config.cacheTtlMs) {
    return cached.value;
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": config.secUserAgent,
      Accept: as === "json" ? "application/json" : "text/html,text/plain,*/*",
      "Accept-Encoding": "gzip, deflate"
    }
  });

  if (!response.ok) {
    throw new Error(`SEC request failed (${response.status}) for ${url}`);
  }

  const value = as === "json" ? await response.json() : await response.text();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export async function findCompanyByTicker(ticker) {
  const normalizedTicker = String(ticker || "").trim().toUpperCase();
  if (!normalizedTicker) throw new Error("Ticker is required.");

  const payload = await secFetch(SEC_TICKERS, "json");
  const fields = payload.fields || [];
  const rows = payload.data || [];
  const tickerIndex = fields.indexOf("ticker");
  const cikIndex = fields.indexOf("cik");
  const nameIndex = fields.indexOf("name");
  const exchangeIndex = fields.indexOf("exchange");

  const row = rows.find((item) => item[tickerIndex] === normalizedTicker);
  if (!row) throw new Error(`No SEC company match for ${normalizedTicker}.`);

  return {
    ticker: row[tickerIndex],
    cik: String(row[cikIndex]).padStart(10, "0"),
    name: row[nameIndex],
    exchange: row[exchangeIndex]
  };
}

export async function getRecentFilings(company, forms) {
  const submissions = await secFetch(
    `${SEC_DATA}/submissions/CIK${company.cik}.json`,
    "json"
  );
  const recent = submissions.filings?.recent;
  if (!recent) throw new Error("No recent filings found.");

  const wanted = new Set(forms.map((form) => form.toUpperCase()));
  const filings = [];

  for (let index = 0; index < recent.form.length; index += 1) {
    const form = recent.form[index];
    if (!wanted.has(form)) continue;

    const accession = recent.accessionNumber[index];
    const accessionNoDashes = accession.replaceAll("-", "");
    const primaryDoc = recent.primaryDocument[index];
    const cikNoLeadingZeros = String(Number(company.cik));
    const documentUrl = `${SEC_ARCHIVE}/${cikNoLeadingZeros}/${accessionNoDashes}/${primaryDoc}`;
    const filingDetailUrl = `${SEC_ARCHIVE}/${cikNoLeadingZeros}/${accessionNoDashes}/`;

    filings.push({
      form,
      accession,
      filingDate: recent.filingDate[index],
      reportDate: recent.reportDate[index],
      acceptanceDateTime: recent.acceptanceDateTime[index],
      primaryDocument: primaryDoc,
      description: recent.primaryDocDescription[index],
      documentUrl,
      filingDetailUrl
    });

    if (filings.length >= 12) break;
  }

  return filings;
}

export async function getFilingText(filing) {
  const raw = await secFetch(filing.documentUrl, "text");
  return normalizeFilingText(raw);
}

export function normalizeFilingText(raw) {
  return decodeHtmlEntities(String(raw || ""))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value) {
  const namedEntities = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\""
  };

  return value
    .replace(/&#(\d+);/g, (_, code) => {
      const point = Number(code);
      return Number.isFinite(point) ? String.fromCodePoint(point) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      const point = Number.parseInt(code, 16);
      return Number.isFinite(point) ? String.fromCodePoint(point) : _;
    })
    .replace(/&([a-z]+);/gi, (match, name) => namedEntities[name.toLowerCase()] || match);
}
