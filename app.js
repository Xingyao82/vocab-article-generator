const STORAGE_KEY = "lexidraft-settings-v1";

const SAMPLE_VOCABULARY = [
  "adapt",
  "curious",
  "efficient",
  "motivate",
  "perspective",
  "practical",
  "take responsibility",
  "challenge",
  "confident",
  "improve",
  "valuable",
  "community"
].join("\n");

const LENGTH_GUIDE = {
  short: "320-450 words",
  medium: "500-700 words",
  long: "750-950 words"
};

const els = {
  apiBase: document.querySelector("#api-base"),
  model: document.querySelector("#model"),
  apiKey: document.querySelector("#api-key"),
  vocabularyInput: document.querySelector("#vocabulary-input"),
  vocabularyFile: document.querySelector("#vocabulary-file"),
  topic: document.querySelector("#topic"),
  audience: document.querySelector("#audience"),
  tone: document.querySelector("#tone"),
  length: document.querySelector("#length"),
  paragraphCount: document.querySelector("#paragraph-count"),
  generateBtn: document.querySelector("#generate-btn"),
  sampleBtn: document.querySelector("#sample-btn"),
  clearBtn: document.querySelector("#clear-btn"),
  copyHtmlBtn: document.querySelector("#copy-html-btn"),
  copyMdBtn: document.querySelector("#copy-md-btn"),
  downloadHtmlBtn: document.querySelector("#download-html-btn"),
  downloadMdBtn: document.querySelector("#download-md-btn"),
  articlePreview: document.querySelector("#article-preview"),
  statusText: document.querySelector("#status-text"),
  wordCount: document.querySelector("#word-count"),
  duplicateCount: document.querySelector("#duplicate-count"),
  coverageValue: document.querySelector("#coverage-value"),
  coverageNote: document.querySelector("#coverage-note"),
  missingCount: document.querySelector("#missing-count"),
  missingList: document.querySelector("#missing-list"),
  uploadBox: document.querySelector(".upload-box")
};

const state = {
  vocabulary: [],
  articleHtml: "",
  articleMarkdown: "",
  missingWords: [],
  lastTitle: ""
};

initialize();

function initialize() {
  loadSettings();
  bindEvents();
  updateVocabularyStats();
  renderCoverage([], []);
  renderMissingWords(null);
  syncExportButtons(false);
}

function bindEvents() {
  [
    els.apiBase,
    els.model,
    els.topic,
    els.audience,
    els.tone,
    els.length,
    els.paragraphCount
  ].forEach((element) => {
    element.addEventListener("input", persistSettings);
    element.addEventListener("change", persistSettings);
  });

  els.apiKey.addEventListener("input", persistSettings);
  els.vocabularyInput.addEventListener("input", updateVocabularyStats);

  els.vocabularyFile.addEventListener("change", () => handleFilesSelected());
  els.sampleBtn.addEventListener("click", handleLoadSample);
  els.clearBtn.addEventListener("click", handleClearVocabulary);
  els.generateBtn.addEventListener("click", handleGenerate);
  els.copyHtmlBtn.addEventListener("click", () => copyOutput("html"));
  els.copyMdBtn.addEventListener("click", () => copyOutput("markdown"));
  els.downloadHtmlBtn.addEventListener("click", () => downloadOutput("html"));
  els.downloadMdBtn.addEventListener("click", () => downloadOutput("markdown"));

  ["dragenter", "dragover"].forEach((eventName) => {
    els.uploadBox.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.uploadBox.classList.add("is-dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    els.uploadBox.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.uploadBox.classList.remove("is-dragover");
    });
  });

  els.uploadBox.addEventListener("drop", (event) => {
    const files = Array.from(event.dataTransfer?.files || []);
    if (!files.length) {
      return;
    }
    handleFilesSelected(files);
  });
}

function loadSettings() {
  const saved = safeJsonParse(localStorage.getItem(STORAGE_KEY), {});
  els.apiBase.value = saved.apiBase || "https://api.openai.com/v1";
  els.model.value = saved.model || "gpt-4.1-mini";
  els.apiKey.value = saved.apiKey || "";
  els.topic.value = saved.topic || "growth through teamwork and daily challenges";
  els.audience.value = saved.audience || "intermediate English learners";
  els.tone.value = saved.tone || "clear and encouraging";
  els.length.value = saved.length || "medium";
  els.paragraphCount.value = saved.paragraphCount || "5";
}

function persistSettings() {
  const payload = {
    apiBase: els.apiBase.value.trim(),
    model: els.model.value.trim(),
    apiKey: els.apiKey.value.trim(),
    topic: els.topic.value.trim(),
    audience: els.audience.value.trim(),
    tone: els.tone.value,
    length: els.length.value,
    paragraphCount: els.paragraphCount.value
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function updateVocabularyStats() {
  const { words, duplicates } = parseVocabulary(els.vocabularyInput.value);
  state.vocabulary = words;
  els.wordCount.textContent = `${words.length} items`;
  els.duplicateCount.textContent =
    duplicates > 0
      ? `${duplicates} duplicate items were removed automatically`
      : "Input order is preserved and duplicates are removed automatically";
}

async function handleFilesSelected(selectedFiles = null) {
  const files = selectedFiles || Array.from(els.vocabularyFile.files || []);
  if (!files.length) {
    return;
  }

  try {
    setStatus(`Reading ${files.length} file(s)...`);
    const chunks = await Promise.all(files.map(readFileAsText));
    const appended = [els.vocabularyInput.value.trim(), ...chunks.filter(Boolean)]
      .filter(Boolean)
      .join("\n");
    els.vocabularyInput.value = appended;
    updateVocabularyStats();
    setStatus(`Imported ${files.length} file(s). Ready to generate.`, "success");
  } catch (error) {
    setStatus(`File read failed: ${error.message}`, "error");
  } finally {
    els.vocabularyFile.value = "";
  }
}

function handleLoadSample() {
  els.vocabularyInput.value = SAMPLE_VOCABULARY;
  updateVocabularyStats();
  setStatus("Sample vocabulary loaded.", "success");
}

function handleClearVocabulary() {
  els.vocabularyInput.value = "";
  updateVocabularyStats();
  resetArticleState();
  renderEmptyState();
  setStatus("Vocabulary list cleared.");
}

async function handleGenerate() {
  persistSettings();

  const apiBase = els.apiBase.value.trim().replace(/\/+$/, "");
  const model = els.model.value.trim();
  const apiKey = els.apiKey.value.trim();
  const vocabulary = state.vocabulary;

  if (!apiBase || !model || !apiKey) {
    setStatus("Fill in Base URL, Model, and API Key first.", "error");
    return;
  }

  if (!vocabulary.length) {
    setStatus("Add vocabulary first or upload a word list.", "error");
    return;
  }

  setLoading(true);
  resetArticleState();

  try {
    setStatus("Generating the first draft...", "success");
    const initial = await requestArticle({
      apiBase,
      apiKey,
      model,
      vocabulary,
      mode: "initial"
    });

    let draft = processGeneratedArticle(initial, vocabulary);

    for (let attempt = 1; attempt <= 2 && draft.missingWords.length; attempt += 1) {
      setStatus(
        `${draft.missingWords.length} items are still missing. Running repair pass ${attempt}...`,
        "success"
      );

      const revised = await requestArticle({
        apiBase,
        apiKey,
        model,
        vocabulary,
        mode: "repair",
        previousHtml: draft.html,
        missingWords: draft.missingWords
      });

      draft = processGeneratedArticle(revised, vocabulary);
    }

    state.articleHtml = draft.html;
    state.articleMarkdown = htmlToMarkdown(draft.html);
    state.missingWords = draft.missingWords;
    state.lastTitle = draft.title;

    renderArticle(draft.html);
    renderMissingWords(draft.missingWords);
    renderCoverage(vocabulary, draft.missingWords);
    syncExportButtons(true);

    if (draft.missingWords.length) {
      setStatus(
        `The article was generated, but ${draft.missingWords.length} vocabulary items are still missing.`,
        "error"
      );
    } else {
      setStatus("Article generated successfully. All vocabulary items are covered.", "success");
    }
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Generation failed. Check the API settings and try again.", "error");
    renderEmptyState();
    resetArticleState();
  } finally {
    setLoading(false);
  }
}

async function requestArticle({
  apiBase,
  apiKey,
  model,
  vocabulary,
  mode,
  previousHtml = "",
  missingWords = []
}) {
  const endpoint = `${apiBase}/chat/completions`;
  const payload = {
    model,
    temperature: mode === "initial" ? 0.8 : 0.45,
    messages: buildMessages({ vocabulary, mode, previousHtml, missingWords })
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      `Request failed with HTTP ${response.status}`;
    throw new Error(message);
  }

  const content = extractMessageContent(data);
  if (!content) {
    throw new Error("The model returned an empty response.");
  }

  return content;
}

function buildMessages({ vocabulary, mode, previousHtml, missingWords }) {
  const topic = els.topic.value.trim() || "growth through teamwork and daily challenges";
  const audience = els.audience.value.trim() || "intermediate English learners";
  const tone = els.tone.value;
  const length = LENGTH_GUIDE[els.length.value] || LENGTH_GUIDE.medium;
  const paragraphCount = Number(els.paragraphCount.value) || 5;

  const rules = [
    "Write one coherent English article that is easy to read, grammatically correct, and smooth in style.",
    `Target audience: ${audience}.`,
    `Topic focus: ${topic}.`,
    `Tone: ${tone}.`,
    `Target length: ${length}.`,
    `Write exactly ${paragraphCount} body paragraphs.`,
    "Every vocabulary item must appear naturally at least once.",
    "Use the same spelling as the vocabulary list. Capitalization may change only when needed at the start of a sentence.",
    "Do not dump the words in a list or glossary.",
    "Output semantic HTML only: one <h1> followed by paragraphs (<p>).",
    "Do not use Markdown, code fences, explanations, notes, or vocabulary bullet sections."
  ];

  if (mode === "repair") {
    rules.push(
      `Revise the existing article so it naturally includes these missing items: ${missingWords.join(", ")}.`
    );
    rules.push("Keep already-covered vocabulary in the article.");
  }

  const userPrompt =
    mode === "initial"
      ? [
          "Vocabulary list:",
          vocabulary.map((word, index) => `${index + 1}. ${word}`).join("\n"),
          "",
          "Requirements:",
          rules.map((rule, index) => `${index + 1}. ${rule}`).join("\n")
        ].join("\n")
      : [
          "Existing article HTML:",
          previousHtml,
          "",
          "Full vocabulary list:",
          vocabulary.map((word, index) => `${index + 1}. ${word}`).join("\n"),
          "",
          "Repair requirements:",
          rules.map((rule, index) => `${index + 1}. ${rule}`).join("\n")
        ].join("\n");

  return [
    {
      role: "system",
      content:
        "You are an expert English writing coach. Produce fluent, learner-friendly articles and follow the structural rules exactly."
    },
    {
      role: "user",
      content: userPrompt
    }
  ];
}

function extractMessageContent(data) {
  const choice = data?.choices?.[0]?.message?.content;
  if (typeof choice === "string") {
    return choice.trim();
  }

  if (Array.isArray(choice)) {
    return choice
      .map((part) => (typeof part === "string" ? part : part?.text || ""))
      .join("")
      .trim();
  }

  return "";
}

function processGeneratedArticle(rawContent, vocabulary) {
  const sanitizedHtml = sanitizeGeneratedHtml(rawContent);
  const highlightedHtml = highlightVocabulary(sanitizedHtml, vocabulary);
  const textContent = htmlToPlainText(highlightedHtml);
  const missingWords = findMissingWords(textContent, vocabulary);
  const title = extractTitle(highlightedHtml);

  return {
    html: highlightedHtml,
    missingWords,
    title
  };
}

function sanitizeGeneratedHtml(rawContent) {
  const cleaned = rawContent
    .trim()
    .replace(/^```html/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();

  if (!cleaned) {
    throw new Error("The model did not return usable content.");
  }

  if (!/[<][a-z][\s\S]*>/i.test(cleaned)) {
    return plainTextToHtml(cleaned);
  }

  const parser = new DOMParser();
  const documentRoot = parser.parseFromString(`<body>${cleaned}</body>`, "text/html");
  const sanitizedRoot = document.createElement("div");
  const fragment = sanitizeNodeList(documentRoot.body.childNodes);
  sanitizedRoot.appendChild(fragment);

  normalizeRootStructure(sanitizedRoot);

  if (!sanitizedRoot.querySelector("h1")) {
    const fallbackTitle = document.createElement("h1");
    fallbackTitle.textContent = "Generated Vocabulary Article";
    sanitizedRoot.prepend(fallbackTitle);
  }

  return sanitizedRoot.innerHTML.trim();
}

function sanitizeNodeList(nodes) {
  const fragment = document.createDocumentFragment();
  const allowedTags = new Set(["H1", "H2", "P", "UL", "OL", "LI", "BLOCKQUOTE", "EM", "STRONG", "BR"]);

  Array.from(nodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      if (text.trim()) {
        fragment.appendChild(document.createTextNode(text));
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const tag = node.tagName.toUpperCase();
    if (!allowedTags.has(tag)) {
      fragment.appendChild(sanitizeNodeList(node.childNodes));
      return;
    }

    const element = document.createElement(tag.toLowerCase());
    element.appendChild(sanitizeNodeList(node.childNodes));
    fragment.appendChild(element);
  });

  return fragment;
}

function normalizeRootStructure(root) {
  const looseTextNodes = Array.from(root.childNodes).filter((node) => {
    return node.nodeType === Node.TEXT_NODE && node.textContent.trim();
  });

  if (looseTextNodes.length) {
    const lines = root.textContent
      .split(/\n{2,}/)
      .map((line) => line.trim())
      .filter(Boolean);
    root.innerHTML = plainTextToHtml(lines.join("\n\n"));
    return;
  }

  Array.from(root.children).forEach((child) => {
    if (child.tagName === "H1") {
      return;
    }

    if (!["P", "H2", "UL", "OL", "BLOCKQUOTE"].includes(child.tagName)) {
      const paragraph = document.createElement("p");
      paragraph.innerHTML = child.innerHTML;
      child.replaceWith(paragraph);
    }
  });
}

function plainTextToHtml(text) {
  const cleaned = text.replace(/\r/g, "").trim();
  const segments = cleaned.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const title = escapeHtml(segments.shift() || "Generated Vocabulary Article");
  const paragraphs = (segments.length ? segments : cleaned.split(/\n/))
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${escapeHtml(part)}</p>`)
    .join("");

  return `<h1>${title}</h1>${paragraphs}`;
}

function highlightVocabulary(html, vocabulary) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div class="article-content">${html}</div>`, "text/html");
  const container = doc.body.firstElementChild;
  const sortedVocabulary = [...vocabulary].sort((a, b) => b.length - a.length);
  const matchers = new Map(sortedVocabulary.map((word) => [word, buildWordMatcher(word)]));

  walkTextNodes(container, (textNode) => {
    const parent = textNode.parentElement;
    if (!parent || parent.closest("strong")) {
      return;
    }

    const replacement = highlightTextNode(doc, textNode.textContent, sortedVocabulary, matchers);
    if (replacement) {
      textNode.replaceWith(replacement);
    }
  });

  return container.innerHTML;
}

function walkTextNodes(root, visitor) {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });

  const nodes = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current);
    current = walker.nextNode();
  }

  nodes.forEach(visitor);
}

function highlightTextNode(doc, text, vocabulary, matchers) {
  const fragment = doc.createDocumentFragment();
  let remaining = text;
  let changed = false;

  while (remaining.length) {
    const bestMatch = findEarliestMatch(remaining, vocabulary, matchers);
    if (!bestMatch) {
      fragment.appendChild(doc.createTextNode(remaining));
      break;
    }

    const { start, end, matchText } = bestMatch;
    if (start > 0) {
      fragment.appendChild(doc.createTextNode(remaining.slice(0, start)));
    }

    const strong = doc.createElement("strong");
    strong.className = "vocab-highlight";
    strong.textContent = matchText;
    fragment.appendChild(strong);

    remaining = remaining.slice(end);
    changed = true;
  }

  return changed ? fragment : null;
}

function findEarliestMatch(text, vocabulary, matchers) {
  let best = null;

  vocabulary.forEach((word) => {
    const regex = matchers.get(word);
    regex.lastIndex = 0;
    const match = regex.exec(text);
    if (!match) {
      return;
    }

    const start = match.index + match[1].length;
    const matchText = match[2];
    const end = start + matchText.length;

    if (!best || start < best.start || (start === best.start && matchText.length > best.matchText.length)) {
      best = { start, end, matchText };
    }
  });

  return best;
}

function buildWordMatcher(word) {
  const escaped = escapeRegExp(word.trim());
  return new RegExp(`(^|[^A-Za-z0-9'])(${escaped})(?=$|[^A-Za-z0-9'])`, "i");
}

function findMissingWords(text, vocabulary) {
  return vocabulary.filter((word) => {
    return !buildWordMatcher(word).test(text);
  });
}

function extractTitle(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  return doc.querySelector("h1")?.textContent?.trim() || "Generated Vocabulary Article";
}

function renderArticle(html) {
  els.articlePreview.classList.remove("is-loading");
  els.articlePreview.innerHTML = `<div class="article-content">${html}</div>`;
}

function renderEmptyState() {
  els.articlePreview.classList.remove("is-loading");
  els.articlePreview.innerHTML = `
    <div class="empty-state">
      <p class="empty-kicker">Ready</p>
      <h3>Your generated article will appear here</h3>
      <p>Target vocabulary is highlighted in bold. If the model misses some items, the app retries and shows the remaining gaps.</p>
    </div>
  `;
}

function renderMissingWords(words) {
  if (!Array.isArray(words)) {
    els.missingCount.textContent = "0 items";
    els.missingList.innerHTML = '<span class="empty-chip">Nothing to show yet</span>';
    return;
  }

  els.missingCount.textContent = `${words.length} items`;

  if (!words.length) {
    els.missingList.innerHTML = '<span class="empty-chip">Everything is covered</span>';
    return;
  }

  els.missingList.innerHTML = words
    .map((word) => `<span class="chip">${escapeHtml(word)}</span>`)
    .join("");
}

function renderCoverage(vocabulary, missingWords) {
  if (!vocabulary.length) {
    els.coverageValue.textContent = "0 / 0";
    els.coverageNote.textContent = "Coverage is checked after generation.";
    return;
  }

  const covered = vocabulary.length - missingWords.length;
  els.coverageValue.textContent = `${covered} / ${vocabulary.length}`;
  els.coverageNote.textContent =
    missingWords.length === 0
      ? "All vocabulary items appear in the article."
      : "Some vocabulary items are still missing.";
}

function syncExportButtons(enabled) {
  [
    els.copyHtmlBtn,
    els.copyMdBtn,
    els.downloadHtmlBtn,
    els.downloadMdBtn
  ].forEach((button) => {
    button.disabled = !enabled;
  });
}

function setLoading(isLoading) {
  els.generateBtn.disabled = isLoading;
  els.articlePreview.classList.toggle("is-loading", isLoading);

  if (isLoading) {
    els.articlePreview.innerHTML = `
      <div class="empty-state">
        <p class="empty-kicker">Generating</p>
        <h3>Building the article and validating vocabulary coverage</h3>
        <p>Longer word lists may require one or two repair passes before every item appears naturally.</p>
      </div>
    `;
  }
}

function setStatus(message, tone = "") {
  els.statusText.textContent = message;
  els.statusText.classList.remove("is-error", "is-success");

  if (tone === "error") {
    els.statusText.classList.add("is-error");
  }

  if (tone === "success") {
    els.statusText.classList.add("is-success");
  }
}

async function copyOutput(type) {
  if (!state.articleHtml) {
    return;
  }

  const content = type === "html" ? state.articleHtml : state.articleMarkdown;

  try {
    await navigator.clipboard.writeText(content);
    setStatus(type === "html" ? "HTML copied." : "Markdown copied.", "success");
  } catch (error) {
    setStatus("Copy failed. Check browser permissions.", "error");
  }
}

function downloadOutput(type) {
  if (!state.articleHtml) {
    return;
  }

  const titleSlug = slugify(state.lastTitle || "generated-article");
  const fileName = `${titleSlug}.${type === "html" ? "html" : "md"}`;
  const content = type === "html" ? wrapHtmlDocument(state.articleHtml, state.lastTitle) : state.articleMarkdown;
  const mime = type === "html" ? "text/html;charset=utf-8" : "text/markdown;charset=utf-8";

  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function wrapHtmlDocument(content, title) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title || "Generated Vocabulary Article")}</title>
    <style>
      body {
        margin: 0;
        padding: 40px 20px;
        color: #223127;
        font-family: Georgia, "Times New Roman", serif;
        background: #fcf8f2;
      }
      main {
        max-width: 760px;
        margin: 0 auto;
        background: #fffefb;
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 20px;
        padding: 36px;
      }
      h1 {
        margin-top: 0;
        line-height: 1.15;
      }
      p {
        line-height: 1.9;
        font-size: 18px;
      }
      strong {
        background: rgba(255, 203, 143, 0.58);
        padding: 0 0.14em;
        border-radius: 0.24em;
      }
    </style>
  </head>
  <body>
    <main>${content}</main>
  </body>
</html>`;
}

function htmlToMarkdown(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  const parts = [];

  Array.from(root.children).forEach((node) => {
    const tag = node.tagName.toUpperCase();
    if (tag === "H1") {
      parts.push(`# ${node.textContent.trim()}`);
      return;
    }

    if (tag === "H2") {
      parts.push(`## ${node.textContent.trim()}`);
      return;
    }

    if (tag === "P") {
      parts.push(inlineHtmlToMarkdown(node.innerHTML));
      return;
    }

    if (tag === "BLOCKQUOTE") {
      parts.push(
        inlineHtmlToMarkdown(node.innerHTML)
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n")
      );
      return;
    }

    if (tag === "UL" || tag === "OL") {
      const items = Array.from(node.children)
        .filter((item) => item.tagName.toUpperCase() === "LI")
        .map((item, index) => {
          const prefix = tag === "OL" ? `${index + 1}. ` : "- ";
          return `${prefix}${inlineHtmlToMarkdown(item.innerHTML)}`;
        });
      parts.push(items.join("\n"));
    }
  });

  return parts.filter(Boolean).join("\n\n").trim();
}

function inlineHtmlToMarkdown(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  return Array.from(doc.body.firstElementChild.childNodes)
    .map((node) => nodeToMarkdown(node))
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function nodeToMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const content = Array.from(node.childNodes).map((child) => nodeToMarkdown(child)).join("");
  const tag = node.tagName.toUpperCase();

  if (tag === "STRONG") {
    return `**${content.trim()}**`;
  }

  if (tag === "EM") {
    return `*${content.trim()}*`;
  }

  if (tag === "BR") {
    return "\n";
  }

  return content;
}

function htmlToPlainText(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  return doc.body.textContent || "";
}

function resetArticleState() {
  state.articleHtml = "";
  state.articleMarkdown = "";
  state.missingWords = [];
  state.lastTitle = "";
  renderCoverage([], []);
  renderMissingWords(null);
  syncExportButtons(false);
}

function parseVocabulary(rawText) {
  const text = (rawText || "").replace(/\r/g, "\n").trim();
  if (!text) {
    return { words: [], duplicates: 0 };
  }

  const jsonWords = parseVocabularyFromJson(text);
  const rawItems = jsonWords || splitVocabularyText(text);
  const seen = new Set();
  const words = [];
  let duplicates = 0;

  rawItems.forEach((item) => {
    const normalized = normalizeWordItem(item);
    if (!normalized) {
      return;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      duplicates += 1;
      return;
    }

    seen.add(key);
    words.push(normalized);
  });

  return { words, duplicates };
}

function parseVocabularyFromJson(text) {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (item && typeof item.word === "string") {
          return item.word;
        }

        return "";
      });
    }
  } catch (error) {
    return null;
  }

  return null;
}

function splitVocabularyText(text) {
  return text
    .split(/\n|,|;|，|；|、|\t/g)
    .map((item) => item.trim());
}

function normalizeWordItem(item) {
  return (item || "")
    .replace(/^[-*•]\s*/, "")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Unable to read file: ${file.name}`));
    reader.readAsText(file, "utf-8");
  });
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "generated-article";
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
