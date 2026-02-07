#!/usr/bin/env node

/**
 * ai-research-writer - Deep agent for academic paper writing.
 *
 * Multi-step ReAct agent: analyze -> plan -> execute -> reflect -> iterate.
 * Inspired by LangChain ReAct, Anthropic agents, Manus AI.
 *
 * Bring Your Own Key: Gemini -> OpenAI -> Anthropic fallback chain.
 * Zero npm dependencies — uses raw fetch() for all LLM calls.
 */

import * as fs from "fs";
import { PROMPTS } from "./prompts";
import { detectProviderName, detectProviderModel } from "./provider";
import {
  runAgent,
  createPolishTools,
  createReviewTools,
  createTranslateTools,
  createDeAiTools,
  createLogicTools,
  createAnalyzeTools,
} from "./agent";
import type { AgentResult } from "./agent";

// Re-export for library consumers
export { PROMPTS } from "./prompts";
export type { PromptTemplate } from "./prompts";
export { callLlm, callLlmMultiTurn, detectProviderName, detectProviderModel } from "./provider";
export type { LLMResponse, ChatMessage } from "./provider";
export {
  runAgent,
  parseAgentResponse,
  createPolishTools,
  createReviewTools,
  createTranslateTools,
  createDeAiTools,
  createLogicTools,
  createAnalyzeTools,
} from "./agent";
export type { AgentTool, AgentStep, AgentResult, AgentOptions } from "./agent";

// ============================================================================
// Constants
// ============================================================================

const MAX_INPUT_CHARS = 12000;
const VERSION = "3.0.0";

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
// Helpers
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

function formatAgentResult(result: AgentResult): string {
  const lines: string[] = [];

  if (result.steps.length > 0) {
    lines.push(`\n  Agent Trace (${result.totalSteps} steps):`);
    lines.push(`  ${"=".repeat(50)}`);
    for (let i = 0; i < result.steps.length; i++) {
      const step = result.steps[i];
      lines.push(`  Step ${i + 1}: [${step.action}]`);
      lines.push(`    Thought: ${step.thought}`);
      const preview = step.observation.length > 200
        ? step.observation.slice(0, 200) + "..."
        : step.observation;
      lines.push(`    Result: ${preview}`);
      lines.push("");
    }
  }

  lines.push(`  Final Answer:`);
  lines.push(`  ${"=".repeat(50)}`);
  lines.push(result.finalAnswer);
  lines.push(`\n  ---`);
  lines.push(`  Agent: ${result.totalSteps} steps | Provider: ${result.provider} | Model: ${result.model}`);

  return lines.join("\n");
}

function readInputFile(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  return fs.readFileSync(filePath, "utf-8");
}

// ============================================================================
// Agent-Powered Commands
// ============================================================================

/** Polish academic text using multi-step agent with analysis, fixes, and validation. */
export async function polish(
  text: string,
  options: { venue?: string; lang?: string } = {},
): Promise<AgentResult> {
  const { text: truncated } = truncateText(text);
  const venueCtx = options.venue ? ` Target venue: ${options.venue}.` : "";
  const langCtx = options.lang ? ` Language: ${options.lang}.` : "";
  return runAgent({
    goal: `Polish this academic text to publication standard.${venueCtx}${langCtx}\n\nText:\n${truncated}`,
    tools: createPolishTools(),
  });
}

/** Simulate multi-step peer review: novelty, methodology, experiments, then draft review. */
export async function review(
  text: string,
  options: { venue: string; strictness?: string },
): Promise<AgentResult> {
  const { text: truncated } = truncateText(text);
  return runAgent({
    goal: `Review this paper as a ${options.strictness || "harsh"} reviewer for ${options.venue}. Assess novelty, methodology, experiments, then draft a structured review.\n\nPaper:\n${truncated}`,
    tools: createReviewTools(),
  });
}

/** Translate with term analysis, translation, and verification steps. */
export async function translate(
  text: string,
  options: { from: string; to: string; domain?: string },
): Promise<AgentResult> {
  const { text: truncated } = truncateText(text);
  const domainCtx = options.domain ? ` Academic domain: ${options.domain}.` : "";
  return runAgent({
    goal: `Translate this academic text from ${options.from} to ${options.to}.${domainCtx} Preserve all LaTeX, citations, and equations.\n\nText:\n${truncated}`,
    tools: createTranslateTools(),
  });
}

/** Detect AI signatures then rewrite to sound natural. */
export async function deAi(text: string): Promise<AgentResult> {
  const { text: truncated } = truncateText(text);
  return runAgent({
    goal: `Remove all AI-generated writing signatures from this text. First detect AI patterns, then rewrite to sound natural.\n\nText:\n${truncated}`,
    tools: createDeAiTools(),
  });
}

/** Deep logic and consistency check with contradiction scanning. */
export async function checkLogic(
  text: string,
  options: { type?: string } = {},
): Promise<AgentResult> {
  const { text: truncated } = truncateText(text);
  const focusCtx = options.type && options.type !== "all"
    ? ` Focus on: ${options.type}.`
    : "";
  return runAgent({
    goal: `Check this academic text for logical issues, contradictions, and inconsistencies.${focusCtx}\n\nText:\n${truncated}`,
    tools: createLogicTools(),
  });
}

/** Comprehensive analysis: issues, AI patterns, quality score. */
export async function analyze(text: string): Promise<AgentResult> {
  const { text: truncated } = truncateText(text);
  return runAgent({
    goal: `Analyze this academic paper comprehensively. Check for issues, detect AI patterns, and score overall quality.\n\nText:\n${truncated}`,
    tools: createAnalyzeTools(),
  });
}

/** Compress text with word count tracking. */
export async function compress(
  text: string,
  options: { words?: number } = {},
): Promise<AgentResult> {
  const { text: truncated } = truncateText(text);
  const target = options.words
    ? `Reduce by approximately ${options.words} words.`
    : `Reduce word count by approximately 20%.`;
  return runAgent({
    goal: `Compress this academic text. ${target} Preserve all key information.\n\nText:\n${truncated}`,
    tools: createPolishTools(),
  });
}

/** Expand text with depth and logical connections. */
export async function expand(
  text: string,
  options: { words?: number } = {},
): Promise<AgentResult> {
  const { text: truncated } = truncateText(text);
  const target = options.words
    ? `Expand by approximately ${options.words} words.`
    : `Expand by approximately 30%.`;
  return runAgent({
    goal: `Expand this academic text. ${target} Add depth, logical connections, and explicit reasoning.\n\nText:\n${truncated}`,
    tools: createPolishTools(),
  });
}

/** Generate a publication-quality caption. */
export async function caption(
  description: string,
  options: { type: "figure" | "table" },
): Promise<AgentResult> {
  return runAgent({
    goal: `Generate a publication-quality ${options.type} caption for: ${description}`,
    tools: createPolishTools(),
    maxSteps: 3,
  });
}

// ============================================================================
// CLI
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
  console.log(`ai-research-writer v${VERSION} - Deep agent for academic writing

ReAct agent: analyze -> plan -> execute -> reflect -> iterate.
Inspired by LangChain ReAct, Anthropic agents, Manus AI.
Zero dependencies. Bring Your Own Key.

Usage:
  ai-research-writer <command> [file] [options]

Agent Commands (multi-step, require API key):
  analyze <file>      Deep analysis: issues, AI patterns, quality score
  polish <file>       Polish text to publication standard (multi-step)
    --venue <name>    Target venue (e.g., "NeurIPS 2026")
    --lang <code>     Language code (default: en)
  translate <file>    Translate with term analysis + verification
    --from <lang>     Source language (required)
    --to <lang>       Target language (required)
    --domain <field>  Academic domain
  compress <file>     Reduce word count with precision
    --words <n>       Target word reduction
  expand <file>       Expand with depth and clarity
    --words <n>       Target word expansion
  de-ai <file>        Detect + remove AI writing signatures
  check-logic <file>  Deep logic and consistency analysis
    --type <type>     Focus: all|contradictions|terminology|grammar
  review <file>       Multi-step peer review simulation
    --venue <name>    Target venue (required)
    --strictness <s>  harsh|moderate|kind
  caption             Generate figure/table captions
    --desc <text>     Description (required)
    --type <type>     figure or table (required)
  demo                Run agent on built-in sample text

Free Commands (no API key):
  prompts             List all 9 prompt templates
  help                Show this help

BYOK (Gemini -> OpenAI -> Anthropic):
  GEMINI_API_KEY      gemini-2.0-flash (free tier)
  OPENAI_API_KEY      gpt-4o
  ANTHROPIC_API_KEY   claude-sonnet-4-5-20250929

Examples:
  ai-research-writer demo
  ai-research-writer analyze paper.tex
  ai-research-writer polish paper.tex --venue "NeurIPS 2026"
  ai-research-writer de-ai draft.tex
  ai-research-writer review paper.tex --venue "ICML 2026"
  ai-research-writer prompts`);
}

function printPrompts(): void {
  console.log(`\nai-research-writer - Prompt Template Library`);
  console.log(`${"=".repeat(60)}\n`);
  console.log(
    `${Object.keys(PROMPTS).length} battle-tested prompts from awesome-ai-research-writing.\n`,
  );

  for (const [key, prompt] of Object.entries(PROMPTS)) {
    console.log(`--- ${prompt.name} (${key}) ---`);
    console.log(`Command: ${prompt.example}`);
    console.log(`Description: ${prompt.description}`);
    console.log(`Required: ${prompt.requiredFields.join(", ")}`);
    if (prompt.optionalFields.length > 0) {
      console.log(`Optional: ${prompt.optionalFields.join(", ")}`);
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

async function main(): Promise<void> {
  const { command, positional, flags } = parseArgs(process.argv);

  // --- Free commands ---
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

  // --- Agent commands ---
  if (command === "demo") {
    console.log(`\nRunning deep agent analysis on built-in sample text...\n`);
    try {
      const result = await analyze(SAMPLE_TEXT);
      console.log(formatAgentResult(result));
      const providerName = detectProviderName();
      const providerModel = detectProviderModel();
      console.log(
        `\n  LLM Provider: ${providerName ? `${providerName} (${providerModel}) - ready` : "none configured"}`,
      );
    } catch (e: any) {
      console.error(e.message);
      process.exit(1);
    }
    return;
  }

  if (command === "analyze") {
    const filePath = positional[0];
    if (!filePath) {
      console.error("Missing file path. Usage: ai-research-writer analyze <file>");
      process.exit(1);
    }
    try {
      const result = await analyze(readInputFile(filePath));
      console.log(formatAgentResult(result));
    } catch (e: any) {
      console.error(e.message);
      process.exit(1);
    }
    return;
  }

  if (command === "polish") {
    const filePath = positional[0];
    if (!filePath) {
      console.error("Missing file path. Usage: ai-research-writer polish <file>");
      process.exit(1);
    }
    try {
      const result = await polish(readInputFile(filePath), {
        venue: flags.venue,
        lang: flags.lang,
      });
      console.log(formatAgentResult(result));
    } catch (e: any) {
      console.error(e.message);
      process.exit(1);
    }
    return;
  }

  if (command === "translate") {
    const filePath = positional[0];
    if (!filePath || !flags.from || !flags.to) {
      console.error("Usage: ai-research-writer translate <file> --from <lang> --to <lang>");
      process.exit(1);
    }
    try {
      const result = await translate(readInputFile(filePath), {
        from: flags.from,
        to: flags.to,
        domain: flags.domain,
      });
      console.log(formatAgentResult(result));
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
    try {
      const result = await compress(readInputFile(filePath), {
        words: flags.words ? parseInt(flags.words, 10) : undefined,
      });
      console.log(formatAgentResult(result));
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
    try {
      const result = await expand(readInputFile(filePath), {
        words: flags.words ? parseInt(flags.words, 10) : undefined,
      });
      console.log(formatAgentResult(result));
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
    try {
      const result = await deAi(readInputFile(filePath));
      console.log(formatAgentResult(result));
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
    try {
      const result = await checkLogic(readInputFile(filePath), {
        type: flags.type,
      });
      console.log(formatAgentResult(result));
    } catch (e: any) {
      console.error(e.message);
      process.exit(1);
    }
    return;
  }

  if (command === "caption") {
    if (!flags.desc && !flags.describe) {
      console.error('Missing --desc flag. Usage: ai-research-writer caption --desc "description" --type figure');
      process.exit(1);
    }
    if (!flags.type || !["figure", "table"].includes(flags.type)) {
      console.error("Missing or invalid --type flag. Must be 'figure' or 'table'.");
      process.exit(1);
    }
    try {
      const result = await caption(flags.desc || flags.describe, {
        type: flags.type as "figure" | "table",
      });
      console.log(formatAgentResult(result));
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
      console.error("Missing --venue flag.");
      process.exit(1);
    }
    try {
      const result = await review(readInputFile(filePath), {
        venue: flags.venue,
        strictness: flags.strictness,
      });
      console.log(formatAgentResult(result));
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

// Only run CLI when executed directly
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
