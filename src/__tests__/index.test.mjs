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
// LLM-based analyzePaper tests (async, requires API key for actual calls)
// ============================================================================

describe("analyzePaper", () => {
  it("should be an async function (returns Promise)", () => {
    assert.equal(typeof analyzePaper, "function");
    // Verify it's async by checking the constructor name
    // We can't actually call it without an API key, but we can verify the signature
    assert.equal(analyzePaper.constructor.name, "AsyncFunction");
  });

  it("should accept text and options parameters", () => {
    // Verify function arity — async functions accept parameters
    assert.ok(analyzePaper.length >= 1, "analyzePaper should accept at least 1 parameter");
  });
});

// ============================================================================
// LLM-based detectAiPatterns tests (async)
// ============================================================================

describe("detectAiPatterns", () => {
  it("should be an async function (returns Promise)", () => {
    assert.equal(typeof detectAiPatterns, "function");
    assert.equal(detectAiPatterns.constructor.name, "AsyncFunction");
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

  it("should return gemini-3-flash-preview for Gemini", () => {
    process.env.GEMINI_API_KEY = "test";
    assert.equal(detectProviderModel(), "gemini-3-flash-preview");
  });

  it("should return gpt-5 for OpenAI", () => {
    process.env.OPENAI_API_KEY = "test";
    assert.equal(detectProviderModel(), "gpt-5");
  });

  it("should return claude-sonnet-4-5-20250929 for Anthropic", () => {
    process.env.ANTHROPIC_API_KEY = "test";
    assert.equal(detectProviderModel(), "claude-sonnet-4-5-20250929");
  });
});

// ============================================================================
// Prompt template validation tests
// ============================================================================

describe("PROMPTS", () => {
  it("should have exactly 9 prompt templates", () => {
    const keys = Object.keys(PROMPTS);
    assert.equal(keys.length, 9, `Expected 9 prompts, got ${keys.length}: ${keys.join(", ")}`);
  });

  it("should include all expected commands including analyze", () => {
    const expected = ["analyze", "polish", "translate", "compress", "expand", "de-ai", "check-logic", "caption", "review"];
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

  it("analyze prompt should include all evaluation criteria", () => {
    const a = PROMPTS.analyze;
    assert.ok(a.name === "LLM Paper Judge", "Analyze should be named 'LLM Paper Judge'");
    assert.ok(a.systemPrompt.includes("GRAMMAR"), "Analyze should include GRAMMAR criteria");
    assert.ok(a.systemPrompt.includes("TONE"), "Analyze should include TONE criteria");
    assert.ok(a.systemPrompt.includes("CITATIONS"), "Analyze should include CITATIONS criteria");
    assert.ok(a.systemPrompt.includes("STRUCTURE"), "Analyze should include STRUCTURE criteria");
    assert.ok(a.systemPrompt.includes("AI SIGNATURES"), "Analyze should include AI SIGNATURES criteria");
    assert.ok(a.systemPrompt.includes("overallScore"), "Analyze should request overallScore");
    assert.ok(a.systemPrompt.includes("aiPatterns"), "Analyze should request aiPatterns");
    assert.ok(a.systemPrompt.includes("leverage"), "Analyze should mention AI signature word 'leverage'");
    assert.ok(a.systemPrompt.includes("delve"), "Analyze should mention AI signature word 'delve'");
    assert.ok(a.systemPrompt.includes("Furthermore"), "Analyze should mention mechanical connector 'Furthermore'");
    assert.ok(a.systemPrompt.includes("valid JSON"), "Analyze should request valid JSON output");
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
// Exported API shape tests
// ============================================================================

describe("Programmatic API exports", () => {
  it("should export analyzePaper as async function", () => {
    assert.equal(typeof analyzePaper, "function");
    assert.equal(analyzePaper.constructor.name, "AsyncFunction");
  });

  it("should export detectAiPatterns as async function", () => {
    assert.equal(typeof detectAiPatterns, "function");
    assert.equal(detectAiPatterns.constructor.name, "AsyncFunction");
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

  it("should export PROMPTS dictionary with 9 templates", () => {
    assert.equal(typeof PROMPTS, "object");
    assert.equal(Object.keys(PROMPTS).length, 9);
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

  it("all 8 LLM command functions should be async", () => {
    const asyncFns = [mod.polish, mod.translate, mod.compress, mod.expand, mod.deAi, mod.checkLogic, mod.caption, mod.review];
    for (const fn of asyncFns) {
      assert.equal(fn.constructor.name, "AsyncFunction", `${fn.name} should be async`);
    }
  });
});

// ============================================================================
// No regex validation — confirm no regex patterns exist in the module
// ============================================================================

describe("No regex analysis", () => {
  it("should not export any regex-based functions", () => {
    // These old regex functions should NOT exist
    assert.equal(mod.computeReadability, undefined, "computeReadability should not be exported");
    assert.equal(mod.countSyllables, undefined, "countSyllables should not be exported");
    assert.equal(mod.findPatternIssues, undefined, "findPatternIssues should not be exported");
    assert.equal(mod.checkCitations, undefined, "checkCitations should not be exported");
    assert.equal(mod.detectSections, undefined, "detectSections should not be exported");
  });
});
