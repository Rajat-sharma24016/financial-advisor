import { config } from "./config.js";

const POSITIVE_TERMS = [
  "increase",
  "revenue growth",
  "sales growth",
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

const BOILERPLATE_PATTERNS = [
  /emerging growth company/i,
  /large accelerated filer/i,
  /non-accelerated filer/i,
  /smaller reporting company/i,
  /shell company/i,
  /check mark/i,
  /registrant has elected/i,
  /section 13\(a\) of the exchange act/i,
  /cover page interactive data file/i
];

function countTerms(text, terms) {
  const lower = text.toLowerCase();
  return terms.map((term) => ({
    term,
    count: (lower.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length
  })).filter((item) => item.count > 0);
}

function sentenceMatches(text, terms, limit = 8, excludeTerms = []) {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map(cleanSentence)
    .filter((sentence) => sentence.length > 70 && sentence.length < 450)
    .filter((sentence) => !isBoilerplate(sentence));
  const lowerTerms = terms.map((term) => term.toLowerCase());
  const lowerExcludeTerms = excludeTerms.map((term) => term.toLowerCase());
  return uniqueItems(sentences
    .filter((sentence) =>
      lowerTerms.some((term) => sentence.toLowerCase().includes(term))
    )
    .filter((sentence) =>
      !lowerExcludeTerms.some((term) => sentence.toLowerCase().includes(term))
    )
  ).slice(0, limit);
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
  const analysisText = removeBoilerplate(joined);
  const risks = countTerms(analysisText, RISK_TERMS);
  const positives = countTerms(analysisText, POSITIVE_TERMS);

  return {
    company,
    filings,
    question,
    risks,
    positives,
    riskSentences: sentenceMatches(analysisText, RISK_TERMS),
    positiveSentences: sentenceMatches(analysisText, POSITIVE_TERMS, 8, RISK_TERMS),
    stance: stanceFromSignals(risks, positives),
    excerpt: analysisText.slice(0, 28000)
  };
}

export async function analyzeFilings(context) {
  if (config.groqApiKey) {
    try {
      return await analyzeWithGroq(context);
    } catch (error) {
      return {
        mode: "fallback",
        warning: `Groq provider failed, so the rules-based analyst was used: ${error.message}`,
        ...rulesBasedAnalysis(context)
      };
    }
  }

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

function buildAnalystPrompt(context) {
  return `You are a careful SEC-filings research analyst. You are not a registered financial adviser and must not provide personalized financial, legal, or tax advice.

Company: ${context.company.name} (${context.company.ticker})
User question: ${context.question || "Give me an investment research brief based on the filings."}
Forms reviewed: ${context.filings.map((f) => `${f.form} filed ${f.filingDate}`).join(", ")}

Use only the filing excerpts below. Be specific, cautious, and source-grounded.
Return JSON with keys: summary, stance, bullish_points, bearish_points, key_changes, watch_items, questions_for_diligence, suitability_warning.

Filing excerpts:
${context.excerpt}`;
}

async function analyzeWithGroq(context) {
  const prompt = buildAnalystPrompt(context);

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.groqApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.groqModel,
      messages: [
        {
          role: "system",
          content: "Return only valid JSON. Do not include markdown fences."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Groq request failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const payload = await response.json();
  const text = payload.choices?.[0]?.message?.content || "";

  return {
    mode: "ai",
    raw: text,
    parsed: parseJsonMaybe(text)
  };
}

async function analyzeWithOpenAI(context) {
  const prompt = buildAnalystPrompt(context);

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
  const bullishPoints = context.positiveSentences.slice(0, 4);
  const bearishPoints = context.riskSentences.slice(0, 4);

  return {
    parsed: {
      summary: `${context.company.name} was reviewed using the latest selected SEC filings. The rules-based scan found ${context.risks.length} categories of risk language and ${context.positives.length} categories of constructive language.`,
      stance: context.stance,
      bullish_points: bullishPoints.length ? bullishPoints : [
        "No clear bullish filing sentence was found by the rules-based scan. Open the source filings below to review revenue, margins, cash flow, and management discussion directly."
      ],
      bearish_points: bearishPoints.length ? bearishPoints : [
        "No clear bearish filing sentence was found by the rules-based scan. Still review risk factors, liquidity, debt, litigation, and recent 8-K events before making decisions."
      ],
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

function cleanSentence(sentence) {
  return sentence
    .replace(/[☐☑☒]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBoilerplate(sentence) {
  return BOILERPLATE_PATTERNS.some((pattern) => pattern.test(sentence));
}

function removeBoilerplate(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(cleanSentence)
    .filter((sentence) => sentence && !isBoilerplate(sentence))
    .join(" ");
}

function uniqueItems(items) {
  return [...new Set(items)];
}
