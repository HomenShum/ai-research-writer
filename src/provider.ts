/**
 * BYOK LLM provider using raw fetch() — zero npm dependencies.
 *
 * Provider priority: Gemini -> OpenAI -> Anthropic
 * Set one of: GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY
 */

export interface LLMResponse {
  text: string;
  provider: string;
  model: string;
}

interface ProviderConfig {
  name: string;
  model: string;
  envKey: string;
  altEnvKey?: string;
  call: (apiKey: string, systemPrompt: string, userText: string) => Promise<string>;
}

// ---------------------------------------------------------------------------
// Gemini (Google Generative AI)
// ---------------------------------------------------------------------------

async function callGemini(
  apiKey: string,
  systemPrompt: string,
  userText: string,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const body = {
    system_instruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: userText }],
      },
    ],
    generationConfig: {
      maxOutputTokens: 4096,
      temperature: 0.3,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  if (!candidate?.content?.parts?.[0]?.text) {
    throw new Error(`Gemini returned no content: ${JSON.stringify(data)}`);
  }

  return candidate.content.parts[0].text;
}

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

async function callOpenAI(
  apiKey: string,
  systemPrompt: string,
  userText: string,
): Promise<string> {
  const url = "https://api.openai.com/v1/chat/completions";

  const body = {
    model: "gpt-4o-mini",
    max_tokens: 4096,
    temperature: 0.3,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText },
    ],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`OpenAI returned no content: ${JSON.stringify(data)}`);
  }

  return content;
}

// ---------------------------------------------------------------------------
// Anthropic
// ---------------------------------------------------------------------------

async function callAnthropic(
  apiKey: string,
  systemPrompt: string,
  userText: string,
): Promise<string> {
  const url = "https://api.anthropic.com/v1/messages";

  const body = {
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userText }],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const block = data?.content?.[0];
  if (!block?.text) {
    throw new Error(`Anthropic returned no content: ${JSON.stringify(data)}`);
  }

  return block.text;
}

// ---------------------------------------------------------------------------
// Provider Registry (Gemini -> OpenAI -> Anthropic)
// ---------------------------------------------------------------------------

const PROVIDERS: ProviderConfig[] = [
  {
    name: "gemini",
    model: "gemini-2.0-flash",
    envKey: "GEMINI_API_KEY",
    altEnvKey: "GOOGLE_AI_API_KEY",
    call: callGemini,
  },
  {
    name: "openai",
    model: "gpt-4o-mini",
    envKey: "OPENAI_API_KEY",
    call: callOpenAI,
  },
  {
    name: "anthropic",
    model: "claude-haiku-4-5-20251001",
    envKey: "ANTHROPIC_API_KEY",
    call: callAnthropic,
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect which provider name would be used, without making any API calls.
 * Returns null if no API key is configured.
 */
export function detectProviderName(): string | null {
  for (const p of PROVIDERS) {
    const key = process.env[p.envKey] || (p.altEnvKey ? process.env[p.altEnvKey] : undefined);
    if (key) return p.name;
  }
  return null;
}

/**
 * Detect the model that would be used.
 */
export function detectProviderModel(): string | null {
  for (const p of PROVIDERS) {
    const key = process.env[p.envKey] || (p.altEnvKey ? process.env[p.altEnvKey] : undefined);
    if (key) return p.model;
  }
  return null;
}

/**
 * Call the first available LLM provider with the given prompts.
 * Throws if no provider is configured.
 */
export async function callLlm(
  systemPrompt: string,
  userText: string,
): Promise<LLMResponse> {
  for (const p of PROVIDERS) {
    const apiKey = process.env[p.envKey] || (p.altEnvKey ? process.env[p.altEnvKey] : undefined);
    if (!apiKey) continue;

    const text = await p.call(apiKey, systemPrompt, userText);
    return { text, provider: p.name, model: p.model };
  }

  throw new Error(
    `No LLM provider available. Set one of these environment variables:\n` +
      `  GEMINI_API_KEY     (uses gemini-2.0-flash) - free tier available\n` +
      `  OPENAI_API_KEY     (uses gpt-4o-mini)\n` +
      `  ANTHROPIC_API_KEY  (uses claude-haiku-4-5-20251001)\n` +
      `  GOOGLE_AI_API_KEY  (alias for Gemini)\n\n` +
      `Get a free API key:\n` +
      `  Gemini:    https://aistudio.google.com/apikey\n` +
      `  OpenAI:    https://platform.openai.com/api-keys\n` +
      `  Anthropic: https://console.anthropic.com/`,
  );
}
