import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Dynamic import of the compiled module
const mod = await import("../../dist/index.js");
const { analyzePaper } = mod;

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
