#!/usr/bin/env node
// Pre-extract passages from Project Gutenberg and bake them into
// src/data/passages.json so the live app doesn't have to fetch books at
// quiz-load time.
//
// Run:  npm run build:passages
//
// Re-run any time AUTHORS or their gutenbergIds change. The output JSON
// file is checked into git.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const PASSAGES_PER_AUTHOR = 8;
const USER_AGENT =
  "Mozilla/5.0 (compatible; AnthologieBuilder/1.0; +https://lit-quiz.netlify.app)";

const START_MARKER = /^\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*\s*$/im;
const END_MARKER = /^\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*\s*$/im;

// ---------- Parse AUTHORS array out of authors.ts (TS-light) ----------

function parseAuthors() {
  const src = readFileSync(resolve(ROOT, "src/lib/authors.ts"), "utf8");
  const start = src.indexOf("export const AUTHORS:");
  const body = src.slice(start);
  const re =
    /\{\s*id:\s*"([^"]+)",[\s\S]*?name:\s*"([^"]+)",[\s\S]*?gutenbergIds:\s*\[([^\]]+)\][\s\S]*?form:\s*"([^"]+)"/g;
  const authors = [];
  let m;
  while ((m = re.exec(body)) !== null) {
    const ids = m[3]
      .split(",")
      .map((s) => parseInt(s.trim()))
      .filter(Boolean);
    authors.push({ id: m[1], name: m[2], gutenbergIds: ids, form: m[4] });
  }
  return authors;
}

// ---------- Gutenberg fetch + extract (mirrors src/lib/gutenberg.ts) ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchBookText(id) {
  const url = `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(60_000),
      });
      if (res.status === 429 || res.status === 503) {
        await sleep(5000 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt === 2) throw err;
      await sleep(2000 * (attempt + 1));
    }
  }
  throw new Error("unreachable");
}

// Fallback titles for IDs whose metadata fetch fails (Gutendex rate limits,
// transient network errors). Add entries here when the build logs a missing
// title — these are simply hand-written from the bibliographic record.
const TITLE_OVERRIDES = {
  696: "The Castle of Otranto",
  1934: "Songs of Innocence and of Experience",
  18247: "The Last Man",
};

async function fetchBookMeta(id) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`https://gutendex.com/books/${id}/`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 429 || res.status === 503) {
        await sleep(3000 * (attempt + 1));
        continue;
      }
      if (!res.ok) break;
      return await res.json();
    } catch {
      await sleep(1500);
    }
  }
  if (TITLE_OVERRIDES[id]) return { title: TITLE_OVERRIDES[id] };
  return null;
}

function stripGutenbergFraming(raw) {
  let body = raw;
  const startMatch = raw.match(START_MARKER);
  if (startMatch && startMatch.index !== undefined) {
    body = raw.slice(startMatch.index + startMatch[0].length);
  }
  const endMatch = body.match(END_MARKER);
  if (endMatch && endMatch.index !== undefined) {
    body = body.slice(0, endMatch.index);
  }
  return body.trim();
}

function polishGutenbergText(text) {
  return text
    .replace(/\[(?:\d+|[ivxlcdm]+)\]/gi, "")
    .replace(/\[(Illustration|Footnote|Sidenote)[^\]]*\]/gi, "")
    .replace(/_([^_\n]+?)_/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/ +\n/g, "\n")
    .replace(/\n +/g, "\n")
    .trim();
}

function cleanBlock(block) {
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";
  const avgLineLen = lines.reduce((s, l) => s + l.length, 0) / lines.length;
  let combined;
  if (avgLineLen < 55 && lines.length >= 2 && lines.length <= 16) {
    combined = lines.join("\n");
  } else {
    combined = lines.join(" ").replace(/\s+/g, " ").trim();
  }
  return polishGutenbergText(combined);
}

function isPassageWorthy(text, minChars, maxChars, form) {
  if (!text) return false;
  if (text.length < minChars || text.length > maxChars) return false;
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (letters.length > 0) {
    const upper = (text.match(/[A-Z]/g) || []).length;
    if (upper / letters.length > 0.7) return false;
  }
  if (/^(CHAPTER|CHAP\.?|PART|BOOK|VOLUME|CANTO|ACT|SCENE)\b/i.test(text)) return false;
  if (/^[IVXLCDM\d.\s,;-]+$/.test(text)) return false;
  if (/^\[/.test(text) && /\]\s*$/.test(text)) return false;
  if (/transcriber'?s? note/i.test(text)) return false;
  if (/^\s*\*\s*\*\s*\*/.test(text)) return false;
  if (/produced by/i.test(text) && text.length < 400) return false;
  if ((text.match(/[*]/g) || []).length / text.length > 0.06) return false;
  if (form !== "poetry") {
    if (!/[.!?]/.test(text)) return false;
  }
  const digits = (text.match(/\d/g) || []).length;
  if (digits / text.length > 0.15) return false;
  return true;
}

function extractAllPassages(body, form) {
  const minChars = form === "poetry" ? 90 : 220;
  const maxChars = form === "poetry" ? 500 : 700;
  const start = Math.floor(body.length * 0.05);
  const end = Math.floor(body.length * 0.95);
  const trimmed = body.slice(start, end);
  const blocks = trimmed.split(/\n\s*\n+/);

  const candidates = [];
  for (const block of blocks) {
    const cleaned = cleanBlock(block);
    if (isPassageWorthy(cleaned, minChars, maxChars, form)) {
      candidates.push(cleaned);
    }
  }
  return candidates;
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ---------- Main pipeline ----------

async function buildAuthor(author) {
  const collected = [];
  for (const bookId of author.gutenbergIds) {
    if (collected.length >= PASSAGES_PER_AUTHOR) break;
    try {
      console.log(`  ↻ fetch ${bookId}…`);
      const [raw, meta] = await Promise.all([
        fetchBookText(bookId),
        fetchBookMeta(bookId),
      ]);
      const body = stripGutenbergFraming(raw);
      const candidates = extractAllPassages(body, author.form);
      if (candidates.length === 0) {
        console.log(`    ⚠ no candidates for ${bookId}`);
        continue;
      }
      const title = meta?.title ?? null;
      // Up to ~4 passages per book to avoid one book dominating an author.
      const take = Math.min(4, candidates.length, PASSAGES_PER_AUTHOR - collected.length);
      const picks = shuffle(candidates).slice(0, take);
      for (const passage of picks) {
        collected.push({ passage, bookId, bookTitle: title });
      }
      console.log(`    ✓ ${take} passages from "${title ?? "(no title)"}"`);
      // Be polite to Gutenberg between books.
      await sleep(800);
    } catch (err) {
      console.log(`    ✗ ${bookId} failed: ${err.message}`);
      await sleep(1500);
    }
  }
  return collected;
}

async function main() {
  const authors = parseAuthors();
  console.log(`Building passages for ${authors.length} authors…`);
  const out = {};
  let total = 0;
  let missing = [];
  for (const author of authors) {
    console.log(`\n[${author.id}] ${author.name}`);
    const passages = await buildAuthor(author);
    out[author.id] = passages;
    total += passages.length;
    if (passages.length === 0) missing.push(author.id);
  }

  const outPath = resolve(ROOT, "src/data/passages.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\n✔ Wrote ${total} passages across ${authors.length} authors`);
  console.log(`  → ${outPath}`);
  if (missing.length > 0) {
    console.log(`\n⚠ Authors with NO passages: ${missing.join(", ")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
