const form = document.querySelector("#advisorForm");
const statusEl = document.querySelector("#status");
const briefEl = document.querySelector("#brief");
const tickerEl = document.querySelector("#ticker");
const questionEl = document.querySelector("#question");
const shareButton = document.querySelector("#shareButton");
const watchlistItems = document.querySelector("#watchlistItems");
const clearWatchlist = document.querySelector("#clearWatchlist");
const tickerSuggestions = document.querySelector("#tickerSuggestions");
const companyButtons = document.querySelector("#companyButtons");

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

function list(items) {
  if (!items || !items.length) return "<p>No major items found in the selected filings.</p>";
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderBrief(payload) {
  const parsed = payload.analysis.parsed || {};
  const company = payload.company;
  const modeLabel = payload.analysis.mode === "ai" ? "AI brief" : "Rules-based brief";

  briefEl.innerHTML = `
    <div>
      <div class="meta">
        <span class="pill">${escapeHtml(company.ticker)}</span>
        <span class="pill">${escapeHtml(company.exchange || "SEC registrant")}</span>
        <span class="pill">${modeLabel}</span>
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
  const ticker = tickerEl.value.trim().toUpperCase();
  if (!ticker) return;

  briefEl.classList.add("hidden");
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
  } catch (error) {
    setStatus(error.message, true);
  }
});

renderWatchlist();
renderPopularCompanies();
