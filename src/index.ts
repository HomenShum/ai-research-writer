#!/usr/bin/env node

/**
 * ai-research-writer - LLM-powered academic paper writing assistant with BYOK.
 *
 * Combines deterministic regex analysis with battle-tested LLM prompt templates
 * adapted from awesome-ai-research-writing for polishing, translation,
 * compression, expansion, de-AI, logic checking, review, and caption generation.
 *
 * Bring Your Own Key: Gemini -> OpenAI -> Anthropic fallback chain.
 * Zero npm dependencies — uses raw fetch() for all LLM calls.
 */

import * as fs from "fs";
import { PROMPTS, PromptTemplate } from "./prompts";
import { callLlm, detectProviderName, detectProviderModel, LLMResponse } from "./provider";

// Re-export for library consumers
export { PROMPTS, PromptTemplate } from "./prompts";
export { callLlm, detectProviderName, detectProviderModel, LLMResponse } from "./provider";

// ============================================================================
// Types
// ============================================================================

export interface Issue {
  line: number;
  column: number;
  check: string;
  severity: "info" | "warning" | "error";
  message: string;
  suggestion?: string;
}

export interface SectionAnalysis {
  name: string;
  lineStart: number;
  lineEnd: number;
  wordCount: number;
  readabilityGrade: number;
  issues: Issue[];
}

export interface AnalysisResult {
  overallScore: number;
  totalIssues: number;
  sections: SectionAnalysis[];
  issues: Issue[];
  summary: string;
}

export interface AnalyzeOptions {
  checks?: string[];
}

export interface LLMResult {
  output: string;
  provider: string;
  model: string;
  latencyMs: number;
  inputChars: number;
  truncated: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_INPUT_CHARS = 12000;
const VERSION = "2.0.0";

// ============================================================================
// Regex Patterns (from original analyzer)
// ============================================================================

const PASSIVE_VOICE =
  /\b(is|are|was|were|been|being|be)\s+(being\s+)?\w+ed\b/gi;
const WEAK_VERBS =
  /\b(make|do|get|have|go|take|give|put|use)\b/gi;
const HEDGING =
  /\b(perhaps|maybe|somewhat|slightly|relatively|fairly|rather|quite|possibly|arguably)\b/gi;
const INFORMAL =
  /\b(a lot|lots of|kind of|sort of|stuff|things|really|very|pretty much|gonna|wanna|gotta|basically|actually|obviously)\b/gi;
const CONTRACTIONS =
  /\b(can't|won't|don't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|doesn't|didn't|wouldn't|couldn't|shouldn't|it's|that's|there's|here's|what's|who's|let's|I'm|I've|I'll|I'd|we're|we've|we'll|we'd|they're|they've|they'll|they'd|you're|you've|you'll|you'd|he's|she's)\b/gi;

const CITATION_APA =
  /\([A-Z][a-z]+(?:\s+(?:&|and)\s+[A-Z][a-z]+)*,\s*\d{4}\)/g;
const CITATION_IEEE = /\[\d+(?:,\s*\d+)*\]/g;
const CITATION_INLINE =
  /[A-Z][a-z]+\s+(?:et\s+al\.\s+)?\(\d{4}\)/g;

const SECTION_HEADER = /^#{1,3}\s+(.+)$|^([A-Z][A-Za-z\s]+)$/;

/** AI-generated writing signature words for de-ai detection */
const AI_SIGNATURE_WORDS =
  /\b(leverage|delve|utilize|tapestry|multifaceted|cutting-edge|groundbreaking|pivotal|game-changing|spearhead|foster|unleash|realm|dive into)\b/gi;
const AI_CONNECTORS =
  /^(Furthermore|Moreover|Additionally|It is worth noting that|In conclusion|It should be mentioned that),?\s*/gm;

// ============================================================================
// Sample Academic Text (for demo command)
// ============================================================================

const SAMPLE_TEXT = `# Introduction

In this paper, we can't help but delve into the multifaceted landscape of large language models. Perhaps the most groundbreaking aspect of our approach is that it leverages cutting-edge transformer architectures. Furthermore, we utilize a novel training paradigm that fosters unprecedented performance.

It is worth noting that our method doesn't require lots of computational resources. The experiments were conducted on a cluster of GPUs, and the results basically show that our approach is somewhat better than existing baselines.

# Methods

The model was trained using a really large dataset. We've implemented several optimizations that make the training process pretty much efficient. Additionally, our architecture isn't limited to a single domain — it's applicable to a lot of different tasks.

As shown by Smith (2023) and confirmed in [1], the results (Johnson & Lee, 2022) demonstrate the effectiveness of our approach.

# Results

The proposed method achieves state-of-the-art performance on three benchmarks [2, 3]. Our model outperforms all baselines by a significant margin. The ablation study was conducted to validate each component's contribution.`;

// ============================================================================
// Analysis Functions (deterministic, no API key needed)
// ============================================================================

function computeReadability(text: string): number {
  const sentences = text
    .split(/[.!?]+/)
    .filter((s) => s.trim().length > 0);
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const syllables = words.reduce(
    (sum, w) => sum + countSyllables(w),
    0,
  );

  if (sentences.length === 0 || words.length === 0) return 0;

  const avgSentenceLen = words.length / sentences.length;
  const avgSyllables = syllables / words.length;

  // Flesch-Kincaid Grade Level
  return Math.max(
    0,
    0.39 * avgSentenceLen + 11.8 * avgSyllables - 15.59,
  );
}

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 2) return 1;
  let count = 0;
  const vowels = "aeiouy";
  let prevVowel = false;
  for (const ch of w) {
    const isVowel = vowels.includes(ch);
    if (isVowel && !prevVowel) count++;
    prevVowel = isVowel;
  }
  if (w.endsWith("e") && count > 1) count--;
  return Math.max(1, count);
}

function findPatternIssues(
  lines: string[],
  pattern: RegExp,
  check: string,
  severity: Issue["severity"],
  message: string,
  suggestion?: string,
): Issue[] {
  const issues: Issue[] = [];
  for (let i = 0; i < lines.length; i++) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(lines[i])) !== null) {
      issues.push({
        line: i + 1,
        column: match.index + 1,
        check,
        severity,
        message: `${message}: "${match[0]}"`,
        suggestion,
      });
    }
  }
  return issues;
}

function checkCitations(lines: string[]): Issue[] {
  const issues: Issue[] = [];
  const text = lines.join("\n");

  const apaCount = (text.match(CITATION_APA) || []).length;
  const ieeeCount = (text.match(CITATION_IEEE) || []).length;
  const inlineCount = (text.match(CITATION_INLINE) || []).length;

  const styles = [
    { name: "APA", count: apaCount },
    { name: "IEEE", count: ieeeCount },
    { name: "inline", count: inlineCount },
  ].filter((s) => s.count > 0);

  if (styles.length > 1) {
    issues.push({
      line: 1,
      column: 1,
      check: "citations",
      severity: "warning",
      message: `Mixed citation styles detected: ${styles.map((s) => `${s.name}(${s.count})`).join(", ")}`,
      suggestion: "Use a single citation style throughout the paper",
    });
  }

  if (styles.length === 0) {
    issues.push({
      line: 1,
      column: 1,
      check: "citations",
      severity: "info",
      message: "No standard citation patterns detected",
      suggestion:
        "Ensure citations follow APA, IEEE, or similar standard format",
    });
  }

  return issues;
}

function detectSections(lines: string[]): SectionAnalysis[] {
  const sections: SectionAnalysis[] = [];
  let currentSection: {
    name: string;
    lineStart: number;
    lines: string[];
  } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(SECTION_HEADER);
    if (
      match &&
      lines[i].trim().length > 2 &&
      lines[i].trim().length < 80
    ) {
      if (currentSection) {
        const text = currentSection.lines.join(" ");
        sections.push({
          name: currentSection.name,
          lineStart: currentSection.lineStart,
          lineEnd: i,
          wordCount: text
            .split(/\s+/)
            .filter((w) => w.length > 0).length,
          readabilityGrade: computeReadability(text),
          issues: [],
        });
      }
      currentSection = {
        name: (match[1] || match[2]).trim(),
        lineStart: i + 1,
        lines: [],
      };
    } else if (currentSection) {
      currentSection.lines.push(lines[i]);
    }
  }

  if (currentSection) {
    const text = currentSection.lines.join(" ");
    sections.push({
      name: currentSection.name,
      lineStart: currentSection.lineStart,
      lineEnd: lines.length,
      wordCount: text
        .split(/\s+/)
        .filter((w) => w.length > 0).length,
      readabilityGrade: computeReadability(text),
      issues: [],
    });
  }

  return sections;
}

/**
 * Detect AI-generated writing patterns (deterministic, no LLM needed).
 * Returns matches found in the text.
 */
export function detectAiPatterns(
  text: string,
): { word: string; index: number; type: string }[] {
  const results: { word: string; index: number; type: string }[] = [];

  // Signature words
  const wordRe = new RegExp(AI_SIGNATURE_WORDS.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = wordRe.exec(text)) !== null) {
    results.push({ word: m[0], index: m.index, type: "signature_word" });
  }

  // Mechanical connectors
  const connRe = new RegExp(AI_CONNECTORS.source, "gm");
  while ((m = connRe.exec(text)) !== null) {
    results.push({
      word: m[0].trim().replace(/,\s*$/, ""),
      index: m.index,
      type: "mechanical_connector",
    });
  }

  return results;
}

// ============================================================================
// Main Analyze Function (free, deterministic)
// ============================================================================

export function analyzePaper(
  text: string,
  options: AnalyzeOptions = {},
): AnalysisResult {
  const checks = options.checks || [
    "grammar",
    "tone",
    "citations",
    "structure",
  ];
  const lines = text.split("\n");
  const allIssues: Issue[] = [];

  if (checks.includes("grammar")) {
    allIssues.push(
      ...findPatternIssues(
        lines,
        PASSIVE_VOICE,
        "grammar",
        "info",
        "Passive voice",
        "Consider active voice",
      ),
      ...findPatternIssues(
        lines,
        WEAK_VERBS,
        "grammar",
        "info",
        "Weak verb",
        "Use a more specific verb",
      ),
    );
  }

  if (checks.includes("tone")) {
    allIssues.push(
      ...findPatternIssues(
        lines,
        HEDGING,
        "tone",
        "warning",
        "Hedging language",
        "Be more assertive",
      ),
      ...findPatternIssues(
        lines,
        INFORMAL,
        "tone",
        "warning",
        "Informal language",
        "Use formal academic tone",
      ),
      ...findPatternIssues(
        lines,
        CONTRACTIONS,
        "tone",
        "error",
        "Contraction in academic text",
        "Expand the contraction",
      ),
    );
  }

  if (checks.includes("citations")) {
    allIssues.push(...checkCitations(lines));
  }

  const sections = checks.includes("structure")
    ? detectSections(lines)
    : [];

  // Assign issues to sections
  for (const issue of allIssues) {
    const section = sections.find(
      (s) => issue.line >= s.lineStart && issue.line <= s.lineEnd,
    );
    if (section) section.issues.push(issue);
  }

  // Score: start at 100, deduct per issue
  const errorCount = allIssues.filter(
    (i) => i.severity === "error",
  ).length;
  const warningCount = allIssues.filter(
    (i) => i.severity === "warning",
  ).length;
  const infoCount = allIssues.filter(
    (i) => i.severity === "info",
  ).length;
  const score = Math.max(
    0,
    Math.round(100 - errorCount * 5 - warningCount * 2 - infoCount * 0.5),
  );

  const summary = [
    `Score: ${score}/100`,
    `${allIssues.length} issues (${errorCount} errors, ${warningCount} warnings, ${infoCount} info)`,
    sections.length > 0
      ? `${sections.length} sections detected`
      : "No sections detected",
  ].join(" | ");

  return {
    overallScore: score,
    totalIssues: allIssues.length,
    sections,
    issues: allIssues,
    summary,
  };
}

// ============================================================================
// LLM Command Functions
// ============================================================================

function truncateText(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_INPUT_CHARS) {
    return { text, truncated: false };
  }
  return {
    text: text.slice(0, MAX_INPUT_CHARS) + "\n\n[... truncated at 12000 chars ...]",
    truncated: true,
  };
}

async function runLlmCommand(
  promptKey: string,
  userText: string,
  extraContext?: string,
): Promise<LLMResult> {
  const template = PROMPTS[promptKey];
  if (!template) {
    throw new Error(`Unknown prompt template: ${promptKey}`);
  }

  const { text: truncatedText, truncated } = truncateText(userText);
  const systemPrompt = extraContext
    ? `${template.systemPrompt}\n\nAdditional context: ${extraContext}`
    : template.systemPrompt;

  const start = Date.now();
  const response = await callLlm(systemPrompt, truncatedText);
  const latencyMs = Date.now() - start;

  return {
    output: response.text,
    provider: response.provider,
    model: response.model,
    latencyMs,
    inputChars: truncatedText.length,
    truncated,
  };
}

/** Polish academic text to publication standard. */
export async function polish(
  text: string,
  options: { venue?: string; lang?: string } = {},
): Promise<LLMResult> {
  const context = options.venue
    ? `Target venue: ${options.venue}. Language: ${options.lang || "en"}.`
    : undefined;
  return runLlmCommand("polish", text, context);
}

/** Translate academic text between languages. */
export async function translate(
  text: string,
  options: { from: string; to: string; domain?: string },
): Promise<LLMResult> {
  const context = `Translate from ${options.from} to ${options.to}.${options.domain ? ` Domain: ${options.domain}.` : ""}`;
  return runLlmCommand("translate", text, context);
}

/** Compress academic text by reducing word count. */
export async function compress(
  text: string,
  options: { words?: number } = {},
): Promise<LLMResult> {
  const context = options.words
    ? `Target word reduction: approximately ${options.words} words.`
    : `Reduce word count by approximately 20% while preserving all key information.`;
  return runLlmCommand("compress", text, context);
}

/** Expand academic text with additional depth. */
export async function expand(
  text: string,
  options: { words?: number } = {},
): Promise<LLMResult> {
  const context = options.words
    ? `Target expansion: approximately ${options.words} additional words.`
    : `Expand by approximately 30%, adding depth and logical connections.`;
  return runLlmCommand("expand", text, context);
}

/** Remove AI-generated writing signatures. */
export async function deAi(text: string): Promise<LLMResult> {
  return runLlmCommand("de-ai", text);
}

/** Check logic and consistency of academic text. */
export async function checkLogic(
  text: string,
  options: {
    type?: "all" | "contradictions" | "terminology" | "grammar";
  } = {},
): Promise<LLMResult> {
  const context = options.type && options.type !== "all"
    ? `Focus specifically on: ${options.type}.`
    : undefined;
  return runLlmCommand("check-logic", text, context);
}

/** Generate a publication-quality caption for a figure or table. */
export async function caption(
  describe: string,
  options: { type: "figure" | "table" },
): Promise<LLMResult> {
  const context = `This is a ${options.type} caption.`;
  return runLlmCommand("caption", describe, context);
}

/** Simulate a peer review for a target venue. */
export async function review(
  text: string,
  options: { venue: string; strictness?: string },
): Promise<LLMResult> {
  const context = `Venue: ${options.venue}. Strictness: ${options.strictness || "harsh"}. Review this paper as if deciding accept/reject.`;
  return runLlmCommand("review", text, context);
}

// ============================================================================
// CLI Implementation
// ============================================================================

function parseArgs(argv: string[]): {
  command: string;
  positional: string[];
  flags: Record<string, string>;
} {
  const args = argv.slice(2);
  const command = args[0] || "help";
  const positional: string[] = [];
  const flags: Record<string, string> = {};

  let i = 1;
  while (i < args.length) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith("--")
        ? args[i + 1]
        : "true";
      flags[key] = value;
      i += value === "true" ? 1 : 2;
    } else {
      positional.push(args[i]);
      i++;
    }
  }

  return { command, positional, flags };
}

function printHelp(): void {
  console.log(`ai-research-writer v${VERSION} - LLM-powered academic writing assistant

One CLI for polishing, translating, and de-AI-ing your research papers.
Zero dependencies. Bring Your Own Key. Adapted from awesome-ai-research-writing.

Usage:
  ai-research-writer <command> [file] [options]

LLM-Powered Commands (require API key):
  polish <file>       Polish text to publication standard
    --venue <name>    Target venue (e.g., "NeurIPS 2026")
    --lang <code>     Language code (default: en)

  translate <file>    Translate academic text
    --from <lang>     Source language (required)
    --to <lang>       Target language (required)
    --domain <field>  Academic domain (e.g., "computer vision")

  compress <file>     Reduce word count while preserving information
    --words <n>       Target word reduction

  expand <file>       Expand text with depth and clarity
    --words <n>       Target word expansion

  de-ai <file>        Remove AI-generated writing signatures

  check-logic <file>  Final consistency and logic review
    --type <type>     Focus: all|contradictions|terminology|grammar

  caption             Generate figure/table captions
    --desc <text>     Description of the figure/table (required)
    --type <type>     figure or table (required)

  review <file>       Simulate peer review
    --venue <name>    Target venue (required)
    --strictness <s>  Review strictness: harsh|moderate|kind

Free Commands (no API key needed):
  analyze <file>      Regex-based grammar/tone/citation analysis
    --checks <list>   Comma-separated: grammar,tone,citations,structure
    --format <fmt>    Output: text or json (default: text)

  prompts             List all 8 embedded prompt templates
  demo                Run analysis + AI pattern detection on built-in sample
  help                Show this help message

BYOK Setup (provider priority: Gemini -> OpenAI -> Anthropic):
  GEMINI_API_KEY      (uses gemini-2.0-flash) - free tier available
  OPENAI_API_KEY      (uses gpt-4o-mini)
  ANTHROPIC_API_KEY   (uses claude-haiku-4-5-20251001)
  GOOGLE_AI_API_KEY   (alias for Gemini)

Examples:
  ai-research-writer demo
  ai-research-writer analyze paper.tex --checks grammar,tone
  ai-research-writer polish paper.tex --venue "NeurIPS 2026"
  ai-research-writer translate paper.tex --from zh --to en
  ai-research-writer de-ai draft.tex
  ai-research-writer compress abstract.tex --words 50
  ai-research-writer review paper.tex --venue "ICML 2026"
  ai-research-writer caption --desc "accuracy vs epochs" --type figure
  ai-research-writer prompts`);
}

function printPrompts(): void {
  console.log(`\nai-research-writer - Prompt Template Library`);
  console.log(`${"=".repeat(60)}\n`);
  console.log(
    `${Object.keys(PROMPTS).length} battle-tested prompt templates adapted from awesome-ai-research-writing.\n`,
  );
  console.log(
    `These prompts work with any LLM. Copy-paste the system prompt into ChatGPT, Claude, or Gemini.\n`,
  );

  for (const [key, prompt] of Object.entries(PROMPTS)) {
    console.log(`--- ${prompt.name} (${key}) ---`);
    console.log(`Command: ${prompt.example}`);
    console.log(`Description: ${prompt.description}`);
    console.log(`Required fields: ${prompt.requiredFields.join(", ")}`);
    if (prompt.optionalFields.length > 0) {
      console.log(
        `Optional fields: ${prompt.optionalFields.join(", ")}`,
      );
    }
    console.log(`\nSystem Prompt:`);
    console.log(
      prompt.systemPrompt
        .split("\n")
        .map((l) => `  ${l}`)
        .join("\n"),
    );
    console.log("");
  }
}

function formatText(result: AnalysisResult): string {
  const lines: string[] = [];
  lines.push(`\n  Research Paper Analysis`);
  lines.push(`  ${"=".repeat(50)}`);
  lines.push(`  ${result.summary}\n`);

  if (result.sections.length > 0) {
    lines.push(`  Sections:`);
    for (const s of result.sections) {
      lines.push(
        `    - ${s.name} (${s.wordCount} words, grade ${s.readabilityGrade.toFixed(1)}, ${s.issues.length} issues)`,
      );
    }
    lines.push("");
  }

  if (result.issues.length > 0) {
    lines.push(`  Issues:`);
    for (const issue of result.issues.slice(0, 30)) {
      const icon =
        issue.severity === "error"
          ? "x"
          : issue.severity === "warning"
            ? "!"
            : "-";
      lines.push(
        `    [${icon}] L${issue.line}:${issue.column} (${issue.check}) ${issue.message}`,
      );
      if (issue.suggestion)
        lines.push(`        Suggestion: ${issue.suggestion}`);
    }
    if (result.issues.length > 30) {
      lines.push(
        `    ... and ${result.issues.length - 30} more issues`,
      );
    }
  }

  return lines.join("\n");
}

function formatLLMResult(result: LLMResult): string {
  const lines: string[] = [];
  lines.push(result.output);
  lines.push(`\n---`);
  lines.push(
    `Provider: ${result.provider} (${result.model}) | Latency: ${result.latencyMs}ms | Input: ${result.inputChars} chars${result.truncated ? " (truncated)" : ""}`,
  );
  return lines.join("\n");
}

function readInputFile(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  return fs.readFileSync(filePath, "utf-8");
}

async function main(): Promise<void> {
  const { command, positional, flags } = parseArgs(process.argv);

  // --- Free commands (no API key) ---

  if (command === "help" || command === "--help" || flags.help) {
    printHelp();
    return;
  }

  if (command === "--version" || command === "version") {
    console.log(`ai-research-writer v${VERSION}`);
    return;
  }

  if (command === "prompts") {
    printPrompts();
    return;
  }

  if (command === "demo") {
    console.log(
      `\nRunning analysis on built-in sample academic text...\n`,
    );
    const result = analyzePaper(SAMPLE_TEXT);
    console.log(formatText(result));

    // Also show AI pattern detection
    const aiPatterns = detectAiPatterns(SAMPLE_TEXT);
    if (aiPatterns.length > 0) {
      console.log(`\n  AI Writing Signatures Detected: ${aiPatterns.length}`);
      const words = aiPatterns.filter(
        (p) => p.type === "signature_word",
      );
      const connectors = aiPatterns.filter(
        (p) => p.type === "mechanical_connector",
      );
      if (words.length > 0) {
        console.log(
          `    Signature words: ${words.map((w) => w.word).join(", ")}`,
        );
      }
      if (connectors.length > 0) {
        console.log(
          `    Mechanical connectors: ${connectors.map((c) => c.word).join(", ")}`,
        );
      }
      console.log(
        `\n  Tip: Run "ai-research-writer de-ai <file>" to automatically clean these.`,
      );
    }

    const providerName = detectProviderName();
    const providerModel = detectProviderModel();
    console.log(
      `\n  LLM Provider: ${providerName ? `${providerName} (${providerModel}) - ready` : "none configured"}`,
    );
    if (!providerName) {
      console.log(
        `  Set GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY to unlock LLM commands.`,
      );
    }
    return;
  }

  if (command === "analyze") {
    const filePath = positional[0];
    if (!filePath) {
      console.error(
        "Missing file path. Usage: ai-research-writer analyze <file>",
      );
      process.exit(1);
    }

    const text = readInputFile(filePath);
    const checks = flags.checks ? flags.checks.split(",") : undefined;
    const format = flags.format || "text";

    const result = analyzePaper(text, { checks });

    if (format === "json") {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatText(result));
    }

    process.exit(result.overallScore >= 70 ? 0 : 1);
  }

  // --- LLM commands (require API key) ---

  if (command === "polish") {
    const filePath = positional[0];
    if (!filePath) {
      console.error("Missing file path. Usage: ai-research-writer polish <file>");
      process.exit(1);
    }
    const text = readInputFile(filePath);
    try {
      const result = await polish(text, {
        venue: flags.venue,
        lang: flags.lang,
      });
      console.log(formatLLMResult(result));
    } catch (e: any) {
      console.error(e.message);
      process.exit(1);
    }
    return;
  }

  if (command === "translate") {
    const filePath = positional[0];
    if (!filePath) {
      console.error("Missing file path. Usage: ai-research-writer translate <file> --from <lang> --to <lang>");
      process.exit(1);
    }
    if (!flags.from || !flags.to) {
      console.error("Missing --from and --to flags. Usage: ai-research-writer translate <file> --from zh --to en");
      process.exit(1);
    }
    const text = readInputFile(filePath);
    try {
      const result = await translate(text, {
        from: flags.from,
        to: flags.to,
        domain: flags.domain,
      });
      console.log(formatLLMResult(result));
    } catch (e: any) {
      console.error(e.message);
      process.exit(1);
    }
    return;
  }

  if (command === "compress") {
    const filePath = positional[0];
    if (!filePath) {
      console.error("Missing file path. Usage: ai-research-writer compress <file>");
      process.exit(1);
    }
    const text = readInputFile(filePath);
    try {
      const result = await compress(text, {
        words: flags.words ? parseInt(flags.words, 10) : undefined,
      });
      console.log(formatLLMResult(result));
    } catch (e: any) {
      console.error(e.message);
      process.exit(1);
    }
    return;
  }

  if (command === "expand") {
    const filePath = positional[0];
    if (!filePath) {
      console.error("Missing file path. Usage: ai-research-writer expand <file>");
      process.exit(1);
    }
    const text = readInputFile(filePath);
    try {
      const result = await expand(text, {
        words: flags.words ? parseInt(flags.words, 10) : undefined,
      });
      console.log(formatLLMResult(result));
    } catch (e: any) {
      console.error(e.message);
      process.exit(1);
    }
    return;
  }

  if (command === "de-ai") {
    const filePath = positional[0];
    if (!filePath) {
      console.error("Missing file path. Usage: ai-research-writer de-ai <file>");
      process.exit(1);
    }
    const text = readInputFile(filePath);
    try {
      const result = await deAi(text);
      console.log(formatLLMResult(result));
    } catch (e: any) {
      console.error(e.message);
      process.exit(1);
    }
    return;
  }

  if (command === "check-logic") {
    const filePath = positional[0];
    if (!filePath) {
      console.error("Missing file path. Usage: ai-research-writer check-logic <file>");
      process.exit(1);
    }
    const text = readInputFile(filePath);
    try {
      const result = await checkLogic(text, {
        type: flags.type as any,
      });
      console.log(formatLLMResult(result));
    } catch (e: any) {
      console.error(e.message);
      process.exit(1);
    }
    return;
  }

  if (command === "caption") {
    if (!flags.desc && !flags.describe) {
      console.error(
        'Missing --desc flag. Usage: ai-research-writer caption --desc "description" --type figure',
      );
      process.exit(1);
    }
    if (!flags.type || !["figure", "table"].includes(flags.type)) {
      console.error(
        "Missing or invalid --type flag. Must be 'figure' or 'table'.",
      );
      process.exit(1);
    }
    try {
      const result = await caption(flags.desc || flags.describe, {
        type: flags.type as "figure" | "table",
      });
      console.log(formatLLMResult(result));
    } catch (e: any) {
      console.error(e.message);
      process.exit(1);
    }
    return;
  }

  if (command === "review") {
    const filePath = positional[0];
    if (!filePath) {
      console.error("Missing file path. Usage: ai-research-writer review <file> --venue <name>");
      process.exit(1);
    }
    if (!flags.venue) {
      console.error("Missing --venue flag. Usage: ai-research-writer review <file> --venue \"ICML 2026\"");
      process.exit(1);
    }
    const text = readInputFile(filePath);
    try {
      const result = await review(text, {
        venue: flags.venue,
        strictness: flags.strictness,
      });
      console.log(formatLLMResult(result));
    } catch (e: any) {
      console.error(e.message);
      process.exit(1);
    }
    return;
  }

  console.error(
    `Unknown command: ${command}. Run "ai-research-writer help" for usage.`,
  );
  process.exit(1);
}

// Only run CLI when executed directly (not when imported)
const isDirectExecution =
  typeof require !== "undefined" &&
  require.main === module;
const isCLI =
  isDirectExecution ||
  process.argv[1]?.endsWith("index.js") ||
  process.argv[1]?.endsWith("ai-research-writer");

if (isCLI) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
