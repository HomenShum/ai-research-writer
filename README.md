# ai-research-writer

CLI tool to polish and elevate AI research papers. Analyzes text for common academic writing issues and suggests improvements.

Inspired by [awesome-ai-research-writing](https://github.com/Leey21/awesome-ai-research-writing).

## Features

- **Grammar & Style**: Detects passive voice overuse, weak verbs, hedging language
- **Structure Analysis**: Checks section ordering, paragraph length, transition quality
- **Citation Formatting**: Validates citation patterns (APA, IEEE, ACM)
- **Academic Tone**: Flags informal language, contractions, colloquialisms
- **Readability Score**: Computes Flesch-Kincaid grade level for each section

## Install

```bash
npm install -g ai-research-writer
```

## Usage

```bash
# Analyze a paper
ai-research-writer analyze paper.txt

# Check specific aspects
ai-research-writer analyze paper.txt --checks grammar,citations,tone

# Output as JSON
ai-research-writer analyze paper.txt --format json
```

## API

```typescript
import { analyzePaper } from "ai-research-writer";

const results = analyzePaper(text, { checks: ["grammar", "tone", "citations"] });
console.log(results.overallScore); // 0-100
console.log(results.issues);       // Array of issues with line numbers
```

## Using with AI Agents

### Claude Code / Cursor / Windsurf

Add this to your agent instructions or AGENTS.md:

```markdown
When reviewing or writing research papers, use `ai-research-writer` to check quality:

1. Run `npx ai-research-writer analyze <file> --format json` to get structured issues
2. Fix all ERROR-severity issues (contractions, etc.) first
3. Address WARNING-severity issues (hedging, informal language)
4. Target a score of 80+ before submitting
```

### NodeBench MCP Integration

If you're using [nodebench-mcp](https://www.npmjs.com/package/nodebench-mcp), the analysis results integrate with the verification methodology:

1. **Recon phase**: `run_recon` on your paper directory, `log_recon_finding` for each writing issue category
2. **Verification phase**: `start_verification_cycle` to track paper polishing, `log_test_result` for each check (grammar, tone, citations, structure)
3. **Quality gate**: `run_quality_gate` to enforce score >= 80 and zero ERROR-severity issues before submission
4. **Knowledge**: `record_learning` to bank common writing patterns for future papers

```bash
# Example: agent-driven paper review pipeline
npx ai-research-writer analyze draft.tex --format json > /tmp/paper-analysis.json
# Agent reads JSON, creates verification cycle, fixes issues, re-analyzes until gate passes
```

### MCP Server Setup (for tool-calling agents)

```json
{
  "mcpServers": {
    "nodebench": {
      "command": "npx",
      "args": ["-y", "nodebench-mcp"]
    }
  }
}
```

Your agent can then use `run_code_analysis` with the paper text, or shell out to `ai-research-writer` via `run_tests_cli` for file-based analysis.

## Tests

```bash
npm test
```

10 tests covering grammar detection, tone analysis, citation validation, section parsing, and scoring.

## License

MIT
