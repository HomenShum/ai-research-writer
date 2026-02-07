/**
 * ReAct Agent Engine for ai-research-writer.
 *
 * Multi-step agentic workflows with planning, tool use, reflection,
 * and iteration. Inspired by LangChain ReAct, Anthropic agents, Manus AI.
 * Zero dependencies — uses provider.ts for LLM calls.
 */

import { callLlm, callLlmMultiTurn, detectProviderName, detectProviderModel } from "./provider";
import type { ChatMessage, LLMResponse } from "./provider";

// ============================================================================
// Types
// ============================================================================

export interface AgentTool {
  name: string;
  description: string;
  execute: (input: string) => Promise<string>;
}

export interface AgentStep {
  thought: string;
  action: string;
  actionInput: string;
  observation: string;
}

export interface AgentResult {
  steps: AgentStep[];
  finalAnswer: string;
  totalSteps: number;
  provider: string;
  model: string;
}

export interface AgentOptions {
  goal: string;
  tools: AgentTool[];
  context?: string;
  maxSteps?: number;
}

// ============================================================================
// ReAct Parser
// ============================================================================

export function parseAgentResponse(text: string): {
  thought: string;
  action?: string;
  actionInput?: string;
  finalAnswer?: string;
} {
  const lines = text.split("\n");
  let thought = "";
  let action = "";
  let actionInput = "";
  let finalAnswer = "";

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("Thought:")) {
      thought = trimmed.slice(8).trim();
    } else if (trimmed.startsWith("Action:") && !trimmed.startsWith("Action Input:")) {
      action = trimmed.slice(7).trim();
    } else if (trimmed.startsWith("Action Input:")) {
      const rest = trimmed.slice(13).trim();
      const inputLines = [rest];
      for (let j = i + 1; j < lines.length; j++) {
        const nt = lines[j].trim();
        if (nt.startsWith("Thought:") || nt.startsWith("Action:") ||
            nt.startsWith("Final Answer:") || nt.startsWith("Observation:")) break;
        inputLines.push(lines[j]);
      }
      actionInput = inputLines.join("\n").trim();
    } else if (trimmed.startsWith("Final Answer:")) {
      const idx = text.indexOf("Final Answer:");
      finalAnswer = text.slice(idx + 13).trim();
      break;
    }
  }

  return {
    thought,
    action: action || undefined,
    actionInput: actionInput || undefined,
    finalAnswer: finalAnswer || undefined,
  };
}

// ============================================================================
// System Prompt Builder
// ============================================================================

function buildSystemPrompt(tools: AgentTool[]): string {
  const toolDescriptions = tools
    .map((t) => `  ${t.name}: ${t.description}`)
    .join("\n");

  return `You are a research writing agent. You analyze and improve academic papers using tools step by step.

Available tools:
${toolDescriptions}

You must follow this EXACT format:

Thought: <your reasoning about what to do next>
Action: <tool_name>
Action Input: <input for the tool>

After each Observation, think about what to do next.
When done, respond with:

Thought: <final reasoning>
Final Answer: <your complete output>

Rules:
- Use exactly one tool per response
- Think carefully before each action
- Do NOT include both Action and Final Answer in the same response`;
}

// ============================================================================
// Agent Loop
// ============================================================================

export async function runAgent(options: AgentOptions): Promise<AgentResult> {
  const { goal, tools, maxSteps = 5 } = options;
  const systemPrompt = buildSystemPrompt(tools);
  const steps: AgentStep[] = [];
  const messages: ChatMessage[] = [];

  messages.push({ role: "user", content: `Goal: ${goal}\n\nBegin.` });

  for (let step = 0; step < maxSteps; step++) {
    const response = await callLlmMultiTurn(systemPrompt, messages);
    messages.push({ role: "assistant", content: response.text });

    const parsed = parseAgentResponse(response.text);

    if (parsed.finalAnswer) {
      return {
        steps,
        finalAnswer: parsed.finalAnswer,
        totalSteps: steps.length,
        provider: response.provider,
        model: response.model,
      };
    }

    if (parsed.action) {
      const tool = tools.find((t) => t.name === parsed.action);
      let observation: string;

      if (tool) {
        try {
          observation = await tool.execute(parsed.actionInput || "");
        } catch (err: any) {
          observation = "Tool error: " + (err.message || String(err));
        }
      } else {
        observation = `Unknown tool: ${parsed.action}. Available: ${tools.map((t) => t.name).join(", ")}`;
      }

      steps.push({
        thought: parsed.thought,
        action: parsed.action,
        actionInput: parsed.actionInput || "",
        observation,
      });

      messages.push({ role: "user", content: `Observation: ${observation}\n\nContinue.` });
    } else {
      messages.push({
        role: "user",
        content: "Please use a tool (Action + Action Input) or provide your Final Answer.",
      });
    }
  }

  // Max steps — force final answer
  messages.push({
    role: "user",
    content: "Maximum steps reached. Provide your Final Answer now.",
  });

  const finalResponse = await callLlmMultiTurn(systemPrompt, messages);
  const finalParsed = parseAgentResponse(finalResponse.text);

  return {
    steps,
    finalAnswer: finalParsed.finalAnswer || finalResponse.text,
    totalSteps: steps.length,
    provider: finalResponse.provider,
    model: finalResponse.model,
  };
}

// ============================================================================
// Tool Factories
// ============================================================================

/** Tools for the `polish` agent workflow. */
export function createPolishTools(): AgentTool[] {
  return [
    {
      name: "analyze_issues",
      description: "Analyze text for grammar, tone, AI signatures, and style issues. Returns JSON issues list.",
      execute: async (text) => {
        const r = await callLlm(
          "Analyze this academic text for issues. Return JSON array: [{category, description, severity, location}]. Categories: grammar, tone, ai-signature, style.",
          text
        );
        return r.text;
      },
    },
    {
      name: "apply_fixes",
      description: "Apply fixes to text based on identified issues. Returns corrected text.",
      execute: async (input) => {
        const r = await callLlm(
          "You are an expert academic editor. Apply the requested fixes. Return ONLY the corrected text.",
          input
        );
        return r.text;
      },
    },
    {
      name: "validate_result",
      description: "Validate polished text against publication standards. Returns pass/fail with details.",
      execute: async (text) => {
        const r = await callLlm(
          'Validate this text against publication standards. Return JSON: {"pass": boolean, "remainingIssues": number, "details": []}',
          text
        );
        return r.text;
      },
    },
    {
      name: "word_count",
      description: "Count words in the text. No LLM call needed.",
      execute: async (text) => {
        const count = text.split(/\s+/).filter(Boolean).length;
        return `Word count: ${count}`;
      },
    },
  ];
}

/** Tools for the `review` agent workflow. */
export function createReviewTools(): AgentTool[] {
  return [
    {
      name: "assess_novelty",
      description: "Evaluate the novelty of the paper's contribution. Returns novelty score and justification.",
      execute: async (text) => {
        const r = await callLlm(
          "Evaluate novelty. Return JSON: {noveltyScore: 1-10, justification, verdict: novel|incremental|derivative}",
          text
        );
        return r.text;
      },
    },
    {
      name: "check_methodology",
      description: "Check if methodology is sound and reproducible.",
      execute: async (text) => {
        const r = await callLlm(
          "Check methodology. Return JSON: {soundnessScore: 1-10, reproducibilityScore: 1-10, issues: [], strengths: []}",
          text
        );
        return r.text;
      },
    },
    {
      name: "evaluate_experiments",
      description: "Evaluate experimental design, baselines, and ablations.",
      execute: async (text) => {
        const r = await callLlm(
          "Evaluate experiments. Return JSON: {experimentScore: 1-10, missingBaselines: [], missingAblations: [], strengths: [], weaknesses: []}",
          text
        );
        return r.text;
      },
    },
    {
      name: "draft_review",
      description: "Draft a structured peer review from accumulated findings.",
      execute: async (input) => {
        const r = await callLlm(
          "Draft a structured peer review. Format: Summary, Strengths, Weaknesses (Critical/Minor), Questions, Rating X/10, Strategic Advice.",
          input
        );
        return r.text;
      },
    },
  ];
}

/** Tools for the `translate` agent workflow. */
export function createTranslateTools(): AgentTool[] {
  return [
    {
      name: "analyze_terms",
      description: "Identify technical terms, idioms, and LaTeX commands that need careful translation.",
      execute: async (text) => {
        const r = await callLlm(
          "Identify: technical terms, idioms, LaTeX commands to preserve. Return JSON: {technicalTerms: [], latexCommands: []}",
          text
        );
        return r.text;
      },
    },
    {
      name: "translate_text",
      description: "Translate academic text preserving LaTeX and citations. Returns translated text.",
      execute: async (input) => {
        const r = await callLlm(
          "Translate this academic text. Preserve all LaTeX, citations, math. Return ONLY the translated text.",
          input
        );
        return r.text;
      },
    },
    {
      name: "verify_translation",
      description: "Verify translation accuracy by back-translating key sentences.",
      execute: async (input) => {
        const r = await callLlm(
          'Verify translation accuracy. Return JSON: {accuracyScore: 1-10, issues: [], verdict: "accurate"|"needs-revision"}',
          input
        );
        return r.text;
      },
    },
  ];
}

/** Tools for the `de-ai` agent workflow. */
export function createDeAiTools(): AgentTool[] {
  return [
    {
      name: "detect_signatures",
      description: "Scan text for AI-generated writing signatures (leverage, delve, tapestry, etc.).",
      execute: async (text) => {
        const r = await callLlm(
          "Scan for AI writing signatures: overused AI words, mechanical connectors, uniform sentence length. Return JSON: {signatures: [{word, count, type}], totalFound, severityScore: 1-10}",
          text
        );
        return r.text;
      },
    },
    {
      name: "rewrite_clean",
      description: "Rewrite text removing all AI signatures while preserving academic content.",
      execute: async (text) => {
        const r = await callLlm(
          "Rewrite to remove AI signatures. Replace AI vocabulary with natural alternatives. Vary sentence length. Return ONLY the rewritten text.",
          text
        );
        return r.text;
      },
    },
  ];
}

/** Tools for the `check-logic` agent workflow. */
export function createLogicTools(): AgentTool[] {
  return [
    {
      name: "scan_contradictions",
      description: "Scan for contradictions, terminology inconsistency, and logical gaps.",
      execute: async (text) => {
        const r = await callLlm(
          'Scan for contradictions, terminology inconsistency, logical gaps, number inconsistencies. Return JSON: {issues: [{type, severity, location, description, suggestion}], summary}',
          text
        );
        return r.text;
      },
    },
    {
      name: "deep_logic_check",
      description: "Deep analysis of arguments: evidence support, logical fallacies, missing qualifications.",
      execute: async (text) => {
        const r = await callLlm(
          "Deep logic analysis. For each claim: identify evidence, check support, find fallacies. Return JSON: {claims: [{claim, evidence, supported, issues}], overallCoherence: 1-10}",
          text
        );
        return r.text;
      },
    },
  ];
}

/** Tools for the `analyze` agent workflow. */
export function createAnalyzeTools(): AgentTool[] {
  return [
    ...createPolishTools().slice(0, 1), // analyze_issues
    {
      name: "detect_ai_patterns",
      description: "Detect AI writing patterns in the text.",
      execute: async (text) => {
        const r = await callLlm(
          "Detect AI writing patterns. Return JSON: {patterns: [{word, index, type: signature_word|mechanical_connector}], count}",
          text
        );
        return r.text;
      },
    },
    {
      name: "score_paper",
      description: "Score the paper overall (0-100) with breakdown by category.",
      execute: async (text) => {
        const r = await callLlm(
          'Score this paper 0-100. Return JSON: {overallScore, breakdown: {grammar, tone, structure, citations, aiSignatures}, summary}',
          text
        );
        return r.text;
      },
    },
  ];
}
