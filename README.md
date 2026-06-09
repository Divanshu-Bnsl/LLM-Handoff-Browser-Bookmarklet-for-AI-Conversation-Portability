# ContextBridge

> Cross-platform LLM conversation portability — extract, package, and carry context across AI systems.

A browser bookmarklet that captures multi-turn conversations from AI platforms, fetches generated file artifacts, and builds structured markdown handoffs for seamless context transfer to any LLM.

---

## The problem

When a conversation hits a context limit, or you want to continue work in a different AI system, there is no standard way to carry your session forward. You lose thread, re-explain context, and waste turns catching the new model up.

## What it does

ContextBridge runs in your browser. One click:

- Extracts all conversation turns (human + AI) from the current page, in order
- Parses file manifests embedded in AI responses
- Fetches associated file artifacts via platform APIs and embeds their contents inline
- Generates a structured markdown document ready to paste into any LLM

The destination model receives a complete briefing: what was asked, what was built, what files were produced, and a one-sentence summary of where the session left off.

---

## Features

- **Full conversation extraction** — all turns captured and sorted by DOM position; noise filtered (tool status labels, interrupted responses stripped)
- **File artifact embedding** — scans all AI responses for `FILES:` manifests, fetches file contents via internal platform API, embeds them in the handoff
- **AI-generated summary** — calls Google Gemini or Anthropic Claude to write a one-sentence "where left off" line; deterministic fallback if API is unavailable or rate-limited
- **Summary caching** — successful API summaries cached by conversation ID in `localStorage`; no redundant calls on re-run
- **Thinking block toggle** — include or exclude extended reasoning blocks (off by default for cleaner handoffs)
- **One-click destination buttons** — copies handoff to clipboard and opens ChatGPT, Gemini, Grok, or DeepSeek in a single click

---

## Supported platforms

| Platform | Extraction | Status |
|---|---|---|
| claude.ai | ✅ Full | Working |
| ChatGPT | 🔲 | Planned |
| Gemini | 🔲 | Planned |
| Grok | 🔲 | Planned |
| DeepSeek | 🔲 | Planned |

---

## Install

1. Open [`bookmarklet_url.txt`](bookmarklet_url.txt) and copy the entire contents — the full `javascript:` URL
2. Create a new bookmark in your browser (any page, any folder)
3. Paste the URL as the bookmark's location
4. Name it anything — `Handoff`, `ContextBridge`, whatever you'll remember

> **Note:** Some browsers silently strip the `javascript:` prefix on paste. After saving, edit the bookmark and confirm the URL still starts with `javascript:`.

---

## Usage

1. Open any supported conversation
2. Click the bookmarklet — a panel appears in the top-right corner
3. **First run only:** choose your API provider and enter your key (see Configuration below)
4. Optionally type filenames in the files field if you want specific artifacts fetched
5. Click **📋 Extract & Build Handoff**
6. Use a destination button to copy + open your target LLM, or Copy only

---

## Configuration

### API key (optional)

An API key enables AI-generated summaries. Without one the tool falls back to a deterministic summary derived from the last human message — good enough for most handoffs.

Supported providers:

| Provider | Cost | Sign-up |
|---|---|---|
| Google AI Studio | Free tier available | [aistudio.google.com](https://aistudio.google.com) — no credit card |
| Anthropic | Paid | [console.anthropic.com](https://console.anthropic.com) |

Keys are stored in your browser's `localStorage` under `clxp_key` and `clxp_provider`. They never leave your machine except in the direct API call to the provider you chose.

---

## How it works

ContextBridge is a single-file IIFE (~8KB unminified). The main components:

### Conversation extraction

Platform behaviour is defined in a `PLATFORMS` object — each entry implements `getTitle()`, `getHumanNodes()`, `getAINodes()`, and `getThinking()`. Nodes from both selectors are tagged, merged into a single list, and sorted using `Node.compareDocumentPosition` to reconstruct the true conversation order. Consecutive AI nodes are merged (handles cases where a tool call and its response land in separate DOM nodes). A regex-based `ACTION_VERBS` filter strips one-line status labels Claude emits during tool use.

### File manifest parsing

Every AI node is scanned for `<pre><code>` blocks. Any block whose first line matches `/^FILES:\s*$/m` is treated as a file manifest — filenames are extracted from the bullet lines below it. Scanning covers all AI nodes in the conversation, not just the last, so files generated across multiple turns are all collected.

### File artifact fetching

Files are fetched from claude.ai's internal endpoint:

```
GET /api/organizations/{orgId}/conversations/{convId}/wiggle/download-file?path=/mnt/user-data/outputs/{filename}
```

The org ID is pulled from the URL path if present, otherwise resolved via `/api/bootstrap`. Content-type guards reject images and PDFs. Everything else — including `application/octet-stream` (served for `.js`, `.md`, `.py`, etc.) — is fetched as text. Files over 50KB are noted as too large and skipped.

### Summary pipeline

```
1. Check localStorage for cached summary (key: clxp_summary_{convId})
2. If cache hit → return immediately, no API call
3. Call Gemini / Anthropic with last 3 turns as context, 10s timeout
4. If success → write to cache, return summary
5. If fail  → derive fallback: "User last asked: [last human turn, ~20 words]"
```

The error reason (e.g. "Rate limited") is shown in the panel UI only. The markdown handoff receives only the clean summary or fallback — no operational noise for the destination LLM.

### Handoff format

```markdown
# Conversation handoff
**Title:** ...  ·  **Date:** ...  ·  **Turns:** ...

## Briefing
You are continuing a working session. Pick up where left off,
don't re-introduce yourself, match the user's working style.

**Original ask:** [first human message]
**Where left off:** [AI summary or deterministic fallback]

## Conversation
**Human:** ...
**Claude:** ...

## Generated Files
### filename.ext
\`\`\`
[file contents embedded inline]
\`\`\`
```

---

## Known limitations

- **claude.ai only** — other platform adapters are stubs pending DOM research
- **CSS selector fragility** — uses `.font-claude-response` and `[data-testid="user-message"]`; may break if claude.ai updates its markup
- **Undocumented endpoint** — `wiggle/download-file` is an internal API; not guaranteed stable across platform updates
- **50KB per-file cap** — large files are listed in the handoff but not embedded
- **No binary embedding** — images and PDFs are listed but their contents are not included

---

## Roadmap

- [ ] ChatGPT conversation extraction
- [ ] Gemini extraction
- [ ] Groq as a third summary provider (free tier, no credit card)
- [ ] Chrome extension packaging

---

## License

MIT
