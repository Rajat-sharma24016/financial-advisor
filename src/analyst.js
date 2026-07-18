import { config } from "./config.js";

const POSITIVE_TERMS = [
  "increase",
  "growth",
  "record",
  "profit",
  "cash flow",
  "margin",
  "demand",
  "backlog",
  "authorization",
  "repurchase"
];

const RISK_TERMS = [
  "material weakness",
  "going concern",
  "impairment",
  "decline",
  "litigation",
  "subpoena",
  "investigation",
  "default",
  "restructuring",
  "cybersecurity",
  "restatement",
  "liquidity",
  "layoff"
];

function countTerms(text, terms) {
  const lower = text.toLowerCase();
  return terms.map((term) => ({
    term,
    count: (lower.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length
  })).filter((item) => item.count > 0);
}

function sentenceMatches(text, terms, limit = 8) {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => sentence.length > 70 && sentence.length < 450);
  const lowerTerms = terms.map((term) => term.toLowerCase());
  return sentences
    .filter((sentence) =>
      lowerTerms.some((term) => sentence.toLowerCase().includes(term))
    )
    .slice(0, limit);
}

function stanceFromSignals(risks, positives) {
  const riskScore = risks.reduce((sum, item) => sum + item.count, 0);
  const positiveScore = positives.reduce((sum, item) => sum + item.count, 0);
  if (riskScore > positiveScore * 1.4 && riskScore > 5) return "Cautious";
  if (positiveScore > riskScore * 1.4 && positiveScore > 5) return "Constructive, verify valuation";
  return "Neutral, needs deeper diligence";
}

export function buildContext(company, filings, filingTexts, question) {
  const joined = filingTexts
    .map((item) => `FORM ${item.filing.form} FILED ${item.filing.filingDate}\n${item.text.slice(0, 12000)}`)
    .join("\n\n---\n\n");
  const risks = countTerms(joined, RISK_TERMS);
  const positives = countTerms(joined, POSITIVE_TERMS);

  return {
    company,
    filings,
    question,
    risks,
    positives,
    riskSentences: sentenceMatches(joined, RISK_TERMS),
    positiveSentences: sentenceMatches(joined, POSITIVE_TERMS),
    stance: stanceFromSignals(risks, positives),
    excerpt: joined.slice(0, 28000)
  };
}

export async function analyzeFilings(context) {
  if (config.openAiApiKey) {
    try {
      return await analyzeWithOpenAI(context);
    } catch (error) {
      return {
        mode: "fallback",
        warning: `AI provider failed, so the rules-based analyst was used: ${error.message}`,
        ...rulesBasedAnalysis(context)
      };
    }
  }

  return {
    mode: "fallback",
    warning: "No OPENAI_API_KEY configured, so this is a rules-based research brief.",
    ...rulesBasedAnalysis(context)
  };
}

async function analyzeWithOpenAI(context) {
  const prompt = `You are a careful SEC-filings research analyst. You are not a registered financial adviser and must not provide personalized financial, legal, or tax advice.

Company: ${context.company.name} (${context.company.ticker})
User question: ${context.question || "Give me an investment research brief based on the filings."}
Forms reviewed: ${context.filings.map((f) => `${f.form} filed ${f.filingDate}`).join(", ")}

Use only the filing excerpts below. Be specific, cautious, and source-grounded.
Return JSON with keys: summary, stance, bullish_points, bearish_points, key_changes, watch_items, questions_for_diligence, suitability_warning.

Filing excerpts:
${context.excerpt}`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openAiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.openAiModel,
      input: prompt,
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const payload = await response.json();
  const text =
    payload.output_text ||
    payload.output?.flatMap((item) => item.content || [])
      .map((item) => item.text || "")
      .join("\n") ||
    "";

  return {
    mode: "ai",
    raw: text,
    parsed: parseJsonMaybe(text)
  };
}

function parseJsonMaybe(text) {
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  return null;
}

function rulesBasedAnalysis(context) {
  return {
    parsed: {
      summary: `${context.company.name} was reviewed using the latest selected SEC filings. The rules-based scan found ${context.risks.length} categories of risk language and ${context.positives.length} categories of constructive language.`,
      stance: context.stance,
      bullish_points: context.positiveSentences.slice(0, 4),
      bearish_points: context.riskSentences.slice(0, 4),
      key_changes: [
        "Compare the latest 10-Q against the last 10-K for revenue, margin, liquidity, debt, and segment trend changes.",
        "Review 8-K filings for management changes, financing, M&A, guidance updates, or legal events."
      ],
      watch_items: context.risks.slice(0, 8).map((item) => `${item.term}: ${item.count} mention(s)`),
      questions_for_diligence: [
        "Are the risks recurring or newly disclosed?",
        "Do cash flow and debt maturities support the company's plans?",
        "Does the current market valuation already price in the good news?",
        "What would make the thesis wrong over the next two quarters?"
      ],
      suitability_warning:
        "This is educational research from public filings, not personalized financial advice. Consider your objectives, time horizon, risk tolerance, and a licensed adviser before investing."
    },
    signals: {
      risks: context.risks,
      positives: context.positives
    }
  };
}
