# LLM Handoff Browser Bookmarklet

A browser-based LLM conversation handoff tool that:

- extracts chat context from common chat UIs,
- embeds generated files/code blocks in a portable payload,
- supports API-based summaries with robust fallbacks,
- enables continuation across AI tools (ChatGPT, Claude, Gemini, Perplexity, or any tool that accepts pasted context).

## Files

- `bookmarklet.js` - source script for the handoff bookmarklet.

## Install as a bookmarklet

1. Create a new browser bookmark.
2. Set the bookmark URL to:

```text
javascript:(async()=>{const s=document.createElement('script');s.src='https://raw.githubusercontent.com/Divanshu-Bnsl/LLM-Handoff-Browser-Bookmarklet-for-AI-Conversation-Portability/94f16b21051c8a4b5476d60e3d3d1d399b9efd97/bookmarklet.js?t='+Date.now();document.body.appendChild(s);})();
```

> For local development, you can paste and run the script from `bookmarklet.js` directly in the browser console.

## What it outputs

The bookmarklet creates a JSON handoff package with:

- page metadata (`platform`, `url`, `title`, `extractedAt`),
- normalized conversation messages (`role`, `content`),
- embedded generated files/code snippets (`embeddedFiles`),
- summary (`summary`) via API when configured, else local fallback,
- continuation prompts (`continuationPrompts`) for cross-platform AI continuation.

The payload is copied to clipboard and downloaded as `llm-handoff-<timestamp>.json`.

## Optional summary API

If you provide an API endpoint when prompted, the bookmarklet sends:

```json
{
  "messages": [...],
  "url": "...",
  "title": "...",
  "platform": "..."
}
```

Expected response can be either:

- `{ "summary": "..." }`
- `{ "text": "..." }`
- OpenAI-style `{ "choices": [{ "message": { "content": "..." } }] }`

On any API failure, the bookmarklet automatically falls back to a local summary.