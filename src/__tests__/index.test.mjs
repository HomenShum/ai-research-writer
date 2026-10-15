import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Dynamic import of the compiled modules
const mod = await import("../../dist/index.js");
const {
  analyze,
  deAi,
  detectProviderName,
  detectProviderModel,
  callLlm,
  PROMPTS,
} = mod;

// ============================================================================
// Current v3 agent API; offline behavior scenarios are below.
// ============================================================================

describe("analyze", () => {
  it("should be an async function (returns Promise)", () => {
    assert.equal(typeof analyze, "function");
    // Verify it's async by checking the constructor name
    // Real calls are covered below with the provider transport intercepted.
    assert.equal(analyze.constructor.name, "AsyncFunction");
  });

  it("should accept manuscript text", () => {
    // Verify function arity — async functions accept parameters
    assert.ok(analyze.length >= 1, "analyze should accept at least 1 parameter");
  });
});

// ============================================================================
// Current v3 rewrite command (async)
// ============================================================================

describe("deAi", () => {
  it("should be an async function (returns Promise)", () => {
    assert.equal(typeof deAi, "function");
    assert.equal(deAi.constructor.name, "AsyncFunction");
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
  it("should export analyze as async function", () => {
    assert.equal(typeof analyze, "function");
    assert.equal(analyze.constructor.name, "AsyncFunction");
  });

  it("should export deAi as async function", () => {
    assert.equal(typeof deAi, "function");
    assert.equal(deAi.constructor.name, "AsyncFunction");
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

// Intercept only the transport: wrappers, provider parsing, tools and agent loop
// execute unchanged. Never send manuscript text or test keys to a real provider.
const providerKeys = ["GEMINI_API_KEY", "GOOGLE_AI_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"];
async function withOfflineProvider(respond, run, configured = true) {
  const originalFetch = globalThis.fetch;
  const originalKeys = providerKeys.map((key) => [key, process.env[key]]);
  const calls = [];
  for (const key of providerKeys) delete process.env[key];
  if (configured) process.env.GEMINI_API_KEY = "offline-fixture-only";
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, body });
    return respond(body, calls.length);
  };
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of originalKeys) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
function geminiResponse(text) {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
    headers: { "Content-Type": "application/json" },
  });
}
function assertAgentResult(result, finalAnswer, steps = []) {
  assert.deepEqual(Object.keys(result).sort(), ["finalAnswer", "model", "provider", "steps", "totalSteps"]);
  assert.equal(result.finalAnswer, finalAnswer);
  assert.deepEqual(result.steps, steps);
  assert.equal(result.totalSteps, steps.length);
  assert.equal(result.provider, "gemini");
  assert.equal(result.model, detectProviderModel());
}

describe("Offline v3 user workflows", { concurrency: false }, () => {
  it("researcher analysis executes a real tool and returns the public AgentResult", async () => {
    const manuscript = "We compare baselines in Table 1. \\cite{smith2026}";
    const observation = '[{"category":"citations","description":"Check original source"}]';
    const replies = [
      `Thought: Inspect citations.\nAction: analyze_issues\nAction Input: ${manuscript}`,
      observation,
      "Thought: Inspection complete.\nFinal Answer: Verify the cited result before submission.",
    ];
    await withOfflineProvider((_body, n) => {
      assert.ok(n <= replies.length, "unexpected extra provider request");
      return geminiResponse(replies[n - 1]);
    }, async (calls) => {
      const result = await analyze(manuscript);
      assertAgentResult(result, "Verify the cited result before submission.", [{
        thought: "Inspect citations.", action: "analyze_issues", actionInput: manuscript, observation,
      }]);
      assert.equal(calls.length, 3);
      assert.ok(calls[0].body.contents[0].parts[0].text.includes(manuscript));
      assert.equal(calls[1].body.contents[0].parts[0].text, manuscript);
      assert.ok(calls[2].body.contents.at(-1).parts[0].text.includes(observation));
    });
  });

  it("all nine manuscript commands return the current contract through the real provider parser", async () => {
    const commands = [
      () => analyze("draft"), () => mod.polish("draft"),
      () => mod.translate("draft", { from: "en", to: "zh" }),
      () => mod.compress("draft"), () => mod.expand("draft"), () => deAi("draft"),
      () => mod.checkLogic("draft"), () => mod.caption("accuracy plot", { type: "figure" }),
      () => mod.review("draft", { venue: "test venue" }),
    ];
    await withOfflineProvider(() => geminiResponse("Final Answer: Offline fixture result."), async (calls) => {
      for (const command of commands) assertAgentResult(await command(), "Offline fixture result.");
      assert.equal(calls.length, 9);
    });
  });

  it("a long manuscript retains the documented character limit before transport", async () => {
    await withOfflineProvider(() => geminiResponse("Final Answer: Limited input."), async (calls) => {
      await analyze("x".repeat(12000) + "PRIVATE_TAIL_MUST_NOT_BE_SENT");
      const sent = calls[0].body.contents[0].parts[0].text;
      assert.ok(sent.includes("x".repeat(12000)));
      assert.ok(sent.includes("[... truncated at 12000 chars ...]"));
      assert.ok(!sent.includes("PRIVATE_TAIL_MUST_NOT_BE_SENT"));
    });
  });

  it("a researcher without a key gets a rejection before any transport call", async () => {
    await withOfflineProvider(() => { throw new Error("transport must not run"); }, async (calls) => {
      await assert.rejects(analyze("draft"), /No LLM provider available/);
      assert.equal(calls.length, 0);
    }, false);
  });

  it("provider failure rejects instead of silently falling back to another configured provider", async () => {
    await withOfflineProvider(() => new Response("offline unavailable", { status: 503 }), async (calls) => {
      process.env.OPENAI_API_KEY = "offline-second-provider";
      await assert.rejects(analyze("draft"), /Gemini API error \(503\): offline unavailable/);
      assert.equal(calls.length, 1);
    });
  });

  it("an invalid tool is recorded and a finite step budget reaches the forced final response", async () => {
    await withOfflineProvider((_body, n) => geminiResponse(n === 1
      ? "Thought: Try unavailable tool.\nAction: unavailable\nAction Input: draft"
      : "Final Answer: No tool result was available."), async (calls) => {
      const result = await mod.runAgent({ goal: "review draft", tools: [], maxSteps: 1 });
      assert.equal(result.totalSteps, 1);
      assert.equal(result.steps[0].action, "unavailable");
      assert.ok(result.steps[0].observation.startsWith("Unknown tool: unavailable."));
      assert.equal(result.finalAnswer, "No tool result was available.");
      assert.equal(calls.length, 2);
      assert.ok(calls[1].body.contents.at(-1).parts[0].text.includes("Maximum steps reached"));
    });
  });

  it("two finite waves keep six concurrent manuscript traces isolated and restore test state", async () => {
    const originalFetch = globalThis.fetch;
    const originalKeys = providerKeys.map((key) => process.env[key]);
    await withOfflineProvider(async (body) => {
      const marker = body.contents[0].parts[0].text.match(/case\d-\d/)[0];
      await Promise.resolve(); // interleave independent agent invocations
      return geminiResponse(body.contents.length === 1
        ? `Thought: Echo ${marker}.\nAction: echo\nAction Input: ${marker}`
        : `Final Answer: ${marker}`);
    }, async (calls) => {
      for (let wave = 0; wave < 2; wave++) {
        const results = await Promise.all(Array.from({ length: 6 }, (_, i) => mod.runAgent({
          goal: `review case${wave}-${i}`, maxSteps: 2,
          tools: [{ name: "echo", description: "local fixture", execute: async (text) => text }],
        })));
        for (let i = 0; i < results.length; i++) {
          const marker = `case${wave}-${i}`;
          assert.equal(results[i].finalAnswer, marker);
          assert.equal(results[i].totalSteps, 1);
          assert.equal(results[i].steps[0].actionInput, marker);
          assert.equal(results[i].steps[0].observation, marker);
        }
      }
      assert.equal(calls.length, 24);
    });
    assert.equal(globalThis.fetch, originalFetch);
    assert.deepEqual(providerKeys.map((key) => process.env[key]), originalKeys);
  });

  it("a fresh developer can inspect the CLI and receives honest invalid-input exits without a key", () => {
    const dir = mkdtempSync(join(tmpdir(), "ai-research-writer-test-"));
    const block = join(dir, "block-network.cjs");
    writeFileSync(block, 'globalThis.fetch = async () => { throw new Error("OFFLINE_NETWORK_BLOCKED"); };\n');
    const entry = fileURLToPath(new URL("../../dist/index.js", import.meta.url));
    const env = Object.fromEntries(["PATH", "SystemRoot", "TEMP", "TMP"].filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]));
    try {
      const scenarios = [
        [["help"], 0, /Agent Commands/], [["prompts"], 0, /9 battle-tested prompts/],
        [["version"], 0, /v3\.0\.0/], [["analyze"], 1, /Missing file path/],
        [["analyze", join(dir, "absent.tex")], 1, /File not found/],
        [["unknown-command"], 1, /Unknown command/],
        [["translate", "paper.tex"], 1, /--from <lang> --to <lang>/],
        [["caption"], 1, /Missing --desc flag/],
        [["review", "paper.tex"], 1, /Missing --venue flag/],
        [["demo"], 1, /No LLM provider available/],
      ];
      for (const [args, exitCode, signal] of scenarios) {
        const child = spawnSync(process.execPath, ["--require", block, entry, ...args], { env, encoding: "utf8", timeout: 5000, maxBuffer: 128 * 1024 });
        assert.equal(child.error, undefined);
        assert.equal(child.signal, null);
        assert.equal(child.status, exitCode, args.join(" "));
        assert.match(child.stdout + child.stderr, signal);
      }
    } finally {
      unlinkSync(block);
      rmdirSync(dir);
    }
  });
});
