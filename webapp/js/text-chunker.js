/**
 * text-chunker.js — Client-side relevance filtering by feature name.
 * Extracts only the paragraphs/sections relevant to a given feature,
 * reducing token usage when making per-feature LLM calls.
 */

/** @type {RegExp} Lines that are likely section headers */
const HEADING_RE = /^(\s*(#{1,4}\s+|[\d]+\.[\d.]*\s+|[A-Z]{2}[A-Z\s]{3,})\s*.+|.{3,80}:)\s*$/;

/** @type {number} Minimum chunks before falling back to sliding window */
const MIN_CHUNKS_THRESHOLD = 5;

/** @type {number} Sliding window size in characters */
const WINDOW_SIZE = 500;

/** @type {number} Sliding window overlap in characters */
const WINDOW_OVERLAP = 100;

/**
 * Strip accents and lowercase for fuzzy matching.
 * Handles Spanish morphological variation (Documentación ↔ documental).
 * @param {string} str
 * @returns {string}
 */
function normalizeAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Split text into chunks by paragraph boundaries or headings.
 * Falls back to sliding window if the document has no structure.
 * @param {string} text
 * @returns {string[]}
 */
function splitIntoChunks(text) {
  // Try splitting by double newline first
  let chunks = text.split(/\n{2,}/).map(c => c.trim()).filter(Boolean);

  // If too few chunks, try splitting by heading lines
  if (chunks.length < MIN_CHUNKS_THRESHOLD) {
    const lines = text.split('\n');
    const sections = [];
    let current = [];

    for (const line of lines) {
      if (HEADING_RE.test(line.trim()) && current.length > 0) {
        sections.push(current.join('\n').trim());
        current = [line];
      } else {
        current.push(line);
      }
    }
    if (current.length > 0) {
      sections.push(current.join('\n').trim());
    }

    const filtered = sections.filter(Boolean);
    if (filtered.length >= MIN_CHUNKS_THRESHOLD) {
      chunks = filtered;
    }
  }

  // Fallback: sliding window for unstructured text
  if (chunks.length < MIN_CHUNKS_THRESHOLD && text.length > WINDOW_SIZE) {
    chunks = [];
    for (let i = 0; i < text.length; i += WINDOW_SIZE - WINDOW_OVERLAP) {
      chunks.push(text.slice(i, i + WINDOW_SIZE));
      if (i + WINDOW_SIZE >= text.length) break;
    }
  }

  return chunks.filter(c => c.trim().length > 0);
}

/**
 * Score a chunk by keyword relevance, with heading boost.
 * @param {string} chunk
 * @param {string[]} keywords — normalized keywords
 * @returns {number}
 */
function scoreChunk(chunk, keywords) {
  const normalized = normalizeAccents(chunk);
  let score = 0;

  for (const kw of keywords) {
    if (kw.length < 2) continue;
    // Count occurrences
    let idx = 0;
    while ((idx = normalized.indexOf(kw, idx)) !== -1) {
      score += 1;
      idx += kw.length;
    }
  }

  // Heading boost: if the first line looks like a heading, multiply score
  const firstLine = chunk.split('\n')[0]?.trim() ?? '';
  if (HEADING_RE.test(firstLine)) {
    score *= 2;
  }

  return score;
}

/**
 * Extract text relevant to a specific feature from a document.
 * @param {string} text — full document text
 * @param {string} featureName — e.g. "Gestión Documental"
 * @param {{ targetChars?: number, topK?: number }} [opts]
 * @returns {string} — filtered text, max targetChars
 */
function extractRelevantText(text, featureName, opts = {}) {
  const { targetChars = 12_000, topK = 20 } = opts;

  // If no feature name, return full text
  if (!featureName || !featureName.trim()) return text;

  const keywords = normalizeAccents(featureName)
    .split(/\s+/)
    .filter(kw => kw.length >= 2);

  if (keywords.length === 0) return text;

  const chunks = splitIntoChunks(text);

  // Score each chunk, keeping original index for order preservation
  const scored = chunks.map((chunk, index) => ({
    chunk,
    index,
    score: scoreChunk(chunk, keywords),
  }));

  // Sort by score descending, take top-K
  scored.sort((a, b) => b.score - a.score);
  const topChunks = scored.slice(0, topK).filter(s => s.score > 0);

  // If nothing scored > 0, return best effort (top chunks by position)
  if (topChunks.length === 0) {
    return text.slice(0, targetChars);
  }

  // Re-sort by original document order
  topChunks.sort((a, b) => a.index - b.index);

  // Join chunks respecting targetChars
  let result = '';
  for (const { chunk } of topChunks) {
    const candidate = result ? `${result}\n\n${chunk}` : chunk;
    if (candidate.length > targetChars) {
      // Add as much of this chunk as fits
      const remaining = targetChars - result.length - 2;
      if (remaining > 0) {
        result = result ? `${result}\n\n${chunk.slice(0, remaining)}` : chunk.slice(0, remaining);
      }
      break;
    }
    result = candidate;
  }

  return result;
}

// Conditional export for Node.js/vitest (browser ignores this)
if (typeof module !== 'undefined') {
  module.exports = { extractRelevantText, normalizeAccents, splitIntoChunks, scoreChunk };
}
