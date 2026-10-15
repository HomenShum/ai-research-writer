# AI Research Writer

One CLI for polishing, translating, and de-AI-ing your research papers.

Version 3 runs multi-step LLM workflows with your own provider key. It has no npm runtime dependencies and includes 9 prompt templates adapted from [awesome-ai-research-writing](https://github.com/Leey21/awesome-ai-research-writing).

## Quick Start

Requires **Node.js 18 or newer**. Start with `help` or `prompts` to inspect the tool without contacting a provider. `analyze` and `demo` both call the LLM, as do the other agent commands below.

From a source checkout, install the locked development tools and build before using the CLI:

```bash
git clone https://github.com/HomenShum/ai-research-writer.git
cd ai-research-writer
npm ci
npm run build
node dist/index.js help
node dist/index.js prompts
```

The build compiles TypeScript into `dist/`; `help` and `prompts` only print local information. Run the offline checks under [Tests](#tests) before making provider requests.

## BYOK Setup

For agent commands, configure a provider key in your shell. The CLI selects the first configured provider in this order: **Gemini -> OpenAI -> Anthropic**. A request failure is returned to the caller; it does not automatically retry another provider.

```bash
# Option 1: Gemini
export GEMINI_API_KEY="your-key-here"

# Option 2: OpenAI
export OPENAI_API_KEY="sk-..."

# Option 3: Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."
```

Provider key pages (account access, pricing and limits depend on the provider):
- Gemini: https://aistudio.google.com/apikey
- OpenAI: https://platform.openai.com/api-keys
- Anthropic: https://console.anthropic.com/

Current model IDs in [`src/provider.ts`](src/provider.ts) are `gemini-3-flash-preview`, `gpt-5`, and `claude-sonnet-4-5-20250929`. `GOOGLE_AI_API_KEY` is also accepted as a Gemini key alias. An agent command can make multiple LLM requests, including requests made by its tools.

## Commands

### Free Commands (no API key needed)

| Command | Description |
|---------|-------------|
| `help` | Show supported commands and options |
| `prompts` | Print all 9 embedded prompt templates |

### Agent Commands (require API key)

| Command | Description |
|---------|-------------|
| `analyze <file>` | Ask the agent to analyze issues, writing patterns and quality |
| `demo` | Run agent analysis on built-in sample text |
| `polish <file>` | Request academic editing; optional `--venue` and `--lang` |
| `translate <file>` | Request translation; requires `--from` and `--to` |
| `compress <file>` | Request a shorter text; optional `--words` reduction |
| `expand <file>` | Request a longer text; optional `--words` addition |
| `de-ai <file>` | Request a rewrite of formulaic writing |
| `check-logic <file>` | Request a consistency review; optional `--type` focus |
| `caption` | Request a caption; requires `--desc` and `--type figure\|table` |
| `review <file>` | Simulate peer review; requires `--venue` |

CLI output is a human-readable agent result and trace. There is no implemented JSON-output or check-selection flag. Model-generated analysis and scores are advice to review, not deterministic acceptance gates or publication guarantees.

## Prompt Library

The 9 standalone templates are available through `prompts` and the exported `PROMPTS` object. They describe intended tasks; their requested output formats are not a CLI JSON contract. CLI commands run the workflows in [`src/agent.ts`](src/agent.ts).

| Prompt | What It Does |
|--------|-------------|
| **analyze** | Requests an academic writing analysis. |
| **polish** | Senior academic editor. Removes contractions, dashes, bold/italic. Preserves LaTeX. Outputs polished text + modification log. |
| **translate** | Bilingual academic translator (en/zh). Preserves LaTeX, citations, equations. Outputs translation + notes + back-translation verification. |
| **compress** | Concise editor. Removes filler, merges redundancies. Outputs compressed text + stats + what was removed. |
| **expand** | Expansion editor. Adds logical connectors, explicit reasoning, supporting detail. No padding. Outputs expanded text + expansion log. |
| **de-ai** | Anti-AI-detection specialist. Replaces leverage/delve/tapestry/comprehensive/multifaceted. Removes Furthermore/Moreover/Additionally. Varies sentence length. |
| **check-logic** | Logic reviewer. Checks contradictions, terminology, grammar (Chinglish patterns), reference integrity, logical gaps. High threshold. JSON output. |
| **caption** | Figure/table caption writer. Follows venue conventions. JSON output with short caption, long caption, and LaTeX. |
| **review** | Harsh peer reviewer (rejection mindset). Checks novelty, soundness, clarity, significance, reproducibility. Rating 1-10 with strategic advice. |

Run `node dist/index.js prompts` after building to see the full templates without a provider call.

## Examples

```bash
# Inspect local information (after building, no provider call)
node dist/index.js help
node dist/index.js prompts

# Agent analysis (requires a provider key)
node dist/index.js analyze paper.tex
node dist/index.js demo

# Polish for a specific venue
node dist/index.js polish paper.tex --venue "NeurIPS 2026"

# Translate Chinese to English
node dist/index.js translate paper.tex --from zh --to en --domain "computer vision"

# Compress an abstract by 50 words
node dist/index.js compress abstract.tex --words 50

# Expand an introduction by 100 words
node dist/index.js expand intro.tex --words 100

# Remove AI writing signatures
node dist/index.js de-ai draft.tex

# Check for logical contradictions
node dist/index.js check-logic paper.tex --type contradictions

# Generate a figure caption
node dist/index.js caption --desc "accuracy vs epochs for 3 models on CIFAR-10" --type figure

# Simulate a peer review
node dist/index.js review paper.tex --venue "ICML 2026" --strictness harsh

# List all prompt templates
node dist/index.js prompts
```

## Programmatic API

After building, an ES module in the repository root can import the compiled API:

```javascript
import { analyze, polish, PROMPTS, detectProviderName } from "./dist/index.js";

// Local inspection only; does not contact a provider
console.log(detectProviderName()); // "gemini" | "openai" | "anthropic" | null
console.log(PROMPTS.polish.systemPrompt);

// Both calls below require a configured provider and make LLM requests
const text = "Your draft paragraph.";
const result = await analyze(text);
console.log(result.finalAnswer);
console.log(result.provider, result.model, result.totalSteps);

const polished = await polish(text, { venue: "NeurIPS 2026" });
console.log(polished.finalAnswer);
```

Agent commands return `AgentResult`: `steps`, `finalAnswer`, `totalSteps`, `provider`, and `model`. There is no typed numeric quality score or structured issue list in this result contract. File-based commands currently limit input to the first 12,000 characters; split longer manuscripts deliberately rather than assuming a whole-paper review.

## Architecture

```
src/
  prompts.ts    # 9 prompt templates (standalone, no dependencies)
  provider.ts   # BYOK provider with raw fetch() (Gemini -> OpenAI -> Anthropic)
  agent.ts      # Multi-step agent loop and LLM-backed tools
  index.ts      # CLI and agent command wrappers
```

- **Zero npm dependencies** for LLM calls. Uses Node.js built-in `fetch()`.
- **Local inspection**: `help` and `prompts` work without an API key after building.
- **Agent commands** use the first configured provider; tool calls can also invoke the LLM.

## Using with AI Agents

### Claude Code / Cursor / Windsurf

Add to your agent instructions:

```markdown
When reviewing research papers, use ai-research-writer:
1. Inspect `node dist/index.js help` and `node dist/index.js prompts` locally first.
2. Before an agent command, confirm the provider, model and authorization to send manuscript text.
3. Run `node dist/index.js analyze <file>` for a model-generated assessment.
4. Review suggested changes against the manuscript, citations and venue requirements.
5. Treat simulated peer review as advice; record independent checks before submitting.
```

### NodeBench MCP Integration

This repository does not include an MCP adapter. An external integration must consume the current `AgentResult` contract and define its own independently verified acceptance criteria. Do not assume the CLI supplies machine-graded issue severities or a numeric pass threshold.

## Tests

The test runner imports compiled files from `dist/`, so build first:

```bash
npm run build
npm test
```

The offline suite exercises the current `analyze`/`deAi` API, real agent/tool loops, input truncation, failure handling, concurrent state isolation and CLI exit behavior. It intercepts fetch responses and gives CLI subprocesses no provider keys; no external model requests are needed. These checks establish the local contract, not provider compatibility, model output quality or whole-manuscript correctness.

## Credits

Prompt templates adapted from [awesome-ai-research-writing](https://github.com/Leey21/awesome-ai-research-writing) by Leey21.

## License

MIT
