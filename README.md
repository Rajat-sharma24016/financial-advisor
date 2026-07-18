# Filing Advisor Agent

A publishable web app that pulls SEC EDGAR 8-K, 10-K, and 10-Q filings, extracts useful text, and produces an investor research brief with risk factors, catalysts, filing links, questions to investigate, and a cautious stance.

Important: this is an educational research assistant, not a registered financial adviser. Do not market it as personalized investment, tax, legal, or fiduciary advice unless you add the required compliance controls and licensing.

## Features

- Ticker search through SEC company ticker data.
- Pulls latest 8-K, 10-K, and 10-Q filings directly from SEC EDGAR.
- Opens original filing links for verification.
- Extracts text from filing HTML/TXT documents server-side.
- AI research brief when `GROQ_API_KEY` or `OPENAI_API_KEY` is configured.
- Deterministic fallback analysis when no AI key is present.
- Watchlist stored locally in the browser.
- Sharable research links with ticker, forms, and question encoded in the URL.
- Compliance-minded output: no guaranteed returns, no aggressive buy/sell claims, and source links included.

## Local Run

```bash
cp .env.example .env
npm start
```

Open `http://localhost:8080`.

If deploying without an AI key, the app still works with the rules-based analyst.

## Environment Variables

| Name | Required | Purpose |
| --- | --- | --- |
| `SEC_USER_AGENT` | Yes | SEC-compliant app identity and contact string. |
| `PORT` | No | Server port. Defaults to `8080`. |
| `GROQ_API_KEY` | No | Enables Groq-powered research briefs. |
| `GROQ_MODEL` | No | Groq model name. Defaults to `llama-3.1-8b-instant`. |
| `OPENAI_API_KEY` | No | Enables LLM-generated research briefs. |
| `OPENAI_MODEL` | No | Model name. Defaults to `gpt-4.1-mini`. |

## Deploy

### Render

1. Push this folder to GitHub.
2. Create a new Render Web Service.
3. Build command: leave blank or use `npm install`.
4. Start command: `npm start`.
5. Add `SEC_USER_AGENT` and optional `GROQ_API_KEY` or `OPENAI_API_KEY`.

### Railway

1. Create a new Railway project from GitHub.
2. Set start command to `npm start` if Railway does not detect it.
3. Add environment variables.

### Fly.io

```bash
fly launch
fly secrets set SEC_USER_AGENT="FilingAdvisorAgent/1.0 you@example.com"
fly secrets set OPENAI_API_KEY="sk-..."
fly deploy
```

## Compliance Notes

For a production product, add account-level terms acceptance, audit logs, suitability questionnaires if you personalize outputs, model-output review, rate limiting, and jurisdiction-specific legal review. Keep source citations visible and make it clear that users should verify filings themselves.
