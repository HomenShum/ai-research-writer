# AI Research Writer

One CLI for polishing, translating, and de-AI-ing your research papers.

Zero dependencies. Bring Your Own Key. 8 battle-tested prompt templates adapted from [awesome-ai-research-writing](https://github.com/Leey21/awesome-ai-research-writing).

## Quick Start

```bash
# No install needed - just run with npx
npx ai-research-writer polish paper.tex

# Or install globally
npm install -g ai-research-writer
```

## BYOK Setup

Set one environment variable. The CLI tries providers in this order: **Gemini -> OpenAI -> Anthropic**.

```bash
# Option 1: Gemini (free tier available)
export GEMINI_API_KEY="your-key-here"

# Option 2: OpenAI
export OPENAI_API_KEY="sk-..."

# Option 3: Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."
```

Get a free API key:
- Gemini: https://aistudio.google.com/apikey (free tier)
- OpenAI: https://platform.openai.com/api-keys
- Anthropic: https://console.anthropic.com/

## Commands

### Free Commands (no API key needed)

| Command | Description |
|---------|-------------|
| `analyze <file>` | Regex-based grammar, tone, citation, and structure analysis |
| `prompts` | List all 8 embedded prompt templates |
| `demo` | Run analysis on built-in sample text |

### LLM-Powered Commands (require API key)

| Command | Description |
|---------|-------------|
| `polish <file>` | Polish text to top-venue publication standard |
| `translate <file>` | Translate between English and Chinese (preserves LaTeX) |
| `compress <file>` | Reduce word count while preserving all information |
| `expand <file>` | Expand with depth, logical connections, and clarity |
| `de-ai <file>` | Remove AI writing signatures (leverage, delve, tapestry...) |
| `check-logic <file>` | Final red-line review for contradictions and logical gaps |
| `caption` | Generate publication-quality figure/table captions |
| `review <file>` | Simulate harsh peer review for a target venue |

## Prompt Library

The 8 embedded prompts are adapted from awesome-ai-research-writing and work with any LLM:

| Prompt | What It Does |
|--------|-------------|
| **polish** | Senior academic editor. Removes contractions, dashes, bold/italic. Preserves LaTeX. Outputs polished text + modification log. |
| **translate** | Bilingual academic translator (en/zh). Preserves LaTeX, citations, equations. Outputs translation + notes + back-translation verification. |
| **compress** | Concise editor. Removes filler, merges redundancies. Outputs compressed text + stats + what was removed. |
| **expand** | Expansion editor. Adds logical connectors, explicit reasoning, supporting detail. No padding. Outputs expanded text + expansion log. |
| **de-ai** | Anti-AI-detection specialist. Replaces leverage/delve/tapestry/comprehensive/multifaceted. Removes Furthermore/Moreover/Additionally. Varies sentence length. |
| **check-logic** | Logic reviewer. Checks contradictions, terminology, grammar (Chinglish patterns), reference integrity, logical gaps. High threshold. JSON output. |
| **caption** | Figure/table caption writer. Follows venue conventions. JSON output with short caption, long caption, and LaTeX. |
| **review** | Harsh peer reviewer (rejection mindset). Checks novelty, soundness, clarity, significance, reproducibility. Rating 1-10 with strategic advice. |

Run `ai-research-writer prompts` to see the full system prompts.

## Examples

```bash
# Deterministic analysis (no API key needed)
ai-research-writer analyze paper.tex --checks grammar,tone
ai-research-writer analyze paper.tex --format json
ai-research-writer demo

# Polish for a specific venue
ai-research-writer polish paper.tex --venue "NeurIPS 2026"

# Translate Chinese to English
ai-research-writer translate paper.tex --from zh --to en --domain "computer vision"

# Compress an abstract by 50 words
ai-research-writer compress abstract.tex --words 50

# Expand an introduction by 100 words
ai-research-writer expand intro.tex --words 100

# Remove AI writing signatures
ai-research-writer de-ai draft.tex

# Check for logical contradictions
ai-research-writer check-logic paper.tex --type contradictions

# Generate a figure caption
ai-research-writer caption --desc "accuracy vs epochs for 3 models on CIFAR-10" --type figure

# Simulate a peer review
ai-research-writer review paper.tex --venue "ICML 2026" --strictness harsh

# List all prompt templates
ai-research-writer prompts
```

## Programmatic API

```typescript
import { analyzePaper, polish, deAi, PROMPTS, detectProviderName } from "ai-research-writer";

// Deterministic analysis (no API key)
const result = analyzePaper(text, { checks: ["grammar", "tone"] });
console.log(result.overallScore); // 0-100

// LLM-powered commands (needs API key in env)
const polished = await polish(text, { venue: "NeurIPS 2026" });
console.log(polished.output);

// Check which provider would be used
console.log(detectProviderName()); // "gemini" | "openai" | "anthropic" | null

// Access raw prompts for use in other tools
console.log(PROMPTS.polish.systemPrompt);
```

## Architecture

```
src/
  prompts.ts    # 8 prompt templates (standalone, no dependencies)
  provider.ts   # BYOK provider with raw fetch() (Gemini -> OpenAI -> Anthropic)
  index.ts      # CLI + analysis engine + LLM command wrappers
```

- **Zero npm dependencies** for LLM calls. Uses Node.js built-in `fetch()`.
- **Deterministic analysis** works offline with regex patterns.
- **LLM commands** route through whichever API key you provide.
- **Provider models**: Gemini 3 Flash, GPT-5 Mini, Claude Haiku 4.5

## Using with AI Agents

### Claude Code / Cursor / Windsurf

Add to your agent instructions:

```markdown
When reviewing research papers, use ai-research-writer:
1. Run `npx ai-research-writer analyze <file> --format json` for structured issues
2. Fix all ERROR-severity issues first (contractions, etc.)
3. Run `npx ai-research-writer de-ai <file>` to clean AI signatures
4. Run `npx ai-research-writer review <file> --venue "NeurIPS"` for simulated peer review
5. Target score 80+ before submitting
```

### NodeBench MCP Integration

If using [nodebench-mcp](https://www.npmjs.com/package/nodebench-mcp):

1. **Recon**: `run_recon` on paper directory, `log_recon_finding` for each issue category
2. **Verify**: `start_verification_cycle` to track polishing, `log_test_result` per check
3. **Gate**: `run_quality_gate` to enforce score >= 80 and zero ERRORs
4. **Learn**: `record_learning` to bank patterns for future papers

## Tests

```bash
npm test
```

40+ tests covering: regex analysis (10), provider detection (10), prompt validation (12), AI pattern detection (4), CLI integration (2), API exports (7).

## Credits

Prompt templates adapted from [awesome-ai-research-writing](https://github.com/Leey21/awesome-ai-research-writing) by Leey21.

## License

MIT
