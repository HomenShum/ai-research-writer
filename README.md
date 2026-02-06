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

## License

MIT
