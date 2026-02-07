import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

// Dynamic import of the compiled modules
const mod = await import("../../dist/index.js");
const {
  analyzePaper,
  detectAiPatterns,
  detectProviderName,
  detectProviderModel,
  callLlm,
  PROMPTS,
} = mod;

// ============================================================================
// Original regex analysis tests (preserved from v1.0.0)
// ============================================================================

describe("analyzePaper", () => {
  it("should return a valid result structure", () => {
    const result = analyzePaper("This is a test.");
    assert.ok(typeof result.overallScore === "number");
    assert.ok(typeof result.totalIssues === "number");
    assert.ok(Array.isArray(result.issues));
    assert.ok(Array.isArray(result.sections));
    assert.ok(typeof result.summary === "string");
  });

  it("should detect passive voice", () => {
    const result = analyzePaper("The experiment was conducted by the team.", { checks: ["grammar"] });
    const passive = result.issues.filter((i) => i.message.includes("Passive voice"));
    assert.ok(passive.length > 0, "Should detect passive voice");
  });

  it("should detect contractions", () => {
    const result = analyzePaper("We can't use this method because it doesn't work.", { checks: ["tone"] });
    const contractions = result.issues.filter((i) => i.message.includes("Contraction"));
    assert.ok(contractions.length >= 2, `Expected >=2 contractions, got ${contractions.length}`);
  });

  it("should detect hedging language", () => {
    const result = analyzePaper("Perhaps this approach is somewhat better.", { checks: ["tone"] });
    const hedging = result.issues.filter((i) => i.message.includes("Hedging"));
    assert.ok(hedging.length >= 1, "Should detect hedging");
  });

  it("should detect informal language", () => {
    const result = analyzePaper("There are a lot of things that basically work.", { checks: ["tone"] });
    const informal = result.issues.filter((i) => i.message.includes("Informal"));
    assert.ok(informal.length >= 1, "Should detect informal language");
  });

  it("should detect mixed citation styles", () => {
    const text = "As shown by Smith (2023) and confirmed in [1], the results (Johnson & Lee, 2022) are clear.";
    const result = analyzePaper(text, { checks: ["citations"] });
    const mixed = result.issues.filter((i) => i.message.includes("Mixed citation"));
    assert.ok(mixed.length > 0, "Should detect mixed citations");
  });

  it("should detect sections", () => {
    const text = "# Introduction\nSome text here.\n\n# Methods\nMore text here.\n\n# Results\nFinal text.";
    const result = analyzePaper(text, { checks: ["structure"] });
    assert.ok(result.sections.length >= 2, `Expected >=2 sections, got ${result.sections.length}`);
  });

  it("should score clean text highly", () => {
    const text = "The model achieves state-of-the-art performance on three benchmarks. We evaluate using standard metrics.";
    const result = analyzePaper(text);
    assert.ok(result.overallScore >= 80, `Expected score >=80, got ${result.overallScore}`);
  });

  it("should score messy text lower", () => {
    const text = "We can't really do this stuff because it's basically a lot of things that don't work. Perhaps it's somewhat okay.";
    const result = analyzePaper(text);
    assert.ok(result.overallScore < 80, `Expected score <80, got ${result.overallScore}`);
  });

  it("should respect check filters", () => {
    const text = "We can't do this. The experiment was conducted.";
    const toneOnly = analyzePaper(text, { checks: ["tone"] });
    const grammarOnly = analyzePaper(text, { checks: ["grammar"] });
    const toneIssues = toneOnly.issues.filter((i) => i.check === "tone");
    const grammarIssues = grammarOnly.issues.filter((i) => i.check === "grammar");
    assert.ok(toneIssues.length > 0);
    assert.ok(grammarIssues.length > 0);
    assert.equal(toneOnly.issues.filter((i) => i.check === "grammar").length, 0);
    assert.equal(grammarOnly.issues.filter((i) => i.check === "tone").length, 0);
  });
});

// ============================================================================
// Provider detection tests (Gemini -> OpenAI -> Anthropic priority)
// ============================================================================

describe("detectProviderName", () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Clear all provider keys
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  it("should return null when no API keys are set", () => {
    const provider = detectProviderName();
    assert.equal(provider, null);
  });

  it("should prefer gemini when all keys are set (Gemini -> OpenAI -> Anthropic)", () => {
    process.env.GEMINI_API_KEY = "AIza-test";
    process.env.OPENAI_API_KEY = "sk-test-456";
    process.env.ANTHROPIC_API_KEY = "sk-test-123";
    const provider = detectProviderName();
    assert.equal(provider, "gemini");
  });

  it("should fall back to openai when only OPENAI_API_KEY is set", () => {
    process.env.OPENAI_API_KEY = "sk-test-456";
    const provider = detectProviderName();
    assert.equal(provider, "openai");
  });

  it("should fall back to anthropic when only ANTHROPIC_API_KEY is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-123";
    const provider = detectProviderName();
    assert.equal(provider, "anthropic");
  });

  it("should detect Gemini via GOOGLE_AI_API_KEY alias", () => {
    process.env.GOOGLE_AI_API_KEY = "AIza-test";
    const provider = detectProviderName();
    assert.equal(provider, "gemini");
  });

  it("should prefer openai over anthropic", () => {
    process.env.OPENAI_API_KEY = "sk-test-456";
    process.env.ANTHROPIC_API_KEY = "sk-test-123";
    const provider = detectProviderName();
    assert.equal(provider, "openai");
  });
});

describe("detectProviderModel", () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return null when no keys set", () => {
    assert.equal(detectProviderModel(), null);
  });

  it("should return gemini-2.0-flash for Gemini", () => {
    process.env.GEMINI_API_KEY = "test";
    assert.equal(detectProviderModel(), "gemini-2.0-flash");
  });

  it("should return gpt-4o-mini for OpenAI", () => {
    process.env.OPENAI_API_KEY = "test";
    assert.equal(detectProviderModel(), "gpt-4o-mini");
  });

  it("should return claude-haiku-4-5-20251001 for Anthropic", () => {
    process.env.ANTHROPIC_API_KEY = "test";
    assert.equal(detectProviderModel(), "claude-haiku-4-5-20251001");
  });
});

// ============================================================================
// Prompt template validation tests
// ============================================================================

describe("PROMPTS", () => {
  it("should have exactly 8 prompt templates", () => {
    const keys = Object.keys(PROMPTS);
    assert.equal(keys.length, 8, `Expected 8 prompts, got ${keys.length}: ${keys.join(", ")}`);
  });

  it("should include all expected commands", () => {
    const expected = ["polish", "translate", "compress", "expand", "de-ai", "check-logic", "caption", "review"];
    for (const cmd of expected) {
      assert.ok(PROMPTS[cmd], `Missing prompt template for command: ${cmd}`);
    }
  });

  it("every prompt should have required fields", () => {
    for (const [key, prompt] of Object.entries(PROMPTS)) {
      assert.ok(prompt.name, `${key} missing name`);
      assert.ok(prompt.command, `${key} missing command`);
      assert.ok(prompt.description, `${key} missing description`);
      assert.ok(prompt.systemPrompt, `${key} missing systemPrompt`);
      assert.ok(prompt.systemPrompt.length > 100, `${key} systemPrompt too short (${prompt.systemPrompt.length} chars)`);
      assert.ok(Array.isArray(prompt.requiredFields), `${key} missing requiredFields`);
      assert.ok(Array.isArray(prompt.optionalFields), `${key} missing optionalFields`);
      assert.ok(prompt.example, `${key} missing example`);
    }
  });

  it("polish prompt should mention LaTeX preservation and contractions", () => {
    const p = PROMPTS.polish;
    assert.ok(p.systemPrompt.includes("\\cite{}"), "Polish should mention \\cite{}");
    assert.ok(p.systemPrompt.includes("contraction"), "Polish should mention contractions");
    assert.ok(p.systemPrompt.includes("Modification Log"), "Polish should have Modification Log");
  });

  it("translate prompt should handle en<->zh", () => {
    const p = PROMPTS.translate;
    assert.ok(p.systemPrompt.includes("Chinese"), "Translate should mention Chinese");
    assert.ok(p.systemPrompt.includes("English"), "Translate should mention English");
    assert.ok(p.systemPrompt.includes("Back-translate"), "Translate should mention back-translation verification");
  });

  it("de-ai prompt should list specific AI words and connectors", () => {
    const deai = PROMPTS["de-ai"].systemPrompt;
    assert.ok(deai.includes("leverage"), "Should list 'leverage'");
    assert.ok(deai.includes("delve"), "Should list 'delve'");
    assert.ok(deai.includes("tapestry"), "Should list 'tapestry'");
    assert.ok(deai.includes("utilize"), "Should list 'utilize'");
    assert.ok(deai.includes("multifaceted"), "Should list 'multifaceted'");
    assert.ok(deai.includes("comprehensive"), "Should list 'comprehensive'");
    assert.ok(deai.includes("Furthermore"), "Should list 'Furthermore'");
    assert.ok(deai.includes("Moreover"), "Should list 'Moreover'");
    assert.ok(deai.includes("Additionally"), "Should list 'Additionally'");
    assert.ok(deai.includes("It is worth noting"), "Should list 'It is worth noting'");
    assert.ok(deai.includes("In the realm of"), "Should list 'In the realm of'");
    assert.ok(deai.includes("not an exhaustive list"), "Should list 'not an exhaustive list'");
  });

  it("check-logic prompt should check for contradictions and return JSON", () => {
    const p = PROMPTS["check-logic"];
    assert.ok(p.systemPrompt.includes("CONTRADICTIONS"), "Should check contradictions");
    assert.ok(p.systemPrompt.includes("TERMINOLOGY"), "Should check terminology");
    assert.ok(p.systemPrompt.includes("LOGICAL GAPS"), "Should check logical gaps");
    assert.ok(p.systemPrompt.includes("JSON"), "Should output JSON");
  });

  it("caption prompt should handle figures and tables with JSON output", () => {
    const p = PROMPTS.caption;
    assert.ok(p.systemPrompt.includes("figure"), "Should mention figure");
    assert.ok(p.systemPrompt.includes("table"), "Should mention table");
    assert.ok(p.systemPrompt.includes("shortCaption"), "Should include shortCaption");
    assert.ok(p.systemPrompt.includes("longCaption"), "Should include longCaption");
    assert.ok(p.systemPrompt.includes("\\\\caption"), "Should include LaTeX \\caption");
  });

  it("review prompt should simulate harsh peer review", () => {
    const rev = PROMPTS.review.systemPrompt;
    assert.ok(rev.includes("rejection"), "Review should mention rejection mindset");
    assert.ok(rev.includes("NOVELTY"), "Review should check novelty");
    assert.ok(rev.includes("SOUNDNESS"), "Review should check soundness");
    assert.ok(rev.includes("CLARITY"), "Review should check clarity");
    assert.ok(rev.includes("SIGNIFICANCE"), "Review should check significance");
    assert.ok(rev.includes("Rating: X/10"), "Review should include rating format");
    assert.ok(rev.includes("Strengths"), "Review should include Strengths section");
    assert.ok(rev.includes("Weaknesses"), "Review should include Weaknesses section");
    assert.ok(rev.includes("Strategic Advice"), "Review should include Strategic Advice");
  });

  it("compress prompt should include reduction strategies", () => {
    const p = PROMPTS.compress;
    assert.ok(p.systemPrompt.includes("in order to"), "Should list verbose patterns");
    assert.ok(p.systemPrompt.includes("Compression Stats"), "Should output compression stats");
  });

  it("expand prompt should warn against padding", () => {
    const p = PROMPTS.expand;
    assert.ok(p.systemPrompt.includes("not padding"), "Should warn against padding");
    assert.ok(p.systemPrompt.includes("Expansion Log"), "Should include expansion log");
  });
});

// ============================================================================
// AI pattern detection tests (deterministic de-ai regex)
// ============================================================================

describe("detectAiPatterns", () => {
  it("should detect AI signature words", () => {
    const text = "We leverage cutting-edge technology to delve into the problem.";
    const patterns = detectAiPatterns(text);
    const words = patterns.filter((p) => p.type === "signature_word");
    assert.ok(words.length >= 2, `Expected >=2 signature words, got ${words.length}`);
    const wordTexts = words.map((w) => w.word.toLowerCase());
    assert.ok(wordTexts.includes("leverage"), "Should detect 'leverage'");
    assert.ok(wordTexts.includes("delve"), "Should detect 'delve'");
  });

  it("should detect mechanical connectors", () => {
    const text = "Furthermore, this is important.\nMoreover, we find that...";
    const patterns = detectAiPatterns(text);
    const connectors = patterns.filter((p) => p.type === "mechanical_connector");
    assert.ok(connectors.length >= 2, `Expected >=2 connectors, got ${connectors.length}`);
  });

  it("should return empty array for clean text", () => {
    const text = "The model achieves strong results on three benchmarks. We evaluate performance using standard metrics.";
    const patterns = detectAiPatterns(text);
    assert.equal(patterns.length, 0, `Expected 0 AI patterns, got ${patterns.length}: ${JSON.stringify(patterns)}`);
  });

  it("should detect multiple pattern types in mixed text", () => {
    const text = "Furthermore, our groundbreaking approach leverages a novel framework to foster innovation.";
    const patterns = detectAiPatterns(text);
    const types = new Set(patterns.map((p) => p.type));
    assert.ok(types.has("signature_word"), "Should detect signature words");
    assert.ok(types.has("mechanical_connector"), "Should detect mechanical connectors");
  });
});

// ============================================================================
// CLI integration tests
// ============================================================================

describe("CLI integration", () => {
  it("demo command should work on sample text without errors", () => {
    const sampleText = `# Introduction\n\nWe can't help but delve into the multifaceted landscape.\nFurthermore, we utilize cutting-edge methods.\n\n# Methods\n\nThe model was trained using a really large dataset.`;
    const result = analyzePaper(sampleText);
    assert.ok(typeof result.overallScore === "number");
    assert.ok(result.totalIssues > 0, "Sample text should have issues");
    assert.ok(result.sections.length >= 1, "Sample text should have sections");

    const patterns = detectAiPatterns(sampleText);
    assert.ok(patterns.length > 0, "Sample text should have AI patterns");
  });

  it("caption command should require describe and type flags", () => {
    const captionPrompt = PROMPTS.caption;
    assert.deepEqual(captionPrompt.requiredFields, ["describe", "type"]);
  });
});

// ============================================================================
// Exported API shape tests
// ============================================================================

describe("Programmatic API exports", () => {
  it("should export analyzePaper function", () => {
    assert.equal(typeof analyzePaper, "function");
  });

  it("should export detectAiPatterns function", () => {
    assert.equal(typeof detectAiPatterns, "function");
  });

  it("should export detectProviderName function", () => {
    assert.equal(typeof detectProviderName, "function");
  });

  it("should export detectProviderModel function", () => {
    assert.equal(typeof detectProviderModel, "function");
  });

  it("should export callLlm function", () => {
    assert.equal(typeof callLlm, "function");
  });

  it("should export PROMPTS dictionary", () => {
    assert.equal(typeof PROMPTS, "object");
    assert.ok(Object.keys(PROMPTS).length > 0);
  });

  it("should export LLM command functions", () => {
    assert.equal(typeof mod.polish, "function");
    assert.equal(typeof mod.translate, "function");
    assert.equal(typeof mod.compress, "function");
    assert.equal(typeof mod.expand, "function");
    assert.equal(typeof mod.deAi, "function");
    assert.equal(typeof mod.checkLogic, "function");
    assert.equal(typeof mod.caption, "function");
    assert.equal(typeof mod.review, "function");
  });
});
