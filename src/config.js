export const config = {
  port: Number(process.env.PORT || 8080),
  secUserAgent:
    process.env.SEC_USER_AGENT ||
    "FilingAdvisorAgent/1.0 contact@example.com",
  openAiApiKey: process.env.OPENAI_API_KEY || "",
  openAiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  cacheTtlMs: 1000 * 60 * 20
};
