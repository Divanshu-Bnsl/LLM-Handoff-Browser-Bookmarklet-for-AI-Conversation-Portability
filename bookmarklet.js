(async function llmHandoffBookmarklet() {
  "use strict";

  const STORAGE_KEY = "llm-handoff-summary-api";
  const FILE_NAME = `llm-handoff-${Date.now()}.json`;
  const DEDUP_KEY_LENGTH = 280;
  const MAX_FILENAME_LENGTH = 120;
  const SUMMARY_PREVIEW_LENGTH = 240;

  const PLATFORM_BY_HOST = [
    ["chatgpt.com", "chatgpt"],
    ["claude.ai", "claude"],
    ["gemini.google.com", "gemini"],
    ["perplexity.ai", "perplexity"],
  ];

  const MESSAGE_SELECTORS = [
    '[data-message-author-role]',
    '[data-testid*="conversation-turn"]',
    '[data-testid*="message"]',
    '[class*="message"]',
    '[role="article"]',
    "article",
  ];

  function detectPlatform() {
    const host = window.location.hostname.toLowerCase();
    for (const [pattern, platform] of PLATFORM_BY_HOST) {
      if (host.includes(pattern)) {
        return platform;
      }
    }
    return "unknown";
  }

  function cleanText(input) {
    return (input || "").replace(/\u00A0/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }

  function inferRole(element) {
    const roleValue =
      element.getAttribute("data-message-author-role") ||
      element.getAttribute("data-author-role") ||
      element.getAttribute("data-role") ||
      "";
    const normalized = roleValue.toLowerCase();
    if (normalized.includes("user") || normalized.includes("human")) {
      return "user";
    }
    if (normalized.includes("assistant") || normalized.includes("model") || normalized.includes("ai")) {
      return "assistant";
    }
    const ownText = (element.textContent || "").toLowerCase();
    if (ownText.startsWith("you:")) {
      return "user";
    }
    if (ownText.startsWith("assistant:")) {
      return "assistant";
    }
    return "unknown";
  }

  function collectMessages() {
    const all = [];
    for (const selector of MESSAGE_SELECTORS) {
      for (const el of document.querySelectorAll(selector)) {
        all.push(el);
      }
    }

    const unique = [];
    const seen = new Set();
    for (const el of all) {
      const text = cleanText(el.innerText || el.textContent || "");
      if (!text) {
        continue;
      }
      const key = text.slice(0, DEDUP_KEY_LENGTH);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      unique.push({
        role: inferRole(el),
        content: text,
      });
    }

    return unique;
  }

  function inferFileName(text) {
    const match = text.match(/(?:file|filename|path)\s*[:=-]\s*([^\n\r]+)/i);
    return match ? cleanText(match[1]).replace(/[^\w.\-/]/g, "_").slice(0, MAX_FILENAME_LENGTH) : "";
  }

  function collectEmbeddedFiles(messages) {
    const files = [];
    const seen = new Set();
    let fallbackIndex = 1;

    for (const message of messages) {
      const codeBlocks = message.content.match(/```[\s\S]*?```/g) || [];
      for (const block of codeBlocks) {
        const languageMatch = block.match(/^```([^\n\r]*)/);
        const language = cleanText(languageMatch ? languageMatch[1] : "").toLowerCase() || "text";
        const content = cleanText(block.replace(/^```[^\n\r]*\n?/, "").replace(/```$/, ""));
        if (!content) {
          continue;
        }
        const inferred = inferFileName(message.content);
        const ext = language === "text" ? "txt" : language.replace(/[^\w]/g, "") || "txt";
        const filename = inferred || `generated-${fallbackIndex}.${ext}`;
        fallbackIndex += 1;
        const key = `${filename}:${content.slice(0, DEDUP_KEY_LENGTH)}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        files.push({
          filename,
          language,
          content,
          encoding: "utf-8",
        });
      }
    }

    return files;
  }

  function fallbackSummary(messages) {
    if (!messages.length) {
      return "No messages were detected on this page.";
    }
    const assistantCount = messages.filter((m) => m.role === "assistant").length;
    const userCount = messages.filter((m) => m.role === "user").length;
    const last = messages[messages.length - 1];
    return [
      `Conversation includes ${messages.length} messages (${userCount} user, ${assistantCount} assistant).`,
      `Latest message preview: ${last.content.slice(0, SUMMARY_PREVIEW_LENGTH)}${last.content.length > SUMMARY_PREVIEW_LENGTH ? "..." : ""}`,
    ].join(" ");
  }

  function getApiConfig() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch (_) {
      return null;
    }
  }

  function saveApiConfig(config) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }

  function resolveSummaryFromApiResponse(data) {
    if (!data || typeof data !== "object") {
      return "";
    }
    if (typeof data.summary === "string" && data.summary.trim()) {
      return data.summary.trim();
    }
    if (typeof data.text === "string" && data.text.trim()) {
      return data.text.trim();
    }
    const content = data.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.trim()) {
      return content.trim();
    }
    return "";
  }

  async function summarize(messages, metadata) {
    const existing = getApiConfig();
    let config = existing;

    if (!config) {
      const endpoint = window.prompt("Optional summary API endpoint (leave blank to skip):", "") || "";
      if (!endpoint.trim()) {
        return fallbackSummary(messages);
      }
      config = { endpoint: endpoint.trim() };
      saveApiConfig(config);
    }

    try {
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages,
          ...metadata,
        }),
      });

      if (!response.ok) {
        throw new Error(`Summary API request failed with status ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const summary = resolveSummaryFromApiResponse(data);
      if (!summary) {
        throw new Error("Summary API response did not include a supported summary field.");
      }
      return summary;
    } catch (error) {
      console.error("Summary API failed, using fallback summary.", error);
      return fallbackSummary(messages);
    }
  }

  function buildContinuationPrompts(summary, embeddedFiles) {
    const filesSection = embeddedFiles.length
      ? `\nEmbedded generated files (${embeddedFiles.length}):\n${embeddedFiles
          .map((f) => `- ${f.filename} (${f.language})`)
          .join("\n")}`
      : "\nNo embedded files were detected.";
    const common = `Continue this conversation from a handoff package.\nSummary:\n${summary}${filesSection}\nPlease ask for the full JSON payload if more detail is needed.`;
    return {
      generic: common,
      chatgpt: `[ChatGPT Continuation]\n${common}`,
      claude: `[Claude Continuation]\n${common}`,
      gemini: `[Gemini Continuation]\n${common}`,
      perplexity: `[Perplexity Continuation]\n${common}`,
    };
  }

  function downloadPayload(serialized) {
    const blob = new Blob([serialized], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = FILE_NAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function copyPayload(serialized) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(serialized);
      return true;
    }
    return false;
  }

  const metadata = {
    platform: detectPlatform(),
    url: window.location.href,
    title: document.title || "",
    extractedAt: new Date().toISOString(),
  };

  const messages = collectMessages();
  const embeddedFiles = collectEmbeddedFiles(messages);
  const summary = await summarize(messages, metadata);
  const continuationPrompts = buildContinuationPrompts(summary, embeddedFiles);

  const payload = {
    schemaVersion: "1.0",
    ...metadata,
    messageCount: messages.length,
    messages,
    embeddedFiles,
    summary,
    continuationPrompts,
  };

  const serialized = JSON.stringify(payload, null, 2);
  const copied = await copyPayload(serialized).catch(() => false);
  downloadPayload(serialized);

  window.alert(
    `LLM handoff ready.\nMessages: ${messages.length}\nEmbedded files: ${embeddedFiles.length}\n` +
      `${copied ? "Copied to clipboard and downloaded JSON." : "Downloaded JSON (clipboard unavailable)."}`,
  );
})();
