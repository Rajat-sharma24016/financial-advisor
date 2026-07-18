const form = document.querySelector("#advisorForm");
const statusEl = document.querySelector("#status");
const briefEl = document.querySelector("#brief");
const tickerEl = document.querySelector("#ticker");
const questionEl = document.querySelector("#question");
const submitButton = form.querySelector("button[type=submit]");
const shareButton = document.querySelector("#shareButton");
const watchlistItems = document.querySelector("#watchlistItems");
const clearWatchlist = document.querySelector("#clearWatchlist");
const tickerSuggestions = document.querySelector("#tickerSuggestions");
const companyButtons = document.querySelector("#companyButtons");
const cooldownStorageKey = "filingAdvisorCooldownUntil";
let cooldownTimer = null;
let configuredCooldownSeconds = 30;

const popularCompanies = [
  { ticker: "AAPL", name: "Apple" },
  { ticker: "MSFT", name: "Microsoft" },
  { ticker: "NVDA", name: "Nvidia" },
  { ticker: "TSLA", name: "Tesla" },
  { ticker: "AMZN", name: "Amazon" },
  { ticker: "GOOGL", name: "Alphabet / Google" },
  { ticker: "META", name: "Meta Platforms" },
  { ticker: "NFLX", name: "Netflix" },
  { ticker: "JPM", name: "JPMorgan Chase" },
  { ticker: "WMT", name: "Walmart" },
  { ticker: "DIS", name: "Disney" },
  { ticker: "AMD", name: "Advanced Micro Devices" },
  { ticker: "INTC", name: "Intel" },
  { ticker: "ORCL", name: "Oracle" },
  { ticker: "UBER", name: "Uber" }
];

const params = new URLSearchParams(window.location.search);
if (params.get("ticker")) tickerEl.value = params.get("ticker");
if (params.get("q")) questionEl.value = params.get("q");
if (params.get("forms")) {
  const selected = new Set(params.get("forms").split(","));
  document.querySelectorAll("input[name=forms]").forEach((input) => {
    input.checked = selected.has(input.value);
  });
}

function getForms() {
  return [...document.querySelectorAll("input[name=forms]:checked")].map(
    (input) => input.value
  );
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("warning", isError);
}

function getCooldownRemainingSeconds() {
  const until = Number(localStorage.getItem(cooldownStorageKey) || 0);
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

function updateCooldownButton() {
  const remaining = getCooldownRemainingSeconds();
  if (remaining > 0) {
    submitButton.disabled = true;
    submitButton.textContent = `Wait ${remaining}s`;
    setStatus(`Groq cooldown: try again in ${remaining} second${remaining === 1 ? "" : "s"}.`);
    return;
  }

  if (cooldownTimer) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
  }
  submitButton.disabled = false;
  submitButton.textContent = "Analyze filings";
}

function startCooldown(seconds) {
  const duration = Number(seconds || 0);
  if (duration <= 0) return;
  localStorage.setItem(cooldownStorageKey, String(Date.now() + duration * 1000));
  if (cooldownTimer) clearInterval(cooldownTimer);
  cooldownTimer = setInterval(updateCooldownButton, 1000);
  updateCooldownButton();
}

async function loadRuntimeSettings() {
  try {
    const response = await fetch("/api/health");
    if (!response.ok) return;
    const settings = await response.json();
    configuredCooldownSeconds = Number(settings.groqCooldownSeconds || configuredCooldownSeconds);
  } catch {
    configuredCooldownSeconds = 30;
  }
}

function list(items) {
  const cleanItems = (items || []).filter((item) => !isDisplayBoilerplate(item));
  if (!cleanItems.length) return "<p>No major items found in the selected filings.</p>";
  return `<ul>${cleanItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function escapeHtml(value) {
  return decodeHtmlEntities(String(value))
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
    .replace(/&#(\d+);/g, (match, code) => {
      const point = Number(code);
      return Number.isFinite(point) ? String.fromCodePoint(point) : match;
    })
    .replace(/&#x([0-9a-f]+);/gi, (match, code) => {
      const point = Number.parseInt(code, 16);
      return Number.isFinite(point) ? String.fromCodePoint(point) : match;
    })
    .replace(/&([a-z]+);/gi, (match, name) => namedEntities[name.toLowerCase()] || match);
}

function isDisplayBoilerplate(value) {
  const text = decodeHtmlEntities(String(value)).toLowerCase();
  return [
    "emerging growth company",
    "large accelerated filer",
    "non-accelerated filer",
    "smaller reporting company",
    "registrant has elected",
    "section 13(a) of the exchange act"
  ].some((pattern) => text.includes(pattern));
}

function renderBrief(payload) {
  const parsed = payload.analysis.parsed || {};
  const company = payload.company;

  briefEl.innerHTML = `
    <div>
      <div class="meta">
        <span class="pill">${escapeHtml(company.ticker)}</span>
        <span class="pill">${escapeHtml(company.exchange || "SEC registrant")}</span>
        <span class="pill">${new Date(payload.generatedAt).toLocaleString()}</span>
      </div>
      <h2>${escapeHtml(company.name)}</h2>
    </div>

    <section class="stance">
      <strong>Research stance:</strong> ${escapeHtml(parsed.stance || "Needs deeper diligence")}
      <p>${escapeHtml(parsed.summary || payload.analysis.raw || "No summary returned.")}</p>
    </section>

    <div class="gridTwo">
      <section class="box">
        <h3>Bullish signals</h3>
        ${list(parsed.bullish_points)}
      </section>
      <section class="box">
        <h3>Bearish signals</h3>
        ${list(parsed.bearish_points)}
      </section>
    </div>

    <div class="gridTwo">
      <section class="box">
        <h3>Key changes</h3>
        ${list(parsed.key_changes)}
      </section>
      <section class="box">
        <h3>Watch items</h3>
        ${list(parsed.watch_items)}
      </section>
    </div>

    <section class="box">
      <h3>Questions for diligence</h3>
      ${list(parsed.questions_for_diligence)}
    </section>

    <section class="box">
      <h3>Source filings</h3>
      <div class="links">
        ${payload.filings
          .map(
            (filing) =>
              `<a href="${filing.documentUrl}" target="_blank" rel="noreferrer">${escapeHtml(filing.form)} filed ${escapeHtml(filing.filingDate)}: ${escapeHtml(filing.description || filing.primaryDocument)}</a>`
          )
          .join("")}
      </div>
    </section>

    <p class="warning">${escapeHtml(parsed.suitability_warning || payload.disclaimer)}</p>
  `;
  briefEl.classList.remove("hidden");
}

function getWatchlist() {
  return JSON.parse(localStorage.getItem("filingAdvisorWatchlist") || "[]");
}

function saveWatchlist(items) {
  localStorage.setItem("filingAdvisorWatchlist", JSON.stringify([...new Set(items)].slice(0, 30)));
  renderWatchlist();
}

function renderWatchlist() {
  const items = getWatchlist();
  watchlistItems.innerHTML = items.length
    ? items
        .map((ticker) => `<button type="button" class="watchItem" data-ticker="${escapeHtml(ticker)}">${escapeHtml(ticker)}</button>`)
        .join("")
    : "<span class='pill'>No tickers yet</span>";
}

function renderPopularCompanies() {
  tickerSuggestions.innerHTML = popularCompanies
    .map((company) => `<option value="${company.ticker}">${escapeHtml(company.name)}</option>`)
    .join("");

  companyButtons.innerHTML = popularCompanies
    .map(
      (company) => `
        <button type="button" class="companyButton" data-ticker="${company.ticker}">
          <span class="companyTicker">${company.ticker}</span>
          <span class="companyName">${escapeHtml(company.name)}</span>
        </button>
      `
    )
    .join("");
}

companyButtons.addEventListener("click", (event) => {
  const button = event.target.closest("[data-ticker]");
  if (!button) return;
  tickerEl.value = button.dataset.ticker;
  tickerEl.focus();
});

watchlistItems.addEventListener("click", (event) => {
  const button = event.target.closest("[data-ticker]");
  if (!button) return;
  tickerEl.value = button.dataset.ticker;
  form.requestSubmit();
});

clearWatchlist.addEventListener("click", () => saveWatchlist([]));

shareButton.addEventListener("click", async () => {
  const url = new URL(window.location.href);
  url.searchParams.set("ticker", tickerEl.value.trim().toUpperCase());
  url.searchParams.set("forms", getForms().join(","));
  if (questionEl.value.trim()) url.searchParams.set("q", questionEl.value.trim());
  await navigator.clipboard.writeText(url.toString());
  setStatus("Share link copied.");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (getCooldownRemainingSeconds() > 0) {
    updateCooldownButton();
    return;
  }
  const ticker = tickerEl.value.trim().toUpperCase();
  if (!ticker) return;

  briefEl.classList.add("hidden");
  submitButton.disabled = true;
  submitButton.textContent = "Analyzing...";
  setStatus(`Pulling SEC filings for ${ticker}...`);

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker,
        forms: getForms(),
        question: questionEl.value.trim()
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Analysis failed.");

    setStatus("Analysis complete.");
    renderBrief(payload);
    saveWatchlist([ticker, ...getWatchlist()]);
    startCooldown(payload.cooldownSeconds);
  } catch (error) {
    const message = String(error.message || "");
    if (message.includes("Groq") || message.includes("rate limit")) {
      startCooldown(configuredCooldownSeconds);
    }
    setStatus(error.message, true);
  } finally {
    updateCooldownButton();
  }
});

await loadRuntimeSettings();
renderWatchlist();
renderPopularCompanies();
updateCooldownButton();
