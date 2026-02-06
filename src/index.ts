#!/usr/bin/env node

/**
 * ai-research-writer — Polish and elevate AI research papers.
 *
 * Analyzes text for grammar, structure, citations, academic tone, and readability.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

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

// ─── Patterns ───────────────────────────────────────────────────────────────

const PASSIVE_VOICE = /\b(is|are|was|were|been|being|be)\s+(being\s+)?\w+ed\b/gi;
const WEAK_VERBS = /\b(make|do|get|have|go|take|give|put|use)\b/gi;
const HEDGING = /\b(perhaps|maybe|somewhat|slightly|relatively|fairly|rather|quite|possibly|arguably)\b/gi;
const INFORMAL = /\b(a lot|lots of|kind of|sort of|stuff|things|really|very|pretty much|gonna|wanna|gotta|basically|actually|obviously)\b/gi;
const CONTRACTIONS = /\b(can't|won't|don't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|doesn't|didn't|wouldn't|couldn't|shouldn't|it's|that's|there's|here's|what's|who's|let's|I'm|I've|I'll|I'd|we're|we've|we'll|we'd|they're|they've|they'll|they'd|you're|you've|you'll|you'd|he's|she's)\b/gi;

const CITATION_APA = /\([A-Z][a-z]+(?:\s+(?:&|and)\s+[A-Z][a-z]+)*,\s*\d{4}\)/g;
const CITATION_IEEE = /\[\d+(?:,\s*\d+)*\]/g;
const CITATION_INLINE = /[A-Z][a-z]+\s+(?:et\s+al\.\s+)?\(\d{4}\)/g;

const SECTION_HEADER = /^#{1,3}\s+(.+)$|^([A-Z][A-Za-z\s]+)$/;

// ─── Analysis Functions ─────────────────────────────────────────────────────

function computeReadability(text: string): number {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);

  if (sentences.length === 0 || words.length === 0) return 0;

  const avgSentenceLen = words.length / sentences.length;
  const avgSyllables = syllables / words.length;

  // Flesch-Kincaid Grade Level
  return Math.max(0, 0.39 * avgSentenceLen + 11.8 * avgSyllables - 15.59);
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
  suggestion?: string
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

  // Detect mixed citation styles
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
      suggestion: "Ensure citations follow APA, IEEE, or similar standard format",
    });
  }

  return issues;
}

function detectSections(lines: string[]): SectionAnalysis[] {
  const sections: SectionAnalysis[] = [];
  let currentSection: { name: string; lineStart: number; lines: string[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(SECTION_HEADER);
    if (match && lines[i].trim().length > 2 && lines[i].trim().length < 80) {
      if (currentSection) {
        const text = currentSection.lines.join(" ");
        sections.push({
          name: currentSection.name,
          lineStart: currentSection.lineStart,
          lineEnd: i,
          wordCount: text.split(/\s+/).filter((w) => w.length > 0).length,
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
      wordCount: text.split(/\s+/).filter((w) => w.length > 0).length,
      readabilityGrade: computeReadability(text),
      issues: [],
    });
  }

  return sections;
}

// ─── Main Analysis ──────────────────────────────────────────────────────────

export function analyzePaper(text: string, options: AnalyzeOptions = {}): AnalysisResult {
  const checks = options.checks || ["grammar", "tone", "citations", "structure"];
  const lines = text.split("\n");
  const allIssues: Issue[] = [];

  if (checks.includes("grammar")) {
    allIssues.push(
      ...findPatternIssues(lines, PASSIVE_VOICE, "grammar", "info", "Passive voice", "Consider active voice"),
      ...findPatternIssues(lines, WEAK_VERBS, "grammar", "info", "Weak verb", "Use a more specific verb")
    );
  }

  if (checks.includes("tone")) {
    allIssues.push(
      ...findPatternIssues(lines, HEDGING, "tone", "warning", "Hedging language", "Be more assertive"),
      ...findPatternIssues(lines, INFORMAL, "tone", "warning", "Informal language", "Use formal academic tone"),
      ...findPatternIssues(lines, CONTRACTIONS, "tone", "error", "Contraction in academic text", "Expand the contraction")
    );
  }

  if (checks.includes("citations")) {
    allIssues.push(...checkCitations(lines));
  }

  const sections = checks.includes("structure") ? detectSections(lines) : [];

  // Assign issues to sections
  for (const issue of allIssues) {
    const section = sections.find((s) => issue.line >= s.lineStart && issue.line <= s.lineEnd);
    if (section) section.issues.push(issue);
  }

  // Score: start at 100, deduct per issue
  const errorCount = allIssues.filter((i) => i.severity === "error").length;
  const warningCount = allIssues.filter((i) => i.severity === "warning").length;
  const infoCount = allIssues.filter((i) => i.severity === "info").length;
  const score = Math.max(0, Math.round(100 - errorCount * 5 - warningCount * 2 - infoCount * 0.5));

  const summary = [
    `Score: ${score}/100`,
    `${allIssues.length} issues (${errorCount} errors, ${warningCount} warnings, ${infoCount} info)`,
    sections.length > 0 ? `${sections.length} sections detected` : "No sections detected",
  ].join(" | ");

  return { overallScore: score, totalIssues: allIssues.length, sections, issues: allIssues, summary };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`ai-research-writer v1.0.0

Usage:
  ai-research-writer analyze <file> [options]
  ai-research-writer --help

Options:
  --checks <list>   Comma-separated: grammar,tone,citations,structure (default: all)
  --format <fmt>    Output format: text or json (default: text)
  --help            Show this help`);
}

function formatText(result: AnalysisResult): string {
  const lines: string[] = [];
  lines.push(`\n  Research Paper Analysis`);
  lines.push(`  ${"=".repeat(50)}`);
  lines.push(`  ${result.summary}\n`);

  if (result.sections.length > 0) {
    lines.push(`  Sections:`);
    for (const s of result.sections) {
      lines.push(`    - ${s.name} (${s.wordCount} words, grade ${s.readabilityGrade.toFixed(1)}, ${s.issues.length} issues)`);
    }
    lines.push("");
  }

  if (result.issues.length > 0) {
    lines.push(`  Issues:`);
    for (const issue of result.issues.slice(0, 30)) {
      const icon = issue.severity === "error" ? "x" : issue.severity === "warning" ? "!" : "-";
      lines.push(`    [${icon}] L${issue.line}:${issue.column} (${issue.check}) ${issue.message}`);
      if (issue.suggestion) lines.push(`        Suggestion: ${issue.suggestion}`);
    }
    if (result.issues.length > 30) {
      lines.push(`    ... and ${result.issues.length - 30} more issues`);
    }
  }

  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.length === 0) {
    printHelp();
    return;
  }

  const command = args[0];
  if (command !== "analyze") {
    console.error(`Unknown command: ${command}. Use --help for usage.`);
    process.exit(1);
  }

  const filePath = args[1];
  if (!filePath) {
    console.error("Missing file path. Usage: ai-research-writer analyze <file>");
    process.exit(1);
  }

  const checksIdx = args.indexOf("--checks");
  const checks = checksIdx !== -1 && args[checksIdx + 1] ? args[checksIdx + 1].split(",") : undefined;

  const formatIdx = args.indexOf("--format");
  const format = formatIdx !== -1 && args[formatIdx + 1] ? args[formatIdx + 1] : "text";

  const fs = await import("fs");
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const text = fs.readFileSync(filePath, "utf-8");
  const result = analyzePaper(text, { checks });

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatText(result));
  }

  process.exit(result.overallScore >= 70 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
