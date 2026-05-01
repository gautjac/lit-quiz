// Project Gutenberg integration.
// Books are fetched as plain text from gutenberg.org, header/footer stripped,
// and passages extracted from the body.

const GUTENBERG_BASE = "https://www.gutenberg.org/cache/epub";
const USER_AGENT =
  "Mozilla/5.0 (compatible; AnthologieQuiz/1.0; +https://example.com)";

const START_MARKER = /^\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*\s*$/im;
const END_MARKER = /^\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*\s*$/im;

const textCache = new Map<number, string>();

export async function fetchBookText(id: number): Promise<string> {
  const cached = textCache.get(id);
  if (cached) return cached;

  const url = `${GUTENBERG_BASE}/${id}/pg${id}.txt`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    // Long timeout — Gutenberg can be slow.
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Gutenberg fetch ${id} failed: ${res.status}`);
  const text = await res.text();
  textCache.set(id, text);
  return text;
}

/**
 * Strip Project Gutenberg's standard header and footer, leaving only the body
 * of the work. Falls back to a slimmer trim if the standard markers are absent.
 */
export function stripGutenbergFraming(raw: string): string {
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

interface PassageOptions {
  // Char bounds for prose paragraphs.
  minChars?: number;
  maxChars?: number;
  // Whether to favor multi-sentence paragraphs (default true).
  preferMultiSentence?: boolean;
  form?: "prose" | "poetry" | "drama" | "essay";
  // Skip the first/last fraction of the body (front matter and back matter).
  trimFront?: number;
  trimBack?: number;
}

interface ExtractedPassage {
  text: string;
  // Approximate position in the work (0-1) for debugging/display.
  position: number;
}

/**
 * Extract a single, reasonably representative passage from a stripped book body.
 * Filters out chapter markers, table-of-contents entries, footnotes, and other
 * non-prose detritus that crops up in Gutenberg texts.
 */
export function extractPassage(
  body: string,
  opts: PassageOptions = {}
): ExtractedPassage | null {
  const {
    form = "prose",
    trimFront = 0.05,
    trimBack = 0.05,
  } = opts;

  // Poetry passages can be shorter; prose wants a bit more substance.
  const minChars = opts.minChars ?? (form === "poetry" ? 90 : 220);
  const maxChars = opts.maxChars ?? (form === "poetry" ? 500 : 700);

  const start = Math.floor(body.length * trimFront);
  const end = Math.floor(body.length * (1 - trimBack));
  const trimmed = body.slice(start, end);

  // Split on two-or-more newlines (paragraph / stanza breaks).
  const blocks = trimmed.split(/\n\s*\n+/);

  const candidates: { text: string; index: number }[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const cleaned = cleanBlock(blocks[i]);
    if (!isPassageWorthy(cleaned, minChars, maxChars, form, opts.preferMultiSentence ?? true)) {
      continue;
    }
    candidates.push({ text: cleaned, index: i });
  }

  if (candidates.length === 0) return null;

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  return {
    text: chosen.text,
    position: chosen.index / blocks.length,
  };
}

function cleanBlock(block: string): string {
  // Collapse internal hard wraps into spaces for prose; keep line breaks for poetry-shaped blocks.
  // Heuristic: if the block has many short lines, treat as poetry and keep newlines.
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return "";

  const avgLineLen = lines.reduce((s, l) => s + l.length, 0) / lines.length;
  // Poetry-ish: short lines, more than one line.
  if (avgLineLen < 55 && lines.length >= 2 && lines.length <= 16) {
    return lines.join("\n");
  }

  // Prose: collapse into one paragraph, normalize whitespace.
  return lines.join(" ").replace(/\s+/g, " ").trim();
}

function isPassageWorthy(
  text: string,
  minChars: number,
  maxChars: number,
  form: "prose" | "poetry" | "drama" | "essay",
  preferMultiSentence: boolean
): boolean {
  if (!text) return false;
  if (text.length < minChars || text.length > maxChars) return false;

  // Reject all-uppercase blocks (chapter headers, marquees).
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (letters.length > 0) {
    const upper = (text.match(/[A-Z]/g) || []).length;
    if (upper / letters.length > 0.7) return false;
  }

  // Reject obvious chapter / part markers.
  if (/^(CHAPTER|CHAP\.?|PART|BOOK|VOLUME|CANTO|ACT|SCENE)\b/i.test(text)) {
    return false;
  }

  // Reject blocks that are mostly Roman numerals or numbered list items.
  if (/^[IVXLCDM\d.\s,;-]+$/.test(text)) return false;

  // Reject Gutenberg's editorial footnotes / illustrations / transcriber notes.
  if (/^\[/.test(text) && /\]\s*$/.test(text)) return false;
  if (/transcriber'?s? note/i.test(text)) return false;
  if (/^\s*\*\s*\*\s*\*/.test(text)) return false;
  if (/produced by/i.test(text) && text.length < 400) return false;

  // Reject blocks dominated by underscores (Gutenberg's italics) or asterisk noise.
  if ((text.match(/[_*]/g) || []).length / text.length > 0.06) return false;

  // For prose / drama, prefer at least one sentence-ending mark.
  if (form !== "poetry") {
    if (!/[.!?]/.test(text)) return false;
    if (preferMultiSentence) {
      const sentenceCount = (text.match(/[.!?]+\s+[A-Z"']/g) || []).length;
      if (sentenceCount < 1 && text.length < 350) return false;
    }
  }

  // Reject if more than half the characters are digits (tables, indexes).
  const digits = (text.match(/\d/g) || []).length;
  if (digits / text.length > 0.15) return false;

  return true;
}

// Small wrapper that combines fetch, strip, and extract with retry across
// alternate Gutenberg IDs for an author.
export async function fetchPassageForAuthor(
  gutenbergIds: number[],
  form: "prose" | "poetry" | "drama" | "essay"
): Promise<{ passage: string; bookId: number } | null> {
  // Try IDs in shuffled order so the same first book doesn't dominate.
  const shuffled = [...gutenbergIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  for (const id of shuffled) {
    try {
      const raw = await fetchBookText(id);
      const body = stripGutenbergFraming(raw);
      // Try a few times in case our first random paragraph fails the filter
      // due to bad luck — but extractPassage already searches the whole book.
      const result = extractPassage(body, { form });
      if (result) {
        return { passage: result.text, bookId: id };
      }
    } catch (err) {
      console.error(`fetchPassageForAuthor: book ${id} failed`, err);
    }
  }

  return null;
}

// Look up a book's title/date via Gutendex (the unofficial Gutenberg JSON API).
// Used for the reveal screen so we can show "from {title}".
interface GutendexBook {
  id: number;
  title: string;
  authors: { name: string; birth_year: number | null; death_year: number | null }[];
}

const metaCache = new Map<number, GutendexBook>();

export async function fetchBookMeta(id: number): Promise<GutendexBook | null> {
  const cached = metaCache.get(id);
  if (cached) return cached;
  try {
    const res = await fetch(`https://gutendex.com/books/${id}/`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as GutendexBook;
    metaCache.set(id, data);
    return data;
  } catch {
    return null;
  }
}
